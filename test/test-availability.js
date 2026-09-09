/**
 * Conversion des disponibilites vers l'heure de New York.
 *
 * Le panneau StreetEasy raisonne en heure de New York ; toi tu raisonnes en
 * heure francaise. Une erreur de 6 h ferait proposer a l'agent un creneau au
 * milieu de sa nuit, donc c'est teste explicitement, y compris le passage a la
 * veille pour les heures tres matinales.
 */
const fs = require("fs");
const path = require("path");

global.window = {};
global.chrome = { storage: { local: { get: (k, cb) => cb({}), set: (o, cb) => cb && cb() } } };
require(path.join(__dirname, "..", "shared.js"));
const SEG = window.SEG;

const results = [];
const check = (label, got, want) => {
  const ok = JSON.stringify(got) === JSON.stringify(want);
  results.push((ok ? "✅ " : "❌ ") + label + (ok ? "" : `\n     obtenu : ${JSON.stringify(got)}\n     attendu: ${JSON.stringify(want)}`));
};

function tour(availability, periodTimes, extra) {
  return Object.assign({
    tzMode: "local", nyOffset: -6,
    availability: availability,
    periodTimes: periodTimes,
  }, extra || {});
}

// --- cas reel : mercredi et jeudi, apres-midi (15h) et soir (20h), heure FR ---
const t1 = tour(
  { wed: ["afternoon", "evening"], thu: ["afternoon", "evening"] },
  { morning: "09:00", afternoon: "15:00", evening: "20:00" }
);
check(
  "FR 15h/20h mer+jeu -> NY 9:00 AM / 2:00 PM, meme jour",
  SEG.nySlots(t1).map((s) => s.nyDayKey + " " + SEG.fmtTime12(s.nyMinutes)),
  ["wed 9:00 AM", "wed 2:00 PM", "thu 9:00 AM", "thu 2:00 PM"]
);
check(
  "phrase pour l'agent",
  SEG.availabilityPhrase(t1),
  "Wednesday and Thursday at 9:00 AM and 2:00 PM New York time"
);

// --- bascule a la veille : 3h du matin en France = 21h la veille a New York ---
const t2 = tour({ wed: ["morning"] }, { morning: "03:00" });
check("FR mercredi 3h -> NY mardi 9:00 PM", SEG.nySlots(t2).map((s) => s.nyDayKey + " " + SEG.fmtTime12(s.nyMinutes) + (s.shifted ? " (veille)" : "")), ["tue 9:00 PM (veille)"]);

// --- mode "heure de New York" : aucune conversion ---
const t3 = Object.assign({}, t1, { tzMode: "ny" });
check("mode NY : 15h reste 3:00 PM", SEG.nySlots(t3).map((s) => SEG.fmtTime12(s.nyMinutes)), ["3:00 PM", "8:00 PM", "3:00 PM", "8:00 PM"]);

// --- jours aux horaires differents : deux groupes dans la phrase ---
const t4 = tour({ mon: ["afternoon"], sat: ["evening"] }, { afternoon: "15:00", evening: "20:00" });
check("groupes distincts", SEG.availabilityPhrase(t4), "Monday at 9:00 AM; Saturday at 2:00 PM New York time");

// --- aucune dispo cochee : pas de phrase, et le message garde une formule neutre ---
check("grille vide -> pas de phrase", SEG.availabilityPhrase(tour({}, { morning: "09:00" })), "");
const msg = SEG.renderTemplate(SEG.DEFAULT_TEMPLATE, { name: "R", email: "r@x.com" }, { address: "12 W 20th St" }, tour({}, {}));
check("message sans dispos : formule de repli", /available at any time that suits you/.test(msg), true);
const msg2 = SEG.renderTemplate(SEG.DEFAULT_TEMPLATE, { name: "R", email: "r@x.com" }, { address: "12 W 20th St" }, t1);
check("message avec dispos : phrase inseree", /I'm available Wednesday and Thursday at 9:00 AM and 2:00 PM New York time/.test(msg2), true);

// --- decalage calcule automatiquement (depend de la machine, juste coherent) ---
const auto = SEG.nyOffsetHours();
check("decalage auto plausible (-9 a 0)", auto <= 0 && auto >= -9, true);
console.log("decalage detecte sur cette machine : " + auto + " h\n");

results.forEach((r) => console.log(r));
console.log(results.every((r) => r.startsWith("✅")) ? "\nTOUT PASSE" : "\nECHEC");
