/**
 * - 'vite': desenvolvimento (npm run dev). O Vite compila a página na hora e recarrega
 *   o navegador sozinho quando um arquivo muda.
 * - 'static': serve a página já compilada por `npm run build` (npm start).
 */
export type FrontendMode = 'vite' | 'static';

export interface ServerConfig {
  /** Endereço mostrado ao usuário e aceito no cabeçalho Host. */
  host: string;
  /** Endereço em que o servidor escuta. Só muda dentro de um container (OF_BIND_ALL=1). */
  bindHost: string;
  port: number;
  openBrowser: boolean;
  mode: FrontendMode;
  /** true = toca o expediente de exemplo em repetição, sem ler os eventos reais. */
  demo: boolean;
}

export const DEFAULT_PORT = 4747;

/** Só 127.0.0.1: o escritório não deve ficar visível para outras máquinas da rede. */
export const SERVER_HOST = '127.0.0.1';

/**
 * Dentro de um container, 127.0.0.1 é o próprio container: a porta publicada pelo Docker
 * não chegaria ao servidor. OF_BIND_ALL=1 faz escutar em todas as interfaces *do container*;
 * quem limita o acesso ao computador do usuário é a publicação `127.0.0.1:4747:4747` (ADR 0003).
 * A checagem de Host/Origin continua aceitando só 127.0.0.1 e localhost.
 */
export const CONTAINER_BIND_HOST = '0.0.0.0';

/**
 * Lê a configuração das variáveis de ambiente.
 * Recebe `env` e `argv` por parâmetro (em vez de ler process.env/argv direto) para ser testável.
 */
export function readServerConfig(
  env: Record<string, string | undefined>,
  argv: readonly string[] = [],
): ServerConfig {
  return {
    host: SERVER_HOST,
    bindHost: env.OF_BIND_ALL === '1' ? CONTAINER_BIND_HOST : SERVER_HOST,
    port: parsePort(env.OF_PORT),
    openBrowser: env.OF_NO_OPEN !== '1',
    mode: argv.includes('--static') ? 'static' : 'vite',
    demo: argv.includes('--demo'),
  };
}

function parsePort(raw: string | undefined): number {
  if (raw === undefined || raw.trim() === '') return DEFAULT_PORT;
  const text = raw.trim();
  // Regex em vez de Number(): Number('1e3') e Number('0x10') seriam aceitos sem querer.
  const port = /^\d+$/.test(text) ? Number(text) : NaN;
  if (!Number.isInteger(port) || port < 1 || port > 65535) {
    throw new Error(`OF_PORT inválida: "${raw}". Use um número inteiro entre 1 e 65535.`);
  }
  return port;
}
