/**
 * Mode production : l'extension clique "Send request" elle-meme et enchaine.
 *
 * Ce que le test verifie, dans l'ordre d'importance :
 *  1. l'envoi part bien tout seul, et l'annonce suivante est demandee ;
 *  2. le mode test reste prioritaire : tant qu'il est actif, rien ne part ;
 *  3. si l'envoi n'aboutit pas (panneau toujours ouvert : champ requis, captcha),
 *     la file s'ARRETE au lieu de continuer en croyant avoir envoye ;
 *  4. un remplissage incomplet suspend l'envoi automatique.
 */
const fs = require("fs");
const path = require("path");
const { JSDOM } = require("jsdom");
const { installReactSim } = require("./sim");

const EXT = path.join(__dirname, "..");
const html = fs.readFileSync(path.join(__dirname, "panel.html"), "utf8");

// scenario: "ok" (l'envoi ferme le panneau) | "stuck" (il reste ouvert)
function run({ label, sendMode, safeMode, scenario, slots }) {
  return new Promise((resolve) => {
    const dom = new JSDOM(html, { url: "https://streeteasy.com/rental/1234567", runScripts: "outside-only" });
    const w = dom.window, d = w.document;
    w.Element.prototype.getBoundingClientRect = () => ({ width: 200, height: 30, top: 0, left: 0, right: 200, bottom: 30 });
    installReactSim(w);

    const events = [];
    const sendBtn = [...d.querySelectorAll("button")].find((b) => b.textContent.trim() === "Send request");
    const panelRoot = d.querySelector(".styled__KoiosPage-sc-1btnwec-1");
    sendBtn.addEventListener("click", () => {
      events.push("send");
      // StreetEasy ferme le panneau quand la demande est acceptee.
      if (scenario === "ok") panelRoot.remove();
    });

    let queueCleared = false;
    const store = {
      seg_profile: { name: "Alex", email: "r@ex.com", country: "France" },
      seg_tour: {
        type: "video", slots: slots, startOffset: 0, minDate: "",
        tzMode: "local", nyOffset: -6,
        availability: { wed: ["afternoon", "evening"], thu: ["afternoon"], fri: ["afternoon"], sat: ["afternoon"], sun: ["afternoon"], mon: ["afternoon"], tue: ["afternoon"] },
        periodTimes: { morning: "12:00", afternoon: "14:00", evening: "18:00" },
        addMessage: true, safeMode: safeMode,
        sendMode: sendMode, autoCountdown: 1, autoDelay: 5,
      },
      seg_queue: { items: [{ url: "https://streeteasy.com/rental/1234567", address: "228 East 84th Street", price: 3500 }], index: 0 },
    };
    w.chrome = {
      storage: {
        local: {
          get: (k, cb) => { const o = {}; [].concat(k).forEach((x) => { if (x in store) o[x] = store[x]; }); cb(o); },
          set: (o, cb) => {
            if ("seg_queue" in o && o.seg_queue === null) queueCleared = true;
            Object.assign(store, o); cb && cb();
          },
        },
        onChanged: { addListener() {} },
      },
      runtime: {
        lastError: null,
        sendMessage: (msg, cb) => { events.push(msg.type); cb && cb({ ok: true }); },
      },
    };
    w.navigator.clipboard = { writeText: () => Promise.resolve() };
    for (const f of ["shared.js", "tour.js"]) w.eval(fs.readFileSync(path.join(EXT, f), "utf8"));

    setTimeout(() => {
      const bar = d.getElementById("seg-tourbar");
      const auto = bar && bar.querySelector("#seg-auto");
      console.log(`\n### ${label}`);
      console.log("   evenements :", events.join(" -> ") || "(aucun)");
      console.log("   ligne auto :", auto && !auto.hidden ? auto.textContent.trim() : "(masquee)");
      console.log("   file videe :", queueCleared);
      resolve({ events, autoText: auto ? auto.textContent : "", queueCleared, sentMarked: !!store.seg_sent });
    }, 14000);
  });
}

(async () => {
  const results = [];
  const check = (l, ok) => results.push((ok ? "✅ " : "❌ ") + l);

  const a = await run({ label: "mode auto : envoi puis annonce suivante", sendMode: "auto", safeMode: false, scenario: "ok", slots: 3 });
  check("l'envoi part tout seul", a.events.indexOf("send") !== -1);
  check("l'annonce est marquee comme contactee", a.sentMarked);
  check("l'annonce suivante est demandee", a.events.indexOf("TOUR_NEXT") !== -1);
  check("la file n'est pas arretee", !a.queueCleared);

  const b = await run({ label: "mode auto MAIS mode test actif", sendMode: "auto", safeMode: true, scenario: "ok", slots: 3 });
  check("aucun envoi en mode test", b.events.indexOf("send") === -1);
  check("aucune annonce suivante en mode test", b.events.indexOf("TOUR_NEXT") === -1);
  check("le message explique la suspension", /mode test/i.test(b.autoText));

  const c = await run({ label: "mode auto mais l'envoi n'aboutit pas", sendMode: "auto", safeMode: false, scenario: "stuck", slots: 3 });
  check("le clic a bien eu lieu", c.events.indexOf("send") !== -1);
  check("la file s'arrete au lieu d'enchainer", c.queueCleared && c.events.indexOf("TOUR_NEXT") === -1);
  check("l'annonce n'est PAS marquee comme envoyee", !c.sentMarked);

  const e = await run({ label: "mode manuel : rien ne part sans toi", sendMode: "manual", safeMode: false, scenario: "ok", slots: 3 });
  check("aucun envoi en mode manuel", e.events.indexOf("send") === -1);

  results.forEach((r) => console.log(r));
  console.log(results.every((r) => r.startsWith("✅")) ? "\nTOUT PASSE" : "\nECHEC");
  process.exit(results.every((r) => r.startsWith("✅")) ? 0 : 1);
})();
