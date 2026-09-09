/** Cas reel : la page ne montre qu'un bouton "Request a tour" ; le panneau
 *  n'apparait qu'apres le clic. Test aussi : slots=0 + type=none = on ne touche a rien. */
const fs = require("fs"), path = require("path"), { JSDOM } = require("jsdom");
const { installReactSim } = require("./sim");
const EXT = path.join(__dirname, "..");
const full = fs.readFileSync(path.join(__dirname, "panel.html"), "utf8");

function run(tourSettings, label) {
  return new Promise((resolve) => {
    const dom = new JSDOM(full, { url: "https://streeteasy.com/rental/1234567", runScripts: "outside-only" });
    const w = dom.window, d = w.document;
    w.Element.prototype.getBoundingClientRect = () => ({ width: 200, height: 30, top: 0, left: 0, right: 200, bottom: 30 });

    // On retire le panneau et on le remet uniquement au clic sur "Request a tour".
    const panel = d.querySelector(".SidePanelBase_sidePanelWrapper_umwEL");
    panel.remove();
    const opener = d.createElement("button");
    opener.textContent = "Request a tour";
    d.body.appendChild(opener);
    const clicks = [];
    const nativeClick = w.HTMLElement.prototype.click;
    w.HTMLElement.prototype.click = function () { clicks.push((this.textContent || "").trim()); return nativeClick.call(this); };
    opener.addEventListener("click", () => { d.body.appendChild(panel); });

    const sim = installReactSim(w, { scope: panel });

    const store = {
      seg_profile: { name: "Alex Martin", email: "r@ex.com", phone: "+33 6 00 00 00 00", country: "France" },
      seg_tour: tourSettings,
      seg_queue: { items: [{ url: "https://streeteasy.com/rental/1234567", address: "245 E 45th St", price: 3400 }], index: 0 },
    };
    w.chrome = {
      storage: { local: { get: (k, cb) => { const o = {}; [].concat(k).forEach((x) => { if (x in store) o[x] = store[x]; }); cb(o); }, set: (o, cb) => { Object.assign(store, o); cb && cb(); } }, onChanged: { addListener() {} } },
      runtime: { sendMessage() {}, lastError: null },
    };
    w.navigator.clipboard = { writeText: () => Promise.resolve() };
    for (const f of ["shared.js", "tour.js"]) w.eval(fs.readFileSync(path.join(EXT, f), "utf8"));

    setTimeout(() => {
      const bar = d.getElementById("seg-tourbar");
      const rep = bar && bar.querySelector(".seg-tourbar-report");
      console.log("\n########## " + label + " ##########");
      console.log("rapport   :", rep ? rep.textContent : "(aucun)");
      console.log("panneau ouvert par le script :", clicks.includes("Request a tour") ? "oui" : "NON");
      console.log("video_chat:", d.querySelector("#video_chat") && d.querySelector("#video_chat").checked);
      console.log("in_person :", d.querySelector("#in_person") && d.querySelector("#in_person").checked);
      console.log("creneaux  :", sim.addedSlots);
      console.log("message   :", d.querySelector("#message") ? d.querySelector("#message").value.length + " car." : "(aucun)");
      console.log("clics     :", clicks);
      const danger = clicks.filter((c) => /send request|cancel|search partner/i.test(c));
      console.log(danger.length ? "❌ bouton dangereux : " + danger : "✅ aucun bouton dangereux");
      resolve();
    }, 4000);
  });
}

(async () => {
  await run({ type: "video", slots: 3, startOffset: 0, tzMode: "ny", availability: { wed: ["morning"], thu: ["morning"], fri: ["morning"] }, periodTimes: { morning: "10:00" }, addMessage: true }, "A : panneau ferme au depart, 3 creneaux, 1 seule heure preferee");
  await run({ type: "none", slots: 0, startOffset: 0, tzMode: "ny", availability: { wed: ["afternoon"] }, periodTimes: { afternoon: "14:00" }, addMessage: false }, "B : tout desactive (type=none, slots=0, pas de message)");
})();
