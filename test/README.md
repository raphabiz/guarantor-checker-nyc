# Tests du pre-remplissage

Tests jsdom du panneau StreetEasy "Request a tour", contre une copie du vrai DOM
(`panel.html`, releve en septembre 2025).

```
npm install jsdom      # une seule fois, dans ce dossier
node test/test-tour.js # panneau deja ouvert : identite, video chat, 3 creneaux, message
node test/test-open.js # panneau ferme (clic "Request a tour") + reglages desactives
node test/test-safemode.js    # mode test : clic / Entree / submit bloques, puis debloques
node test/test-availability.js # conversion des dispos FR -> heure de New York
node test/test-eligibility.js  # file : Insurent OU TheGuarantors suffit, lecture du loyer
node test/test-corrupt-settings.js # le bouton de la file ne disparait jamais en silence
node test/test-rerender.js     # survie au re-rendu React de StreetEasy
node test/test-mindate.js      # date plancher + 3 creneaux convertis FR -> NY
node test/test-autosend.js     # mode production : envoi automatique et arret sur echec

node test/test-badges.js       # badges sur une page de resultats + popover, traduits
node test/test-badges.js fr    # ... dans n'importe quelle langue de _locales/
node test/test-pages.js        # popup + reglages : aucun libelle non traduit
node test/test-pages.js zh_CN
```

`test-badges.js` et `test-pages.js` sont les seuls a couvrir ce qui tourne encore :
les autres testent la file de demandes de visite, desactivee depuis la v0.14.0, et
echouent tant qu'elle n'est pas reactivee.

Les deux tests verifient surtout **qu'aucun clic ne part sur « Send request »**,
« Cancel » ou « + Add search partner » — tous les boutons du panneau sont
`type="submit"`, donc une correspondance de texte approximative enverrait
la demande toute seule.

Si StreetEasy change son formulaire : remplace `panel.html` par le nouveau HTML
(DevTools -> clic droit sur le panneau -> Copy -> Copy outerHTML) et relance.
