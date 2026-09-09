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
| URL de la page d'accueil | `https://github.com/raphabiz/guarantor-checker-nyc` |
| URL de l'assistance | `https://github.com/raphabiz/guarantor-checker-nyc/issues` |
| Contenu réservé aux adultes | Non |

---

## Onglet « Confidentialité »

Le formulaire ne prévoit **qu'un seul champ pour toutes les autorisations d'hôte**, pas un par
domaine. Les trois justifications sont donc fusionnées ci-dessous. Chaque champ est limité à
1 000 caractères ; les longueurs sont indiquées.

### Description de l'objectif unique — 556/1000

```
Guarantor Checker adds a badge to rental listings on streeteasy.com showing whether the building is on the list of buildings that Insurent or TheGuarantors publicly state they cover.

That is its only function. It reads the address printed on a listing, compares it with those two public lists, and displays the verdict together with the reasoning behind it: the address it read, the query it sent, what came back, and the source.

It does not contact agents, fill in or submit forms, rank or hide listings, or modify any website other than streeteasy.com.
```

### Justification de l'autorisation `storage` — 546/1000

```
The extension caches TheGuarantors' public list of covered buildings in chrome.storage.local and refreshes it once every 24 hours. Without that cache the list would be downloaded again on every results page the user opens, which is wasteful for the user and the worst possible signal to send to that endpoint.

No user data is ever written to storage. The cache holds only public reference data published by TheGuarantors, plus the timestamp of the last download. Insurent results are kept in memory in the service worker and are never persisted.
```

### Justification de l'autorisation d'accès à l'hôte — 838/1000

```
Three hosts: one where the badge is shown, two that are asked the question.

streeteasy.com: the content script reads the building address printed on a rental listing and inserts the guarantor badge next to it. This is the only site whose pages the extension reads or modifies.

insurent.com: the service worker queries Insurent's public certified-building search, the same endpoint that powers the address field on their own website, to check whether the listed building is certified.

theguarantors.com: the service worker downloads TheGuarantors' public list of the buildings they cover in New York and New Jersey, and compares the listing address against it.

Both outgoing requests carry only a building address and are sent without cookies or credentials. They run in the service worker because a page cannot make them cross-origin.
```

Le formulaire prévient qu'une autorisation d'hôte déclenche un examen approfondi et retarde la
publication. C'est normal et inévitable ici : sans accès à streeteasy.com l'extension n'a nulle
part où poser son badge, et sans les deux autres elle n'a rien à vérifier.

### Code distant

Sélectionner **« Non, je n'utilise pas Code distant »**. Si le champ Justification reste
obligatoire — 204/1000 :

```
All executable code ships inside the extension package. Network requests return JSON data, which is parsed and never evaluated. There is no eval(), no external <script> tag, and no remotely hosted module.
```

### Consommation des données

Cocher **Contenu du site Web**, et rien d'autre.

Les huit autres cases restent vides. En particulier **Historique Web** : l'extension ne
transmet ni URL, ni titre de page, ni heure de visite, seulement une chaîne d'adresse postale.

Ce formulaire n'a pas de champ de texte libre. L'explication vit dans `PRIVACY.md`, qui est
déjà rédigé dans ce sens.

### Les trois attestations

Cocher les trois.

### URL des règles de confidentialité

```
https://github.com/raphabiz/guarantor-checker-nyc/blob/main/PRIVACY.md
```

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
- [x] Dépôt public créé, `PRIVACY.md` accessible à l'URL déclarée
- [x] `LICENSE` : titulaire du copyright = MONEPOK
- [x] `PRIVACY.md` : adresse de contact renseignée (raph@monepok.com)
- [x] Clé d'API TheGuarantors : décision prise, on la garde en clair. Risque assumé et
      procédure de retrait écrite dans `DEVELOPMENT.md`
- [ ] Badges vérifiés sur de vraies pages streeteasy.com
