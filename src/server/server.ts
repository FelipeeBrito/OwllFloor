import { readFile, stat } from 'node:fs/promises';
import { createServer, type IncomingMessage, type ServerResponse } from 'node:http';
import type { AddressInfo } from 'node:net';
import type { Duplex } from 'node:stream';
import { WebSocketServer, type WebSocket } from 'ws';
import { EventFileWatcher } from '../infra/event-file-watcher.js';
import { SERVER_HOST } from './config.js';
import { OfficeHub } from './office-hub.js';
import { isAllowedHost, isAllowedOrigin, securityHeaders } from './security.js';
import { contentTypeFor, resolvePublicPath } from './static-files.js';
import { startViteFrontend, VITE_HMR_PATH, type ViteFrontend } from './vite-frontend.js';

/**
 * De onde vem a página:
 * - 'vite': desenvolvimento; o Vite compila o TypeScript na hora (vite.config.ts).
 * - 'static': arquivos prontos numa pasta (saída do `npm run build`, ou pasta de teste).
 */
export type FrontendOptions = { kind: 'vite'; configFile: string } | { kind: 'static'; dir: string };

export interface StartServerOptions {
  /** 0 = o sistema escolhe uma porta livre (usado nos testes). */
  port: number;
  eventsFile: string;
  frontend: FrontendOptions;
  intervalMs?: number;
  /** Onde escutar. Padrão 127.0.0.1; só o container usa outro valor (ADR 0003). */
  bindHost?: string;
}

export interface RunningServer {
  port: number;
  close(): Promise<void>;
}

/** O navegador não manda nada útil; o limite pequeno evita abuso de memória. */
const MAX_CLIENT_PAYLOAD = 1024;

/**
 * Borda do sistema: junta HTTP, WebSocket, Vite e o leitor de eventos.
 * As regras ficam nos módulos puros (hub, security, static-files); aqui só ligamos os fios.
 */
export async function startServer(options: StartServerOptions): Promise<RunningServer> {
  const hub = new OfficeHub();
  const wss = new WebSocketServer({ noServer: true, maxPayload: MAX_CLIENT_PAYLOAD });
  // A porta real só é conhecida depois do listen (por causa do port 0).
  let port = options.port;
  let vite: ViteFrontend | null = null;

  const server = createServer((req, res) => {
    handleHttp(req, res, port, options.frontend, vite).catch((error: unknown) => {
      console.error('[OF] erro ao responder requisição:', error);
      if (!res.headersSent) sendText(res, 500, 'Erro interno', port);
      else res.destroy();
    });
  });

  // Toda conexão WebSocket passa pela mesma checagem de Host e Origin, inclusive a do Vite.
  server.on('upgrade', (req, socket, head) => {
    if (!isAllowedHost(req.headers.host, port) || !isAllowedOrigin(req.headers.origin, port)) {
      return rejectUpgrade(socket);
    }
    const path = pathnameOf(req.url ?? '');
    if (path === '/ws') return wss.handleUpgrade(req, socket, head, (ws) => attachClient(ws, hub));
    // O Vite registra o próprio ouvinte de 'upgrade' para este caminho; aqui só deixamos passar.
    if (vite !== null && path === VITE_HMR_PATH) return;
    rejectUpgrade(socket);
  });

  if (options.frontend.kind === 'vite') {
    vite = await startViteFrontend(server, options.frontend.configFile);
  }

  try {
    await listen(server, options.port, options.bindHost ?? SERVER_HOST);
  } catch (error) {
    await vite?.close();
    throw error;
  }
  port = (server.address() as AddressInfo).port;

  const watcher = new EventFileWatcher(options.eventsFile, options.intervalMs);
  watcher.subscribe((event) => hub.apply(event));
  watcher.start(true);

  return { port, close: () => closeAll(server, wss, watcher, vite) };
}

function listen(server: ReturnType<typeof createServer>, port: number, host: string): Promise<void> {
  return new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(port, host, () => {
      server.off('error', reject);
      resolve();
    });
  });
}

async function handleHttp(
  req: IncomingMessage,
  res: ServerResponse,
  port: number,
  frontend: FrontendOptions,
  vite: ViteFrontend | null,
): Promise<void> {
  if (req.method !== 'GET' && req.method !== 'HEAD') {
    res.setHeader('Allow', 'GET, HEAD');
    return sendText(res, 405, 'Método não permitido', port);
  }
  if (!isAllowedHost(req.headers.host, port)) return sendText(res, 403, 'Host não permitido', port);

  if (vite !== null) {
    // Os cabeçalhos de segurança vão antes; o Vite acrescenta os dele (tipo, cache).
    for (const [name, value] of Object.entries(securityHeaders(port))) res.setHeader(name, value);
    return vite.handle(req, res, () => sendText(res, 404, 'Não encontrado', port));
  }
  if (frontend.kind === 'static') return servePublicFile(req, res, port, frontend.dir, req.url ?? '/');
  return sendText(res, 404, 'Não encontrado', port);
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
  vite: ViteFrontend | null,
): Promise<void> {
  watcher.stop();
  for (const client of wss.clients) client.terminate();
  await new Promise<void>((resolve) => wss.close(() => resolve()));
  await vite?.close();
  await new Promise<void>((resolve) => {
    server.close(() => resolve());
    // Conexões HTTP keep-alive manteriam o close() esperando para sempre.
    server.closeAllConnections();
  });
}
