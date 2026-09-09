/**
 * Guarantor Checker for NYC Rentals — code partage
 *
 * Charge a la fois :
 *  - comme content script (premier de la liste -> window.SEG dispo pour content.js / tour.js)
 *  - dans les pages d'extension (options.html, popup.html) via <script src>
 *
 * Contient : les reglages par defaut, la grille de disponibilites (avec
 * conversion vers l'heure de New York), le rendu du template de message et les
 * helpers de stockage (chrome.storage.local).
 */

(function () {
  "use strict";
  if (window.SEG) return;

  /* ================= i18n ================= */

  /**
   * Traduction d'une cle de _locales/<langue>/messages.json. La langue suit
   * celle du navigateur ; l'anglais (default_locale) sert de repli automatique.
   * En cas de cle absente on renvoie la cle elle-meme plutot qu'une chaine vide,
   * pour que le probleme se voie a l'ecran au lieu de laisser un trou.
   */
  function t(key, subs) {
    try {
      var s = chrome.i18n.getMessage(key, subs);
      return s || key;
    } catch (e) {
      return key;
    }
  }

  /**
   * Traduit un document deja ecrit en HTML. Chaque element porte l'attribut qui
   * dit QUOI traduire :
   *   data-i18n            -> textContent
   *   data-i18n-html       -> innerHTML (pour les libelles avec <b>, <code>...)
   *   data-i18n-title      -> title
   *   data-i18n-placeholder-> placeholder
   * C'est plus sur que de construire les pages en JS : le HTML reste lisible et
   * la structure ne depend pas de la langue.
   */
  function applyI18n(root) {
    var scope = root || document;
    scope.querySelectorAll("[data-i18n]").forEach(function (el) {
      el.textContent = t(el.getAttribute("data-i18n"));
    });
    scope.querySelectorAll("[data-i18n-html]").forEach(function (el) {
      el.innerHTML = t(el.getAttribute("data-i18n-html"));
    });
    scope.querySelectorAll("[data-i18n-title]").forEach(function (el) {
      el.title = t(el.getAttribute("data-i18n-title"));
    });
    scope.querySelectorAll("[data-i18n-placeholder]").forEach(function (el) {
      el.placeholder = t(el.getAttribute("data-i18n-placeholder"));
    });
    if (scope === document) {
      var title = document.querySelector("title[data-i18n]");
      if (title) document.title = title.textContent;
      document.documentElement.lang = (chrome.i18n.getUILanguage
        ? chrome.i18n.getUILanguage() : "en").split("-")[0];
    }
  }

  // Jours et periodes traduits : ils servent aux libelles de la grille de
  // disponibilites (l'anglais reste utilise dans le message envoye a l'agent,
  // via DAY_EN, puisque c'est lui qui le lit).
  function dayLabel(key) {
    return t("day" + key.charAt(0).toUpperCase() + key.slice(1));
  }
  function periodLabel(key) {
    return t("th" + key.charAt(0).toUpperCase() + key.slice(1));
  }

  var DEFAULT_PROFILE = {
    name: "",
    email: "",
    phone: "",
    occupation: "",          // ex: "Product Manager"
    income: "",              // ex: "$100,000/year"
    guarantor: "Insurent or TheGuarantors",
    movein: "",              // ex: "November 1st, flexible"
    country: "",             // ex: "France"
    extra: "",               // phrase libre ajoutee au message
  };

  // Message par defaut, pense pour un agent new-yorkais qui lit sur son telephone
  // entre deux visites :
  //  - la question utile est en premiere ligne, et elle se repond par oui/non ;
  //  - le garant institutionnel est presente comme la SOLUTION, pas comme un aveu ;
  //  - pas de depot de garantie majore : depuis la loi de 2019 l'Etat de New York
  //    le plafonne a un mois de loyer. Le proposer signale qu'on ne connait pas le
  //    marche, et le proprietaire ne peut de toute facon pas l'accepter ;
  //  - pas de montant de revenu : la regle locale des 40x le loyer mensuel se
  //    retourne contre toi des que ton chiffre passe dessous. C'est exactement ce
  //    que le garant couvre. Ajoute {{income_clause}} si tu passes largement ;
  //  - aucun tiret cadratin : personne ne tape ce caractere au clavier.
  var DEFAULT_TEMPLATE = [
    "Hi,",
    "",
    "Is {{address}}{{price_sentence}} still available? I would love to see it.",
    "",
    "I am relocating to New York{{from_clause}}{{occupation_clause}} and I am ready to move in",
    "{{movein}}. As an international applicant I do not have a US credit history yet, so I come",
    "with an institutional guarantor ({{guarantor}}), along with an employment letter, proof of",
    "income, bank statements and references. That keeps the application simple on your side.",
    "",
    "Could we do a video tour (FaceTime, Zoom or WhatsApp)? {{availability_sentence}}",
    "A recorded walkthrough works just as well if that is easier for you.",
    "{{extra}}",
    "Thank you for your time, and happy to answer any question.",
    "",
    "Best regards,",
    "{{name}}",
    "{{contact_line}}",
  ].join("\n");

  var DEFAULT_CRITERIA = {
    maxRent: 0,              // 0 = pas de limite
    minBeds: 0,              // 0 = studio ok
    statuses: ["covered", "maybe"], // verdicts Insurent acceptes dans la file
    // Un seul garant suffit : une annonce couverte par TheGuarantors entre dans
    // la file meme si Insurent ne la couvre pas (et inversement).
    acceptTg: true,
    skipContacted: true,
  };

  var DAY_KEYS = ["sun", "mon", "tue", "wed", "thu", "fri", "sat"];
  var DAY_EN = { sun: "Sunday", mon: "Monday", tue: "Tuesday", wed: "Wednesday", thu: "Thursday", fri: "Friday", sat: "Saturday" };
  var PERIODS = ["morning", "afternoon", "evening"];

  // Reglages du panneau "Request a tour" de StreetEasy.
  var DEFAULT_TOUR = {
    type: "video",        // "video" | "in_person" | "none" (ne pas toucher)
    slots: 3,             // 0 a 3 creneaux pre-selectionnes (StreetEasy plafonne a 3)
    startOffset: 0,       // ignorer les N premiers jours proposes
    // Aucun creneau avant cette date (format "AAAA-MM-JJ", "" = pas de plancher).
    // StreetEasy ne propose qu'environ 7 jours a l'avance : une date plus
    // lointaine n'apparaitra dans le menu que le moment venu.
    minDate: "2026-09-09",

    // "manual" : l'extension remplit, tu relis et tu cliques "Send request".
    // "auto"   : elle clique elle-meme et enchaine l'annonce suivante. Le mode
    //            test (safeMode) reste prioritaire et suspend tout envoi.
    sendMode: "manual",
    autoCountdown: 6,     // secondes d'annulation avant chaque envoi automatique
    autoDelay: 25,        // secondes d'attente entre deux annonces (+/- 40 %)

    // Disponibilites exprimees dans TON fuseau (voir tzMode).
    availability: {
      sun: [], mon: [], tue: [],
      wed: ["afternoon", "evening"],
      thu: ["afternoon", "evening"],
      fri: [], sat: [],
    },
    // Heure representative de chaque periode, format 24 h, dans TON fuseau.
    periodTimes: { morning: "12:00", afternoon: "14:00", evening: "18:00" },

    // "local" : tes heures sont celles de ton fuseau et sont converties vers
    //           l'heure de New York (le panneau StreetEasy est en heure NY).
    // "ny"    : tu saisis directement des heures de New York.
    tzMode: "local",
    // Decalage NY - toi, en heures (ex: -6 depuis Paris). null = calcul auto.
    nyOffset: null,

    addMessage: true,     // deplier "+ Add a Message" et y coller le message
    // Mode test : neutralise le bouton "Send request" de StreetEasy pour pouvoir
    // derouler tout le flux de bout en bout sans risquer d'envoyer quoi que ce soit.
    safeMode: true,
  };

  var KEYS = {
    profile: "seg_profile",
    tour: "seg_tour",
    template: "seg_template",
    criteria: "seg_criteria",
    queue: "seg_queue",      // { items: [...], index: n, tabId: n }
    sent: "seg_sent",        // { "<pathname>": {ts, address} }
  };

  function get(keys) {
    return new Promise(function (resolve) {
      chrome.storage.local.get(keys, function (res) { resolve(res || {}); });
    });
  }
  function set(obj) {
    return new Promise(function (resolve) {
      chrome.storage.local.set(obj, function () { resolve(); });
    });
  }

  // ATTENTION : Object.assign recopie les valeurs `undefined` par-dessus les
  // defauts. Des reglages ecrits par une version anterieure (champ absent ->
  // undefined) ecrasaient donc `statuses`, et le premier `statuses.indexOf(...)`
  // levait une exception dans une promesse — le bouton de la file ne se creait
  // jamais, sans aucun message. On ignore donc undefined et null.
  function withDefaults(defaults, saved) {
    var out = Object.assign({}, defaults);
    Object.keys(saved || {}).forEach(function (k) {
      if (saved[k] !== undefined && saved[k] !== null) out[k] = saved[k];
    });
    return out;
  }

  async function loadSettings() {
    var res = await get([KEYS.profile, KEYS.template, KEYS.criteria, KEYS.tour]);

    var tour = withDefaults(DEFAULT_TOUR, res[KEYS.tour]);
    tour.availability = withDefaults(DEFAULT_TOUR.availability, tour.availability);
    tour.periodTimes = withDefaults(DEFAULT_TOUR.periodTimes, tour.periodTimes);
    DAY_KEYS.forEach(function (d) {
      if (!Array.isArray(tour.availability[d])) tour.availability[d] = [];
    });
    if (typeof tour.slots !== "number") tour.slots = DEFAULT_TOUR.slots;

    var criteria = withDefaults(DEFAULT_CRITERIA, res[KEYS.criteria]);
    // Garde-fou : sans liste de verdicts valide, toute la file tombe.
    if (!Array.isArray(criteria.statuses)) criteria.statuses = DEFAULT_CRITERIA.statuses.slice();

    return {
      profile: withDefaults(DEFAULT_PROFILE, res[KEYS.profile]),
      template: typeof res[KEYS.template] === "string" && res[KEYS.template].trim()
        ? res[KEYS.template] : DEFAULT_TEMPLATE,
      criteria: criteria,
      tour: tour,
    };
  }

  /* ================= heures et fuseaux ================= */

  // Decalage horaire New York - toi, en heures (Paris -> -6). Calcule en direct
  // pour rester juste des deux cotes des changements d'heure (ils ne tombent pas
  // aux memes dates aux Etats-Unis et en Europe : il y a des semaines a -5).
  function nyOffsetHours() {
    try {
      var now = new Date();
      var ny = new Date(now.toLocaleString("en-US", { timeZone: "America/New_York" }));
      var here = new Date(now.toLocaleString("en-US"));
      return Math.round((ny - here) / 3600000);
    } catch (e) {
      return -6; // repli : Europe de l'Ouest -> New York
    }
  }

  function effectiveOffset(tour) {
    if (!tour || tour.tzMode === "ny") return 0;
    return typeof tour.nyOffset === "number" ? tour.nyOffset : nyOffsetHours();
  }

  // "15:00" ou "3:00 PM" -> minutes depuis minuit.
  function toMinutes(s) {
    var m = String(s == null ? "" : s).trim().match(/^(\d{1,2})[:h](\d{2})\s*(am|pm)?$/i);
    if (!m) return null;
    var h = parseInt(m[1], 10), min = parseInt(m[2], 10), ap = (m[3] || "").toLowerCase();
    if (ap === "pm" && h !== 12) h += 12;
    if (ap === "am" && h === 12) h = 0;
    return h * 60 + min;
  }

  // 540 -> "9:00 AM" (format des menus StreetEasy).
  function fmtTime12(minutes) {
    var m = ((minutes % 1440) + 1440) % 1440;
    var h = Math.floor(m / 60), mm = m % 60;
    var ap = h >= 12 ? "PM" : "AM";
    var h12 = h % 12 === 0 ? 12 : h % 12;
    return h12 + ":" + (mm < 10 ? "0" : "") + mm + " " + ap;
  }

  /**
   * Convertit la grille de disponibilites en creneaux exprimes en heure de
   * New York : [{ dayKey, period, nyMinutes, nyDayKey, shifted }].
   *
   * Une disponibilite du mercredi 15 h a Paris tombe le mercredi 9 h a New York
   * (meme jour). Une disponibilite de 2 h du matin tomberait la veille au soir :
   * on decale alors le jour, sinon on viserait la mauvaise date dans le menu.
   */
  function nySlots(tour) {
    var offset = effectiveOffset(tour) * 60;
    var out = [];
    DAY_KEYS.forEach(function (dayKey, dayIdx) {
      var periods = (tour.availability && tour.availability[dayKey]) || [];
      PERIODS.forEach(function (period) {
        if (periods.indexOf(period) === -1) return;
        var local = toMinutes(tour.periodTimes && tour.periodTimes[period]);
        if (local == null) return;
        var raw = local + offset;
        var shift = Math.floor(raw / 1440);          // -1 = la veille a New York
        var nyMinutes = ((raw % 1440) + 1440) % 1440;
        out.push({
          dayKey: dayKey,
          period: period,
          nyMinutes: nyMinutes,
          nyDayKey: DAY_KEYS[(dayIdx + shift + 7) % 7],
          shifted: shift !== 0,
        });
      });
    });
    return out;
  }

  function joinEn(list) {
    if (list.length <= 1) return list[0] || "";
    if (list.length === 2) return list[0] + " and " + list[1];
    return list.slice(0, -1).join(", ") + " and " + list[list.length - 1];
  }

  // Phrase de disponibilite pour l'agent, en heure de New York (ce qui compte
  // pour lui), regroupee par jour : "Wednesday and Thursday at 9:00 AM or 2:00 PM".
  function availabilityPhrase(tour) {
    var slots = nySlots(tour);
    if (!slots.length) return "";
    var byTimes = {};
    slots.forEach(function (s) {
      (byTimes[s.nyDayKey] = byTimes[s.nyDayKey] || []).push(s.nyMinutes);
    });
    // Regroupe les jours qui partagent exactement les memes horaires.
    var groups = {};
    DAY_KEYS.forEach(function (d) {
      if (!byTimes[d]) return;
      var times = byTimes[d].slice().sort(function (a, b) { return a - b; });
      var key = times.join(",");
      (groups[key] = groups[key] || []).push(DAY_EN[d]);
    });
    var parts = Object.keys(groups).map(function (key) {
      var times = key.split(",").map(function (n) { return fmtTime12(parseInt(n, 10)); });
      return joinEn(groups[key]) + " at " + joinEn(times);
    });
    return parts.join("; ") + " New York time";
  }

  /* ================= divers ================= */

  function listingKey(url) {
    try { return new URL(url, location.href).pathname.replace(/\/+$/, ""); }
    catch (e) { return String(url || ""); }
  }

  async function getSent() {
    var res = await get([KEYS.sent]);
    return res[KEYS.sent] || {};
  }
  async function markSent(url, address) {
    var sent = await getSent();
    sent[listingKey(url)] = { ts: Date.now(), address: address || "" };
    await set({ seg_sent: sent });
    return sent;
  }

  function fmtPrice(price) {
    if (!price) return "";
    return "$" + String(price).replace(/\B(?=(\d{3})+(?!\d))/g, ",");
  }

  /**
   * Retire les tirets cadratins et demi-cadratins, d'ou qu'ils viennent : du
   * message par defaut comme du texte que tu as ecrit toi-meme. Presque personne
   * ne tape ce caractere au clavier, il sent le texte genere. Une incise devient
   * une virgule, le reste un simple trait d'union.
   */
  function stripDashes(text) {
    return String(text)
      .replace(/\s+[—–]\s+/g, ", ")
      .replace(/[—–]/g, "-")
      .replace(/,\s*,/g, ",");
  }

  /**
   * Remplace les {{placeholders}}.
   *
   * Les champs facultatifs ont chacun un placeholder "clause" qui disparait
   * proprement quand le champ est vide : un agent ne doit jamais recevoir
   * "proof of income ()" ni une ligne de contact qui finit par "|".
   */
  function renderTemplate(template, profile, listing, tour) {
    listing = listing || {};
    profile = profile || {};
    var priceTxt = fmtPrice(listing.price);
    var avail = tour ? availabilityPhrase(tour) : "";
    var vars = {
      // annonce
      address: listing.address || "this apartment",
      price: priceTxt,
      price_sentence: priceTxt ? " (listed at " + priceTxt + "/month)" : "",
      beds: listing.beds != null ? String(listing.beds) : "",
      url: listing.url || "",
      // profil brut
      name: profile.name || "",
      email: profile.email || "",
      phone: profile.phone || "",
      occupation: profile.occupation || "",
      income: profile.income || "",
      country: profile.country || "",
      guarantor: profile.guarantor || DEFAULT_PROFILE.guarantor,
      movein: profile.movein || "as soon as possible",
      // clauses auto-effacantes
      based_clause: profile.country ? "based in " + profile.country : "based abroad",
      occupation_clause: profile.occupation ? " (" + profile.occupation + ")" : "",
      income_clause: profile.income ? "proof of income (" + profile.income + "), " : "proof of income, ",
      contact_line: [profile.email, profile.phone].filter(Boolean).join(" | "),
      extra: profile.extra ? "\n" + profile.extra + "\n" : "",
      from_clause: profile.country ? " from " + profile.country : "",
      // disponibilites
      availability: avail,
      availability_sentence: avail
        ? "I'm available " + avail + ", and I can work around your schedule."
        : "I can make myself available at any time that suits you, including early morning New York time.",
      availability_line: avail
        ? "\nI'm available " + avail + ", and I can work around your schedule.\n"
        : "\nI can make myself available at any time that suits you, including early morning New York time.\n",
    };
    var out = template.replace(/\{\{(\w+)\}\}/g, function (m, k) {
      return Object.prototype.hasOwnProperty.call(vars, k) ? vars[k] : m;
    });
    out = stripDashes(out);
    out = out.replace(/[ \t]+\n/g, "\n").replace(/\n{3,}/g, "\n\n").trim();
    return out;
  }

  function profileIsUsable(profile) {
    return !!(profile && profile.name && profile.email);
  }

  window.SEG = {
    t: t,
    applyI18n: applyI18n,
    dayLabel: dayLabel,
    periodLabel: periodLabel,
    KEYS: KEYS,
    DAY_KEYS: DAY_KEYS,
    DAY_EN: DAY_EN,
    PERIODS: PERIODS,
    DEFAULT_PROFILE: DEFAULT_PROFILE,
    DEFAULT_TEMPLATE: DEFAULT_TEMPLATE,
    DEFAULT_CRITERIA: DEFAULT_CRITERIA,
    DEFAULT_TOUR: DEFAULT_TOUR,
    get: get,
    set: set,
    loadSettings: loadSettings,
    withDefaults: withDefaults,
    listingKey: listingKey,
    getSent: getSent,
    markSent: markSent,
    renderTemplate: renderTemplate,
    fmtPrice: fmtPrice,
    stripDashes: stripDashes,
    fmtTime12: fmtTime12,
    toMinutes: toMinutes,
    nyOffsetHours: nyOffsetHours,
    effectiveOffset: effectiveOffset,
    nySlots: nySlots,
    availabilityPhrase: availabilityPhrase,
    profileIsUsable: profileIsUsable,
  };
})();
