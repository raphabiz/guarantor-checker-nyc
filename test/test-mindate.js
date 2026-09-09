/**
 * « Trois creneaux a partir de 12h heure francaise, le 9 ou le 10 septembre. »
 *
 * Deux mecanismes testes ensemble :
 *  - `minDate` : aucun creneau avant la date choisie ;
 *  - la conversion FR -> New York, sachant que le menu StreetEasy s'arrete a
 *    8:00 AM (soit 14h en France). Une dispo « a partir de 12h FR » ne peut donc
 *    pas descendre plus bas que 8:00 AM cote New York.
 *
 * Les dates sont calculees a partir d'aujourd'hui pour que le test ne perime pas.
 */
const fs = require("fs");
const path = require("path");
const { JSDOM } = require("jsdom");
const { installReactSim } = require("./sim");

const EXT = path.join(__dirname, "..");

const label = (d) => d.toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" });
const iso = (d) => d.getFullYear() + "-" + String(d.getMonth() + 1).padStart(2, "0") + "-" + String(d.getDate()).padStart(2, "0");
const dayKey = (d) => ["sun", "mon", "tue", "wed", "thu", "fri", "sat"][d.getDay()];

const today = new Date(); today.setHours(0, 0, 0, 0);
// Le menu de StreetEasy propose environ 7 jours a partir d'aujourd'hui.
const offered = [];
for (let i = 0; i < 7; i++) offered.push(new Date(today.getTime() + i * 86400000));

// On vise les deux jours J+3 et J+4, comme "le 9 ou le 10".
const target1 = offered[3], target2 = offered[4];

function run(minDate, availDays, label_) {
  return new Promise((resolve) => {
    let html = fs.readFileSync(path.join(__dirname, "panel.html"), "utf8");
    const opts = ['<option disabled="" hidden="" value="-2">Date</option>']
      .concat(offered.map((d) => `<option value="${label(d)}">${label(d)}</option>`)).join("");
    html = html.replace(/<option disabled="" hidden="" value="-2">Date<\/option>[\s\S]*?(?=<\/select>)/, opts);

    const dom = new JSDOM(html, { url: "https://streeteasy.com/rental/1234567", runScripts: "outside-only" });
    const w = dom.window, d = w.document;
    w.Element.prototype.getBoundingClientRect = () => ({ width: 200, height: 30, top: 0, left: 0, right: 200, bottom: 30 });
    const sim = installReactSim(w);

    const availability = {};
    availDays.forEach((k) => { availability[k] = ["afternoon", "evening"]; });
    const store = {
      seg_profile: { name: "Alex", email: "r@ex.com", country: "France" },
      seg_tour: {
        type: "video", slots: 3, startOffset: 0, minDate: minDate,
        tzMode: "local", nyOffset: -6,
        availability: availability,
        // 14h et 18h heure francaise = 8:00 AM et 12:00 PM a New York.
        periodTimes: { morning: "09:00", afternoon: "14:00", evening: "18:00" },
        addMessage: true, safeMode: false,
      },
      seg_queue: { items: [{ url: "https://streeteasy.com/rental/1234567", address: "228 East 84th Street", price: 3500 }], index: 0 },
    };
    w.chrome = {
      storage: {
        local: {
          get: (k, cb) => { const o = {}; [].concat(k).forEach((x) => { if (x in store) o[x] = store[x]; }); cb(o); },
          set: (o, cb) => { Object.assign(store, o); cb && cb(); },
        },
        onChanged: { addListener() {} },
      },
      runtime: { sendMessage() {}, lastError: null },
    };
    w.navigator.clipboard = { writeText: () => Promise.resolve() };
    for (const f of ["shared.js", "tour.js"]) w.eval(fs.readFileSync(path.join(EXT, f), "utf8"));

    setTimeout(() => {
      const bar = d.getElementById("seg-tourbar");
      const rep = bar && bar.querySelector(".seg-tourbar-report");
      console.log(`\n### ${label_}`);
      console.log("   rapport  :", rep ? rep.textContent : "(aucun)");
      console.log("   creneaux :", sim.addedSlots);
      resolve({ slots: sim.addedSlots, report: rep ? rep.textContent : "", msg: (d.querySelector("#message") || {}).value || "" });
    }, 5000);
  });
}

(async () => {
  const results = [];
  const check = (l, ok) => results.push((ok ? "✅ " : "❌ ") + l);

  console.log("aujourd'hui        :", label(today));
  console.log("jours vises        :", label(target1), "et", label(target2));

  const a = await run(iso(target1), [dayKey(target1), dayKey(target2)],
    `3 creneaux a partir du ${label(target1)}`);
  check("3 creneaux poses", a.slots.length === 3);
  check("aucun creneau avant la date plancher",
    a.slots.every((s) => [label(target1), label(target2)].some((l) => s.indexOf(l) === 0)));
  check("les deux jours sont utilises",
    a.slots.some((s) => s.indexOf(label(target1)) === 0) && a.slots.some((s) => s.indexOf(label(target2)) === 0));
  check("14h FR -> 8:00 AM NY", a.slots.some((s) => /8:00 AM$/.test(s)));
  check("18h FR -> 12:00 PM NY", a.slots.some((s) => /12:00 PM$/.test(s)));
  check("message sans tiret cadratin", !/[—–]/.test(a.msg));

  // Date plancher hors du menu (StreetEasy ne propose que ~7 jours) : on doit le
  // dire clairement plutot que de poser un creneau au hasard.
  const far = new Date(today.getTime() + 30 * 86400000);
  const b = await run(iso(far), ["wed", "thu"], "date plancher dans 30 jours (hors menu)");
  check("aucun creneau pose", b.slots.length === 0);
  check("le rapport explique pourquoi", /dispos|correspond/i.test(b.report));

  results.forEach((r) => console.log(r));
  console.log(results.every((r) => r.startsWith("✅")) ? "\nTOUT PASSE" : "\nECHEC");
  process.exit(results.every((r) => r.startsWith("✅")) ? 0 : 1);
})();
