/**
 * Badges + traduction : verifie ce que voit vraiment l'utilisateur sur une page
 * de resultats StreetEasy.
 *
 *   node test/test-badges.js        # anglais (default_locale)
 *   node test/test-badges.js fr     # n'importe quelle langue de _locales/
 *
 * On stube le strict minimum de l'API extension : chrome.i18n lit les VRAIS
 * fichiers _locales (donc une cle oubliee dans une traduction se voit ici), et
 * chrome.runtime.sendMessage repond comme le service worker.
 */
"use strict";

const fs = require("fs");
const path = require("path");
const { JSDOM } = require("jsdom");

const ROOT = path.join(__dirname, "..");
const LOCALE = process.argv[2] || "en";

function loadMessages(locale) {
  const file = path.join(ROOT, "_locales", locale, "messages.json");
  if (!fs.existsSync(file)) throw new Error("langue inconnue : " + locale);
  return JSON.parse(fs.readFileSync(file, "utf8"));
}

const MESSAGES = loadMessages(LOCALE);
const FALLBACK = loadMessages("en");

// Reproduit la substitution de chrome.i18n : $NAME$ -> argument positionnel.
function getMessage(key, subs) {
  const entry = MESSAGES[key] || FALLBACK[key];
  if (!entry) return "";
  let out = entry.message;
  const args = subs == null ? [] : [].concat(subs);
  Object.keys(entry.placeholders || {}).forEach(function (name) {
    const idx = parseInt(String(entry.placeholders[name].content).replace("$", ""), 10) - 1;
    out = out.split("$" + name.toUpperCase() + "$").join(args[idx] == null ? "" : args[idx]);
  });
  return out;
}

const CARD = `
  <div class="card">
    <a href="https://streeteasy.com/building/the-set/12b">245 East 45th Street</a>
    <span>$3,500</span><span>1 bed</span>
  </div>`;

const dom = new JSDOM("<!doctype html><html><body>" + CARD + "</body></html>", {
  url: "https://streeteasy.com/for-rent/nyc",
  runScripts: "outside-only",
  pretendToBeVisual: true,
});
const { window } = dom;

// --- API extension, reduite a ce que le content script utilise ---
const sent = [];
window.chrome = {
  i18n: { getMessage: getMessage, getUILanguage: () => LOCALE },
  runtime: {
    lastError: null,
    sendMessage: function (msg, cb) {
      sent.push(msg);
      const verdict = msg.type === "CHECK_INSURENT"
        ? { status: "covered", matchType: "exact", matched: "245 E 45th St" }
        : { status: "not_listed", listSize: 12000 };
      setTimeout(() => cb({ ok: true, verdict: verdict }), 0);
    },
  },
  storage: { local: { get: (k, cb) => cb({}), set: (o, cb) => cb && cb() }, onChanged: { addListener() {} } },
};

// jsdom n'implemente pas IntersectionObserver : ici tout est "a l'ecran".
window.IntersectionObserver = class {
  constructor(cb) { this._cb = cb; }
  observe(el) { this._cb([{ isIntersecting: true, target: el }], this); }
  unobserve() {}
  disconnect() {}
};

function run(file) {
  window.eval(fs.readFileSync(path.join(ROOT, file), "utf8"));
}
run("shared.js");
run("content.js");

const assert = require("assert");

setTimeout(function () {
  const badges = window.document.querySelectorAll(".seg-badge");
  assert.strictEqual(badges.length, 2, "un badge Insurent + un badge TheGuarantors");

  const [ins, tg] = badges;
  assert.strictEqual(ins.querySelector(".seg-brand").textContent, getMessage("brandInsurent"));
  assert.strictEqual(tg.querySelector(".seg-brand").textContent, getMessage("brandTg"));

  // Les verdicts stubes plus haut : Insurent couvre, TheGuarantors non.
  assert.strictEqual(ins.querySelector(".seg-state").textContent, getMessage("statusAccepted"),
    "libelle Insurent traduit et a jour");
  assert.ok(ins.classList.contains("seg-ok"), "classe de couleur Insurent");
  assert.strictEqual(tg.querySelector(".seg-state").textContent, getMessage("statusNotListed"),
    "libelle TheGuarantors traduit et a jour");
  assert.ok(tg.classList.contains("seg-no"), "classe de couleur TheGuarantors");

  // Le detail s'ouvre, dans la meme langue, sans laisser de cle brute a l'ecran.
  ins.dispatchEvent(new window.MouseEvent("click", { bubbles: true }));
  const pop = window.document.getElementById("seg-pop");
  assert.ok(pop, "popover ouvert au clic sur le badge");
  assert.ok(pop.textContent.includes(getMessage("insMatchExact")), "verdict explique");
  assert.ok(pop.textContent.includes(getMessage("actionCopyAddress")), "actions traduites");
  assert.ok(!/^[a-z]+[A-Z]\w+$/m.test(pop.textContent.trim()), "aucune cle i18n brute affichee");

  // Aucun panneau de diagnostic : DEBUG est coupe en production.
  assert.strictEqual(window.document.getElementById("seg-diag"), null, "pas de panneau de diagnostic");

  console.log("OK badges [" + LOCALE + "] : 2 badges, verdicts traduits, popover traduit");
  // content.js garde un setInterval de re-attachement : sans sortie explicite,
  // le test resterait ouvert indefiniment.
  dom.window.close();
  process.exit(0);
}, 1500);
