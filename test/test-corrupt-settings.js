/**
 * Regression : le bouton de la file ne doit JAMAIS disparaitre en silence.
 *
 * Cas reproduit : des reglages sauvegardes par une version anterieure de la page
 * d'options, ou `statuses` vaut undefined. Object.assign recopiait cet undefined
 * par-dessus le defaut, `statuses.indexOf(...)` levait une TypeError dans une
 * promesse, et le bouton n'etait jamais cree — sans le moindre message.
 */
const fs = require("fs");
const path = require("path");
const { JSDOM } = require("jsdom");

const EXT = path.join(__dirname, "..");

const CARDS = [
  { addr: "100 East 10th Street", insurent: "covered", tg: "not_listed" },
  { addr: "200 West 20th Street", insurent: "not_listed", tg: "covered" },
];

function run(storedCriteria, label, expect) {
  return new Promise((resolve) => {
    const html = CARDS.map((c, i) => `
      <article><a href="https://streeteasy.com/rental/${2000 + i}">
        <span class="listingCard-addressLabel">${c.addr}</span></a>
      <span>$3,500</span><span>1 bed</span></article>`).join("");

    const dom = new JSDOM(`<!DOCTYPE html><html><body><main>${html}</main></body></html>`,
      { url: "https://streeteasy.com/for-rent/nyc", runScripts: "outside-only" });
    const w = dom.window, d = w.document;
    w.Element.prototype.getBoundingClientRect = () => ({ width: 200, height: 30, top: 0, left: 0, right: 200, bottom: 30 });
    w.IntersectionObserver = class {
      constructor(cb) { this.cb = cb; }
      observe(el) { this.cb([{ isIntersecting: true, target: el }], this); }
      unobserve() {} disconnect() {}
    };

    const verdict = (address, kind) => {
      const c = CARDS.find((x) => address.indexOf(x.addr.split(" ")[0]) === 0);
      return c ? { status: kind === "tg" ? c.tg : c.insurent } : { status: "error" };
    };
    const store = { seg_profile: { name: "R", email: "r@ex.com" }, seg_criteria: storedCriteria };

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

    setTimeout(() => {
      const fab = d.getElementById("seg-tour-fab");
      console.log(`\n### ${label}`);
      console.log("   bouton :", fab ? JSON.stringify(fab.textContent) : "ABSENT");
      const ok = !!fab && fab.textContent.indexOf(expect) !== -1;
      console.log((ok ? "✅ " : "❌ ") + `bouton present et contenant "${expect}"`);
      resolve(ok);
    }, 2000);
  });
}

(async () => {
  const a = await run({ maxRent: 0, minBeds: 0, statuses: undefined },
    "reglages corrompus (statuses: undefined) — le cas du bug", "(2)");
  const b = await run({ maxRent: 0, minBeds: 0, statuses: [] },
    "aucun verdict Insurent coche (TheGuarantors seul reste)", "(1)");
  const c = await run({ maxRent: 0, minBeds: 0, statuses: [], acceptTg: false },
    "aucun garant accepte : bouton present mais explicite", "Aucune annonce eligible");
  const dd = await run({ maxRent: 1000, minBeds: 0 },
    "budget trop bas : bouton present mais explicite", "Aucune annonce eligible");
  console.log("\n" + ([a, b, c, dd].every(Boolean) ? "TOUT PASSE" : "ECHEC"));
  process.exit([a, b, c, dd].every(Boolean) ? 0 : 1);
})();
