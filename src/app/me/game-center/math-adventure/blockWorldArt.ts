import {
  type Coin,
  type Enemy,
  type ItemDrop,
  type MysteryBox,
  type Player,
  type Projectile,
  type Rect,
  type Stage,
  VIEW_H,
  VIEW_W,
} from "./blockWorldData";

export type DrawState = {
  stage: Stage;
  camera: number;
  player: Player;
  coins: Coin[];
  enemies: Enemy[];
  boxes: MysteryBox[];
  items: ItemDrop[];
  projectiles: Projectile[];
  now: number;
  invincibleUntil: number;
  armored: boolean;
  hasBlaster: boolean;
};

function pixelRect(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  color: string,
) {
  ctx.fillStyle = color;
  ctx.fillRect(Math.round(x), Math.round(y), Math.round(w), Math.round(h));
}

function drawCubeFace(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  size: number,
  front: string,
  top: string,
  side: string,
) {
  pixelRect(ctx, x, y, size, size, front);
  pixelRect(ctx, x, y, size, 3, top);
  pixelRect(ctx, x + size - 3, y + 3, 3, size - 3, side);
  pixelRect(ctx, x + 2, y + 5, 3, 3, "rgba(255,255,255,0.13)");
  pixelRect(ctx, x + 8, y + 10, 4, 3, "rgba(0,0,0,0.12)");
}

function drawSquareCloud(ctx: CanvasRenderingContext2D, x: number, y: number, color: string) {
  pixelRect(ctx, x + 10, y, 24, 7, color);
  pixelRect(ctx, x, y + 7, 48, 10, color);
  pixelRect(ctx, x + 7, y + 17, 34, 5, color);
  pixelRect(ctx, x + 35, y + 9, 18, 8, color);
}

function drawBackground(ctx: CanvasRenderingContext2D, stage: Stage, camera: number, now: number) {
  const gradient = ctx.createLinearGradient(0, 0, 0, VIEW_H);
  gradient.addColorStop(0, stage.palette.skyTop);
  gradient.addColorStop(1, stage.palette.skyBottom);
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, VIEW_W, VIEW_H);

  if (stage.weather === "day") {
    pixelRect(ctx, 258, 24, 24, 24, "#ffe36b");
    pixelRect(ctx, 262, 28, 16, 16, "#fff29b");
    drawSquareCloud(ctx, 30 - ((camera * 0.1) % 390), 34, stage.palette.cloud);
    drawSquareCloud(ctx, 205 - ((camera * 0.07) % 430), 57, stage.palette.cloud);
    drawSquareCloud(ctx, 390 - ((camera * 0.1) % 390), 26, stage.palette.cloud);
  } else if (stage.weather === "cave") {
    for (let i = 0; i < 15; i += 1) {
      const x = ((i * 41 - camera * 0.05) % 380 + 380) % 380;
      const h = 12 + ((i * 13) % 26);
      pixelRect(ctx, x, 0, 12, h, stage.palette.stoneDark);
      pixelRect(ctx, x + 3, h, 6, 8, stage.palette.stone);
    }
    for (let i = 0; i < 18; i += 1) {
      const x = ((i * 57 - camera * 0.08) % 390 + 390) % 390;
      const y = 25 + ((i * 29) % 95);
      pixelRect(ctx, x, y, 3, 5, i % 3 === 0 ? stage.palette.ore : stage.palette.fog);
    }
  } else {
    pixelRect(ctx, 250, 26, 28, 28, "#ff8a3d");
    pixelRect(ctx, 255, 31, 18, 18, "#ffd25d");
    for (let i = 0; i < 24; i += 1) {
      const x = ((i * 47 - camera * 0.11) % 360 + 360) % 360;
      const y = 20 + ((i * 31 + Math.floor(now / 80)) % 125);
      pixelRect(ctx, x, y, i % 4 === 0 ? 3 : 2, i % 4 === 0 ? 3 : 2, "#ff8747");
    }
  }

  const farOffset = -((camera * 0.16) % 160);
  for (let i = -1; i < 4; i += 1) {
    const x = farOffset + i * 160;
    pixelRect(ctx, x + 8, 148, 144, 60, stage.palette.farBlock);
    pixelRect(ctx, x + 28, 130, 104, 78, stage.palette.farBlock);
    pixelRect(ctx, x + 48, 114, 64, 94, stage.palette.farBlock);
    for (let bx = 0; bx < 7; bx += 1) {
      pixelRect(ctx, x + 24 + bx * 16, 160 + (bx % 2) * 8, 12, 8, "rgba(255,255,255,0.07)");
    }
  }

  const nearOffset = -((camera * 0.29) % 210);
  for (let i = -1; i < 4; i += 1) {
    const x = nearOffset + i * 210;
    pixelRect(ctx, x + 4, 176, 190, 32, stage.palette.nearBlock);
    pixelRect(ctx, x + 36, 156, 128, 52, stage.palette.nearBlock);
    pixelRect(ctx, x + 68, 142, 64, 66, stage.palette.nearBlock);
  }

  if (stage.weather === "day") {
    const treeOffset = -((camera * 0.45) % 270);
    for (let i = -1; i < 4; i += 1) {
      const x = treeOffset + i * 270 + 92;
      pixelRect(ctx, x + 15, 154, 14, 54, stage.palette.woodDark);
      pixelRect(ctx, x + 2, 126, 42, 34, "#3d8f45");
      pixelRect(ctx, x - 8, 140, 60, 24, "#4fa956");
      pixelRect(ctx, x + 10, 116, 28, 20, "#62ba62");
    }
  }
}

function drawGroundBlock(ctx: CanvasRenderingContext2D, x: number, y: number, stage: Stage) {
  pixelRect(ctx, x, y, 16, 16, stage.palette.dirt);
  pixelRect(ctx, x, y, 16, 5, stage.palette.grass);
  pixelRect(ctx, x, y + 5, 16, 2, "rgba(61,77,38,0.45)");
  pixelRect(ctx, x + 3, y + 9, 4, 3, stage.palette.dirtDark);
  pixelRect(ctx, x + 11, y + 13, 3, 2, stage.palette.dirtDark);
  pixelRect(ctx, x + 9, y + 7, 2, 2, "rgba(255,255,255,0.12)");
}

function drawStoneBlock(ctx: CanvasRenderingContext2D, x: number, y: number, stage: Stage, ore = false) {
  drawCubeFace(ctx, x, y, 16, stage.palette.stone, "#aab1b7", stage.palette.stoneDark);
  pixelRect(ctx, x + 3, y + 9, 5, 2, stage.palette.stoneDark);
  pixelRect(ctx, x + 10, y + 5, 3, 3, stage.palette.stoneDark);
  if (ore) {
    pixelRect(ctx, x + 3, y + 4, 4, 4, stage.palette.ore);
    pixelRect(ctx, x + 10, y + 10, 3, 3, stage.palette.ore);
    pixelRect(ctx, x + 7, y + 8, 2, 2, "#eaffff");
  }
}

function drawWoodBlock(ctx: CanvasRenderingContext2D, x: number, y: number, stage: Stage) {
  drawCubeFace(ctx, x, y, 16, stage.palette.wood, "#c98b53", stage.palette.woodDark);
  pixelRect(ctx, x + 7, y + 3, 2, 11, stage.palette.woodDark);
  pixelRect(ctx, x + 2, y + 7, 12, 2, "rgba(255,255,255,0.12)");
}

function drawSolid(ctx: CanvasRenderingContext2D, solid: Rect, stage: Stage, camera: number, now: number) {
  const startX = Math.round(solid.x - camera);
  if (startX > VIEW_W || startX + solid.w < 0) return;

  if (solid.kind === "lava") {
    for (let tx = 0; tx < solid.w; tx += 16) {
      const x = startX + tx;
      pixelRect(ctx, x, solid.y, Math.min(16, solid.w - tx), 16, "#d94324");
      pixelRect(ctx, x, solid.y + ((Math.floor(now / 120) + tx / 16) % 2) * 2, 16, 5, "#ffb13d");
      pixelRect(ctx, x + 4, solid.y + 7, 7, 3, "#ffea75");
    }
    return;
  }

  for (let tx = 0; tx < solid.w; tx += 16) {
    for (let ty = 0; ty < solid.h; ty += 16) {
      const x = startX + tx;
      const y = solid.y + ty;
      if (solid.kind === "ground") drawGroundBlock(ctx, x, y, stage);
      else if (solid.kind === "stone") drawStoneBlock(ctx, x, y, stage, false);
      else if (solid.kind === "ore") drawStoneBlock(ctx, x, y, stage, true);
      else drawWoodBlock(ctx, x, y, stage);
    }
  }
}

function drawMysteryBox(ctx: CanvasRenderingContext2D, box: MysteryBox, stage: Stage, camera: number, now: number) {
  const x = Math.round(box.x - camera);
  if (x < -20 || x > VIEW_W + 20) return;
  const bump = now < box.bumpUntil ? -3 : 0;
  const y = box.y + bump;
  if (box.used) {
    drawCubeFace(ctx, x, y, 16, "#6e675f", "#8b8379", "#49443f");
    pixelRect(ctx, x + 5, y + 5, 6, 6, "#4f4a45");
    return;
  }
  drawCubeFace(ctx, x, y, 16, stage.palette.accent, "#ffad59", "#a53a20");
  pixelRect(ctx, x + 5, y + 3, 6, 3, "#fff0b5");
  pixelRect(ctx, x + 7, y + 6, 3, 4, "#fff0b5");
  pixelRect(ctx, x + 7, y + 12, 3, 2, "#fff0b5");
}

function drawCoin(ctx: CanvasRenderingContext2D, coin: Coin, camera: number, now: number) {
  if (coin.collected) return;
  const x = Math.round(coin.x - camera);
  if (x < -12 || x > VIEW_W + 12) return;
  const narrow = Math.floor(now / 130) % 4 === 0;
  pixelRect(ctx, x - (narrow ? 1 : 5), coin.y - 6, narrow ? 2 : 10, 12, "#f3bd28");
  pixelRect(ctx, x - (narrow ? 0 : 3), coin.y - 4, narrow ? 1 : 5, 8, "#ffe97a");
  if (!narrow) pixelRect(ctx, x + 3, coin.y - 3, 2, 6, "#9a6712");
}

function drawEnemy(ctx: CanvasRenderingContext2D, enemy: Enemy, camera: number, now: number) {
  if (!enemy.alive) return;
  const x = Math.round(enemy.x - camera);
  if (x < -20 || x > VIEW_W + 20) return;
  const bob = Math.floor(now / 180) % 2;
  const colors = enemy.color === "green"
    ? ["#4fbf67", "#237b45", "#183d2a"]
    : enemy.color === "red"
      ? ["#d95842", "#8d2d2b", "#481a20"]
      : ["#9a5ac6", "#61368c", "#301c49"];
  drawCubeFace(ctx, x, enemy.y + bob, 14, colors[0], colors[1], colors[2]);
  pixelRect(ctx, x + 3, enemy.y + 4 + bob, 3, 3, "#fff");
  pixelRect(ctx, x + 9, enemy.y + 4 + bob, 3, 3, "#fff");
  pixelRect(ctx, x + 4, enemy.y + 5 + bob, 1, 2, "#17202a");
  pixelRect(ctx, x + 10, enemy.y + 5 + bob, 1, 2, "#17202a");
  pixelRect(ctx, x + 4, enemy.y + 11 + bob, 6, 2, colors[2]);
}

function drawItem(ctx: CanvasRenderingContext2D, item: ItemDrop, camera: number, now: number) {
  if (!item.active) return;
  const x = Math.round(item.x - camera);
  const y = Math.round(item.y + Math.sin((now + item.id * 80) / 160) * 1.5);
  if (x < -20 || x > VIEW_W + 20) return;

  if (item.kind === "growth") {
    pixelRect(ctx, x + 2, y, 12, 5, "#e64b3f");
    pixelRect(ctx, x, y + 4, 16, 6, "#d63c35");
    pixelRect(ctx, x + 3, y + 2, 3, 3, "#fff4d9");
    pixelRect(ctx, x + 10, y + 5, 3, 3, "#fff4d9");
    pixelRect(ctx, x + 5, y + 10, 7, 6, "#e9c29a");
    pixelRect(ctx, x + 7, y + 12, 1, 2, "#27313b");
    pixelRect(ctx, x + 10, y + 12, 1, 2, "#27313b");
  } else if (item.kind === "blaster") {
    drawCubeFace(ctx, x + 1, y + 2, 14, "#31c9c2", "#83f0e9", "#187f86");
    pixelRect(ctx, x + 13, y + 6, 7, 5, "#133e50");
    pixelRect(ctx, x + 5, y + 13, 5, 5, "#28445a");
    pixelRect(ctx, x + 4, y + 5, 4, 4, "#e8ffff");
  } else {
    pixelRect(ctx, x + 7, y, 4, 18, "#76f3ff");
    pixelRect(ctx, x + 2, y + 5, 14, 8, "#4fd2f2");
    pixelRect(ctx, x + 4, y + 3, 10, 12, "#7df7ff");
    pixelRect(ctx, x + 7, y + 4, 3, 7, "#eaffff");
  }
}

function drawProjectile(ctx: CanvasRenderingContext2D, projectile: Projectile, camera: number) {
  if (!projectile.active) return;
  const x = Math.round(projectile.x - camera);
  pixelRect(ctx, x, projectile.y, 7, 5, "#5ff7ef");
  pixelRect(ctx, x + 2, projectile.y + 1, 5, 3, "#e9ffff");
}

function drawPortal(ctx: CanvasRenderingContext2D, stage: Stage, camera: number, now: number) {
  const x = Math.round(stage.portalX - camera);
  if (x < -60 || x > VIEW_W + 70) return;
  for (let by = 0; by < 7; by += 1) {
    drawCubeFace(ctx, x, 96 + by * 16, 16, "#26202e", "#4d4359", "#121018");
    drawCubeFace(ctx, x + 48, 96 + by * 16, 16, "#26202e", "#4d4359", "#121018");
  }
  for (let bx = 0; bx < 4; bx += 1) {
    drawCubeFace(ctx, x + bx * 16, 96, 16, "#26202e", "#4d4359", "#121018");
  }
  const pulse = 0.55 + Math.sin(now / 180) * 0.18;
  ctx.fillStyle = `rgba(151, 80, 255, ${pulse})`;
  ctx.fillRect(x + 16, 112, 32, 96);
  for (let i = 0; i < 6; i += 1) {
    const py = 118 + ((Math.floor(now / 55) + i * 17) % 82);
    pixelRect(ctx, x + 20 + (i % 3) * 9, py, 3, 5, "#efc8ff");
  }
}

function drawPlayer(
  ctx: CanvasRenderingContext2D,
  player: Player,
  camera: number,
  now: number,
  invincibleUntil: number,
  armored: boolean,
  hasBlaster: boolean,
) {
  const x = Math.round(player.x - camera);
  const y = Math.round(player.y);
  if (now < invincibleUntil && Math.floor(now / 80) % 2 === 0) return;
  const running = Math.abs(player.vx) > 20 && player.onGround;
  const step = running ? Math.floor(now / 95) % 2 : 0;

  ctx.save();
  if (player.facing < 0) {
    ctx.translate(x + player.w, 0);
    ctx.scale(-1, 1);
    ctx.translate(-x, 0);
  }

  if (armored) {
    pixelRect(ctx, x + 2, y - 1, 11, 5, "#4fcfe1");
    pixelRect(ctx, x + 1, y + 4, 13, 7, "#2a9fb9");
    pixelRect(ctx, x + 4, y + 5, 7, 5, "#9ff7ff");
  } else {
    pixelRect(ctx, x + 2, y, 11, 5, "#f26522");
    pixelRect(ctx, x + 1, y + 4, 13, 7, "#f0b17c");
    pixelRect(ctx, x + 4, y + 5, 7, 5, "#f7cc9f");
  }
  pixelRect(ctx, x + 10, y + 6, 2, 2, "#17202a");
  pixelRect(ctx, x + 2, y + 11, 10, 6, armored ? "#188fa4" : "#28ad91");
  pixelRect(ctx, x, y + 12, 3, 5, armored ? "#61e7f4" : "#f0b17c");
  if (hasBlaster) {
    pixelRect(ctx, x + 11, y + 11, 7, 5, "#31c9c2");
    pixelRect(ctx, x + 17, y + 12, 4, 3, "#e9ffff");
  } else {
    pixelRect(ctx, x + 11, y + 12, 3, 5, armored ? "#61e7f4" : "#f0b17c");
  }
  pixelRect(ctx, x + 3, y + 17, 4, 3, "#35465a");
  pixelRect(ctx, x + 8, y + 17, 4, 3, "#35465a");
  pixelRect(ctx, x + (step ? 1 : 2), y + 20, 5, 2, "#1d2530");
  pixelRect(ctx, x + (step ? 8 : 7), y + 20, 5, 2, "#1d2530");
  ctx.restore();
}

export function drawBlockWorld(ctx: CanvasRenderingContext2D, state: DrawState) {
  const { stage, camera, now } = state;
  drawBackground(ctx, stage, camera, now);
  for (const solid of stage.solids) drawSolid(ctx, solid, stage, camera, now);
  for (const box of state.boxes) drawMysteryBox(ctx, box, stage, camera, now);
  for (const coin of state.coins) drawCoin(ctx, coin, camera, now);
  for (const enemy of state.enemies) drawEnemy(ctx, enemy, camera, now);
  for (const item of state.items) drawItem(ctx, item, camera, now);
  for (const projectile of state.projectiles) drawProjectile(ctx, projectile, camera);
  drawPortal(ctx, stage, camera, now);
  drawPlayer(
    ctx,
    state.player,
    camera,
    now,
    state.invincibleUntil,
    state.armored,
    state.hasBlaster,
  );
}
