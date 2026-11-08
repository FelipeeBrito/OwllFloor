import { describe, expect, it } from 'vitest';
import type { OfficeEvent } from '../src/domain/events.js';
import { initialOfficeState, officeReducer } from '../src/domain/office.js';
import { createSnapshotMessage, parseServerMessage, PROTOCOL_VERSION } from '../src/domain/protocol.js';

const started: OfficeEvent = {
  v: 1,
  ts: '2026-11-08T12:00:00.000Z',
  session: 's1',
  type: 'agent.started',
  agent: 'arquiteto',
  summary: 'plano',
};

describe('protocolo office.snapshot', () => {
  it('cria a mensagem com tipo e versão', () => {
    const state = initialOfficeState();
    const message = createSnapshotMessage(state, null);
    expect(message).toEqual({ type: 'office.snapshot', v: PROTOCOL_VERSION, state, event: null });
    expect(PROTOCOL_VERSION).toBe(1);
  });

  it('faz ida e volta (serializa e lê de novo) sem perder nada', () => {
    const state = officeReducer(initialOfficeState(), started);
    const message = createSnapshotMessage(state, started);
    expect(parseServerMessage(JSON.stringify(message))).toEqual(message);
  });

  it('aceita a foto inicial com event null', () => {
    const message = createSnapshotMessage(initialOfficeState(), null);
    expect(parseServerMessage(JSON.stringify(message))?.event).toBeNull();
  });

  it('preserva handoffs válidos', () => {
    let state = initialOfficeState();
    state = officeReducer(state, { ...started, type: 'agent.finished', agent: 'qa' } as OfficeEvent);
    state = officeReducer(state, { ...started, agent: 'engenheiro' });
    const parsed = parseServerMessage(JSON.stringify(createSnapshotMessage(state, null)));
    expect(parsed?.state.handoffs).toEqual([
      { from: 'qa', to: 'engenheiro', ts: started.ts, kind: 'rework' },
    ]);
  });

  it.each([
    ['texto que não é JSON', 'olá'],
    ['JSON que não é objeto', '[1,2]'],
    ['null', 'null'],
    ['string vazia', ''],
  ])('devolve null para %s', (_label, text) => {
    expect(parseServerMessage(text)).toBeNull();
  });

  it('devolve null para versão ou tipo desconhecidos', () => {
    const base = createSnapshotMessage(initialOfficeState(), null);
    expect(parseServerMessage(JSON.stringify({ ...base, v: 2 }))).toBeNull();
    expect(parseServerMessage(JSON.stringify({ ...base, type: 'office.delta' }))).toBeNull();
  });

  it('devolve null para estado malformado', () => {
    const base = createSnapshotMessage(initialOfficeState(), null);
    const broken = [
      { ...base, state: null },
      { ...base, state: { ...base.state, open: 'sim' } },
      { ...base, state: { ...base.state, desks: {} } },
      { ...base, state: { ...base.state, handoffs: [{ from: 'x', to: 'qa', ts: 't', kind: 'delivery' }] } },
      { ...base, state: { ...base.state, lastFinished: 'chefe' } },
    ];
    for (const message of broken) expect(parseServerMessage(JSON.stringify(message))).toBeNull();
  });

  it('devolve null para evento inválido', () => {
    const base = createSnapshotMessage(initialOfficeState(), null);
    expect(parseServerMessage(JSON.stringify({ ...base, event: { type: 'hack' } }))).toBeNull();
    expect(parseServerMessage(JSON.stringify({ ...base, event: 'texto' }))).toBeNull();
  });
});
