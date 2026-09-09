/**
 * Verifie le MODE TEST : tant qu'il est actif, rien ne doit pouvoir partir.
 *
 * On simule le handler React de "Send request" : s'il s'execute, la demande
 * serait envoyee pour de vrai. Le test verifie qu'il ne s'execute PAS en mode
 * test (clic, Entree dans un champ, submit du formulaire), et qu'il s'execute
 * bien une fois le mode test desactive depuis la barre.
 */
const fs = require("fs"), path = require("path"), { JSDOM } = require("jsdom");
const { installReactSim } = require("./sim");
const EXT = path.join(__dirname, "..");

const dom = new JSDOM(fs.readFileSync(path.join(__dirname, "panel.html"), "utf8"), {
  url: "https://streeteasy.com/rental/1234567",
  runScripts: "outside-only",
});
const w = dom.window, d = w.document;
w.Element.prototype.getBoundingClientRect = () => ({ width: 200, height: 30, top: 0, left: 0, right: 200, bottom: 30 });

// --- "React" : ce qui partirait chez l'agent ---
let sends = 0;
const sendBtn = [...d.querySelectorAll("button")].find((b) => b.textContent.trim() === "Send request");
sendBtn.addEventListener("click", () => { sends++; });
const panelRoot = d.querySelector(".styled__KoiosPage-sc-1btnwec-1");
panelRoot.addEventListener("submit", () => { sends++; });
panelRoot.addEventListener("keydown", (e) => { if (e.key === "Enter") sends++; });

installReactSim(w);

const store = {
  seg_profile: { name: "Alex", email: "r@ex.com", phone: "+33 6 00 00 00 00", country: "France" },
  seg_tour: { type: "video", slots: 2, startOffset: 0, tzMode: "local", nyOffset: -6, availability: { wed: ["afternoon", "evening"], thu: ["afternoon"] }, periodTimes: { afternoon: "15:00", evening: "20:00" }, addMessage: true, safeMode: true },
  seg_queue: { items: [{ url: "https://streeteasy.com/rental/1234567", address: "245 E 45th St", price: 3400 }], index: 0 },
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

function pressEnter(el) {
  el.dispatchEvent(new w.KeyboardEvent("keydown", { key: "Enter", bubbles: true, cancelable: true }));
}

setTimeout(() => {
  const results = [];
  const check = (label, ok) => { results.push((ok ? "✅ " : "❌ ") + label); return ok; };

  console.log("=== MODE TEST ACTIF ===");
  console.log("bouton grise :", sendBtn.classList.contains("seg-send-blocked"));

  sendBtn.click();
  check("clic sur « Send request » bloque", sends === 0);

  pressEnter(d.querySelector("#email"));
  check("Entree dans le champ email bloquee", sends === 0);

  panelRoot.dispatchEvent(new w.Event("submit", { bubbles: true, cancelable: true }));
  check("submit du formulaire bloque", sends === 0);

  const banner = d.querySelector("#seg-tourbar .seg-safebanner");
  check("banniere « MODE TEST » affichee", !!banner && /MODE TEST/.test(banner.textContent));
  check("le reste du remplissage a bien eu lieu", !!d.querySelector("#message") && d.querySelector("#video_chat").checked);

  // --- on desactive le mode test depuis la barre ---
  d.querySelector("#seg-safe-off").click();

  setTimeout(() => {
    console.log("\n=== MODE REEL (apres clic sur « Desactiver ») ===");
    console.log("bouton grise :", sendBtn.classList.contains("seg-send-blocked"));
    const banner2 = d.querySelector("#seg-tourbar .seg-safebanner");
    check("banniere « MODE REEL » affichee", !!banner2 && /MODE REEL/.test(banner2.textContent));
    check("reglage persiste dans le storage", store.seg_tour.safeMode === false);

    sendBtn.click();
    check("clic sur « Send request » passe une fois le mode test coupe", sends === 1);

    console.log("\n=== VERDICT ===");
    results.forEach((r) => console.log(r));
    console.log(results.every((r) => r.startsWith("✅")) ? "\nTOUT PASSE" : "\nECHEC");
  }, 300);
}, 4000);
