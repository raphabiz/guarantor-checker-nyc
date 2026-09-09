# Logotypes tiers

Ces deux fichiers **ne nous appartiennent pas**. Ce sont les marques déposées
d'Insurent (MRI Software) et de TheGuarantors, utilisées dans les visuels du
Chrome Web Store pour **nommer les deux services que l'extension interroge**.

| Fichier | Source | Récupéré le |
| --- | --- | --- |
| `insurent.png` | `insurent.com/wp-content/themes/insurent/build/images/insurent-logo.png` | 3 septembre 2026 |
| `theguarantors.svg` | `images.ctfassets.net/.../the-guarantors-wordmark-vector.svg` (référencé par `theguarantors.com`) | 3 septembre 2026 |

**Retouche.** Une seule, sur `insurent.png` : le fond blanc a été rendu
transparent pour pouvoir poser le logo sur nos surfaces claires. Pas de
recadrage, pas de recoloration, proportions d'origine conservées. Le SVG de
TheGuarantors est le fichier officiel, intact.

## Règles

- **Toujours sur fond blanc**, dans un encart qui leur est propre. Jamais posés
  directement sur notre vert, jamais mêlés à notre marque.
- **Jamais recolorés, inclinés, recadrés ni redessinés.** Si un fond sombre est
  nécessaire, on remplace l'encart, pas le logo.
- **Jamais dans un verrou** avec notre icône, jamais dans un composé qui
  suggérerait un partenariat.
- La mention de non-affiliation reste présente en pied de chaque planche qui les
  affiche.
- **Hors du paquet livré au Store** : `brand/` est exclu du zip. Ces marques
  n'entrent pas dans l'extension elle-même : les pastilles injectées dans les
  pages restent en texte seul.

## Réserve

La règle *Impersonation and Intellectual Property* du Chrome Web Store demande
l'accord du titulaire pour employer le logo d'une autre société. L'usage ici est
nominatif (désigner un service interrogé, sans revendiquer de lien), ce qui est
la pratique courante des extensions d'interopérabilité, mais **ce n'est pas une
autorisation**. Si l'examen bute là-dessus, ou si l'une des deux sociétés le
demande, il suffit de retirer les blocs `.brands` / `.note.sourced` des gabarits
et de relancer `node brand/build.mjs` : les planches restent valides, les noms
en toutes lettres suffisent.
