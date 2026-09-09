/**
 * Pages d'extension (popup + reglages) : verifie qu'elles s'affichent sans
 * erreur et qu'il ne reste AUCUN libelle non traduit.
 *
 *   node test/test-pages.js         # anglais
 *   node test/test-pages.js fr      # une des langues de _locales/
 *
 * Le piege que ce test attrape : un attribut data-i18n dont la cle n'existe pas
 * dans messages.json. A l'ecran ca donne une zone vide ou le nom de la cle en
 * clair, et rien ne le signale au chargement.
 */
"use strict";

const fs = require("fs");
const path = require("path");
const assert = require("assert");
const { JSDOM } = require("jsdom");

const ROOT = path.join(__dirname, "..");
const LOCALE = process.argv[2] || "en";

const MESSAGES = JSON.parse(fs.readFileSync(path.join(ROOT, "_locales", LOCALE, "messages.json"), "utf8"));
const FALLBACK = JSON.parse(fs.readFileSync(path.join(ROOT, "_locales", "en", "messages.json"), "utf8"));

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

function openPage(htmlFile, scripts) {
  const html = fs.readFileSync(path.join(ROOT, htmlFile), "utf8");
  const dom = new JSDOM(html, { url: "chrome-extension://seg/" + htmlFile, runScripts: "outside-only" });
  const w = dom.window;
  const errors = [];
  w.chrome = {
    i18n: { getMessage: getMessage, getUILanguage: () => LOCALE },
    runtime: { openOptionsPage() {}, lastError: null, sendMessage(m, cb) { cb && cb({ ok: true }); } },
    storage: {
      local: { get: (k, cb) => cb({}), set: (o, cb) => cb && cb() },
      onChanged: { addListener() {} },
    },
  };
  scripts.forEach(function (f) {
    try { w.eval(fs.readFileSync(path.join(ROOT, f), "utf8")); }
    catch (e) { errors.push(f + " : " + e.message); }
  });
  return { dom: dom, window: w, errors: errors };
}

function checkPage(htmlFile, scripts) {
  const page = openPage(htmlFile, scripts);
  assert.deepStrictEqual(page.errors, [], "aucune erreur JS dans " + htmlFile);

  const doc = page.window.document;
  const nodes = doc.querySelectorAll("[data-i18n], [data-i18n-html], [data-i18n-placeholder], [data-i18n-title]");
  assert.ok(nodes.length > 5, htmlFile + " : les libelles passent bien par data-i18n");

  nodes.forEach(function (el) {
    const key = el.getAttribute("data-i18n") || el.getAttribute("data-i18n-html") ||
      el.getAttribute("data-i18n-placeholder") || el.getAttribute("data-i18n-title");
    assert.ok(MESSAGES[key] || FALLBACK[key], htmlFile + " : cle i18n inconnue -> " + key);
    const shown = el.hasAttribute("data-i18n-placeholder") ? el.placeholder
      : el.hasAttribute("data-i18n-title") ? el.title
        : el.textContent;
    assert.ok(shown && shown.trim(), htmlFile + " : libelle vide pour " + key);
    assert.notStrictEqual(shown.trim(), key, htmlFile + " : cle affichee telle quelle -> " + key);
  });

  page.dom.window.close();
  return nodes.length;
}

const nPopup = checkPage("popup.html", ["shared.js", "popup.js"]);
// options.html n'est plus declaree dans le manifest (elle ne configure que la
// file de demandes de visite, en sommeil). On continue de la tester : c'est ce
// qui garantit qu'elle reviendra traduite et intacte le jour ou on la rebranche.
const nOptions = checkPage("options.html", ["shared.js", "options.js"]);

console.log("OK pages [" + LOCALE + "] : popup " + nPopup + " libelles, reglages " + nOptions + " libelles");
process.exit(0);
