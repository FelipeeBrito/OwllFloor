import { initialOfficeState, officeReducer } from '../domain/office.js';
import { EventFileWatcher } from '../infra/event-file-watcher.js';
import { eventsFilePath } from '../infra/paths.js';
import { renderOffice } from './render.js';

/**
 * `npm run watch` — mostra o escritório no terminal, atualizando
 * a cada evento que os hooks do Claude Code gravarem.
 */
const file = eventsFilePath();
const watcher = new EventFileWatcher(file);
let state = initialOfficeState();

function draw(): void {
  console.clear();
  console.log(renderOffice(state));
  console.log(`\nLendo: ${file}\nCtrl+C para sair.`);
}

watcher.subscribe((event) => {
  state = officeReducer(state, event);
  draw();
});

draw();
watcher.start(true);

process.on('SIGINT', () => {
  watcher.stop();
  process.exit(0);
});
