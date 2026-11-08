import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import type { OfficeEvent } from '../src/domain/events.js';
import { initialOfficeState, replay } from '../src/domain/office.js';
import { createSnapshotMessage } from '../src/domain/protocol.js';
import {
  connectionLabel,
  describeEvent,
  formatTime,
  reconnectDelay,
  toOfficeView,
  VISIBLE_HANDOFFS,
} from '../web/src/view-model.js';

// formatTime usa a hora LOCAL, que depende do fuso da máquina. Fixamos o fuso
// do arquivo inteiro em UTC para os testes ficarem iguais em qualquer máquina;
// o Node relê process.env.TZ em tempo de execução (inclusive no Windows).
// Isso depende do pool padrão `forks` do Vitest: cada arquivo roda num processo
// próprio, então mudar TZ aqui não afeta outros arquivos. Com o pool `threads`
// o TZ é compartilhado entre workers e estes testes deixariam de ser confiáveis.
const originalTz = process.env.TZ;
beforeAll(() => {
  process.env.TZ = 'UTC';
});
afterAll(() => {
  // Devolve o fuso original para não vazar para outros testes.
  if (originalTz === undefined) delete process.env.TZ;
  else process.env.TZ = originalTz;
});

const ts = '2026-11-08T12:34:56.000Z';
const base = { v: 1 as const, ts, session: 'abcdef123456' };
const start = (agent: 'arquiteto' | 'engenheiro' | 'qa', summary = ''): OfficeEvent => ({
  ...base,
  type: 'agent.started',
  agent,
  summary,
});
const finish = (agent: 'arquiteto' | 'engenheiro' | 'qa'): OfficeEvent => ({ ...base, type: 'agent.finished', agent });

describe('toOfficeView', () => {
  it('mostra as 5 mesas livres no estado inicial', () => {
    const view = toOfficeView(createSnapshotMessage(initialOfficeState(), null));
    expect(view.title).toBe('expediente fechado');
    expect(view.desks.map((d) => d.label)).toEqual(['Arquiteto', 'Engenheiro', 'Segurança', 'QA', 'DevOps']);
    expect(view.desks.every((d) => d.status === 'idle' && d.statusLabel === 'livre')).toBe(true);
    expect(view.handoffs).toEqual([]);
    expect(view.lastEvent).toBeNull();
  });

  it('mostra sessão, tarefa e status de quem está trabalhando', () => {
    const event = start('arquiteto', 'planejar <script>alert(1)</script>');
    const state = replay([{ ...base, type: 'session.started' }, event]);
    const view = toOfficeView(createSnapshotMessage(state, event));
    expect(view.title).toBe('expediente aberto (sessão abcdef12)');
    const arquiteto = view.desks[0];
    expect(arquiteto?.status).toBe('working');
    expect(arquiteto?.statusLabel).toBe('trabalhando');
    // O texto vai cru para a tela; quem protege é o textContent no dom.ts.
    expect(arquiteto?.task).toBe('planejar <script>alert(1)</script>');
    expect(view.lastEvent).toBe('Arquiteto começou a trabalhar');
  });

  it('lista entregas da mais recente para a mais antiga, marcando retrabalho', () => {
    const state = replay([finish('arquiteto'), start('engenheiro'), finish('qa'), start('engenheiro')]);
    const view = toOfficeView(createSnapshotMessage(state, null));
    expect(view.handoffs).toEqual([
      { kind: 'rework', text: 'QA devolveu para Engenheiro corrigir', time: '12:34:56' },
      { kind: 'delivery', text: 'Arquiteto entregou para Engenheiro', time: '12:34:56' },
    ]);
  });

  it(`limita a lista às últimas ${VISIBLE_HANDOFFS} entregas`, () => {
    const events: OfficeEvent[] = [];
    for (let i = 0; i < 15; i++) events.push(finish('arquiteto'), start('engenheiro'));
    const view = toOfficeView(createSnapshotMessage(replay(events), null));
    expect(view.handoffs).toHaveLength(VISIBLE_HANDOFFS);
  });
});

describe('describeEvent', () => {
  it('descreve cada tipo de evento', () => {
    expect(describeEvent({ ...base, type: 'session.started' })).toBe('Expediente começou');
    expect(describeEvent({ ...base, type: 'session.ended' })).toBe('Expediente encerrado');
    expect(describeEvent(finish('qa'))).toBe('QA terminou');
  });
});

describe('reconnectDelay', () => {
  it('cresce 1s, 2s, 4s e para em 5s', () => {
    expect([0, 1, 2, 3, 4, 10].map(reconnectDelay)).toEqual([1000, 2000, 4000, 5000, 5000, 5000]);
  });

  it('trata tentativa negativa como a primeira', () => {
    expect(reconnectDelay(-3)).toBe(1000);
  });
});

describe('connectionLabel e formatTime', () => {
  it('rotula os estados da conexão', () => {
    expect(connectionLabel('connected')).toBe('conectado');
    expect(connectionLabel('disconnected')).toMatch(/^desconectado/);
    expect(connectionLabel('connecting')).toMatch(/^conectando/);
  });

  it('formata a hora e tolera timestamp inválido', () => {
    expect(formatTime(ts)).toBe('12:34:56');
    expect(formatTime('ontem')).toBe('');
    expect(formatTime('')).toBe('');
  });
});

describe('formatTime no fuso local do navegador', () => {
  const deliveredAt = '2026-11-08T17:36:12.000Z';

  afterEach(() => {
    // Volta ao fuso fixo do arquivo, para um teste não contaminar o outro.
    process.env.TZ = 'UTC';
  });

  it('converte UTC para America/Sao_Paulo (UTC-3)', () => {
    process.env.TZ = 'America/Sao_Paulo';
    expect(formatTime(deliveredAt)).toBe('14:36:12');
  });

  it('converte UTC para Asia/Tokyo (UTC+9), virando o dia', () => {
    process.env.TZ = 'Asia/Tokyo';
    expect(formatTime(deliveredAt)).toBe('02:36:12');
  });

  it('usa o fuso local também na lista de entregas', () => {
    process.env.TZ = 'America/Sao_Paulo';
    const at = { v: 1 as const, ts: deliveredAt, session: 'abcdef123456' };
    const state = replay([
      { ...at, type: 'agent.finished', agent: 'arquiteto' },
      { ...at, type: 'agent.started', agent: 'engenheiro', summary: '' },
    ]);
    expect(toOfficeView(createSnapshotMessage(state, null)).handoffs[0]?.time).toBe('14:36:12');
  });

  it('continua devolvendo texto vazio para timestamp inválido', () => {
    process.env.TZ = 'America/Sao_Paulo';
    expect(formatTime('ontem')).toBe('');
    expect(formatTime('2026-13-45T99:99:99Z')).toBe('');
  });

  it('rejeita textos que o Date aceitaria mas não são data e hora completas', () => {
    expect(formatTime('1')).toBe('');
    expect(formatTime('2026-11-08')).toBe('');
  });

  it('em São Paulo não mostra mais a hora UTC copiada do texto', () => {
    process.env.TZ = 'America/Sao_Paulo';
    expect(formatTime(deliveredAt)).not.toBe('17:36:12');
  });

  it('no fuso original da máquina bate com o relógio local do Date', () => {
    // Usa o fuso de quem roda os testes, sem forçar nenhum.
    if (originalTz === undefined) delete process.env.TZ;
    else process.env.TZ = originalTz;
    const date = new Date(deliveredAt);
    const expected = [date.getHours(), date.getMinutes(), date.getSeconds()]
      .map((n) => String(n).padStart(2, '0'))
      .join(':');
    expect(formatTime(deliveredAt)).toBe(expected);
  });
});
