import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vite';

/**
 * Configuração da página (Etapa 3, ADR 0002).
 * O Vite não abre servidor próprio: o servidor do OF o usa como peça interna
 * (src/server/vite-frontend.ts), na mesma porta e com as mesmas regras de segurança.
 */
const path = (relative: string): string => fileURLToPath(new URL(relative, import.meta.url));

export default defineConfig({
  root: path('./web'),
  publicDir: path('./web/public'),
  clearScreen: false,
  server: {
    fs: {
      strict: true,
      // O Vite só pode ler estas pastas: a página, o protocolo compartilhado e as bibliotecas.
      // Fora delas (package.json, logs/, .claude/...) ele responde 403.
      allow: [path('./web'), path('./src/domain'), path('./node_modules')],
    },
  },
  build: {
    outDir: path('./dist/web'),
    emptyOutDir: true,
    target: 'es2022',
    // O Phaser sozinho tem ~1,5 MB; o aviso padrão (500 kB) só faria barulho.
    chunkSizeWarningLimit: 2000,
  },
});
