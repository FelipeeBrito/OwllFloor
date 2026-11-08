import { describe, expect, it } from 'vitest';
import { ROLES } from '../src/domain/roles.js';
import {
  AISLE_Y,
  DESK_SPOTS,
  deliveryPath,
  GAME_HEIGHT,
  GAME_WIDTH,
  returnPath,
  WALL_HEIGHT,
} from '../web/src/office/layout.js';
import {
  accessorySprite,
  allSprites,
  OWL_FRAMES,
  OWL_HEIGHT,
  OWL_WIDTH,
  owlFrames,
  overlay,
  TRANSPARENT,
} from '../web/src/office/sprites.js';

describe('pixel art (sprites.ts)', () => {
  it.each(allSprites().map((s) => [s.key, s] as const))('%s: linhas do mesmo tamanho e só cores da paleta', (_key, { sprite, palette }) => {
    const width = sprite.rows[0]?.length ?? 0;
    expect(width).toBeGreaterThan(0);
    for (const row of sprite.rows) {
      expect(row).toHaveLength(width);
      for (const char of row) {
        if (char !== TRANSPARENT) expect(palette[char], `cor "${char}" sem paleta`).toMatch(/^#[0-9a-f]{6}$/i);
      }
    }
  });

  it('toda coruja tem todos os quadros, no tamanho 16x18', () => {
    for (const role of ROLES) {
      const frames = owlFrames(role);
      for (const frame of OWL_FRAMES) {
        expect(frames[frame].rows).toHaveLength(OWL_HEIGHT);
        expect(frames[frame].rows.every((row) => row.length === OWL_WIDTH)).toBe(true);
      }
    }
  });

  it('cada papel tem um acessório diferente e visível', () => {
    const drawings = ROLES.map((role) => accessorySprite(role).rows.join('\n'));
    expect(new Set(drawings).size).toBe(ROLES.length);
    for (const drawing of drawings) expect(drawing.replace(/[.\n]/g, '').length).toBeGreaterThan(5);
  });

  it('overlay: o desenho de cima vence onde não é transparente', () => {
    expect(overlay({ rows: ['ab', 'cd'] }, { rows: ['.X', 'Y.'] }).rows).toEqual(['aX', 'Yd']);
    expect(() => overlay({ rows: ['ab'] }, { rows: ['abc'] })).toThrow();
    expect(() => overlay({ rows: ['ab'] }, { rows: ['ab', 'cd'] })).toThrow();
  });
});

describe('planta do escritório (layout.ts)', () => {
  it('as 5 mesas cabem na tela, da esquerda para a direita, abaixo da parede', () => {
    const xs = ROLES.map((role) => DESK_SPOTS[role].desk.x);
    expect([...xs].sort((a, b) => a - b)).toEqual(xs);
    for (const role of ROLES) {
      const { desk, seat, front } = DESK_SPOTS[role];
      expect(desk.x).toBeGreaterThan(0);
      expect(desk.x).toBeLessThan(GAME_WIDTH);
      expect(seat.y).toBeLessThan(desk.y); // cadeira atrás da mesa
      expect(front.y).toBeGreaterThan(desk.y); // em pé na frente
      expect(seat.y).toBeGreaterThan(WALL_HEIGHT);
      expect(AISLE_Y).toBeGreaterThan(front.y);
      expect(AISLE_Y).toBeLessThan(GAME_HEIGHT);
    }
  });

  it('a entrega passa pelo corredor e para ao lado de quem recebe', () => {
    const path = deliveryPath('arquiteto', 'devops');
    expect(path[0]).toEqual({ x: DESK_SPOTS.arquiteto.front.x, y: AISLE_Y });
    const stop = path.at(-1);
    expect(stop?.y).toBe(DESK_SPOTS.devops.front.y);
    expect(stop?.x).toBeLessThan(DESK_SPOTS.devops.front.x); // veio da esquerda, para à esquerda
    expect(deliveryPath('qa', 'engenheiro').at(-1)?.x).toBeGreaterThan(DESK_SPOTS.engenheiro.front.x);
  });

  it('a volta termina na frente da própria mesa', () => {
    expect(returnPath('qa', 'engenheiro').at(-1)).toEqual(DESK_SPOTS.qa.front);
  });
});
