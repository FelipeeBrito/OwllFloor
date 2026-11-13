import { appendFileSync, mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { randomUUID } from 'node:crypto';
import { playSampleSession } from './sample-session.js';

/** Pausa base entre eventos do demo e intervalo entre um expediente e o próximo. */
export const DEMO_DELAY_MS = 1500;
export const DEMO_PAUSE_MS = 6000;

/**
 * Arquivo de eventos só do demo, numa pasta temporária.
 * Assim o demo nunca apaga nem mistura os eventos reais de logs/events.ndjson.
 */
export function createDemoEventsFile(): string {
  const file = join(mkdtempSync(join(tmpdir(), 'owllfloor-demo-')), 'events.ndjson');
  writeFileSync(file, '', 'utf8');
  return file;
}

export interface DemoLoop {
  stop(): void;
}

/**
 * Repete o expediente de exemplo para sempre, gravando no arquivo do demo.
 * O servidor lê esse arquivo como leria o dos hooks: o caminho dos dados é o mesmo do uso real.
 */
export function startDemoLoop(file: string, delayMs = DEMO_DELAY_MS, pauseMs = DEMO_PAUSE_MS): DemoLoop {
  let running = true;
  let wake: (() => void) | null = null;

  const sleep = (ms: number): Promise<void> =>
    new Promise((done) => {
      if (!running) return done();
      const timer = setTimeout(done, ms);
      wake = () => {
        clearTimeout(timer);
        done();
      };
    });

  const loop = async (): Promise<void> => {
    while (running) {
      // Esvaziar o arquivo faz o leitor recomeçar do início (ver EventFileWatcher).
      writeFileSync(file, '', 'utf8');
      await playSampleSession({
        session: randomUUID(),
        delayMs,
        sleep,
        write: (event) => {
          if (running) appendFileSync(file, JSON.stringify(event) + '\n', 'utf8');
        },
      });
      await sleep(pauseMs);
    }
  };
  loop().catch((error: unknown) => console.error('[OF] demo interrompido:', error));

  return {
    stop() {
      running = false;
      wake?.();
    },
  };
}
