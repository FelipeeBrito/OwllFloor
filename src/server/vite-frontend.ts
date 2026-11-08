import type { IncomingMessage, Server, ServerResponse } from 'node:http';
import { createServer as createViteServer } from 'vite';

/**
 * Caminho do WebSocket do próprio Vite (recarregar a página quando um arquivo muda).
 * Fica na mesma porta do OF, separado do nosso /ws.
 */
export const VITE_HMR_PATH = '/__vite_hmr';

export interface ViteFrontend {
  /** Passa a requisição para o Vite; se ele não souber responder, chama `notFound`. */
  handle(req: IncomingMessage, res: ServerResponse, notFound: () => void): void;
  close(): Promise<void>;
}

/**
 * Vite em "modo middleware": em vez de abrir um segundo servidor, ele vira uma
 * peça do nosso servidor HTTP. Assim continua existindo uma porta só, e as
 * checagens de Host/Origin/CSP do OF valem também para a página do Vite.
 *
 * As opções da página (pasta raiz, pastas liberadas, build) ficam em vite.config.ts.
 */
export async function startViteFrontend(httpServer: Server, configFile: string): Promise<ViteFrontend> {
  const vite = await createViteServer({
    configFile,
    appType: 'mpa', // serve index.html, mas responde 404 para caminhos desconhecidos
    server: {
      middlewareMode: true,
      ws: { server: httpServer, path: VITE_HMR_PATH },
    },
  });

  return {
    handle(req, res, notFound) {
      vite.middlewares(req, res, notFound);
    },
    close: () => vite.close(),
  };
}
