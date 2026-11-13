import { describe, expect, it } from 'vitest';
import { DEFAULT_PORT, readServerConfig } from '../src/server/config.js';

describe('readServerConfig', () => {
  it('usa 127.0.0.1, porta 4747 e abre o navegador por padrão', () => {
    expect(readServerConfig({})).toEqual({
      host: '127.0.0.1',
      bindHost: '127.0.0.1',
      port: 4747,
      openBrowser: true,
      mode: 'vite',
      demo: false,
    });
    expect(DEFAULT_PORT).toBe(4747);
  });

  it('lê OF_PORT válida', () => {
    expect(readServerConfig({ OF_PORT: '8080' }).port).toBe(8080);
    expect(readServerConfig({ OF_PORT: '1' }).port).toBe(1);
    expect(readServerConfig({ OF_PORT: '65535' }).port).toBe(65535);
  });

  it('OF_PORT vazia usa o padrão', () => {
    expect(readServerConfig({ OF_PORT: '' }).port).toBe(4747);
  });

  it.each(['0', '65536', '-1', 'abc', '80.5', '1e3', '0x10', '80abc'])('recusa OF_PORT=%s com mensagem em português', (value) => {
    expect(() => readServerConfig({ OF_PORT: value })).toThrow(/OF_PORT inválida/);
  });

  it('OF_NO_OPEN=1 desliga a abertura do navegador; outros valores não', () => {
    expect(readServerConfig({ OF_NO_OPEN: '1' }).openBrowser).toBe(false);
    expect(readServerConfig({ OF_NO_OPEN: '0' }).openBrowser).toBe(true);
    expect(readServerConfig({ OF_NO_OPEN: 'true' }).openBrowser).toBe(true);
  });

  it('--static troca o modo para servir a página compilada', () => {
    expect(readServerConfig({}, ['node', 'main.ts', '--static']).mode).toBe('static');
    expect(readServerConfig({}, ['node', 'main.ts']).mode).toBe('vite');
  });

  it('host é sempre 127.0.0.1, mesmo com variáveis estranhas', () => {
    expect(readServerConfig({ HOST: '0.0.0.0' }).host).toBe('127.0.0.1');
  });

  it('só OF_BIND_ALL=1 faz escutar em todas as interfaces (uso em container)', () => {
    expect(readServerConfig({ OF_BIND_ALL: '1' }).bindHost).toBe('0.0.0.0');
    expect(readServerConfig({ OF_BIND_ALL: 'true' }).bindHost).toBe('127.0.0.1');
    expect(readServerConfig({ HOST: '0.0.0.0' }).bindHost).toBe('127.0.0.1');
    // O endereço aceito no cabeçalho Host não muda.
    expect(readServerConfig({ OF_BIND_ALL: '1' }).host).toBe('127.0.0.1');
  });

  it('--demo liga o modo demo', () => {
    expect(readServerConfig({}, ['node', 'main.ts', '--static', '--demo'])).toMatchObject({ demo: true, mode: 'static' });
  });
});
