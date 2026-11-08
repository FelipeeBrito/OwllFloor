import Phaser from 'phaser';
import type { OfficeState } from '../../../src/domain/office.js';
import type { SnapshotMessage } from '../../../src/domain/protocol.js';
import { ROLES, ROLE_INFO, type Role } from '../../../src/domain/roles.js';
import { isReworking, planActions, reworkCount, shouldSkipAhead, type OfficeAction } from './choreography.js';
import {
  AISLE_Y,
  DESK_FRONT_HEIGHT,
  DESK_SPOTS,
  DESK_TOP_DEPTH,
  DESK_WIDTH,
  deliveryPath,
  GAME_HEIGHT,
  GAME_WIDTH,
  returnPath,
  WALL_HEIGHT,
} from './layout.js';
import { COLORS, DEPTH, Owl, tweenAsync } from './owl.js';
import { registerOwlArt } from './textures.js';

/**
 * A cena do escritório: desenha a sala, as mesas e as corujas, e toca as
 * animações decididas pela coreografia (choreography.ts), uma de cada vez.
 */
export class OfficeScene extends Phaser.Scene {
  private readonly owls = new Map<Role, Owl>();
  private readonly laptopLights = new Map<Role, Phaser.GameObjects.Rectangle>();
  private readonly pending: SnapshotMessage[] = [];
  /** Objetos temporários (papel voando, anel vermelho), apagados se a cena for remontada. */
  private readonly effects: Phaser.GameObjects.GameObject[] = [];
  private ready = false;

  /** Última foto aplicada (para comparar com a próxima). */
  private lastState: OfficeState | null = null;
  private queue: OfficeAction[] = [];
  private running = false;
  /** Muda quando a fila é descartada; animações antigas param de mexer na cena. */
  private generation = 0;

  private reworkLabel!: Phaser.GameObjects.Text;
  private sign!: Phaser.GameObjects.Text;
  private lightsOff!: Phaser.GameObjects.Rectangle;
  private banner!: Phaser.GameObjects.Container;
  private bannerText!: Phaser.GameObjects.Text;

  constructor() {
    super('office');
  }

  create(): void {
    registerOwlArt(this);
    this.drawRoom();
    for (const role of ROLES) {
      this.drawDesk(role);
      this.owls.set(role, new Owl(this, role));
    }
    this.drawOverlays();
    this.ready = true;
    for (const message of this.pending.splice(0)) this.show(message);
  }

  /** Recebe uma foto do servidor. Pode chegar antes da cena estar pronta. */
  show(message: SnapshotMessage): void {
    if (!this.ready) {
      this.pending.push(message);
      return;
    }
    const actions = planActions(this.lastState, message);
    this.lastState = message.state;
    this.updateWhiteboard(message.state);

    if (shouldSkipAhead(this.queue.length + actions.length)) {
      // Chegou evento demais de uma vez: pula direto para o estado mais novo.
      this.queue = [{ type: 'reset', state: message.state }];
      this.generation += 1;
      this.running = false;
    } else {
      this.queue.push(...actions);
    }
    void this.pump();
  }

  private async pump(): Promise<void> {
    if (this.running) return;
    this.running = true;
    const generation = this.generation;
    while (this.queue.length > 0 && generation === this.generation) {
      const action = this.queue.shift();
      if (action !== undefined) await this.perform(action);
    }
    if (generation === this.generation) this.running = false;
  }

  private track(effect: Phaser.GameObjects.GameObject): void {
    this.effects.push(effect);
    effect.once(Phaser.GameObjects.Events.DESTROY, () => {
      const index = this.effects.indexOf(effect);
      if (index !== -1) this.effects.splice(index, 1);
    });
  }

  private owl(role: Role): Owl {
    const owl = this.owls.get(role);
    if (owl === undefined) throw new Error(`coruja ${role} não existe`);
    return owl;
  }

  private async perform(action: OfficeAction): Promise<void> {
    switch (action.type) {
      case 'reset':
        // Para todas as animações em andamento: as Promises delas nunca terminam,
        // então a fila antiga (de outra "geração") fica parada e não mexe mais na cena.
        this.tweens.killAll();
        for (const effect of this.effects.splice(0)) effect.destroy();
        this.banner.setVisible(false);
        this.cameras.main.resetFX();
        for (const role of ROLES) {
          this.owl(role).place(action.state.desks[role], isReworking(action.state, role));
          this.setLaptop(role, action.state.desks[role].status === 'working');
        }
        this.setLights(action.state.open, false);
        return;

      case 'lights':
        return this.setLights(action.open, true);

      case 'sit':
        await this.owl(action.role).sit(action.task, action.rework);
        this.setLaptop(action.role, true);
        return;

      case 'retask':
        this.owl(action.role).retask(action.task);
        return;

      case 'standUp':
        this.setLaptop(action.role, false);
        return this.owl(action.role).standUp();

      case 'deliver':
        return this.deliver(action.from, action.to, action.kind);
    }
  }

  /** Quem terminou leva o papel até a próxima coruja e volta para a mesa. */
  private async deliver(from: Role, to: Role, kind: 'delivery' | 'rework'): Promise<void> {
    const giver = this.owl(from);
    const receiver = this.owl(to);
    const rework = kind === 'rework';

    if (rework) this.showReworkBanner(from, to);
    giver.carryPaper(kind);
    await giver.walk(deliveryPath(from, to));

    // O papel voa da asa de quem entrega para quem recebe.
    const start = giver.releasePaper();
    const paper = this.add
      .image(start.x, start.y, rework ? 'paper-rework' : 'paper')
      .setScale(2)
      .setDepth(DEPTH.flyingPaper);
    this.track(paper);
    await tweenAsync(this, {
      targets: paper,
      x: receiver.container.x,
      y: receiver.container.y - 10,
      angle: rework ? 720 : 360,
      duration: 380,
      ease: 'Sine.easeInOut',
    });
    paper.destroy();
    if (rework) {
      this.cameras.main.shake(260, 0.006);
      this.pulseDesk(to);
    }
    await receiver.nod();

    giver.walkHome(returnPath(from, to), () => giver.setStatusIcon('done'));
  }

  // ---------- Destaque do retrabalho ----------

  private showReworkBanner(from: Role, to: Role): void {
    this.bannerText.setText(`↺ RETRABALHO — ${ROLE_INFO[from].label} devolveu para ${ROLE_INFO[to].label} corrigir`);
    this.banner.setVisible(true).setAlpha(1);
    this.tweens.killTweensOf(this.banner);
    this.tweens.chain({
      targets: this.banner,
      tweens: [
        { alpha: 0.35, duration: 220, yoyo: true, repeat: 3 },
        { alpha: 0, delay: 2200, duration: 400 },
      ],
      onComplete: () => this.banner.setVisible(false),
    });
  }

  /** Anel vermelho pulsando em volta da mesa que recebeu o retrabalho. */
  private pulseDesk(role: Role): void {
    const { desk } = DESK_SPOTS[role];
    const ring = this.add
      .ellipse(desk.x, desk.y + 6, DESK_WIDTH + 30, 70)
      .setStrokeStyle(4, COLORS.rework)
      .setDepth(DEPTH.desk + 2);
    this.track(ring);
    this.tweens.add({
      targets: ring,
      scale: 1.25,
      alpha: 0,
      duration: 600,
      repeat: 2,
      onComplete: () => ring.destroy(),
    });
  }

  // ---------- Quadro branco e luzes ----------

  private updateWhiteboard(state: OfficeState): void {
    const count = reworkCount(state);
    this.reworkLabel.setText(`retrabalhos do QA: ${count}`).setColor(count > 0 ? COLORS.reworkText : '#4d4760');
  }

  private setLights(open: boolean, animate: boolean): Promise<void> | void {
    this.sign.setText(open ? 'ABERTO' : 'FECHADO').setColor(open ? '#5cc98a' : '#ef6f6c');
    const alpha = open ? 0 : 0.45;
    if (!animate) {
      this.lightsOff.setAlpha(alpha);
      return;
    }
    return tweenAsync(this, { targets: this.lightsOff, alpha, duration: 700 });
  }

  private setLaptop(role: Role, working: boolean): void {
    const light = this.laptopLights.get(role);
    if (light === undefined) return;
    this.tweens.killTweensOf(light);
    light.setFillStyle(working ? 0x7fe3ff : 0x55506a).setAlpha(1);
    if (working) this.tweens.add({ targets: light, alpha: 0.55, duration: 300, yoyo: true, repeat: -1 });
  }

  // ---------- Desenho da sala (formas simples) ----------

  private drawRoom(): void {
    const g = this.add.graphics();
    // Parede e rodapé.
    g.fillStyle(0x2c2640, 1).fillRect(0, 0, GAME_WIDTH, WALL_HEIGHT);
    g.fillStyle(0x1e1a2c, 1).fillRect(0, WALL_HEIGHT - 10, GAME_WIDTH, 10);

    // Janelas com céu noturno.
    for (const x of [70, 750]) {
      g.fillStyle(0x4a4262, 1).fillRect(x - 6, 26, 152, 92);
      g.fillStyle(0x16234a, 1).fillRect(x, 32, 140, 80);
      g.fillStyle(0x4a4262, 1).fillRect(x + 68, 32, 4, 80).fillRect(x, 70, 140, 4);
      g.fillStyle(0xf5f0c8, 1).fillCircle(x + 110, 50, 9);
      g.fillStyle(0xffffff, 0.8);
      for (const [sx, sy] of [[18, 44], [40, 88], [96, 92], [124, 84], [30, 58]] as const) g.fillRect(x + sx, sy, 2, 2);
    }

    // Quadro branco com o nome e o contador de retrabalho.
    g.fillStyle(0x8a8398, 1).fillRect(318, 22, 324, 104);
    g.fillStyle(0xf2efe6, 1).fillRect(324, 28, 312, 92);
    this.add
      .text(GAME_WIDTH / 2, 46, 'OwllFloor', { fontFamily: 'monospace', fontSize: '26px', color: '#2a2433', fontStyle: 'bold' })
      .setOrigin(0.5);
    this.reworkLabel = this.add
      .text(GAME_WIDTH / 2, 82, '', { fontFamily: 'monospace', fontSize: '15px', color: '#4d4760' })
      .setOrigin(0.5);
    this.sign = this.add
      .text(GAME_WIDTH / 2, 106, '', { fontFamily: 'monospace', fontSize: '13px', color: '#5cc98a', fontStyle: 'bold' })
      .setOrigin(0.5);

    // Chão de tacos de madeira.
    g.fillStyle(0x5b4030, 1).fillRect(0, WALL_HEIGHT, GAME_WIDTH, GAME_HEIGHT - WALL_HEIGHT);
    g.fillStyle(0x4c3527, 1);
    for (let y = WALL_HEIGHT + 24, row = 0; y < GAME_HEIGHT; y += 24, row++) {
      g.fillRect(0, y, GAME_WIDTH, 2);
      for (let x = ((row * 97) % 240) + 20; x < GAME_WIDTH; x += 240) g.fillRect(x, y - 22, 2, 22);
    }
    // Tapete do corredor de entregas.
    g.fillStyle(0x6b3a4a, 1).fillRect(24, AISLE_Y - 30, GAME_WIDTH - 48, 60);
    g.fillStyle(0x8a4d5f, 1).fillRect(32, AISLE_Y - 24, GAME_WIDTH - 64, 3).fillRect(32, AISLE_Y + 21, GAME_WIDTH - 64, 3);
  }

  private drawDesk(role: Role): void {
    const { desk, seat } = DESK_SPOTS[role];
    const left = desk.x - DESK_WIDTH / 2;
    const top = desk.y - DESK_TOP_DEPTH;

    // Cadeira (atrás da coruja sentada).
    const chair = this.add.graphics().setDepth(DEPTH.chair);
    chair.fillStyle(0x3a3550, 1).fillRoundedRect(seat.x - 32, seat.y - 30, 64, 60, 8);
    chair.fillStyle(0x4a4466, 1).fillRoundedRect(seat.x - 26, seat.y - 24, 52, 40, 6);

    // Mesa: tampo visto um pouco de cima e a frente.
    const g = this.add.graphics().setDepth(DEPTH.desk);
    g.fillStyle(0x000000, 0.25).fillEllipse(desk.x, desk.y + DESK_FRONT_HEIGHT + 4, DESK_WIDTH + 10, 14);
    g.fillStyle(0xc28a55, 1).fillRect(left, top, DESK_WIDTH, DESK_TOP_DEPTH);
    g.fillStyle(0x9a6a3e, 1).fillRect(left, desk.y, DESK_WIDTH, DESK_FRONT_HEIGHT);
    g.fillStyle(0x7d532f, 1).fillRect(left, desk.y, DESK_WIDTH, 3);
    g.fillStyle(0x7d532f, 1).fillRect(left + 6, desk.y + DESK_FRONT_HEIGHT, 8, 8).fillRect(left + DESK_WIDTH - 14, desk.y + DESK_FRONT_HEIGHT, 8, 8);

    // Notebook de costas (a tela fica virada para a coruja), deslocado para não tapar o rosto.
    const lx = desk.x + 34;
    g.fillStyle(0x9aa0b4, 1).fillRect(lx - 18, top - 24, 36, 26);
    g.fillStyle(0x6c7288, 1).fillRect(lx - 20, top + 1, 40, 4);
    const light = this.add.rectangle(lx, top - 11, 6, 6, 0x55506a).setDepth(DEPTH.desk + 1);
    this.laptopLights.set(role, light);

    // Plaquinha com o nome.
    this.add
      .text(desk.x, desk.y + DESK_FRONT_HEIGHT / 2 + 1, ROLE_INFO[role].label, {
        fontFamily: 'monospace',
        fontSize: '13px',
        color: '#fbf3e4',
        fontStyle: 'bold',
      })
      .setOrigin(0.5)
      .setDepth(DEPTH.desk + 1);
  }

  private drawOverlays(): void {
    this.lightsOff = this.add.rectangle(0, 0, GAME_WIDTH, GAME_HEIGHT, 0x05040a).setOrigin(0).setAlpha(0).setDepth(DEPTH.lightsOff);

    const bg = this.add.rectangle(0, 0, GAME_WIDTH - 120, 38, COLORS.rework).setStrokeStyle(3, 0xffffff);
    this.bannerText = this.add
      .text(0, 0, '', { fontFamily: 'monospace', fontSize: '16px', color: '#ffffff', fontStyle: 'bold' })
      .setOrigin(0.5);
    this.banner = this.add
      .container(GAME_WIDTH / 2, WALL_HEIGHT + 26, [bg, this.bannerText])
      .setDepth(DEPTH.banner)
      .setVisible(false);
  }
}
