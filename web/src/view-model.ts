import type { OfficeEvent } from '../../src/domain/events.js';
import type { DeskStatus, Handoff } from '../../src/domain/office.js';
import type { SnapshotMessage } from '../../src/domain/protocol.js';
import { ROLES, ROLE_INFO, type Role } from '../../src/domain/roles.js';

/**
 * "View model" da página: transforma a mensagem do servidor nos textos e
 * marcações que a tela mostra. É puro (sem DOM) para ser testado com Vitest;
 * o arquivo dom.ts só copia estes valores para os elementos.
 */

export type ConnectionStatus = 'connecting' | 'connected' | 'disconnected';

export interface DeskView {
  role: Role;
  label: string;
  accessory: string;
  status: DeskStatus;
  statusLabel: string;
  task: string;
}

export interface HandoffView {
  kind: Handoff['kind'];
  text: string;
  time: string;
}

export interface OfficeView {
  title: string;
  desks: DeskView[];
  /** Mais recente primeiro. */
  handoffs: HandoffView[];
  lastEvent: string | null;
}

/** Quantas entregas aparecem na lista da página. */
export const VISIBLE_HANDOFFS = 10;

const STATUS_LABEL: Record<DeskStatus, string> = {
  idle: 'livre',
  working: 'trabalhando',
  done: 'entregou',
};

const CONNECTION_LABEL: Record<ConnectionStatus, string> = {
  connecting: 'conectando…',
  connected: 'conectado',
  disconnected: 'desconectado — tentando reconectar',
};

export function connectionLabel(status: ConnectionStatus): string {
  return CONNECTION_LABEL[status];
}

/** Espera antes da tentativa `attempt` (0, 1, 2...): 1s, 2s, 4s e no máximo 5s. */
export function reconnectDelay(attempt: number): number {
  const safeAttempt = Math.max(0, Math.floor(attempt));
  return Math.min(1000 * 2 ** safeAttempt, 5000);
}

/** Exige data e hora completas: `new Date('1')` seria aceito e viraria uma data absurda. */
const ISO_DATE_TIME = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/;

const twoDigits = (n: number): string => String(n).padStart(2, '0');

/**
 * Hora curta (HH:MM:SS) na hora local do navegador; texto vazio se inválido.
 * O evento é gravado em UTC, mas quem olha a tela pensa no relógio da parede.
 * Montamos à mão em vez de Intl/toLocaleTimeString para o formato não mudar
 * conforme o idioma do navegador (ex.: "2:36:12 PM").
 */
export function formatTime(ts: string): string {
  if (!ISO_DATE_TIME.test(ts)) return '';
  const date = new Date(ts);
  if (Number.isNaN(date.getTime())) return '';
  return [date.getHours(), date.getMinutes(), date.getSeconds()].map(twoDigits).join(':');
}

export function describeHandoff(handoff: Handoff): string {
  const from = ROLE_INFO[handoff.from].label;
  const to = ROLE_INFO[handoff.to].label;
  return handoff.kind === 'rework'
    ? `${from} devolveu para ${to} corrigir`
    : `${from} entregou para ${to}`;
}

export function describeEvent(event: OfficeEvent): string {
  switch (event.type) {
    case 'session.started':
      return 'Expediente começou';
    case 'session.ended':
      return 'Expediente encerrado';
    case 'agent.started':
      return `${ROLE_INFO[event.agent].label} começou a trabalhar`;
    case 'agent.finished':
      return `${ROLE_INFO[event.agent].label} terminou`;
  }
}

function buildTitle(message: SnapshotMessage): string {
  const { open, session } = message.state;
  const status = open ? 'expediente aberto' : 'expediente fechado';
  return session ? `${status} (sessão ${session.slice(0, 8)})` : status;
}

export function toOfficeView(message: SnapshotMessage): OfficeView {
  const { state, event } = message;
  const desks = ROLES.map((role): DeskView => {
    const desk = state.desks[role];
    return {
      role,
      label: ROLE_INFO[role].label,
      accessory: ROLE_INFO[role].accessory,
      status: desk.status,
      statusLabel: STATUS_LABEL[desk.status],
      task: desk.task,
    };
  });
  const handoffs = state.handoffs
    .slice(-VISIBLE_HANDOFFS)
    .reverse()
    .map((h): HandoffView => ({ kind: h.kind, text: describeHandoff(h), time: formatTime(h.ts) }));

  return { title: buildTitle(message), desks, handoffs, lastEvent: event ? describeEvent(event) : null };
}
