# Direction artistique : Guarantor Checker for NYC Rentals

Tout ce qui suit découle d'une seule contrainte, déjà écrite en tête de
[`style.css`](../style.css) : sur une page de résultats, l'extension pose vingt
pastilles côte à côte. Vingt aplats verts et rouges seraient illisibles. **La
couleur ne sert donc qu'à la puce et au mot d'état, jamais au fond.** La marque,
les captures et les tuiles promotionnelles appliquent la même règle.

---

## 1. Le positionnement

Une question, une réponse : *ce bâtiment accepte-t-il Insurent ou TheGuarantors ?*
L'extension ne promet pas de trouver un appartement, ne se présente pas comme un
service de garantie, et ne cache pas ses sources. Le ton est **factuel et sobre** :
pas de superlatif, pas de gamification, pas de fusée. On montre le verdict, et on
montre pourquoi.

Corollaire de DA : **aucun visuel ne doit laisser croire à une affiliation** avec
StreetEasy, Zillow, Insurent ou TheGuarantors. Pas de reprise de leur charte, pas
de marque tierce mêlée à la nôtre, mention de non-affiliation en pied de chaque
planche. Les logotypes d'Insurent et de TheGuarantors apparaissent, pour nommer
ce qui est interrogé, dans un encart qui leur est propre, sous les règles du
§ 5 bis.

---

## 2. La marque

### L'idée

Un gratte-ciel new-yorkais à retraits, la silhouette Art déco qu'on ne trouve
qu'ici, **tamponné d'une pastille de vérification**. Le sujet vérifié (le
bâtiment) et le résultat (le verdict) dans un seul signe. Le vert est celui de
l'état « accepté » du produit : l'icône et les pastilles parlent la même langue.

Trois pistes ont été écartées :

| Piste | Pourquoi non |
| --- | --- |
| Façade avec une fenêtre allumée en vert | superbe en 128 px, mais sous 32 px la fenêtre verte disparaît et il ne reste qu'une grille, un pavé numérique |
| Écusson / bouclier | lisible à toutes les tailles, mais c'est le territoire visuel des antivirus et des VPN |
| Coche seule (l'ancienne icône) | indiscernable de mille icônes « succès » ; ne dit rien du métier |

### Deux masters, pas un

| Fichier | Rendu | Ce qui change |
| --- | --- | --- |
| [`src/mark.svg`](src/mark.svg) | 48 et 128 px, tous les visuels | dégradé, flèche, 11 fenêtres verticales, tampon fin |
| [`src/mark-small.svg`](src/mark-small.svg) | 16 et 32 px (barre d'outils) | aplat uni, pas de flèche, 3 fenêtres larges, tampon épaissi |

La barre d'outils de Chrome affiche 16 px logiques. À cette taille le dégradé se
salit, la flèche disparaît et les fenêtres fines se referment en bouillie : le
master allégé garde la même silhouette et le même tampon, avec les détails
**retirés** plutôt que réduits.

### Règles d'usage

- **Angles** : rayon 29/128 (22,6 %) sur le master principal, 27/128 sur l'allégé.
  L'icône est toujours **à fond perdu**, sans marge blanche interne.
- **Zone de protection** : au moins un quart de la largeur de l'icône, libre de
  tout élément, tout autour.
- **Taille minimale** : 16 px.
- **Fond** : le vert de la marque tient sur clair comme sur sombre. Ne jamais
  redessiner l'icône sur fond blanc ni la détourer.
- **Jamais** : recolorer, incliner, ajouter une ombre à l'intérieur du carré,
  remplacer la coche par un autre pictogramme, étirer.

### Le verrou horizontal

Icône + `Guarantor Checker` en **650** (interlettrage −0,025 em), et
`for NYC Rentals` en **400** à 66 % d'opacité, sur la ligne suivante ou à la
suite. Le nom court seul (`Guarantor Checker`) est admis quand la place manque :
c'est ce qui apparaît dans le popup de l'extension.

---

## 3. Palette

Strictement celle du produit ([`pages.css`](../pages.css), [`style.css`](../style.css)).
Aucune couleur n'a été inventée pour le Store.

| Rôle | Clair | Sombre | Usage |
| --- | --- | --- | --- |
| Vert garant | `#0f7b5a` | `#2aa37a` | accent, état « accepté », marque |
| Vert profond | `#095339` | (idem) | bas du dégradé de l'icône et des tuiles |
| Vert clair | `#1aa87c` | (idem) | haut du dégradé |
| Voile d'accent | `rgba(15,123,90,.09)` | `rgba(255,255,255,.16)` | pastilles numérotées, encadrés |
| Ambre | `#a8710a` | `#d9a441` | état « à confirmer » |
| Rouge | `#b23b3b` | `#d76a6a` | état « absent » |
| Gris | `#6b7280` | `#98a2ad` | état « non vérifié », texte secondaire |
| Encre | `#16191d` | `#e9ecef` | texte |
| Texte doux | `#5b6570` | `#9aa4ae` | sous-titres |
| Surface / fond / bordure | `#ffffff` / `#f6f7f8` / `#e0e4e8` | `#1c1f24` / `#131518` / `#2f343b` | cartes et pages |

**Un seul vert.** Les quatre couleurs d'état ne servent jamais de couleur de
marque, et la couleur de marque ne sert jamais à signifier un état.

---

## 4. Typographie

La pile système du produit : `"Segoe UI Variable Display", "Segoe UI",
-apple-system, Roboto, sans-serif`. Aucune police à charger : une extension qui
tire une webfont pour son popup, c'est un aller-retour réseau pour rien.

| Niveau | Taille | Graisse | Interlettrage |
| --- | --- | --- | --- |
| Titre de planche | 46 px | 700 | −0,025 em |
| Sur-titre (eyebrow) | 14 px capitales | 650 | +0,09 em |
| Sous-titre | 19 px | 400 | 0 |
| Titre de tuile | 20 px | 650 | −0,015 em |
| Corps | 16 px | 400 | 0 |
| Valeur monospace | 13–15 px | 400 | `ui-monospace, Consolas` |

Le sur-titre est précédé d'un tiret plein de 22 × 2 px : c'est le seul ornement
graphique de la charte.

---

## 5. Les visuels du Chrome Web Store

Rédigés **en anglais** : la vitrine du Store n'est pas localisée, et le public
visé est celui qui cherche un appartement à New York sans historique de crédit
américain. L'interface, elle, reste traduite en 5 langues.

| Fichier | Format | Ce qu'il raconte |
| --- | --- | --- |
| `store/icon-store-128.png` | 128×128 | l'icône de la fiche |
| `store/screenshot-1-verdict.png` | 1280×800 | **quoi** : deux pastilles par annonce, les trois verdicts côte à côte |
| `store/screenshot-2-why.png` | 1280×800 | **pourquoi** : le popover : adresse lue, requête envoyée, résultat, source |
| `store/screenshot-3-states.png` | 1280×800 | **comment lire** : les quatre états et le popup de l'extension |
| `store/screenshot-4-how.png` | 1280×800 | **comment ça marche** : lecture, normalisation, requête + cache 24 h |
| `store/screenshot-5-privacy.png` | 1280×800 | **confiance** : une permission, trois domaines, rien de collecté |
| `store/promo-small-440x280.png` | 440×280 | petite tuile promotionnelle |
| `store/promo-marquee-1400x560.png` | 1400×560 | bandeau (nécessaire pour être mis en avant) |

Composition des planches : marge de 72 px, sur-titre → titre → sous-titre en haut
à gauche, démonstration en dessous, pied de page avec le verrou et la mention de
non-affiliation. Une seule planche est sombre (la 5) : elle clôt la série sur la
confiance et casse la monotonie du carrousel.

**Les pastilles et le popover ne sont pas redessinés.** Les gabarits importent le
vrai [`style.css`](../style.css) : ce que montre le Store est exactement ce que
l'extension injecte.

Seules les **annonces** sont simulées, et elles ont la structure d'une vraie
annonce de location new-yorkaise : loyer mensuel, chambres / salles de bain /
surface, adresse, quartier, étiquette `NO FEE`, courtier. C'est ce qui rend la
capture lisible : une pastille posée sur une fiche vide ne montre rien. Trois
garde-fous, en revanche :

- **des illustrations, jamais des photographies** ([`src/photos/`](src/photos/)) ;
  une annonce de démonstration ne doit pas pouvoir passer pour une annonce en
  circulation ;
- **des courtiers inventés** (Marlow &amp; Finch, Kestrel Residential, Thornbury
  Group) : aucune agence réelle n'est nommée ;
- **rien d'emprunté à la charte du site hôte.** Ni logo, ni couleurs, ni
  typographie : la fiche est dessinée avec nos jetons à nous. Le pied de page
  porte la mention `Illustrative listings. Not affiliated with...`.

---

## 5 bis. Les logotypes des deux garants

Les visuels affichent les marques d'**Insurent** et de **TheGuarantors** : elles
disent d'un coup d'œil quels services sont interrogés, là où deux noms en
toutes lettres demandent une lecture. Ce sont des marques tierces, l'usage est
strictement nominatif, et il obéit à trois règles.

1. **Un encart blanc qui leur appartient.** Les logos ne sont jamais posés sur
   notre vert ni sur une photo : ils vivent dans une carte blanche séparée,
   avec un intitulé (`Checked against`) qui dit ce qu'ils font là.
2. **Aucun composé avec notre marque.** Jamais dans le verrou, jamais alignés
   avec notre icône, jamais recolorés vers notre vert. Rien ne doit suggérer un
   partenariat.
3. **La non-affiliation reste en pied** de chaque planche qui les affiche.

Ils apparaissent sur trois visuels seulement : la planche 1 (épingle en haut à
droite), la planche 4 (à côté de la phrase qui cite leurs listes publiques,
le placement le plus défendable) et le bandeau. La petite tuile 440×280 en est
privée : à cette taille, les deux logotypes deviendraient illisibles.

**Les pastilles injectées dans les pages restent en texte seul.** Embarquer des
marques tierces dans le paquet livré serait un tout autre sujet, et un motif de
rejet autrement plus sérieux que sur une image promotionnelle.

Provenance, retouches et procédure de retrait : [`src/logos/README.md`](src/logos/README.md).

---

## 6. Régénérer

```bash
node brand/build.mjs
```

Le rendu passe par Chrome en mode headless (`CHROME_PATH` si l'exécutable n'est
pas à l'emplacement standard). Le script réécrit les quatre icônes de
[`icons/`](../icons/) et les huit fichiers de [`store/`](../store/).

Les sources sont dans [`src/`](src/) : deux SVG de marque, les deux logotypes
tiers ([`src/logos/`](src/logos/)), les trois illustrations d'annonce
([`src/photos/`](src/photos/)), un jeu de styles
([`src/shots.css`](src/shots.css)) et un gabarit HTML par visuel. Le bloc
« thème sombre » en fin de `shots.css` n'est pas décoratif : le rendu headless
suit le thème du système, et sans lui les pastilles sortent en version sombre.

---

## 7. Avant de soumettre

- [ ] Remplacer `screenshot-1-verdict.png` par une **capture réelle** sur
      streeteasy.com une fois les sélecteurs validés. Un examinateur préfère
      toujours le produit en situation à une maquette.
- [ ] Retirer `brand/` et `store/` du zip envoyé au Store (voir « Empaqueter pour
      le Store » dans [`DEVELOPMENT.md`](../DEVELOPMENT.md)).
- [x] Clé d'API TheGuarantors : on la garde. Si elle saute un jour, les planches 1,
      2, 5 et le bandeau sont à reprendre, ils annoncent deux garants et trois
      domaines. Procédure complète dans [`DEVELOPMENT.md`](../DEVELOPMENT.md).
- [ ] Accepter le risque des logotypes tiers, ou les retirer. La règle
      *Impersonation and Intellectual Property* du Store demande l'accord du
      titulaire : l'usage nominatif est la pratique courante, ce n'est pas une
      autorisation. Retrait = supprimer les blocs `.brands` et `.note.sourced`
      des gabarits, puis relancer le build.
