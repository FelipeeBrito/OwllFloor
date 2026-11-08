import { defineConfig } from 'vitest/config';

/**
 * Configuração dos testes. Existe só para o Vitest NÃO usar o vite.config.ts
 * (que aponta a raiz para web/ e esconderia a pasta tests/).
 */
export default defineConfig({
  test: {
    include: ['tests/**/*.test.ts'],
    // Cada arquivo num processo próprio: tests/web-view-model.test.ts muda o fuso (TZ).
    pool: 'forks',
  },
});
