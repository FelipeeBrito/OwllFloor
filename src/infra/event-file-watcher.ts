import { closeSync, existsSync, openSync, readSync, statSync, unwatchFile, watchFile } from 'node:fs';
import { parseEvent, type OfficeEvent } from '../domain/events.js';

export type EventListener = (event: OfficeEvent) => void;

/**
 * Acompanha o arquivo logs/events.ndjson e avisa quem estiver inscrito
 * a cada evento novo (padrão Observer).
 *
 * Usa polling (watchFile) em vez de fs.watch porque funciona igual no
 * Windows, no Mac e no Linux, inclusive quando o arquivo ainda não existe.
 */
export class EventFileWatcher {
  private readonly listeners = new Set<EventListener>();
  private offset = 0;
  private pending = '';
  private running = false;

  constructor(
    private readonly filePath: string,
    private readonly intervalMs = 300,
  ) {}

  /** Inscreve um ouvinte. Devolve a função para cancelar a inscrição. */
  subscribe(listener: EventListener): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  /**
   * Começa a observar.
   * @param fromStart true = lê o histórico já gravado; false = só eventos novos.
   */
  start(fromStart = true): void {
    if (this.running) return;
    this.running = true;
    this.offset = !fromStart && existsSync(this.filePath) ? statSync(this.filePath).size : 0;
    this.readNew();
    watchFile(this.filePath, { interval: this.intervalMs }, () => this.readNew());
  }

  stop(): void {
    if (!this.running) return;
    unwatchFile(this.filePath);
    this.running = false;
  }

  /** Lê só os bytes novos desde a última leitura e emite um evento por linha completa. */
  readNew(): void {
    if (!existsSync(this.filePath)) return;

    const size = statSync(this.filePath).size;
    if (size < this.offset) {
      // O arquivo foi apagado ou recriado: recomeça do início.
      this.offset = 0;
      this.pending = '';
    }
    if (size === this.offset) return;

    const fd = openSync(this.filePath, 'r');
    try {
      const buffer = Buffer.alloc(size - this.offset);
      readSync(fd, buffer, 0, buffer.length, this.offset);
      this.offset = size;
      this.pending += buffer.toString('utf8');
    } finally {
      closeSync(fd);
    }

    // A última parte pode ser uma linha ainda incompleta: guarda para a próxima leitura.
    const lines = this.pending.split('\n');
    this.pending = lines.pop() ?? '';

    for (const line of lines) {
      const event = parseEvent(line);
      if (event) this.emit(event);
    }
  }

  private emit(event: OfficeEvent): void {
    for (const listener of this.listeners) {
      try {
        listener(event);
      } catch (error) {
        // Um ouvinte com defeito não pode impedir os outros de receberem o evento.
        console.error('[OF] erro em um ouvinte de eventos:', error);
      }
    }
  }
}
