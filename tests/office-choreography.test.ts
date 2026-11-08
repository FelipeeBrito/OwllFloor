import { describe, expect, it } from 'vitest';
import type { OfficeEvent } from '../src/domain/events.js';
import { HANDOFF_HISTORY_LIMIT, initialOfficeState, officeReducer, replay, type OfficeState } from '../src/domain/office.js';
import { createSnapshotMessage } from '../src/domain/protocol.js';
import type { Role } from '../src/domain/roles.js';
import {
  bubbleText,
  isReworking,
  MAX_PENDING_ACTIONS,
  newHandoff,
  planActions,
  reworkCount,
  shouldSkipAhead,
} from '../web/src/office/choreography.js';

const ts = '2026-11-08T12:00:00.000Z';
const base = { v: 1 as const, ts, session: 's1' };
const started = (agent: Role, summary = 'tarefa'): OfficeEvent => ({ ...base, type: 'agent.started', agent, summary });
const finished = (agent: Role): OfficeEvent => ({ ...base, type: 'agent.finished', agent });
const sessionStarted: OfficeEvent = { ...base, type: 'session.started' };

/** Aplica o evento e devolve as ações planejadas, como a página faz. */
function step(prev: OfficeState, event: OfficeEvent) {
  const next = officeReducer(prev, event);
  return { next, actions: planActions(prev, createSnapshotMessage(next, event)) };
}

describe('planActions', () => {
  it('primeira foto (ou reconexão) monta a cena do zero, sem animar', () => {
    const state = replay([sessionStarted, started('arquiteto')]);
    expect(planActions(null, createSnapshotMessage(state, null))).toEqual([{ type: 'reset', state }]);
    expect(planActions(state, createSnapshotMessage(state, null))).toEqual([{ type: 'reset', state }]);
  });

  it('novo expediente também remonta a cena', () => {
    const prev = replay([sessionStarted, started('qa')]);
    const { next, actions } = step(prev, { ...base, session: 's2', type: 'session.started' });
    expect(actions).toEqual([{ type: 'reset', state: next }]);
  });

  it('agente começando sem entrega anterior: só senta e digita', () => {
    const { actions } = step(replay([sessionStarted]), started('arquiteto', 'planejar login'));
    expect(actions).toEqual([{ type: 'sit', role: 'arquiteto', task: 'planejar login', rework: false }]);
  });

  it('agente terminando: levanta', () => {
    const { actions } = step(replay([sessionStarted, started('arquiteto')]), finished('arquiteto'));
    expect(actions).toEqual([{ type: 'standUp', role: 'arquiteto' }]);
  });

  it('entrega normal: quem terminou leva o papel, depois o próximo senta', () => {
    const prev = replay([sessionStarted, started('arquiteto'), finished('arquiteto')]);
    const { actions } = step(prev, started('engenheiro', 'implementar'));
    expect(actions).toEqual([
      { type: 'deliver', from: 'arquiteto', to: 'engenheiro', kind: 'delivery' },
      { type: 'sit', role: 'engenheiro', task: 'implementar', rework: false },
    ]);
  });

  it('retrabalho: QA devolve ao Engenheiro, com destaque no papel e no balão', () => {
    const prev = replay([sessionStarted, started('qa'), finished('qa')]);
    const { actions } = step(prev, started('engenheiro', 'corrigir'));
    expect(actions).toEqual([
      { type: 'deliver', from: 'qa', to: 'engenheiro', kind: 'rework' },
      { type: 'sit', role: 'engenheiro', task: 'corrigir', rework: true },
    ]);
  });

  it('quem já está sentado e recebe outra tarefa só troca o balão', () => {
    const prev = replay([sessionStarted, started('engenheiro', 'a')]);
    const { actions } = step(prev, started('engenheiro', 'b'));
    expect(actions).toEqual([{ type: 'retask', role: 'engenheiro', task: 'b' }]);
  });

  it('fim do expediente apaga as luzes', () => {
    const { actions } = step(replay([sessionStarted]), { ...base, type: 'session.ended' });
    expect(actions).toEqual([{ type: 'lights', open: false }]);
  });

  it('expediente completo do simulador gera a sequência esperada', () => {
    const flow: Role[] = ['arquiteto', 'engenheiro', 'seguranca', 'qa', 'engenheiro'];
    let state = replay([sessionStarted]);
    const types: string[] = [];
    for (const role of flow) {
      for (const event of [started(role), finished(role)]) {
        const result = step(state, event);
        state = result.next;
        types.push(...result.actions.map((a) => (a.type === 'deliver' ? `deliver:${a.kind}` : a.type)));
      }
    }
    expect(types).toEqual([
      'sit', 'standUp',
      'deliver:delivery', 'sit', 'standUp',
      'deliver:delivery', 'sit', 'standUp',
      'deliver:delivery', 'sit', 'standUp',
      'deliver:rework', 'sit', 'standUp',
    ]);
  });
});

describe('newHandoff', () => {
  it('detecta entrega nova mesmo com o histórico cheio (tamanho não muda)', () => {
    const events: OfficeEvent[] = [];
    for (let i = 0; i < HANDOFF_HISTORY_LIMIT + 2; i++) {
      events.push(finished('arquiteto'), { ...started('engenheiro'), ts: `2026-11-08T12:00:${String(i % 60).padStart(2, '0')}.000Z` });
    }
    const prev = replay(events);
    expect(prev.handoffs).toHaveLength(HANDOFF_HISTORY_LIMIT);
    const next = replay([...events, finished('engenheiro'), { ...started('seguranca'), ts: '2026-11-08T13:00:00.000Z' }]);
    expect(next.handoffs).toHaveLength(HANDOFF_HISTORY_LIMIT);
    expect(newHandoff(prev, next)).toMatchObject({ from: 'engenheiro', to: 'seguranca' });
  });

  it('devolve null quando não há entrega nova', () => {
    const state = replay([finished('arquiteto'), started('engenheiro')]);
    expect(newHandoff(state, state)).toBeNull();
    expect(newHandoff(initialOfficeState(), initialOfficeState())).toBeNull();
  });
});

describe('isReworking', () => {
  it('só é verdade para quem recebeu a devolução e ainda está trabalhando', () => {
    const reworking = replay([started('qa'), finished('qa'), started('engenheiro')]);
    expect(isReworking(reworking, 'engenheiro')).toBe(true);
    expect(isReworking(reworking, 'qa')).toBe(false);
    expect(isReworking(replay([started('qa'), finished('qa'), started('engenheiro'), finished('engenheiro')]), 'engenheiro')).toBe(false);
    expect(isReworking(replay([started('arquiteto'), finished('arquiteto'), started('engenheiro')]), 'engenheiro')).toBe(false);
  });
});

describe('reworkCount', () => {
  it('conta só as devoluções do QA', () => {
    const state = replay([finished('arquiteto'), started('engenheiro'), finished('qa'), started('engenheiro')]);
    expect(reworkCount(state)).toBe(1);
    expect(reworkCount(initialOfficeState())).toBe(0);
  });
});

describe('shouldSkipAhead', () => {
  it(`pula as animações quando a fila passa de ${MAX_PENDING_ACTIONS}`, () => {
    expect(shouldSkipAhead(MAX_PENDING_ACTIONS)).toBe(false);
    expect(shouldSkipAhead(MAX_PENDING_ACTIONS + 1)).toBe(true);
  });
});

describe('bubbleText', () => {
  it('corta textos longos com reticências e junta espaços', () => {
    expect(bubbleText('  planejar\n\n a   tela  ')).toBe('planejar a tela');
    const long = bubbleText('x'.repeat(100), 20);
    expect(long).toHaveLength(20);
    expect(long.endsWith('…')).toBe(true);
  });

  it('mostra "trabalhando…" quando não há resumo', () => {
    expect(bubbleText('   ')).toBe('trabalhando…');
  });
});
