import { extname, isAbsolute, relative, resolve, sep } from 'node:path';

/**
 * Converte a URL pedida em um caminho dentro de `publicDir`.
 * Devolve null se o pedido for inválido ou tentar sair da pasta pública
 * (path traversal, ex.: `/../package.json` ou `/%2e%2e/segredo`).
 */
export function resolvePublicPath(publicDir: string, rawUrl: string): string | null {
  const pathname = decodePathname(stripQuery(rawUrl));
  if (pathname === null) return null;
  // Byte nulo pode truncar caminhos em APIs nativas; nunca é legítimo aqui.
  if (pathname.includes('\0')) return null;
  // "\" é separador no Windows mas não no Linux; recusar sempre deixa o
  // comportamento igual nos três sistemas (nenhuma URL legítima usa "\").
  if (pathname.includes('\\')) return null;

  const wanted = pathname === '/' || pathname === '' ? '/index.html' : pathname;
  const root = resolve(publicDir);
  // O "." na frente garante que o caminho seja tratado como relativo à raiz,
  // mesmo que comece com "/" ou "\" (no Windows, "\" também é separador).
  const target = resolve(root, '.' + sep + wanted);

  return isInside(root, target) ? target : null;
}

function stripQuery(rawUrl: string): string {
  const cut = rawUrl.search(/[?#]/);
  return cut === -1 ? rawUrl : rawUrl.slice(0, cut);
}

function decodePathname(pathname: string): string | null {
  try {
    return decodeURIComponent(pathname);
  } catch {
    // "%E0%A4%A" e similares lançam URIError: tratamos como pedido inválido.
    return null;
  }
}

/** Confere pela relação entre caminhos, e não por prefixo de texto (evita "/public-x"). */
function isInside(root: string, target: string): boolean {
  const rel = relative(root, target);
  if (rel === '') return false; // a própria pasta não é um arquivo
  const escapes = rel === '..' || rel.startsWith('..' + sep);
  return !escapes && !isAbsolute(rel);
}

const CONTENT_TYPES: Record<string, string> = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.png': 'image/png',
  '.svg': 'image/svg+xml',
  '.json': 'application/json; charset=utf-8',
};

/** Tipo do arquivo pela extensão. null = não servimos esse tipo. */
export function contentTypeFor(filePath: string): string | null {
  return CONTENT_TYPES[extname(filePath).toLowerCase()] ?? null;
}
