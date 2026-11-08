import { resolve } from 'node:path';

/**
 * Caminho do arquivo de eventos. É o mesmo que o hook usa em
 * .claude/hooks/emit-event.mjs — se mudar aqui, mude lá também.
 * Pode ser sobrescrito com a variável OF_EVENTS_FILE.
 */
export function eventsFilePath(): string {
  return process.env.OF_EVENTS_FILE ?? resolve(process.cwd(), 'logs', 'events.ndjson');
}
