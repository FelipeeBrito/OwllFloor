export interface ServerConfig {
  host: string;
  port: number;
  openBrowser: boolean;
}

export const DEFAULT_PORT = 4747;

/** Só 127.0.0.1: o escritório não deve ficar visível para outras máquinas da rede. */
export const SERVER_HOST = '127.0.0.1';

/**
 * Lê a configuração das variáveis de ambiente.
 * Recebe `env` por parâmetro (em vez de ler process.env direto) para ser testável.
 */
export function readServerConfig(env: Record<string, string | undefined>): ServerConfig {
  return {
    host: SERVER_HOST,
    port: parsePort(env.OF_PORT),
    openBrowser: env.OF_NO_OPEN !== '1',
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
