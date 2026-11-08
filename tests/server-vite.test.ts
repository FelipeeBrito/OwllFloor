import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { request } from 'node:http';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import WebSocket from 'ws';
import { startServer, type RunningServer } from '../src/server/server.js';
import { VITE_HMR_PATH } from '../src/server/vite-frontend.js';

/**
 * Integração com o Vite de verdade (modo de `npm run dev`), usando o vite.config.ts do projeto.
 * Um servidor só para o arquivo inteiro, porque subir o Vite leva alguns segundos.
 */

interface HttpResult {
  status: number;
  headers: Record<string, string | string[] | undefined>;
  body: string;
}

function http(port: number, path: string, host = `127.0.0.1:${port}`): Promise<HttpResult> {
  return new Promise((done, fail) => {
    const req = request({ host: '127.0.0.1', port, path, headers: { Host: host } }, (res) => {
      let body = '';
      res.setEncoding('utf8');
      res.on('data', (chunk: string) => (body += chunk));
      res.on('end', () => done({ status: res.statusCode ?? 0, headers: res.headers, body }));
    });
    req.on('error', fail);
    req.end();
  });
}

let dir: string;
let server: RunningServer;

beforeAll(async () => {
  dir = mkdtempSync(join(tmpdir(), 'of-vite-'));
  const eventsFile = join(dir, 'events.ndjson');
  writeFileSync(eventsFile, '');
  server = await startServer({
    port: 0,
    eventsFile,
    frontend: { kind: 'vite', configFile: resolve('vite.config.ts') },
    intervalMs: 20,
  });
}, 30000);

afterAll(async () => {
  await server?.close();
  rmSync(dir, { recursive: true, force: true });
});

describe('servidor com Vite (npm run dev)', () => {
  it('serve o index.html do Vite com os cabeçalhos de segurança do OF', async () => {
    const res = await http(server.port, '/');
    expect(res.status).toBe(200);
    expect(res.body).toContain('/src/app.ts');
    expect(res.body).toContain('/@vite/client');
    const csp = String(res.headers['content-security-policy']);
    expect(csp).toContain("script-src 'self'");
    expect(csp).toContain("img-src 'self' data:");
    expect(csp).not.toContain('unsafe');
    expect(res.headers['x-content-type-options']).toBe('nosniff');
  });

  it('compila o TypeScript da página na hora', async () => {
    const res = await http(server.port, '/src/app.ts');
    expect(res.status).toBe(200);
    expect(String(res.headers['content-type'])).toContain('javascript');
    expect(res.body).toContain('/ws');
  }, 20000);

  it('serve o style.css da pasta pública', async () => {
    const res = await http(server.port, '/style.css');
    expect(res.status).toBe(200);
    expect(String(res.headers['content-type'])).toContain('text/css');
  });

  it('não entrega arquivos fora das pastas liberadas (package.json, logs)', async () => {
    // encodeURI: o caminho do projeto tem espaço e acento ("Área de Trabalho").
    const projectFile = (name: string) => encodeURI(`/@fs/${resolve(name).replace(/\\/g, '/').replace(/^\/?/, '')}`);
    const blocked = await http(server.port, projectFile('package.json'));
    expect(blocked.status).toBe(403);
    // Controle: o mesmo truque funciona para uma pasta liberada (prova que o caminho está certo).
    expect((await http(server.port, projectFile('src/domain/roles.ts'))).status).toBe(200);
    expect((await http(server.port, '/../package.json')).status).not.toBe(200);
    const res = await http(server.port, '/package.json');
    expect(res.body).not.toContain('"owllfloor"');
  });

  it('recusa Host estranho antes de chegar no Vite (DNS rebinding)', async () => {
    expect((await http(server.port, '/', `evil.com:${server.port}`)).status).toBe(403);
  });

  it('recusa o WebSocket do Vite vindo de outro site', async () => {
    const socket = new WebSocket(`ws://127.0.0.1:${server.port}${VITE_HMR_PATH}`, 'vite-hmr', {
      origin: 'http://evil.com',
    });
    const status = await new Promise<number>((done) => {
      socket.on('unexpected-response', (_req, res) => done(res.statusCode ?? 0));
      socket.on('open', () => done(0));
      socket.on('error', () => done(-1));
    });
    socket.terminate();
    expect(status).toBe(403);
  });
});
