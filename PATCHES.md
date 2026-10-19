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
