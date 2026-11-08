import { parseEvent, type OfficeEvent } from './events.js';
import type { Desk, DeskStatus, Handoff, OfficeState } from './office.js';
import { isRole, ROLES, type Role } from './roles.js';

/**
 * Protocolo servidor → navegador (ADR 0001).
 *
 * Este arquivo é usado pelo servidor (Node) e pela página (navegador), por isso
 * não pode importar nada do Node nem do DOM.
 *
 * Mandamos sempre a "foto" completa do estado (snapshot) em vez de só o evento:
 * assim o navegador não precisa repetir o reducer e uma mensagem perdida não
 * deixa a tela errada.
 */
export const PROTOCOL_VERSION = 1 as const;

export interface SnapshotMessage {
  type: 'office.snapshot';
  v: typeof PROTOCOL_VERSION;
  state: OfficeState;
  /** Evento que gerou esta foto; null na foto enviada ao conectar. */
  event: OfficeEvent | null;
}

export type ServerMessage = SnapshotMessage;

export function createSnapshotMessage(state: OfficeState, event: OfficeEvent | null): SnapshotMessage {
  return { type: 'office.snapshot', v: PROTOCOL_VERSION, state, event };
}

/**
 * Converte o texto recebido pelo WebSocket em mensagem válida.
 * Devolve null para qualquer coisa estranha (JSON inválido, versão ou tipo
 * desconhecidos, estado malformado): a página simplesmente ignora.
 */
export function parseServerMessage(text: string): ServerMessage | null {
  const raw = parseJsonObject(text);
  if (raw === null) return null;
  if (raw.type !== 'office.snapshot' || raw.v !== PROTOCOL_VERSION) return null;

  const state = parseState(raw.state);
  if (state === null) return null;

  const event = parseOptionalEvent(raw.event);
  if (event === undefined) return null;

  return createSnapshotMessage(state, event);
}

type JsonObject = Record<string, unknown>;

function isObject(value: unknown): value is JsonObject {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function parseJsonObject(text: string): JsonObject | null {
  try {
    const value: unknown = JSON.parse(text);
    return isObject(value) ? value : null;
  } catch {
    return null;
  }
}

/** undefined = inválido; null = ausente de propósito (foto inicial). */
function parseOptionalEvent(value: unknown): OfficeEvent | null | undefined {
  if (value === null) return null;
  if (!isObject(value)) return undefined;
  // Reaproveita a validação oficial do contrato de eventos em vez de duplicá-la.
  return parseEvent(JSON.stringify(value)) ?? undefined;
}

const DESK_STATUSES: readonly DeskStatus[] = ['idle', 'working', 'done'];

function parseDesk(value: unknown): Desk | null {
  if (!isObject(value)) return null;
  const { status, task, since } = value;
  if (!DESK_STATUSES.includes(status as DeskStatus)) return null;
  if (typeof task !== 'string') return null;
  if (since !== null && typeof since !== 'string') return null;
  return { status: status as DeskStatus, task, since };
}

function parseDesks(value: unknown): Record<Role, Desk> | null {
  if (!isObject(value)) return null;
  const desks = {} as Record<Role, Desk>;
  for (const role of ROLES) {
    const desk = parseDesk(value[role]);
    if (desk === null) return null;
    desks[role] = desk;
  }
  return desks;
}

function parseHandoff(value: unknown): Handoff | null {
  if (!isObject(value)) return null;
  const { from, to, ts, kind } = value;
  if (!isRole(from) || !isRole(to) || typeof ts !== 'string') return null;
  if (kind !== 'delivery' && kind !== 'rework') return null;
  return { from, to, ts, kind };
}

function parseHandoffs(value: unknown): Handoff[] | null {
  if (!Array.isArray(value)) return null;
  const handoffs: Handoff[] = [];
  for (const item of value) {
    const handoff = parseHandoff(item);
    if (handoff === null) return null;
    handoffs.push(handoff);
  }
  return handoffs;
}

function parseState(value: unknown): OfficeState | null {
  if (!isObject(value)) return null;
  const { session, open, lastFinished } = value;
  if (session !== null && typeof session !== 'string') return null;
  if (typeof open !== 'boolean') return null;
  if (lastFinished !== null && !isRole(lastFinished)) return null;

  const desks = parseDesks(value.desks);
  const handoffs = parseHandoffs(value.handoffs);
  if (desks === null || handoffs === null) return null;

  return { session, open, desks, lastFinished, handoffs };
}
