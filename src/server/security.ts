/**
 * Regras de segurança do servidor local (ADR 0001, decisão 5).
 *
 * Mesmo escutando só em 127.0.0.1, um site malicioso aberto no navegador pode
 * tentar falar com a nossa porta. Por isso conferimos:
 * - Host: barra ataques de "DNS rebinding" (um domínio externo apontando para 127.0.0.1);
 * - Origin no WebSocket: o navegador não aplica a política de mesma origem ao
 *   WebSocket, então somos nós que recusamos páginas de outros sites.
 */

function localHosts(port: number): string[] {
  return [`127.0.0.1:${port}`, `localhost:${port}`];
}

/** Host exato (com porta). Comparação sem diferenciar maiúsculas, como no DNS. */
export function isAllowedHost(host: string | undefined, port: number): boolean {
  if (typeof host !== 'string') return false;
  return localHosts(port).includes(host.toLowerCase());
}

/** Origin exato: só a própria página do OF pode abrir o WebSocket. */
export function isAllowedOrigin(origin: string | undefined, port: number): boolean {
  if (typeof origin !== 'string') return false;
  return localHosts(port)
    .map((host) => `http://${host}`)
    .includes(origin.toLowerCase());
}

/** Cabeçalhos enviados em toda resposta HTTP. */
export function securityHeaders(port: number): Record<string, string> {
  const wsSources = localHosts(port)
    .map((host) => `ws://${host}`)
    .join(' ');
  const csp = [
    "default-src 'none'",
    "script-src 'self'",
    "style-src 'self'",
    // data: = texturas internas do Phaser (embutidas como imagem base64 na biblioteca).
    "img-src 'self' data:",
    `connect-src ${wsSources}`,
    "base-uri 'none'",
    "form-action 'none'",
    "frame-ancestors 'none'",
  ].join('; ');

  return {
    'Content-Security-Policy': csp,
    'X-Content-Type-Options': 'nosniff',
    'Referrer-Policy': 'no-referrer',
    // Página de desenvolvimento: sempre a versão mais nova ao apertar F5.
    'Cache-Control': 'no-store',
  };
}
