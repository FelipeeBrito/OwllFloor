import { join, resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { contentTypeFor, resolvePublicPath } from '../src/server/static-files.js';

const publicDir = resolve('fake-root', 'public');

describe('resolvePublicPath', () => {
  it('"/" vira index.html', () => {
    expect(resolvePublicPath(publicDir, '/')).toBe(join(publicDir, 'index.html'));
  });

  it('resolve arquivos e subpastas dentro da pasta pública', () => {
    expect(resolvePublicPath(publicDir, '/style.css')).toBe(join(publicDir, 'style.css'));
    expect(resolvePublicPath(publicDir, '/img/coruja.png')).toBe(join(publicDir, 'img', 'coruja.png'));
  });

  it('ignora query string e fragmento', () => {
    expect(resolvePublicPath(publicDir, '/style.css?v=2')).toBe(join(publicDir, 'style.css'));
    expect(resolvePublicPath(publicDir, '/?x=1')).toBe(join(publicDir, 'index.html'));
    expect(resolvePublicPath(publicDir, '/style.css#topo')).toBe(join(publicDir, 'style.css'));
  });

  it('decodifica caracteres codificados', () => {
    expect(resolvePublicPath(publicDir, '/meu%20arquivo.css')).toBe(join(publicDir, 'meu arquivo.css'));
  });

  it.each([
    '/../package.json',
    '/../../etc/passwd',
    '/%2e%2e/package.json',
    '/%2E%2E%2Fpackage.json',
    '/..%2f..%2fpackage.json',
    '/..\\package.json',
    '/%2e%2e%5cpackage.json',
    '/img/../../segredo.txt',
  ])('bloqueia path traversal: %s', (url) => {
    expect(resolvePublicPath(publicDir, url)).toBeNull();
  });

  it('não confunde pasta vizinha com nome parecido (public-x)', () => {
    expect(resolvePublicPath(publicDir, '/../public-x/arquivo.css')).toBeNull();
  });

  it('bloqueia byte nulo', () => {
    expect(resolvePublicPath(publicDir, '/index.html%00.png')).toBeNull();
  });

  it('devolve null para codificação inválida em vez de lançar', () => {
    expect(resolvePublicPath(publicDir, '/%E0%A4%A')).toBeNull();
    expect(resolvePublicPath(publicDir, '/%')).toBeNull();
  });

  it('não devolve a própria pasta como arquivo', () => {
    expect(resolvePublicPath(publicDir, '/.')).toBeNull();
  });
});

describe('contentTypeFor', () => {
  it.each([
    ['index.html', 'text/html; charset=utf-8'],
    ['style.css', 'text/css; charset=utf-8'],
    ['app.js', 'text/javascript; charset=utf-8'],
    ['coruja.png', 'image/png'],
    ['icone.svg', 'image/svg+xml'],
    ['dados.json', 'application/json; charset=utf-8'],
    ['PAGINA.HTML', 'text/html; charset=utf-8'],
  ])('%s → %s', (file, type) => {
    expect(contentTypeFor(file)).toBe(type);
  });

  it.each(['segredo.env', 'script.ts', 'sem-extensao', '.gitignore'])('não serve %s', (file) => {
    expect(contentTypeFor(file)).toBeNull();
  });
});
