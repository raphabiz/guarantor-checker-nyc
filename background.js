/**
 * Guarantor Checker for NYC Rentals — Service worker (MV3)
 *
 * ROLE : faire les appels cross-origin vers Insurent que le content script ne
 * peut pas faire lui-meme (politique CORS des pages web). Grace aux
 * `host_permissions` declares dans le manifest, le service worker d'extension
 * peut interroger insurent.com sans etre bloque par CORS.
 *
 * CE QU'IL FAIT :
 * - Recupere (et met en cache) le "nonce" de securite WordPress publie sur la
 *   page de recherche PUBLIQUE d'Insurent (https://www.insurent.com/search-buildings/).
 * - Interroge l'endpoint AJAX PUBLIC d'autocompletion d'Insurent
 *   (action=search_certified_addresses) — le MEME que celui utilise par leur
 *   propre champ de recherche quand un visiteur tape une adresse. Aucune
 *   authentification, aucune donnee privee : ce sont les batiments qu'Insurent
 *   publie volontairement comme "certifies / participants".
 * - Compare l'adresse de l'annonce StreetEasy aux resultats et renvoie un verdict.
 *
 * CE QU'IL NE FAIT PAS :
 * - Pas de scraping en masse : une requete par annonce que TOI tu regardes, avec
 *   cache local pour ne pas re-demander la meme adresse.
 * - Pas de contournement d'authentification : on lit un nonce public affiche dans
 *   la page, exactement comme le fait le navigateur d'un visiteur normal.
 */

"use strict";

const INSURENT_SEARCH_PAGE = "https://www.insurent.com/search-buildings/";
const INSURENT_AJAX_URL = "https://www.insurent.com/wp-admin/admin-ajax.php";

// Cache memoire du nonce (le service worker peut etre tue : on re-fetch au besoin).
let cachedNonce = null;
let nonceFetchedAt = 0;
const NONCE_TTL_MS = 6 * 60 * 60 * 1000; // 6 h — bien en dessous de la duree de vie WP.

// Cache des resultats par adresse normalisee (evite de re-taper Insurent).
const resultCache = new Map(); // key -> { verdict, ts }
const RESULT_TTL_MS = 24 * 60 * 60 * 1000;

/* ------------------------------------------------------------------ *
 *  Normalisation d'adresses NYC (pour comparer StreetEasy <-> Insurent)
 * ------------------------------------------------------------------ */
const STREET_SYNONYMS = [
  [/\bstreet\b/g, "st"],
  [/\bavenue\b/g, "ave"],
  [/\bboulevard\b/g, "blvd"],
  [/\bplace\b/g, "pl"],
  [/\bdrive\b/g, "dr"],
  [/\broad\b/g, "rd"],
  [/\blane\b/g, "ln"],
  [/\bparkway\b/g, "pkwy"],
  [/\bterrace\b/g, "ter"],
  [/\bcourt\b/g, "ct"],
  [/\beast\b/g, "e"],
  [/\bwest\b/g, "w"],
  [/\bnorth\b/g, "n"],
  [/\bsouth\b/g, "s"],
  [/\bfort\b/g, "ft"],
  [/\bsaint\b/g, "st"],
];

function normalizeAddress(raw) {
  if (!raw) return "";
  let s = raw.toLowerCase();
  s = s.replace(/,.*$/, "");                       // coupe city/state/zip apres la virgule
  s = s.replace(/#.*$/, "");                        // coupe le numero d'appartement
  s = s.replace(/\bapt\b.*$/, "");
  s = s.replace(/\b(\d+)(st|nd|rd|th)\b/g, "$1");   // 45th -> 45
  s = s.replace(/[.,'’]/g, " ");
  for (const [re, rep] of STREET_SYNONYMS) s = s.replace(re, rep);
  s = s.replace(/[^a-z0-9 ]/g, " ").replace(/\s+/g, " ").trim();
  return s;
}

function houseNumberOf(normalized) {
  const m = normalized.match(/^(\d+[a-z]?(-\d+[a-z]?)?)/);
  return m ? m[1] : null;
}

/* ------------------------------------------------------------------ *
 *  Recuperation du nonce public
 * ------------------------------------------------------------------ */
async function fetchNonce(force) {
  const fresh = cachedNonce && Date.now() - nonceFetchedAt < NONCE_TTL_MS;
  if (fresh && !force) return cachedNonce;

  const res = await fetch(INSURENT_SEARCH_PAGE, { credentials: "omit" });
  const html = await res.text();
  // La page definit : var send_co_applicant_nonce = "xxxxxxxxxx";
  let m = html.match(/send_co_applicant_nonce\s*=\s*["']([a-f0-9]+)["']/i);
  if (!m) m = html.match(/["']nonce["']\s*:\s*["']([a-f0-9]+)["']/i);
  if (!m) throw new Error("Nonce Insurent introuvable sur la page de recherche.");
  cachedNonce = m[1];
  nonceFetchedAt = Date.now();
  return cachedNonce;
}

/* ------------------------------------------------------------------ *
 *  Appel a l'endpoint d'autocompletion publique
 * ------------------------------------------------------------------ */
async function queryInsurent(keyword, nonce) {
  const body = new URLSearchParams({
    action: "search_certified_addresses",
    keyword: keyword,
    state: "",
    landlord: "",
    security: nonce,
  });
  const res = await fetch(INSURENT_AJAX_URL, {
    method: "POST",
    credentials: "omit",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded; charset=UTF-8",
      "X-Requested-With": "XMLHttpRequest",
    },
    body: body.toString(),
  });
  if (!res.ok) throw new Error("HTTP " + res.status);
  return res.json();
}

/* ------------------------------------------------------------------ *
 *  Verdict pour une adresse StreetEasy
 * ------------------------------------------------------------------ */
async function checkInsurent(address) {
  const norm = normalizeAddress(address);
  if (!norm) return { status: "unknown", reason: "Adresse illisible" };

  const cached = resultCache.get(norm);
  if (cached && Date.now() - cached.ts < RESULT_TTL_MS) return cached.verdict;

  const houseNo = houseNumberOf(norm);
  // On tape avec l'adresse rue SEULE (sans city/state ni numero d'appartement),
  // comme le recommande Insurent : un "#3F" ou "Apt 2" casse leur recherche.
  const keyword = address
    .replace(/,.*$/, "")            // city/state/zip
    .replace(/#.*$/, "")            // #3F
    .replace(/\b(apt|unit|suite|ste|fl|floor)\b.*$/i, "") // Apt 2, Unit B...
    .replace(/\s+/g, " ")
    .trim();

  let data;
  try {
    let nonce = await fetchNonce(false);
    data = await queryInsurent(keyword, nonce);
    // Nonce expire / rejete -> WP renvoie souvent 400 / 0 / {success:false}.
    // On reessaie une fois avec un nonce frais.
    if (!data || data.success !== true) {
      nonce = await fetchNonce(true);
      data = await queryInsurent(keyword, nonce);
    }
  } catch (err) {
    return { status: "error", reason: String((err && err.message) || err) };
  }

  const rows = (data && data.success && Array.isArray(data.data)) ? data.data : [];

  // On ne garde que les resultats dont le NUMERO DE RUE correspond, sinon le
  // "keyword" large d'Insurent ramene des batiments sans rapport (il matche aussi
  // les zips, etc.).
  let best = null;
  for (const row of rows) {
    const rNorm = normalizeAddress(row.ADDRESS || "");
    const rHouse = houseNumberOf(rNorm);
    if (houseNo && rHouse && rHouse === houseNo) {
      // Type de correspondance, du plus fort au plus faible :
      //  - "exact"      : chaines normalisees identiques
      //  - "normalized" : identiques apres abreviations (Street->st, East->e...)
      //  - "house_only" : meme numero de rue mais rue differente
      let matchType = "house_only";
      if (rNorm === norm) matchType = "exact";
      else if (rNorm.startsWith(norm) || norm.startsWith(rNorm)) matchType = "normalized";
      const strong = matchType === "exact" || matchType === "normalized";
      if (strong) { best = { row: row, matchType: matchType, rNorm: rNorm }; break; }
      if (!best) best = { row: row, matchType: matchType, rNorm: rNorm };
    }
  }

  // Detail commun a tous les verdicts, pour la justification affichee a l'ecran.
  const detail = {
    query: keyword,          // ce qu'on a envoye a Insurent
    queryNorm: norm,         // adresse StreetEasy normalisee
    houseNo: houseNo,        // numero de rue extrait
    totalRows: rows.length,  // nb de resultats renvoyes par Insurent
    endpoint: "insurent.com · search_certified_addresses",
  };

  let verdict;
  if (best && (best.matchType === "exact" || best.matchType === "normalized")) {
    verdict = {
      status: "covered",
      matchType: best.matchType,
      building: best.row.BUILDING_NAME || null,
      landlord: best.row.PARENT_COMPANY_NAME || null,
      matched: best.row.ADDRESS,
      matchedNorm: best.rNorm,
      city: best.row.CITY, state: best.row.STATE, zip: best.row.ZIP_CODE,
      detail: detail,
    };
  } else if (best) {
    verdict = {
      status: "maybe",
      matchType: best.matchType, // house_only
      matched: best.row.ADDRESS,
      matchedNorm: best.rNorm,
      landlord: best.row.PARENT_COMPANY_NAME || null,
      city: best.row.CITY, state: best.row.STATE, zip: best.row.ZIP_CODE,
      detail: detail,
    };
  } else {
    verdict = { status: "not_listed", detail: detail };
  }

  resultCache.set(norm, { verdict: verdict, ts: Date.now() });
  return verdict;
}

/* ------------------------------------------------------------------ *
 *  [DESACTIVE] — file de demandes de visite
 *
 *  Bloc mis en commentaire pour l'instant (voir aussi content.js et le
 *  `return` en tete de tour.js). Rien ne pilote plus les onglets.
 * ------------------------------------------------------------------ */
// /* ------------------------------------------------------------------ *
//  *  File de demandes de visite (v0.4)
//  *
//  *  Le service worker est le seul a pouvoir piloter l'onglet d'une annonce a
//  *  l'autre. Il ne fait QUE naviguer : le pre-remplissage et l'envoi se passent
//  *  dans la page (tour.js), et c'est TOI qui cliques "Envoyer".
//  * ------------------------------------------------------------------ */
//
// function getQueue() {
//   return new Promise((resolve) =>
//     chrome.storage.local.get(["seg_queue"], (r) => resolve((r && r.seg_queue) || null))
//   );
// }
// function setQueue(q) {
//   return new Promise((resolve) => chrome.storage.local.set({ seg_queue: q }, resolve));
// }
//
// // Ouvre l'annonce courante de la file, en reutilisant le meme onglet d'une
// // annonce a l'autre (sinon on se retrouve avec 30 onglets ouverts).
// async function openCurrent(queue) {
//   const item = queue.items[queue.index];
//   if (!item) return { done: true };
//   if (queue.tabId != null) {
//     try {
//       await chrome.tabs.update(queue.tabId, { url: item.url, active: true });
//       return { ok: true };
//     } catch (e) {
//       // onglet ferme entre-temps -> on en recree un
//     }
//   }
//   const tab = await chrome.tabs.create({ url: item.url, active: true });
//   queue.tabId = tab.id;
//   await setQueue(queue);
//   return { ok: true };
// }
//
// async function startQueue(items) {
//   const queue = { items: items, index: 0, tabId: null, startedAt: Date.now() };
//   await setQueue(queue);
//   await openCurrent(queue);
//   return { ok: true, total: items.length };
// }
//
// async function nextInQueue() {
//   const queue = await getQueue();
//   if (!queue) return { ok: false, error: "pas de file" };
//   queue.index++;
//   if (queue.index >= queue.items.length) {
//     await setQueue(null);
//     try {
//       if (queue.tabId != null) {
//         await chrome.tabs.update(queue.tabId, { url: "https://streeteasy.com/for-rent/nyc" });
//       }
//     } catch (e) {}
//     return { ok: true, done: true, total: queue.items.length };
//   }
//   await setQueue(queue);
//   await openCurrent(queue);
//   return { ok: true, index: queue.index, total: queue.items.length };
// }

/* ================================================================== *
 *  TheGuarantors — liste GLOBALE des batiments couverts (NY + NJ)
 *
 *  Source : le MEME endpoint public que l'extension officielle
 *  "TheGuarantors - Chrome Extension" (Guarantr, Inc.) utilise pour
 *  poser son "G" vert sur StreetEasy. Il renvoie la liste des batiments
 *  couverts avec leur rue, leur nom et leur identifiant StreetEasy.
 *
 *  La cle "API-key" ci-dessous est livree en clair dans cette extension
 *  publique (c'est un identifiant de client partage pour un jeu de
 *  donnees que TheGuarantors publie volontairement, pas un secret perso).
 *  On l'utilise a l'identique, dans le meme but, pour une consultation
 *  personnelle. Elle peut etre changee/revoquee par eux a tout moment :
 *  si TG repasse en 403/erreur, ce bloc cesse simplement de fonctionner
 *  (l'Insurent, lui, continue) — le plus fiable reste d'installer aussi
 *  leur extension officielle.
 * ================================================================== */
const TG_API_URL =
  "https://theguarantors.com/api/v1/buildings" +
  "?states%5B%5D=NJ&states%5B%5D=NY" +
  "&attributes%5B%5D=name&attributes%5B%5D=street&attributes%5B%5D=streeteasy";
const TG_API_KEY = "2d42bf715e4aa986d55ab6512ab8e1fd";
const TG_TTL_MS = 24 * 60 * 60 * 1000;

let tgMem = null; // { byStreet: Map, bySlug: Map, count, fetchedAt }

// Memoire d'un echec (403 = cle changee cote TheGuarantors, coupure reseau...).
// Sans ca, une page de resultats de 40 annonces declenche 40 requetes vouees a
// echouer : inutile pour toi, et le pire signal a envoyer a leur API. On attend
// donc quelques minutes avant de retenter, et les badges affichent simplement
// "non verifie" entre-temps.
const TG_FAIL_TTL_MS = 10 * 60 * 1000;
let tgFail = null; // { at: timestamp, reason: string }

function tgSlugFromStreeteasy(v) {
  if (!v) return null;
  // "streeteasy" peut etre une URL, un chemin /building/<slug>, ou un slug nu.
  const s = String(v).trim().toLowerCase();
  const m = s.match(/building\/([^/?#]+)/);
  if (m) return m[1];
  if (/^https?:/.test(s)) return null;
  return s.replace(/^\/+|\/+$/g, "") || null;
}

function tgBuildIndex(list) {
  const byStreet = new Map();
  const bySlug = new Map();
  (list || []).forEach(function (b) {
    if (!b) return;
    const street = b.street || b.address || b.name;
    const nStreet = normalizeAddress(street || "");
    if (nStreet) if (!byStreet.has(nStreet)) byStreet.set(nStreet, b);
    const slug = tgSlugFromStreeteasy(b.streeteasy || b.streetEasy || b.streeteasy_url);
    if (slug) bySlug.set(slug, b);
  });
  return { byStreet: byStreet, bySlug: bySlug, count: (list || []).length };
}

async function loadGuarantorsList(force) {
  const fresh = tgMem && Date.now() - tgMem.fetchedAt < TG_TTL_MS;
  if (fresh && !force) return tgMem;

  // Echec recent : on renvoie la meme erreur sans retaper l'API.
  if (!force && tgFail && Date.now() - tgFail.at < TG_FAIL_TTL_MS) {
    throw new Error(tgFail.reason);
  }

  // Cache persistant partage avec les reveils du service worker.
  if (!tgMem && !force) {
    try {
      const st = await chrome.storage.local.get(["tg_list", "tg_fetched_at"]);
      if (st && st.tg_list && Date.now() - (st.tg_fetched_at || 0) < TG_TTL_MS) {
        const idx = tgBuildIndex(st.tg_list);
        tgMem = Object.assign(idx, { fetchedAt: st.tg_fetched_at });
        return tgMem;
      }
    } catch (e) {}
  }

  let res;
  try {
    res = await fetch(TG_API_URL, {
      method: "GET",
      credentials: "omit",
      headers: { "Content-Type": "application/json", "API-key": TG_API_KEY },
    });
  } catch (err) {
    tgFail = { at: Date.now(), reason: String((err && err.message) || err) };
    throw err;
  }
  if (!res.ok) tgFail = { at: Date.now(), reason: "TG HTTP " + res.status };
  if (!res.ok) throw new Error("TG HTTP " + res.status);
  tgFail = null; // l'API repond de nouveau
  const json = await res.json();
  const list = Array.isArray(json)
    ? json
    : (json.data || json.buildings || json.result || []);
  const idx = tgBuildIndex(list);
  tgMem = Object.assign(idx, { fetchedAt: Date.now() });
  try {
    await chrome.storage.local.set({ tg_list: list, tg_fetched_at: tgMem.fetchedAt });
  } catch (e) {}
  return tgMem;
}

async function checkGuarantors(address, slug) {
  let idx;
  try {
    idx = await loadGuarantorsList(false);
  } catch (err) {
    // Un 403 = cle probablement changee cote TheGuarantors.
    return { status: "error", reason: String((err && err.message) || err) };
  }

  const cleanSlug = tgSlugFromStreeteasy(slug);
  if (cleanSlug && idx.bySlug.has(cleanSlug)) {
    const b = idx.bySlug.get(cleanSlug);
    return { status: "covered", by: "streeteasy", matched: b.street || b.name, name: b.name || null };
  }

  const norm = normalizeAddress(address || "");
  if (norm && idx.byStreet.has(norm)) {
    const b = idx.byStreet.get(norm);
    return { status: "covered", by: "address", matched: b.street || b.name, name: b.name || null };
  }
  // Recouvrement souple : meme numero + rue en prefixe (abreviations).
  if (norm) {
    const houseNo = houseNumberOf(norm);
    for (const [k, b] of idx.byStreet) {
      if (houseNumberOf(k) === houseNo && (k.startsWith(norm) || norm.startsWith(k))) {
        return { status: "covered", by: "address~", matched: b.street || b.name, name: b.name || null };
      }
    }
  }
  return { status: "not_listed", listSize: idx.count };
}

/* ------------------------------------------------------------------ *
 *  Pont content-script <-> service worker
 * ------------------------------------------------------------------ */
chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (!msg) return;

  if (msg.type === "CHECK_GUARANTORS" && msg.address) {
    checkGuarantors(msg.address, msg.slug)
      .then((verdict) => sendResponse({ ok: true, verdict: verdict }))
      .catch((err) => sendResponse({ ok: false, error: String(err) }));
    return true;
  }

  if (msg.type === "CHECK_INSURENT" && msg.address) {
    checkInsurent(msg.address)
      .then((verdict) => sendResponse({ ok: true, verdict: verdict }))
      .catch((err) => sendResponse({ ok: false, error: String(err) }));
    return true; // reponse asynchrone
  }

  // [DESACTIVE] messages de la file de visites (TOUR_START / TOUR_NEXT).
//   if (msg.type === "TOUR_START" && Array.isArray(msg.items)) {
//     // La file ouvre son PROPRE onglet : ta page de resultats reste intacte
//     // derriere, avec ses filtres et ta position de scroll.
//     startQueue(msg.items)
//       .then((r) => sendResponse(r))
//       .catch((err) => sendResponse({ ok: false, error: String(err) }));
//     return true;
//   }
//
//   if (msg.type === "TOUR_NEXT") {
//     nextInQueue()
//       .then((r) => sendResponse(r))
//       .catch((err) => sendResponse({ ok: false, error: String(err) }));
//     return true;
//   }

  // [DESACTIVE] plus de page d'options a ouvrir.
  // if (msg.type === "OPEN_OPTIONS") {
  //   chrome.runtime.openOptionsPage();
  //   sendResponse({ ok: true });
  //   return;
  // }

  // [DESACTIVE] reprise de la file depuis le popup.
//   if (msg.type === "TOUR_RESUME") {
//     getQueue()
//       .then((q) => (q ? openCurrent(q) : { ok: false, error: "file vide" }))
//       .then((r) => sendResponse(r))
//       .catch((err) => sendResponse({ ok: false, error: String(err) }));
//     return true;
//   }
});
