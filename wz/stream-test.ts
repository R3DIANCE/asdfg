// Sprite streaming test: walk real animations and dump frames as PNGs.
import { SpriteStore } from "./store.ts";
import { WzFile, scoreVersion, VERSION_HASH_GMS_232 } from "./wzfile.ts";
import { WzCanvasProperty, WzSubProperty } from "./properties.ts";
import { canvasToPng } from "./canvas.ts";
import { writeFileSync, mkdirSync } from "node:fs";
import { join } from "node:path";

const CLIENT = "C:/Users/r3dia/Games/MapleStory-GMS-232.2";
const OUT = "C:/Users/r3dia/AppData/Local/hermes/cache/scratch/wz-stream-out";
mkdirSync(OUT, { recursive: true });

const store = new SpriteStore({ clientDir: CLIENT });
console.log("categories discovered:", store.categories.join(", "));

console.log("\n=== Character subdirs ===");
console.log(store.subdirs("Character").join(", "));

console.log("\n=== Mob: stream a real monster animation ===");
// Snail = 100100. Find which container holds it.
const mobIds = store.list("Mob");
console.log("Mob image count:", mobIds.length);
console.log("has 0100100?", mobIds.includes("0100100"));
const anim = store.animManifest("Mob", "0100100", "move", "/wz/sprite");
console.log(`0100100/move -> ${anim.length} frames`);
for (const f of anim.slice(0, 4)) {
  console.log(`   f${f.frame} ${f.w}x${f.h} origin=(${f.ox},${f.oy}) delay=${f.delay}ms`);
}

// Decode every frame of that animation.
if (anim.length) {
  const pngs: Buffer[] = [];
  for (const f of anim) {
    const png = store.spritePng("Mob", "0100100", f.path);
    if (png) pngs.push(png);
  }
  console.log(`  decoded ${pngs.length}/${anim.length} frames`);
  pngs.forEach((p, i) => writeFileSync(join(OUT, `snail-move-${i}.png`), p));
}

console.log("\n=== Character: equip icon + full body frame ===");
const capIds = store.list("Character").filter((i) => i.startsWith("0100"));
console.log("Cap-like ids:", capIds.length, capIds.slice(0, 5).join(", "));
const capPng = store.spritePng("Character", "01000000", "info/icon");
if (capPng) {
  writeFileSync(join(OUT, "cap-icon.png"), capPng);
  console.log(`  Cap/01000000 info/icon -> ${capPng.length}B`);
}

// Body: 00002000 is the standard male body.
const bodyImg = store.image("Character", "00002000");
if (bodyImg) {
  const r = bodyImg.image.parse();
  console.log("  body 00002000 anims:", r.children().map((c) => c.name).slice(0, 14).join(", "));
  const bodyAnim = store.animManifest("Character", "00002000", "stand1", "/wz/sprite");
  console.log(`  stand1 -> ${bodyAnim.length} frames`);
  for (const f of bodyAnim) {
    console.log(`     f${f.frame} ${f.w}x${f.h} origin=(${f.ox},${f.oy}) delay=${f.delay}`);
    const png = store.spritePng("Character", "00002000", `stand1/${f.frame}/0`);
    if (png) writeFileSync(join(OUT, `body-stand1-${f.frame}.png`), png);
  }
}

console.log("\n=== UI sprites ===");
console.log("UI images:", store.list("UI").length);

console.log("\n=== stats ===");
console.log(store.stats);
console.log("output:", OUT);
