/**
 * Test du remplissage du panneau "Request a tour" contre le vrai DOM StreetEasy.
 *
 * Deux profils : un numero francais (doit rester HORS du champ telephone, dont
 * l'indicatif est verrouille sur +1) et un numero americain (doit y aller).
 */
const fs = require("fs");
const path = require("path");
const { JSDOM } = require("jsdom");
const { installReactSim } = require("./sim");

const EXT = path.join(__dirname, "..");
const html = fs.readFileSync(path.join(__dirname, "panel.html"), "utf8");

function run(profile, label) {
  return new Promise((resolve) => {
    const dom = new JSDOM(html, { url: "https://streeteasy.com/rental/1234567", runScripts: "outside-only" });
    const { window } = dom;
    const d = window.document;
    window.Element.prototype.getBoundingClientRect = () => ({ width: 200, height: 30, top: 0, left: 0, right: 200, bottom: 30 });

    const clicks = [];
    const nativeClick = window.HTMLElement.prototype.click;
    window.HTMLElement.prototype.click = function () {
      clicks.push((this.textContent || "").trim() || `<${this.tagName.toLowerCase()} for=${this.getAttribute("for")}>`);
      return nativeClick.call(this);
    };

    const sim = installReactSim(window);

    const store = {
      seg_profile: profile,
      seg_tour: { type: "video", slots: 3, startOffset: 0, minDate: "", tzMode: "local", nyOffset: -6, availability: { sun: [], mon: [], tue: [], wed: ["afternoon", "evening"], thu: ["afternoon", "evening"], fri: [], sat: [] }, periodTimes: { morning: "09:00", afternoon: "15:00", evening: "20:00" }, addMessage: true, safeMode: false },
      seg_queue: { items: [{ url: "https://streeteasy.com/rental/1234567", address: "245 East 45th Street", price: 3400, beds: 1 }], index: 0 },
    };
    window.chrome = {
      storage: {
        local: {
          get: (keys, cb) => { const out = {}; [].concat(keys).forEach((k) => { if (k in store) out[k] = store[k]; }); cb(out); },
          set: (obj, cb) => { Object.assign(store, obj); cb && cb(); },
        },
        onChanged: { addListener() {} },
      },
      runtime: { sendMessage() {}, lastError: null, getURL: (p) => p },
    };
    window.navigator.clipboard = { writeText: () => Promise.resolve() };

    for (const f of ["shared.js", "tour.js"]) window.eval(fs.readFileSync(path.join(EXT, f), "utf8"));

    setTimeout(() => {
      const bar = d.getElementById("seg-tourbar");
      const report = bar && bar.querySelector(".seg-tourbar-report");
      const msg = d.querySelector("#message");
      const results = [];
      const check = (l, ok) => results.push((ok ? "✅ " : "❌ ") + l);

      console.log("\n########## " + label + " ##########");
      console.log("rapport   :", report ? report.textContent : "(aucun)");
      console.log("phone     :", JSON.stringify(d.querySelector("#phone").value));
      console.log("creneaux  :", sim.addedSlots);
      console.log("clics     :", clicks.join(" | "));

      check("aucun bouton dangereux clique", !clicks.some((c) => /send request|cancel|search partner|close/i.test(c)));
      check("Video chat selectionne", d.querySelector("#video_chat").checked);
      check("3 creneaux ajoutes", sim.addedSlots.length === 3);
      check("uniquement mercredi et jeudi", sim.addedSlots.every((s) => /^(Wed|Thu)/.test(s)));
      check("heures converties FR->NY (15h->9:00 AM, 20h->2:00 PM)",
        sim.addedSlots.join(" | ") === "Wed, Sep 2 9:00 AM | Wed, Sep 2 2:00 PM | Thu, Sep 3 9:00 AM");
      check("les dispos completes sont dans le message",
        !!msg && /Wednesday and Thursday at 9:00 AM and 2:00 PM New York time/.test(msg.value));
      check("message colle", msg && msg.value.length > 100);
      check("nom StreetEasy preserve", d.querySelector("#name").value === "Alex");
      check("email StreetEasy preserve", d.querySelector("#email").value === "alex.martin@example.com");
      if (profile.expectPhone) check("telephone US rempli", d.querySelector("#phone").value === profile.phone);
      else {
        check("telephone etranger NON mis dans le champ +1", d.querySelector("#phone").value === "");
        check("avertissement telephone affiche", !!report && /telephone non-US/i.test(report.textContent));
        check("numero etranger present dans le message", !!msg && msg.value.includes(profile.phone));
      }
      results.forEach((r) => console.log(r));
      resolve(results.every((r) => r.startsWith("✅")));
    }, 5000);
  });
}

(async () => {
  const a = await run({ name: "Alex Martin", email: "alex.martin@example.com", phone: "+33 6 00 00 00 00", country: "France", occupation: "Product Manager", income: "$100,000/year", guarantor: "Insurent", movein: "November 1st" }, "A : numero francais");
  const b = await run({ name: "Alex Martin", email: "alex.martin@example.com", phone: "917-555-0134", country: "France", expectPhone: true }, "B : numero americain");
  console.log("\n" + (a && b ? "TOUT PASSE" : "ECHEC"));
})();
