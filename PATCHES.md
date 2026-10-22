# PATCHES.md — What This Fork Changes, and Why

This repository is a fork of `https://github.com/ury-erp/ury`
(AGPL-3.0), maintained privately to carry a small, deliberately minimal
patch set on top of a pinned upstream commit. It exists only because URY
POS is a compiled React application with no runtime configuration point
for the things listed below — everything else about this project's
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

Patches containing binary files (currently Patch 01) must be generated
with `git diff --binary`, not a plain `git diff`, otherwise the images
are not included. Use `make-patch.sh` for this.

### Patch 01 — Branding replacement

Files touched:
- `pos/public/ury.ico`
- `pos/public/ury_pos.png`
- `pos/index.html` (the `<title>URY POS</title>` line)
- `pos/src/components/HufLogo.tsx` (or its usage site)
- `pos/src/pages/Dashboard.tsx` (where `HufLogo` is rendered)
- `pos/src/components/Header.tsx` (the header logo image)
- `frontend/Public/URY-bg.png`
- `frontend/Public/photo_2026-08-19_13-24-09.jpg`
- `mosaic/src/assets/logos/mosaic.jpg`
- `frontend/src/pages/Dashboard/KPIGrid.tsx` (the `URY POS` and
  `URY MOSAIC` link card labels)

What it does: replaces the favicon and POS icon assets, the browser tab
title, and removes or replaces the small branding SVG rendered on the
Dashboard page. It also replaces the logo images used by the management
frontend and the Mosaic app, and shortens the two dashboard link card
labels to `POS` and `MOSAIC`. The POS header no longer renders the logo
image and shows the plain text "POS" instead, still linking to
`/dashboard`.

Image files are replaced in place, keeping the same filename and path,
so no import or reference needs to change. This keeps the diff against
upstream small. The filenames still contain "ury", which is only visible
in the repo, not in the UI.

Why it can't be done upstream-agnostic: these are static assets and
hardcoded markup, not read from any Frappe setting or config file at
runtime.

Risk profile: low to medium. Most of these files change rarely upstream.
`pos/src/components/Header.tsx` is an actively edited component, so a
conflict there means reapplying the same replacement by hand (replace
the logo `img` with the text "POS"). A conflict elsewhere usually means
upstream changed their own branding, in which case just reapply the
same replacement logic against the new files. For a conflict on an
image file, keep this fork's version.

Rebuild note: `pos`, `frontend` and `mosaic` are built separately, so
rebuild each one after applying this patch, then clear cache and
hard-refresh the browser.

Superseded 2026-10-19 for logos and favicons by Patch 15 (desk logo at
runtime); the image replacements here are no longer referenced by those
screens.

KNOWN GAP, not yet verified: other places that may still show URY
branding, such as the management frontend tab title, favicon, PWA
manifest name, print formats, and locale strings containing "URY". Check
these before treating the logo removal as complete.

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

2026-10-19 (ticket 15 test): `pos_opening.zero_balance_warning` shows
"0" instead of the rupee sign (en, fr, ar). Text only.
Since Patch 12 the warning is no longer shown.

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

### Patch 04 — Default customer from POS Profile

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

### Patch 05 — Hardcoded currency symbol replaced with Frappe currency label

Files touched:
- `frontend/src/pages/Dashboard/MenuPage.tsx`
- `frontend/src/pages/Dashboard/QuickActions.tsx`

What it does: replaces a hardcoded "₹" in two form labels (Standard
Rate and Price fields) with the site's actual configured currency,
read from `frappe.boot.sysdefaults.currency`, the same global already
used elsewhere in this fork for language detection.

Why it can't be done upstream-agnostic: the currency symbol was typed
directly into JSX label text, not read from any config at render time.

Commit: `dfd562a530af626ef65d3a99bbf3998f2e778bf5`

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

### Patch 06 — Carry the order's last modified time through draft tabs

Files touched:
- `pos/src/store/pos-store.ts` (`OrderTabState`, `openDraftOrderInNewTab`,
  `addTab`, `switchTab`, `closeTab`, `resetOrderState`)
- `pos/src/pages/Orders.tsx` (`handleEditOrder`)

What it does: an order reopened from the Orders page ("Edit") opens in a
draft tab, and that path never set `lastModifiedTime`, nor did tab
save/restore carry it. `OrderPanel.tsx` then sent the update without
`last_modified_time`, and `sync_order` in
`ury/ury/doctype/ury_order/ury_order.py` skipped its concurrency check
and fell into the "Table occupied: None is already occupied" branch for
any user without a billing role. The patch passes the POS Invoice's
`modified` value into the draft tab, stores it in each held tab, restores
it on tab switch/close, and clears it in the fresh-tab branches of
`resetOrderState` and `closeTab` (`addTab` already did). Previously
`resetOrderState` left the last submitted order's value in
place, which could make the next update fail with "Order has been
modified"). The field is optional on `OrderTabState` so tabs saved in
localStorage before this patch still load.

Why it can't be done in `erp_restaurant`: the value is missing from the
browser request. Relaxing the server check instead would remove the
concurrency protection, and `sync_order` is URY source.

Acceptance criteria (manual, on the server, as a cashier without a role
in the POS Profile's "Allowed roles for billing"):
1. Send a takeaway order, reopen it from Orders, add an item, send again:
   succeeds, and the new KOT holds only the added item.
2. Same for a dine-in order on a table.
3. With two draft tabs open, switch between them, then update each:
   both succeed.
4. A printed invoice still returns "Invoice Already Billed" for that
   cashier (intended lock, unchanged).
5. Patch 04 default customer still behaves as described above.
6. A second cashier still cannot overwrite a table occupied by another
   cashier's unpaid order (intended lock, unchanged).
7. Expected side effect: the draft path now runs the concurrency check
   for every user, billing users included. If the order changes
   elsewhere while its tab is held, the next send fails with "Order has
   been modified". Fix: close that tab and reopen the order from Orders.

Deploy note: draft tabs held in a browser before this patch have no
stored timestamp and will hit the old error once. After deploying, close
open draft tabs or log out (logout clears the saved tabs).

Commit: `5e0f06808b136f89933771de7555d40d7b6ff985`

Depends on Patch 04: the patch file's context lines include Patch 04's
`getDefaultCustomer` calls, so apply it after 04.

Risk profile: high. `pos-store.ts` is actively edited upstream; on a
conflict, re-add `lastModifiedTime` next to every `originalCartHash`
line in the tab save/restore blocks and to the draft object built in
`Orders.tsx`.

### Patch 07 — Payment dialog discount: send a percentage, add a fixed-amount mode

Bug fix plus feature (PRD 7.5, ticket 05): the fix is sending the percentage;
the amount field is the amount entry the PRD asks for.

Files touched:
- `pos/src/components/PaymentDialog.tsx`
- `pos/src/pages/Orders.tsx` (passes `allowDiscount={!isMergedBill(...)}`)
- `pos/src/i18n/locales/en.json`, `fr.json`, `ar.json` (keys
  `payment.discount_amount_placeholder`, `errors.discount_exceeds_total`)

What it does: upstream, the dialog took a percentage, converted it to an
amount for display, and sent that amount as `additionalDiscount` to
`ury.ury.doctype.ury_order.ury_order.make_invoice`, which applies it as
`additional_discount_percentage`. Seen live on 2026-10-15: a 250 MAD pizza
with 10% was collected at 225, but the POS Invoice got 25% off (187.5). The
patch keeps the displayed amount and sends the percentage instead. It also
adds an amount field under the percentage field: the cashier types either a
percentage or a MAD amount (at most the order total), applying one fills the
other with the equivalent, and the dialog always sends the percentage
(amount / total x 100, full precision), so make_invoice stays unchanged.
The discount section is hidden on merged bills: make_invoice applies the
percentage to the primary invoice only, while the dialog's total is the
combined one (already wrong upstream in percentage mode). The legacy Vue
client (`urypos/src/stores/recentOrder.js`) also sends a percentage, which
confirms what make_invoice expects.

Why it can't be done in `erp_restaurant`: the wrong value is computed and sent
by the browser. The server cannot tell an amount from a percentage in that
parameter. The cashier discount cap is enforced server-side in
`erp_restaurant` (`pos_invoice_discount.py`, POS Profile field
`custom_max_cashier_discount`), not here.

Preconditions: POS Profile "Enable Discount" on and "Apply Additional
Discount On" = Grand Total (ERPNext default). With Net Total and exclusive
taxes, the saved discount_amount is the typed amount divided by (1 + tax).

Acceptance criteria:
1. 250 MAD order, 10%: dialog shows 225, POS Invoice has
   additional_discount_percentage 10 and grand total 225.
2. Same order, 5 in the amount field: the percentage field shows 2, dialog
   shows 245, POS Invoice grand total 245 (discount amount 5).
3. Amount above the order total is refused in the dialog
   ("Discount cannot exceed the order total").
4. Merged bill: no discount section in the dialog.
5. Non-whole total, 15% of 33 MAD: dialog asks 29 (it rounds up when a
   discount applies, upstream behavior); record rounded_total, paid_amount
   and change_amount (up to 1 MAD of change is expected).
6. French and Arabic placeholders show; the two rows are labelled "%" and
   the currency symbol.

Manual test (cashier login, then manager login, POS Profile cap from
`erp_restaurant` set to 10%):
1. Cashier: 250 MAD order, 10%, pay 225. Desk: POS Invoice fields
   additional_discount_percentage, discount_amount, grand_total,
   rounded_total, paid_amount, change_amount.
2. Cashier: 250 MAD order, 5 in the amount field, pay 245. Same fields.
3. Cashier: 250 MAD order, 15%: payment refused with "Discount limit".
4. Manager: same order, 15%: accepted, grand total 212.5.
5. Cashier: 33 MAD order, 15%: as in criterion 5.
6. Merged bill: open its payment dialog, no discount section.

Depends on `erp_restaurant` commit with `pos_invoice_discount.py` for the cap
(steps 3 and 4).

Commit: `ea5b7449be9331e02e8c139d2378f4b3a92f7d61`

Risk profile: medium. PaymentDialog.tsx is a self-contained component but
actively edited upstream. On a conflict, keep: the amount field and
`handleApplyDiscountAmount`, `appliedPercent`, and
`additionalDiscount: appliedPercent`.

### Patch 08 — Takeaway order opens in Orders, already selected

Feature (PRD 7.6, ticket 06).

Files touched:
- `pos/src/components/OrderPanel.tsx`

What it does: upstream, confirming an order on the POS page clears the cart
and stays there; to take payment the cashier opens Orders, finds the order,
prints it and opens Payment. After this patch, when the order type is
Take Away and `sync_order` succeeds (new order or update of an existing
takeaway draft), the POS clears the Orders search, switches the status tab
to Draft (newest first), selects the saved POS Invoice and navigates to
`/orders`. The cashier then prints and pays there as before. Dine In,
Delivery, Phone In and Aggregators are unchanged. No new strings.

Why it can't be done in `erp_restaurant`: it is what the POS React app does
after a click (route and selected order are browser state). There is no
server hook or POS Profile setting that changes it. `sync_order` already
returns the saved invoice, so no backend change is needed.

Acceptance criteria:
1. New Take Away order, confirm: the POS shows Orders, tab Draft, with the
   new order selected (its items and total on the right). No search, no click.
2. Print, then Payment, pay: invoice paid as before (Patch 07 discount still works).
3. Dine In order, confirm: stays on the POS page as before.
4. A search typed earlier in Orders does not hide the new order.
5. Reopen a takeaway draft from Orders, edit, confirm: back in Orders with it selected.
6. 10 takeaway orders in a row: confirm to Orders screen in under 2 seconds
   each (record the times).

Manual test (cashier login, POS shift open):
1. Take Away, 1 x Test Cheeseburger, confirm: Orders, Draft tab, order selected.
2. Print, Payment, pay: POS Invoice paid, Recently Paid shows it.
3. Dine In order on a free table, confirm: stays on POS. Cancel it after.
4. In Orders, type a search, go back to POS, new Take Away order: it is selected.
5. Reopen a takeaway draft, add an item, confirm: Orders with it selected.
6. Ten takeaway orders in a row, time each; cancel the test invoices after.
7. Same flow in French and Arabic (RTL), no new strings expected.

Commit: `d3640cb1f7c7ff67f478213ded27f302adfde24c`

Risk profile: medium. OrderPanel.tsx is a high-risk file (actively edited
upstream, also changed by Patch 04), but this patch only adds a block after
the success toast in `handleSubmit`, two imports and `useNavigate`. On a
conflict, keep that block as is.

### Patch 09 — Payment dialog rounding follows the POS Profile (0.5 up or exact)

Bug fix plus feature (ticket 05, owner decision 2026-10-15).

Files touched:
- `pos/src/components/PaymentDialog.tsx`

What it does: upstream, the dialog rounds the amount to collect up to the
next whole MAD when a discount applies and to the nearest MAD otherwise,
while ERPNext rounds the saved invoice its own way (halves to even). Live
2026-10-15: 212.5 collected as 213, invoice rounded total 212, change 1.00
recorded but never given (ACC-PSINV-2026-00042, -00048). After this patch
the dialog reads the POS Profile checkbox `custom_round_to_half` through
`erp_restaurant.erp_restaurant.pos_rounding.get_pos_rounding`: on, the total
rounds up to the next 0.5 (324.28 -> 324.5); off, the exact total is asked.
The server applies the same rule in the POS Invoice class
(`erp_restaurant` `pos_rounding.py`, `override_doctype_class`), so the
amount asked equals the saved rounded total. A percentage discount is
rounded to whole cents before it is subtracted, as ERPNext does. The Pay
button waits for the setting. Merged bills keep upstream rounding on both
sides (dialog and server).
No new strings (the "Ajustement" line already exists).

Why it can't be done in `erp_restaurant`: the amount to collect and the
autofilled cash amount are computed in the browser. The server side of the
rule lives in `erp_restaurant`.

Acceptance criteria:
1. Checkbox off: 330 MAD order with 5.5 MAD discount asks 324.5, no
   Ajustement line; invoice grand total and rounded total 324.5, change 0.
2. Checkbox on: same order asks 324.5; a 250 MAD order with 15% asks 212.5
   (no Ajustement); 30 MAD with 2 MAD off (28) asks 28; 324.28 asks 324.5
   with "Ajustement +0.22". Invoice rounded total equals the amount asked,
   change 0 when paying exactly.
3. No discount, checkbox off: exact total asked; 30 MAD with 4.7% (28.59)
   asks 28.59 and is accepted (not refused as partial payment).
4. Merged bill: unchanged from upstream.
5. Split bill with a non-whole total: each part pays its asked total.
6. Return of a rounded invoice: refund equals the original rounded total.

Depends on `erp_restaurant` `pos_rounding.py` and the POS Profile field
`custom_round_to_half` (migrate). Without them the setting reads as off.

Commit: `45aaa51fd06e4ad746d07f372279bd1628cd6807`

Risk profile: medium. Same self-contained dialog as Patch 07. It relies on
`make_invoice` (merged-bill payment split) and `ury_pos_invoice.py` (split
bill payments) reading `rounded_total` after ERPNext's totals, which the
`erp_restaurant` class override keeps consistent. On a conflict, keep
`roundToHalf`, the `finalTotal` rule, the cents rounding of the percentage
discount and the Pay button wait.

### Patch 10 — Kitchen tickets printed from the POS through QZ Tray, printer choice

Feature (PRD 7.4, ticket 04).

Files touched:
- `packages/core/src/print/qz.ts` (`printWithQz` takes an optional printer name)
- `pos/src/lib/print.ts` (bill uses `custom_bill_printer`; new `printKitchenTickets`)
- `pos/src/lib/pos-profile-api.ts` (types for the erp_restaurant fields)
- `pos/src/components/OrderPanel.tsx` (auto print after a successful `sync_order`)
- `pos/src/components/OrderActionsMenu.tsx`, `pos/src/pages/Orders.tsx`
  ("Reprint kitchen ticket" action)
- `pos/src/i18n/locales/en.json`, `fr.json`, `ar.json` (`kitchen.*` keys)

What it does: URY creates URY KOTs in `sync_order` (`kot_execute`: new
items, added items, cancelled items) and prints them only from the server
(`print_by_server`), which a cloud server cannot do for a printer in the
restaurant (and failures are swallowed by `except: pass`). After this patch,
when POS Profile "Auto-print Kitchen Ticket" is on and QZ Print is on, the
POS asks `erp_restaurant.erp_restaurant.api.kitchen_print.get_kitchen_tickets`
for the order's unprinted KOTs rendered with the "Kitchen Ticket" format,
prints each through QZ Tray on "Kitchen Printer" (empty = the PC's default),
then calls `mark_kitchen_tickets_printed`. It runs in the background: the
cashier is not blocked, a failure shows a toast and leaves the KOT unprinted.
Orders gets "Reprint kitchen ticket" (all KOTs of the order, marked REPRINT on
paper). Bills printed through QZ now go to "Bill Printer" (empty = default).
`printWithQz` without a printer name behaves as upstream. The `qz.ts` change
lives in `@ury/core`, so it also reaches the management frontend (same
behavior there; rebuild both apps). `loadQzPrinter` now shares one pending
connect, because the background kitchen print and a bill print can start
together and QZ refuses a second connect while one is pending. A printer name
matches the first installed printer whose name contains it: enter the full
name.

Known gap: the captain (waiter) app (`pos/src/captain/pages/CaptainOrder.tsx`)
also calls `sync_order` and does not auto-print. Its KOTs stay unprinted and
print, late and labelled by their type, on the next cashier send of the same
order, or from Reprint. Fine for counter-only fast food; revisit if a client
uses waiter tablets.

Why it can't be done in `erp_restaurant`: only the browser on the cashier PC
can reach QZ Tray and the local printers. The fields, the print format, the
rendering and the printed state are in `erp_restaurant` (custom fields on POS
Profile and `URY KOT.custom_kitchen_printed_on`).

Preconditions: QZ Print and QZ Host set on the POS Profile, QZ Tray running
and trusting the site certificate on the cashier PC, URY KOT naming series and
a URY Production Unit configured (URY requires them to create KOTs), no
printer rows with "KOT print" on the Production Unit, Room or POS Profile
(URY would still try `print_by_server` and could print twice), and
`erp_restaurant` migrated (fields and "Kitchen Ticket" format). Every edit to
`kitchen_ticket.json` must bump its `modified` date, or migrate skips it.

Acceptance criteria:
1. Takeaway order with a note on one line, confirm: a kitchen ticket prints
   within a few seconds with order number, "Take Away", items, quantities,
   the note and the time.
2. Add an item to the order and confirm: one ticket "ADDED ITEMS" with only
   the new item.
3. Remove an item (as a user allowed to): a "CANCELLED" ticket for it.
4. Orders, Reprint kitchen ticket: every ticket of the order prints again,
   marked REPRINT.
5. Printer off or wrong name: a "Kitchen ticket not printed" toast, the order
   is still saved, Reprint prints it once the printer is back.
6. Auto-print off: nothing prints automatically; Reprint still works.
7. Bill print goes to "Bill Printer" when set.
8. French and Arabic: menu label and toasts; Arabic ticket right to left.
9. Bill print and kitchen auto print right after each other (takeaway: confirm,
   then Print at once in Orders): both print, no QZ connection error.

Commit: `a8489c4fcb58d1002a139de3e1496fd50f6ad8f8`

Risk profile: medium. Small additions in OrderPanel.tsx (high-risk file,
also changed by Patches 04 and 08) and Orders.tsx; the shared `qz.ts`
change is backward compatible. On a conflict, keep the Patch 10 block after
the Patch 08 `savedName` line, `printKitchenTickets` and the `printerName`
argument.

### Patch 11 — Close Shift accepts an all-zero shift with no activity

Bug fix (ticket 15, bug 3).

Files touched:
- `pos/src/components/POSClosingDialog.tsx`

What it does: upstream, the Close Shift dialog refuses any close whose
counted total is 0 ("Total closing amount can't be zero"), so a shift with
no opening cash and no sales can never be closed from the POS. The open
shift then blocks stock counts on its warehouse (`erp_restaurant`
stock_adjustments rule). After this patch the all-zero block applies only
when a row has an opening amount or expected sales; with every opening and
expected amount at 0, counting 0 everywhere is accepted. Every row must
still be entered (unchanged), and the confirmation step is unchanged.
No new strings.

Why it can't be done in `erp_restaurant`: the check exists only in the
browser dialog; the server already accepts an all-zero POS Closing Entry
(closing from the desk works). No server hook can lift a browser check.

Acceptance criteria:
1. Open a shift with 0 opening cash, make no sale, Close Shift, enter 0 in
   every row: the closing is created and submitted, no error.
2. Shift opened with 20 MAD and no sales, all rows 0: still refused with
   "Total closing amount can't be zero". Same for a shift with sales.
3. Normal close with amounts: unchanged.
4. A row left untouched: still refused (missing rows message).
5. French and Arabic: dialog unchanged, no new text.

Known limit: the dialog's expected amounts can show 0 when the device clock
is not on Casablanca time (see docs/feature-status.md); such a shift with
no opening cash could then be closed at 0. The server recomputes expected
amounts on save (`erp_restaurant` pos_closing_hooks), so the difference
still shows in the closing and the Daily Closing when there were sales.
Second case: the dialog reads opening amounts from the POS Opening Entry
(`balance_details`); a closing was once seen with opening 0 although the
opening had 20 (docs/feature-status.md). If the dialog ever reads 0 opening
cash for a shift with no sales, it now accepts a 0 close with no warning,
and the server does not recompute anything when there are no invoices.

Commit: `85f565f130f2a7932249274da98af7e199230164`

Risk profile: low. Two lines in the dialog validation memo. On a conflict,
keep the `hasActivity` condition on the all-zero block.

### Patch 12 — Open Shift with 0 opening cash on the first click

Change (ticket 15, owner request 2026-10-19).

Files touched:
- `pos/src/components/POSOpeningScreen.tsx`

What it does: upstream, opening a shift with 0 on every payment mode shows
a warning ("You're opening with 0 across all payment modes") and needs a
second tap on "Confirm & Open". Small fast-food shifts often start with no
cash float, so the warning is removed: the shift opens on the first tap.
The warning text and the alternative button label stay in the locales and
in the component (now never shown), so the diff stays small.
No new strings.

Why it can't be done in `erp_restaurant`: the warning is a browser-only
step in the opening screen; the server accepts a 0 opening.

Acceptance criteria:
1. Open Shift with 0 on every mode: the shift opens on the first tap, no
   warning.
2. Open Shift with an amount: unchanged.
3. French and Arabic: screen unchanged.

Commit: `c87750920be2ed13b4fb1b3d29519fdce21a8515`

Risk profile: low. One removed early return in `handleSubmit`. On a
conflict, drop upstream's zero-balance early return again.

### Patch 13 — Cleaner error toasts (no side notices, no URY wrapper duplicate)

Bug fix (owner request 2026-10-19, out-of-stock order).

Files touched:
- `packages/core/src/frappe/errors.ts` (`parseFrappeError`)

What it does: the POS toast joins every server message of a failed call.
Adding a meal whose ingredients are short showed three: an "Item Price
added" alert from ERPNext (rolled back anyway), ERPNext's stock error, and
URY's copy of it ("Error while updating order: <same error>", from
`sync_order`; `make_invoice` does the same with "Error while settling
order:"). After this patch the parser skips alert messages, strips those two
URY prefixes, and drops a message identical to one already kept. With
`erp_restaurant` `pos_stock_message.py` (short translated stock message),
the toast is one line: "Stock insuffisant pour Salad (manque Tomato,
Avocado). Modifiez la commande ou mettez à jour le stock."
Shared code, but only the POS calls `parseFrappeError` (OrderPanel,
PaymentDialog, Orders, POSOpeningScreen, POSOpeningProvider); the
management frontend does not. Rebuild pos. No new strings.

Why it can't be done in `erp_restaurant`: the messages are joined in the
browser. The backend alternative was wrapping URY's `sync_order` and
`make_invoice` endpoints to rewrite the message log, a larger and riskier
override of the two busiest POS calls. The message text itself is in
`erp_restaurant`.

Acceptance criteria:
Setup: POS Profile "Validate Stock on Save" on, a Test meal whose recipe
has an ingredient with 0 stock. The server text follows the cashier's User
language, not the POS language toggle.

1. Add that meal and send the order: one toast line naming the meal and the
   missing ingredients; no "Error while updating order", no "Item Price
   added".
2. Same order paid with "Validate Stock on Save" off: the payment is refused
   with the same one-line toast.
3. Another error (e.g. "Order has been modified" from a stale tab): its
   message shows once, without URY's prefix or side notices.
4. Cashier user in French, then Arabic: same single line, translated;
   Arabic right to left.

Commit: `fd1b039a610603cd64e45f18525f5f0044f5bfe4`

Risk profile: low. A few lines in the parser. Messages are deduplicated on
their text without the title (localized titles such as "رسالة" are not
filtered). On a conflict, keep the alert
skip, the prefix strip and the duplicate check.

### Patch 14 — Null check before the legacy POS quantity observer

Bug fix (ticket 15, bug 2; PRD known bug 2).

Files touched:
- `ury/public/js/restrict_qty_edit_pos.js`

What it does: URY loads this script on every desk page
(`app_include_js`). On POS Invoice onload, with POS Profile "Remove Items"
off, it attaches a MutationObserver to `.item-details-container`, which
exists only on the legacy point-of-sale page. On the desk POS Invoice form
the element is missing and `observe(null)` throws a TypeError in the
console. After this patch the script stops when the element is missing; the
legacy POS page behaves as before. Cosmetic, unrelated to save errors.

Why it can't be done in `erp_restaurant`: the script is URY's own desk
include; another app cannot remove or wrap it.

Acceptance criteria:
1. POS Profile "Remove Items" off: open a POS Invoice in the desk; no
   "parameter 1 is not of type 'Node'" error in the browser console.
2. Legacy point-of-sale page, if used: qty, UOM and warehouse locks on a
   printed table order behave as before.

Commit: `83acdddeeb5ed4db1aee8891b50054f07d16ae39`

Risk profile: low. Static desk JS served from the app's public folder; no
build step, clear-cache and a hard refresh. On a conflict, keep the null
check.

### Patch 15 — Desk logo everywhere (favicon and in-app logos)

Feature (backlog B3, owner request 2026-10-19). Replaces the image-file
approach of Patch 01 for logos and favicons.

Files touched:
- `pos/index.html`, `frontend/index.html`, `mosaic/index.html` (favicon and
  `window.app_logo_url`, both rendered by Jinja on the server),
  `self-order/index.html` (favicon only; customer QR ordering at /order)
- `ury/hooks.py` (`add_to_apps_screen` logo: the /apps tile and desk app
  switcher, via `erp_restaurant` `branding.desk_logo`, a redirect to the desk
  logo; backend change, restart)
- `pos/src/components/Header.tsx` (header logo, text "POS" when none; an
  addition at the owner's request: upstream at 71b59ed already showed the
  text "POS" with no image)
- `pos/src/pages/Dashboard.tsx` (desk logo instead of the HUF mark in
  "Shift brief"; `HufLogo.tsx` is now unused but kept)
- `frontend/src/components/layout/Header.tsx`,
  `frontend/src/components/setup/WizardLayout.tsx`,
  `frontend/src/pages/Dashboard/KPIGrid.tsx` (management app logos)
- `mosaic/src/components/Header.vue` (kitchen screen logo)

What it does: the site's desk logo (Website Settings "App Logo", else Navbar
Settings "Application Logo", else the app_logo_url hooks, Frappe's logo on
this site) becomes the favicon and the logo of the POS,
the management app (/ury) and the kitchen screen (/mosaic). The HTML entry
files are Frappe www templates: `{{ favicon }}` and `{{ app_logo_url }}` come
from `erp_restaurant` `branding.py` (`update_website_context` hook), which
also sets the desk splash image. Changing the desk logo changes every page;
no image file is edited. Vite keeps the Jinja tags unchanged in the build.
The images replaced by Patch 01 (`ury_pos.png`, `photo_2026-08-19_...jpg`,
`mosaic.jpg`, `URY-bg.png`) are no longer referenced by these screens.
No new strings.

Why it can't be done in `erp_restaurant`: the favicons are hardcoded in the
URY HTML entries and the logos are imported image files in the React and
Vue sources. The logo value itself comes from `erp_restaurant`.

Depends on `erp_restaurant` `branding.py` and its hook. Without it,
`{{ favicon }}` falls back to Frappe's icon or Website Settings, and
`window.app_logo_url` is empty (POS header shows "POS", other logos empty).

Acceptance criteria:
1. Desk logo set (Navbar Settings or Website Settings, public file): the
   desk tab icon, the desk loading splash, /login, /pos, /ury, /mosaic and
   /admin tab icons show the desk logo.
2. /pos header and dashboard "Shift brief" show the desk logo; no HUF mark.
3. /ury header, setup wizard header and the POS / MOSAIC link cards show the
   desk logo.
4. /mosaic header shows the desk logo.
5. Change the desk logo, clear cache, hard-refresh: every page follows.
6. Arabic: POS header logo in place in right-to-left.
7. /apps (and the desk app switcher): the URY tile shows the desk logo.
8. /order (if used): tab icon is the desk logo.
Manual test steps: `../tasks/backlog-replace-logo.md`.

Not covered (text, not logos): tab titles "URY POS" (pos) and "URY"
(frontend), the /apps tile title "URY" and `app_icon_title`, the legacy
/urypos page favicon (legacy app, not built here), print formats and locale
strings containing "URY".

Build: pos, frontend, mosaic and self-order must each be rebuilt (`yarn
build` at the repo root builds all). `ury/www/mosaic.html` and
`ury/www/order.html` are generated by those builds, so /mosaic and /order
change only once rebuilt. The server deploy rebuilds what `POS_BUILD_CMD`
in deploy.conf runs (Unknown whether it includes frontend, mosaic and
self-order). Mosaic and self-order were not built locally (no
node_modules). /mosaic has no page module, so Frappe may cache its HTML:
clear-cache after a logo change.

Commit: `4e385ef00929c9d2cddb83f0a00e11c6d126f5a5`

Risk profile: low to medium. `pos/src/components/Header.tsx` is a
conflict-prone file; on a conflict, keep the conditional logo block. HTML
entry conflicts: keep the two Jinja lines.

### Patch 16 — Money icon and site currency instead of the rupee

Bug fix (backlog B4, owner request 2026-10-19). Completes Patch 05.

Files touched:
- 13 management report pages under `frontend/src/pages/Reports/` and
  `frontend/src/pages/Reports/reportsRegistry.ts` (lucide `IndianRupee` ->
  `Banknote`)
- `frontend/src/utils/format.ts`, `packages/core/src/format.ts`
  (`formatCurrency`, `formatCompactCurrency`)
- `ury/ury/doctype/ury_order/ury_order.js` (desk URY Order menu card)

What it does: the report stat cards and the "Daily P&L" menu entry show a
banknote icon instead of the rupee icon. The currency formatters fell back
to "₹" when the browser had no cached `currencySymbol` (the POS caches it;
the management app at /ury often opens without it); they now fall back to
the site's default currency (`frappe.boot.sysdefaults.currency`, e.g. MAD),
or nothing. Amounts no longer use Indian digit grouping (`en-IN`,
1,00,000) but the browser's locale. The desk URY Order item cards show the
site currency instead of "₹". No new strings.

Why it can't be done in `erp_restaurant`: icons and the fallback symbol are
hardcoded in the URY frontend sources and a URY doctype script.

Acceptance criteria:
1. /ury Reports: no rupee icon on any report card or in the reports menu;
   a banknote icon instead.
2. /ury in a fresh browser (no POS opened): amounts show the site currency
   (MAD), not "₹", with normal grouping (100,000 or 100 000).
3. /pos amounts unchanged (currency from the POS store).
4. Desk URY Order form item cards: "MAD <rate>".

Not covered: `formatCompactCurrency` still uses Indian units (L for lakh,
Cr for crore) on chart axes; a code comment in
`ury/ury/report_api/sales.py` mentions ₹ (not shown).

Build: frontend and pos (shared format.ts). The server deploy builds pos
only; run `yarn build` in apps/ury for frontend. The desk JS needs no build
(restart / clear-cache).

Commit: `1194e3d5c2a62c5f6c42c0f80855378f38f6da9a`

Risk profile: low. Identifier swap and fallback values. On a conflict, keep
`Banknote` and the `sysdefaults.currency` fallback.

### Patch 17 — No hardcoded English in the POS and waiter screens

Bug fix (backlog B1, owner request 2026-10-19).

Files touched:
- `pos/src/captain/components/CaptainActionsMenu.tsx`, `CaptainMenu.tsx`,
  `CaptainOrderLine.tsx`, `CaptainRouteGuard.tsx`,
  `pos/src/captain/pages/CaptainOrder.tsx`, `CaptainTables.tsx` (waiter app)
- `pos/src/components/AuthGuard.tsx`, `LayoutView.tsx`, `OrderTabs.tsx`,
  `pos/src/pages/Dashboard.tsx`, `Orders.tsx`, `Table.tsx`
- `pos/src/lib/customer-api.ts`, `invoice-api.ts`, `print.ts` (error texts
  shown in toasts)
- `pos/src/i18n/locales/en.json`, `fr.json`, `ar.json` (58 new keys in
  `common`, `captain`, `errors`, `tables`, `auth`, `orders`, `kitchen`;
  existing keys reused where the text already existed; French calls the
  waiter "capitaine", as the existing keys do)

What it does: about 85 user-facing texts were written in English in the
source (toasts, titles, tooltips, empty states, error messages from the API
helpers), so they stayed English in French and Arabic. They now go through
`t()` with en/fr/ar entries (including loading spinners, empty states,
"Refresh", "Back to tables"). Developer-only messages (socket setup) stay
English. The audit found no missing keys in the existing locale files.
Known remainder: English fallback error strings in `pos/src/store/pos-store.ts`
and `store/slices/orders-slice.ts` (shown only when the server sends no
message), left to keep this patch out of those high-risk files.

Why it can't be done in `erp_restaurant`: the texts are compiled into the
POS bundle; there is no runtime override point for them.

Acceptance criteria:
1. POS in French and in Arabic: Tables page print toasts, order tabs and zoom
   tooltips, Orders action labels, access/permission screens show the
   language, no English.
2. Waiter app (/pos captain screens) in French and Arabic: titles, toasts,
   "Pax", "Total", search placeholder, empty states translated.
3. English unchanged.

Commit: `bc2e2888d1f798acfdb0b7d125b16fbe3342ebba`

Risk profile: medium. Many small edits across files that upstream edits
(CaptainOrder, Orders); on a conflict, keep the `t('...')` calls and the
keys. JSON files keep their indentation (2 spaces en/fr, 4 spaces ar).

### Patch 18 — URY server messages translatable

Bug fix (backlog B1, owner request 2026-10-19).

Files touched: 20 backend files under `ury/` (`ury_pos/api.py`,
`ury/doctype/ury_order/ury_order.py`, `ury/hooks/*`, `ury/api/*`,
`ury/report_api/*`, `ury/doctype/sub_pos_closing`, `ury_daily_p_and_l`);
`setup/demo.py` and tests untouched.

What it does: 69 `frappe.throw` / `frappe.msgprint` messages (plus two
`title=` values and the "Removed items / Modified quantities" details of the
printed-invoice check) were plain or
f-strings, so Frappe could not translate them. They are wrapped in `_()`:
`f"Table {x} is occupied"` becomes `_("Table {0} is occupied").format(x)`,
`"..." % x` and `"..." + x` likewise; `from frappe import _` added where
missing. Done by an AST rewrite, every file compiled. The two wrappers
"Error while updating order: {e}" and "Error while settling order: {e}" stay
English on purpose: Patch 13 strips exactly that prefix in the POS toast.
URY ships no translations; the fr/ar texts for all 179 URY server messages
(these and the ones already wrapped) live in `erp_restaurant`
`translations/fr.csv` and `ar.csv` (Frappe merges every app's translations),
so this patch must be deployed with that erp_restaurant commit. Frappe's
`_()` strips the message before the lookup, so csv keys are stored stripped.
Side effect: generic texts there ("Not permitted", "Setup failed"...) also
replace ERPNext's own fr/ar wording for the same English text.

Why it can't be done in `erp_restaurant`: a message not passed through `_()`
cannot be translated by any app; the translations themselves are in
`erp_restaurant`.

Acceptance criteria:
1. Cashier user in French: a dine-in order on a table that already has an
   unpaid order -> "La table X a déjà une facture en cours"; paying a table
   order before printing -> "L'impression de l'addition est obligatoire...".
2. Same in Arabic.
3. "Error while updating order:" prefix still removed by the POS toast.

Commit: `da8ff0faa344323c4d919524599c32b4348334d8`

Risk profile: medium. One-line changes spread over ury_order.py and api.py,
which upstream edits often; on a conflict, re-wrap the message in `_()`.
Backend only: restart, no build; translations need a clear-cache.

### Patch 19 — Payment amount replaced on typing, no unfinished Shift Brief

Bug fix (browser audit 2026-10-19, findings 6, 16 and 30).

Files touched:
- `pos/src/components/PaymentDialog.tsx`
- `pos/src/pages/Dashboard.tsx`

What it does: clicking an empty payment field prefills the remaining amount
(upstream); the cursor sat after it, so typing the tendered cash 100 gave
68100 and a change of 68 032. The prefilled amount is now selected, so typing
replaces it. The success toast shows the order total instead of the cash
tendered. The POS dashboard no longer shows the "Shift Brief" panel ("AI-written
shift summaries are not yet connected... HUF's shift observations"), an
unfinished upstream feature naming another product; the desk logo Patch 15
put in that panel goes with it. No new strings.

Why it can't be done in `erp_restaurant`: input behaviour and the panel are
in the POS bundle.

Acceptance criteria:
1. Payment of a 68 order: click Cash, type 100: field shows 100, change 32.
2. Toast after payment shows 68, not 100.
3. POS dashboard: no Shift Brief panel; notifications panel unchanged.

Risk profile: low. On a conflict in Dashboard.tsx keep the panel removed; in
PaymentDialog.tsx keep the `select()` in the payment input's onFocus.

### Patch 20 — /ury translations on whole words only

Bug fix (browser audit 2026-10-19, finding 11).

Files touched: `frontend/src/i18n.ts`

What it does: the management app (/ury) translates the page text with a
dictionary. When a text was not a key, every key found anywhere inside it was
replaced, inside words too: "Total" became "Autal" (To -> Au), "Cancelled"
became "Annulerled", "Tables" became "الطاولةS". Keys are now replaced only as
whole words (Unicode letters and digits around them block a match), with one
precompiled pattern per language. Added fr/ar for the labels the audit found
in English (dashboard cards, Live POS Transactions, statuses, report columns,
Users form). Many report labels remain English (not in the dictionary): they
stay English rather than half-translated.

Why it can't be done in `erp_restaurant`: the dictionary and the translation
code are compiled into the /ury bundle.

Acceptance criteria:
1. /ury in French: "Total général", "Total des factures", "Annulée par",
   "Exporter en CSV"; no "Autal", "Autes", "Annulerled", "Exporterer".
2. /ury in Arabic: no Latin letters glued to Arabic words ("الطاولةS").
3. English unchanged.

Build: frontend only. The server deploy does not build it: run
`cd apps/ury/frontend && yarn build` on the server after pulling.

Risk profile: low. On a conflict keep `phrasePattern` and the whole-word
replace; new upstream keys go in the same maps.

### Patch 21 — Bill printed in the cashier's language

Bug fix (browser retest 2026-10-20, finding F9).

Files touched: `pos/src/lib/print.ts`

What it does: the browser print of a bill (no QZ, no network printer) opened
`/printview?...&format=${format}&_lang=en`: always English, and `format=null`
(ERPNext's generic POS Invoice form) when the POS Profile had no print format.
The URL is now built with `URLSearchParams`, `_lang` is the POS language
(`getActiveLanguage()`), and `format` is sent only when the profile has one.

Why it can't be done in `erp_restaurant`: the URL is built in the POS bundle.

Acceptance criteria:
1. Cashier in French: Print bill opens the profile's format ("Restaurant
   Receipt") in French; in Arabic, in Arabic.
2. A profile without print format opens ERPNext's default format, without
   "format=null" in the URL.

Risk profile: low. On a conflict keep the `URLSearchParams` block.

### Patch 22 — Fresh POS Profile on load, waiter app and closing texts translated

Bug fix (browser retest 2026-10-20, findings R3 and R5).

Files touched:
- `pos/src/components/AuthGuard.tsx`
- `pos/src/captain/pages/CaptainOrder.tsx`, `captain/components/CaptainActionsMenu.tsx`,
  `CaptainMenu.tsx`, `CaptainTableCard.tsx`
- `pos/src/components/ClosingPaymentTable.tsx`, `TableCard.tsx`, `pos/src/pages/Orders.tsx`
- `pos/src/i18n/locales/en.json`, `fr.json`, `ar.json` (27 new keys in `captain`,
  `pos_closing`, `tables`, `orders`; existing keys reused: `common.all`,
  `tables.transfer_table`, `tables.occupied`, `order.print`, `order_types.take_away`)

What it does: the POS kept the POS Profile in the tab's sessionStorage and read
it from there even after a reload, so an open till printed with an old print
format (no format = ERPNext's generic form). The profile is now fetched from the
server on every page load (the copy still serves the rest of the session). The
waiter app texts Patch 17 missed (toasts "Order sent to kitchen.", "New order",
"Send Order", "Already Ordered", "New / Changed", table status "Mine / Free /
Billed", actions menu, "All") and the POS texts "Qty:", closing table headers
and table card "Take away / Preview / Print" go through `t()`.

Why it can't be done in `erp_restaurant`: POS bundle code and texts.

Acceptance criteria:
1. Change the POS Profile print format, reload the open POS tab: Print uses the new format.
2. Waiter app in French and Arabic: no English in the order screen, table cards
   and toasts.
3. Close Shift table headers and table cards in French and Arabic.

Not covered: dates in the POS use the browser's English format ("Oct 20, 1:04 PM").

Risk profile: low to medium (CaptainOrder.tsx is edited upstream). On a conflict
keep the `t('...')` calls and `fetchPosProfile(true)`.

### Patch 23 — Cash amount replaced on the first keystroke, waiter no-shift message, wide waiter layout

Bug fix (browser retest 3, 2026-10-20, findings N1 and N3) and owner layout change.

Files touched:
- `pos/src/components/PaymentDialog.tsx`
- `pos/src/i18n/locales/en.json`, `fr.json`, `ar.json` (`pos_opening.no_permission` reworded)
- `pos/src/captain/pages/CaptainOrder.tsx` (owner change)

What it does:
- Patch 19 selected the prefilled payment amount one frame after focus; typing at
  once still appended (38 + "50" = 3850). The field now remembers that it was
  prefilled and the first typed character replaces the amount (a delete clears
  it), whatever the selection timing. The selection is kept for the visual cue.
- A waiter opening the POS with no open shift saw "You don't have permission to
  open a session": the text now says no shift is open and asks the cashier or
  manager to open the till (same key for any user who cannot open a shift).
- Waiter order screen on wide screens (lg): the total and Send/Update Order bar
  stays at the bottom (sticky) instead of scrolling away, on a white card with a
  top border (owner change).

Why it can't be done in `erp_restaurant`: POS bundle code and texts.

Acceptance criteria:
1. Payment of 38: tap Espèces and type 50 at once: 50, change 12. Same for 100 on 68.
2. Waiter, no shift open: the French message asks the cashier to open the till.
3. Waiter order screen at 1024 px and wider: total and Send Order always visible.

Risk profile: low. On a conflict keep `prefilledId` and `handlePaymentInputChange`.

### Patch 24 — Customer self-ordering app in French and Arabic

Feature (owner request 2026-10-20). URY's customer app (`/order`, QR at the
table, pickup, kiosk, table tablet) had every text hardcoded in English and no
translation support.

Files touched:
- `self-order/src/i18n.tsx` (new: en/fr/ar texts, language provider, FR / ع / EN switch)
- `self-order/src/main.tsx`, `App.tsx`, `hooks/useOrderingSession.ts`,
  `hooks/useDeviceBootstrap.ts`, `lib/api.ts`
- `self-order/src/layouts/MobileQRLayout.tsx`, `TabletLayout.tsx`,
  `LandscapeKioskLayout.tsx`, `PortraitKioskLayout.tsx`,
  `PortableTabletAssignment.tsx`, `shared/CartPanel.tsx`, `shared/MenuGrid.tsx`
- `ury/www/order.py` (boot `restaurant_lang`)

What it does: about 55 texts go through `t()` (en, fr, ar). Language: the
customer's choice (localStorage `ury_order_lang`), else the restaurant's
default language (System Settings, sent in the page boot as `restaurant_lang`
by `www/order.py`), else English. A FR / ع / EN switch sits in each header;
Arabic sets `dir="rtl"` (left/right classes changed to start/end). Every API
call sends `_lang`, so server messages (already translated in erp_restaurant's
fr/ar csv) come in the page's language. Order lines and totals now use the
currency formatter like the cart.

Why it can't be done in `erp_restaurant`: the texts are compiled into the
self-order bundle; the page boot is built by URY's `www/order.py`.

Acceptance criteria:
1. Restaurant default language French, phone never used the page: a scanned
   table code opens the menu in French ("Commander", "Votre commande", "Total").
2. Switch to ع: right to left, Arabic texts; the choice stays after a reload.
3. A refused action (for example ordering disabled) shows the server message
   in the page's language.

Build: self-order only, not built by the deploy: `cd apps/ury/self-order && yarn build`
on the server; `www/order.py` needs the normal restart.

Risk profile: medium on update (texts spread over the layouts upstream edits).
On a conflict keep the `t('...')` calls; new upstream texts need keys in `i18n.tsx`.

### Patch 25 — Sold-out meals greyed in the POS and the waiter app

Feature (owner request 2026-10-20).

Files touched:
- `pos/src/store/pos-store.ts` (menu rows keep `portions_left` / `sold_out`; `fetchMenuItems(silent)`)
- `pos/src/hooks/useMenuStockRefresh.ts` (new: background menu refresh every 45 s and on focus)
- `pos/src/components/MenuCard.tsx`, `MenuList.tsx`, `captain/components/CaptainMenu.tsx`
- `pos/src/i18n/locales/en.json`, `fr.json`, `ar.json` (`menu.sold_out`, `menu.portions_left`,
  `captain.browse_only`)

What it does: erp_restaurant adds `custom_portions_left` and `custom_sold_out` to
every row of URY's `getRestaurantMenu` (stock of the recipe ingredients minus the
shift's unclosed sales, `menu_availability.py`). The POS and the waiter app grey
out a sold-out meal (not tappable, red "Épuisé" badge) and show "Plus que N" at 3
portions or fewer. The menu reloads silently every 45 s and when the window gets
focus, so a meal that runs out during the shift greys out without a reload. The
payment check stays as the last guard. Also translated the waiter app's "browse
only" notice (English left by Patch 17).

Why it can't be done in `erp_restaurant`: the menu cards and the refresh are in
the POS bundle; the availability itself is computed in `erp_restaurant`.

Acceptance criteria:
1. A meal whose ingredient is at 0 (after the shift's sales) is greyed with "Épuisé"
   in the POS and the waiter app and cannot be added.
2. With 2 portions left: "Plus que 2"; after selling them the card greys out within
   about 45 s without reloading.
3. A delivery recorded in /admin makes the meal available again on the next refresh.

Commit: `ebe131d444aa3ffd9d86f1c7a9aa0befed59b278` (with erp_restaurant 47b1f9d). Owner test passed 2026-10-20.

Risk profile: medium (pos-store.ts is high-risk). On a conflict keep the two
mapped fields, the `silent` parameter and the MenuCard props.

Fix 2026-10-22 (e2e test): the background refresh skips aggregator orders; it replaced
the platform's menu and prices with the restaurant menu after the first item was added.

### Patch 26 — Kitchen screen (Mosaic) in the restaurant's language, "Kitchen" title

Feature (owner request 2026-10-20).

Files touched:
- `mosaic/src/i18n.js` (new: en/fr/ar texts, `t()`, KOT type labels, document lang/dir)
- `mosaic/src/main.js` (`$t`, `$kotType` on every template)
- `mosaic/src/components/Header.vue`, `kot.vue`, `production/ProductionCard.vue`,
  `production/ProductionDashboard.vue`, `mosaic/src/views/Login.vue`
- `mosaic/index.html` (`window.restaurant_lang`)

What it does: Mosaic had every text in English. All texts (header menu,
dashboard, production unit cards, order cards, Serve / Confirm, cancelled
types, delayed-order banner, online / offline messages, login) now come from
`i18n.js` in English, French or Arabic, in the restaurant's default language
(System Settings), which erp_restaurant's `update_website_context`
(branding.py) puts on the page as `restaurant_lang`. Arabic sets `dir="rtl"`.
The header's logo link (Patch 15's desk logo, too big there) is replaced by the
word "Kitchen" / "Cuisine" / "المطبخ". URY's stored values ("Takeaway",
"Cancelled") are unchanged; only their display is translated.

Why it can't be done in `erp_restaurant`: the texts are compiled into the Mosaic
bundle; the language itself comes from `erp_restaurant`.

Acceptance criteria:
1. Restaurant default language French: /mosaic shows "Cuisine", the unit cards
   ("Poste de production", "En cours", "Servies"), order cards ("Table", "À
   emporter", "Commande", "Servir") in French.
2. Arabic default language: right to left, Arabic texts.
3. Serving and confirming an order still work.

Build: Mosaic is not built by the deploy and its build reads the bench's
`sites/common_site_config.json` (server only): on the server run
`cd apps/ury/mosaic && yarn install && yarn build`. Checked locally by compiling
every component with `@vue/compiler-sfc` (the full build needs the bench file).

Risk profile: low to medium (kot.vue is long and edited upstream). On a conflict
keep the `$t(...)` calls; stored values must stay English.

### Patch 27 — Close Shift expected cash includes the opening float

Bug fix (owner report 2026-10-20).

Files touched: `pos/src/components/POSClosingDialog.tsx` (`buildRows`)

What it does: URY's Close Shift table showed "Expected" as the shift's takings
only, without the opening amount: a shift opened with 10, no sale, counted 10,
showed a +10 difference (and was saved that way, since the erp_restaurant
closing hook only recomputed when there were invoices). Expected is now opening
amount + takings per payment method, as ERPNext computes it and as the
erp_restaurant hook saves it (pos_closing_hooks.py now also recomputes a shift
with no sale).

Why it can't be done in `erp_restaurant`: the dialog's figures are computed in
the POS bundle (the saved closing is fixed in erp_restaurant).

Acceptance criteria:
1. Open with 10, no sale, close counting 10: Expected 10, difference 0, in the
   dialog and in /admin Clôture du jour.
2. Open with 10, cash sales 400: Expected 410; counting 410 gives 0.

Risk profile: low. On a conflict keep the opening amount in `expected_amount`.

### Patch 28 — New aggregator orders get their branch before the price list lookup

Bug fix (owner report 2026-10-21, ticket 23d: "Price list for customer Glovo in branch None not found in Aggregator Settings").

Files touched: `ury/ury/doctype/ury_order/ury_order.py` (`_resolve_or_create_pos_invoice`)

What it does: for an order without a table (Take Away, Aggregators...), URY builds
a new POS Invoice, computes the user's branch, but leaves `invoice.branch` empty
(it is only filled from the POS Profile at validate, `fetch_if_empty`). `sync_order` then looks up the aggregator's price list with
`parent = invoice.branch`, i.e. `None`, and refuses every new aggregator order.
The patch sets `invoice.branch` to that same branch when it is empty. Existing
orders and table orders are unchanged. Side effects (review 2026-10-21): new
non-table orders now get `custom_course` on their lines from the first send
(the branch menu lookup used to find nothing until a later edit), and URY's
multiple-cashier lookup gets a real branch (no effect while multiple cashier
is off). The branch now comes from the user's URY User branch (`getBranch()`)
instead of the POS Profile's; staff_access keeps them aligned.

Why it can't be done in `erp_restaurant`: the invoice is a local object inside
URY's `sync_order`, and the refusal happens before any document event
(before_insert, validate) that erp_restaurant could hook; the only other ways
are overriding all of `sync_order` or monkeypatching URY.

Acceptance criteria:
1. New Aggregators order for a platform set up on the branch (Glovo): saved,
   with the platform price list, no error.
2. New Take Away order: unchanged.
3. Customer QR (self-ordering) pickup order: unchanged (its branch comes from `override_branch`).
4. Emergency till /caisse sync and a Delivery order: unchanged.

Risk profile: low. On a conflict keep `invoice.branch = branch` right after the
branch is computed in the non-table path.

### Patch 29 — Order types in the order Dine In, Take Away, Aggregators, then the rest

Feature (owner request 2026-10-21).

Files touched: `pos/src/data/order-types.ts` (`ORDER_TYPES` order only)

What it does: the order type buttons on the POS page show Dine In, Take Away,
Aggregators, Delivery, Phone In (upstream: Aggregators last). Values and
labels unchanged; only the order of the array.

Why it can't be done in `erp_restaurant`: the list is a constant in the POS bundle.

Acceptance criteria:
1. POS page: the order type buttons read Sur place, À emporter, Agrégateurs, then Livraison, Commande par téléphone (French), same order in Arabic (right to left).
2. Each type still selects as before (default Take Away).

Risk profile: low. On a conflict keep upstream entries and move Aggregators third.

### Patch 30 — Aggregator order opens in Orders, already selected (like Take Away)

Feature (owner request 2026-10-21). Extends Patch 08.

Files touched: `pos/src/components/OrderPanel.tsx` (Patch 08 condition only)

What it does: after a successful `sync_order`, an Aggregators order goes to
Orders, tab Draft, with the saved order selected, exactly like Take Away
(Patch 08): the cashier prints and pays with the platform's method there.

Why it can't be done in `erp_restaurant`: route and selected order are POS browser state.

Acceptance criteria:
1. New Aggregators order (Glovo), confirm: Orders, tab Draft, the order selected.
2. Print, Payment: the platform's payment method is offered; paying works.
3. Take Away still goes to Orders; Dine In, Delivery, Phone In stay on the POS page.

Risk profile: medium (high-risk file). On a conflict keep Patch 08's block and
add `|| selectedOrderType === 'Aggregators'` to its condition.

### Patch 31 — Aggregator order "Handed to the courier" instead of a counter payment

Feature (owner request 2026-10-21, ticket 23e). In Morocco the courier takes the
order without paying; the platform pays the restaurant later (weekly or monthly).

Files touched: `pos/src/pages/Orders.tsx` (payment button of the selected order),
`pos/src/i18n/locales/{en,fr,ar}.json` (4 keys under `payment`)

What it does: for a selected Aggregators order, the Payment button becomes
"Remis au livreur" (second tap to confirm, print still required first). It reads
the platform's payment method for the branch (URY `ury_pos.api.getAggregatorMOP`)
and calls URY `make_invoice` with that method for the order total: no cash
dialog, no change. The amount lands on the platform's "owes us" account set up
by erp_restaurant (api/owner_aggregators.py), and the platform statements in the
owner app list the order. Other order types keep the payment dialog. Upstream,
the payment dialog offered only the till's methods, so an aggregator order was
recorded as cash or card.

Why it can't be done in `erp_restaurant`: the button and what it sends are POS bundle code.

Acceptance criteria:
1. Aggregators order (Glovo), printed, "Remis au livreur", tap again: paid, leaves the Draft list; payment method Glovo, amount = order total.
2. Not printed: "please print first", nothing paid.
3. A platform without a payment method on the branch: clear error, nothing paid.
4. Take Away and Dine In: payment dialog as before.
5. French and Arabic texts.
6. A discount already on the order is kept; a merged bill keeps the payment dialog;
   a first tap on one order never confirms another (confirm resets when the
   selected order changes).
7. The cashier's closing shows no shortfall for the platform method
   (erp_restaurant pos_closing_hooks counts it as expected).

Risk profile: low to medium. On a conflict keep the upstream Payment button for
other order types and the Patch 31 branch for `order_type === 'Aggregators'`.

### Patch 32 — Close Shift: delivery platform rows paid later, read-only

Bug fix (owner report 2026-10-21: a shift with 0 opening cash and only Glovo
orders could not be closed with 0 counted). Extends Patches 11 and 27.

Files touched: `pos/src/components/POSClosingDialog.tsx` (load, validation),
`pos/src/components/ClosingPaymentTable.tsx` (read-only platform row),
`pos/src/i18n/locales/{en,fr,ar}.json` (`pos_closing.platform_paid_later`)

What it does: the dialog reads the branch's delivery platforms and their
payment methods (URY `getAggregator`, `getAggregatorMOP`). A platform method's
row is pre-filled with counted = expected, marked as reviewed and shown as
"Payé plus tard par la plateforme" (no input, difference 0). The all-zero rule
(Patch 11) now looks only at rows with something to count, so a shift whose
sales all went to platforms closes with 0 cash and 0 card. erp_restaurant
pos_closing_hooks saves the platform row the same way.

Why it can't be done in `erp_restaurant`: the refusal is the dialog's own
validation; the saved closing is already fixed server side.

Acceptance criteria:
1. Opening 0, only Glovo orders, cash and card 0: Close Shift accepted; the Glovo
   row shows "Payée plus tard", difference 0.
2. Opening 0, a cash sale of 40 and Glovo orders, cash counted 0: blocked
   (all zero with activity), as before.
3. No platform set up: dialog as before (Patches 11, 27).
4. French and Arabic.

Each platform needs its own Mode of Payment (owner app creates one per
platform): a platform pointed at a shared method such as Cash would make that
row read-only.

Manual test: as the main cashier (and as a sub-cashier if multiple cashier is
used), open with 0, one Glovo order handed to the courier (Patch 31), close with
cash and card 0: accepted; the saved POS Closing Entry (or Sub POS Closing) has
the Glovo row with difference 0; fr and ar. Known gap: with multiple cashier
on, URY's POS Closing Entry validate (ury_pos_closing_entry.calculate_closing_amount)
rewrites every row's closing amount after erp_restaurant's hook (not checked).

Risk profile: low. If the platform calls fail the dialog behaves as before.


### Patch 33 — Aggregator order "Paid now" at the counter

Feature (owner QA 2026-10-21, decision B). Some platform orders are paid at
once at the counter (by the customer or the courier), at full price or minus
the platform's commission. Extends Patch 31.

Files touched: `pos/src/pages/Orders.tsx` (button, dialog, Patch 31 payment
code moved into a shared `settleAggregatorOrder`), `pos/src/i18n/locales/{en,fr,ar}.json`
(8 keys under `payment`, `paid_now*`)

What it does: next to "Remis au livreur", an aggregator order gets "Payé sur
place" (print still required first). The dialog takes the amount received
(prefilled with the order total, any amount above 0 up to the total) and a
till payment method. URY `make_invoice` is called with two payment rows: the
amount received on the chosen method, and the rest of the total on the
platform's payment method (`getAggregatorMOP`). ERPNext refuses a POS payment
below the total, so the rest is recorded as owed by the platform; the owner
settles it as commission in the platform statement (erp_restaurant
owner_aggregators.record_payout with received 0 books it to "Delivery platform
commissions"). Full amount received: one payment row, nothing owed.

Why it can't be done in `erp_restaurant`: the button, the dialog and the
payments sent are POS bundle code.

Risk profile: medium. Orders.tsx is a busy upstream file (Patches 08, 10, 30, 31).
If getAggregatorMOP fails, nothing is paid. The received amount is rounded to 2
decimals once and the platform row is total minus it, so the rows sum to the total.

Acceptance criteria:
1. Glovo order of 80, printed, "Payé sur place", 80 in Cash: paid, one Cash row
   of 80; the order is not in the Glovo statement.
2. Same with 68 in Cash: rows Cash 68 and Glovo 12; Glovo statement lists the
   order at 12; a payout with received 0 books 12 as commission.
3. 0, empty or above the total: refused in the dialog, nothing paid; 3 decimals
   (10.125) are rounded (10.13) and the rows still sum to the total. Glovo is
   not offered as the method received.
4. Not printed: "please print first". Platform without a method: clear error.
5. Close Shift: cash expected includes the 68; the Glovo row is paid later
   (Patch 32), no difference.
6. "Remis au livreur" works as before (Patch 31). French and Arabic texts.

### Patch 34 — Reload the POS after opening a shift

Fix (end-to-end test 2026-10-22). A cashier who works in two branches opened a
shift on her home till, but the POS kept the POS Profile, menu and rooms it had
loaded before the shift existed (sessionStorage), so it sold the other branch's
menu and showed every meal sold out from that branch's empty warehouse.

Files touched: `pos/src/components/POSOpeningScreen.tsx` (handleSubmit success)

What it does: after a successful opening, the tab cache (sessionStorage) is
cleared and the page reloads. The server answers with the shift's branch
(erp_restaurant shift_branch.py replaces URY's getBranch / getBranchRoom /
getRoom with the open shift's branch).

Why it can't be done in `erp_restaurant`: the stale data is in the POS bundle's
browser storage; the server cannot clear it, and the opening success handler is
POS code.

Risk profile: low. One extra page load after opening; held order tabs are in
localStorage and are kept. Single-branch staff see the same POS after the reload.

Acceptance criteria:
1. Cashier in branches A and B opens a shift on A's till: after the automatic
   reload the POS shows A's menu (not sold out), A's tables and A's payment methods.
2. Same cashier, shift on B's till: B's menu and tables.
3. Single-branch cashier: opening works as before (one reload).

Patch file: `patches/34-reload-after-opening.patch`.

## Build and deploy

`pos/vite.config.ts` builds directly into `ury/public/pos` inside this
same repo. There is no separate output directory to manage — building
`pos` from this patched tree, and deploying this repo's `ury/public/pos`
output, is what puts the patches live. The `frontend` and `mosaic` apps
are built separately and must also be rebuilt when their files change
(Patches 01, 03, 05). See `erp_restaurant`'s `URY_FORK_MAINTENANCE.md`
for the full deployment sequence, including the gotcha where a plain
`bench build` against a freshly updated, unpatched `ury` checkout will
silently overwrite this output.

## Update checklist (short form)

1. Fetch new upstream `develop` commits.
2. Diff against the currently pinned commit, scoped to the files listed
   under each patch above.
3. Reapply patches 01 to 10 in order against the new base.
4. For patches 02 and 03 specifically: check `en.json` for new keys and
   translate them into `fr.json` and `ar.json`.
5. For patch 04 specifically: manually re-verify all five acceptance
   criteria listed above, not just that the diff applied cleanly.
6. For patch 01 specifically: keep this fork's version of any conflicting
   image file, re-check the two KPIGrid labels, and re-check the header
in `pos/src/components/Header.tsx`.
7. Rebuild `pos`, `frontend` and `mosaic`, confirm output at
   `ury/public/pos`.
8. Update the pinned commit hash and date at the top of this file.
9. Update the same information in `erp_restaurant`'s
   `URY_FORK_MAINTENANCE.md` so the two repos stay in sync.

## Explicit non-goals

This fork is not a general-purpose customization surface. Anything that
can be implemented as a Frappe hook, custom field, or server-side API in
`erp_restaurant` belongs there, not here. Keeping this patch set as
small as possible is a deliberate choice to minimize what has to
survive every URY update — resist the urge to add another patch here
without first confirming it truly can't be done from `erp_restaurant`
instead.
