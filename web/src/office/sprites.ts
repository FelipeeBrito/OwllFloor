import { ROLES, type Role } from '../../../src/domain/roles.js';

/**
 * Pixel art das corujas, desenhada como texto: cada caractere é um pixel e
 * cada letra aponta para uma cor da paleta ('.' = transparente).
 *
 * Vantagens: não depende de arquivos de imagem nem de licença de terceiros,
 * dá para ler e editar no próprio código e dá para testar (larguras, cores).
 * O Phaser transforma estes desenhos em texturas (textures.ts).
 */

export interface PixelSprite {
  rows: readonly string[];
}

export type Palette = Readonly<Record<string, string>>;

export const TRANSPARENT = '.';

export const OWL_WIDTH = 16;
export const OWL_HEIGHT = 18;

/** Quadros (frames) de cada coruja. */
export const OWL_FRAMES = ['stand', 'blink', 'walkA', 'walkB', 'flap', 'typeA', 'typeB'] as const;
export type OwlFrame = (typeof OWL_FRAMES)[number];

// Legenda: b = contorno/asa, B = corpo, W = disco do rosto, E = olho, P = pupila,
//          K = bico, L = barriga, F = pés
const STAND: readonly string[] = [
  '................',
  '...b........b...',
  '...bb......bb...',
  '...bBBBBBBBBb...',
  '..bBWWWBBWWWBb..',
  '..bWWEEWWEEWWb..',
  '..bWEPEWWEPEWb..',
  '..bWWEEWWEEWWb..',
  '..bBWWWKKWWWBb..',
  '..bBBBBKKBBBBb..',
  '..bbBLLLLLLBbb..',
  '.bbbLLLLLLLLbbb.',
  '.bbbLLLLLLLLbbb.',
  '.bbbLLLLLLLLbbb.',
  '..bbBLLLLLLBbb..',
  '...bBBBBBBBBb...',
  '....FF....FF....',
  '................',
];

/** Troca algumas linhas do desenho base (o resto continua igual). */
function withRows(base: readonly string[], changes: Record<number, string>): string[] {
  return base.map((row, index) => changes[index] ?? row);
}

const FRAME_ROWS: Record<OwlFrame, readonly string[]> = {
  stand: STAND,
  blink: withRows(STAND, {
    5: '..bWWWWWWWWWWb..',
    6: '..bWPPPWWPPPWb..',
    7: '..bWWWWWWWWWWb..',
  }),
  walkA: withRows(STAND, { 16: '...FF......FF...' }),
  walkB: withRows(STAND, { 16: '.....FF..FF.....' }),
  // Asas abertas: usado no pulo para a cadeira.
  flap: withRows(STAND, {
    10: 'bbbbBLLLLLLBbbbb',
    11: 'b.bbLLLLLLLLbb.b',
    12: '...bLLLLLLLLb...',
    13: '...bLLLLLLLLb...',
  }),
  // Digitando: uma asa sobe de cada vez.
  typeA: withRows(STAND, {
    9: '.bbBBBBKKBBBBb..',
    10: '.bbbBLLLLLLBbb..',
    11: '..bbLLLLLLLLbbb.',
  }),
  typeB: withRows(STAND, {
    9: '..bBBBBKKBBBBbb.',
    10: '..bbBLLLLLLBbbb.',
    11: '.bbbLLLLLLLLbb..',
  }),
};

/**
 * Acessório de cada papel, desenhado por cima da coruja (mesmo tamanho, 16x18).
 * Legenda: G = armação dos óculos, U/u = planta azul, D/d = teclado,
 *          S/s = escudo, O = aro da lupa, C = vidro da lupa, h = cabo, Y/y = capacete
 */
const ACCESSORY_ROWS: Record<Role, Record<number, string>> = {
  arquiteto: {
    5: '...GGGG..GGGG...',
    6: '...G..GGGG..G...',
    7: '...GGGG..GGGG...',
    10: '.............UU.',
    11: '............UUu.',
    12: '............UUu.',
    13: '............UUu.',
    14: '.............UU.',
  },
  engenheiro: {
    10: '...DDDDDDDDDD...',
    11: '...DdDdDdDdDD...',
  },
  seguranca: {
    9: 'SSSSS...........',
    10: 'SsWsS...........',
    11: 'SWWWS...........',
    12: 'SsWsS...........',
    13: '.SsS............',
    14: '..S.............',
  },
  qa: {
    8: '...........OOO..',
    9: '..........OCCCO.',
    10: '..........OCCCO.',
    11: '...........OOO..',
    12: '..........h.....',
    13: '.........h......',
  },
  devops: {
    0: '....YYYYYYYY....',
    1: '...YYYYYYYYYY...',
    2: '..YYYYYYYYYYYY..',
    3: '.yyyyyyyyyyyyyy.',
  },
};

function emptyRows(width: number, height: number): string[] {
  return Array.from({ length: height }, () => TRANSPARENT.repeat(width));
}

export function accessorySprite(role: Role): PixelSprite {
  return { rows: withRows(emptyRows(OWL_WIDTH, OWL_HEIGHT), ACCESSORY_ROWS[role]) };
}

/**
 * Sobrepõe dois desenhos do mesmo tamanho: onde o de cima não é transparente,
 * ele vence. Lança erro se os tamanhos forem diferentes (desenho quebrado).
 */
export function overlay(base: PixelSprite, top: PixelSprite): PixelSprite {
  if (base.rows.length !== top.rows.length) throw new Error('overlay: alturas diferentes');
  const rows = base.rows.map((row, y) => {
    const topRow = top.rows[y] ?? '';
    if (row.length !== topRow.length) throw new Error(`overlay: larguras diferentes na linha ${y}`);
    let out = '';
    for (let x = 0; x < row.length; x++) {
      const pixel = topRow[x] ?? TRANSPARENT;
      out += pixel === TRANSPARENT ? row[x] : pixel;
    }
    return out;
  });
  return { rows };
}

/** Todos os quadros de uma coruja já com o acessório do papel. */
export function owlFrames(role: Role): Record<OwlFrame, PixelSprite> {
  const accessory = accessorySprite(role);
  const frames = {} as Record<OwlFrame, PixelSprite>;
  for (const frame of OWL_FRAMES) frames[frame] = overlay({ rows: FRAME_ROWS[frame] }, accessory);
  return frames;
}

/** Cores comuns a todas as corujas (rosto, olhos, bico, pés e acessórios). */
const SHARED_COLORS: Palette = {
  W: '#f4ead7',
  E: '#f5c542',
  P: '#1b1420',
  K: '#e8913a',
  F: '#e8913a',
  G: '#2b2b33',
  U: '#4f8fe0',
  u: '#2f5fa8',
  D: '#3b3f4f',
  d: '#c9cfdc',
  S: '#2f6fd1',
  s: '#1f4c94',
  O: '#6b4a2b',
  C: '#bfe9f5',
  h: '#6b4a2b',
  Y: '#f2c230',
  y: '#c99512',
};

/** Cor das penas de cada papel (contorno, corpo e barriga), para reconhecer de longe. */
const FEATHERS: Record<Role, { b: string; B: string; L: string }> = {
  arquiteto: { b: '#4a3222', B: '#8a5a3b', L: '#d9b48a' },
  engenheiro: { b: '#2f3a4a', B: '#5b6f8c', L: '#b8c6d9' },
  seguranca: { b: '#1f2a33', B: '#3d4f5c', L: '#9fb0ba' },
  qa: { b: '#2d4030', B: '#557a52', L: '#c2d6a8' },
  devops: { b: '#4a2e1a', B: '#a8643a', L: '#e8c39a' },
};

export function owlPalette(role: Role): Palette {
  return { ...SHARED_COLORS, ...FEATHERS[role] };
}

/** Papel entregue entre corujas. Na versão de retrabalho, ele fica vermelho. */
export const PAPER: PixelSprite = {
  rows: [
    'WWWWW..',
    'WgggWW.',
    'WWWWWWW',
    'WgggggW',
    'WWWWWWW',
    'WgggggW',
    'WWWWWWW',
    'WgggggW',
    'WWWWWWW',
  ],
};
export const PAPER_PALETTE: Palette = { W: '#fbf7ee', g: '#9a94a8' };
export const REWORK_PAPER_PALETTE: Palette = { W: '#ff8a80', g: '#b3261e' };

/** Sinal de "entregue" que aparece sobre a coruja que terminou. */
export const CHECK: PixelSprite = {
  rows: [
    '......V',
    '.....VV',
    'V...VV.',
    'VV.VV..',
    '.VVV...',
    '..V....',
  ],
};
export const CHECK_PALETTE: Palette = { V: '#5cc98a' };

/** Todas as combinações desenho + paleta que viram textura (usado nos testes). */
export function allSprites(): Array<{ key: string; sprite: PixelSprite; palette: Palette }> {
  const list: Array<{ key: string; sprite: PixelSprite; palette: Palette }> = [];
  for (const role of ROLES) {
    const frames = owlFrames(role);
    for (const frame of OWL_FRAMES) {
      list.push({ key: owlTextureKey(role, frame), sprite: frames[frame], palette: owlPalette(role) });
    }
  }
  list.push({ key: 'paper', sprite: PAPER, palette: PAPER_PALETTE });
  list.push({ key: 'paper-rework', sprite: PAPER, palette: REWORK_PAPER_PALETTE });
  list.push({ key: 'check', sprite: CHECK, palette: CHECK_PALETTE });
  return list;
}

export function owlTextureKey(role: Role, frame: OwlFrame): string {
  return `owl-${role}-${frame}`;
}
