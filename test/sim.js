/**
 * Simulation du comportement React du panneau "Request a tour".
 *
 * Reproduit ce qu'on observe sur le vrai site :
 *  - "+ Add" cree une NOUVELLE paire Date/Time au-dessus de la ligne de saisie,
 *    en conservant les valeurs choisies, et remet la ligne de saisie a zero ;
 *  - au 3e creneau, le bouton "+ Add" et la ligne de saisie disparaissent ;
 *  - "+ Add a Message" revele un textarea.
 *
 * Le fixture HTML n'a pas de React : sans ca, un <select> dont la premiere
 * option est disabled selectionne d'office la deuxieme, et les tests mesurent
 * autre chose que le vrai comportement.
 */
function installReactSim(w, opts) {
  const d = w.document;
  const scope = (opts && opts.scope) || d;
  const state = { addedSlots: [], sends: 0 };

  const btns = () => [...scope.querySelectorAll("button")];
  const addBtn = btns().find((b) => b.textContent.trim() === "+ Add");
  const inputRow = addBtn.parentElement;
  const dateSel = inputRow.querySelector("select[aria-label='Date']");
  const timeSel = inputRow.querySelector("select[aria-label='Time']");

  // React force le placeholder tant que rien n'est choisi.
  dateSel.value = "-2";
  timeSel.value = "";

  addBtn.addEventListener("click", () => {
    if (dateSel.value === "-2" || !dateSel.value || !timeSel.value) return;
    state.addedSlots.push(dateSel.value + " " + timeSel.value);

    const row = d.createElement("div");
    row.className = "seg-sim-added-slot";
    const dClone = dateSel.cloneNode(true);
    const tClone = timeSel.cloneNode(true);
    row.appendChild(dClone);
    row.appendChild(tClone);
    inputRow.parentElement.insertBefore(row, inputRow);
    dClone.value = dateSel.value;
    tClone.value = timeSel.value;

    dateSel.value = "-2";
    timeSel.value = "";
    if (state.addedSlots.length >= 3) inputRow.remove(); // limite StreetEasy
  });

  const addMsg = btns().find((b) => b.textContent.trim() === "+ Add a Message");
  if (addMsg) {
    addMsg.addEventListener("click", () => {
      const ta = d.createElement("textarea");
      ta.id = "message";
      addMsg.parentElement.appendChild(ta);
      addMsg.remove();
    });
  }

  return state;
}

module.exports = { installReactSim };
