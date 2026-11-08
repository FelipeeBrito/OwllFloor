import { parseServerMessage } from '../../src/domain/protocol.js';
import { byId, renderConnection, renderOffice } from './dom.js';
import { createOfficeGame } from './office/game.js';
import { reconnectDelay, toOfficeView } from './view-model.js';

/**
 * Ponto de entrada da página (o Vite compila este arquivo).
 * Recebe as fotos do escritório pelo WebSocket e manda para dois lugares:
 * o escritório em pixel art (Phaser) e o painel de texto ao lado.
 */

// location.host = mesmo endereço e porta da página; o servidor confere o Origin.
const WS_URL = `ws://${location.host}/ws`;

const office = createOfficeGame(byId('office'));
let attempt = 0;

function connect(): void {
  renderConnection('connecting');
  const socket = new WebSocket(WS_URL);

  socket.addEventListener('open', () => {
    attempt = 0;
    renderConnection('connected');
  });

  socket.addEventListener('message', (message: MessageEvent<unknown>) => {
    if (typeof message.data !== 'string') return;
    const parsed = parseServerMessage(message.data);
    // Mensagem estranha é ignorada; a próxima foto completa corrige a tela.
    if (parsed === null) return;
    office.show(parsed);
    renderOffice(toOfficeView(parsed));
  });

  // 'close' sempre vem depois de 'error', então só reconectamos aqui (evita duas tentativas).
  socket.addEventListener('close', scheduleReconnect);
}

function scheduleReconnect(): void {
  renderConnection('disconnected');
  const delay = reconnectDelay(attempt);
  attempt += 1;
  setTimeout(connect, delay);
}

connect();
