// Smoke test: open the real GMS v232.2 build with the TS port and pull sprites.
import { WzFile, WzClient, scoreVersion, VERSION_HASH_GMS_232, WzImage, WzDirectory } from "./wzfile.ts";
import { canvasToPng } from "./canvas.ts";
import { WzCanvasProperty, WzSubProperty, resolveUol, type WzProperty } from "./properties.ts";
import { writeFileSync, mkdirSync, readdirSync } from "node:fs";
import { join } from "node:path";

const ROOT = "C:/Users/r3dia/Games/MapleStory-GMS-232.2";
const OUT = "C:/Users/r3dia/AppData/Local/hermes/cache/scratch/wz-ts-out";
mkdirSync(OUT, { recursive: true });

console.log("=== 1. version hash verification ===");
console.log("hash for 777 =", "0x" + VERSION_HASH_GMS_232.toString(16));
for (const f of ["String.wz", "Mob.wz", "Character.wz", "Item.wz", "Map.wz"]) {
  const s = scoreVersion(join(ROOT, f), VERSION_HASH_GMS_232);
  console.log(`  ${f.padEnd(16)} score=${(s * 100).toFixed(1)}%`);
}

console.log("\n=== 2. open String.wz and read real strings ===");
const str = WzFile.open(join(ROOT, "String.wz"));
console.log("  header:", str.header.ident, "fStart", str.header.fStart, "copyright:", str.header.copyright.slice(0, 30));
console.log("  images:", str.root.imageCount, [...str.root.images.keys()].slice(0, 6).join(", "));

const mobImg = str.root.images.get("Mob.img");
if (mobImg) {
  const root = mobImg.parse();
  console.log("  Mob.img top-level children:", root.children().length);
  const first = root.children().slice(0, 3);
  for (const c of first) {
    const nm = (c as WzSubProperty).child("name");
    console.log(`    ${c.name} -> name="${nm?.value}"`);
  }
}

console.log("\n=== 3. open Mob.wz and decode a monster sprite ===");
const mob = WzFile.open(join(ROOT, "Mob.wz"));
console.log("  mob images:", mob.root.imageCount);
const keys = [...mob.root.images.keys()].slice(0, 5);
console.log("  first images:", keys.join(", "));

// 100100 = snail. Its .img lives in Mob.wz or Mob001/002.
for (const [fname, file] of [["Mob.wz", mob], ["Mob001.wz", WzFile.open(join(ROOT, "Mob001.wz"))], ["Mob002.wz", WzFile.open(join(ROOT, "Mob002.wz"))], ["Mob2.wz", WzFile.open(join(ROOT, "Mob2.wz"))]] as const) {
  const img = file.root.images.get("100100.img");
  if (!img) continue;
  console.log(`  100100.img found in ${fname} @ ${img.offset}`);
  const r = img.parse();
  console.log("  top children:", r.children().map((c) => c.name).join(", "));
  const stand = r.child("stand");
  if (stand instanceof WzSubProperty) {
    const frame0 = stand.child("0");
    console.log("  stand frames:", stand.children().length);
    if (frame0 instanceof WzSubProperty) {
      const canvas = frame0.child("0");
      if (canvas instanceof WzCanvasProperty) {
        console.log(`  canvas ${canvas.width}x${canvas.height} fmt=${canvas.format}+${canvas.format2} bytes=${canvas.pngLength}`);
        mkdirSync(OUT, { recursive: true });
        const png = canvasToPng(canvas, file.reader.key);
        writeFileSync(join(OUT, "snail-stand0.png"), png);
        console.log(`  wrote snail-stand0.png (${png.length} bytes)`);
      }
      const origin = frame0.child("origin");
      if (origin) console.log("  origin:", (origin as any).x, (origin as any).y);
    }
  }
  break;
}

console.log("\n=== 4. open Character.wz and decode an equip icon ===");
const chr = WzFile.open(join(ROOT, "Character.wz"));
console.log("  character subdirs:", [...chr.root.subdirs.keys()].slice(0, 10).join(", "));
console.log("  character images at root:", [...chr.root.images.keys()].slice(0, 5).join(", "));
const capDir = chr.root.subdirs.get("Cap");
if (capDir) {
  console.log("  Cap images:", capDir.imageCount, [...capDir.images.keys()].slice(0, 4).join(", "));
  const cap = capDir.images.get("01000000.img");
  if (cap) {
    const r = cap.parse();
    console.log("  Cap/01000000.img children:", r.children().map((c) => c.name).join(", "));
    const info = r.child("info");
    if (info instanceof WzSubProperty) {
      const icon = info.child("icon");
      if (icon instanceof WzCanvasProperty) {
        console.log(`  icon ${icon.width}x${icon.height} fmt=${icon.format}`);
        const png = canvasToPng(icon, chr.reader.key);
        writeFileSync(join(OUT, "cap-01000000-icon.png"), png);
        console.log(`  wrote cap-01000000-icon.png (${png.length} bytes)`);
      }
    }
  }
}
