import { describe, expect, it } from 'vitest';
import type { OfficeEvent } from '../src/domain/events.js';
import { parseServerMessage } from '../src/domain/protocol.js';
import { OfficeHub, type HubClient } from '../src/server/office-hub.js';

const sessionStarted: OfficeEvent = { v: 1, ts: '2026-11-08T12:00:00.000Z', session: 's1', type: 'session.started' };

function fakeClient(): HubClient & { received: string[] } {
  const received: string[] = [];
  return { received, send: (text) => received.push(text) };
}

describe('OfficeHub', () => {
  it('manda a foto atual assim que o cliente entra', () => {
    const hub = new OfficeHub();
    const client = fakeClient();
    hub.addClient(client);
    expect(client.received).toHaveLength(1);
    const message = parseServerMessage(client.received[0] ?? '');
    expect(message?.event).toBeNull();
    expect(message?.state.open).toBe(false);
  });

  it('quem entra depois recebe o estado já atualizado', () => {
    const hub = new OfficeHub();
    hub.apply(sessionStarted);
    const client = fakeClient();
    hub.addClient(client);
    expect(parseServerMessage(client.received[0] ?? '')?.state.session).toBe('s1');
  });

  it('aplica o evento e transmite para todos com o evento que causou a foto', () => {
    const hub = new OfficeHub();
    const a = fakeClient();
    const b = fakeClient();
    hub.addClient(a);
    hub.addClient(b);
    hub.apply(sessionStarted);
    for (const client of [a, b]) {
      expect(client.received).toHaveLength(2);
      const message = parseServerMessage(client.received[1] ?? '');
      expect(message?.event).toEqual(sessionStarted);
      expect(message?.state.open).toBe(true);
    }
    expect(hub.currentState.open).toBe(true);
  });

  it('para de enviar para cliente removido', () => {
    const hub = new OfficeHub();
    const client = fakeClient();
    const remove = hub.addClient(client);
    remove();
    hub.apply(sessionStarted);
    expect(client.received).toHaveLength(1);
    expect(hub.clientCount).toBe(0);
  });

  it('remove cliente cujo send lança, sem afetar os outros', () => {
    const hub = new OfficeHub();
    let calls = 0;
    const broken: HubClient = {
      send: () => {
        calls += 1;
        if (calls > 1) throw new Error('conexão caiu');
      },
    };
    const healthy = fakeClient();
    hub.addClient(broken);
    hub.addClient(healthy);

    expect(() => hub.apply(sessionStarted)).not.toThrow();
    expect(healthy.received).toHaveLength(2);
    expect(hub.clientCount).toBe(1);

    hub.apply({ ...sessionStarted, type: 'session.ended' });
    expect(calls).toBe(2);
    expect(healthy.received).toHaveLength(3);
  });

  it('cliente que falha já na foto inicial não fica registrado', () => {
    const hub = new OfficeHub();
    hub.addClient({
      send: () => {
        throw new Error('falhou');
      },
    });
    expect(hub.clientCount).toBe(0);
  });
});
