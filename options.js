/**
 * Page de reglages : profil, criteres de file, template de message.
 *
 * [DESACTIVE] Cette page n'est plus declaree dans le manifest (`options_page`)
 * depuis la v0.16.0 : elle ne configure QUE la file de demandes de visite, qui
 * est elle-meme en sommeil. Elle collecterait un nom, un email, un telephone et
 * un revenu sans qu'aucun code ne s'en serve — c'est exactement ce qu'un
 * examinateur du Chrome Web Store refuse.
 *
 * Le fichier est conserve, traduit et teste : il suffit de remettre
 * `"options_page": "options.html"` dans le manifest et de decommenter le bouton
 * du popup pour le retrouver intact.
 */
"use strict";

var SEG = window.SEG;
var $ = function (id) { return document.getElementById(id); };
var t = SEG.t;

// Les libelles du HTML sont des cles i18n : on les remplace avant tout le reste,
// sinon la page s'affiche une fraction de seconde avec des cases vides.
SEG.applyI18n();

var PROFILE_FIELDS = ["name", "email", "phone", "country", "occupation", "income", "guarantor", "movein", "extra"];
var STATUS_FIELDS = { covered: "st_covered", maybe: "st_maybe", not_listed: "st_not_listed", error: "st_error" };

var DEMO_LISTING = { address: "245 East 45th Street #12B", price: 3400, beds: 1, url: "https://streeteasy.com/rental/1234567" };

function collectProfile() {
  var p = {};
  PROFILE_FIELDS.forEach(function (k) { p[k] = $(k).value.trim(); });
  return p;
}

function refreshPreview() {
  $("preview").textContent = SEG.renderTemplate($("template").value, collectProfile(), DEMO_LISTING, collectTour());
}

async function load() {
  var s = await SEG.loadSettings();
  PROFILE_FIELDS.forEach(function (k) { $(k).value = s.profile[k] || ""; });
  $("template").value = s.template;
  $("maxRent").value = s.criteria.maxRent || 0;
  $("minBeds").value = s.criteria.minBeds || 0;
  Object.keys(STATUS_FIELDS).forEach(function (st) {
    $(STATUS_FIELDS[st]).checked = s.criteria.statuses.indexOf(st) !== -1;
  });
  $("acceptTg").checked = s.criteria.acceptTg !== false;
  $("skipContacted").checked = s.criteria.skipContacted !== false;

  $("tourType").value = s.tour.type;
  $("slots").value = String(s.tour.slots);
  $("minDate").value = s.tour.minDate || "";
  $("tzMode").value = s.tour.tzMode || "local";
  SEG.PERIODS.forEach(function (p) { $("t_" + p).value = s.tour.periodTimes[p] || ""; });
  buildGrid(s.tour.availability);
  $("addMessage").checked = s.tour.addMessage !== false;
  $("sendMode").value = s.tour.sendMode || "manual";
  $("autoDelay").value = s.tour.autoDelay;
  $("safeMode").checked = s.tour.safeMode !== false;

  refreshPreview();
}

async function save() {
  var statuses = Object.keys(STATUS_FIELDS).filter(function (st) { return $(STATUS_FIELDS[st]).checked; });
  await SEG.set({
    seg_profile: collectProfile(),
    seg_template: $("template").value,
    seg_criteria: {
      maxRent: parseInt($("maxRent").value, 10) || 0,
      minBeds: parseInt($("minBeds").value, 10) || 0,
      statuses: statuses,
      acceptTg: $("acceptTg").checked,
      skipContacted: $("skipContacted").checked,
    },
    seg_tour: collectTour(),
  });
  var missing = [];
  if (!$("name").value.trim()) missing.push(t("wName"));
  if (!$("email").value.trim()) missing.push(t("wEmail"));
  $("status").textContent = missing.length
    ? t("msgSavedMissing", [missing.join(", ")])
    : t("msgSaved") + " ✓";
  $("status").style.color = missing.length ? "var(--warn)" : "var(--ok)";
  setTimeout(function () { $("status").textContent = ""; }, 4000);
}


/* ============ grille de disponibilites ============ */

// Une case = un jour x une periode. On affiche a cote l'heure de New York
// correspondante : c'est elle qui sera reellement demandee a l'agent.
function buildGrid(availability) {
  const tbody = document.querySelector("#availGrid tbody");
  tbody.innerHTML = "";
  SEG.DAY_KEYS.forEach(function (day) {
    const tr = document.createElement("tr");
    const th = document.createElement("td");
    th.textContent = SEG.dayLabel(day);
    tr.appendChild(th);
    SEG.PERIODS.forEach(function (period) {
      const td = document.createElement("td");
      const cb = document.createElement("input");
      cb.type = "checkbox";
      cb.dataset.day = day;
      cb.dataset.period = period;
      cb.checked = (availability[day] || []).indexOf(period) !== -1;
      td.appendChild(cb);
      tr.appendChild(td);
    });
    tbody.appendChild(tr);
  });
  refreshGridHints();
}

function collectAvailability() {
  const out = {};
  SEG.DAY_KEYS.forEach(function (d) { out[d] = []; });
  document.querySelectorAll("#availGrid input[type=checkbox]").forEach(function (cb) {
    if (cb.checked) out[cb.dataset.day].push(cb.dataset.period);
  });
  return out;
}

function collectTour() {
  const periodTimes = {};
  SEG.PERIODS.forEach(function (p) { periodTimes[p] = $("t_" + p).value; });
  return {
    type: $("tourType").value,
    slots: parseInt($("slots").value, 10) || 0,
    minDate: $("minDate").value,
    availability: collectAvailability(),
    periodTimes: periodTimes,
    tzMode: $("tzMode").value,
    addMessage: $("addMessage").checked,
    sendMode: $("sendMode").value,
    autoDelay: Math.max(5, Math.min(600, parseInt($("autoDelay").value, 10) || 25)),
    safeMode: $("safeMode").checked,
  };
}

function escapeHtml(str) {
  return String(str == null ? "" : str).replace(/[&<>"]/g, function (ch) {
    return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[ch];
  });
}

// Rappel visuel du decalage : ce que tu coches chez toi devient telle heure a NY.
function refreshGridHints() {
  const tour = collectTour();
  const offset = SEG.effectiveOffset(tour);
  const slots = SEG.nySlots(tour);
  const byCell = {};
  slots.forEach(function (s) { byCell[s.dayKey + "|" + s.period] = s; });

  document.querySelectorAll("#availGrid input[type=checkbox]").forEach(function (cb) {
    const td = cb.parentElement;
    const old = td.querySelector(".ny");
    if (old) old.remove();
    td.classList.toggle("on", cb.checked);
    const s = byCell[cb.dataset.day + "|" + cb.dataset.period];
    if (cb.checked && s) {
      const span = document.createElement("span");
      span.className = "ny";
      span.textContent = SEG.fmtTime12(s.nyMinutes) + " NY" + (s.shifted ? " (" + t("nyPrevDay") + ")" : "");
      td.appendChild(span);
    }
  });

  const phrase = SEG.availabilityPhrase(tour);
  // Les valeurs inserees ici viennent de tes propres reglages, jamais du web.
  $("tzHint").innerHTML = tour.tzMode === "ny"
    ? escapeHtml(t("tzHintNy"))
    : escapeHtml(t("tzHintOffset", [(offset >= 0 ? "+" : "") + offset]))
      + (phrase ? "<br>" + escapeHtml(t("tzHintPhrase")) + " <em>" + escapeHtml(phrase) + "</em>" : "");
}

document.addEventListener("change", function (e) {
  if (e.target.closest("#availGrid") || /^t_/.test(e.target.id) || e.target.id === "tzMode") refreshGridHints();
});

document.addEventListener("input", refreshPreview);
$("save").addEventListener("click", save);
$("reset").addEventListener("click", function () {
  $("template").value = SEG.DEFAULT_TEMPLATE;
  refreshPreview();
});
$("resetTour").addEventListener("click", async function () {
  await SEG.set({ seg_tour: SEG.DEFAULT_TOUR });
  await load();
  $("status").textContent = t("msgTourReset") + " ✓";
  setTimeout(function () { $("status").textContent = ""; }, 3000);
});

$("clearSent").addEventListener("click", async function () {
  await SEG.set({ seg_sent: {} });
  $("status").textContent = t("msgHistoryCleared") + " ✓";
  setTimeout(function () { $("status").textContent = ""; }, 3000);
});

load();
