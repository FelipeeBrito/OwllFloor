import { readdirSync, readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * Trava de segurança (ADR 0001): o texto das tarefas vem de prompts, então a
 * página nunca pode interpretá-lo como HTML. Este teste falha se alguém usar
 * APIs que injetam HTML ou estilo inline no código da página.
 */
const webSrc = resolve('web', 'src');
// recursive: inclui web/src/office (Phaser). Nomes relativos, ex.: 'office/owl.ts'.
const files = readdirSync(webSrc, { recursive: true, encoding: 'utf8' }).filter((name) => name.endsWith('.ts'));

describe('código da página (web/src)', () => {
  it.each(files)('%s não usa innerHTML, outerHTML, insertAdjacentHTML, document.write nem estilo inline', (name) => {
    // Remove comentários: o próprio dom.ts cita as APIs proibidas para explicar a regra.
    const code = readFileSync(join(webSrc, name), 'utf8')
      .replace(/\/\*[\s\S]*?\*\//g, '')
      .replace(/^\s*\/\/.*$/gm, '');
    expect(code).not.toMatch(/\.(innerHTML|outerHTML)\b|insertAdjacentHTML|document\.write|\.style\b|setAttribute\(\s*['"]style/);
  });

  it('a lista inclui os arquivos do Phaser', () => {
    expect(files.map((name) => name.replace(/\\/g, '/'))).toContain('office/office-scene.ts');
  });

  it('index.html não tem script nem estilo inline', () => {
    const html = readFileSync(resolve('web', 'index.html'), 'utf8');
    expect(html).toContain('<script type="module" src="/src/app.ts"></script>');
    expect(html).not.toMatch(/<script(?![^>]*\ssrc=)[^>]*>/);
    expect(html).not.toMatch(/<style|\sstyle=|\son\w+=/i);
  });
});
