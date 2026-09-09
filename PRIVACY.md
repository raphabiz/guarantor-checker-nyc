# Privacy Policy

**Guarantor Checker for NYC Rentals**
Last updated: 9 September 2026

## In one paragraph

This extension has no account, no sign-up, no analytics and no server of its own. It does not
collect, store or transmit any personal data. The only thing it sends out is a building address
from the listing you are looking at, to the guarantor whose coverage it is checking.

## What is stored on your device

The extension uses `chrome.storage.local`, which stays in your browser, for exactly one thing:

| Key | Content | Kept for |
| --- | --- | --- |
| `tg_list`, `tg_fetched_at` | A cached copy of TheGuarantors' public list of covered buildings in New York and New Jersey, plus the time it was downloaded | 24 hours, then refreshed |

That is public reference data, not data about you. Nothing else is written to storage.

Insurent verdicts and the Insurent search token are kept **in memory only**, inside the
extension's service worker, for at most 24 hours and 6 hours respectively. They disappear when
the browser shuts the service worker down.

Uninstalling the extension removes all of it.

## What is sent, and to whom

To answer the question on a listing, the extension sends the **building address shown on that
listing** to:

- **Insurent** (`insurent.com`), to the same public certified-building search that powers the
  address field on their own website.
- **TheGuarantors** (`theguarantors.com`), to the public list of buildings they cover.

Only an address is sent. The extension attaches no name, no email address, no account
identifier and no browsing history, and it makes these requests without cookies or credentials
(`credentials: "omit"`), so you are not identified to either company by the extension.

A request is made only for listings that actually scroll into view, and results are cached as
described above so the same building is never checked twice.

Once a request reaches Insurent or TheGuarantors, it is handled under their own privacy
policies, which this project does not control:

- Insurent / MRI Software: https://www.insurent.com/privacy-policy/
- TheGuarantors: https://www.theguarantors.com/privacy-policy

If you would rather not send anything to them, uninstall the extension and use their search
pages directly.

## What the extension never does

- No analytics, telemetry, crash reporting or advertising.
- No tracking across sites, no profiling, no fingerprinting.
- No selling, renting or sharing of data with anyone. There is nothing to sell.
- No remote code: everything that runs ships inside the extension package.
- No reading, filling or submitting of any form on the pages you visit.

## Permissions, and why each one exists

| Permission | Why |
| --- | --- |
| `storage` | To keep the 24-hour cached copy of TheGuarantors' public building list, so it is not downloaded again on every page. |
| `streeteasy.com` | To read the address printed on a listing and add the badge next to it. This is the only site the extension modifies. |
| `insurent.com` | To run the Insurent check, and to read the public token their own search page uses. |
| `theguarantors.com` | To download the public list of buildings TheGuarantors covers. |

The extension requests no other permission. It does not use `tabs`, `history`, `cookies`,
`webRequest` or `<all_urls>`.

## Children

The extension is not directed at children under 13, and it collects no data from anyone, of any
age.

## Changes to this policy

Any change is published in this file, in the public repository, with the date above updated. A
change that affects what is sent or stored will also be described in the release notes.

## Contact

Questions, or something in here that does not match what you observe: open an issue on the
repository, or write to `raph@monepok.com`.
