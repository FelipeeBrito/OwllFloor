import { describe, expect, it } from 'vitest';
import type { OfficeEvent } from '../src/domain/events.js';
import type { Role } from '../src/domain/roles.js';
import { summarizeDay } from '../src/domain/timeline.js';

const session = 's1';
const at = (time: string) => `2026-11-16T${time}.000Z`;
const ms = (time: string) => Date.parse(at(time));

const sessionStarted = (time: string): OfficeEvent => ({ v: 1, ts: at(time), session, type: 'session.started' });
const started = (time: string, agent: Role): OfficeEvent => ({
  v: 1,
  ts: at(time),
  session,
  type: 'agent.started',
  agent,
  summary: 'tarefa',
});
const finished = (time: string, agent: Role): OfficeEvent => ({ v: 1, ts: at(time), session, type: 'agent.finished', agent });

describe('summarizeDay', () => {
  it('devolve lista vazia quando não há eventos', () => {
    expect(summarizeDay([])).toEqual([]);
  });

  it('conta um agente em todos os minutos em que ele trabalhou', () => {
    const frames = summarizeDay([
      sessionStarted('10:00:00'),
      started('10:00:10', 'arquiteto'),
      finished('10:02:30', 'arquiteto'),
    ]);

    expect(frames).toEqual([
      { at: ms('10:00:00'), working: 1 },
      { at: ms('10:01:00'), working: 1 }, // sem evento, mas ele continuava trabalhando
      { at: ms('10:02:00'), working: 1 },
    ]);
  });

  it('mostra 2 quando dois agentes se sobrepõem', () => {
    const frames = summarizeDay([
      sessionStarted('10:00:00'),
      started('10:00:10', 'arquiteto'),
      started('10:01:10', 'engenheiro'),
      finished('10:02:10', 'arquiteto'),
      finished('10:03:10', 'engenheiro'),
    ]);

    expect(frames.map((frame) => frame.working)).toEqual([1, 2, 2, 1]);
  });

  it('não cria quadro para intervalo em que ninguém trabalhou', () => {
    const frames = summarizeDay([
      started('10:00:10', 'qa'),
      finished('10:00:40', 'qa'),
      started('10:05:10', 'devops'),
      finished('10:05:40', 'devops'),
    ]);

    expect(frames).toEqual([
      { at: ms('10:00:00'), working: 1 },
      { at: ms('10:05:00'), working: 1 },
    ]);
  });

  it('ignora eventos malformados', () => {
    const valid = [started('10:00:10', 'qa'), finished('10:00:40', 'qa')];
    const withGarbage = [
      null,
      'texto solto',
      { v: 1, ts: at('10:00:20'), session, type: 'agent.started', agent: 'estagiario', summary: 'x' },
      { v: 1, ts: 'ontem', session, type: 'agent.started', agent: 'devops', summary: 'x' },
      valid[0],
      { v: 2, ts: at('10:00:30'), session, type: 'agent.started', agent: 'devops', summary: 'x' },
      valid[1],
    ];

    expect(summarizeDay(withGarbage)).toEqual(summarizeDay(valid));
    expect(summarizeDay(withGarbage)).toEqual([{ at: ms('10:00:00'), working: 1 }]);
  });

  it('respeita o tamanho do intervalo e recusa valores inválidos', () => {
    const events = [started('10:00:10', 'qa'), finished('10:02:30', 'qa')];

    expect(summarizeDay(events, 3_600_000)).toEqual([{ at: ms('10:00:00'), working: 1 }]);
    expect(() => summarizeDay(events, 0)).toThrow(RangeError);
  });
});
