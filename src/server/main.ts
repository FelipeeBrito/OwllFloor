import { existsSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { eventsFilePath } from '../infra/paths.js';
import { readServerConfig, type ServerConfig } from './config.js';
import { openBrowser } from './open-browser.js';
import { startServer, type FrontendOptions, type RunningServer } from './server.js';

/**
 * `npm run dev` — sobe o escritório no navegador, com o Vite compilando a página na hora.
 * `npm start`   — mesma coisa, mas servindo a página já compilada por `npm run build`.
 * Um único processo: lê os eventos, serve a página e transmite o estado (ADR 0001 e 0002).
 */
async function main(): Promise<void> {
  const config = readServerConfig(process.env, process.argv);
  const eventsFile = eventsFilePath();

  const server = await startServer({ port: config.port, eventsFile, frontend: frontendFor(config) });

  const url = `http://${config.host}:${server.port}/`;
  console.log(`OwllFloor rodando em ${url} (${config.mode === 'vite' ? 'desenvolvimento' : 'página compilada'})`);
  console.log(`Lendo eventos de: ${eventsFile}`);
  console.log('Ctrl+C para sair.');
  if (config.openBrowser) openBrowser(url);

  handleShutdown(server);
}

function frontendFor(config: ServerConfig): FrontendOptions {
  const root = process.cwd();
  if (config.mode === 'vite') return { kind: 'vite', configFile: resolve(root, 'vite.config.ts') };

  const dir = resolve(root, 'dist', 'web');
  if (!existsSync(join(dir, 'index.html'))) {
    throw new Error('Página compilada não encontrada em dist/web. Rode "npm run build" antes de "npm start".');
  }
  return { kind: 'static', dir };
}

function handleShutdown(server: RunningServer): void {
  process.once('SIGINT', () => {
    server.close().finally(() => process.exit(0));
  });
}

function explain(error: unknown): string {
  const code = (error as NodeJS.ErrnoException | undefined)?.code;
  if (code === 'EADDRINUSE') {
    return 'A porta já está em uso (talvez outro "npm run dev" aberto). Feche-o ou use outra porta, ex.: OF_PORT=4848 npm run dev';
  }
  return error instanceof Error ? error.message : String(error);
}

main().catch((error: unknown) => {
  console.error(`[OF] Não foi possível iniciar: ${explain(error)}`);
  process.exit(1);
});
