# Guarantor Checker for NYC Rentals — notes de développement (v0.16.0)

Petite extension Chrome pour accélérer une recherche d'appart à New York quand on est
étranger. *Non affiliée à StreetEasy, Zillow, Insurent ou TheGuarantors* — l'extension
s'appuie uniquement sur des données que ces sites publient publiquement.

> Anciennement « StreetEasy Guarantor Checker ». Le nom a été changé parce qu'un nom
> d'extension ne peut pas reprendre la marque du site sur lequel elle s'affiche.

Deux briques :

1. **Badge garant** sur chaque annonce (le bâtiment accepte-t-il Insurent ou
   TheGuarantors ?) — **active**.
2. **File de demandes de visite** — **désactivée pour l'instant** (code conservé en
   commentaire, voir plus bas).

---

## Langues

Toute l'interface passe par le systeme de traduction de Chrome
(`chrome.i18n` + le dossier [`_locales/`](_locales/)). La langue suit celle du
navigateur, et l'**anglais** sert de repli automatique pour tout ce qui n'est pas
traduit.

| Langue | Dossier |
| --- | --- |
| Anglais (par defaut) | `_locales/en` |
| Francais | `_locales/fr` |
| Espagnol | `_locales/es` |
| Chinois simplifie | `_locales/zh_CN` |
| Portugais (Bresil) | `_locales/pt_BR` |

**Ajouter une langue** : copier `_locales/en/messages.json` dans
`_locales/<code>/messages.json` (codes Chrome : `de`, `ko`, `ja`, `hi`, `ru`...),
traduire les valeurs `message` sans toucher aux cles ni aux `$PLACEHOLDERS$`, puis
verifier avec `node test/test-pages.js <code>`.

Cote code, rien n'est ecrit en dur :

- dans les pages (`popup.html`, `options.html`), chaque libelle porte un attribut
  `data-i18n="cle"` que `SEG.applyI18n()` remplit au chargement ;
- dans le content script, les libelles passent par le helper `t("cle")`.

Le message envoye aux agents reste **en anglais** : c'est un courtier new-yorkais
qui le lit, pas toi.

---

## 1. Badge Insurent (v0.2+)

Sur les pages StreetEasy, deux **pastilles** apparaissent sur chaque annonce détectée : une
pour Insurent, une pour TheGuarantors. Chacune affiche une puce de couleur et son état en un
mot, avec **vérification en direct** :

- 🟢 **accepté** — le bâtiment est dans la liste de ce garant.
- 🟠 **à confirmer** — même numéro de rue, nom de rue différent (Insurent uniquement).
- 🔴 **absent** — l'adresse n'est pas dans leur liste.
- ⚪ **non vérifié** — la vérification n'a pas abouti ; clic = recherche manuelle.

Le fond des pastilles reste clair et la couleur est réservée à la puce et au mot d'état :
sur une page de résultats, vingt aplats verts et rouges seraient illisibles.

Un **clic sur une pastille** ouvre le détail : pourquoi ce verdict, l'adresse comparée, la
source, plus deux boutons pour copier l'adresse et ouvrir la recherche officielle.

### Comment marche la vérification Insurent (transparence)

- L'extension interroge **le même endpoint public** que le champ de recherche du site
  Insurent (`admin-ajax.php`, action `search_certified_addresses`) — celui qui alimente
  l'autocomplétion quand un visiteur tape une adresse sur
  [insurent.com/search-buildings](https://www.insurent.com/search-buildings/).
- Ce sont des **données publiques** qu'Insurent publie volontairement (leurs bâtiments
  « certifiés / participants ») pour attirer les locataires. Aucune authentification,
  aucune donnée privée.
- Un **service worker** (arrière-plan de l'extension) fait l'appel, car une page web
  normale ne peut pas requêter un autre domaine (CORS). Il lit le « nonce » public affiché
  dans la page de recherche, exactement comme le fait ton navigateur, et le met en cache.
- **Une requête par annonce que tu regardes réellement** (déclenchée quand l'annonce entre
  à l'écran), avec cache local 24 h par adresse. Pas de scraping en masse.

### Et TheGuarantors ?

Un second badge **« G TheGuarantors »** indique si le bâtiment figure dans leur liste
publique de bâtiments couverts (NY + NJ). L'extension interroge le **même endpoint** que
l'extension Chrome officielle de TheGuarantors, avec la clé d'API livrée en clair dans
celle-ci (voir `background.js`). Le badge reste cliquable pour ouvrir leur recherche avec
l'adresse déjà copiée, et bascule en « ⌕ » si l'endpoint refuse la requête.

**Décision (v0.16.0) : on garde ce bloc**, en connaissance de cause. Republier la clé
d'API d'un tiers dans une extension publique reste le point faible du dossier de
publication : TheGuarantors peut la changer ou demander le retrait à tout moment.

Le code est écrit pour que ça ne casse rien le jour où ça arrive :

- un échec (403, coupure réseau) est **mémorisé 10 minutes** — sans ça, une page de
  40 annonces déclencherait 40 requêtes vouées à échouer, ce qui est inutile pour toi et
  constitue le pire signal possible à envoyer à leur API ;
- pendant ce temps le badge affiche simplement « non vérifié » et reste cliquable pour
  ouvrir leur recherche à la main. Le badge Insurent, lui, continue normalement.

Leur extension officielle reste de toute façon la source la plus fiable : autant
l'installer en parallèle.

#### Retirer le bloc, le jour où il faudra

Si TheGuarantors demande le retrait, révoque la clé, ou si l'examen du Store bute dessus,
voici tout ce qu'il y a à toucher. C'est une soirée, pas une refonte, et le badge Insurent
continue de fonctionner pendant ce temps.

| Fichier | Quoi |
| --- | --- |
| `background.js` | `TG_API_URL`, `TG_API_KEY`, `TG_TTL_MS`, `TG_FAIL_TTL_MS`, `tgMem`, `tgFail`, `tgSlugFromStreeteasy()`, `loadGuarantorsList()`, `checkGuarantors()`, et le cas `CHECK_GUARANTORS` du routeur de messages |
| `content.js` | la création du second badge (`makeBadge("brandTg", ...)`), `applyTgVerdict()` et `showTgDetails()` |
| `manifest.json` | les deux entrées `theguarantors.com` de `host_permissions`, **et `"permissions": ["storage"]`** |
| `_locales/*/messages.json` | `extDesc`, qui nomme les deux garants ; les clés `brandTg` et `tg*` deviennent inutilisées |
| `brand/src/` puis `node brand/build.mjs` | planches 1, 2, 5 et bandeau : toutes annoncent deux garants et trois domaines |
| `store/` | `listing-en.txt` et `dashboard-answers.md`, même raison |
| `PRIVACY.md` | la ligne `theguarantors.com` du tableau des permissions, et la section « ce qui est envoyé » |

Le point le moins évident est le `storage` du manifest. Dans le code **livré**,
`chrome.storage.local` ne sert qu'au cache de cette liste : les verdicts Insurent et le nonce
vivent en mémoire du service worker. Plus de TheGuarantors, plus rien à stocker, donc plus
besoin de la permission. La déclaration d'usage des données du Store se réduit d'autant.

---

## 2. File de demandes de visite virtuelle — ⛔ DÉSACTIVÉE

> Cette partie est **entièrement mise en commentaire** depuis la v0.14.0. L'extension ne
> pose plus que les badges garant : aucun bouton flottant, aucun pré-remplissage, aucune
> navigation automatique. Le code est conservé tel quel, marqué `[DESACTIVE]`.
>
> **La page de réglages est partie avec elle** (v0.16.0) : elle ne configurait que cette
> fonctionnalité, et une page qui demande nom, email, téléphone et revenu sans qu'aucun
> code ne s'en serve est un motif de rejet direct au Chrome Web Store.
>
> **Pour tout réactiver** : décommenter les blocs `[DESACTIVE]` de `content.js`,
> `background.js` et `popup.js` / `popup.html`, retirer le `return` en tête de `tour.js`,
> remettre `tour.js` dans les `content_scripts` et `"options_page": "options.html"` dans
> le manifest.
>
> La description ci-dessous documente le fonctionnement d'origine.

### Le principe

1. **Réglages** (icône de l'extension → « Réglages & message ») : ton nom, email, téléphone,
   pays, situation pro, revenu, garant, date d'emménagement — plus tes critères de file
   (loyer max, chambres min, quels verdicts Insurent acceptés) et le **template du message**.
2. Sur une page de résultats StreetEasy, un bouton flottant **« 📨 Demander une visite (N) »**
   compte les annonces qui matchent. Clic → panneau avec la liste, cases à cocher, prix,
   verdicts garants.

   **Un seul garant suffit** : une annonce entre dans la file si Insurent l'accepte
   **ou** si TheGuarantors couvre le bâtiment. Chaque ligne affiche les deux verdicts
   (`🟢 G` = Insurent OK et TheGuarantors OK ; `🔴 G` = seul TheGuarantors couvre).
   La case « Accepter aussi les bâtiments couverts par TheGuarantors » permet de revenir
   à un filtre Insurent seul.
3. **« Lancer »** ouvre un onglet dédié (ta page de résultats reste intacte derrière) et
   enchaîne les annonces une par une. Sur chaque annonce, l'extension :
   - clique **« Request a tour »** pour ouvrir le panneau s'il est fermé,
   - remplit **nom / email / téléphone** — uniquement les champs vides, StreetEasy
     pré-remplit déjà les tiens quand tu es connecté,
   - coche **« Video chat »** (ou « In-person », selon tes réglages),
   - sélectionne jusqu'à **3 créneaux** (date + heure) selon tes préférences, en cliquant
     « + Add » après chacun,
   - déplie **« + Add a Message »** et y colle le message personnalisé (adresse + loyer inclus),
   - affiche une barre en bas : un récapitulatif de ce qui a été rempli, le message éditable,
     et les boutons `Copier` · `Re-remplir` · `Envoyé → suivant` · `Passer` · `Arrêter la file`.
4. Tu relis, tu ajustes si tu veux, **tu cliques « Send request » toi-même**, puis
   « Envoyé → suivant ». L'annonce est marquée comme contactée et ne reviendra plus
   dans la file.

### Réglages des créneaux

Dans la page de réglages, section **« Request a tour »** :

| Réglage | Effet |
| --- | --- |
| Type de visite | coche `Video chat`, `In-person`, ou ne touche à rien |
| Créneaux | 0 à 3 créneaux pré-sélectionnés (StreetEasy plafonne à 3) |
| Ignorer les N premiers jours | pour ne pas proposer « demain matin » à un agent qui répondra dans 2 jours |
| Fuseau | tes heures sont locales (converties vers New York) ou déjà en heure NY |
| Grille de disponibilités | une case par jour × période (matin / après-midi / soir) |
| Heure de chaque période | ce que « après-midi » veut dire concrètement, ex. 15:00 |

**Le décalage horaire est géré automatiquement.** Le panneau StreetEasy est en heure de
New York ; toi tu raisonnes en heure française. « Mercredi après-midi (15:00) » devient donc
`Wed, 9:00 AM` dans leur menu. Le décalage est recalculé à chaque fois via
`Intl`/`America/New_York`, ce qui reste juste pendant les semaines où l'Europe et les
États-Unis n'ont pas encore changé d'heure ensemble (−5 h au lieu de −6 h). La grille de
réglages affiche sous chaque case cochée l'heure new-yorkaise correspondante, et signale
`(veille)` quand une heure très matinale bascule sur le jour précédent à New York.

Comme tu as souvent plus de fenêtres de disponibilité que les 3 créneaux autorisés, le
placeholder `{{availability}}` écrit **toutes** tes dispos dans le message, en heure de
New York : *« I'm available Wednesday and Thursday at 9:00 AM and 2:00 PM New York time. »*

Sur une page d'annonce isolée (hors file), un bouton **« 📨 Demander une visite »** fait la
même chose pour cette annonce seule.

### Mode production : envoi automatique

Dans les réglages, **Envoi** passe de « Manuel » à « Automatique ». L'extension clique alors
elle-même sur « Send request » et enchaîne l'annonce suivante, sans aucune intervention.

Trois garde-fous, parce qu'un envoi part chez un vrai agent et ne se rattrape pas :

- **le mode test reste prioritaire** : tant qu'il est coché, rien ne part ;
- **un compte à rebours annulable** précède chaque envoi (6 s par défaut) ;
- **la file s'arrête si un envoi n'aboutit pas.** Le seul signe fiable d'un envoi accepté est
  la fermeture du panneau par StreetEasy. S'il reste ouvert (champ requis, captcha, erreur
  réseau), la file s'interrompt et l'annonce n'est PAS marquée comme contactée, au lieu de
  continuer à l'aveugle en croyant avoir envoyé.

Un remplissage incomplet (créneaux manquants, message non collé) suspend aussi l'envoi
automatique pour cette annonce.

Une pause de 25 s (± 40 % aléatoire) sépare deux annonces : enchaîner trente envois à la
seconde est le moyen le plus sûr de se faire repérer par l'anti-bot.

### Mode test (actif par défaut)

Tant que le **mode test** est actif, l'extension **neutralise le bouton « Send request »**
de StreetEasy : il est grisé et barré, et un clic dessus est intercepté avant que le site
ne le voie (la touche Entrée dans un champ et la soumission du formulaire aussi).

Ça permet de dérouler tout le flux sur le vrai site — file, navigation, remplissage,
créneaux, message — **sans qu'aucune demande ne parte**. Une bannière rouge le rappelle
sur chaque annonce, avec un bouton « Désactiver et pouvoir envoyer » ; le réglage est aussi
dans la page d'options.

Une fois le flux validé, tu le désactives (bannière verte « MODE RÉEL ») et tu envoies
normalement.

### Procédure de test de bout en bout

1. Réglages → remplis ton profil, laisse **Mode test coché**, enregistre.
2. Va sur une recherche StreetEasy, scrolle un peu pour laisser les badges se vérifier.
3. Vérifie le compteur du bouton flottant `📨 Demander une visite (N)`.
4. Ouvre le panneau : les annonces listées doivent bien correspondre à tes critères.
5. Décoche tout sauf **une** annonce, clique « Lancer ».
6. Sur l'annonce ouverte : bannière rouge présente ? panneau « Request a tour » ouvert ?
   Video chat coché ? créneaux ajoutés ? message collé ? Compare avec le récapitulatif
   de la barre.
7. Clique « Send request » : **rien ne doit se passer**, la barre affiche « 🔒 Envoi bloqué ».
8. Clique « Passer » (et pas « Envoyé → suivant ») pour ne pas marquer l'annonce comme
   contactée pendant un test.
9. Recommence avec 2–3 annonces pour vérifier l'enchaînement de la file.
10. Quand tout est bon : décoche le mode test et lance la vraie file.

### Pourquoi tu cliques « Send request » toi-même

C'est un choix assumé, pas une limite technique de flemme :

- **StreetEasy est protégé anti-bot** (PerimeterX). Un script qui poste 30 formulaires à la
  suite se fait détecter, et le compte StreetEasy saute — tu perds l'accès à ta recherche.
- **Un message envoyé sans relecture est un message perdu.** Les agents NY reçoivent des
  dizaines de demandes ; un message visiblement automatique passe à la poubelle. Là, tu peux
  ajouter une phrase spécifique à l'annonce en 5 secondes avant d'envoyer.
- Le gain reste énorme : plus de copier-coller, plus de retaper ta situation 40 fois, plus
  de doublons — un clic par annonce au lieu de deux minutes.

### Le message par défaut

En anglais (les agents new-yorkais), il explique : candidature internationale, pas d'historique
de crédit US, garant institutionnel disponible (Insurent / TheGuarantors), preuve de revenus,
lettre d'employeur, ouverture à un dépôt de garantie majoré — et demande une **visite virtuelle**
(FaceTime / Zoom / vidéo) avec disponibilité sur les créneaux new-yorkais.

Tu peux le réécrire entièrement dans les réglages. Placeholders disponibles :
`{{address}}` `{{price}}` `{{price_sentence}}` `{{beds}}` `{{url}}` `{{name}}` `{{email}}`
`{{phone}}` `{{country}}` `{{occupation}}` `{{income}}` `{{guarantor}}` `{{movein}}`
`{{extra}}` — plus les formules qui **disparaissent proprement si le champ est vide** :
`{{based_clause}}` `{{occupation_clause}}` `{{income_clause}}` `{{contact_line}}`.
Un aperçu en direct est affiché sous le template.

### Où vont tes données

Nulle part. Profil, template, critères, historique des envois : tout est dans
`chrome.storage.local`, c'est-à-dire ton navigateur. L'extension ne parle qu'à deux domaines :
streeteasy.com (la page que tu regardes) et insurent.com (la vérification du bâtiment).

---

## Installation (mode développeur, non publié sur le Store)

1. Télécharge/dézippe ce dossier quelque part sur ton ordinateur.
2. Ouvre Chrome → tape `chrome://extensions` dans la barre d'adresse.
3. Active le **« Mode développeur »** (interrupteur en haut à droite).
4. Clique sur **« Charger l'extension non empaquetée »**.
5. Sélectionne le dossier `streeteasy-guarantor-checker`.
6. Va sur streeteasy.com — les badges devraient apparaître sur les annonces.
7. Les badges suffisent : aucun réglage n'est nécessaire tant que la file de demandes de
   visite est désactivée. (Quand elle est réactivée, il faut au minimum renseigner ton
   **nom** et ton **email** dans « Réglages & message ».)

Si tu modifies le code, reviens sur `chrome://extensions` et clique sur l'icône de
rechargement de l'extension.

## Empaqueter pour le Store

Le zip envoyé au Chrome Web Store ne doit contenir **que** ce qui tourne :

```
manifest.json  background.js  content.js  shared.js
popup.html  popup.js  pages.css  style.css  _locales/  icons/
```

À exclure : `test/`, `brand/`, `store/`, `README.md`, `tour.js`, `options.html` et `options.js` — du code mort
dans le paquet, c'est un examinateur qui se demande pourquoi une extension de badges
embarque un formulaire de contact.

## ⚠️ Limites connues

- **Détection d'adresse heuristique** : les sélecteurs ne sont pas calibrés sur le HTML réel
  de StreetEasy. Si un badge manque ou tombe sur la mauvaise adresse, ouvre les DevTools sur
  une annonce et dis-moi la classe du bloc d'adresse pour affiner le sélecteur.
- **Le pré-remplissage est calibré sur le panneau « Request a tour » de septembre 2025** :
  ancré sur `input#name` / `input#email` / `input#phone`, `input[name=tourType]`,
  `select[aria-label=Date]` / `select[aria-label=Time]` et les boutons au texte exact
  `+ Add` et `+ Add a Message`. Les classes CSS de StreetEasy sont hachées (`fkchgv`,
  `eHDBZh`…) donc volatiles : elles ne sont **jamais** utilisées comme sélecteur.
  Un repli gère l'ancien formulaire de contact (textarea + email) sur les annonces qui
  n'ont pas le panneau. Si StreetEasy change son formulaire, la barre affiche
  « Panneau de visite introuvable » et te laisse le bouton `Copier`.
- **StreetEasy re-rend sa page après coup.** Son React s'hydrate *après* le chargement du
  content script ; comme il trouve nos badges dans son arbre, l'hydratation échoue
  (erreurs `#418`/`#423` dans la console) et il re-rend tout, en emportant nos éléments.
  Deux parades : la première injection attend la fin du chargement (moins d'erreurs
  d'hydratation), et une surveillance re-attache le bouton et le panneau s'ils sont
  effacés. Les verdicts déjà obtenus sont mémorisés par annonce, donc le compteur ne
  retombe pas à zéro à chaque re-rendu.
- **Téléphone étranger** : le champ de StreetEasy est collé à un indicatif verrouillé sur
  `+1`. Un numéro français y deviendrait `+1 33 6 …`, injoignable. L'extension laisse donc
  le champ vide si ton numéro n'est pas américain et l'indique dans le récapitulatif — ton
  vrai numéro, avec son indicatif, reste dans le texte du message.
- **Lecture du loyer** : `textContent` colle les éléments voisins (`$3,500` + `1 bed` →
  `$3,5001 bed`, lu 35001). Le texte des cartes est donc reconstruit en joignant les nœuds
  texte par un espace, et la regex de prix refuse un nombre suivi d'un chiffre. En cas de
  doute le prix vaut 0 et la phrase de loyer disparaît du message, plutôt que d'annoncer
  un montant faux à l'agent.
- **Tous les boutons du panneau sont `type="submit"`**, « Send request » compris. L'extension
  ne clique donc que sur des boutons dont le texte correspond **exactement** (`^\+ Add$`,
  `^\+ Add a Message$`, `^Request a tour$`) — jamais sur une correspondance approximative.
  Un test automatisé vérifie qu'aucun clic ne part sur « Send request », « Cancel » ou
  « + Add search partner ».
- **Le nonce Insurent peut expirer** : le service worker le re-récupère automatiquement et
  réessaie une fois. Si Insurent change le nom de l'action AJAX ou du nonce, il faudra
  recalibrer `background.js`.
- **Matching d'adresse** : on normalise les abréviations courantes (St/Street, E/East, 45th/45…)
  et on ancre sur le numéro de rue pour éviter les faux positifs. Un 🟡 = à confirmer d'un clic.
- **Le filtre de la file ne remplace pas les filtres StreetEasy** : quartier, type de bien,
  no-fee, etc. restent à régler sur le site. La file part des annonces de la page que tu
  regardes, et n'ajoute que le filtre garant + loyer max / chambres min.
- Le badge Insurent et la détection des annonces sont testés sur la logique, **pas encore validés en
  conditions réelles** sur streeteasy.com — à tester et ajuster ensemble.

## Fichiers

- `manifest.json` — déclaration MV3, permissions, service worker, page d'options.
- `_locales/<langue>/messages.json` — tous les textes de l'interface (voir « Langues »).
- `pages.css` — design system partagé par le popup et la page de réglages (couleurs,
  cartes, champs, boutons, thème clair/sombre).
- `shared.js` — réglages par défaut, template du message, helpers de stockage (partagé par
  les content scripts et les pages d'extension).
- `background.js` — service worker : nonce + appel à l'API publique Insurent + verdict,
  liste TheGuarantors, et (désactivé) pilotage de la file.
- `content.js` — badges sur les annonces ; le bouton/panneau de la file est en commentaire.
- `tour.js` — pré-remplissage du panneau « Request a tour ». **Neutralisé** (`return` en
  tête) et retiré du manifest : il n'est plus injecté.
- `options.html` / `options.js` — profil, critères, template, aperçu. **Retirés du manifest**
  en v0.16.0 (voir ci-dessous) : la page est conservée, traduite et testée, mais n'est plus
  déclarée ni accessible.
- `popup.html` / `popup.js` — légende des badges ; l'accès aux réglages et l'état de la file
  sont en commentaire.
- `style.css` — styles injectés dans StreetEasy : pastilles, popover de détail, toast
  (et, en sommeil, le panneau et la barre de la file).
- `icons/` — icônes 16 / 32 / 48 / 128 px, **générées** par `brand/build.mjs`.
- `brand/` — la direction artistique ([`brand/BRAND.md`](brand/BRAND.md)), les deux
  masters SVG de la marque et les gabarits des visuels. `node brand/build.mjs` réécrit
  `icons/` et `store/`.
- `store/` — les images prêtes à déposer sur le Chrome Web Store : icône 128, cinq
  captures 1280×800, tuile 440×280 et bandeau 1400×560. **Hors du zip.**
