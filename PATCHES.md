# PATCHES.md — What This Fork Changes, and Why

This repository is a fork of `https://github.com/ury-erp/ury`
(AGPL-3.0), maintained privately to carry a small, deliberately minimal
patch set on top of a pinned upstream commit. It exists only because URY
POS is a compiled React application with no runtime configuration point
for the three things listed below — everything else about this project's
customizations lives in the separate `erp_restaurant` Frappe app instead,
as ordinary hooks, and does not touch this repo at all. See
`erp_restaurant`'s `URY_FORK_MAINTENANCE.md` for the full picture of how
the two repos relate.

If you're reading this because a merge conflict came up during an
upstream update, the goal of each patch below is described in plain terms
so you can resolve the conflict by intent, not by guessing at the diff.

## License

This fork is licensed AGPL-3.0, identical to upstream. All modifications
in this repository are covered by that license. The network-use
disclosure obligations that come with deploying a modified AGPL work have
been reviewed and the compliance approach is handled outside this
document.

## Base commit

- Upstream: `https://github.com/ury-erp/ury`, branch `develop`
- Pinned at: `71b59edac14ea4c7ce4a108b4ea1bdf714803fb5` (`71b59ed`),
  2026-09-08
- Do not advance this pin without following the update procedure in
  `erp_restaurant`'s `URY_FORK_MAINTENANCE.md`.

## Patch set

Each patch should exist as its own commit (or its own `git format-patch`
file under `patches/`, naming convention `NN-short-description.patch`),
kept as small as possible so it's easy to reapply and easy to reason
about in isolation.

### Patch 01 — Branding replacement

Files touched:
- `pos/public/ury.ico`
- `pos/public/ury_pos.png`
- `pos/index.html` (the `<title>URY POS</title>` line)
- `pos/src/components/HufLogo.tsx` (or its usage site)
- `pos/src/pages/Dashboard.tsx` (where `HufLogo` is rendered)

What it does: replaces the favicon and POS icon assets, the browser tab
title, and removes or replaces the small branding SVG rendered on the
Dashboard page.

Why it can't be done upstream-agnostic: these are static assets and
hardcoded markup, not read from any Frappe setting or config file at
runtime.

Risk profile: low. These files change rarely upstream. A conflict here
usually means upstream changed their own branding, in which case just
reapply the same replacement logic against the new files.

### Patch 02 — French and Arabic locale content

Files touched:
- `pos/src/i18n/locales/en.json`
- `pos/src/i18n/locales/fr.json`
- `pos/src/i18n/locales/ar.json`
- `pos/src/pages/Dashboard.tsx`
- `pos/src/components/POSOpeningProvider.tsx`
- `pos/src/pages/Orders.tsx`
- `pos/src/pages/POS.tsx`
- `pos/src/pages/Settings.tsx`
- `pos/src/pages/Table.tsx`
- `frontend/src/i18n.ts`
- `frontend/src/main.tsx`

### Patch 03 — Management frontend translation, dashboard loop fix

Files touched:
- `frontend/src/i18n.ts`
- `frontend/src/main.tsx`
- `frontend/src/App.tsx (SetupGuard component)`

What it does: routes Dashboard, management frontend, and POS page user-facing text, including
the previous-day session warning, through the existing translation function
and fills in missing or incorrect English, French, and Arabic translation
keys. Does **not** change `pos/src/i18n/index.ts`,
`loader.ts`, `config.ts`, or `resolve-language.ts` — the loading mechanism
itself is untouched, because it already works correctly: language is
resolved from `frappe.boot.lang`, loaded via dynamic import, and falls back
gracefully to English on a missing key.

Why it can't be done upstream-agnostic: locale JSON is loaded via a
relative dynamic `import()` at build time (see `pos/src/i18n/loader.ts`),
and Dashboard literals must be replaced in the compiled React source; there
is no external or runtime-fetchable locale source to point elsewhere.

Risk profile: medium. This is mostly content with a small Dashboard
rendering change. Every upstream update can add new keys to `en.json` or
new hardcoded Dashboard text. On every update, compare the catalogs and
audit Dashboard for new literals before rebuilding. Missing keys will not
break anything (they fall back to English), but untranslated user-facing
text should not silently accumulate.

### Patch 03 — Default customer from POS Profile

Files touched:
- `pos/src/store/pos-store.ts`
- `pos/src/components/OrderPanel.tsx`
- `pos/src/components/CustomerPicker.tsx`
- `pos/src/components/CustomerSelect.tsx`

What it does: initializes the POS customer state from
`posProfile.customer` when a new order starts, instead of leaving it
empty and blocking submission until the cashier manually picks one. The
cashier must still be able to override it. An explicitly selected
customer must never be silently replaced by the default. An order being
edited must preserve its existing customer, not reset to the default.
Aggregator orders must not receive the auto-selected default. When no
default customer is configured on the POS Profile, behavior falls back
to the current manual-selection flow unchanged.

Why it can't be done upstream-agnostic: this is client-side React state
initialization and validation logic, not configuration.

Risk profile: high. This is the one patch touching real application
logic in files that are part of URY's actively developed, pre-stable
core. Expect this patch to require manual reconciliation, not a clean
reapply, on a meaningful fraction of upstream updates. If `pos-store.ts`
or `OrderPanel.tsx` change substantially upstream, budget real review
time here, don't assume a clean `git apply` means the logic still behaves
correctly — retest the specific acceptance criteria above (default
applied, override respected, edit-preserves-customer, aggregator
excluded, no-default-configured fallback) after every reapply.

### Patch 04 — Hardcoded currency symbol replaced with Frappe currency label
 
Files touched:
- frontend/src/pages/Dashboard/MenuPage.tsx
- frontend/src/pages/Dashboard/QuickActions.tsx
What it does: replaces a hardcoded "₹" in two form labels (Standard
Rate and Price fields) with the site's actual configured currency,
read from `frappe.boot.sysdefaults.currency`, the same global already
used elsewhere in this fork for language detection.
 
Why it can't be done upstream-agnostic: the currency symbol was typed
directly into JSX label text, not read from any config at render time.
 
Commit: dfd562a530af626ef65d3a99bbf3998f2e778bf5
 
Risk profile: low, static label text, unlikely to conflict on future
upstream updates.
 
KNOWN GAP, not covered by this patch: `frontend/src/utils/format.ts`'s
`formatCurrency()` function still falls back to a hardcoded "₹" when
`storage.getItem('currencySymbol')` returns nothing, and nothing found
so far writes that key. This function is called from 18 files across
the reports pages and the Dashboard KPI grid, meaning every formatted
monetary amount in those views may still be showing the wrong currency
symbol regardless of this patch. The same function also hardcodes
`toLocaleString('en-IN')` number grouping. Needs its own patch, tracked
separately, before the currency ticket can be considered actually done
end to end, not just the two labels this commit addressed.


## Build and deploy

`pos/vite.config.ts` builds directly into `ury/public/pos` inside this
same repo. There is no separate output directory to manage — building
`pos` from this patched tree, and deploying this repo's `ury/public/pos`
output, is what puts the patches live. See
`erp_restaurant`'s `URY_FORK_MAINTENANCE.md` for the full deployment
sequence, including the gotcha where a plain `bench build` against a
freshly updated, unpatched `ury` checkout will silently overwrite this
output.

## Update checklist (short form)

1. Fetch new upstream `develop` commits.
2. Diff against the currently pinned commit, scoped to the files listed
   under each patch above.
3. Reapply patches 01, 02, 03 in order against the new base.
4. For patch 02 specifically: check `en.json` for new keys and translate
   them into `fr.json` and `ar.json`.
5. For patch 03 specifically: manually re-verify all five acceptance
   criteria listed above, not just that the diff applied cleanly.
6. Rebuild `pos`, confirm output at `ury/public/pos`.
7. Update the pinned commit hash and date at the top of this file.
8. Update the same information in `erp_restaurant`'s
   `URY_FORK_MAINTENANCE.md` so the two repos stay in sync.

## Explicit non-goals

This fork is not a general-purpose customization surface. Anything that
can be implemented as a Frappe hook, custom field, or server-side API in
`erp_restaurant` belongs there, not here. Keeping this patch set to
exactly these three items is a deliberate choice to minimize what has to
survive every URY update — resist the urge to add a fourth patch here
without first confirming it truly can't be done from `erp_restaurant`
instead.