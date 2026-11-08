import { describe, expect, it } from 'vitest';
import type { OfficeEvent } from '../src/domain/events.js';
import { HANDOFF_HISTORY_LIMIT, initialOfficeState, officeReducer, replay } from '../src/domain/office.js';
import type { Role } from '../src/domain/roles.js';

const session = 's1';
const ts = '2026-11-08T12:00:00.000Z';
const start = (agent: Role, summary = 'tarefa'): OfficeEvent => ({ v: 1, ts, session, type: 'agent.started', agent, summary });
const finish = (agent: Role): OfficeEvent => ({ v: 1, ts, session, type: 'agent.finished', agent });
const open: OfficeEvent = { v: 1, ts, session, type: 'session.started' };

describe('officeReducer', () => {
  it('começa com todas as mesas livres e o expediente fechado', () => {
    const state = initialOfficeState();
    expect(state.open).toBe(false);
    expect(Object.values(state.desks).every((d) => d.status === 'idle')).toBe(true);
  });

  it('coloca a coruja para trabalhar com a tarefa no balão', () => {
    const state = replay([open, start('arquiteto', 'Planejar login')]);
    expect(state.desks.arquiteto).toMatchObject({ status: 'working', task: 'Planejar login' });
  });

  it('registra a entrega quando a próxima coruja começa', () => {
    const state = replay([open, start('arquiteto'), finish('arquiteto'), start('engenheiro')]);
    expect(state.desks.arquiteto.status).toBe('done');
    expect(state.handoffs).toEqual([{ from: 'arquiteto', to: 'engenheiro', ts, kind: 'delivery' }]);
  });

  it('marca como retrabalho quando o QA devolve para o Engenheiro', () => {
    const state = replay([open, start('qa'), finish('qa'), start('engenheiro')]);
    expect(state.handoffs.at(-1)?.kind).toBe('rework');
  });

  it('não cria entrega quando a mesma coruja recomeça', () => {
    const state = replay([open, start('qa'), finish('qa'), start('qa')]);
    expect(state.handoffs).toHaveLength(0);
  });

  it('não altera o estado anterior (função pura)', () => {
    const before = initialOfficeState();
    const snapshot = structuredClone(before);
    officeReducer(before, start('devops'));
    expect(before).toEqual(snapshot);
  });

  it('um novo expediente limpa as mesas', () => {
    const state = replay([open, start('qa'), finish('qa'), { ...open, session: 's2' }]);
    expect(state.session).toBe('s2');
    expect(state.desks.qa.status).toBe('idle');
    expect(state.lastFinished).toBeNull();
  });

  it('limita o histórico de entregas', () => {
    const events: OfficeEvent[] = [open];
    for (let i = 0; i < HANDOFF_HISTORY_LIMIT + 10; i++) {
      events.push(start('arquiteto'), finish('arquiteto'), start('engenheiro'), finish('engenheiro'));
    }
    expect(replay(events).handoffs).toHaveLength(HANDOFF_HISTORY_LIMIT);
  });
});
