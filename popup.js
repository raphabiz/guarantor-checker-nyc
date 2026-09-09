/** Popup : legende des badges. */
"use strict";

var SEG = window.SEG;

// Les libelles du HTML sont des cles i18n (voir shared.js).
SEG.applyI18n();

// [DESACTIVE] Acces aux reglages (page d'options retiree du manifest avec la
// file de demandes de visite). A remettre avec `var $ = function (id) {
// return document.getElementById(id); };`.
// $("options").addEventListener("click", function () { chrome.runtime.openOptionsPage(); });

// [DESACTIVE] Etat de la file de demandes de visite. A decommenter avec les
// blocs [DESACTIVE] de content.js / background.js et le bloc correspondant
// dans popup.html.
// async function render() {
//   var s = await SEG.loadSettings();
//   var res = await SEG.get([SEG.KEYS.queue, SEG.KEYS.sent]);
//   var q = res[SEG.KEYS.queue];
//   var sent = res[SEG.KEYS.sent] || {};
//
//   $("sent").textContent = Object.keys(sent).length;
//   if (q && q.items && q.items.length) {
//     $("queue").textContent = (q.index + 1) + " / " + q.items.length;
//     $("resume").hidden = false;
//     $("clearQueue").hidden = false;
//   } else {
//     $("queue").textContent = "vide";
//   }
//   $("warn").hidden = SEG.profileIsUsable(s.profile);
// }
//
// $("resume").addEventListener("click", function () {
//   chrome.runtime.sendMessage({ type: "TOUR_RESUME" }, function () { window.close(); });
// });
// $("clearQueue").addEventListener("click", async function () {
//   await SEG.set({ seg_queue: null });
//   render();
// });
//
// render();
