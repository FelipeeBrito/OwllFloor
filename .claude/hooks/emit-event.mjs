#!/usr/bin/env node
/**
 * Hook do Claude Code → evento do OwllFloor.
 *
 * O Claude Code chama este script em momentos-chave (configurado em
 * .claude/settings.json) e envia um JSON pela entrada padrão (stdin).
 * O script traduz esse JSON para o formato de evento do OF e acrescenta
 * uma linha em logs/events.ndjson.
 *
 * Regras importantes:
 * - Sem dependências externas: roda com o Node puro, em qualquer máquina.
 * - Nunca bloqueia o Claude Code: em qualquer erro, sai com código 0.
 */
import { appendFileSync, mkdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROLES = ['arquiteto', 'engenheiro', 'seguranca', 'qa', 'devops'];

/** Nome da ferramenta que o Claude Code usa para chamar subagentes. */
const SUBAGENT_TOOLS = new Set(['Task', 'Agent']);

/** "Segurança", "SEGURANCA" e "owllfloor:seguranca" viram "seguranca". */
export function normalizeRole(value) {
  if (typeof value !== 'string') return null;
  const name = value
    .split(':')
    .pop()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .trim();
  return ROLES.includes(name) ? name : null;
}

/**
 * Função pura: recebe o JSON do hook e devolve o evento do OF,
 * ou null quando aquele momento não interessa ao escritório.
 */
export function mapHookToEvent(input, now = new Date()) {
  if (!input || typeof input !== 'object') return null;

  const base = { v: 1, ts: now.toISOString(), session: String(input.session_id ?? 'desconhecida') };

  switch (input.hook_event_name) {
    case 'SessionStart':
      return { ...base, type: 'session.started' };
    case 'SessionEnd':
      return { ...base, type: 'session.ended' };
    case 'PreToolUse':
    case 'PostToolUse': {
      if (!SUBAGENT_TOOLS.has(input.tool_name)) return null;
      const agent = normalizeRole(input.tool_input?.subagent_type);
      if (!agent) return null; // subagente que não é uma coruja do escritório
      if (input.hook_event_name === 'PostToolUse') return { ...base, type: 'agent.finished', agent };
      const summary = String(input.tool_input?.description ?? '').slice(0, 120);
      return { ...base, type: 'agent.started', agent, summary };
    }
    default:
      return null;
  }
}

function eventsFile() {
  if (process.env.OF_EVENTS_FILE) return process.env.OF_EVENTS_FILE;
  const projectDir = process.env.CLAUDE_PROJECT_DIR ?? process.cwd();
  return resolve(projectDir, 'logs', 'events.ndjson');
}

function readStdin() {
  return new Promise((resolveText) => {
    let text = '';
    process.stdin.setEncoding('utf8');
    process.stdin.on('data', (chunk) => (text += chunk));
    process.stdin.on('end', () => resolveText(text));
    process.stdin.on('error', () => resolveText(text));
  });
}

async function main() {
  try {
    const input = JSON.parse(await readStdin());
    const event = mapHookToEvent(input);
    if (!event) return;
    const file = eventsFile();
    mkdirSync(dirname(file), { recursive: true });
    appendFileSync(file, JSON.stringify(event) + '\n', 'utf8');
  } catch (error) {
    // Falha silenciosa por design: o escritório é só visual,
    // então nunca deve atrapalhar o trabalho do Claude Code.
    process.stderr.write(`[OF] hook ignorado: ${error?.message ?? error}\n`);
  }
}

// Só executa quando chamado direto (não quando importado pelos testes).
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  await main();
  process.exit(0);
}
