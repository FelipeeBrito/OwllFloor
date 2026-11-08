import type { OfficeEvent } from '../domain/events.js';
import { initialOfficeState, officeReducer, type OfficeState } from '../domain/office.js';
import { createSnapshotMessage } from '../domain/protocol.js';

/**
 * O mínimo que o hub precisa saber de um cliente: como mandar texto.
 * Depender desta interface (e não do WebSocket da biblioteca `ws`) deixa o hub
 * testável sem rede e troca de transporte sem mexer aqui.
 */
export interface HubClient {
  send(text: string): void;
}

/**
 * Guarda o estado atual do escritório e o transmite para todos os clientes.
 */
export class OfficeHub {
  private readonly clients = new Set<HubClient>();
  private state: OfficeState;

  constructor(initialState: OfficeState = initialOfficeState()) {
    this.state = initialState;
  }

  get currentState(): OfficeState {
    return this.state;
  }

  get clientCount(): number {
    return this.clients.size;
  }

  /**
   * Registra um cliente e já manda a foto atual: quem conecta (ou reconecta)
   * vê a tela correta na hora, sem esperar o próximo evento.
   * Devolve a função que remove o cliente.
   */
  addClient(client: HubClient): () => void {
    this.clients.add(client);
    this.sendTo(client, JSON.stringify(createSnapshotMessage(this.state, null)));
    return () => {
      this.clients.delete(client);
    };
  }

  /** Aplica um evento ao estado e transmite a nova foto para todos. */
  apply(event: OfficeEvent): void {
    this.state = officeReducer(this.state, event);
    const text = JSON.stringify(createSnapshotMessage(this.state, event));
    // Copia o conjunto porque sendTo pode remover clientes durante a volta.
    for (const client of [...this.clients]) this.sendTo(client, text);
  }

  /** Um cliente com defeito é descartado para não atrapalhar os demais. */
  private sendTo(client: HubClient, text: string): void {
    try {
      client.send(text);
    } catch {
      this.clients.delete(client);
    }
  }
}
