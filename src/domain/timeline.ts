import { parseEvent, type OfficeEvent } from './events.js';
import { replay, type OfficeState } from './office.js';
import { ROLES } from './roles.js';

/**
 * Linha do tempo do expediente: quantas corujas trabalharam ao mesmo tempo
 * em cada intervalo. Função pura — recebe os eventos e devolve os quadros,
 * sem ler arquivos nem rede (quem lê o arquivo é `scripts/replay.ts`).
 */
export interface TimelineFrame {
  /** Início do intervalo, em milissegundos desde 1970 (como `Date.getTime()`). */
  at: number;
  /** Máximo de agentes trabalhando ao mesmo tempo dentro do intervalo. */
  working: number;
}

/**
 * Valida um item usando o mesmo contrato do arquivo (`parseEvent`), para não
 * duplicar a regra aqui. Devolve null se o item ou a data forem inválidos.
 */
function toEvent(raw: unknown): { event: OfficeEvent; time: number } | null {
  let text: string | undefined;
  try {
    text = JSON.stringify(raw);
  } catch {
    return null; // ex.: objeto com referência circular
  }
  if (text === undefined) return null;

  const event = parseEvent(text);
  if (event === null) return null;

  const time = Date.parse(event.ts);
  return Number.isNaN(time) ? null : { event, time };
}

function countWorking(state: OfficeState): number {
  return ROLES.filter((role) => state.desks[role].status === 'working').length;
}

/**
 * Resume o expediente em quadros de `bucketMs` milissegundos (padrão: 1 minuto).
 *
 * - Eventos malformados são ignorados.
 * - Os eventos são lidos na ordem da lista (a ordem em que foram gravados).
 * - Intervalos sem evento, mas com alguém ainda trabalhando, também viram quadro.
 * - Intervalos em que ninguém trabalhou e nada aconteceu ficam de fora.
 */
export function summarizeDay(events: readonly unknown[], bucketMs = 60_000): TimelineFrame[] {
  if (!Number.isFinite(bucketMs) || bucketMs <= 0) {
    throw new RangeError('bucketMs precisa ser um número maior que zero');
  }

  const maxByBucket = new Map<number, number>();
  const note = (at: number, working: number): void => {
    maxByBucket.set(at, Math.max(maxByBucket.get(at) ?? 0, working));
  };

  // `session.started` zera o escritório, então basta reproduzir os eventos do
  // expediente atual: o replay fica curto mesmo num arquivo de vários dias.
  let currentSession: OfficeEvent[] = [];
  let working = 0;
  let lastBucket: number | null = null;

  for (const raw of events) {
    const valid = toEvent(raw);
    if (valid === null) continue;

    const bucket = Math.floor(valid.time / bucketMs) * bucketMs;

    if (lastBucket !== null && working > 0) {
      // Quem já estava trabalhando continua contando até este evento chegar.
      for (let at = lastBucket + bucketMs; at <= bucket; at += bucketMs) note(at, working);
    }

    if (valid.event.type === 'session.started') currentSession = [];
    currentSession.push(valid.event);
    working = countWorking(replay(currentSession));

    note(bucket, working);
    lastBucket = bucket;
  }

  return [...maxByBucket.entries()]
    .sort(([a], [b]) => a - b)
    .map(([at, max]) => ({ at, working: max }));
}
