import { appendFileSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { request } from 'node:http';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import WebSocket from 'ws';
import { parseServerMessage, type SnapshotMessage } from '../src/domain/protocol.js';
import { startServer, type RunningServer } from '../src/server/server.js';

/**
 * Teste de integração: sobe o servidor de verdade numa porta livre (port 0),
 * com arquivo de eventos e pasta pública temporários.
 */

interface HttpResult {
  status: number;
  headers: Record<string, string | string[] | undefined>;
  body: string;
}

function http(port: number, path: string, options: { method?: string; host?: string } = {}): Promise<HttpResult> {
  return new Promise((done, fail) => {
    const req = request(
      {
        host: '127.0.0.1',
        port,
        path,
        method: options.method ?? 'GET',
        headers: { Host: options.host ?? `127.0.0.1:${port}` },
      },
      (res) => {
        let body = '';
        res.setEncoding('utf8');
        res.on('data', (chunk: string) => (body += chunk));
        res.on('end', () => done({ status: res.statusCode ?? 0, headers: res.headers, body }));
      },
    );
    req.on('error', fail);
    req.end();
  });
}

const eventLine = (event: object) => JSON.stringify(event) + '\n';
const sessionStarted = { v: 1, ts: '2026-11-08T12:00:00.000Z', session: 's1', type: 'session.started' };
const agentStarted = {
  v: 1,
  ts: '2026-11-08T12:00:01.000Z',
  session: 's1',
  type: 'agent.started',
  agent: 'arquiteto',
  summary: 'planejar',
};

let dir: string;
let eventsFile: string;
let server: RunningServer;
const sockets: WebSocket[] = [];

beforeEach(async () => {
  dir = mkdtempSync(join(tmpdir(), 'of-server-'));
  eventsFile = join(dir, 'events.ndjson');
  const publicDir = join(dir, 'public');
  mkdirSync(publicDir);
  writeFileSync(join(publicDir, 'index.html'), '<!doctype html><title>OF</title>');
  writeFileSync(join(publicDir, 'style.css'), 'body{}');
  writeFileSync(join(publicDir, 'notas.txt'), 'tipo não servido');
  writeFileSync(join(dir, 'segredo.html'), 'fora da pasta pública');
  writeFileSync(eventsFile, eventLine(sessionStarted));

  server = await startServer({
    port: 0,
    eventsFile,
    publicDir,
    clientEntry: resolve('web', 'src', 'app.ts'),
    intervalMs: 20,
  });
});

afterEach(async () => {
  for (const socket of sockets.splice(0)) socket.terminate();
  await server.close();
  rmSync(dir, { recursive: true, force: true });
});

/** Cliente WebSocket que guarda as mensagens recebidas. */
function connect(origin = `http://127.0.0.1:${server.port}`) {
  const socket = new WebSocket(`ws://127.0.0.1:${server.port}/ws`, { origin });
  sockets.push(socket);
  const messages: SnapshotMessage[] = [];
  socket.on('message', (data) => {
    const parsed = parseServerMessage(String(data));
    if (parsed) messages.push(parsed);
  });
  socket.on('error', () => {});
  return { socket, messages };
}

async function waitFor(check: () => boolean, timeoutMs = 3000): Promise<void> {
  const start = Date.now();
  while (!check()) {
    if (Date.now() - start > timeoutMs) throw new Error('tempo esgotado esperando condição');
    await new Promise((r) => setTimeout(r, 10));
  }
}

/** Resolve com o status HTTP da recusa do upgrade (ou 0 se conectou). */
function upgradeStatus(socket: WebSocket): Promise<number> {
  return new Promise((done) => {
    socket.on('unexpected-response', (_req, res) => done(res.statusCode ?? 0));
    socket.on('open', () => done(0));
    socket.on('error', () => done(-1));
  });
}

describe('servidor HTTP', () => {
  it('serve o index.html em "/" com cabeçalhos de segurança', async () => {
    const res = await http(server.port, '/');
    expect(res.status).toBe(200);
    expect(res.headers['content-type']).toBe('text/html; charset=utf-8');
    expect(res.body).toContain('<title>OF</title>');
    expect(res.headers['content-security-policy']).toContain(`connect-src ws://127.0.0.1:${server.port}`);
    expect(res.headers['x-content-type-options']).toBe('nosniff');
    expect(res.headers['cache-control']).toBe('no-store');
  });

  it('serve arquivos da pasta pública', async () => {
    const res = await http(server.port, '/style.css');
    expect(res.status).toBe(200);
    expect(res.headers['content-type']).toBe('text/css; charset=utf-8');
  });

  it('compila /app.js em memória', async () => {
    const res = await http(server.port, '/app.js');
    expect(res.status).toBe(200);
    expect(res.headers['content-type']).toBe('text/javascript; charset=utf-8');
    expect(res.body).toContain('/ws');
  }, 15000);

  it('HEAD devolve só os cabeçalhos', async () => {
    const res = await http(server.port, '/', { method: 'HEAD' });
    expect(res.status).toBe(200);
    expect(res.body).toBe('');
  });

  it('recusa métodos diferentes de GET/HEAD com 405', async () => {
    const res = await http(server.port, '/', { method: 'POST' });
    expect(res.status).toBe(405);
    expect(res.headers.allow).toBe('GET, HEAD');
  });

  it('recusa Host estranho com 403 (DNS rebinding)', async () => {
    expect((await http(server.port, '/', { host: 'evil.com' })).status).toBe(403);
    expect((await http(server.port, '/', { host: `evil.com:${server.port}` })).status).toBe(403);
  });

  it('aceita Host localhost', async () => {
    expect((await http(server.port, '/', { host: `localhost:${server.port}` })).status).toBe(200);
  });

  it('responde 404 para arquivo inexistente, tipo não servido e path traversal', async () => {
    expect((await http(server.port, '/nao-existe.css')).status).toBe(404);
    expect((await http(server.port, '/notas.txt')).status).toBe(404);
    expect((await http(server.port, '/%2e%2e/segredo.html')).status).toBe(404);
    expect((await http(server.port, '/..%2fsegredo.html')).status).toBe(404);
  });

  it('responde 500 em texto puro se a página não compilar', async () => {
    await server.close();
    const broken = join(dir, 'quebrado.ts');
    writeFileSync(broken, 'const = ;');
    server = await startServer({ port: 0, eventsFile, publicDir: join(dir, 'public'), clientEntry: broken });
    const original = console.error;
    console.error = () => {};
    try {
      const res = await http(server.port, '/app.js');
      expect(res.status).toBe(500);
      expect(res.headers['content-type']).toBe('text/plain; charset=utf-8');
    } finally {
      console.error = original;
    }
  }, 15000);
});

describe('servidor WebSocket', () => {
  it('manda a foto atual (com o histórico do arquivo) ao conectar', async () => {
    const { messages } = connect();
    await waitFor(() => messages.length >= 1);
    expect(messages[0]?.event).toBeNull();
    expect(messages[0]?.state.session).toBe('s1');
    expect(messages[0]?.state.open).toBe(true);
  });

  it('transmite a nova foto quando um evento é gravado no arquivo', async () => {
    const a = connect();
    const b = connect(`http://localhost:${server.port}`);
    await waitFor(() => a.messages.length >= 1 && b.messages.length >= 1);

    appendFileSync(eventsFile, eventLine(agentStarted));

    for (const client of [a, b]) {
      await waitFor(() => client.messages.length >= 2);
      const last = client.messages.at(-1);
      expect(last?.event).toMatchObject({ type: 'agent.started', agent: 'arquiteto' });
      expect(last?.state.desks.arquiteto.status).toBe('working');
    }
  });

  it('ignora mensagens enviadas pelo navegador', async () => {
    const { socket, messages } = connect();
    await waitFor(() => messages.length >= 1);
    socket.send('{"type":"hack"}');
    appendFileSync(eventsFile, eventLine(agentStarted));
    await waitFor(() => messages.length >= 2);
    expect(socket.readyState).toBe(WebSocket.OPEN);
  });

  it('fecha só o cliente que manda mensagem maior que o limite', async () => {
    const big = connect();
    const healthy = connect();
    await waitFor(() => big.messages.length >= 1 && healthy.messages.length >= 1);
    const closed = new Promise<number>((done) => big.socket.on('close', (code) => done(code)));
    big.socket.send('x'.repeat(2048));
    expect(await closed).toBe(1009); // 1009 = mensagem grande demais
    appendFileSync(eventsFile, eventLine(agentStarted));
    await waitFor(() => healthy.messages.length >= 2);
  });

  it('recusa Origin de outro site com 403', async () => {
    const { socket } = connect('http://evil.com');
    expect(await upgradeStatus(socket)).toBe(403);
  });

  it('recusa conexão sem Origin', async () => {
    const socket = new WebSocket(`ws://127.0.0.1:${server.port}/ws`);
    sockets.push(socket);
    expect(await upgradeStatus(socket)).toBe(403);
  });

  it('recusa upgrade fora de /ws', async () => {
    const socket = new WebSocket(`ws://127.0.0.1:${server.port}/outro`, {
      origin: `http://127.0.0.1:${server.port}`,
    });
    sockets.push(socket);
    expect(await upgradeStatus(socket)).toBe(403);
  });

  it('close() encerra as conexões abertas', async () => {
    const { socket, messages } = connect();
    await waitFor(() => messages.length >= 1);
    const closed = new Promise<void>((done) => socket.on('close', () => done()));
    await server.close();
    await closed;
    // Reabre para o afterEach poder fechar sem erro.
    server = await startServer({ port: 0, eventsFile, publicDir: join(dir, 'public'), clientEntry: 'x.ts' });
  });
});
