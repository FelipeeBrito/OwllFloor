import Phaser from 'phaser';
import type { SnapshotMessage } from '../../../src/domain/protocol.js';
import { GAME_HEIGHT, GAME_WIDTH } from './layout.js';
import { OfficeScene } from './office-scene.js';

export interface OfficeGame {
  show(message: SnapshotMessage): void;
}

/** Cria o jogo do Phaser dentro do elemento `parent` e devolve como mandar fotos para ele. */
export function createOfficeGame(parent: HTMLElement): OfficeGame {
  const scene = new OfficeScene();
  new Phaser.Game({
    type: Phaser.AUTO,
    parent,
    width: GAME_WIDTH,
    height: GAME_HEIGHT,
    backgroundColor: '#1d1b26',
    pixelArt: true,
    banner: false,
    // O escritório não tem som; sem isto o Phaser tentaria abrir o áudio do navegador.
    audio: { noAudio: true },
    scale: { mode: Phaser.Scale.FIT, autoCenter: Phaser.Scale.CENTER_HORIZONTALLY },
    scene,
  });
  return { show: (message) => scene.show(message) };
}
