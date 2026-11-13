import { appendFileSync, mkdirSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';
import { randomUUID } from 'node:crypto';
import { playSampleSession } from '../src/demo/sample-session.js';
import { eventsFilePath } from '../src/infra/paths.js';

/**
 * `npm run simulate` — grava um expediente de exemplo em logs/events.ndjson,
 * no mesmo formato dos hooks. Serve para testar o escritório sem gastar
 * a cota do Claude. Inclui uma reprovação do QA para mostrar o retrabalho.
 *
 * Opção: `npm run simulate -- --fast` grava tudo de uma vez, sem pausas.
 */
const fast = process.argv.includes('--fast');
const file = eventsFilePath();

mkdirSync(dirname(file), { recursive: true });
writeFileSync(file, '', 'utf8'); // começa um expediente limpo

await playSampleSession({
  session: randomUUID(),
  delayMs: fast ? 0 : 1500,
  write: (event) => {
    appendFileSync(file, JSON.stringify(event) + '\n', 'utf8');
    console.log(`→ ${event.type}${'agent' in event ? ` (${event.agent})` : ''}`);
  },
});

console.log(`\nExpediente simulado gravado em ${file}`);
