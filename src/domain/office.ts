import type { OfficeEvent } from './events.js';
import { ROLES, type Role } from './roles.js';

/**
 * Estado do escritório num instante.
 *
 * É calculado por um *reducer*: uma função pura que recebe o estado atual
 * e um evento, e devolve o próximo estado sem modificar o anterior.
 * Vantagem: dá para testar cada regra isoladamente e "reproduzir" um
 * expediente inteiro só relendo o arquivo de eventos.
 */
export type DeskStatus = 'idle' | 'working' | 'done';

export interface Desk {
  status: DeskStatus;
  task: string;
  since: string | null;
}

/** Uma coruja levantando da mesa e entregando o trabalho para outra. */
export interface Handoff {
  from: Role;
  to: Role;
  ts: string;
  /** 'rework' = o QA devolveu a entrega para o Engenheiro corrigir. */
  kind: 'delivery' | 'rework';
}

export interface OfficeState {
  session: string | null;
  open: boolean;
  desks: Record<Role, Desk>;
  lastFinished: Role | null;
  handoffs: Handoff[];
}

/** Quantos handoffs guardamos no histórico (evita crescer sem limite). */
export const HANDOFF_HISTORY_LIMIT = 50;

function emptyDesks(): Record<Role, Desk> {
  const desks = {} as Record<Role, Desk>;
  for (const role of ROLES) desks[role] = { status: 'idle', task: '', since: null };
  return desks;
}

export function initialOfficeState(): OfficeState {
  return { session: null, open: false, desks: emptyDesks(), lastFinished: null, handoffs: [] };
}

export function officeReducer(state: OfficeState, event: OfficeEvent): OfficeState {
  switch (event.type) {
    case 'session.started':
      // Novo expediente: todas as mesas voltam ao estado livre.
      return { ...initialOfficeState(), session: event.session, open: true };

    case 'session.ended':
      return { ...state, open: false };

    case 'agent.started': {
      const desks = {
        ...state.desks,
        [event.agent]: { status: 'working', task: event.summary, since: event.ts },
      };

      const from = state.lastFinished;
      if (from === null || from === event.agent) return { ...state, desks };

      const handoff: Handoff = {
        from,
        to: event.agent,
        ts: event.ts,
        kind: from === 'qa' && event.agent === 'engenheiro' ? 'rework' : 'delivery',
      };
      const handoffs = [...state.handoffs, handoff].slice(-HANDOFF_HISTORY_LIMIT);
      return { ...state, desks, handoffs };
    }

    case 'agent.finished': {
      const previous = state.desks[event.agent];
      const desks = {
        ...state.desks,
        [event.agent]: { ...previous, status: 'done', since: event.ts },
      };
      return { ...state, desks, lastFinished: event.agent };
    }
  }
}

/** Reconstrói o estado a partir de uma lista de eventos (replay). */
export function replay(events: readonly OfficeEvent[]): OfficeState {
  return events.reduce(officeReducer, initialOfficeState());
}
