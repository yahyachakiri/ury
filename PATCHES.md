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
- `pos/index.html` (planned for the `<title>URY POS</title>` line; the title
  was never changed here, see Patch 52)
- `pos/src/components/HufLogo.tsx` (or its usage site)
- `pos/src/pages/Dashboard.tsx` (where `HufLogo` is rendered)
- `pos/src/components/Header.tsx` (the header logo image)
- `frontend/Public/URY-bg.png`
- `frontend/Public/photo_2026-08-19_13-24-09.jpg`
- `mosaic/src/assets/logos/mosaic.jpg`
- `frontend/src/pages/Dashboard/KPIGrid.tsx` (the `URY POS` and
  `URY MOSAIC` link card labels)

What it does: replaces the favicon and POS icon assets, the browser tab
title (not done; Patch 52), and removes or replaces the small branding SVG rendered on the
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
branding, such as the management frontend tab title (done in Patch 52), favicon, PWA
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
  ("Reprint kitchen ticket" action; auto print after a successful
  `cancel_order`, ticket 37)
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
paper). Cancelling a whole order from Orders (ticket 37): `cancel_order`
creates a "Cancelled" KOT (URY `cancel_kot`) that nothing printed; with
auto-print on, the POS now prints it the same way, in the background, right
after the cancel succeeds. A cancel ticket also prints for an order whose
earlier tickets never printed (accepted). Bills printed through QZ now go to
"Bill Printer" (empty = default).
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
10. Cancel a whole order (draft or paid) from Orders with auto-print on: a
    "CANCELLED" ticket with every item as -qty prints; auto-print off: nothing
    prints; printer off: order still cancelled, print error toast (ticket 37).

Commit: `a8489c4fcb58d1002a139de3e1496fd50f6ad8f8`, `b3022ee2` (cancel ticket, ticket 37;
its Orders.tsx diff is appended to the patch file)

Risk profile: medium. Small additions in OrderPanel.tsx (high-risk file,
also changed by Patches 04 and 08) and Orders.tsx; the shared `qz.ts`
change is backward compatible. On a conflict, keep the Patch 10 block after
the Patch 08 `savedName` line, `printKitchenTickets` and the `printerName`
argument. In `handleCancelOrder` (Orders.tsx) keep `invoiceId` captured before
`clearSelectedOrder()` and the print block after the success toast.

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
(frontend) (done in Patch 52), the /apps tile title "URY" and `app_icon_title`, the legacy
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

### Patch 35 — A delivery-platform order always shows the platform's menu

Fix (end-to-end test 2026-10-22). A tab restored after a page reload, or reached
by switching tabs, kept the platform selected (Agrégateurs + Glovo) but showed
the restaurant menu and prices: the cashier could add items at the wrong price.

Files touched: `pos/src/store/pos-store.ts` (fetchMenuItems)

What it does: when the current order type is Aggregators and a platform is
chosen, fetchMenuItems loads that platform's menu (fetchAggregatorMenu) instead
of the restaurant menu; a silent background refresh (Patch 25) does nothing.
Callers: start-up, table change and order sent (as before); switchTab and the
active-tab branch of closeTab now call it when the order type, platform or room
differs from the previous tab (menuKey); setSelectedOrderType calls it when
coming back to Aggregators with a platform still chosen.

Known gap (unchanged): a platform draft opened from Orders gets no platform
(openDraftOrderInNewTab sets selectedAggregator to null).

Why it can't be done in `erp_restaurant`: which menu the POS shows is decided by
the POS store in the browser.

Risk profile: medium (pos-store.ts is a high-risk file, next to Patch 25's code).
An early return at the top of fetchMenuItems plus three call sites; other order
types are unchanged.

Acceptance criteria:
1. Glovo order with one item, reload the page: the restored tab shows Glovo's
   menu and prices.
2. Two tabs, one Glovo, one takeaway: switching between them, and closing the
   active one, shows each tab's menu.
2b. Agrégateurs + Glovo, then À emporter, then Agrégateurs again: Glovo's prices.
3. Takeaway and dine-in orders: restaurant menu as before; sold-out refresh still works.

Patch file: `patches/35-platform-menu-on-restore.patch`.

### Patch 36 — Extras and sizes not on the menu are not offered

Fix (ticket 28, 2026-10-28). The meal dialog reads a meal's extras and sizes
from its Item (custom_pos_add_on_items / custom_pos_item_variants) and prices
them from the loaded menu. Upstream showed an extra or size missing from that
menu at price 0 under its item code: such an extra could be added for free (its
recipe still deducted at closing); such a size was a dead button priced 0
(handleVariantClick already ignores sizes missing from the menu). It happens when the extra or size is
switched off on the menu (getRestaurantMenu leaves disabled rows out), deleted
from it in the desk, or on another branch's menu only (the Item is shared).

Files touched: `pos/src/components/ProductDialog.tsx` (addonDetails, variantDetails)

What it does: an extra or size not found in the loaded menu maps to null and is
dropped by the existing `.filter(Boolean)`; found ones are unchanged.

Why it can't be done in `erp_restaurant`: the POS reads the extras straight from
the Item document and builds the price-0 fallback in the browser; no server
hook filters that read. erp_restaurant already keeps the links clean on delete
and refuses switched-off meals as new extras (owner_menu.py, ticket 28).

Risk profile: low. Two ternaries in one component; the selected-item and
cart logic are untouched.

Acceptance criteria:
1. Classic Burger with extras Supplément fromage (5) and Supplément sauce (3):
   the dialog lists both with their prices.
2. Switch Supplément sauce off in /admin/menu, reload the POS: the dialog lists
   only Supplément fromage; no 0-price line can be added.
3. A meal whose only extras are all off the menu shows no extras section.
4. Sizes: the same with Tacos Poulet L / XL.
5. The same in the waiter app (CaptainOrder uses the same dialog).

Patch file: `patches/36-options-not-on-menu.patch`.

### Patch 37 — Sizes and extras grouped under their meal

Owner request (ticket 28, 2026-10-28). Sizes ("Tacos Poulet XL") and extras
("Supplément fromage") are ordinary menu meals, so each was its own card on the
grid: a crowded grid, and a single tap on the base meal added it without asking
the size.

Files touched: `pos/src/store/pos-store.ts` (MenuItem, fetchMenuItems mapping),
`pos/src/components/MenuList.tsx` (filter), `pos/src/pages/POS.tsx`
(handleItemClick), `pos/src/captain/components/CaptainMenu.tsx` (filter, tap,
dialog)

What it does: erp_restaurant's getRestaurantMenu wrapper flags each row
(custom_is_option, custom_has_sizes, custom_has_extras; owner_menu.annotate_options).
The store keeps them as is_option / has_sizes / has_extras. Both grids leave out
option meals (they stay in menuItems, so the meal's dialog still prices them,
Patch 36). POS: a single tap on a meal with sizes opens its dialog instead of
adding it; a double tap still opens it for extras. Waiter app (no double tap): a
tap on a meal with sizes or extras opens the same dialog. Platform menus
(fetchAggregatorMenu) carry no flags and are unchanged.

Why it can't be done in `erp_restaurant`: the grid and the tap behaviour are in
the browser; erp_restaurant only supplies the flags.

Risk profile: medium (pos-store.ts is a high-risk file; the change there is two
interface fields and three mapped fields). Without the erp_restaurant flags
every flag is false and the POS behaves as before.

Acceptance criteria:
1. Demo seed (Classic Burger with extras, Tacos Poulet with sizes L / XL; a
   size of Classic Burger is added in the ticket 28 manual test): the POS and
   waiter grids show neither the extras nor the sizes.
2. POS: one tap on Tacos Poulet opens its dialog with the sizes; one tap on a
   meal without sizes (Cheese Burger) adds it at once; a double tap on Classic
   Burger opens the dialog with its extras.
3. Waiter app: one tap on Classic Burger or Tacos Poulet opens the dialog; one
   tap on Cheese Burger adds it.
4. A size or extra chosen in the dialog is billed at its own price (as Patch 36).
5. Platform order (Agrégateurs + a platform): menu unchanged.

Patch file: `patches/37-group-sizes-and-extras.patch`.

### Patch 38 — Extras written into their meal's note

Owner request (ticket 28, 2026-10-28). An extra is its own cart and invoice line
with no link to the meal it was chosen for, and the cart merges identical items:
"burger with sauce algérienne + plain tacos + plain burger" became Classic
Burger x2, Sauce algérienne x1, Tacos x1, and the kitchen could not tell which
meal gets the sauce.

Files touched: `pos/src/components/ProductDialog.tsx` (handleAddToOrder)

What it does: when extras are chosen in a meal's dialog, the meal line's note
gets "+ <extra>, <extra>" (after the cashier's own note, joined by " · "). The
note is part of the cart line identity, so a burger with sauce algérienne and a
burger with sauce biggie stay two lines, and the kitchen ticket (erp_restaurant
"Kitchen Ticket" format, item comments) and the receipt print it under the meal.
The extra lines are unchanged (billed and deducted as before).

The note field holds 140 characters (POS Invoice Item comment, URY KOT Items
comments): the cashier's text is shortened to make room, the "+ …" part is kept.

Companion fix in erp_restaurant (kot_diff.py): URY's kitchen ticket difference
for an order already sent matched lines by item only, so a meal added with a
different note was missed or cancelled; erp_restaurant replaces
compare_two_array / get_removed_items to compare by item and note.

Known limits: deleting an extra line afterwards leaves the "+ …" note on the
meal (edit the note by hand); when a meal line is edited, the "+ …" text stays
in the note field; choosing the same extra again adds it a second time (as
upstream, where the extra line also doubles).

Why it can't be done in `erp_restaurant`: the cart and its lines are built in the
browser; the server only receives independent lines.

Risk profile: low. One component, two lines; no change for a meal added without
extras.

Acceptance criteria:
1. POS: Classic Burger with Sauce algérienne, then a plain Classic Burger: two
   burger lines, the first with the note "+ Sauce algérienne", plus the sauce
   line.
2. A note typed by the cashier ("sans oignon") and an extra give "sans oignon ·
   + Sauce algérienne".
3. The kitchen ticket (print preview of the KOT) shows the note under the burger.
4. Waiter app: the same.
5. Dine-in order sent with 1 Classic Burger, then 1 Classic Burger + Sauce
   algérienne added: the ADDED ITEMS ticket shows 1 Classic Burger » + Sauce
   algérienne and 1 Sauce algérienne, no CANCELLED ticket (needs erp_restaurant
   kot_diff.py).

Patch file: `patches/38-extras-in-meal-note.patch`.

### Patch 39 — Extras of the previous size are dropped

Fix (owner report, ticket 28, 2026-10-28). In a meal's dialog, choosing a size
switches the dialog to the size's own item (handleVariantClick), but the extras
ticked before stayed selected, even when the size does not offer them: they
were added as lines, counted in the dialog total and, with Patch 38, written
into the size's note ("Classic Burger XL » + Sauce algérienne" with a sauce the
XL does not have). The hidden line and price are upstream behaviour.

Files touched: `pos/src/components/ProductDialog.tsx` (offeredAddons: total,
note, extra lines)

What it does: only the ticked extras the item now shown offers (addonDetails)
count; an extra also offered by the size stays ticked.

Why it can't be done in `erp_restaurant`: the dialog state is in the browser.

Risk profile: low. One component, one derived list.

Acceptance criteria:
1. Classic Burger: tick Sauce algérienne, then choose Classic Burger XL (no
   extras): total 35, adding gives one line Classic Burger XL without a note
   and no sauce line.
2. A size that offers the same extra keeps it: line note and extra line as
   Patch 38.

Patch file: `patches/39-drop-extras-on-size-switch.patch`.

### Patch 40 — Choice groups of a menu (drink, sauce)

Owner request (ticket 32, 2026-10-28). A menu ("Menu Burger") must ask which
drink and which sauce, among options the owner set up in the owner app
(erp_restaurant Item.custom_meal_choices, child table Meal Choice: group, item,
extra_price).

Files touched: `pos/src/components/ProductDialog.tsx` (choiceGroups,
selectedChoices, total, note, option lines, render, add button),
`pos/src/store/pos-store.ts` (has_choices), `pos/src/pages/POS.tsx` (tap),
`pos/src/captain/components/CaptainMenu.tsx` (tap), `pos/src/i18n/locales/*.json`
(product_dialog.choose_one)

What it does: the dialog shows one single-select section per group; "Ajouter"
stays disabled until every group has an option. Adding gives the menu line (its
note lists the choices first, then the extras, Patch 38) and one line per chosen
option at its extra price with the note "↳ <menu item code>". That note keeps a
chosen Fanta apart from a Fanta sold alone (cart line identity), survives an
order being reloaded, and is what erp_restaurant combo_pricing.py reads to bill
the line at its extra price on the server (URY re-prices every line). One tap on
a menu with choices opens its dialog in the POS and the waiter app
(custom_has_choices from erp_restaurant owner_menu.annotate_options).

A menu with choices cannot be added before its own Item has loaded (a fast tap,
or a size switch, would otherwise add it without choices). Sold-out options are
greyed. Editing a menu line in the cart removes the option lines named in its
note (by its quantity) and starts from the cashier's own note, so the choices
are asked again and replace the old ones.

Known limits: the cart +/- on a menu line does not move its option lines, and
editing an option line's note removes its "↳" mark (the server then bills it
at its normal price): change a menu through its dialog. The offline till
(/caisse) and the customer QR app do not ask choices. Supplements are fixed
amounts (a platform price list's markup does not apply to them).

Why it can't be done in `erp_restaurant`: the dialog, the cart lines and the tap
are in the browser; erp_restaurant supplies the choices, the flags and the
server prices.

Risk profile: medium (pos-store.ts high-risk file: one field and one mapping;
the dialog's add path changes for menus with choices only).

Acceptance criteria:
1. Menu Burger with groups Boisson (Coca-Cola, Fanta, Eau at 0, Jus d'orange
   pressé +5) and Sauce: one tap opens the dialog; Ajouter disabled until a
   drink and a sauce are chosen.
2. Fanta + Sauce algérienne: lines Menu Burger 55 (note "+ Fanta 33 cl, Sauce
   algérienne"), Fanta 33 cl 0 (note "↳ Menu Burger"), Sauce algérienne 0.
5. Edit the menu line and choose Coca-Cola: the Fanta line goes, a Coca-Cola
   line at 0 comes, the note reads "+ Coca-Cola 33 cl, Sauce algérienne".
3. Jus d'orange: total 60. A Fanta sold alone on the same order stays 8 and is
   its own line.
4. Waiter app: the same.

Patch file: `patches/40-menu-choices.patch`.

### Patch 41 — QZ Tray certificate and signatures from the server

Fix (ticket 04, 2026-11-02, signed 2026-11-04). Printing through QZ Tray could not
work: the POS passed an empty signing key (`initPrinting({ signKey: '' })` in
`pos/src/main.tsx`), so `printWithQz` threw before reaching QZ Tray, and the
certificate it fetched (`/assets/ury/files/cert.pem`) was never shipped. Upstream
also expected the private key inside the browser bundle, where anyone opening the
POS could read it. A first version sent requests unsigned; owner test 2026-11-04 on
a Windows till: QZ Tray asked "Allow" on every print, so auto print could not work.

Files touched: `packages/core/src/print/qz.ts` (security setup only)

What it does: the certificate comes from erp_restaurant
`api.kitchen_print.qz_certificate` and each QZ request is signed by
`api.kitchen_print.qz_sign` (SHA512 with RSA, base64). erp_restaurant creates one
key and self-signed certificate for the whole bench on the first migrate and keeps
them in `common_site_config.json` (owner choice 2026-11-04: one certificate for
every client; a site's own site_config value overrides it). Only till users (users
of an enabled POS Profile with QZ printing on, or System Managers) get signatures,
rate limited. The owner downloads the certificate from Settings > Tills
(`qz_certificate_file`, saved as `override.crt`) and puts it in the QZ Tray folder
of the till PC, then restarts QZ Tray: a self-signed certificate is not trusted
otherwise. `initPrinting` stays as a no-op for the apps that call it at startup.
Upstream `packages/core/AGENTS.MD` (initPrinting with a sign key) is outdated
after this patch.

Why it can't be done in `erp_restaurant`: the certificate and signature callbacks
run inside the POS bundle (`@ury/core` QZ transport); erp_restaurant supplies the
key, the certificate and the signatures.

Risk profile: medium. Security path: anyone holding the shared key can sign for
every client's tills, and replacing it means a new `override.crt` on every till. The key is in
`common_site_config.json`, which site backups do not include: keep a copy, or a
lost server means a new `override.crt` on every till.
Needs the key (migrate), and shared `@ury/core` now names an erp_restaurant
method. The print calls (Patch 10) are unchanged. If the endpoints fail, QZ Tray
refuses the request and the POS shows its existing print error.

Acceptance criteria:
1. Till PC with QZ Tray, the certificate from Settings > Tills installed as
   `override.crt`, QZ Tray restarted, POS Profile with QZ printing on and the
   cashier listed: two orders in a row print with no QZ Tray dialog.
2. Without `override.crt`, QZ Tray shows its untrusted-site dialog; no private key
   is in the POS bundle (`grep -r "PRIVATE KEY" ury/public/pos` finds nothing).
3. A desk user who is on no till (e.g. Accounts User only) calling
   `/api/method/erp_restaurant.erp_restaurant.api.kitchen_print.qz_sign` gets
   "Not allowed to print from the POS."
4. Two sites of the same bench serve the same certificate.

Patch file: `patches/41-qz-signing-from-server.patch`.

### Patch 42 — Bills print in French instead of Arabic

Owner choice (ticket 04, 2026-11-02): no Arabic printing for now. Extends Patch 21.

Files touched: `pos/src/lib/invoice-api.ts` (getInvoicePrintHtml `_lang`, new
`printLanguage()`), `pos/src/lib/print.ts` (printview `_lang`)

What it does: a bill is rendered in the cashier's language, French when the POS is in
Arabic, on both paths: QZ Tray (`getInvoicePrintHtml`, upstream always asked for
English) and the browser print view (Patch 21 used the cashier's language, Arabic
included). Kitchen tickets do the same on the server (erp_restaurant
`kitchen_print._render`).

Why it can't be done in `erp_restaurant`: the print language is a parameter the POS
bundle sends with each print request.

Risk profile: low. Only the `_lang` of the two bill print calls changes.

Acceptance criteria:
1. POS in Arabic: the bill prints in French (labels "Total", "Merci de votre visite").
2. POS in French or English: the bill prints in that language (QZ Tray path no longer
   always English).

Patch file: `patches/42-print-french-not-arabic.patch`.

### Patch 43 — Till alert for a QR order and a bill request

Ticket 18, open item 2 (2026-11-03). Works with erp_restaurant `self_order_alerts.py`.

Files touched: `pos/src/components/SelfOrderListener.tsx` (new), `pos/src/App.tsx`
(mounted next to `KotAlertListener`), `pos/src/i18n/locales/{en,fr,ar}.json`
(`self_order.*`)

What it does: listens on the realtime event `erp_self_order_<branch>` that
erp_restaurant publishes after a customer QR order (or addition) is saved and after a
new "request the bill". Shows a toast that stays until closed ("Commande QR : Table 4
(n° 12), 2 article(s)", "Commande QR à emporter …", "Table 4 demande l'addition"),
plays two short tones (one WebAudio context unlocked by the first tap, so iPad Safari
plays it; no file) and reloads the Orders list when it is on screen, keeping its page.
One toast per order and kind (an addition replaces it); text in the POS direction (RTL
in Arabic). Same app for the waiter screens (/pos/order).

Why it can't be done in `erp_restaurant`: the server can publish the event, but only
the POS bundle can show a toast, play a sound or reload its order list.

Risk profile: low. New component on the shared socket of `lib/realtime.ts`; no store
or order-flow change (calls the existing `fetchOrders`).

Acceptance criteria:
1. Till open on /pos and waiter app on /pos/order: a QR table order shows the toast
   with table, order number and item count, with a sound; with Orders open, the order
   is listed without a manual refresh.
2. Pickup code order: "Commande QR à emporter" toast.
3. "Demander l'addition" in the QR app: "<table> demande l'addition" toast, once (a
   second tap does not alert again).
4. Texts in fr, ar (RTL) and en.
5. iPad till: after one tap anywhere, the sound plays on the next alert.

Patch file: `patches/43-self-order-alerts.patch`.

### Patch 44 — Orders footer wraps on a narrow screen

Owner report (2026-11-03): on a platform order (Glovo, …) the total was not visible.
Applies on top of Patches 31 and 33.

Files touched: `pos/src/pages/Orders.tsx` (sticky footer of the selected order)

What it does: the footer row (print, "Remis au livreur", "Payé sur place", total) wraps
onto a second line when it does not fit, instead of pushing the total out of view. The
two platform buttons grow from their text width (`flex-auto`) so the row can break; the
total keeps `ms-auto` and sits at the end of its line. Other orders (one Payment
button, `flex-1`) are unchanged.

Why it can't be done in `erp_restaurant`: layout of the POS bundle's Orders screen.

Risk profile: low logic risk (three Tailwind classes, no logic); medium conflict risk
(Orders.tsx is a busy upstream file, as in Patch 33).

Acceptance criteria:
1. Platform order on a narrow till (iPad portrait, small window): the total is visible,
   on a second line when needed; wide screen: one row as before.
2. Dine-in / takeaway order: footer unchanged (print, Payment, total).
3. Arabic: same, mirrored (total at the left end).

Patch file: `patches/44-orders-footer-wrap.patch`.

### Patch 45 — Company account method hidden for a walk-in customer

Owner request (2026-11-04, ticket 33 follow-up): the payment dialog showed "En compte
société" for every order; for "Client comptoir" or any customer without an active
company account the server refused it only on confirm.

Files touched: `pos/src/components/PaymentDialog.tsx` (list of payment rows)

What it does: when the dialog opens it asks erp_restaurant
`pos_invoice_company_account.hidden_payment_modes(customer)` and leaves those methods
out of the rows and of the payments sent. The server returns the company account
method(s) unless the customer's account is Active, the same rule as its POS Invoice
guard. The filtered list is memoized (the cash autofill effect depends on it). If the
call fails every row stays visible and the server guard still refuses the payment.

Why it can't be done in `erp_restaurant`: the POS loads the till's methods once per
session (`getModeOfPayment`, cached in sessionStorage), not per customer; only the
dialog knows the order's customer.

Risk profile: low. One extra GET when the dialog opens; the row may show for a moment
before the answer, and an amount typed in it then is dropped when it hides. Payment
logic unchanged. Known gaps: the Patch 33 "Payé sur place" dialog (Orders.tsx) still
offers the method for platform orders (the server refuses it); a merged bill decides
with the primary order's customer only. The endpoint tells any logged-in user whether
a customer has an active company account (accepted: a yes / no, no amounts).

Acceptance criteria:
1. Order for "Client comptoir": no "En compte société" row; cash and card as before.
2. Order for a company with an Active account: the row is there and the payment goes
   through on account.
3. Company turned Off: no row.
4. Arabic: same rows, right to left.
5. Call blocked (e.g. offline devtools rule on the endpoint): every row shows, and paying
   a walk-in order on account is still refused by the server.

Patch file: `patches/45-hide-company-account-for-walk-in.patch`.

### Patch 46 — Till error messages translated and actionable

Owner request (2026-11-04): a deadlock while sending an order showed the raw database error;
every till error should be translated and tell the cashier what to do.

Files touched: `packages/core/src/frappe/errors.ts`, `packages/core/src/index.ts`,
`pos/src/main.tsx`, `pos/src/store/pos-store.ts`, `pos/src/store/slices/orders-slice.ts`,
`pos/src/store/slices/config-slice.ts`, `pos/src/lib/invoice-api.ts`,
`pos/src/captain/hooks/useCaptainContext.ts`, `pos/src/captain/hooks/useTableOrderContext.ts`,
`pos/src/captain/pages/CaptainOrder.tsx`, `pos/src/captain/pages/CaptainTables.tsx`,
`pos/src/components/` (BillMergeDialog, BillSplitDialog, CaptainTransferDialog,
ChecklistGateDialog, CustomerPicker, KotAlertListener, POSClosingDialog, POSOpeningProvider,
ProductDialog, TableSelectionDialog, TableTransferDialog), `pos/src/pages/Table.tsx`, locales.

What it does:
1. `parseFrappeError` recognises technical failures before reading server messages: no
   response (httpStatus 0, offline or server unreachable), MariaDB deadlock / lock timeout
   (QueryDeadlockError, QueryTimeoutError, "Deadlock found", "Lock wait timeout"), expired
   session (CSRFTokenError, SessionExpired, AuthenticationError), gateway 502 / 503 / 504. Each
   gets one short message. A bare Python error ("TypeError: ...") and a JavaScript runtime
   error (TypeError, ReferenceError, RangeError, SyntaxError) give the caller's fallback, never
   their text; the "exc_type spelled out" strategy is gone. `setErrorMessages` lets an app pass
   its translations; the POS does it in `main.tsx` after `initI18n` (keys `errors.network`,
   `busy`, `session_expired`, `server_unavailable`, `unexpected`).
2. Dialogs and pages that showed `err instanceof Error ? err.message : t(...)` use
   `parseFrappeError(err, t(...))`: server validation messages now reach the cashier (they were
   replaced by the generic text, frappe-js-sdk errors are not Error instances) and raw JS errors
   no longer do. The closing and checklist dialogs' local parsers delegate to it.
3. Hardcoded English errors moved to `t()` with en / fr / ar keys: store errors shown in the
   menu panel (load app / profile / menu / categories / platform menu / table order, cart),
   orders list, product dialog, waiter app contexts, table taken by another waiter, bill merge,
   app access. The waiter app's send error uses `parseFrappeError` instead of its own first
   message only parser.
4. The kitchen-ticket alert (KotAlertListener) said "An unknown KOT error occurred" in English:
   URY's payload has no message, it means the scheduler created a kitchen ticket the order was
   missing. It now says so with the order number.

Why it can't be done in `erp_restaurant`: these texts are built in the browser (no server
response at all when offline; fallbacks and store errors are in the bundle). Server messages
are handled in erp_restaurant: `api/ury_compat.sync_order` / `make_invoice` turn a deadlock or
a Python error inside URY's "Error while updating / settling order: {e}" into a translated
message, and the fr / ar CSVs cover URY's and erp_restaurant's `_()` messages.

Risk profile: low to medium. The parser is in `packages/core` but only `pos/src` calls it today
(`frontend`, `self-order` and `mosaic` do not); an app that does without `setErrorMessages`
gets the English defaults. `pos-store.ts` (high-conflict file) changes only string literals to
`t()` plus one import. Server messages that used to be replaced by the caller's generic text
are now shown, so a Frappe core message without fr / ar stays English. A deliberately thrown
`new Error(...)` keeps its text. Known gaps: kitchen print failures keep QZ Tray's reason in
the translated sentence (useful for setup); ERPNext / Frappe core messages rely on their own
fr / ar translations.

Acceptance criteria:
1. Devtools offline, send an order: "Pas de connexion au serveur..." (fr) / Arabic RTL, no
   "Network Error".
2. Server message still shown: order a sold-out meal, the stock message appears as before.
3. Edit an order modified elsewhere: "Order has been modified" text unchanged.
4. Log out in another tab, then send an order: the server's "Not permitted" text (a Guest
   request is a PermissionError, not a session error; the session message is for a CSRF or
   expired-session answer, which cannot be produced by hand reliably).
5. Waiter app: tap a table of another waiter: "Cette table est servie par <name>."
6. Kitchen-ticket alert: leave a draft order without a kitchen ticket 1 to 5 minutes (scheduler
   kotValidationThread): "Le ticket cuisine de la facture ... manquait et vient d'être créé."
7. Arabic: every message above right to left.
8. Not testable by hand: the deadlock ("Réessayez") and Python-error paths; they were checked
   locally with a stub only.

Patch file: `patches/46-till-error-messages.patch`.

### Patch 47 — Loyalty card scan at the till, points used in the payment dialog

Owner decision (2026-11-04, ticket 39): a returning customer shows a QR code; the cashier
scans it with a USB scanner and that customer is set on the current order only; points
earned on paid orders can be used as money off.

Files touched: `pos/src/components/LoyaltyScanListener.tsx` (new), `pos/src/App.tsx`
(mounts it next to SelfOrderListener), `pos/src/components/PaymentDialog.tsx`,
`pos/src/components/LoyaltyCardDialog.tsx` (new), `pos/src/components/CustomerPicker.tsx`,
`pos/src/lib/customer-api.ts`, locales (`loyalty.*`).

What it does:
1. LoyaltyScanListener listens to keydown on the document (capture phase), reading keys
   by physical position (`e.code`, so the iPad's layout, Arabic included, does not matter:
   the code's letters avoid the keys that move between QWERTY and AZERTY). A burst typed
   fast (60 ms or less between keys) that ends with `LOY` + 12 letters and then Enter is a
   loyalty card: the Enter is stopped and the scanned characters are removed from the field
   they were typed into. On the cashier's order screen (`/pos/pos`) only, for a new order
   (not `isUpdatingOrder`, the same lock as the customer picker) that is not a platform
   order, erp_restaurant `loyalty.resolve_loyalty_code` returns the customer and
   `setSelectedCustomer` puts it on the order with a toast (name, points). Elsewhere
   (Orders, the payment dialog, the waiter app) or on a sent order it only shows a message
   saying to scan on the order screen before sending: the order being paid takes its
   customer from the saved order, so points would otherwise go to the wrong order. An
   unknown or turned-off card shows the server's translated message and keeps the
   customer. Any other typing or scan is left alone.
2. PaymentDialog asks erp_restaurant `loyalty.get_customer_loyalty(customer)` (not on merged
   bills). With points, a "Points fidélité" block shows the balance, a points field capped
   at the balance and at the order total, and "Tout utiliser". The summary shows the total,
   the points used and what is left to pay; payment rows, the cash prefill, the shortfall
   and the change use what is left to pay. make_invoice gets `redeem_points`; an order paid
   entirely with points sends one payment row at 0 on the cash method (else the first
   method), as ERPNext requires one. The maximum is capped at the order total rounded by
   Patch 09; ERPNext v15 `validate_loyalty_points` compares with `rounded_total`, which
   erp_restaurant pos_rounding sets to the same value (checked in the version-15 source).
3. After a payment that used points, on a till that prints through QZ Tray
   (`print_type` qz), PaymentDialog prints the receipt with the till's `printOrder` and the
   POS Profile's print format (owner, 2026-11-05): erp_restaurant's
   "Restaurant Receipt" shows the points used among the payments, the points earned and the
   new balance (`loyalty.receipt_points`). Not awaited: a failed print shows a message to
   reprint from Recently Paid and the payment stays. No print when no points were used
   (URY prints nothing after payment). Not on network or browser printing: network printing
   returns its failures without an error, and a print view opened after the payment's await
   is outside the tap and would be blocked as a popup on the iPad; there the cashier reprints
   from Recently Paid.
4. The "New customer" form (CustomerPicker) has a "loyalty card" box, which is also the
   customer's consent (owner, 2026-11-05: cashiers enroll at the till). The box shows only
   while the restaurant's loyalty program is on (erp_restaurant `loyalty.till_loyalty_on`,
   owner app Settings > Fidélité on / off); off, the server also gives no points, refuses
   cards ("Le programme de fidélité est désactivé") and refuses enrollment. It sends
   `loyalty_card`, `consent` and the till's `pos_profile` to `ury.ury_pos.api.create_customer`,
   which erp_restaurant replaces (`api/ury_compat.create_customer`: the site's customer group
   and territory instead of URY's "Individual" / "India", which made every creation fail, and
   the enrollment). `addCustomer` keeps the answer's `name` (a homonym gets a suffix) and
   `loyalty_code`; with a code, LoyaltyCardDialog opens: the QR drawn by erp_restaurant
   (`loyalty.get_card`), "Imprimer" (print format "Loyalty Card" on the bill printer through QZ
   Tray, else the browser's print view opened in the tap), "Télécharger" and "Partager" (a PNG
   card laid out like the owner app's, built when the card loads so the tap calls the Web
   Share API without waiting, which Safari requires; a refused share downloads the card).

Why it can't be done in `erp_restaurant`: the scan is keyboard input in the till's page,
and the order's customer and the payment rows live in the POS React state and dialog.
Everything else is in erp_restaurant: the code check, points earned (POS Invoice
before_validate sets the loyalty program), the redemption (`api/ury_compat.make_invoice`
passes the points to `loyalty.set_order_loyalty`, ERPNext checks the balance and the total
and counts the amount as paid), the daily closing line, the points lines on the receipt, the
customer creation and enrollment, the QR and the card's print format, the on / off flag read by
`loyalty.till_loyalty_on`; the till only adds the form's box, the card window and the print
triggers.

Risk profile: medium. PaymentDialog.tsx is also changed by Patches 07, 09, 19/23 and 45,
and this patch changes payment amounts when points are used. CustomerPicker.tsx is also
changed by Patch 46 (git log since the pin), was refactored upstream shortly before the pin, and is used
by the order panel, BillSplitDialog and the waiter app (CustomerSelect), so the loyalty box
and the card window appear in all three. A document keydown listener
could swallow an Enter: it only does for a `LOY...` burst typed at scanner speed. The next
order goes back to the counter customer through the existing reset (Patch 04 default
customer). Entering points overwrites cash already typed (as a discount already does).
Known gaps: no scan in the waiter (captain) app (a scan there only shows the message), the
emergency till (/caisse) or the customer QR app; a waiter may create a card (box and card
window), where "Imprimer" uses the till's QZ host and likely fails on a phone with the
"Carte non imprimée" message, while Télécharger and Partager work; the box with a phone that
belongs to an existing individual customer enrolls that customer and renames it to the name
typed (as the owner app does); the cashier can also pick the customer by
name or phone with the existing customer search. Unknown until the scanner test: whether
iPadOS sends key presses to the page when nothing is focused, and whether a connected
scanner hides the on-screen keyboard cashiers use for amounts.

Acceptance criteria:
1. With the cursor in the menu search or nowhere, scanning a member's QR sets that customer
   on the current order within a second, the search box keeps no scanned text, a toast
   shows the name and points.
2. After paying (or a new order), the customer is the counter customer again.
3. A turned-off or reissued (old) card: "Carte fidélité inconnue ou désactivée", customer
   unchanged. Typing "LOY" by hand in the search box does nothing special.
4. Payment for a member with points: block shown, "Tout utiliser" caps at the balance and
   the total, left to pay and the cash prefill drop by the points' value, paying succeeds;
   the POS Invoice has redeem_loyalty_points, loyalty_points and loyalty_amount set.
5. Points covering the whole order: left to pay 0, paying sends one row at 0 on cash and
   succeeds.
6. Counter customer, a company, a merged bill: no loyalty block.
7. Arabic: block and toasts right to left.
8. An item barcode scanned into the search box still finds the item.
9. A scan on Orders, with the payment dialog open, and in the waiter app: message, the order
   being paid keeps its customer.
10. A scan while editing a sent order: message, customer unchanged.
11. Discount then points: the points apply to the discounted total.
12. Cash tendered above what is left to pay: correct change.
13. Rounding to 0.5 on, factor 0.5, a total with cents, "Tout utiliser": accepted.
14. iPad hardware keyboard set to Arabic: the scan still works. English pass.
15. Till with print_type qz and print format "Restaurant Receipt": paying with points prints
    the receipt once on the bill printer (points used, earned, new balance); paying without
    points prints nothing; with QZ Tray closed, the "Receipt not printed" message and the
    order is paid.
16. New customer without the box: created (no "Échec de la création du client") in the site's
    group and territory, set on the order, no card window. A phone already on a customer: the
    message names that customer.
17. New customer with the box: card window with the QR, the order has that customer; scanning
    the QR on a new order sets the customer.
18. "Imprimer" on a QZ till prints the card on the bill printer (restaurant, name, QR, code);
    the printed QR scans. "Télécharger" saves the PNG; "Partager" on the iPad opens the share
    sheet (WhatsApp).
19. Box ticked without a loyalty program set up: the server's message, no customer created.
20. Program turned off in the owner app: no box in the New customer form (after reopening
    it), no points block in the payment dialog, a scan shows "Le programme de fidélité est
    désactivé" and keeps the customer; turned on again: all back.

Patch file: `patches/47-loyalty-scan-and-points.patch`. Commits: 92ea2b5d; receipt print after payment: 5d126d89; card from the till: a0e548a9; box hidden when the program is off: a96bfdd7.

### Patch 48 — QZ Tray prints on 80 mm paper, laid out for the SPRT driver

Replaced by Patch 50 (2026-11-05): its code is gone from `qz.ts`, but apply its patch file
before 50's (50 is a diff on top of 48).

Fix (ticket 04, owner printer tests 2026-11-05, SPRT POS8811 80 mm, printable 72 mm, 203 dpi).
QZ Tray got no paper settings from the POS, so they came from the driver or Java:
- Windows: paper 80 mm (227 pt) but the driver reports 600 dpi, about 3x the head's 203 dpi,
  so the bill printed about 3x zoomed and cut (QZ log: "Print resolution = 600dpi").
- macOS (CUPS): Java ignored the CUPS default (80 x 210 mm) and used A4 (595 pt): a blank
  short ticket.
Tried: 96 mm (0f65e85b, still zoomed), 250 mm (15d93fd5, correct on Windows), then the real
80 mm with `density: 8` (e4e9ce5c): both drivers kept their resolution (QZ applies no
density to HTML, "Zooming in by x1.0"), so Windows printed 3x zoomed again and macOS stayed
blank. Back to 250 mm, keeping the 80 mm paper size.

Files touched: `packages/core/src/print/qz.ts` (`printWithQz` config and data options only)

What it does: every QZ Tray print (bill and kitchen tickets, Patch 10) asks for 80 x 297 mm
paper (`size`, units mm) and lays the HTML out 250 mm wide (`pageWidth: 250`), scaled to the
paper: that cancels the Windows driver's 600 dpi for a 203 dpi head (measured on paper). erp_restaurant's "Restaurant
Receipt" and "Kitchen Ticket" are 68 mm wide, 5 mm from the left (erp_restaurant 1393382),
inside the 72 mm the head prints.

Why it can't be done in `erp_restaurant`: the QZ Tray page settings are built in the
browser by the shared `@ury/core` print transport; erp_restaurant only supplies the HTML,
and QZ's HTML renderer ignores CSS `@page`.

Risk profile: medium. Every QZ print in pos changes (frontend does not print). Calibrated on the SPRT Windows
driver: a driver reporting its real resolution would print about a third of the size.
macOS: still a blank short ticket with correct 80 mm paper in the QZ log; Unknown whether
the macOS SPRT driver prints at all (check with TextEdit). Re-test any other model or driver.

Acceptance criteria:
1. Windows, SPRT 80 mm: a bill prints at real size, whole width ("18.00 DH" and
   the full IF number), centered, logo above the name.
2. Auto-printed and reprinted kitchen tickets: same.
3. The ticket is cut after its content, not after 29.7 cm of blank paper.

Manual test (test-dev, on each computer with QZ Tray and the SPRT printer):
1. Hard-refresh /pos so the new bundle loads.
2. Take a takeaway order with one `Test ...` item; the kitchen ticket auto-prints.
3. In Orders, print the bill.
4. Check criteria 1 to 3; photo and the QZ log lines "Print resolution" and "Page layout"
   if anything is off.
5. Reprint the kitchen ticket from Orders; cancel the test order.

Patch file: `patches/48-qz-page-width.patch`. Commits: 0f65e85b, 15d93fd5, e4e9ce5c, c257f989.

### Patch 49 — One tap back to the default customer

Owner request (2026-11-05, ticket 39): after a loyalty scan (Patch 47), or any customer picked
by mistake, going back to the counter customer meant "Modifier" then typing "Client" in the
search, which opens the on-screen keyboard on the touch-screen tills.

Files touched: `pos/src/components/CustomerPicker.tsx` (customer card only), locales
(`customer.back_to_default`).

What it does: the customer card shows a second button, a circular arrow with the default
customer's name, next to "Modifier", when the POS Profile has a default customer (Patch 04,
`posProfile.customer`) and the order's customer is another one. One tap sets that default
customer, built the same way as Patch 04's `getDefaultCustomer` (id and name = the POS
Profile's customer). Same `disabled` lock as "Modifier": a sent order keeps its customer.
Delivery-platform orders show the platform picker instead of the card (CustomerSelect), so
the button never appears there.

Why it can't be done in `erp_restaurant`: the customer card and the order's customer are in
the POS React state; there is no server or configuration point.

Risk profile: low. A few lines in the card's markup (and `min-w-0` on the name, so a long
name wraps instead of squeezing the buttons); CustomerPicker.tsx is also changed by Patches
46 and 47 (git log since the pin). The card is also used by BillSplitDialog and the
waiter app, where the button behaves the same.

Acceptance criteria:
1. Loyalty customer set by a scan: the button "Client comptoir" (the till's default customer)
   is next to "Modifier"; one tap sets Client comptoir, with no keyboard.
2. Customer already the default: no button.
3. Order already sent to the kitchen (customer locked): the button is disabled like "Modifier".
4. Arabic: arrow mirrored, label read right to left; English and French labels.
5. Touch screen: the button is easy to hit (40 px high).

Manual test (test-dev, touch-screen till):
1. Hard-refresh /pos. New takeaway order: the card shows Client comptoir and no extra button.
2. Scan a loyalty card (or pick a customer): the button appears; tap it: Client comptoir is
   back, no keyboard opens.
3. Pick the customer again, add an item, send the order, reopen it from Orders: both buttons
   disabled.
4. Arabic once; the waiter app and the bill-split window once (same button).

Patch file: `patches/49-back-to-default-customer.patch`. Commit: 885d0054.

### Patch 50 — QZ Tray prints ESC/POS raster images drawn by the browser

Fix (ticket 04, owner printer tests 2026-11-05). Patch 48's 250 mm layout was right on one
Windows PC (driver at 600 dpi) and printed the whole bill 3x smaller on a second one (same
SPRT printer over Ethernet, driver at 203 dpi, QZ log "Print resolution = 203dpi",
"Paper area 0,0:226,841"). QZ's HTML print is sized by each PC's driver, so no fixed value
fits every till.

Files touched: `packages/core/src/print/qz.ts` (`printWithQz` data and config; new
helpers `htmlToEscPos`, `drawTicket`, `toBits`, `inlineImages`),
`packages/core/src/frappe/errors.ts` (`printDraw` message, `errorMessage` getter, on top of
Patch 46), `pos/src/main.tsx` (passes it translated), locales (`errors.print_draw` en/fr/ar)

What it does: every QZ Tray print (bill, kitchen tickets Patch 10, loyalty card Patch 47)
is drawn by the browser and sent as raw bytes, so no driver or Windows setting resizes it:
1. The HTML is laid out 80 mm wide in an SVG `foreignObject` and drawn on a canvas at
   8 dots per mm (203 dpi); pictures (logo, QR) are fetched and inlined as data URLs
   first (a picture that cannot be fetched is left out, the ticket still prints).
2. The printable 72 mm in the middle (576 dots) is kept, as a driver would; dots darker
   than luminance 160 print black; blank rows after the content are dropped (up to 60 cm
   drawn).
3. Sent as ESC/POS: `ESC @`, `GS v 0` raster bands of 256 rows, then `GS V 66 0` (feed
   and cut). QZ `type: 'raw', format: 'command', flavor: 'base64'`.
erp_restaurant's formats are unchanged (68 mm wide, 5 mm from the left of the 80 mm paper,
so 1 mm from the printable edge).

Why it can't be done in `erp_restaurant`: the bytes sent to QZ Tray are built in the
browser by the shared `@ury/core` print transport; erp_restaurant only supplies the HTML.

Risk profile: medium. Every QZ print in pos changes (frontend does not print). `qz.ts` is
also changed by Patches 10 and 41 (other functions). Depends on:
the printer understanding ESC/POS `GS v 0` and `GS V` (SPRT POS8811: Assumption, standard
for the model class); the Windows queue passing raw bytes (QZ raw); printable width 576
dots (SPRT self-test). The driver's paper size, resolution and Windows display scaling no
longer matter. If the queue drops raw jobs, QZ can print to the printer's IP on port 9100
(config change, not built). Paper cut now comes from the ticket, not the driver. A control
character in a note (invalid XML) would make the whole print fail with `errors.print_draw`;
a ticket longer than 60 cm is printed only up to 60 cm, without an error. Layout direction is
the format's: the formats set no `dir`, so an Arabic bill keeps the item left and the amount
right, as with Patch 48.
Checked locally (Chrome, test-dev origin, 2026-11-05): the bill HTML from the QZ log and an
Arabic sample draw to a 576-dot 1-bit image, logo inlined, canvas not tainted. Not run on
a printer.
Owner test 2026-11-05 (dev bench, a40851a1): prints correctly on both Windows PCs and on a
Mac (Patch 48's blank macOS ticket gone); cancelled ticket band and paper cut checked.
Known gap (same as Patch 48): with the printer off, Windows accepts the job and the POS
shows success, nothing prints. Arabic text not checked on paper yet.

Acceptance criteria:
1. On both Windows PCs, without changing their driver settings: a bill prints at real
   size, whole width ("18.00 DH" and the full IF number), logo sharp above the name.
2. Auto-printed and reprinted kitchen tickets: same; a cancelled ticket's black title
   band prints black with white text.
3. Each ticket is cut right after its content.
4. Arabic text in a ticket (for example an Arabic line note) reads right to left with joined
   letters. Bills themselves print in French when the POS is in Arabic (Patch 42).

Manual test (test-dev, on each PC with QZ Tray and the SPRT printer):
1. Hard-refresh /pos so the new bundle loads.
2. Take a takeaway order with one `Test ...` item; the kitchen ticket auto-prints.
3. Add an Arabic note on the line (for example بدون بصل) before sending, then print the bill.
4. Reprint the kitchen ticket, then cancel the order (cancelled ticket prints).
5. Check criteria 1 to 4; if nothing prints, send the QZ log of that print.

Patch file: `patches/50-qz-escpos-raster.patch`. Commit: eaca4c77.

### Patch 51 — Network printers by IP address, error when the printer is off

Fix (ticket 04, owner test 2026-11-05): with the printer off, the POS said "printed" and
nothing came out. QZ hands the job to the computer's print queue, which accepts it whatever
the printer's state, so QZ reports success (the job may print later, when the printer is
back on).

Files touched: `packages/core/src/print/qz.ts` (`printWithQz` queue, printer choice and
error in `printOne`), `packages/core/src/frappe/errors.ts` (`printerUnreachable`, on top of
Patches 46 and 50), `pos/src/main.tsx`, `pos/src/i18n/locales/en.json`, `fr.json`, `ar.json`
(`errors.printer_unreachable`)

What it does: when the POS Profile's Kitchen Printer or Bill Printer
(`custom_kitchen_printer`, `custom_bill_printer`, erp_restaurant) is an IPv4 address, with an
optional port (`192.168.1.50`, `192.168.1.50:9100`), QZ opens a socket to the printer and
sends Patch 50's ESC/POS bytes directly (port 9100 unless given): no driver and no print
queue. Host names (`printer.local`) are not network printers: they are looked up as
installed printer names. If the socket fails (error text matching ConnectException / refused /
timed out / unreachable / no route to host / host is down; QZ Tray's own websocket errors such
as "Connection closed" are not mapped), the cashier gets the translated "The printer does not
answer" message through the existing print-failed messages. Prints from one POS tab run one at
a time (a kitchen ticket and a bill started together on the same printer IP would otherwise
compete for its single connection). A printer name or an empty field works as
before (queue, success even when the printer is off). erp_restaurant e1d6f53 describes the IP option
in the owner app placeholder and the desk field descriptions.

Why it can't be done in `erp_restaurant`: the QZ printer config is built in the browser by
the shared `@ury/core` print transport.

Risk profile: low to medium. Only tills whose printer field holds an IP address change.
Unknown: QZ's exact socket error text (unmatched errors are shown as QZ sends them; record it
from test step 4) and how long Windows or macOS waits before giving up on a printer that is
off (measure in step 4). Two POS tabs or PCs printing to the same IP at the same instant are
not queued together (Unknown whether the SPRT accepts a second connection). The printer needs a fixed IP address (set on the printer or reserved in the router).
iPads still need a PC with QZ Tray.

Acceptance criteria:
1. With the till's Kitchen and Bill Printer set to the printer's IP, kitchen tickets and
   bills print as with Patch 50.
2. Printer off: the POS shows "L'imprimante ne répond pas…" instead of success, and nothing
   prints later when the printer is turned back on.
3. Printer back on: printing works again without reloading /pos.
4. A till with a printer name still prints through the queue as before.

Manual test (test-dev, on a PC with QZ Tray):
1. Print the SPRT self-test page to read its IP address (or find it in the router).
2. /admin > Settings > Tills: set Kitchen and Bill Printer to that IP; open /pos in a new tab.
3. Take a takeaway order with a `Test ...` item and print its bill: criteria 1.
4. Turn the printer off, print the bill again: criterion 2; note how many seconds the error
   takes. Turn it on and wait: nothing should come out.
5. Print again: criterion 3.
6. With auto kitchen print on, send an order and print its bill straight away: both print.
   Cancel the test orders.

Owner test 2026-11-05 (test-dev): printing to the printer's IP works and the printer-off error
shows. Not recorded: QZ's exact error text and how long the error takes.

Patch file: `patches/51-network-printer-ip.patch`. Commit: f9b05da1.

### Patch 52 — Reflowgo in the tab titles

Feature (owner request 2026-11-05). Closes the "tab titles" item that Patch 15 left out:
the browser tabs said "URY POS" (/pos) and "URY" (/ury).

Files touched: `pos/index.html`, `frontend/index.html`, `self-order/index.html`,
`mosaic/index.html` (`<title>`), `mosaic/src/i18n.js` (`applyDocumentLanguage`, Patch 26)

What it does: the tabs read "Reflowgo - <screen>" in the user's language:

| Page | en | fr | ar |
|---|---|---|---|
| /pos (till, waiter app) | Reflowgo - POS | Reflowgo - Caisse | Reflowgo - نقطة البيع |
| /ury (management app) | Reflowgo - Management | Reflowgo - Gestion | Reflowgo - الإدارة |
| /order (customer QR app) | Reflowgo - Order | Reflowgo - Commande | Reflowgo - الطلب |
| /mosaic (kitchen screen) | Reflowgo - Kitchen | Reflowgo - Cuisine | Reflowgo - المطبخ |

/pos, /ury and /order: the title is a Jinja `{{ _("...") }}` rendered by Frappe in the
request's language (`frappe.lang`; a guest on /order gets the browser's language if the
site has it, else the site default), translated by the fr / ar rows in `erp_restaurant`
`translations/fr.csv` and `ar.csv`. Whole-title source strings so no desk word ("POS",
"Order") gets a new translation. /mosaic: "Reflowgo" in the HTML, then Patch 26 sets
"Reflowgo - " + its own "kitchen" text in the restaurant's default language.

Why it can't be done in `erp_restaurant`: the titles are text in the URY HTML entries;
`erp_restaurant` can only feed them values (Patch 15 pattern) or rewrite every response.

Not covered: the /apps tile and desk app switcher title "URY" (`ury/hooks.py`
`add_to_apps_screen`, `app_title`), the desk workspace "URY", the legacy /urypos page
(not built), print formats.

Risk profile: low. Applies after Patches 15 and 26: the patch file's context lines are
Patch 15's favicon / `app_logo_url` lines in the four HTML entries and Patch 26's
`restaurant_lang` line and `applyDocumentLanguage` in mosaic, so a conflict usually comes
from those lines, not upstream. On a conflict in an HTML entry, keep the Jinja title line.

Build: pos, frontend and self-order checked locally with Vite into a scratch folder: the
Jinja title is kept in the built HTML. Mosaic does not build locally (its Vite config needs
the bench's `sites/common_site_config.json`, also before this patch); `i18n.js` passes a
syntax check. The server deploy builds pos only (`POS_BUILD_CMD="cd pos && yarn build"`):
/ury, /order and /mosaic keep their old title until `yarn build` is run by hand in
`frontend`, `self-order` and `mosaic` (then clear-cache). erp_restaurant needs no migrate
for the translations; clear-cache.

Server check 2026-11-05 (test-dev, after deploy): /pos title "Reflowgo - Caisse" (fr),
"Reflowgo - نقطة البيع" with dir=rtl (`?_lang=ar`), "Reflowgo - POS" (`?_lang=en`).
/ury, /order, /mosaic still "URY", "Order", "Mosaic" (not rebuilt).

Acceptance criteria:
1. /pos, /ury, /order, /mosaic: no tab title contains "URY" or "Mosaic".
2. User language French: "Reflowgo - Caisse" (/pos), "Reflowgo - Gestion" (/ury).
3. User language Arabic: "Reflowgo - نقطة البيع" (/pos), "Reflowgo - الإدارة" (/ury). Check
   the words, not their order: the browser may show the mixed title as "نقطة البيع - Reflowgo".
4. /mosaic (site default French): "Reflowgo - Cuisine".
5. /order from a QR code: "Reflowgo - Commande", "Reflowgo - Order" or "Reflowgo - الطلب".
   Accepted: the title follows the phone's language (cookie, then Accept-Language, then the
   site default), not the QR app's own language switch (Patch 24), so an English phone on
   a French site shows "Reflowgo - Order" over a French app.

Manual test (test-dev): after deploy and clear-cache, open each page in a new tab as a
French user and read the tab title; switch the user's language to Arabic (and English),
reload /pos and /ury; open /order from the "Commande par QR" page in a private window.

Patch file: `patches/52-reflowgo-tab-titles.patch`. Commit: b55edd89.

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
