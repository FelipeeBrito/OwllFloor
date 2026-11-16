import { readFileSync } from 'node:fs';
import { parseEvent, type OfficeEvent } from '../src/domain/events.js';
import { summarizeDay } from '../src/domain/timeline.js';
import { eventsFilePath } from '../src/infra/paths.js';

/**
 * `npm run replay` — relê o arquivo de eventos e mostra, hora a hora (no
 * horário local), o máximo de corujas trabalhando ao mesmo tempo.
 *
 * Opção: `npm run replay -- caminho/do/arquivo.ndjson` lê outro arquivo.
 */
const BAR_UNIT = '████'; // 4 blocos por coruja trabalhando

const file = process.argv[2] ?? eventsFilePath();

let text: string;
try {
  text = readFileSync(file, 'utf8');
} catch {
  console.error(`Não consegui ler ${file}. Rode "npm run simulate" antes, ou passe outro caminho.`);
  process.exit(1);
}

const events = text
  .split('\n')
  .map(parseEvent)
  .filter((event): event is OfficeEvent => event !== null);

// Quadros de 1 minuto, agrupados pela hora local (o fuso pode não ser de hora cheia).
const maxByHour = new Map<number, number>();
for (const frame of summarizeDay(events)) {
  const hour = new Date(frame.at);
  hour.setMinutes(0, 0, 0);
  const key = hour.getTime();
  maxByHour.set(key, Math.max(maxByHour.get(key) ?? 0, frame.working));
}

if (maxByHour.size === 0) {
  console.log(`Nenhum evento válido em ${file}.`);
  process.exit(0);
}

const two = (n: number) => String(n).padStart(2, '0');

console.log(`Replay do expediente — ${file}`);
console.log(`${events.length} eventos · máximo de corujas trabalhando ao mesmo tempo, por hora\n`);

for (const [key, working] of [...maxByHour.entries()].sort(([a], [b]) => a - b)) {
  const d = new Date(key);
  const label = `${two(d.getDate())}/${two(d.getMonth() + 1)} ${two(d.getHours())}h`;
  console.log(`${label}  ${working}  ${BAR_UNIT.repeat(working)}`);
}
