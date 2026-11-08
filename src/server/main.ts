import { resolve } from 'node:path';
import { eventsFilePath } from '../infra/paths.js';
import { readServerConfig } from './config.js';
import { openBrowser } from './open-browser.js';
import { startServer, type RunningServer } from './server.js';

/**
 * `npm run dev` — sobe o escritório no navegador.
 * Um único processo: lê os eventos, serve a página e transmite o estado (ADR 0001).
 */
async function main(): Promise<void> {
  const config = readServerConfig(process.env);
  const eventsFile = eventsFilePath();
  const root = process.cwd();

  const server = await startServer({
    port: config.port,
    eventsFile,
    publicDir: resolve(root, 'web', 'public'),
    clientEntry: resolve(root, 'web', 'src', 'app.ts'),
  });

  const url = `http://${config.host}:${server.port}/`;
  console.log(`OwllFloor rodando em ${url}`);
  console.log(`Lendo eventos de: ${eventsFile}`);
  console.log('Ctrl+C para sair.');
  if (config.openBrowser) openBrowser(url);

  handleShutdown(server);
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
