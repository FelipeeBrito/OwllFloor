import Phaser from 'phaser';
import { ROLES } from '../../../src/domain/roles.js';
import { allSprites, owlTextureKey, TRANSPARENT, type Palette, type PixelSprite } from './sprites.js';

/** Pinta um desenho de texto (sprites.ts) numa textura do Phaser, 1 caractere = 1 pixel. */
function paint(scene: Phaser.Scene, key: string, sprite: PixelSprite, palette: Palette): void {
  if (scene.textures.exists(key)) return;
  const width = sprite.rows[0]?.length ?? 0;
  const texture = scene.textures.createCanvas(key, width, sprite.rows.length);
  if (texture === null) return;
  const ctx = texture.getContext();
  sprite.rows.forEach((row, y) => {
    for (let x = 0; x < row.length; x++) {
      const char = row[x];
      const color = char === undefined || char === TRANSPARENT ? undefined : palette[char];
      if (color === undefined) continue;
      ctx.fillStyle = color;
      ctx.fillRect(x, y, 1, 1);
    }
  });
  texture.refresh();
}

/** Cria todas as texturas e as animações (andar, digitar, piscar) de cada coruja. */
export function registerOwlArt(scene: Phaser.Scene): void {
  for (const { key, sprite, palette } of allSprites()) paint(scene, key, sprite, palette);

  for (const role of ROLES) {
    const anim = (name: string, frames: Parameters<typeof owlTextureKey>[1][], frameRate: number) => {
      const key = `${role}-${name}`;
      if (scene.anims.exists(key)) return;
      scene.anims.create({
        key,
        frames: frames.map((frame) => ({ key: owlTextureKey(role, frame) })),
        frameRate,
        repeat: -1,
      });
    };
    anim('walk', ['walkA', 'walkB'], 8);
    anim('type', ['typeA', 'typeB'], 7);
    anim('flap', ['flap', 'stand'], 12);
    // Pisca de vez em quando: muitos quadros parados e um de olho fechado.
    anim('idle', ['stand', 'stand', 'stand', 'stand', 'stand', 'stand', 'stand', 'blink'], 3);
  }
}
