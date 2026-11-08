import { appendFileSync, mkdirSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';
import { randomUUID } from 'node:crypto';
import type { OfficeEvent } from '../src/domain/events.js';
import type { Role } from '../src/domain/roles.js';
import { eventsFilePath } from '../src/infra/paths.js';

/**
 * `npm run simulate` — grava um expediente de exemplo em logs/events.ndjson,
 * no mesmo formato dos hooks. Serve para testar o escritório sem gastar
 * a cota do Claude. Inclui uma reprovação do QA para mostrar o retrabalho.
 *
 * Opção: `npm run simulate -- --fast` grava tudo de uma vez, sem pausas.
 */
type Step = [Role, string];

const SCRIPT: Step[] = [
  ['arquiteto', 'Planejar a tela de login'],
  ['engenheiro', 'Implementar formulário e validação'],
  ['seguranca', 'Revisar tratamento de senha'],
  ['qa', 'Validar fluxo de login'],
  ['engenheiro', 'Corrigir mensagem de erro apontada pelo QA'],
  ['seguranca', 'Revisar correção'],
  ['qa', 'Validar novamente'],
  ['devops', 'Atualizar README e preparar commit'],
];

const fast = process.argv.includes('--fast');
const delayMs = fast ? 0 : 1500;
const file = eventsFilePath();
const session = randomUUID();

const sleep = (ms: number) => new Promise((done) => setTimeout(done, ms));

function write(event: OfficeEvent): void {
  appendFileSync(file, JSON.stringify(event) + '\n', 'utf8');
  console.log(`→ ${event.type}${'agent' in event ? ` (${event.agent})` : ''}`);
}

const now = () => new Date().toISOString();

mkdirSync(dirname(file), { recursive: true });
writeFileSync(file, '', 'utf8'); // começa um expediente limpo

write({ v: 1, ts: now(), session, type: 'session.started' });
for (const [agent, summary] of SCRIPT) {
  await sleep(delayMs);
  write({ v: 1, ts: now(), session, type: 'agent.started', agent, summary });
  await sleep(delayMs * 2);
  write({ v: 1, ts: now(), session, type: 'agent.finished', agent });
}
await sleep(delayMs);
write({ v: 1, ts: now(), session, type: 'session.ended' });

console.log(`\nExpediente simulado gravado em ${file}`);
