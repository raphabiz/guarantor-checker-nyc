# Réponses à recopier dans le tableau de bord du Chrome Web Store

Les valeurs à coller sont en anglais : c'est la langue dans laquelle la fiche est publiée et
dans laquelle l'examen est fait. Les commentaires autour sont pour toi.

---

## Onglet « Fiche du magasin »

| Champ | Valeur |
| --- | --- |
| Catégorie | `Shopping` (repli acceptable : `Outils`) |
| Langue | `English` |
| Description courte | déjà dans `manifest.json` via `_locales/*/messages.json` |
| Description détaillée | [`listing-en.txt`](listing-en.txt) |
| Icône du magasin | [`icon-store-128.png`](icon-store-128.png) |
| Captures d'écran internationales | `screenshot-1-verdict` → `screenshot-5-privacy`, dans cet ordre |
| Petite image promotionnelle | [`promo-small-440x280.png`](promo-small-440x280.png) |
| Image promotionnelle en haut de page | [`promo-marquee-1400x560.png`](promo-marquee-1400x560.png) |
| Vidéo promotionnelle | laisser vide |
| URL officielle | `Aucune` |
| URL de la page d'accueil | `https://github.com/<toi>/guarantor-checker-nyc` |
| URL de l'assistance | `https://github.com/<toi>/guarantor-checker-nyc/issues` |
| Contenu réservé aux adultes | Non |

---

## Onglet « Confidentialité »

### Objectif unique (single purpose)

> Guarantor Checker adds a badge to rental listings on streeteasy.com showing whether the
> building is on the list of buildings that Insurent or TheGuarantors publicly state they cover.
> That is its only function. It reads the address printed on a listing, compares it with those
> two public lists, and displays the result together with the reasoning behind it. It does not
> contact agents, fill in forms, submit anything, rank listings, or alter any other website.

### Justification de la permission `storage`

> The extension caches TheGuarantors' public list of covered buildings in `chrome.storage.local`
> and refreshes it once every 24 hours. Without it, that list would be downloaded again on every
> results page the user opens. No user data is ever written to storage: the cache holds only
> public reference data published by TheGuarantors, plus the timestamp of the last download.

### Justification de l'accès à `streeteasy.com`

> The content script runs on rental listings on streeteasy.com to read the building address
> printed on the listing and insert the guarantor badge next to it. This is the only site whose
> pages the extension reads or modifies.

### Justification de l'accès à `insurent.com`

> The service worker queries Insurent's public certified-building search, the same endpoint that
> powers the address field on their own website, to check whether the listed building is
> certified. A page cannot make this cross-origin request itself, which is why the host
> permission is required. The request carries only a building address and is sent without
> credentials.

### Justification de l'accès à `theguarantors.com`

> The service worker downloads TheGuarantors' public list of the buildings they cover in New
> York and New Jersey, and compares the listing address against it. The list is cached locally
> for 24 hours. The request carries no user data and is sent without credentials.

### Code distant (remote code)

> **No, I am not using remote code.**

Tout ce qui s'exécute est dans le paquet. Les appels réseau ne ramènent que des données JSON,
jamais du code.

### Utilisation des données

Coche **Website content**, et rien d'autre.

> The only thing transmitted off the device is the building address printed on the listing the
> user is currently viewing. It is sent to Insurent and to TheGuarantors so that they can answer
> whether they cover that building, which is the sole purpose of the extension. No name, email,
> account identifier, IP-linked profile, or browsing history is attached, and the requests are
> made without cookies or credentials. Nothing is stored on any server operated by this
> extension, because there is none.

Laisse décochées : informations personnelles, données de santé, données financières,
authentification, communications personnelles, position, historique de navigation, activité
utilisateur.

### Les trois attestations

Coche les trois. Aucune donnée n'est vendue, transférée, ni utilisée hors de l'objectif unique,
et rien n'est utilisé pour évaluer une solvabilité.

### URL de la politique de confidentialité

`https://github.com/<toi>/guarantor-checker-nyc/blob/main/PRIVACY.md`

---

## Deux points où ne pas répondre à la légère

**« Website content » plutôt que « rien ».** La tentation est de tout laisser décoché puisque
l'extension ne collecte rien sur l'utilisateur. Mais l'adresse du bâtiment est du contenu lu sur
la page et transmis hors de l'appareil : c'est la définition de Google. Sous-déclarer est une
violation de règlement qui coûte un retrait ; sur-déclarer ne coûte qu'une ligne sur la fiche.

**La troisième attestation** parle de solvabilité, et l'extension parle de garants. Un examinateur
peut s'y arrêter. La réponse tient en une phrase, à garder sous la main : l'extension vérifie des
**bâtiments**, jamais des personnes, et ne reçoit aucune donnée sur l'utilisateur.

---

## Avant de cliquer sur « Envoyer »

- [ ] `node pack.mjs`, et déposer `dist/guarantor-checker-<version>.zip`
- [ ] Le dépôt GitHub est public, `PRIVACY.md` accessible à l'URL déclarée
- [x] `LICENSE` : titulaire du copyright = MONEPOK
- [x] `PRIVACY.md` : adresse de contact renseignée (raph@monepok.com)
- [x] Clé d'API TheGuarantors : décision prise, on la garde en clair. Risque assumé et
      procédure de retrait écrite dans `DEVELOPMENT.md`
- [ ] Badges vérifiés sur de vraies pages streeteasy.com
