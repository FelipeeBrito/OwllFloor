import { readFile, stat } from 'node:fs/promises';
import { createServer, type IncomingMessage, type ServerResponse } from 'node:http';
import type { AddressInfo } from 'node:net';
import type { Duplex } from 'node:stream';
import { build } from 'esbuild';
import { WebSocketServer, type WebSocket } from 'ws';
import { EventFileWatcher } from '../infra/event-file-watcher.js';
import { SERVER_HOST } from './config.js';
import { OfficeHub } from './office-hub.js';
import { isAllowedHost, isAllowedOrigin, securityHeaders } from './security.js';
import { contentTypeFor, resolvePublicPath } from './static-files.js';

export interface StartServerOptions {
  /** 0 = o sistema escolhe uma porta livre (usado nos testes). */
  port: number;
  eventsFile: string;
  publicDir: string;
  /** Arquivo TypeScript da página, compilado na hora para /app.js. */
  clientEntry: string;
  intervalMs?: number;
}

export interface RunningServer {
  port: number;
  close(): Promise<void>;
}

/** O navegador não manda nada útil; o limite pequeno evita abuso de memória. */
const MAX_CLIENT_PAYLOAD = 1024;

/**
 * Borda do sistema: junta HTTP, WebSocket, esbuild e o leitor de eventos.
 * As regras ficam nos módulos puros (hub, security, static-files); aqui só ligamos os fios.
 */
export async function startServer(options: StartServerOptions): Promise<RunningServer> {
  const hub = new OfficeHub();
  const wss = new WebSocketServer({ noServer: true, maxPayload: MAX_CLIENT_PAYLOAD });
  // A porta real só é conhecida depois do listen (por causa do port 0).
  let port = options.port;

  const server = createServer((req, res) => {
    handleHttp(req, res, port, options).catch((error: unknown) => {
      console.error('[OF] erro ao responder requisição:', error);
      if (!res.headersSent) sendText(res, 500, 'Erro interno', port);
      else res.destroy();
    });
  });

  server.on('upgrade', (req, socket, head) => {
    if (!canUpgrade(req, port)) return rejectUpgrade(socket);
    wss.handleUpgrade(req, socket, head, (ws) => attachClient(ws, hub));
  });

  await listen(server, options.port);
  port = (server.address() as AddressInfo).port;

  const watcher = new EventFileWatcher(options.eventsFile, options.intervalMs);
  watcher.subscribe((event) => hub.apply(event));
  watcher.start(true);

  return { port, close: () => closeAll(server, wss, watcher) };
}

function listen(server: ReturnType<typeof createServer>, port: number): Promise<void> {
  return new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(port, SERVER_HOST, () => {
      server.off('error', reject);
      resolve();
    });
  });
}

async function handleHttp(
  req: IncomingMessage,
  res: ServerResponse,
  port: number,
  options: StartServerOptions,
): Promise<void> {
  if (req.method !== 'GET' && req.method !== 'HEAD') {
    res.setHeader('Allow', 'GET, HEAD');
    return sendText(res, 405, 'Método não permitido', port);
  }
  if (!isAllowedHost(req.headers.host, port)) return sendText(res, 403, 'Host não permitido', port);

  const url = req.url ?? '/';
  if (pathnameOf(url) === '/app.js') return serveClientBundle(req, res, port, options.clientEntry);
  return servePublicFile(req, res, port, options.publicDir, url);
}

/** Compila a página em memória a cada pedido: basta F5 para ver mudanças no TypeScript. */
async function serveClientBundle(
  req: IncomingMessage,
  res: ServerResponse,
  port: number,
  clientEntry: string,
): Promise<void> {
  let code: string;
  try {
    const result = await build({
      entryPoints: [clientEntry],
      bundle: true,
      write: false,
      format: 'esm',
      platform: 'browser',
      target: 'es2022',
      sourcemap: 'inline',
      logLevel: 'silent',
    });
    code = result.outputFiles[0]?.text ?? '';
  } catch (error) {
    // Detalhes só no terminal; o navegador recebe uma mensagem genérica.
    console.error('[OF] erro ao compilar a página:', error);
    return sendText(res, 500, 'Erro ao compilar app.js (veja o terminal do servidor)', port);
  }
  sendBody(req, res, port, 'text/javascript; charset=utf-8', Buffer.from(code, 'utf8'));
}

async function servePublicFile(
  req: IncomingMessage,
  res: ServerResponse,
  port: number,
  publicDir: string,
  url: string,
): Promise<void> {
  const filePath = resolvePublicPath(publicDir, url);
  const type = filePath === null ? null : contentTypeFor(filePath);
  if (filePath === null || type === null || !(await isFile(filePath))) {
    return sendText(res, 404, 'Não encontrado', port);
  }
  sendBody(req, res, port, type, await readFile(filePath));
}

async function isFile(filePath: string): Promise<boolean> {
  try {
    return (await stat(filePath)).isFile();
  } catch {
    return false;
  }
}

function sendBody(req: IncomingMessage, res: ServerResponse, port: number, type: string, body: Buffer): void {
  res.writeHead(200, { ...securityHeaders(port), 'Content-Type': type, 'Content-Length': body.length });
  // HEAD responde só os cabeçalhos.
  res.end(req.method === 'HEAD' ? undefined : body);
}

function sendText(res: ServerResponse, status: number, text: string, port: number): void {
  const body = Buffer.from(text, 'utf8');
  res.writeHead(status, {
    ...securityHeaders(port),
    'Content-Type': 'text/plain; charset=utf-8',
    'Content-Length': body.length,
  });
  res.end(body);
}

function pathnameOf(url: string): string {
  const cut = url.search(/[?#]/);
  return cut === -1 ? url : url.slice(0, cut);
}

function canUpgrade(req: IncomingMessage, port: number): boolean {
  return (
    pathnameOf(req.url ?? '') === '/ws' &&
    isAllowedHost(req.headers.host, port) &&
    isAllowedOrigin(req.headers.origin, port)
  );
}

function rejectUpgrade(socket: Duplex): void {
  // Destrói só depois de enviar a resposta; destruir antes cortaria o 403.
  socket.once('finish', () => socket.destroy());
  socket.end('HTTP/1.1 403 Forbidden\r\nConnection: close\r\nContent-Length: 0\r\n\r\n');
}

function attachClient(ws: WebSocket, hub: OfficeHub): void {
  const remove = hub.addClient({ send: (text) => ws.send(text) });
  // O protocolo é só servidor → navegador: mensagens recebidas são ignoradas de propósito.
  ws.on('close', remove);
  // Sem este ouvinte, um erro (ex.: mensagem maior que maxPayload) derrubaria o processo.
  ws.on('error', remove);
}

async function closeAll(
  server: ReturnType<typeof createServer>,
  wss: WebSocketServer,
  watcher: EventFileWatcher,
): Promise<void> {
  watcher.stop();
  for (const client of wss.clients) client.terminate();
  await new Promise<void>((resolve) => wss.close(() => resolve()));
  await new Promise<void>((resolve) => {
    server.close(() => resolve());
    // Conexões HTTP keep-alive manteriam o close() esperando para sempre.
    server.closeAllConnections();
  });
}
