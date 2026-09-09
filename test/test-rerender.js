/**
 * Regression : survivre au re-rendu de StreetEasy.
 *
 * Symptome observe en vrai : le bouton « Demander une visite » apparait une
 * seconde puis disparait, avec des erreurs React #418/#423 dans la console.
 * L'hydratation de StreetEasy echoue (elle trouve nos badges dans son arbre),
 * React re-rend tout et emporte notre UI au passage.
 *
 * Ce test simule ce re-rendu : on vide <main> et on recree les memes cartes,
 * puis on verifie que le bouton revient ET que les verdicts deja obtenus ne
 * sont pas perdus (le compteur ne doit pas retomber a zero).
 */
const fs = require("fs");
const path = require("path");
const { JSDOM } = require("jsdom");

const EXT = path.join(__dirname, "..");
const CARDS = [
  { addr: "100 East 10th Street", insurent: "covered", tg: "not_listed" },
  { addr: "200 West 20th Street", insurent: "not_listed", tg: "covered" },
  { addr: "300 Broadway", insurent: "not_listed", tg: "not_listed" },
];

const cardsHtml = () => CARDS.map((c, i) => `
  <article><a href="https://streeteasy.com/rental/${3000 + i}">
    <span class="listingCard-addressLabel">${c.addr}</span></a>
  <span>$3,400</span><span>1 bed</span></article>`).join("");

const dom = new JSDOM(`<!DOCTYPE html><html><body><main>${cardsHtml()}</main></body></html>`,
  { url: "https://streeteasy.com/for-rent/nyc", runScripts: "outside-only" });
const w = dom.window, d = w.document;
w.Element.prototype.getBoundingClientRect = () => ({ width: 200, height: 30, top: 0, left: 0, right: 200, bottom: 30 });
w.IntersectionObserver = class {
  constructor(cb) { this.cb = cb; }
  observe(el) { this.cb([{ isIntersecting: true, target: el }], this); }
  unobserve() {} disconnect() {}
};

let checks = 0;
const verdict = (address, kind) => {
  const c = CARDS.find((x) => address.indexOf(x.addr.split(" ")[0]) === 0);
  checks++;
  return c ? { status: kind === "tg" ? c.tg : c.insurent } : { status: "error" };
};
const store = { seg_profile: { name: "R", email: "r@ex.com" } };
w.chrome = {
  runtime: {
    lastError: null,
    sendMessage: (msg, cb) => {
      if (msg.type === "CHECK_INSURENT") cb({ ok: true, verdict: verdict(msg.address, "insurent") });
      else if (msg.type === "CHECK_GUARANTORS") cb({ ok: true, verdict: verdict(msg.address, "tg") });
      else cb({ ok: true });
    },
  },
  storage: {
    local: {
      get: (keys, cb) => { const o = {}; [].concat(keys).forEach((k) => { if (k in store) o[k] = store[k]; }); cb(o); },
      set: (o, cb) => cb && cb(),
    },
    onChanged: { addListener() {} },
  },
};
w.navigator.clipboard = { writeText: () => Promise.resolve() };
for (const f of ["shared.js", "content.js"]) w.eval(fs.readFileSync(path.join(EXT, f), "utf8"));

const results = [];
const check = (l, ok) => { results.push((ok ? "✅ " : "❌ ") + l); return ok; };
const fabText = () => {
  const f = d.getElementById("seg-tour-fab");
  return f && f.isConnected ? f.textContent : "(absent)";
};

setTimeout(() => {
  console.log("1. au chargement          :", fabText());
  check("bouton present au depart avec 2 annonces", /\(2\)/.test(fabText()));

  // --- LE re-rendu : React remplace tout le contenu de <main> ---
  console.log("\n>>> re-rendu React : <main> est vide puis recree");
  d.querySelector("main").innerHTML = cardsHtml();
  const fabAfterWipe = d.getElementById("seg-tour-fab");
  console.log("2. juste apres le wipe    :", fabAfterWipe && fabAfterWipe.isConnected ? "toujours attache" : "DETACHE");

  // Cas le plus dur : la page efface aussi notre bouton.
  if (fabAfterWipe) fabAfterWipe.remove();
  console.log("3. bouton retire de force  :", fabText());

  setTimeout(() => {
    console.log("4. apres la surveillance   :", fabText());
    check("bouton re-attache automatiquement", fabText() !== "(absent)");
    check("compteur conserve apres re-rendu (pas de retour a zero)", /\(2\)/.test(fabText()));

    const fab = d.getElementById("seg-tour-fab");
    fab.click();
    const rows = [...d.querySelectorAll("#seg-tour-panel .seg-trow")];
    console.log("5. annonces dans le panneau:", rows.map((r) => r.querySelector(".seg-tadr").textContent).join(", "));
    check("pas de doublon apres re-rendu", rows.length === 2);

    results.forEach((r) => console.log(r));
    console.log(results.every((r) => r.startsWith("✅")) ? "\nTOUT PASSE" : "\nECHEC");
    process.exit(results.every((r) => r.startsWith("✅")) ? 0 : 1);
  }, 2500);
}, 2500);
