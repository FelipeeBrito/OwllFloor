import { connectionLabel, type ConnectionStatus, type DeskView, type HandoffView, type OfficeView } from './view-model.js';

/**
 * Única parte da página que mexe no DOM.
 *
 * Regra de segurança (ADR 0001): o texto das tarefas vem de prompts e pode conter
 * qualquer coisa, inclusive "<script>". Por isso usamos SÓ textContent,
 * createElement e dataset — nunca innerHTML, insertAdjacentHTML ou estilo inline.
 */

function byId(id: string): HTMLElement {
  const element = document.getElementById(id);
  if (!element) throw new Error(`Elemento #${id} não encontrado no index.html`);
  return element;
}

function element(tag: string, className: string, text?: string): HTMLElement {
  const el = document.createElement(tag);
  el.className = className;
  if (text !== undefined) el.textContent = text;
  return el;
}

export function renderConnection(status: ConnectionStatus): void {
  const indicator = byId('connection');
  indicator.dataset.status = status;
  indicator.textContent = connectionLabel(status);
}

function deskCard(desk: DeskView): HTMLElement {
  const card = element('li', 'desk');
  card.dataset.status = desk.status;
  card.dataset.role = desk.role;
  card.append(
    element('h2', 'desk-name', desk.label),
    element('p', 'desk-accessory', desk.accessory),
    element('p', 'desk-status', desk.statusLabel),
    element('p', 'desk-task', desk.task || '—'),
  );
  return card;
}

function handoffItem(handoff: HandoffView): HTMLElement {
  const item = element('li', 'handoff');
  item.dataset.kind = handoff.kind;
  item.append(element('time', 'handoff-time', handoff.time), element('span', 'handoff-text', handoff.text));
  return item;
}

export function renderOffice(view: OfficeView): void {
  byId('office-title').textContent = view.title;
  byId('last-event').textContent = view.lastEvent ?? '';
  byId('desks').replaceChildren(...view.desks.map(deskCard));

  const handoffs = byId('handoffs');
  if (view.handoffs.length === 0) {
    handoffs.replaceChildren(element('li', 'handoff empty', 'Nenhuma entrega entre corujas ainda.'));
  } else {
    handoffs.replaceChildren(...view.handoffs.map(handoffItem));
  }
}
