# Guarantor Checker for NYC Rentals

Renting in New York without a US credit history means the same question comes up on every
listing: will this building take an institutional guarantor?

This Chrome extension answers it where the question is asked, on the listing itself. It adds
two small badges to each rental listing on streeteasy.com, one for Insurent and one for
TheGuarantors, and tells you whether the building is on their published lists.

> Not affiliated with, endorsed by, or connected to StreetEasy, Zillow, Insurent, MRI Software
> or TheGuarantors. All trademarks belong to their respective owners.

## The four states

| Badge | Meaning |
| --- | --- |
| **accepted** | The building is on that guarantor's published list. |
| **to confirm** | Same street number, different street name. Worth a manual check. |
| **not listed** | The address is not on their list. The landlord may still accept another guarantor, so it is worth asking. |
| **not verified** | The check did not complete. The badge opens the official search instead. |

Colour sits on the dot and the state word only, never on the background. Twenty listings deep,
a results page still reads like a results page.

## One click tells you why

Clicking a badge opens the reasoning behind the verdict: the address read from the listing, the
query actually sent, what came back, how the two were compared, and the source. Two buttons let
you copy the address and open the guarantor's own search with it.

No verdict is shown without its evidence. When a match is uncertain, the badge says
*to confirm* rather than guessing green. Street numbers anchor every comparison, so a different
building on the same street will not pass as a match.

## How the check runs

Insurent publishes the buildings it certifies, and TheGuarantors publishes the buildings it
covers in New York and New Jersey. Both lists exist so that tenants can find them. This
extension reads them, nothing more.

- Only listings that actually scroll into view are checked. Nothing runs off screen, and there
  is no bulk crawling.
- Addresses are normalised before comparison: `Street` becomes `St`, `East` becomes `E`,
  `45th` becomes `45`.
- Verdicts are cached for 24 hours so the same building is never checked twice, and
  TheGuarantors' list is downloaded at most once a day.

## What it does not do

It does not contact agents, fill in forms, or click anything on your behalf. It does not rank,
score, or hide listings. It adds two badges and explains them.

It is also **not an approval**. Coverage lists change, and each guarantor still has its own
income and eligibility requirements. Always confirm with the landlord or the broker before
committing, and treat the guarantors' own sites as the authority.

## Privacy

No account, no sign-up, no analytics, no server of ours. Nothing about you is collected.

The only thing that leaves your browser is a building address, sent to the guarantor's own
public search. It is the same request you would make by typing that address into their website
yourself. Full details in [PRIVACY.md](PRIVACY.md).

## Install

From the Chrome Web Store: *(link to be added once published)*

To run it from source:

1. Download or clone this repository.
2. Open `chrome://extensions` and turn on **Developer mode**.
3. Click **Load unpacked** and select the project folder.
4. Open a rental listing on streeteasy.com. The badges appear on each listing.

No configuration is needed.

## Languages

English (default), French, Spanish, Portuguese (Brazil) and Simplified Chinese. The interface
follows your browser language and falls back to English. Everything goes through `chrome.i18n`
and [`_locales/`](_locales/); to add a language, copy `_locales/en/messages.json` to
`_locales/<code>/messages.json`, translate the `message` values without touching the keys or
the `$PLACEHOLDERS$`, then run `node test/test-pages.js <code>`.

## Known limits

- **Address detection is heuristic.** If a badge is missing or lands on the wrong address, open
  an issue with the listing URL.
- **Coverage lists change.** A green badge is a strong signal, not a guarantee.
- **TheGuarantors' list covers New York and New Jersey only.** Outside that, check by hand.
- **StreetEasy re-renders its pages after load.** The extension waits for the load to finish and
  re-attaches its badges if they are wiped, but a layout change on their side can still break
  detection until the selectors are updated.

## Development

```bash
node test/test-badges.js        # badges on a results page, plus the popover
node test/test-badges.js fr     # ... in any language from _locales/
node test/test-pages.js         # popup labels: nothing left untranslated
node test/test-pages.js zh_CN

node brand/build.mjs            # regenerate icons/ and store/ from brand/src/
node pack.mjs                   # build the Chrome Web Store zip
```

The repository also contains dormant code from a tour-request feature that was removed in
v0.14.0 (`tour.js`, `options.html`, `options.js`). It is **not declared in the manifest, not
injected, and not included in the packaged zip**. See [DEVELOPMENT.md](DEVELOPMENT.md).

## License

[MIT](LICENSE).
