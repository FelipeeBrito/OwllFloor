import { readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { afterEach, describe, expect, it } from 'vitest';
import { parseEvent, type OfficeEvent } from '../src/domain/events.js';
import { replay } from '../src/domain/office.js';
import { createDemoEventsFile, startDemoLoop, type DemoLoop } from '../src/demo/demo-loop.js';
import { playSampleSession, SAMPLE_STEPS } from '../src/demo/sample-session.js';

const noSleep = (): Promise<void> => Promise.resolve();

async function record(): Promise<OfficeEvent[]> {
  const events: OfficeEvent[] = [];
  await playSampleSession({ session: 's1', delayMs: 0, sleep: noSleep, write: (e) => events.push(e) });
  return events;
}

describe('playSampleSession', () => {
  it('abre o expediente, roda cada passo e fecha', async () => {
    const events = await record();
    expect(events).toHaveLength(SAMPLE_STEPS.length * 2 + 2);
    expect(events[0]?.type).toBe('session.started');
    expect(events.at(-1)?.type).toBe('session.ended');
  });

  it('todo evento respeita o contrato do domínio', async () => {
    for (const event of await record()) expect(parseEvent(JSON.stringify(event))).toEqual(event);
  });

  it('conta uma história com retrabalho do QA e termina com todos entregando', async () => {
    const state = replay(await record());
    expect(state.handoffs.filter((h) => h.kind === 'rework')).toHaveLength(1);
    expect(Object.values(state.desks).every((d) => d.status === 'done')).toBe(true);
    expect(state.open).toBe(false);
  });

  it('espera o dobro do tempo enquanto a coruja trabalha', async () => {
    const waits: number[] = [];
    await playSampleSession({
      session: 's1',
      delayMs: 100,
      steps: [['qa', 'Validar']],
      sleep: async (ms) => void waits.push(ms),
      write: () => {},
    });
    expect(waits).toEqual([100, 200, 100]);
  });
});

describe('modo demo', () => {
  let loop: DemoLoop | null = null;
  afterEach(() => loop?.stop());

  it('grava o expediente num arquivo temporário e para quando pedido', async () => {
    const file = createDemoEventsFile();
    expect(file.startsWith(tmpdir())).toBe(true);
    loop = startDemoLoop(file, 0, 60_000);

    await expect.poll(() => readFileSync(file, 'utf8').trim().split('\n').length).toBe(SAMPLE_STEPS.length * 2 + 2);
    const events = readFileSync(file, 'utf8').trim().split('\n').map(parseEvent);
    expect(events.every((e) => e !== null)).toBe(true);

    loop.stop();
    const size = readFileSync(file, 'utf8').length;
    await new Promise((done) => setTimeout(done, 50));
    expect(readFileSync(file, 'utf8')).toHaveLength(size);
  });
});
