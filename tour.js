/**
 * Guarantor Checker for NYC Rentals — assistant "Request a tour" [DESACTIVE]
 *
 * Calibre sur le VRAI panneau StreetEasy (side panel "Request a tour") :
 *
 *   input#name / input#email / input#phone      -> identite
 *   input[name=tourType] : #in_person | #video_chat -> type de visite
 *   select[aria-label=Date] + select[aria-label=Time] + bouton "+ Add"
 *                                               -> jusqu'a 3 creneaux
 *   bouton "+ Add a Message"                    -> revele le textarea du message
 *   bouton "Send request"                       -> ON N'Y TOUCHE JAMAIS
 *
 * Piege important de ce panneau : TOUS les boutons sont `type="submit"`
 * (y compris "+ Add" et "+ Add a Message"). On ne clique donc QUE sur des
 * boutons dont le texte correspond exactement a ce qu'on veut, jamais sur une
 * correspondance approximative — sinon on part sur "Send request".
 */

(function () {
  "use strict";

  // [DESACTIVE] Toute la partie "demander une visite" est mise en sommeil :
  // ce script ne fait plus rien. Pour la reactiver, retirer le return
  // ci-dessous et decommenter les blocs [DESACTIVE] de content.js et
  // background.js.
  return;

  var SEG = window.SEG;
  if (!SEG) return;

  var log = function () { console.log.apply(console, ["[SEG/tour]"].concat([].slice.call(arguments))); };

  var IS_LISTING = /^\/(rental|building|sale)\//.test(location.pathname);
  if (!IS_LISTING) return;

  var state = { settings: null, item: null, queue: null, message: "", report: [], safeMode: true, cancelAuto: false };

  /* ================= helpers DOM ================= */

  function sleep(ms) { return new Promise(function (r) { setTimeout(r, ms); }); }

  function visible(el) {
    if (!el) return false;
    var r = el.getBoundingClientRect();
    return r.width > 0 && r.height > 0 && getComputedStyle(el).visibility !== "hidden";
  }

  // React remplace le setter `value` : il faut passer par le setter natif du
  // prototype, puis dispatcher input+change pour que son state suive.
  function setNativeValue(el, value) {
    var proto = el instanceof HTMLTextAreaElement ? HTMLTextAreaElement.prototype
      : el instanceof HTMLSelectElement ? HTMLSelectElement.prototype
        : HTMLInputElement.prototype;
    var desc = Object.getOwnPropertyDescriptor(proto, "value");
    if (desc && desc.set) desc.set.call(el, value); else el.value = value;
    el.dispatchEvent(new Event("input", { bubbles: true }));
    el.dispatchEvent(new Event("change", { bubbles: true }));
  }

  function highlight(el) {
    el.style.outline = "3px solid #1a7f5a";
    try { el.scrollIntoView({ behavior: "smooth", block: "center" }); } catch (e) {}
  }

  function text(el) { return (el.textContent || "").replace(/\s+/g, " ").trim(); }

  // Recherche de bouton par texte EXACT (regex ancree) — jamais approximative.
  function findButton(scope, re) {
    var btns = (scope || document).querySelectorAll("button");
    for (var i = 0; i < btns.length; i++) {
      if (re.test(text(btns[i])) && visible(btns[i]) && !btns[i].disabled) return btns[i];
    }
    return null;
  }

  var RE_ADD_SLOT = /^\+\s*add$/i;
  var RE_ADD_MESSAGE = /^\+\s*add a message$/i;
  var RE_OPEN_PANEL = /^(request a tour|schedule a tour|contact agent|contact broker|ask a question)$/i;
  var RE_SEND = /^(send request|send message|send|submit)$/i;

  /* ================= mode test (envoi bloque) ================= */

  // Le but : pouvoir derouler tout le flux sur le vrai site sans qu'un clic
  // malheureux parte chez l'agent. On intercepte en phase de CAPTURE au niveau
  // du document : React ecoute plus bas (sur son conteneur racine), donc
  // stopImmediatePropagation ici l'empeche de voir l'evenement.
  function installSafeMode() {
    function inPanel(el) {
      var panel = findTourPanel();
      return panel && el && panel.contains(el);
    }
    document.addEventListener("click", function (e) {
      if (!state.safeMode) return;
      var btn = e.target && e.target.closest && e.target.closest("button");
      if (!btn || !RE_SEND.test(text(btn))) return;
      e.preventDefault();
      e.stopImmediatePropagation();
      flashBar("🔒 Envoi bloque — mode test actif. Desactive-le dans la barre pour envoyer pour de vrai.");
    }, true);
    document.addEventListener("submit", function (e) {
      if (!state.safeMode) return;
      if (!inPanel(e.target)) return;
      e.preventDefault();
      e.stopImmediatePropagation();
      flashBar("🔒 Soumission du formulaire bloquee — mode test actif.");
    }, true);
    // Entree dans un champ = submit implicite : on la neutralise aussi.
    document.addEventListener("keydown", function (e) {
      if (!state.safeMode || e.key !== "Enter") return;
      var el = e.target;
      if (!el || el.tagName === "TEXTAREA" || !inPanel(el)) return;
      e.preventDefault();
      e.stopImmediatePropagation();
      flashBar("🔒 Entree bloquee (elle validerait le formulaire) — mode test actif.");
    }, true);
  }

  // Marque visuellement le bouton d'envoi pour qu'on voie qu'il est neutralise.
  function markSendButton(scope) {
    var btn = findButton(scope, RE_SEND);
    if (!btn) return null;
    btn.classList.toggle("seg-send-blocked", !!state.safeMode);
    btn.title = state.safeMode
      ? "Neutralise par le mode test de l'extension. Desactive le mode test dans la barre pour pouvoir envoyer."
      : "";
    return btn;
  }

  /* ================= reperage du panneau ================= */

  // Le panneau "Request a tour" : on l'ancre sur les radios tourType, seuls
  // elements a la fois stables (id/name non hashes) et propres a ce panneau.
  function findTourPanel() {
    var radio = document.querySelector("input[name='tourType'], input#video_chat");
    if (!radio) return null;
    var node = radio;
    for (var i = 0; i < 12 && node.parentElement; i++) {
      node = node.parentElement;
      if (node.querySelector("input#email") && node.querySelector("input#name")) return node;
    }
    return null;
  }

  // Repli : ancien formulaire de contact classique (textarea + email).
  function findLegacyForm() {
    var areas = Array.prototype.filter.call(document.querySelectorAll("textarea"), visible);
    for (var i = 0; i < areas.length; i++) {
      var scope = areas[i].closest("form") || areas[i].parentElement;
      if (scope && scope.querySelector("input[type='email'], input[name*='mail' i]")) {
        return { textarea: areas[i], scope: scope };
      }
    }
    return null;
  }

  function waitForForm(timeoutMs) {
    return new Promise(function (resolve) {
      var t0 = Date.now(), triedOpen = false;
      (function poll() {
        var panel = findTourPanel();
        if (panel) return resolve({ kind: "tour", scope: panel });
        var legacy = findLegacyForm();
        if (legacy) return resolve({ kind: "legacy", scope: legacy.scope, textarea: legacy.textarea });
        if (!triedOpen && Date.now() - t0 > 400) {
          triedOpen = true;
          var opener = findButton(document, RE_OPEN_PANEL);
          if (opener) { log("ouverture du panneau via:", text(opener)); opener.click(); }
        }
        if (Date.now() - t0 > timeoutMs) return resolve(null);
        setTimeout(poll, 350);
      })();
    });
  }

  /* ================= creneaux ================= */

  function optionValues(select) {
    return Array.prototype.filter.call(select.options, function (o) {
      return o.value && !o.disabled && o.value !== "-2";
    }).map(function (o) { return o.value; });
  }

  // "8:30 AM" / "17:00" -> minutes depuis minuit.
  function toMinutes(s) {
    var m = String(s).trim().match(/^(\d{1,2})[:h](\d{2})\s*(am|pm)?$/i);
    if (!m) return null;
    var h = parseInt(m[1], 10), min = parseInt(m[2], 10), ap = (m[3] || "").toLowerCase();
    if (ap === "pm" && h !== 12) h += 12;
    if (ap === "am" && h === 12) h = 0;
    return h * 60 + min;
  }

  // On ne cherche pas une correspondance exacte : si tu demandes 17h et que le
  // creneau le plus proche est 17:30, on prend 17:30 plutot que rien.
  function nearestTime(values, wanted) {
    var w = toMinutes(wanted);
    if (w == null) return null;
    var best = null, bestDist = Infinity;
    values.forEach(function (v) {
      var t = toMinutes(v);
      if (t == null) return;
      var d = Math.abs(t - w);
      if (d < bestDist) { bestDist = d; best = v; }
    });
    return best;
  }

  // Les options du menu ("Wed, Sep 9") n'ont pas d'annee. On balaie les jours a
  // venir jusqu'a retrouver le meme libelle : sans ambiguite, et juste aussi au
  // passage du 31 decembre.
  function parseOfferedDate(value) {
    var day = new Date();
    day.setHours(0, 0, 0, 0);
    for (var i = 0; i < 400; i++) {
      var label = day.toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" });
      if (label === value) return day;
      day = new Date(day.getTime() + 86400000);
      day.setHours(0, 0, 0, 0);
    }
    return null;
  }

  function dayOf(dateValue) {
    var m = String(dateValue).match(/^([A-Za-z]{3})/);
    return m ? m[1].toLowerCase() : "";
  }

  // Croise les dates proposees par StreetEasy (en heure de New York) avec ta
  // grille de disponibilites (convertie en heure de New York par shared.js).
  // Resultat : la liste ordonnee des (date, heure NY) qu'on peut demander.
  function candidateSlots(dateValues, tour) {
    var slots = SEG.nySlots(tour);
    if (!slots.length) return [];
    var byDay = {};
    slots.forEach(function (s) { (byDay[s.nyDayKey] = byDay[s.nyDayKey] || []).push(s); });
    Object.keys(byDay).forEach(function (k) {
      byDay[k].sort(function (a, b) { return a.nyMinutes - b.nyMinutes; });
    });

    // "Wed, Sep 9" ne porte pas l'annee : on la retrouve en cherchant, a partir
    // d'aujourd'hui, le premier jour dont le libelle en-US correspond.
    var minTs = tour.minDate ? Date.parse(tour.minDate + "T00:00:00") : null;

    var out = [];
    dateValues.slice(tour.startOffset || 0).forEach(function (dv) {
      if (minTs) {
        var when = parseOfferedDate(dv);
        if (!when || when.getTime() < minTs) return;
      }
      var list = byDay[dayOf(dv)] || [];
      list.forEach(function (s) {
        out.push({ date: dv, minutes: s.nyMinutes, wanted: SEG.fmtTime12(s.nyMinutes), period: s.period });
      });
    });
    return out;
  }

  function isPlaceholder(sel) {
    return !sel || !sel.value || sel.value === "-2";
  }

  function dateSelectCount(scope) {
    return scope.querySelectorAll("select[aria-label='Date']").length;
  }

  function lastOf(list) { return list.length ? list[list.length - 1] : null; }

  // La ligne de saisie = celle qui porte le bouton "+ Add". Les creneaux deja
  // valides apparaissent comme des paires Date/Time supplementaires ; on vise
  // donc les DERNIERS menus de cette ligne, jamais les premiers.
  function emptySlotRow(scope) {
    var addBtn = findButton(scope, RE_ADD_SLOT);
    if (!addBtn) return null;
    var row = addBtn.parentElement || scope;
    var dateSel = lastOf(row.querySelectorAll("select[aria-label='Date']"));
    var timeSel = lastOf(row.querySelectorAll("select[aria-label='Time']"));
    if (!dateSel || !timeSel) {
      dateSel = lastOf(scope.querySelectorAll("select[aria-label='Date']"));
      timeSel = lastOf(scope.querySelectorAll("select[aria-label='Time']"));
    }
    if (!dateSel || !timeSel) return null;
    return { addBtn: addBtn, row: row, dateSel: dateSel, timeSel: timeSel };
  }

  // Attend qu'une condition devienne vraie (React re-rend de facon asynchrone :
  // un sleep fixe rate le 3e creneau une fois sur deux).
  async function waitUntil(fn, timeoutMs) {
    var t0 = Date.now();
    while (Date.now() - t0 < timeoutMs) {
      var v = fn();
      if (v) return v;
      await sleep(120);
    }
    return null;
  }

  async function fillSlots(scope, tour) {
    var wanted = Math.max(0, Math.min(3, tour.slots || 0));
    if (!wanted) return;

    var added = [], done = [], failure = null, adjusted = false, queue = null;

    for (var i = 0; i < wanted; i++) {
      var slot = await waitUntil(function () { return emptySlotRow(scope); }, 3000);
      if (!slot) { failure = i === 0 ? "ligne de saisie introuvable" : "plus de ligne libre"; break; }

      var offered = optionValues(slot.dateSel);
      if (queue === null) {
        queue = candidateSlots(offered, tour);
        if (!queue.length) { failure = "aucune date proposee ne correspond a tes dispos (elles sont dans le message)"; break; }
      }
      // On saute les combinaisons deja posees et celles dont la date a disparu
      // du menu (StreetEasy retire parfois une date deja choisie).
      var cand = null;
      while (queue.length) {
        var c = queue.shift();
        var key = c.date + "|" + c.wanted;
        if (done.indexOf(key) !== -1) continue;
        if (offered.indexOf(c.date) === -1) continue;
        cand = c; break;
      }
      if (!cand) { failure = "plus de creneau disponible dans tes dispos"; break; }

      var date = cand.date;
      var timeVal = nearestTime(optionValues(slot.timeSel), cand.wanted);
      if (!timeVal) { failure = "aucune heure disponible"; break; }
      // Si l'heure voulue n'existe pas (tot le matin NY par exemple), on prend
      // la plus proche — mais on le signale, ce n'est pas ce que tu as demande.
      if (timeVal !== cand.wanted) adjusted = true;

      setNativeValue(slot.dateSel, date);
      await sleep(150);
      // Le menu des heures peut etre re-rendu apres le choix de la date.
      var fresh = emptySlotRow(scope) || slot;
      setNativeValue(fresh.timeSel, timeVal);
      await sleep(150);

      var btn = (emptySlotRow(scope) || fresh).addBtn;
      if (!btn) { failure = "bouton « + Add » disparu"; break; }
      var before = dateSelectCount(scope);
      btn.click();

      // Un creneau valide se traduit soit par une nouvelle paire Date/Time,
      // soit par une ligne de saisie remise a zero, soit par la disparition du
      // bouton "+ Add" (limite de 3 atteinte). Sinon, le clic n'a rien fait.
      var registered = await waitUntil(function () {
        if (dateSelectCount(scope) > before) return true;
        var s = emptySlotRow(scope);
        return !s || isPlaceholder(s.dateSel);
      }, 2500);
      if (!registered) { failure = "« + Add » n'a pas valide le creneau " + (i + 1); break; }

      done.push(date + "|" + cand.wanted);
      added.push(date + " " + timeVal);
    }

    var label = added.length + "/" + wanted + " creneau" + (wanted > 1 ? "x" : "");
    if (added.length) label += " (" + added.join(" / ") + ")";
    if (adjusted) label += " — heure ajustee au plus proche propose";
    if (failure) label = "⚠️ " + label + " — " + failure;
    state.report.push(label);
  }

  /* ================= remplissage complet ================= */

  async function fillTourPanel(scope) {
    var p = state.settings.profile;
    var tour = state.settings.tour;
    state.report = [];

    // Identite : StreetEasy pre-remplit deja nom/email quand tu es connecte.
    // On ne remplace donc QUE les champs vides (ton compte reste la reference).
    var filled = [];
    [["name", p.name], ["email", p.email]].forEach(function (pair) {
      var el = scope.querySelector("input#" + pair[0]);
      if (!el || !visible(el) || !pair[1]) return;
      if (el.value && el.value.trim()) return;
      setNativeValue(el, pair[1]);
      filled.push(pair[0]);
    });

    // Telephone : le champ StreetEasy est colle a un indicatif verrouille (+1).
    // Y mettre un numero etranger donne "+1 33649757306" a l'agent, injoignable.
    // On ne remplit donc que si le numero est bien americain — sinon on n'y
    // touche pas : le vrai numero, avec son indicatif, est deja dans le message.
    var phoneEl = scope.querySelector("input#phone");
    if (phoneEl && visible(phoneEl) && p.phone && !(phoneEl.value || "").trim()) {
      var digits = String(p.phone).replace(/\D/g, "");
      var isUS = digits.length === 10 || (digits.length === 11 && digits.charAt(0) === "1");
      var cc = scope.querySelector("#country_code_selector");
      var ccUSOnly = cc ? Array.prototype.every.call(cc.options, function (o) { return o.value === "US"; }) : true;
      if (isUS) {
        setNativeValue(phoneEl, p.phone);
        filled.push("phone");
      } else if (ccUSOnly) {
        state.report.push("⚠️ telephone non-US laisse vide (indicatif verrouille sur +1) — il est dans le message");
      }
    }

    state.report.push(filled.length ? "champs remplis : " + filled.join(", ") : "identite deja pre-remplie");

    // Type de visite : on clique le LABEL (le radio est stylise/masque).
    if (tour.type === "video" || tour.type === "in_person") {
      var id = tour.type === "video" ? "video_chat" : "in_person";
      var radio = scope.querySelector("input#" + id);
      var label = scope.querySelector("label[for='" + id + "']");
      if (radio && !radio.checked) {
        if (label) label.click(); else radio.click();
        await sleep(150);
      }
      var ok = radio && radio.checked;
      state.report.push(ok ? (tour.type === "video" ? "Video chat ✓" : "In-person ✓") : "type de visite non change");
    }

    await fillSlots(scope, tour);

    markSendButton(scope);

    // Message : cache derriere "+ Add a Message".
    if (tour.addMessage !== false) {
      var area = scope.querySelector("textarea");
      if (!area || !visible(area)) {
        var addMsg = findButton(scope, RE_ADD_MESSAGE);
        if (addMsg) { addMsg.click(); await sleep(400); }
        area = scope.querySelector("textarea");
      }
      if (area && visible(area)) {
        setNativeValue(area, state.message);
        highlight(area);
        state.report.push("message colle ✓");
      } else {
        state.report.push("zone message introuvable — utilise « Copier »");
      }
    }
    log("rapport:", state.report);
  }

  async function fillLegacy(form) {
    var p = state.settings.profile;
    state.report = [];
    var inputs = Array.prototype.filter.call(form.scope.querySelectorAll("input"), visible);
    var used = [];
    function fill(words, value, typeHint) {
      if (!value) return null;
      var i, el, hay;
      for (i = 0; i < inputs.length; i++) {
        el = inputs[i];
        if (used.indexOf(el) !== -1 || el.disabled || el.readOnly) continue;
        if (el.value && el.value.trim()) continue;
        hay = [el.name, el.id, el.placeholder, el.getAttribute("aria-label"), el.autocomplete].join(" ").toLowerCase();
        if (words.some(function (w) { return hay.indexOf(w) !== -1; })) { setNativeValue(el, value); used.push(el); return el; }
      }
      if (typeHint) {
        for (i = 0; i < inputs.length; i++) {
          el = inputs[i];
          if (used.indexOf(el) === -1 && el.type === typeHint && !(el.value || "").trim()) {
            setNativeValue(el, value); used.push(el); return el;
          }
        }
      }
      return null;
    }
    fill(["name"], p.name);
    fill(["email", "mail"], p.email, "email");
    fill(["phone", "tel", "mobile"], p.phone, "tel");
    setNativeValue(form.textarea, state.message);
    highlight(form.textarea);
    state.report.push("formulaire classique rempli (" + used.length + " champs + message)");
  }

  async function fillAll() {
    var found = await waitForForm(9000);
    if (!found) { state.report = ["formulaire introuvable"]; renderBar("form_missing"); return false; }
    if (found.kind === "tour") await fillTourPanel(found.scope);
    else await fillLegacy(found);
    renderBar("ok");
    autoSend();
    return true;
  }

  /* ================= barre de controle ================= */

  var bar = null;
  function renderBar(mode) {
    if (!bar) {
      bar = document.createElement("div");
      bar.id = "seg-tourbar";
      document.body.appendChild(bar);
    }
    var pos = state.queue
      ? " &middot; annonce " + (state.queue.index + 1) + "/" + state.queue.items.length : "";
    var head = mode === "form_missing"
      ? "<b>⚠️ Panneau de visite introuvable</b> — ouvre « Request a tour » puis clique « Re-remplir »."
      : "<b>📨 Pret</b> — relis, ajuste, puis clique <u>Send request</u> toi-meme.";

    bar.innerHTML =
      (state.safeMode
        ? "<div class='seg-safebanner'>🔒 <b>MODE TEST</b> — le bouton « Send request » est neutralise, rien ne peut partir." +
          "<button id='seg-safe-off' class='seg-tbtn seg-tbtn-warn'>Desactiver et pouvoir envoyer</button></div>"
        : "<div class='seg-safebanner seg-live'>📤 <b>MODE REEL</b> — « Send request » enverra vraiment le message." +
          "<button id='seg-safe-on' class='seg-tbtn'>Repasser en mode test</button></div>") +
      "<div class='seg-tourbar-head'>" + head + pos + "</div>" +
      (state.report.length ? "<div class='seg-tourbar-report'>" + state.report.join(" &middot; ") + "</div>" : "") +
      "<div id='seg-auto' class='seg-autoline' hidden></div>" +
      "<textarea id='seg-tourmsg' spellcheck='false'></textarea>" +
      "<div class='seg-tourbar-btns'>" +
      "<button id='seg-copy' class='seg-tbtn'>Copier</button>" +
      "<button id='seg-refill' class='seg-tbtn'>Re-remplir</button>" +
      "<button id='seg-sent' class='seg-tbtn seg-tbtn-ok'>Envoye &rarr; suivant</button>" +
      "<button id='seg-skip' class='seg-tbtn'>Passer</button>" +
      "<button id='seg-stop' class='seg-tbtn seg-tbtn-stop'>Arreter la file</button>" +
      "</div>";

    var ta = bar.querySelector("#seg-tourmsg");
    ta.value = state.message;
    ta.addEventListener("input", function () {
      state.message = ta.value;
      var panel = findTourPanel();
      var area = (panel || document).querySelector("textarea:not(#seg-tourmsg)");
      if (area) setNativeValue(area, ta.value); // garde le formulaire synchro
    });

    bar.querySelector("#seg-copy").onclick = function () {
      var self = this;
      navigator.clipboard.writeText(state.message)
        .then(function () { self.textContent = "Copie ✓"; })
        .catch(function () { self.textContent = "copie manuelle"; });
    };
    var safeToggle = bar.querySelector("#seg-safe-off") || bar.querySelector("#seg-safe-on");
    if (safeToggle) safeToggle.onclick = function () { setSafeMode(!state.safeMode); };

    bar.querySelector("#seg-refill").onclick = function () { fillAll(); };
    bar.querySelector("#seg-sent").onclick = function () { finish(true); };
    bar.querySelector("#seg-skip").onclick = function () { finish(false); };
    bar.querySelector("#seg-stop").onclick = function () {
      SEG.set({ seg_queue: null }).then(function () { if (bar) { bar.remove(); bar = null; } });
    };

    if (!state.queue) {
      bar.querySelector("#seg-skip").style.display = "none";
      bar.querySelector("#seg-stop").style.display = "none";
      bar.querySelector("#seg-sent").textContent = "Marquer comme envoye";
    }
  }

  // Message temporaire dans la barre (ex : "envoi bloque").
  function flashBar(msg) {
    if (!bar) return;
    var head = bar.querySelector(".seg-tourbar-head");
    if (!head) return;
    if (!flashBar._saved) flashBar._saved = head.innerHTML;
    head.innerHTML = "<b>" + msg + "</b>";
    clearTimeout(flashBar._timer);
    flashBar._timer = setTimeout(function () {
      if (flashBar._saved != null) head.innerHTML = flashBar._saved;
      flashBar._saved = null;
    }, 4000);
  }

  function setSafeMode(on) {
    state.safeMode = !!on;
    var tour = Object.assign({}, state.settings.tour, { safeMode: state.safeMode });
    state.settings.tour = tour;
    SEG.set({ seg_tour: tour });
    var panel = findTourPanel();
    if (panel) markSendButton(panel);
    renderBar("ok");
  }

  /* ================= envoi automatique ================= */

  /**
   * Mode production : l'extension clique "Send request" elle-meme et enchaine.
   *
   * Trois garde-fous, parce qu'un envoi part chez un vrai agent et ne se rattrape
   * pas :
   *  - le mode test reste prioritaire et suspend tout envoi ;
   *  - un compte a rebours annulable precede chaque envoi ;
   *  - on VERIFIE que le panneau s'est bien ferme apres le clic. Si l'envoi n'a
   *    pas abouti (captcha, champ requis, erreur reseau), la file s'arrete au
   *    lieu de continuer a l'aveugle en croyant avoir envoye.
   */
  function autoLine() {
    var el = bar && bar.querySelector("#seg-auto");
    if (el) el.hidden = false;
    return el;
  }

  function countdown(seconds, label) {
    return new Promise(function (resolve) {
      var left = seconds;
      state.cancelAuto = false;
      (function tick() {
        var el = autoLine();
        if (!el) return resolve(false);
        if (state.cancelAuto) { el.textContent = "Envoi automatique annule. A toi de jouer."; return resolve(false); }
        if (left <= 0) return resolve(true);
        el.innerHTML = "⏳ " + label + " dans " + left + " s " +
          "<button id='seg-auto-cancel' class='seg-tbtn seg-tbtn-warn'>Annuler</button>";
        var btn = el.querySelector("#seg-auto-cancel");
        if (btn) btn.onclick = function () { state.cancelAuto = true; };
        left--;
        setTimeout(tick, 1000);
      })();
    });
  }

  async function autoSend() {
    var tour = state.settings.tour;
    if (tour.sendMode !== "auto") return;
    if (state.safeMode) {
      var el = autoLine();
      if (el) el.textContent = "Mode test actif : l'envoi automatique est suspendu.";
      return;
    }
    // Un remplissage rate ne doit surtout pas partir tel quel.
    var failed = state.report.filter(function (r) { return r.indexOf("⚠️") === 0 || /introuvable/.test(r); });
    if (failed.length) {
      var el2 = autoLine();
      if (el2) el2.textContent = "Envoi automatique suspendu : " + failed.join(" / ") + ". Verifie et envoie a la main.";
      return;
    }

    if (!(await countdown(tour.autoCountdown || 6, "Envoi automatique"))) return;

    var panel = findTourPanel();
    var btn = findButton(panel || document, RE_SEND);
    if (!btn) { stopAuto("bouton « Send request » introuvable"); return; }

    var line = autoLine();
    if (line) line.textContent = "Envoi en cours…";
    btn.click();

    // Le panneau qui se ferme est le seul signe fiable que StreetEasy a accepte.
    var sent = await waitUntil(function () { return !findTourPanel(); }, 10000);
    if (!sent) { stopAuto("le panneau est toujours ouvert apres le clic (champ requis, captcha ?)"); return; }

    await SEG.markSent(location.href, (state.item && state.item.address) || "");
    if (line) line.textContent = "✅ Envoye.";

    if (!state.queue) return;
    // Petite pause entre deux annonces : enchainer 30 envois a la seconde est le
    // meilleur moyen de se faire reperer.
    var base = typeof tour.autoDelay === "number" ? tour.autoDelay : 25;
    var wait = Math.round(base * (0.6 + Math.random() * 0.8));
    if (await countdown(wait, "Annonce suivante")) {
      chrome.runtime.sendMessage({ type: "TOUR_NEXT" }, function () {});
    }
  }

  function stopAuto(reason) {
    log("envoi automatique interrompu:", reason);
    var el = autoLine();
    if (el) el.innerHTML = "<b>⛔ File arretee</b> : " + reason + ". Rien n'a ete envoye pour cette annonce.";
    SEG.set({ seg_queue: null });
    state.queue = null;
  }

  async function finish(wasSent) {
    if (wasSent) await SEG.markSent(location.href, (state.item && state.item.address) || "");
    if (!state.queue) { if (bar) { bar.remove(); bar = null; } return; }
    chrome.runtime.sendMessage({ type: "TOUR_NEXT" }, function () {});
  }

  /* ================= demarrage ================= */

  // `textContent` colle les elements voisins : "$3,500" + "1 bed" -> "$3,5001 bed",
  // ce qui donne un loyer de 35001. On joint les noeuds texte par un espace.
  function readableText(el) {
    var out = [];
    var walker = document.createTreeWalker(el, NodeFilter.SHOW_TEXT, null);
    var n;
    while ((n = walker.nextNode())) {
      var t = (n.nodeValue || "").trim();
      if (t) out.push(t);
    }
    return out.join(" ");
  }

  function guessItem() {
    var txt = readableText(document.body);
    // Nombre proprement groupe, non suivi d'un chiffre (sinon on avale le "1" de "1 bed").
    var m = txt.match(/\$\s?(\d{1,3}(?:,\d{3})+|\d{3,6})(?!\d)/);
    var price = m ? parseInt(m[1].replace(/,/g, ""), 10) : 0;
    if (price >= 200000) price = 0;
    var h1 = document.querySelector("h1");
    return {
      url: location.href,
      address: (h1 && h1.textContent.trim().split("\n")[0].trim()) || document.title.split("|")[0].trim(),
      price: price,
    };
  }

  async function start(item) {
    state.item = item || guessItem();
    if (!SEG.profileIsUsable(state.settings.profile)) {
      state.message = "";
      state.report = [];
      renderBar("ok");
      bar.querySelector(".seg-tourbar-head").innerHTML =
        "<b>⚠️ Profil incomplet</b> — renseigne au moins ton nom et ton email dans les reglages (icone de l'extension → Reglages).";
      return;
    }
    state.message = SEG.renderTemplate(state.settings.template, state.settings.profile, state.item, state.settings.tour);
    renderBar("ok");
    await fillAll();
  }

  async function boot() {
    state.settings = await SEG.loadSettings();
    state.safeMode = state.settings.tour.safeMode !== false;
    installSafeMode();
    var res = await SEG.get([SEG.KEYS.queue]);
    var queue = res[SEG.KEYS.queue];

    var inQueue = queue && queue.items && queue.items[queue.index] &&
      SEG.listingKey(queue.items[queue.index].url) === SEG.listingKey(location.href);

    if (inQueue) {
      state.queue = queue;
      start(queue.items[queue.index]);
      return;
    }

    var btn = document.createElement("button");
    btn.id = "seg-tour-solo";
    btn.type = "button";
    btn.textContent = "📨 Demander une visite";
    btn.onclick = function () { btn.remove(); start(guessItem()); };
    document.body.appendChild(btn);
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", boot);
  else boot();
})();
