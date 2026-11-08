import { describe, expect, it } from 'vitest';
import { parseEvent } from '../src/domain/events.js';

const base = { v: 1, ts: '2026-11-08T12:00:00.000Z', session: 's1' };

describe('parseEvent', () => {
  it('aceita um agent.started válido', () => {
    const line = JSON.stringify({ ...base, type: 'agent.started', agent: 'qa', summary: 'Validar' });
    expect(parseEvent(line)).toEqual({ ...base, type: 'agent.started', agent: 'qa', summary: 'Validar' });
  });

  it('usa resumo vazio quando o summary não vem', () => {
    const line = JSON.stringify({ ...base, type: 'agent.started', agent: 'qa' });
    expect(parseEvent(line)).toMatchObject({ summary: '' });
  });

  it.each([
    ['linha vazia', ''],
    ['JSON quebrado', '{"v":1,'],
    ['tipo desconhecido', JSON.stringify({ ...base, type: 'cafe.pausa' })],
    ['papel desconhecido', JSON.stringify({ ...base, type: 'agent.finished', agent: 'estagiario' })],
    ['versão errada', JSON.stringify({ ...base, v: 2, type: 'session.started' })],
    ['não é objeto', '42'],
  ])('ignora %s', (_name, line) => {
    expect(parseEvent(line)).toBeNull();
  });
});
