import { describe, expect, it } from 'vitest';
import { browserCommand } from '../src/server/open-browser.js';

const URL = 'http://127.0.0.1:4747/';

describe('browserCommand', () => {
  it('Windows usa cmd /c start com título vazio e argumentos literais', () => {
    expect(browserCommand('win32', URL)).toEqual({
      command: 'cmd',
      args: ['/c', 'start', '""', URL],
      windowsVerbatimArguments: true,
    });
  });

  it('Mac usa open', () => {
    expect(browserCommand('darwin', URL)).toEqual({ command: 'open', args: [URL] });
  });

  it.each(['linux', 'freebsd'] as const)('%s usa xdg-open', (platform) => {
    expect(browserCommand(platform, URL)).toEqual({ command: 'xdg-open', args: [URL] });
  });
});
