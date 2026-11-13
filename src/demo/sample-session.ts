import type { OfficeEvent } from '../domain/events.js';
import type { Role } from '../domain/roles.js';

/**
 * Expediente de exemplo, no mesmo formato que os hooks do Claude Code gravam.
 * Usado pelo `npm run simulate` e pelo modo demo (`npm run demo`), então os dois
 * mostram sempre a mesma história. Inclui uma reprovação do QA para exibir o retrabalho.
 */
export type SampleStep = readonly [agent: Role, summary: string];

export const SAMPLE_STEPS: readonly SampleStep[] = [
  ['arquiteto', 'Planejar a tela de login'],
  ['engenheiro', 'Implementar formulário e validação'],
  ['seguranca', 'Revisar tratamento de senha'],
  ['qa', 'Validar fluxo de login'],
  ['engenheiro', 'Corrigir mensagem de erro apontada pelo QA'],
  ['seguranca', 'Revisar correção'],
  ['qa', 'Validar novamente'],
  ['devops', 'Atualizar README e preparar commit'],
];

export interface PlayOptions {
  session: string;
  /** Pausa base entre eventos; 0 grava tudo de uma vez. */
  delayMs: number;
  write: (event: OfficeEvent) => void;
  /** Recebidos por parâmetro para os testes não dependerem do relógio de verdade. */
  sleep?: (ms: number) => Promise<void>;
  now?: () => Date;
  steps?: readonly SampleStep[];
}

const realSleep = (ms: number): Promise<void> => new Promise((done) => setTimeout(done, ms));

/** Emite o expediente evento por evento: abre, cada coruja trabalha e entrega, fecha. */
export async function playSampleSession(options: PlayOptions): Promise<void> {
  const { session, delayMs, write } = options;
  const sleep = options.sleep ?? realSleep;
  const now = options.now ?? (() => new Date());
  const base = () => ({ v: 1 as const, ts: now().toISOString(), session });

  write({ ...base(), type: 'session.started' });
  for (const [agent, summary] of options.steps ?? SAMPLE_STEPS) {
    await sleep(delayMs);
    write({ ...base(), type: 'agent.started', agent, summary });
    // Trabalhar leva mais tempo do que andar até a próxima mesa.
    await sleep(delayMs * 2);
    write({ ...base(), type: 'agent.finished', agent });
  }
  await sleep(delayMs);
  write({ ...base(), type: 'session.ended' });
}
