/**
 * Construit le zip a deposer sur le Chrome Web Store.
 *
 *   node pack.mjs
 *
 * Le paquet ne contient que ce qui tourne. Le reste du depot (tests, notes de
 * developpement, sources de la marque, et le code en sommeil de la file de
 * demandes de visite) reste sur GitHub mais n'entre pas dans l'extension : du
 * code mort dans le paquet, c'est un examinateur qui se demande pourquoi une
 * extension de badges embarque un formulaire de contact.
 *
 * Ecrit son propre zip plutot que d'appeler Compress-Archive ou `zip` : une
 * dependance de moins, et surtout un resultat identique sur les trois OS.
 */

import { deflateRawSync } from "node:zlib";
import { readFileSync, writeFileSync, readdirSync, statSync, mkdirSync } from "node:fs";
import { dirname, join, resolve, relative } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = dirname(fileURLToPath(import.meta.url));

/** Ce que le manifest declare, et rien d'autre. */
const FILES = [
  "manifest.json",
  "background.js",
  "content.js",
  "shared.js",
  "popup.html",
  "popup.js",
  "pages.css",
  "style.css",
];
const DIRS = ["_locales", "icons"];

/* ------------------------------------------------------------------ *
 *  Ecriture du zip (methode deflate, sans dependance externe)
 * ------------------------------------------------------------------ */

const CRC_TABLE = (() => {
  const t = new Uint32Array(256);
  for (let i = 0; i < 256; i++) {
    let c = i;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[i] = c >>> 0;
  }
  return t;
})();

function crc32(buf) {
  let c = 0xffffffff;
  for (let i = 0; i < buf.length; i++) c = CRC_TABLE[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

/** Date MS-DOS. Fixee a une valeur stable pour que deux builds identiques
 *  produisent le meme octet, ce qui rend un diff de paquet lisible. */
const DOS_TIME = 0;
const DOS_DATE = ((2026 - 1980) << 9) | (1 << 5) | 1;

function zip(entries) {
  const locals = [];
  const central = [];
  let offset = 0;

  for (const { name, data } of entries) {
    const nameBuf = Buffer.from(name, "utf8");
    const comp = deflateRawSync(data, { level: 9 });
    const crc = crc32(data);

    const local = Buffer.alloc(30);
    local.writeUInt32LE(0x04034b50, 0);
    local.writeUInt16LE(20, 4);            // version minimale
    local.writeUInt16LE(0x0800, 6);        // drapeau : nom de fichier en UTF-8
    local.writeUInt16LE(8, 8);             // methode : deflate
    local.writeUInt16LE(DOS_TIME, 10);
    local.writeUInt16LE(DOS_DATE, 12);
    local.writeUInt32LE(crc, 14);
    local.writeUInt32LE(comp.length, 18);
    local.writeUInt32LE(data.length, 22);
    local.writeUInt16LE(nameBuf.length, 26);
    local.writeUInt16LE(0, 28);
    locals.push(local, nameBuf, comp);

    const cd = Buffer.alloc(46);
    cd.writeUInt32LE(0x02014b50, 0);
    cd.writeUInt16LE(20, 4);               // version d'ecriture
    cd.writeUInt16LE(20, 6);
    cd.writeUInt16LE(0x0800, 8);
    cd.writeUInt16LE(8, 10);
    cd.writeUInt16LE(DOS_TIME, 12);
    cd.writeUInt16LE(DOS_DATE, 14);
    cd.writeUInt32LE(crc, 16);
    cd.writeUInt32LE(comp.length, 20);
    cd.writeUInt32LE(data.length, 24);
    cd.writeUInt16LE(nameBuf.length, 28);
    cd.writeUInt32LE(0, 38);               // attributs externes
    cd.writeUInt32LE(offset, 42);
    central.push(cd, nameBuf);

    offset += 30 + nameBuf.length + comp.length;
  }

  const cdBuf = Buffer.concat(central);
  const end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0);
  end.writeUInt16LE(entries.length, 8);
  end.writeUInt16LE(entries.length, 10);
  end.writeUInt32LE(cdBuf.length, 12);
  end.writeUInt32LE(offset, 16);

  return Buffer.concat([...locals, cdBuf, end]);
}

/* ------------------------------------------------------------------ *
 *  Collecte
 * ------------------------------------------------------------------ */

function walk(dir, out = []) {
  for (const name of readdirSync(dir).sort()) {
    const full = join(dir, name);
    if (statSync(full).isDirectory()) walk(full, out);
    else out.push(full);
  }
  return out;
}

const entries = [];
for (const f of FILES) entries.push({ name: f, data: readFileSync(resolve(ROOT, f)) });
for (const d of DIRS) {
  for (const full of walk(resolve(ROOT, d))) {
    entries.push({
      name: relative(ROOT, full).split("\\").join("/"),
      data: readFileSync(full),
    });
  }
}

const version = JSON.parse(readFileSync(resolve(ROOT, "manifest.json"), "utf8")).version;
const outName = `guarantor-checker-${version}.zip`;
const outPath = resolve(ROOT, "dist", outName);
mkdirSync(dirname(outPath), { recursive: true });

const buf = zip(entries);
writeFileSync(outPath, buf);

for (const e of entries) console.log(`  ${e.name}`);
console.log(
  `\n${entries.length} fichiers, ${(buf.length / 1024).toFixed(1)} Ko -> dist/${outName}`
);
