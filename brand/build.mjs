/**
 * Regenere toutes les images de la marque a partir des sources de brand/src/.
 *
 *   node brand/build.mjs
 *
 * Le rendu passe par Chrome en mode headless : c'est le meme moteur que celui
 * qui affichera les pastilles sur les pages, donc ce qui sort d'ici est ce que
 * l'utilisateur verra. Les gabarits importent d'ailleurs le vrai style.css.
 */

import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(HERE, "..");
const SRC = resolve(HERE, "src");

const CHROME_CANDIDATES = [
  process.env.CHROME_PATH,
  "C:/Program Files/Google/Chrome/Application/chrome.exe",
  "C:/Program Files (x86)/Google/Chrome/Application/chrome.exe",
  "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
  "/usr/bin/google-chrome",
  "/usr/bin/chromium",
].filter(Boolean);

const CHROME = CHROME_CANDIDATES.find((p) => existsSync(p));
if (!CHROME) {
  console.error("Chrome introuvable. Renseigne CHROME_PATH.");
  process.exit(1);
}

/** Une capture = un fichier source, une taille de fenetre, une sortie. */
function shoot(page, out, w, h, { transparent = false } = {}) {
  const abs = resolve(ROOT, out);
  mkdirSync(dirname(abs), { recursive: true });
  const args = [
    "--headless",
    "--disable-gpu",
    "--hide-scrollbars",
    "--force-device-scale-factor=1",
    `--screenshot=${abs.split(String.fromCharCode(92)).join("/")}`,
    `--window-size=${w},${h}`,
  ];
  // Les icones sont detourees : le fond de page ne doit pas boucher les angles.
  if (transparent) args.push("--default-background-color=00000000");
  args.push(page);
  execFileSync(CHROME, args, { stdio: "ignore" });
  console.log(`  ${out}  ${w}x${h}`);
}

const url = (file, query = "") =>
  pathToFileURL(resolve(SRC, file)).href + query;

// --------------------------------------------------------------- icones
// 16 et 32 px sortent du master allege : au format barre d'outils, les
// fenetres et le degrade de la marque principale se referment en bouillie.
console.log("icones");
const ICONS = [
  [16, "mark-small.svg"],
  [32, "mark-small.svg"],
  [48, "mark.svg"],
  [128, "mark.svg"],
];
for (const [size, svg] of ICONS) {
  shoot(url("icon.html", `?src=${svg}&size=${size}`), `icons/icon${size}.png`, size, size, {
    transparent: true,
  });
}
shoot(url("icon.html", "?src=mark.svg&size=128"), "store/icon-store-128.png", 128, 128, {
  transparent: true,
});

// ---------------------------------------------------------- captures store
console.log("captures (1280x800)");
const SHOTS = [
  [1, "verdict"],
  [2, "why"],
  [3, "states"],
  [4, "how"],
  [5, "privacy"],
];
for (const [n, slug] of SHOTS) {
  shoot(url(`shot-${n}.html`), `store/screenshot-${n}-${slug}.png`, 1280, 800);
}

// -------------------------------------------------------------- tuiles promo
console.log("tuiles promotionnelles");
shoot(url("promo-small.html"), "store/promo-small-440x280.png", 440, 280);
shoot(url("promo-marquee.html"), "store/promo-marquee-1400x560.png", 1400, 560);

console.log("\nOK.");
