import type { Handoff, OfficeState } from '../../../src/domain/office.js';
import type { SnapshotMessage } from '../../../src/domain/protocol.js';
import type { Role } from '../../../src/domain/roles.js';

/**
 * Coreografia: decide QUAIS animações tocar quando chega uma nova foto do
 * escritório. Não desenha nada (isso é com o Phaser, em office-scene.ts);
 * só compara a foto anterior com a nova. Por ser pura, é testada no Vitest.
 *
 * Regra de ouro: a animação nunca inventa nada. Tudo sai do estado e do
 * evento enviados pelo servidor, que por sua vez vêm do arquivo de eventos.
 */
export type OfficeAction =
  /** Coloca todas as corujas direto na posição certa, sem animar (ao conectar ou novo expediente). */
  | { type: 'reset'; state: OfficeState }
  /** A coruja `from` leva o trabalho até `to`. Retrabalho = QA devolvendo ao Engenheiro. */
  | { type: 'deliver'; from: Role; to: Role; kind: Handoff['kind'] }
  /** A coruja pula para a cadeira e começa a digitar. */
  | { type: 'sit'; role: Role; task: string; rework: boolean }
  /** Já estava sentada e recebeu outra tarefa: só troca o balão. */
  | { type: 'retask'; role: Role; task: string }
  /** Terminou: levanta da cadeira e mostra o sinal de entregue. */
  | { type: 'standUp'; role: Role }
  /** Expediente aberto ou fechado (luzes). */
  | { type: 'lights'; open: boolean };

function sameHandoff(a: Handoff | undefined, b: Handoff | undefined): boolean {
  if (a === undefined || b === undefined) return a === b;
  return a.from === b.from && a.to === b.to && a.ts === b.ts && a.kind === b.kind;
}

/**
 * Entrega que apareceu nesta foto, se houver.
 * Compara a última da lista porque o histórico tem limite de tamanho
 * (quando está cheio, o tamanho não muda, mas a última muda).
 */
export function newHandoff(prev: OfficeState, next: OfficeState): Handoff | null {
  const last = next.handoffs.at(-1);
  if (last === undefined) return null;
  const changed = next.handoffs.length !== prev.handoffs.length || !sameHandoff(prev.handoffs.at(-1), last);
  return changed ? last : null;
}

export function planActions(prev: OfficeState | null, message: SnapshotMessage): OfficeAction[] {
  const { state, event } = message;

  // Primeira foto, reconexão ou novo expediente: monta a cena do zero, sem animação.
  if (prev === null || event === null || event.type === 'session.started') {
    return [{ type: 'reset', state }];
  }

  switch (event.type) {
    case 'session.ended':
      return [{ type: 'lights', open: false }];

    case 'agent.started': {
      const actions: OfficeAction[] = [];
      const handoff = newHandoff(prev, state);
      if (handoff !== null && handoff.to === event.agent) {
        actions.push({ type: 'deliver', from: handoff.from, to: handoff.to, kind: handoff.kind });
      }
      const task = state.desks[event.agent].task;
      if (prev.desks[event.agent].status === 'working') {
        actions.push({ type: 'retask', role: event.agent, task });
      } else {
        actions.push({ type: 'sit', role: event.agent, task, rework: handoff?.kind === 'rework' });
      }
      return actions;
    }

    case 'agent.finished':
      return [{ type: 'standUp', role: event.agent }];
  }
}

/**
 * A coruja está trabalhando num retrabalho? (a última entrega foi uma devolução para ela)
 * Usado ao montar a cena do zero, para o balão vermelho não sumir ao recarregar a página.
 */
export function isReworking(state: OfficeState, role: Role): boolean {
  const last = state.handoffs.at(-1);
  return state.desks[role].status === 'working' && last?.kind === 'rework' && last.to === role;
}

/** Quantas vezes o QA devolveu trabalho no histórico guardado. */
export function reworkCount(state: OfficeState): number {
  return state.handoffs.filter((h) => h.kind === 'rework').length;
}

/**
 * Se as animações atrasarem demais (muitos eventos de uma vez, como no
 * `simulate --fast`), pulamos direto para o estado mais novo.
 */
export const MAX_PENDING_ACTIONS = 6;

export function shouldSkipAhead(pendingActions: number): boolean {
  return pendingActions > MAX_PENDING_ACTIONS;
}

/** Corta o texto do balão para caber na tela, com reticências. */
export function bubbleText(task: string, max = 34): string {
  const clean = task.replace(/\s+/g, ' ').trim();
  if (clean === '') return 'trabalhando…';
  return clean.length > max ? `${clean.slice(0, max - 1).trimEnd()}…` : clean;
}
