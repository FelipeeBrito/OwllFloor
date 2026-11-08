import { parseServerMessage } from '../../src/domain/protocol.js';
import { renderConnection, renderOffice } from './dom.js';
import { reconnectDelay, toOfficeView } from './view-model.js';

/**
 * Ponto de entrada da página. O servidor compila este arquivo com esbuild
 * quando o navegador pede /app.js.
 */

// location.host = mesmo endereço e porta da página; o servidor confere o Origin.
const WS_URL = `ws://${location.host}/ws`;

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
    if (parsed) renderOffice(toOfficeView(parsed));
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
