import { appendFileSync, mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import type { OfficeEvent } from '../src/domain/events.js';
import { EventFileWatcher } from '../src/infra/event-file-watcher.js';

const line = (agent: string) =>
  JSON.stringify({ v: 1, ts: '2026-11-08T12:00:00.000Z', session: 's', type: 'agent.finished', agent }) + '\n';

function setup() {
  const file = join(mkdtempSync(join(tmpdir(), 'of-')), 'events.ndjson');
  const watcher = new EventFileWatcher(file);
  const received: OfficeEvent[] = [];
  watcher.subscribe((e) => received.push(e));
  return { file, watcher, received };
}

describe('EventFileWatcher', () => {
  it('não falha quando o arquivo ainda não existe', () => {
    const { watcher, received } = setup();
    watcher.readNew();
    expect(received).toHaveLength(0);
  });

  it('lê apenas as linhas novas a cada leitura', () => {
    const { file, watcher, received } = setup();
    writeFileSync(file, line('qa'));
    watcher.readNew();
    appendFileSync(file, line('devops'));
    watcher.readNew();
    expect(received.map((e) => ('agent' in e ? e.agent : ''))).toEqual(['qa', 'devops']);
  });

  it('espera a linha terminar antes de emitir', () => {
    const { file, watcher, received } = setup();
    const full = line('qa');
    writeFileSync(file, full.slice(0, 20));
    watcher.readNew();
    expect(received).toHaveLength(0);
    appendFileSync(file, full.slice(20));
    watcher.readNew();
    expect(received).toHaveLength(1);
  });

  it('ignora linhas inválidas e continua lendo', () => {
    const { file, watcher, received } = setup();
    writeFileSync(file, 'lixo\n' + line('qa'));
    watcher.readNew();
    expect(received).toHaveLength(1);
  });

  it('recomeça do início se o arquivo for recriado', () => {
    const { file, watcher, received } = setup();
    writeFileSync(file, line('qa') + line('qa'));
    watcher.readNew();
    writeFileSync(file, line('devops'));
    watcher.readNew();
    expect(received).toHaveLength(3);
  });

  it('um ouvinte com erro não impede os outros', () => {
    const { file, watcher, received } = setup();
    watcher.subscribe(() => {
      throw new Error('ouvinte com defeito');
    });
    writeFileSync(file, line('qa'));
    const originalError = console.error;
    console.error = () => {};
    watcher.readNew();
    console.error = originalError;
    expect(received).toHaveLength(1);
  });
});
