import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
// Módulo JS puro (o hook não pode depender de build); o TypeScript infere os tipos via allowJs.
import { mapHookToEvent, normalizeRole } from '../.claude/hooks/emit-event.mjs';
import { parseEvent } from '../src/domain/events.js';

const now = new Date('2026-11-08T12:00:00.000Z');
const task = (event: string, subagent: unknown, tool = 'Task') => ({
  hook_event_name: event,
  session_id: 'abc',
  tool_name: tool,
  tool_input: { subagent_type: subagent, description: 'Revisar login' },
});

describe('normalizeRole', () => {
  it.each([
    ['Segurança', 'seguranca'],
    ['QA', 'qa'],
    ['owllfloor:arquiteto', 'arquiteto'],
    ['general-purpose', null],
    [undefined, null],
  ])('%s → %s', (input, expected) => {
    expect(normalizeRole(input)).toBe(expected);
  });
});

describe('mapHookToEvent', () => {
  it('PreToolUse de subagente vira agent.started', () => {
    expect(mapHookToEvent(task('PreToolUse', 'qa'), now)).toEqual({
      v: 1, ts: now.toISOString(), session: 'abc', type: 'agent.started', agent: 'qa', summary: 'Revisar login',
    });
  });

  it('PostToolUse de subagente vira agent.finished', () => {
    expect(mapHookToEvent(task('PostToolUse', 'devops', 'Agent'), now)).toMatchObject({ type: 'agent.finished', agent: 'devops' });
  });

  it('ignora ferramentas que não são subagentes', () => {
    expect(mapHookToEvent(task('PreToolUse', 'qa', 'Bash'), now)).toBeNull();
  });

  it('ignora subagentes que não são corujas do escritório', () => {
    expect(mapHookToEvent(task('PreToolUse', 'Explore'), now)).toBeNull();
  });

  it('mapeia início e fim de sessão', () => {
    expect(mapHookToEvent({ hook_event_name: 'SessionStart', session_id: 'x' }, now)).toMatchObject({ type: 'session.started' });
    expect(mapHookToEvent({ hook_event_name: 'SessionEnd', session_id: 'x' }, now)).toMatchObject({ type: 'session.ended' });
  });

  it('todo evento gerado respeita o contrato do domínio', () => {
    const event = mapHookToEvent(task('PreToolUse', 'arquiteto'), now);
    expect(parseEvent(JSON.stringify(event))).toEqual(event);
  });
});

describe('script do hook (ponta a ponta)', () => {
  const script = resolve('.claude/hooks/emit-event.mjs');

  it('grava o evento no arquivo indicado', () => {
    const file = join(mkdtempSync(join(tmpdir(), 'of-')), 'events.ndjson');
    execFileSync('node', [script], {
      input: JSON.stringify(task('PreToolUse', 'engenheiro')),
      env: { ...process.env, OF_EVENTS_FILE: file },
    });
    const event = parseEvent(readFileSync(file, 'utf8'));
    expect(event).toMatchObject({ type: 'agent.started', agent: 'engenheiro' });
  });

  it('não quebra o Claude Code com entrada inválida (sai com código 0)', () => {
    const file = join(mkdtempSync(join(tmpdir(), 'of-')), 'events.ndjson');
    expect(() =>
      execFileSync('node', [script], { input: 'isso não é json', env: { ...process.env, OF_EVENTS_FILE: file }, stdio: 'pipe' }),
    ).not.toThrow();
  });
});
