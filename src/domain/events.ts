import { isRole, type Role } from './roles.js';

/**
 * Contrato dos eventos do OF.
 *
 * Os hooks do Claude Code gravam uma linha JSON por evento em
 * logs/events.ndjson (formato NDJSON). Tudo o que o escritório mostra
 * vem destes eventos — nada é inventado pela interface.
 */
export type OfficeEvent =
  | { v: 1; ts: string; session: string; type: 'session.started' }
  | { v: 1; ts: string; session: string; type: 'session.ended' }
  | { v: 1; ts: string; session: string; type: 'agent.started'; agent: Role; summary: string }
  | { v: 1; ts: string; session: string; type: 'agent.finished'; agent: Role };

export type OfficeEventType = OfficeEvent['type'];

/**
 * Converte uma linha de texto em evento válido.
 * Retorna null para linhas vazias ou inválidas, em vez de lançar erro:
 * um evento corrompido não pode derrubar o escritório inteiro.
 */
export function parseEvent(line: string): OfficeEvent | null {
  const text = line.trim();
  if (text === '') return null;

  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch {
    return null;
  }
  if (typeof raw !== 'object' || raw === null) return null;

  const e = raw as Record<string, unknown>;
  if (e.v !== 1 || typeof e.ts !== 'string' || typeof e.session !== 'string') return null;

  const base = { v: 1 as const, ts: e.ts, session: e.session };

  switch (e.type) {
    case 'session.started':
    case 'session.ended':
      return { ...base, type: e.type };
    case 'agent.started':
      if (!isRole(e.agent)) return null;
      return {
        ...base,
        type: 'agent.started',
        agent: e.agent,
        summary: typeof e.summary === 'string' ? e.summary : '',
      };
    case 'agent.finished':
      if (!isRole(e.agent)) return null;
      return { ...base, type: 'agent.finished', agent: e.agent };
    default:
      return null;
  }
}
