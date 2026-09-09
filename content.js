/**
 * Guarantor Checker for NYC Rentals — content script (robuste + diagnostic)
 *
 * Objectif de cette version : marcher sur le VRAI DOM de StreetEasy et, quand ça
 * ne marche pas, le DIRE clairement (panneau de diagnostic en bas a gauche +
 * logs console prefixes [SEG]) pour qu'on calibre vite ensemble.
 *
 * Strategie de detection d'adresse, du plus fiable au plus heuristique :
 *   1) JSON embarque dans la page : occurrences "streetAddress":"..." (StreetEasy
 *      injecte l'etat des annonces en JSON). Source stable, independante du CSS.
 *   2) Attributs/microdata : [itemprop=streetAddress], <address>, [class*=address].
 *   3) Regex adresse NYC sur le texte de chaque carte d'annonce.
 *
 * Verification Insurent : via le service worker (voir background.js).
 */

(function () {
  "use strict";

  const DEBUG = false; // true = panneau de diagnostic + logs console
  const log = function () {
    if (DEBUG) console.log.apply(console, ["[SEG]"].concat([].slice.call(arguments)));
  };

  // Traduction : _locales/<langue>/messages.json, avec repli sur l'anglais
  // (default_locale). On passe par chrome.i18n directement plutot que par SEG,
  // pour que les badges restent traduits meme si shared.js n'a pas ete injecte.
  const t = function (key, subs) {
    try { return chrome.i18n.getMessage(key, subs) || key; }
    catch (e) { return key; }
  };

  function escapeHtml(str) {
    return String(str == null ? "" : str).replace(/[&<>"]/g, function (ch) {
      return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[ch];
    });
  }

  const THEGUARANTORS_SEARCH_URL = "https://www.theguarantors.com/renters/";
  const INSURENT_SEARCH_URL = "https://www.insurent.com/search-buildings/";

  // Regex volontairement un peu plus souple que la v0.2.
  const ADDRESS_REGEX =
    /\b\d{1,5}[A-Za-z]?(-\d{1,4})?\s+([NSEW]\.?\s+)?([A-Z0-9][a-zA-Z0-9'.]*\s?){1,5}(Street|St|Avenue|Ave|Road|Rd|Boulevard|Blvd|Place|Pl|Drive|Dr|Lane|Ln|Way|Terrace|Ter|Court|Ct|Broadway|Parkway|Pkwy|Plaza|Square|Sq|Walk|Row|Alley|Crescent|Circle)\b/;

  const PROCESSED_ATTR = "data-seg-processed";
  const stats = { cards: 0, withAddress: 0, checked: 0, covered: 0, notListed: 0, maybe: 0, err: 0 };

  /* ================= detection d'adresse ================= */

  // Recolte toutes les adresses "streetAddress" du JSON embarque de la page.
  // On les garde normalisees -> pour recouper avec le texte des cartes.
  function collectEmbeddedAddresses() {
    const set = new Set();
    try {
      const html = document.documentElement.innerHTML;
      const re = /"streetAddress"\s*:\s*"([^"]+)"/g;
      let m;
      while ((m = re.exec(html))) set.add(m[1].trim());
    } catch (e) {}
    return set;
  }

  function addressFromNode(card) {
    // 2a) microdata / classes explicites
    const explicit = card.querySelector(
      "[itemprop='streetAddress'], address, [class*='address' i], [data-testid*='address' i]"
    );
    if (explicit) {
      const t = (explicit.textContent || "").trim();
      const mm = t.match(ADDRESS_REGEX);
      if (mm) return mm[0];
      if (t && /\d/.test(t) && t.length < 80) return t; // ex: "2035 5th Avenue"
    }
    // 2b) liens / titres
    const candidates = card.querySelectorAll("a, h1, h2, h3, [class*='title' i]");
    for (const el of candidates) {
      const text = (el.textContent || "").trim();
      if (text && ADDRESS_REGEX.test(text)) return text.match(ADDRESS_REGEX)[0];
    }
    // 2c) tout le texte de la carte
    const full = card.textContent || "";
    const m = full.match(ADDRESS_REGEX);
    return m ? m[0] : null;
  }

  /* ================= ancrage de notre UI ================= */

  /**
   * StreetEasy hydrate son React APRES le chargement du content script. Quand
   * l'hydratation trouve des noeuds qu'il n'a pas produits, elle echoue
   * (erreurs React #418 / #423 dans la console) et React re-rend tout l'arbre —
   * en emportant au passage nos badges ET notre bouton flottant. Symptome vu :
   * le bouton apparait une seconde, puis disparait pour de bon.
   *
   * Deux parades : on retarde la premiere injection jusqu'a la fin de
   * l'hydratation (voir plus bas), et on surveille nos elements pour les
   * re-attacher s'ils sont effaces. `mount()` enregistre un element dans cette
   * surveillance.
   */
  const MOUNTED = [];
  function mount(el) {
    if (MOUNTED.indexOf(el) === -1) MOUNTED.push(el);
    if (!el.isConnected) (document.body || document.documentElement).appendChild(el);
    return el;
  }

  let remountCount = 0;
  function remountAll() {
    let remounted = 0;
    MOUNTED.forEach(function (el) {
      if (!el.isConnected) { (document.body || document.documentElement).appendChild(el); remounted++; }
    });
    if (remounted) {
      remountCount += remounted;
      log("UI re-attachee apres un re-rendu de la page (" + remountCount + " au total)");
    }
  }
  setInterval(remountAll, 1000);

  /* ================= UI ================= */

  /**
   * Un badge = une pastille sobre : puce de couleur + marque + etat en un mot.
   * Le "pourquoi" tient dans le popover, pas dans le badge : sur une page de
   * resultats on doit pouvoir lire vingt badges d'un coup d'oeil.
   */
  function makeBadge(brandKey, address) {
    const b = document.createElement("button");
    b.className = "seg-badge seg-loading";
    b.type = "button";
    const dot = document.createElement("span"); dot.className = "seg-dot";
    const brand = document.createElement("span"); brand.className = "seg-brand";
    const state = document.createElement("span"); state.className = "seg-state";
    brand.textContent = t(brandKey);
    state.textContent = t("statusChecking");
    b.appendChild(dot); b.appendChild(brand); b.appendChild(state);
    b._state = state;
    b.title = t("badgeTipChecking", [t(brandKey), address]);
    return b;
  }

  // Etat visuel + libelle + infobulle, en une passe (les trois doivent toujours
  // rester d'accord entre eux).
  function setBadgeState(badge, cls, stateKey, title) {
    badge.classList.remove("seg-loading", "seg-ok", "seg-warn", "seg-no", "seg-unknown");
    badge.classList.add(cls);
    if (badge._state) badge._state.textContent = t(stateKey);
    badge.title = title;
  }

  function buildBadge(address) {
    const wrap = document.createElement("div");
    wrap.className = "seg-badge-wrap";

    const badge = makeBadge("brandInsurent", address);
    badge.addEventListener("click", function (e) {
      e.preventDefault(); e.stopPropagation();
      showDetails(badge, address, wrap._verdict);
    });

    const tg = makeBadge("brandTg", address);
    tg.classList.add("seg-tg");
    tg.addEventListener("click", function (e) {
      e.preventDefault(); e.stopPropagation();
      showTgDetails(tg, address, wrap._tgVerdict);
    });

    wrap.appendChild(badge);
    wrap.appendChild(tg);
    wrap._badge = badge;
    wrap._tg = tg;
    return wrap;
  }

  // Applique le verdict TheGuarantors sur son badge.
  function applyTgVerdict(tg, verdict) {
    const wrap = tg.closest(".seg-badge-wrap");
    if (wrap) wrap._tgVerdict = verdict;
    // La file accepte une annonce des qu'UN des deux garants la couvre : on
    // memorise donc aussi le verdict TheGuarantors sur l'annonce.
    if (wrap && wrap._listing) {
      wrap._listing.tgStatus = (verdict && verdict.status) || "error";
//       refreshTourButton(); // [DESACTIVE]
    }
    const brand = t("brandTg");
    switch (verdict && verdict.status) {
      case "covered":
        setBadgeState(tg, "seg-ok", "statusAccepted", t("badgeTipAccepted", [brand]));
        break;
      case "not_listed":
        setBadgeState(tg, "seg-no", "statusNotListed", t("badgeTipNotListed", [brand]));
        break;
      default:
        setBadgeState(tg, "seg-unknown", "statusUnknown", t("badgeTipUnknown", [brand]));
    }
  }

  function applyVerdict(badge, address, verdict) {
    const brand = t("brandInsurent");
    let cls, stateKey, tip;
    switch (verdict && verdict.status) {
      case "covered":
        cls = "seg-ok"; stateKey = "statusAccepted";
        tip = t("badgeTipAccepted", [brand]);
        stats.covered++; break;
      case "maybe":
        cls = "seg-warn"; stateKey = "statusToConfirm";
        tip = t("badgeTipToConfirm");
        stats.maybe++; break;
      case "not_listed":
        cls = "seg-no"; stateKey = "statusNotListed";
        tip = t("badgeTipNotListed", [brand]);
        stats.notListed++; break;
      default:
        cls = "seg-unknown"; stateKey = "statusUnknown";
        tip = t("badgeTipUnknown", [brand]);
        stats.err++;
    }
    setBadgeState(badge, cls, stateKey, tip);
    // v0.4 : on garde le verdict sur l'annonce, la file de visites s'en sert
    // pour ne contacter que les batiments qui acceptent ton garant.
    const wrap = badge.closest(".seg-badge-wrap");
    if (wrap) wrap._verdict = verdict; // garde le detail pour le panneau "pourquoi ?"
    if (wrap && wrap._listing) {
      wrap._listing.status = (verdict && verdict.status) || "error";
//       refreshTourButton(); // [DESACTIVE]
    }
    updateDiag();
  }

  /* ================= panneau "pourquoi ce verdict ?" ================= */

  const MATCH_KEY = {
    exact: "insMatchExact",
    normalized: "insMatchNormalized",
    house_only: "insMatchHouseOnly",
  };

  function closePopover() {
    const p = document.getElementById("seg-pop");
    if (p) p.remove();
    document.removeEventListener("keydown", onPopKey, true);
  }
  function onPopKey(e) { if (e.key === "Escape") closePopover(); }

  function openPopover(anchor, titleHtml, bodyNode) {
    closePopover();
    const pop = document.createElement("div");
    pop.id = "seg-pop";
    pop.innerHTML = "<div class='seg-pop-head'>" + titleHtml +
      "<button class='seg-pop-x' type='button' title='" + escapeHtml(t("close")) + "'>\u00d7</button></div>";
    pop.appendChild(bodyNode);
    document.body.appendChild(pop);

    // Positionnement sous le badge, recale dans la fenetre.
    const r = anchor.getBoundingClientRect();
    const top = window.scrollY + r.bottom + 6;
    let left = window.scrollX + r.left;
    left = Math.min(left, window.scrollX + window.innerWidth - pop.offsetWidth - 12);
    left = Math.max(left, window.scrollX + 8);
    pop.style.top = top + "px";
    pop.style.left = left + "px";

    pop.addEventListener("click", function (e) { e.stopPropagation(); });
    pop.querySelector(".seg-pop-x").addEventListener("click", closePopover);
    setTimeout(function () { document.addEventListener("click", closePopover, { once: true }); }, 0);
    document.addEventListener("keydown", onPopKey, true);
    return pop;
  }

  // Une ligne "cle : valeur" du popover. Tout est echappe : `value` vient de la
  // page StreetEasy ou de la reponse d'un tiers, jamais de nous.
  function row(labelKey, value) {
    if (value == null || value === "") return "";
    return "<div class='seg-row'><span class='seg-k'>" + escapeHtml(t(labelKey)) + "</span>" +
      "<span class='seg-v'>" + escapeHtml(value) + "</span></div>";
  }

  // Titre de popover : "<marque> - <etat>", avec la puce de couleur du badge.
  function popHead(brandKey, stateKey, cls) {
    return "<span class='seg-pop-dot " + cls + "'></span><b>" + escapeHtml(t(brandKey)) +
      "</b><span class='seg-pop-state'>" + escapeHtml(t(stateKey)) + "</span>";
  }

  function showDetails(anchor, address, verdict) {
    const v = verdict || { status: "loading" };
    const d = v.detail || {};
    let head, badgeCls, verdictLine;
    switch (v.status) {
      case "covered":
        badgeCls = "seg-pop-green";
        head = popHead("brandInsurent", "statusAccepted", "seg-ok");
        verdictLine = t(MATCH_KEY[v.matchType] || "insMatchFound");
        break;
      case "maybe":
        badgeCls = "seg-pop-amber";
        head = popHead("brandInsurent", "statusToConfirm", "seg-warn");
        verdictLine = t("insMatchHouseOnly");
        break;
      case "not_listed":
        badgeCls = "seg-pop-red";
        head = popHead("brandInsurent", "statusNotListed", "seg-no");
        verdictLine = t("insNotListedLine");
        break;
      default:
        badgeCls = "seg-pop-grey";
        head = popHead("brandInsurent", "statusUnknown", "seg-unknown");
        verdictLine = t("checkFailedLine");
    }

    const body = document.createElement("div");
    body.className = "seg-pop-body " + badgeCls;
    body.innerHTML =
      "<p class='seg-pop-verdict'>" + escapeHtml(verdictLine) + "</p>" +
      row("rowListingAddress", address) +
      row("rowQuerySent", d.query) +
      row("rowFound", v.matched) +
      (v.status === "covered" || v.status === "maybe"
        ? row("rowComparison", (d.queryNorm || "?") + "  \u2194  " + (v.matchedNorm || "?"))
        : "") +
      row("rowLandlord", v.landlord) +
      row("rowBuilding", v.building) +
      row("rowCityStateZip", [v.city, v.state, v.zip].filter(Boolean).join(", ")) +
      row("rowResults", d.totalRows != null ? d.totalRows : null) +
      row("rowReason", v.reason) +
      "<div class='seg-pop-actions'>" +
        "<button class='seg-pop-btn' data-act='open'>" + escapeHtml(t("actionOpenInsurent")) + "</button>" +
        "<button class='seg-pop-btn seg-pop-btn-2' data-act='copy'>" + escapeHtml(t("actionCopyAddress")) + "</button>" +
      "</div>" +
      "<p class='seg-pop-foot'>" + escapeHtml(t("footInsurent")) + "</p>";

    const pop = openPopover(anchor, head, body);
    pop.querySelector("[data-act='open']").addEventListener("click", function () {
      copyAndOpen(address, INSURENT_SEARCH_URL); closePopover();
    });
    pop.querySelector("[data-act='copy']").addEventListener("click", function () {
      navigator.clipboard.writeText(address).catch(function () {});
      showToast(t("toastCopied", [address]));
    });
  }

  const TG_BY_KEY = {
    streeteasy: "tgByStreeteasy",
    address: "tgByAddress",
    "address~": "tgByAddressLoose",
  };

  function showTgDetails(anchor, address, verdict) {
    const v = verdict || {};
    let head, cls, line;
    switch (v.status) {
      case "covered":
        cls = "seg-pop-green";
        head = popHead("brandTg", "statusAccepted", "seg-ok");
        line = t(TG_BY_KEY[v.by] || "tgCoveredLine");
        break;
      case "not_listed":
        cls = "seg-pop-red";
        head = popHead("brandTg", "statusNotListed", "seg-no");
        line = t("tgNotListedLine");
        break;
      default:
        cls = "seg-pop-grey";
        head = popHead("brandTg", "statusUnknown", "seg-unknown");
        line = t("tgUnknownLine");
    }
    const body = document.createElement("div");
    body.className = "seg-pop-body " + cls;
    body.innerHTML =
      "<p class='seg-pop-verdict'>" + escapeHtml(line) + "</p>" +
      row("rowListingAddress", address) +
      row("rowFound", v.matched) +
      row("rowBuilding", v.name) +
      row("rowListSize", v.listSize != null ? t("listSizeValue", [String(v.listSize)]) : null) +
      row("rowReason", v.reason) +
      "<div class='seg-pop-actions'>" +
        "<button class='seg-pop-btn' data-act='open'>" + escapeHtml(t("actionOpenTg")) + "</button>" +
      "</div>" +
      "<p class='seg-pop-foot'>" + escapeHtml(t("footTg")) + "</p>";
    const pop = openPopover(anchor, head, body);
    pop.querySelector("[data-act='open']").addEventListener("click", function () {
      copyAndOpen(address, THEGUARANTORS_SEARCH_URL); closePopover();
    });
  }

  async function copyAndOpen(address, url) {
    try {
      await navigator.clipboard.writeText(address);
      showToast(t("toastCopiedOpen", [address]));
    } catch (err) {
      showToast(t("toastCopyFailed", [address]));
    }
    window.open(url, "_blank", "noopener");
  }

  function showToast(message) {
    let toast = document.getElementById("seg-toast");
    if (!toast) { toast = document.createElement("div"); toast.id = "seg-toast"; }
    mount(toast);
    toast.textContent = message;
    toast.classList.add("seg-toast-visible");
    clearTimeout(showToast._timer);
    showToast._timer = setTimeout(function () { toast.classList.remove("seg-toast-visible"); }, 5000);
  }

  /* ================= panneau de diagnostic ================= */
  let diagEl = null;
  function updateDiag() {
    if (!DEBUG) return;
    if (!diagEl) {
      diagEl = document.createElement("div");
      diagEl.id = "seg-diag";
      diagEl.addEventListener("click", function () { diagEl.classList.toggle("seg-diag-min"); });
      mount(diagEl);
    }
    diagEl.innerHTML =
      "<b>SEG diag</b> (clic pour reduire)<br>" +
      "cartes: " + stats.cards + " &middot; avec adresse: " + stats.withAddress + "<br>" +
      "checkes: " + stats.checked + " &rarr; 🟢" + stats.covered +
      " 🟡" + stats.maybe + " 🔴" + stats.notListed + " ⚪" + stats.err;
  }

  /* ================= donnees des annonces (ex-file de visites) ================= */
  // [DESACTIVE] La file de demandes de visite est entierement en commentaire
  // (voir plus bas). On garde en revanche la collecte des annonces : l'URL sert
  // a extraire le slug du batiment pour la verification TheGuarantors.

  const SEG = window.SEG; // shared.js
  if (!SEG) log("shared.js absent : la file de demandes de visite est desactivee.");
  const LISTINGS = [];              // { address, url, price, beds, status, tgStatus }
  const LISTING_BY_KEY = new Map();  // pathname -> l'objet ci-dessus

  // React recree periodiquement les cartes (re-rendu apres hydratation ratee,
  // scroll infini, changement de filtre). Sans cette table, chaque recreation
  // repartait d'un objet "pending" et le compteur de la file retombait a zero.
  function rememberListing(data) {
    if (!data || !data.url) return data;
    const key = SEG.listingKey(data.url);
    const known = LISTING_BY_KEY.get(key);
    if (known) return known;
    LISTING_BY_KEY.set(key, data);
    LISTINGS.push(data);
    return data;
  }

  // ATTENTION : `textContent` colle les elements voisins sans separateur. Sur une
  // carte StreetEasy, "$3,500" suivi de "1 bed" devient "$3,5001 bed" — et une
  // regex de prix y lit 35001 au lieu de 3500. On reconstruit donc le texte en
  // joignant les noeuds texte par un espace.
  function readableText(el) {
    const out = [];
    const walker = document.createTreeWalker(el, NodeFilter.SHOW_TEXT, null);
    let n;
    while ((n = walker.nextNode())) {
      const t = (n.nodeValue || "").trim();
      if (t) out.push(t);
    }
    return out.join(" ");
  }

  // Prix : on exige un nombre proprement groupe (3,500 / 3500) qui ne soit PAS
  // suivi d'un autre chiffre, pour ne jamais avaler le "1" de "1 bed".
  function priceFrom(txt) {
    const m = txt.match(/\$\s?(\d{1,3}(?:,\d{3})+|\d{3,6})(?!\d)/);
    if (!m) return 0;
    const n = parseInt(m[1].replace(/,/g, ""), 10);
    return n > 0 && n < 200000 ? n : 0; // au-dela, c'est un prix de vente ou un parsing rate
  }

  function listingDataFrom(card, address) {
    const link = card.querySelector("a[href*='/rental/'], a[href*='/building/'], a[href*='/sale/']");
    if (!link || !link.href) return null;
    const txt = readableText(card);
    let beds = null;
    if (/\bstudio\b/i.test(txt)) beds = 0;
    const bedM = txt.match(/(\d+)\s*(bed|bd\b|br\b)/i);
    if (bedM) beds = parseInt(bedM[1], 10);
    return {
      address: address,
      url: link.href,
      price: priceFrom(txt),
      beds: beds,
      status: "pending",
      tgStatus: "pending",
    };
  }

  /* ------------------------------------------------------------------ *
   *  [DESACTIVE] — demander une visite
   *
   *  Tout le bloc ci-dessous (filtre d'eligibilite, bouton flottant, panneau
   *  de selection, lancement de la file) est mis en commentaire pour
   *  l'instant. Pour reactiver : decommenter ce bloc + le bloc d'init en bas
   *  de ce fichier + les appels a refreshTourButton(), decommenter la file
   *  dans background.js et retirer le `return` en tete de tour.js.
   * ------------------------------------------------------------------ */
//   // Une annonce entre dans la file s'il existe AU MOINS UN garant possible —
//   // Insurent (selon les verdicts que tu acceptes) OU TheGuarantors — qu'elle
//   // tient dans le budget, et que tu ne l'as pas deja contactee.
//   function garantOk(listing, criteria) {
//     const insurent = criteria.statuses.indexOf(listing.status) !== -1;
//     const tg = criteria.acceptTg !== false && listing.tgStatus === "covered";
//     return insurent || tg;
//   }
//
//   function eligible(listing, criteria, sent) {
//     if (!listing || !listing.url) return false;
//     if (!garantOk(listing, criteria)) return false;
//     if (criteria.maxRent && listing.price && listing.price > criteria.maxRent) return false;
//     if (criteria.minBeds && listing.beds != null && listing.beds < criteria.minBeds) return false;
//     if (criteria.skipContacted !== false && sent[SEG.listingKey(listing.url)]) return false;
//     return true;
//   }
//
//   // `selected` = ce que tu as coche ; `known` sert a cocher automatiquement les
//   // annonces qui apparaissent APRES l'ouverture du panneau (scroll infini) sans
//   // re-cocher celles que tu viens de decocher.
//   let tourBtn = null, tourPanel = null;
//   const tourState = { settings: null, sent: {}, selected: new Set(), known: new Set() };
//
//   async function refreshTourState() {
//     tourState.settings = await SEG.loadSettings();
//     tourState.sent = await SEG.getSent();
//   }
//
//   function candidates() {
//     if (!tourState.settings) return [];
//     const c = tourState.settings.criteria;
//     const seen = new Set();
//     return LISTINGS.filter(function (l) {
//       if (!eligible(l, c, tourState.sent)) return false;
//       const k = SEG.listingKey(l.url);
//       if (seen.has(k)) return false;   // photo + titre pointent sur la meme annonce
//       seen.add(k);
//       return true;
//     });
//   }
//
//   function ensureTourButton() {
//     if (tourBtn) { mount(tourBtn); return tourBtn; }
//     tourBtn = document.createElement("button");
//     tourBtn.id = "seg-tour-fab";
//     tourBtn.type = "button";
//     tourBtn.addEventListener("click", toggleTourPanel);
//     mount(tourBtn);
//     return tourBtn;
//   }
//
//   // Le bouton doit TOUJOURS apparaitre, meme a zero annonce et meme si le calcul
//   // echoue : un bouton absent ne dit rien, un bouton qui affiche son probleme se
//   // diagnostique en une seconde. (Une exception ici partait dans une promesse et
//   // faisait disparaitre le bouton en silence.)
//   function refreshTourButton() {
//     if (!tourState.settings) return;
//     const btn = ensureTourButton();
//     let n;
//     try {
//       n = candidates().length;
//     } catch (err) {
//       log("erreur dans le calcul des annonces eligibles:", err);
//       btn.textContent = "📨 Erreur (voir console)";
//       btn.title = String((err && err.message) || err) + "\nOuvre la console (F12) et cherche [SEG].";
//       btn.disabled = false;
//       btn.classList.add("seg-fab-error");
//       return;
//     }
//     btn.classList.remove("seg-fab-error");
//     btn.textContent = n
//       ? "📨 Demander une visite (" + n + ")"
//       : "📨 Aucune annonce eligible";
//     btn.title = n
//       ? n + " annonce(s) correspondent a tes criteres. Clique pour choisir."
//       : "Aucune annonce de cette page ne passe le filtre garant / budget.\nScrolle pour que les badges se verifient, ou assouplis les criteres.";
//     btn.disabled = n === 0;
//     if (tourPanel && tourPanel.classList.contains("seg-open")) renderTourPanel();
//   }
//
//   function toggleTourPanel() {
//     if (!tourPanel) {
//       tourPanel = document.createElement("div");
//       tourPanel.id = "seg-tour-panel";
//     }
//     mount(tourPanel);
//     tourPanel.classList.toggle("seg-open");
//     if (tourPanel.classList.contains("seg-open")) renderTourPanel();
//   }
//
//   function renderTourPanel() {
//     const list = candidates();
//     list.forEach(function (l) {
//       if (!tourState.known.has(l.url)) { tourState.known.add(l.url); tourState.selected.add(l.url); }
//     });
//     const profileOk = SEG.profileIsUsable(tourState.settings.profile);
//     const c = tourState.settings.criteria;
//
//     const rows = list.map(function (l) {
//       const checked = tourState.selected.has(l.url) ? "checked" : "";
//       const insurentIcon = { covered: "🟢", maybe: "🟡", not_listed: "🔴" }[l.status] || "⚪";
//       const tgIcon = l.tgStatus === "covered" ? "<b title='Couvert par TheGuarantors'>G</b>"
//         : l.tgStatus === "not_listed" ? "<span title='Pas chez TheGuarantors' style='opacity:.35'>G</span>"
//           : "<span title='TheGuarantors non verifie' style='opacity:.35'>·</span>";
//       const icon = insurentIcon + " " + tgIcon;
//       const price = l.price ? SEG.fmtPrice(l.price) : "—";
//       const beds = l.beds === 0 ? "studio" : (l.beds != null ? l.beds + " ch." : "");
//       return "<label class='seg-trow'><input type='checkbox' data-url='" + encodeURI(l.url) + "' " + checked + ">" +
//         "<span class='seg-tico'>" + icon + "</span>" +
//         "<span class='seg-tadr'>" + escapeHtml(l.address) + "</span>" +
//         "<span class='seg-tmeta'>" + price + (beds ? " &middot; " + beds : "") + "</span></label>";
//     }).join("");
//
//     const sentCount = Object.keys(tourState.sent).length;
//     tourPanel.innerHTML =
//       "<div class='seg-thead'><b>File de demandes de visite</b>" +
//       "<button id='seg-tclose' title='Fermer'>✕</button></div>" +
//       "<div class='seg-tsub'>Filtre : Insurent " + c.statuses.map(function (s) {
//         return { covered: "🟢", maybe: "🟡", not_listed: "🔴", error: "⚪" }[s] || s;
//       }).join(" ") +
//       (c.acceptTg !== false ? " <b>ou</b> TheGuarantors 🟢" : "") +
//       (c.maxRent ? " &middot; &le; " + SEG.fmtPrice(c.maxRent) : "") +
//       (c.minBeds ? " &middot; &ge; " + c.minBeds + " ch." : "") +
//       " &middot; " + sentCount + " deja contactees</div>" +
//       (list.length ? "<div class='seg-tlist'>" + rows + "</div>"
//         : "<div class='seg-tempty'>Aucune annonce ne correspond pour l'instant. Scrolle la page (les badges se verifient a l'ecran) ou assouplis les criteres.</div>") +
//       (profileOk ? "" : "<div class='seg-twarn'>⚠️ Renseigne ton nom et ton email dans les reglages avant de lancer la file.</div>") +
//       "<div class='seg-tfoot'>" +
//       "<button id='seg-tall' class='seg-tbtn'>Tout / rien</button>" +
//       "<button id='seg-topts' class='seg-tbtn'>Reglages</button>" +
//       "<button id='seg-tgo' class='seg-tbtn seg-tbtn-ok'" + (profileOk && list.length ? "" : " disabled") + ">Lancer</button>" +
//       "</div>";
//
//     tourPanel.querySelector("#seg-tclose").onclick = toggleTourPanel;
//     tourPanel.querySelectorAll("input[type=checkbox]").forEach(function (cb) {
//       cb.onchange = function () {
//         const url = decodeURI(cb.getAttribute("data-url"));
//         if (cb.checked) tourState.selected.add(url); else tourState.selected.delete(url);
//         updateGoLabel();
//       };
//     });
//     tourPanel.querySelector("#seg-tall").onclick = function () {
//       const all = tourState.selected.size === list.length;
//       tourState.selected = new Set(all ? [] : list.map(function (l) { return l.url; }));
//       renderTourPanel();
//     };
//     // Une page chrome-extension:// ne s'ouvre pas depuis un content script :
//     // c'est le service worker qui ouvre les options.
//     tourPanel.querySelector("#seg-topts").onclick = function () {
//       chrome.runtime.sendMessage({ type: "OPEN_OPTIONS" }, function () {});
//     };
//     tourPanel.querySelector("#seg-tgo").onclick = function () { startQueue(list); };
//     updateGoLabel();
//
//     function updateGoLabel() {
//       const go = tourPanel.querySelector("#seg-tgo");
//       const n = list.filter(function (l) { return tourState.selected.has(l.url); }).length;
//       go.textContent = "Lancer (" + n + ")";
//       go.disabled = !profileOk || n === 0;
//     }
//   }
//
//   function escapeHtml(s) {
//     return String(s || "").replace(/[&<>"]/g, function (ch) {
//       return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[ch];
//     });
//   }
//
//   function startQueue(list) {
//     const items = list.filter(function (l) { return tourState.selected.has(l.url); })
//       .map(function (l) {
//         return { url: l.url, address: l.address, price: l.price, beds: l.beds, status: l.status };
//       });
//     if (!items.length) return;
//     chrome.runtime.sendMessage({ type: "TOUR_START", items: items }, function (resp) {
//       if (resp && resp.ok) {
//         showToast(items.length + " annonces en file. Un onglet vient de s'ouvrir : relis le message, clique Envoyer, puis « Envoye → suivant ».");
//         if (tourPanel) tourPanel.classList.remove("seg-open");
//       } else {
//         showToast("Impossible de lancer la file" + (resp && resp.error ? " (" + resp.error + ")" : "") + ".");
//       }
//     });
//   }

  /* ================= reperage des cartes ================= */

  function findListingCards() {
    // On part des liens vers des fiches, puis on remonte jusqu'a un ancetre
    // "carte" plausible (contient un prix ou une adresse), plutot qu'un nombre
    // fixe de parents.
    const links = document.querySelectorAll(
      "a[href*='/building/'], a[href*='/rental/'], a[href*='/for-rent/'], a[href*='/for-sale/']"
    );
    const CHROME_SEL = "nav, header, footer, [role='navigation'], [role='banner'], [role='contentinfo'], [class*='nav' i], [class*='header' i], [class*='footer' i], [class*='menu' i]";
    const cards = new Set();
    links.forEach(function (link) {
      // On ignore les liens de la barre de navigation / entete / pied de page :
      // "Rent" -> /for-rent, "Buy" -> /for-sale, etc. matchent sinon par erreur.
      if (link.closest(CHROME_SEL)) return;
      let node = link;
      for (let i = 0; i < 6 && node.parentElement; i++) {
        node = node.parentElement;
        const txt = node.textContent || "";
        if (/\$[\d,]{3,}/.test(txt)) break; // un prix = vraie carte d'annonce
      }
      cards.add(node);
    });
    return Array.from(cards);
  }

  const io = new IntersectionObserver(function (entries) {
    entries.forEach(function (entry) {
      if (!entry.isIntersecting) return;
      const wrap = entry.target;
      io.unobserve(wrap);
      requestCheck(wrap._address, wrap._badge);
      requestTgCheck(wrap._address, wrap._slug, wrap._tg);
    });
  }, { rootMargin: "150px" });

  // Slug StreetEasy d'une annonce, ex : /building/the-set-... -> "the-set-..."
  function slugFromUrl(url) {
    if (!url) return null;
    const m = String(url).match(/\/building\/([^/?#]+)/i);
    return m ? m[1].toLowerCase() : null;
  }

  function requestTgCheck(address, slug, tg) {
    if (!tg) return;
    let done = false;
    const guard = setTimeout(function () {
      if (!done) applyTgVerdict(tg, { status: "error", reason: "timeout SW" });
    }, 12000);
    try {
      chrome.runtime.sendMessage({ type: "CHECK_GUARANTORS", address: address, slug: slug }, function (resp) {
        done = true; clearTimeout(guard);
        if (chrome.runtime.lastError) {
          applyTgVerdict(tg, { status: "error", reason: chrome.runtime.lastError.message }); return;
        }
        if (resp && resp.ok) applyTgVerdict(tg, resp.verdict);
        else applyTgVerdict(tg, { status: "error", reason: (resp && resp.error) || "no resp" });
      });
    } catch (err) {
      done = true; clearTimeout(guard);
      applyTgVerdict(tg, { status: "error", reason: String(err) });
    }
  }

  function requestCheck(address, badge) {
    stats.checked++;
    let done = false;
    const guard = setTimeout(function () {
      if (!done) applyVerdict(badge, address, { status: "error", reason: "timeout SW" });
    }, 12000);
    try {
      chrome.runtime.sendMessage({ type: "CHECK_INSURENT", address: address }, function (resp) {
        done = true; clearTimeout(guard);
        if (chrome.runtime.lastError) {
          applyVerdict(badge, address, { status: "error", reason: chrome.runtime.lastError.message }); return;
        }
        if (resp && resp.ok) applyVerdict(badge, address, resp.verdict);
        else applyVerdict(badge, address, { status: "error", reason: (resp && resp.error) || "no resp" });
      });
    } catch (err) {
      done = true; clearTimeout(guard);
      applyVerdict(badge, address, { status: "error", reason: String(err) });
    }
  }

  function processCards() {
    const cards = findListingCards();
    let newCards = 0, newAddr = 0;
    cards.forEach(function (card) {
      if (!card || card.nodeType !== 1) return;
      if (card.hasAttribute(PROCESSED_ATTR)) return;
      // Anti-doublon : plusieurs liens d'une meme annonce (photo + titre) peuvent
      // remonter vers des conteneurs imbriques differents. On ne pose qu'UN badge
      // par annonce -> on saute si un descendant OU un ancetre en a deja un.
      if (card.querySelector(".seg-badge-wrap") || card.closest(".seg-badged")) {
        card.setAttribute(PROCESSED_ATTR, "1");
        return;
      }
      card.setAttribute(PROCESSED_ATTR, "1");
      // Filet de securite : une vraie carte d'annonce affiche un loyer/prix.
      // Sans prix, on ne badge pas (evite nav, encarts, blocs promo...).
      if (!/\$[\d,]{3,}/.test(card.textContent || "")) return;
      newCards++;
      const address = addressFromNode(card);
      if (!address) return;
      newAddr++;
      const wrap = buildBadge(address);
      wrap._address = address;
      wrap._listing = SEG ? rememberListing(listingDataFrom(card, address)) : listingDataFrom(card, address);
      wrap._slug = slugFromUrl(wrap._listing && wrap._listing.url) ||
        slugFromUrl((card.querySelector("a[href*='/building/']") || {}).href);
      card.classList.add("seg-badged");
      card.appendChild(wrap);
      io.observe(wrap);
    });
    stats.cards += newCards;
    stats.withAddress += newAddr;
    if (newCards) log("processCards: +" + newCards + " cartes, +" + newAddr + " avec adresse", stats);
    updateDiag();
  }

  // Diagnostic initial : combien d'adresses le JSON embarque contient-il ?
  const embedded = collectEmbeddedAddresses();
  log("adresses dans le JSON embarque:", embedded.size, [...embedded].slice(0, 5));
  if (embedded.size === 0) {
    log("Aucune adresse trouvee dans le HTML — page peut-etre pas une page d'annonces, ou structure differente.");
  }

  // On n'injecte pas les badges pendant l'hydratation React de StreetEasy :
  // c'est ce qui declenchait les erreurs #418/#423 et le re-rendu qui effacait
  // tout. On attend la fin du chargement, plus une courte marge.
  function firstScan() {
    processCards();
    updateDiag();
  }
  if (document.readyState === "complete") setTimeout(firstScan, 400);
  else window.addEventListener("load", function () { setTimeout(firstScan, 800); });

  // [DESACTIVE] init de la file de visites — voir le bloc [DESACTIVE] plus haut.
//   // File de visites : on charge tes reglages puis on affiche le bouton flottant.
//   if (SEG) {
//     ensureTourButton();
//     refreshTourState().then(refreshTourButton);
//     chrome.storage.onChanged.addListener(function (changes, area) {
//       if (area !== "local") return;
//       if (changes.seg_profile || changes.seg_criteria || changes.seg_template || changes.seg_sent) {
//         refreshTourState().then(refreshTourButton);
//       }
//     });
//   }

  const observer = new MutationObserver(function () {
    clearTimeout(processCards._debounce);
    processCards._debounce = setTimeout(processCards, 400);
  });
  observer.observe(document.body, { childList: true, subtree: true });

  log("Guarantor Checker charge sur", location.href);
})();
