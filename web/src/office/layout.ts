import { ROLES, type Role } from '../../../src/domain/roles.js';

/**
 * Planta do escritório: tamanho da tela e onde fica cada mesa.
 * Puro (sem Phaser) para ser testado no Vitest.
 *
 * A tela tem 960x540 "pixels de jogo"; o Phaser estica para caber na janela.
 * A pixel art é desenhada pequena e ampliada PIXEL_SCALE vezes.
 */
export const GAME_WIDTH = 960;
export const GAME_HEIGHT = 540;
export const PIXEL_SCALE = 3;

/** Altura da parede (o chão começa aqui). */
export const WALL_HEIGHT = 150;

/** Corredor por onde as corujas andam para entregar trabalho (fica à frente de todas as mesas). */
export const AISLE_Y = 480;

export interface Point {
  x: number;
  y: number;
}

export interface DeskSpot {
  /** Centro da mesa (tampo). */
  desk: Point;
  /** Onde a coruja fica sentada, atrás da mesa. */
  seat: Point;
  /** Onde a coruja fica em pé, na frente da mesa. */
  front: Point;
}

const DESK_SPACING = GAME_WIDTH / ROLES.length;
const DESK_Y = 318;

/** Espessura do tampo da mesa (visto um pouco de cima) e altura da frente. */
export const DESK_TOP_DEPTH = 14;
export const DESK_FRONT_HEIGHT = 34;
export const DESK_WIDTH = 120;

/**
 * Sentada, a coruja aparece só do peito para cima: a borda do tampo
 * esconde a parte de baixo do desenho (linha 14 em diante, de 18; o centro é a linha 9).
 * Centro = borda do tampo - (14 - 9) linhas ampliadas.
 */
const SEAT_OFFSET = DESK_TOP_DEPTH + (14 - 9) * PIXEL_SCALE;

function spotFor(index: number): DeskSpot {
  const x = Math.round(DESK_SPACING * index + DESK_SPACING / 2);
  return {
    desk: { x, y: DESK_Y },
    seat: { x, y: DESK_Y - SEAT_OFFSET },
    front: { x, y: DESK_Y + 96 },
  };
}

export const DESK_SPOTS: Record<Role, DeskSpot> = Object.fromEntries(
  ROLES.map((role, index) => [role, spotFor(index)]),
) as Record<Role, DeskSpot>;

/**
 * Caminho de quem leva uma entrega: desce para o corredor, anda até a mesa de
 * destino e para ao lado da coruja que vai receber (sem ficar em cima dela).
 */
export function deliveryPath(from: Role, to: Role): Point[] {
  const start = DESK_SPOTS[from].front;
  const target = DESK_SPOTS[to].front;
  const side = target.x > start.x ? -1 : 1; // para do lado de onde veio
  const stopX = target.x + side * 56;
  return [
    { x: start.x, y: AISLE_Y },
    { x: stopX, y: AISLE_Y },
    { x: stopX, y: target.y },
  ];
}

/** Caminho de volta para a própria mesa. */
export function returnPath(from: Role, to: Role): Point[] {
  const [, , stop] = deliveryPath(from, to);
  const home = DESK_SPOTS[from].front;
  if (stop === undefined) return [home];
  return [{ x: stop.x, y: AISLE_Y }, { x: home.x, y: AISLE_Y }, home];
}
