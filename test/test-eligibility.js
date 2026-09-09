/**
 * Un seul garant suffit : une annonce entre dans la file si Insurent OU
 * TheGuarantors la couvre.
 *
 * Teste content.js sur une page de resultats simulee, avec les combinaisons
 * qui comptent — et au passage le parsing du loyer, la ou "$3,500" et "1 bed"
 * se retrouvent colles dans le texte.
 */
const fs = require("fs");
const path = require("path");
const { JSDOM } = require("jsdom");

const EXT = path.join(__dirname, "..");

// Chaque carte : adresse, prix, verdicts renvoyes par le service worker.
const CARDS = [
  { addr: "100 East 10th Street", price: "$3,500", beds: "1 bed", insurent: "covered", tg: "not_listed", eligible: true, why: "Insurent seul" },
  { addr: "200 West 20th Street", price: "$4,200", beds: "2 beds", insurent: "not_listed", tg: "covered", eligible: true, why: "TheGuarantors seul" },
  { addr: "300 Broadway", price: "$2,900", beds: "studio", insurent: "not_listed", tg: "not_listed", eligible: false, why: "aucun garant" },
  { addr: "400 Park Avenue", price: "$5,100", beds: "1 bed", insurent: "maybe", tg: "not_listed", eligible: true, why: "Insurent a confirmer" },
];

// Prix et chambres colles, comme sur le vrai StreetEasy (pas d'espace entre
// les elements) : c'est ce qui faisait lire "$3,5001 bed" -> 35001.
const cardsHtml = CARDS.map((c, i) => `
  <article class="listingCard">
    <a href="https://streeteasy.com/rental/${1000 + i}">
      <span class="listingCard-addressLabel">${c.addr}</span>
    </a>
    <span class="price">${c.price}</span><span class="beds">${c.beds}</span>
  </article>`).join("");

const dom = new JSDOM(
  `<!DOCTYPE html><html><body><main>${cardsHtml}</main></body></html>`,
  { url: "https://streeteasy.com/for-rent/nyc", runScripts: "outside-only" }
);
const w = dom.window, d = w.document;
w.Element.prototype.getBoundingClientRect = () => ({ width: 200, height: 30, top: 0, left: 0, right: 200, bottom: 30 });

// jsdom n'a pas d'IntersectionObserver : on declenche la verification tout de suite.
w.IntersectionObserver = class {
  constructor(cb) { this.cb = cb; }
  observe(el) { this.cb([{ isIntersecting: true, target: el }], this); }
  unobserve() {}
  disconnect() {}
};

function verdictFor(address, kind) {
  const c = CARDS.find((x) => address.indexOf(x.addr.split(" ")[0]) === 0) ||
    CARDS.find((x) => x.addr === address);
  if (!c) return { status: "error", reason: "carte inconnue" };
  return { status: kind === "tg" ? c.tg : c.insurent, matched: c.addr };
}

w.chrome = {
  runtime: {
    lastError: null,
    getURL: (p) => p,
    sendMessage: (msg, cb) => {
      if (msg.type === "CHECK_INSURENT") cb({ ok: true, verdict: verdictFor(msg.address, "insurent") });
      else if (msg.type === "CHECK_GUARANTORS") cb({ ok: true, verdict: verdictFor(msg.address, "tg") });
      else cb({ ok: true });
    },
  },
  storage: {
    local: {
      get: (keys, cb) => {
        const store = { seg_profile: { name: "Alex", email: "r@ex.com" } };
        const out = {};
        [].concat(keys).forEach((k) => { if (k in store) out[k] = store[k]; });
        cb(out);
      },
      set: (o, cb) => cb && cb(),
    },
    onChanged: { addListener() {} },
  },
};
w.navigator.clipboard = { writeText: () => Promise.resolve() };

for (const f of ["shared.js", "content.js"]) w.eval(fs.readFileSync(path.join(EXT, f), "utf8"));

setTimeout(() => {
  const results = [];
  const check = (l, ok) => results.push((ok ? "✅ " : "❌ ") + l);

  const fab = d.getElementById("seg-tour-fab");
  console.log("bouton flottant :", fab && fab.textContent);

  fab.click(); // ouvre le panneau
  const rows = [...d.querySelectorAll("#seg-tour-panel .seg-trow")].map((r) => ({
    text: r.querySelector(".seg-tadr").textContent,
    meta: r.querySelector(".seg-tmeta").textContent,
  }));
  console.log("annonces retenues :");
  rows.forEach((r) => console.log("   -", r.text, "|", r.meta));

  const expected = CARDS.filter((c) => c.eligible);
  check(`${expected.length} annonces eligibles`, rows.length === expected.length);
  expected.forEach((c) => {
    check(`retenue : ${c.addr} (${c.why})`, rows.some((r) => r.text.indexOf(c.addr) !== -1));
  });
  CARDS.filter((c) => !c.eligible).forEach((c) => {
    check(`ecartee : ${c.addr} (${c.why})`, !rows.some((r) => r.text.indexOf(c.addr) !== -1));
  });
  check("compteur du bouton coherent", fab.textContent.indexOf("(" + expected.length + ")") !== -1);
  check("loyer lu correctement malgre le collage prix+chambres ($3,500 et pas $35,001)",
    rows.some((r) => r.meta.indexOf("$3,500") !== -1) && !rows.some((r) => /\$35,00/.test(r.meta)));

  const sub = d.querySelector("#seg-tour-panel .seg-tsub");
  check("le filtre affiche bien « ou TheGuarantors »", !!sub && /ou<\/b> TheGuarantors/.test(sub.innerHTML));

  results.forEach((r) => console.log(r));
  console.log(results.every((r) => r.startsWith("✅")) ? "\nTOUT PASSE" : "\nECHEC");
}, 2500);
