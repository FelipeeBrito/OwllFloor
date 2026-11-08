import type { Desk, Handoff, OfficeState } from '../domain/office.js';
import { ROLES, ROLE_INFO } from '../domain/roles.js';

/**
 * Desenha o escritório em texto. É uma função pura (estado → texto),
 * então pode ser testada sem terminal. A versão em pixel art (Phaser)
 * vai consumir o mesmo OfficeState.
 */
const STATUS_ICON: Record<Desk['status'], string> = {
  idle: '💤 livre     ',
  working: '⌨️  trabalhando',
  done: '✅ entregou  ',
};

function describeHandoff(h: Handoff): string {
  const from = ROLE_INFO[h.from].label;
  const to = ROLE_INFO[h.to].label;
  return h.kind === 'rework'
    ? `🔁 ${from} devolveu para ${to} corrigir`
    : `📄 ${from} levantou e entregou para ${to}`;
}

export function renderOffice(state: OfficeState): string {
  const lines: string[] = [];
  const status = state.open ? 'expediente aberto' : 'expediente fechado';
  lines.push(`🦉 OwllFloor — ${status}${state.session ? ` (sessão ${state.session.slice(0, 8)})` : ''}`);
  lines.push('─'.repeat(64));

  for (const role of ROLES) {
    const desk = state.desks[role];
    const name = `🦉 ${ROLE_INFO[role].label}`.padEnd(16);
    const task = desk.task ? ` — ${desk.task}` : '';
    lines.push(`${name}${STATUS_ICON[desk.status]}${task}`);
  }

  lines.push('─'.repeat(64));
  const recent = state.handoffs.slice(-5);
  if (recent.length === 0) {
    lines.push('Nenhuma entrega entre corujas ainda.');
  } else {
    lines.push('Últimas entregas:');
    for (const h of recent) lines.push(`  ${describeHandoff(h)}`);
  }
  return lines.join('\n');
}
