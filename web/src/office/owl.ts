import Phaser from 'phaser';
import type { Desk } from '../../../src/domain/office.js';
import type { Role } from '../../../src/domain/roles.js';
import { bubbleText } from './choreography.js';
import { DESK_SPOTS, PIXEL_SCALE, type Point } from './layout.js';
import { OWL_HEIGHT, owlTextureKey } from './sprites.js';

/** Camadas de desenho: quem tem número maior aparece na frente. */
export const DEPTH = {
  chair: 10,
  seatedOwl: 20,
  desk: 30,
  standingOwl: 50,
  flyingPaper: 60,
  lightsOff: 90,
  banner: 110,
} as const;

const WALK_SPEED = 240; // pixels de jogo por segundo
const HOP_HEIGHT = 64;
const HEAD_TOP = -(OWL_HEIGHT / 2) * PIXEL_SCALE;

export const COLORS = {
  rework: 0xef4b4b,
  reworkText: '#b3261e',
  bubble: 0xfdfaf3,
  bubbleText: '#2a2433',
  bubbleBorder: 0x2a2433,
};

/** Transforma um tween do Phaser numa Promise (para encadear com await). */
export function tweenAsync(scene: Phaser.Scene, config: Phaser.Types.Tweens.TweenBuilderConfig): Promise<void> {
  return new Promise((resolve) => {
    scene.tweens.add({ ...config, onComplete: () => resolve() });
  });
}

/**
 * Uma coruja na tela: o desenho, o balão com a tarefa, o sinal de entregue,
 * o "zzz" de quem está livre e o papel que ela carrega numa entrega.
 *
 * Os métodos que animam devolvem Promise, para a cena tocar uma coisa depois da outra.
 */
export class Owl {
  readonly container: Phaser.GameObjects.Container;
  private readonly sprite: Phaser.GameObjects.Sprite;
  private readonly bubble: Phaser.GameObjects.Container;
  private readonly bubbleBox: Phaser.GameObjects.Graphics;
  private readonly bubbleLabel: Phaser.GameObjects.Text;
  private readonly check: Phaser.GameObjects.Image;
  private readonly zzz: Phaser.GameObjects.Text;
  private readonly paper: Phaser.GameObjects.Image;
  private seated = false;
  /** Caminhada de volta depois de uma entrega; a próxima animação espera ela terminar. */
  private homecoming: Promise<void> = Promise.resolve();

  constructor(
    private readonly scene: Phaser.Scene,
    readonly role: Role,
  ) {
    const front = DESK_SPOTS[role].front;
    this.sprite = scene.add.sprite(0, 0, owlTextureKey(role, 'stand')).setScale(PIXEL_SCALE);

    this.check = scene.add.image(0, HEAD_TOP - 18, 'check').setScale(PIXEL_SCALE).setVisible(false);
    this.zzz = scene.add
      .text(14, HEAD_TOP - 16, 'z z', { fontFamily: 'monospace', fontSize: '14px', color: '#cfc8e8' })
      .setOrigin(0, 1)
      .setVisible(false);
    this.paper = scene.add.image(22, 8, 'paper').setScale(PIXEL_SCALE - 1).setVisible(false);

    this.bubbleBox = scene.add.graphics();
    this.bubbleLabel = scene.add
      .text(0, 0, '', {
        fontFamily: 'monospace',
        fontSize: '13px',
        color: COLORS.bubbleText,
        align: 'center',
        wordWrap: { width: 168, useAdvancedWrap: true },
      })
      .setOrigin(0.5, 1);
    this.bubble = scene.add.container(0, HEAD_TOP - 14, [this.bubbleBox, this.bubbleLabel]).setVisible(false);

    this.container = scene.add.container(front.x, front.y, [
      this.sprite,
      this.paper,
      this.check,
      this.zzz,
      this.bubble,
    ]);
    this.container.setDepth(DEPTH.standingOwl);
  }

  /** Para tudo o que está animando nesta coruja (usado ao montar a cena do zero). */
  stopAll(): void {
    this.scene.tweens.killTweensOf([this.container, this.sprite, this.check, this.zzz, this.bubble, this.paper]);
    this.homecoming = Promise.resolve();
  }

  /** Coloca a coruja direto na posição que corresponde à mesa, sem animação. */
  place(desk: Desk, rework = false): void {
    this.stopAll();
    const spot = DESK_SPOTS[this.role];
    this.paper.setVisible(false);
    this.sprite.setScale(PIXEL_SCALE).setFlipX(false);
    if (desk.status === 'working') {
      this.setSeated(true, spot.seat);
      this.sprite.play(`${this.role}-type`);
      this.showBubble(desk.task, rework);
      this.setStatusIcon('none');
    } else {
      this.setSeated(false, spot.front);
      this.sprite.play(`${this.role}-idle`);
      this.hideBubble();
      this.setStatusIcon(desk.status === 'done' ? 'done' : 'idle');
    }
  }

  /** Pula por cima da mesa até a cadeira e começa a digitar. */
  async sit(task: string, rework: boolean): Promise<void> {
    await this.homecoming;
    this.setStatusIcon('none');
    if (!this.seated) {
      await this.hop(DESK_SPOTS[this.role].seat, true);
      await this.land();
    }
    this.sprite.play(`${this.role}-type`);
    this.showBubble(task, rework);
  }

  /** Continua sentada, só troca o texto do balão. */
  retask(task: string): void {
    this.showBubble(task, false);
  }

  /** Levanta da cadeira, volta para a frente da mesa e mostra o sinal de entregue. */
  async standUp(): Promise<void> {
    await this.homecoming;
    this.hideBubble();
    if (this.seated) {
      await this.hop(DESK_SPOTS[this.role].front, false);
      await this.land();
    }
    this.sprite.play(`${this.role}-idle`);
    this.setStatusIcon('done');
    this.check.setScale(0);
    await tweenAsync(this.scene, {
      targets: this.check,
      scale: PIXEL_SCALE,
      duration: 240,
      ease: 'Back.easeOut',
    });
  }

  /** Mostra o papel na asa (vermelho se for retrabalho). */
  carryPaper(kind: 'delivery' | 'rework'): void {
    this.setStatusIcon('none');
    this.paper.setTexture(kind === 'rework' ? 'paper-rework' : 'paper').setVisible(true);
  }

  /** Esconde o papel e devolve onde ele estava na tela (para animar o voo até quem recebe). */
  releasePaper(): Point {
    this.paper.setVisible(false);
    const matrix = this.paper.getWorldTransformMatrix();
    return { x: matrix.tx, y: matrix.ty };
  }

  /** Anda pelos pontos do caminho, um de cada vez. */
  async walk(path: readonly Point[]): Promise<void> {
    this.sprite.play(`${this.role}-walk`);
    for (const point of path) {
      const distance = Phaser.Math.Distance.Between(this.container.x, this.container.y, point.x, point.y);
      if (distance < 1) continue;
      if (Math.abs(point.x - this.container.x) > 1) this.sprite.setFlipX(point.x < this.container.x);
      await tweenAsync(this.scene, {
        targets: this.container,
        x: point.x,
        y: point.y,
        duration: (distance / WALK_SPEED) * 1000,
      });
    }
    this.sprite.setFlipX(false);
    this.sprite.play(`${this.role}-idle`);
  }

  /** Volta para a frente da própria mesa sem segurar a fila de animações. */
  walkHome(path: readonly Point[], onArrive: () => void): void {
    this.homecoming = this.walk(path).then(onArrive);
  }

  /** Pulinho de "recebi!". */
  async nod(): Promise<void> {
    await tweenAsync(this.scene, { targets: this.sprite, y: -10, duration: 120, yoyo: true, ease: 'Quad.easeOut' });
  }

  setStatusIcon(icon: 'none' | 'idle' | 'done'): void {
    this.scene.tweens.killTweensOf(this.zzz);
    this.check.setVisible(icon === 'done').setScale(PIXEL_SCALE);
    this.zzz.setVisible(icon === 'idle').setAlpha(1);
    if (icon === 'idle') {
      this.scene.tweens.add({ targets: this.zzz, alpha: 0.25, duration: 1100, yoyo: true, repeat: -1 });
    }
  }

  private setSeated(seated: boolean, at: Point): void {
    this.seated = seated;
    this.container.setPosition(at.x, at.y);
    this.container.setDepth(seated ? DEPTH.seatedOwl : DEPTH.standingOwl);
  }

  /** Pulo em arco (com as asas batendo). Troca de camada no alto, para passar "por cima" da mesa. */
  private async hop(target: Point, toSeat: boolean): Promise<void> {
    this.sprite.play(`${this.role}-flap`);
    const peakY = Math.min(this.container.y, target.y) - HOP_HEIGHT;
    await tweenAsync(this.scene, {
      targets: this.container,
      x: (this.container.x + target.x) / 2,
      y: peakY,
      duration: 260,
      ease: 'Quad.easeOut',
    });
    this.seated = toSeat;
    this.container.setDepth(toSeat ? DEPTH.seatedOwl : DEPTH.standingOwl);
    await tweenAsync(this.scene, { targets: this.container, x: target.x, y: target.y, duration: 240, ease: 'Quad.easeIn' });
  }

  /** Amassadinha ao pousar. */
  private async land(): Promise<void> {
    this.sprite.play(`${this.role}-idle`);
    await tweenAsync(this.scene, {
      targets: this.sprite,
      scaleY: PIXEL_SCALE * 0.82,
      scaleX: PIXEL_SCALE * 1.12,
      duration: 90,
      yoyo: true,
    });
    this.sprite.setScale(PIXEL_SCALE);
  }

  private showBubble(task: string, rework: boolean): void {
    // O texto vem do prompt; o Phaser desenha no canvas (nunca vira HTML).
    const text = rework ? `↺ retrabalho: ${bubbleText(task, 26)}` : bubbleText(task, 40);
    this.bubbleLabel.setText(text).setColor(rework ? COLORS.reworkText : COLORS.bubbleText);
    this.bubbleLabel.setPosition(0, -8);

    const width = Math.ceil(this.bubbleLabel.width) + 16;
    const height = Math.ceil(this.bubbleLabel.height) + 10;
    const box = this.bubbleBox;
    box.clear();
    box.fillStyle(COLORS.bubble, 1);
    box.lineStyle(rework ? 3 : 2, rework ? COLORS.rework : COLORS.bubbleBorder, 1);
    box.fillRoundedRect(-width / 2, -height - 3, width, height, 6);
    box.strokeRoundedRect(-width / 2, -height - 3, width, height, 6);
    // Bico do balão apontando para a cabeça.
    box.fillTriangle(-6, -4, 6, -4, 0, 6);
    box.lineBetween(-6, -3, 0, 6);
    box.lineBetween(6, -3, 0, 6);
    this.bubble.setVisible(true);
  }

  private hideBubble(): void {
    this.bubble.setVisible(false);
  }
}
