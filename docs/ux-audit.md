# MuambaRadar — UX/UI Audit
**Date:** 2026-04-09  
**Auditor:** Senior UI/UX / Frontend review  
**Stack:** React + Vite, CSS custom properties, `<dialog>` elements, SPA routing via `history.pushState`

---

## CRITICAL — Broken or Invisible

### C-1: Footer uses undefined CSS variables
**File:** `frontend/src/styles.css:434-435`  
```css
.app-footer {
  background: var(--bg-secondary);   /* undefined — falls back to transparent */
  border-top: 1px solid var(--border); /* undefined — no border renders */
}
```
Neither `--bg-secondary` nor `--border` are declared in `:root`, `[data-theme="light"]`, or `[data-theme="dark"]`. The footer background is transparent (shows the `.main-area` background behind it) and the separator line is invisible. The correct variables are `--card-bg` / `--content-bg` and `--line`.

**Fix:** Replace with `background: var(--card-bg); border-top: 1px solid var(--line);`

---

### C-2: `topbar-fx-rate` has no mobile hide rule
**File:** `frontend/src/styles.css:263-286` — no `@media` rule hides or truncates `.topbar-fx-rate`  
**File:** `frontend/src/components/Header.jsx:117-122`

On narrow screens (≤ 480px) the topbar already hides `.user-menu-name` and tightens padding, but `topbar-fx-rate` remains fully visible. With the compact logo, the hamburger, the FX pill, and the auth button, there is not enough space. On phones with screen width ~375px, the FX pill overflows or squashes the auth button off-screen.

**Fix:** Add to the `@media (max-width: 480px)` block:
```css
.topbar-fx-rate { display: none; }
```
Or use `max-width: 600px` for a safer threshold. Alternatively, make the label text shorter ("USD" instead of "Cotação do dólar:") for the 480-600px range and hide it below 480px.

---

### C-3: Hardcoded dark background on `.suggestions-list` breaks light theme
**File:** `frontend/src/styles.css:1483`  
```css
.suggestions-list {
  background: #1e2537;   /* hardcoded dark — unreadable in light theme */
  ...
  color: var(--chrome-text); /* reads fine on dark, not on light */
}
```
The light theme override exists (`[data-theme="light"] .suggestions-list { background: #fff; ... }`) at line 561, which does fix the background. However, `border-color: rgba(0,0,0,0.1)` in that override is subtle on the dark sidebar chrome visible beneath. The real problem: if a user changes theme mid-session the autocomplete dropdown re-renders without issues, but in light theme the initial render briefly flashes the dark background. The override should be `background: var(--card)` in the default rule so no override is needed.

**Fix (base rule):** `background: var(--card); border-color: var(--chrome-border);`  
**Remove** the `[data-theme="light"]` override for `.suggestions-list` entirely (line 561).

---

### C-4: Table view (`FlatTable`) renders outside the clickable offers column — `onOpenOffers` is passed but never called
**File:** `frontend/src/components/ResultsArea.jsx:17-71`  
`FlatTable` receives `onOpenOffers` as a prop but never calls it. Column 9 (`ft-count`) renders `{group.offers.length}` as a plain number — it looks like a count, not a button. Users who switch to table view have no way to drill into individual offers.

**Fix:** Wrap the count cell in a `<button>` or make it call `onOpenOffers(group, familyDisplayName(group), buildConfigChip(group))`.

---

### C-5: `recent-item` in Sidebar is a `<li>` with an `onClick` — not keyboard accessible
**File:** `frontend/src/components/Sidebar.jsx:191-195`  
```jsx
<li className="recent-item" onClick={() => onRecentClick(q)}>{q}</li>
```
No `tabIndex`, no `role="button"`, no `onKeyDown`. Keyboard-only users cannot activate recent searches.

**Fix:** Add `tabIndex={0} role="button" onKeyDown={e => e.key === 'Enter' && onRecentClick(q)}`, or change to `<button>`.

---

### C-6: `ucm-search-item` same problem — `<li>` is not keyboard-activatable
**File:** `frontend/src/components/UserConfigModal.jsx:300-303`  
Same pattern as C-5 inside the user config modal search history list.

**Fix:** Same as C-5.

---

## MEDIUM — Inconsistent, Missing, or Degraded Experience

### M-1: Dozens of hardcoded `#f8fafc` / `#f1f5f9` / `#fff` colors break dark theme
**File:** `frontend/src/styles.css` — lines 993, 1073, 1153, 1162, 1180, 1213, 1514, 1563, 1639, 1870, 1930, 1962, 1982, 2003, 2507 (and more)

Examples:
```css
.product-media { background: #f8fafc; }             /* line 993 */
.table-wrap    { background: #fff; }                /* line 1073 */
th             { background: #f8fafc; }             /* line 1153 */
tbody tr:hover { background: #f8fafc; }             /* line 1162 */
.flat-table thead th { background: #f8fafc; }       /* line 1982 */
.offers-inner th { background: #f1f5f9; }           /* line 1950 */
.st-detail     { background: #f8fafc; }             /* line 1930 */
.pc-img        { background: #f8fafc; }             /* line 1639 */
.family-img    { background: #f8fafc; }             /* line 1563 */
.badge-direct  { background: #f0fdf4; ... }        /* line 1213 */
```
In dark theme, all of these render as bright white/near-white patches inside dark cards. Product image placeholders, table headers, hover rows, and offer detail panels are all visually jarring. The design system defines `--card-bg: #0f1117` (dark) / `#f8fafc` (light) and `--card` for this purpose.

**Fix (systematic):** Do a find-replace pass:
- `background: #f8fafc` → `background: var(--card-bg)`
- `background: #f1f5f9` → `background: var(--card-bg)`
- `background: #fff1f0`, `#fff7ed`, `#f0fdf4` — these are semantic (country/status colors); check dark-mode equivalents are covered by `--py-bg` / `--br-bg` / `--success-bg` etc.
- `background: #fff` in `.table-wrap` (line 1073) → `background: var(--card)`

---

### M-2: `confidence-high/mid/low` pills are hardcoded light colors — invisible in dark
**File:** `frontend/src/styles.css:1063-1065`  
```css
.confidence-high { background: #f0fdf4; color: #15803d; border-color: #86efac; }
.confidence-mid  { background: #fefce8; color: #92400e; border-color: #fde047; }
.confidence-low  { background: #fff1f2; color: #be123c; border-color: #fda4af; }
```
No dark theme override. These use the same palette as `--success-bg/border` and `--danger-bg/border` but don't reference the variables.

**Fix:** Replace hardcoded values with the corresponding CSS variables. E.g.:
```css
.confidence-high { background: var(--success-bg); color: var(--success); border-color: var(--success-border); }
.confidence-low  { background: var(--danger-bg);  color: var(--danger);  border-color: var(--danger-border); }
```

---

### M-3: `.margin-tag` has hardcoded light-mode green — dark theme contrast fails
**File:** `frontend/src/styles.css:1891-1900`  
```css
.margin-tag {
  background: #f0fdf4;
  color: #15803d;
  border: 1px solid #86efac;
}
```
In dark theme, `#f0fdf4` (very light green) on a `#161b27` card is fine for background but `#15803d` is a dark green — contrast against the light background still works, but the entire chip looks out of place (a white patch). Should use `--success-bg`, `--success`, `--success-border`.

---

### M-4: `.deal-estimate` uses hardcoded `#f8fffe` and `#22c55e` — no dark override
**File:** `frontend/src/styles.css:1128-1129`  
```css
.deal-estimate { background: #f8fffe; border-top: 3px solid #22c55e; }
.deal-estimate .deal-label { color: #15803d; }
```
Use `--success-bg` and `--success` / `--br-color`.

---

### M-5: `category-notice-title` uses hardcoded `rgb(251,191,36)` — not a CSS variable
**File:** `frontend/src/styles.css:1812`  
```css
.category-notice-title { color: rgb(251,191,36); }
```
Should be `var(--warning)` which is `#d97706` (light) / `#e5a244` (dark).

---

### M-6: `auth-modal-close` and `ucm-close` have no visible focus ring
**File:** `frontend/src/styles.css:1392-1404`  
The close buttons (`×`) have `color: var(--muted)` on hover but no `:focus-visible` outline. Keyboard users tabbing to the close button get no visual indication of focus.

**Fix:** Add:
```css
.auth-modal-close:focus-visible,
.ucm-close:focus-visible { outline: 2px solid rgba(79,70,229,0.5); border-radius: 4px; }
```

---

### M-7: `expand-btn` in ProductCard has no `aria-label`
**File:** `frontend/src/components/ProductCard.jsx:89-91`  
```jsx
<button className="expand-btn" type="button" onClick={handleExpand}>
  &#x25BE; {group.offers.length}
</button>
```
Screen readers will announce "▾ 3" with no context. The button should describe what it does.

**Fix:** `aria-label={`Ver ${group.offers.length} oferta${group.offers.length !== 1 ? 's' : ''}`}`

---

### M-8: `user-menu-trigger` missing `aria-expanded`
**File:** `frontend/src/components/Header.jsx:129-139`  
The user menu toggle button doesn't communicate its open/closed state to screen readers.

**Fix:** Add `aria-expanded={dropdownOpen}` and `aria-haspopup="menu"` to the trigger button.

---

### M-9: No empty state UI when results are zero
**File:** `frontend/src/components/ResultsArea.jsx:209-232`  
When `!isLoading && displayed.length === 0 && lastData != null` the component renders nothing — a completely empty `<section className="results">`. The status bar shows "Nenhum resultado encontrado" as a small text line in the toolbar, but the main content area is blank. Users may think the page is broken.

**Fix:** Add an empty state inside the `<section>`:
```jsx
{!isLoading && displayed.length === 0 && lastData != null && (
  <div className="empty-state">
    <p>Nenhum produto encontrado para "{lastQuery}".</p>
    <button onClick={onClear}>Limpar busca</button>
  </div>
)}
```

---

### M-10: Loading state only during `isLoading` — no skeleton on stale-refresh
**File:** `frontend/src/App.jsx:219-240`, `frontend/src/components/ResultsArea.jsx`  
When `isStale` is true and the user triggers a refresh, the old results remain visible and `isStale` badge spins, but there is no indication that a background fetch is happening. The `isLoading` flag is set which triggers the `LoadingScene`, wiping out the existing results. This means every re-search (even for cache refresh) triggers the full dramatic loading animation, which is disorienting.

**Note:** This is more of an architecture observation than a pure CSS issue. Worth revisiting whether a subtler overlay on re-search is preferable.

---

### M-11: PrivacyPage / TermsPage are not part of the `app-shell` layout — no footer
**File:** `frontend/src/App.jsx:310-316`  
```jsx
{page === 'privacidade' ? (
  <PrivacyPage onBack={goHome} />
) : ...}
```
Legal pages render outside `.app-shell` entirely — they don't get the footer with Privacy / Terms links. The layout is also full-viewport with no `max-height` constraint, so the page scrolls correctly, but the Header remains fixed (`position: fixed`) while the legal page body needs `padding-top: var(--topbar-h)` to not hide under the header.

**Check:** Does `.legal-page` have `padding-top`? Looking at `frontend/src/styles.css:461-465`:
```css
.legal-page {
  padding: 2rem 1rem;   /* no padding-top compensation for the fixed header */
}
```
The first heading will be hidden under the topbar on initial render. The "Voltar" button is the first element so partially works, but `<h1>` is cut off.

**Fix:** Add `padding-top: calc(var(--topbar-h) + 2rem)` to `.legal-page`, or wrap legal pages in a div with `margin-top: var(--topbar-h)`.

---

### M-12: `auth-consent` checkbox has no styled focus ring
**File:** `frontend/src/styles.css:1461-1472`  
The consent checkbox at registration uses the browser default unstyled checkbox. No focus ring is specified. Pair this with the fact that `regError` fires on submit (not on blur), so users can click submit, get the error, but the checkbox shows no visual error state (only the text error message below).

**Fix:** Add a focus-visible style to `.auth-consent input[type="checkbox"]:focus-visible`. Consider also adding a red border to the consent label when `regError` is set but `!regAccepted`.

---

### M-13: Dark theme — `user-menu-name` uses `rgba(255,255,255,0.6)` — not a variable
**File:** `frontend/src/styles.css:308-309`  
```css
.user-menu-name { color: rgba(255,255,255,0.6); }
.user-menu-name strong { color: #fff; }
```
Light-mode overrides exist (lines 339-340) but the base values are hardcoded. Should use `var(--chrome-text)` and `var(--chrome-heading)` for consistency with the rest of the chrome.

---

### M-14: `icon-btn` uses hardcoded `rgba(255,255,255,...)` colors in base rule
**File:** `frontend/src/styles.css:354-371`  
```css
.icon-btn {
  background: rgba(255,255,255,0.06);
  border: 1px solid rgba(255,255,255,0.1);
  color: rgba(255,255,255,0.5);
}
```
Light-theme overrides exist (line 521) but the base values assume a dark chrome. If `chrome` variable is used correctly, `icon-btn` should reference `--chrome-hover` and `--chrome-text` so overrides become unnecessary.

---

### M-15: `results-disclaimer` has no padding-left alignment with the product grid
**File:** `frontend/src/styles.css:934-949`  
```css
.results-disclaimer { padding: 0 4px 32px; }
```
The `.results` container has `padding: 18px 20px 40px` (line 928). The disclaimer is inside `ResultsArea` as a sibling to `.results` (outside the scrollable results section), with its own `padding: 0 4px 32px`. This means disclaimer text is nearly flush-left while the grid above has 20px horizontal padding — they don't align.

**Fix:** Change `.results-disclaimer` padding to match: `padding: 0 20px 32px` or use the same `20px` horizontal value.

---

### M-16: `results-disclaimer-customs` uses `!important` to override a color
**File:** `frontend/src/styles.css:947-949`  
```css
.results-disclaimer-customs {
  color: var(--muted) !important;
}
```
The `!important` is needed because `.results-disclaimer span` already sets `color: var(--text-muted)`. Since `--muted` and `--text-muted` are different variables (`#64748b` vs `#94a3b8`), one of them is redundant. Remove `!important` and make the specificity explicit instead.

---

## LOW — Polish and Minor Inconsistencies

### L-1: `compare-btn` uses `font-family: "Space Grotesk"` but other buttons use `inherit`
**File:** `frontend/src/styles.css:688`  
The compare button explicitly sets Space Grotesk. Other primary action buttons (`btn-save`, `btn-delete`, `expand-btn`) use `font-family: inherit` which resolves to Inter. This is intentional for the compare button (it's the hero action), but it should be documented or tokenized.

---

### L-2: Two `@keyframes spin` declarations
**File:** `frontend/src/styles.css:834` and `frontend/src/styles.css:2049`  
`@keyframes spin` is declared twice identically. No functional bug (last one wins, both are the same), but dead code.

**Fix:** Remove the duplicate at line 834 (keep the one at 2049 near the animation section).

---

### L-3: Two `@media (max-width: 820px)` blocks for flat-table and variants
**File:** `frontend/src/styles.css:2032-2045`  
Two separate `@media (max-width: 820px)` blocks instead of one. Functional but messy.

---

### L-4: Stale badge (`.badge-stale`) uses hardcoded `#f8fafc`
**File:** `frontend/src/styles.css:1514`  
```css
.badge-stale { background: #f8fafc; }
```
Renders as a bright patch in dark mode. Use `var(--card-bg)`.

---

### L-5: `od-chip` in OffersDialog uses hardcoded `#f1f5f9`
**File:** `frontend/src/styles.css:1329-1341`  
```css
.od-chip { background: #f1f5f9; color: var(--muted); }
```
Same issue — bright in dark mode. Use `var(--card-bg)`.

---

### L-6: `table-wrap` has `background: #fff` (hardcoded)
**File:** `frontend/src/styles.css:1073`  
```css
.table-wrap { background: #fff; }
```
Use `var(--card)`.

---

### L-7: `pc-img`, `pc-detail`, `family-img` all have `background: #f8fafc` (hardcoded)
**File:** `frontend/src/styles.css:1639, 1563, 1870`  
Three separate image placeholder containers all hardcode the same light surface color. Use `var(--card-bg)`.

---

### L-8: `auth-modal-close` has no `type="button"` attribute
**File:** `frontend/src/components/AuthModal.jsx:102-107`  
The close button is inside a `<dialog>` but not inside a `<form>`. Without `type="button"`, it defaults to `type="submit"`. In this case it won't accidentally submit since there is no `<form>` wrapping it, but it's a latent risk and bad practice.

**Fix:** Add `type="button"`.

---

### L-9: Legal pages (`PrivacyPage`, `TermsPage`) have no `<title>` or `document.title` update
**File:** `frontend/src/components/PrivacyPage.jsx`, `frontend/src/components/TermsPage.jsx`  
The browser tab title remains "MuambaRadar" on all pages. Legal pages should update `document.title` for SEO and usability.

**Fix:** Add `useEffect(() => { document.title = 'Política de Privacidade — MuambaRadar' }, [])` in each component.

---

### L-10: `flag-arrow` color `rgba(255,255,255,0.25)` on light chrome
**File:** `frontend/src/styles.css:253-254`  
```css
.flag-arrow { color: rgba(255,255,255,0.25); }
```
The light-theme override (line 518) fixes this: `color: rgba(0,0,0,0.2)`. But the base rule assumes a dark chrome. Should default to a CSS variable.

---

### L-11: `user-dropdown` drop-shadow uses hardcoded `rgba(0,0,0,0.3)` — not `--shadow-lg`
**File:** `frontend/src/styles.css:314`  
```css
.user-dropdown { box-shadow: 0 8px 32px rgba(0,0,0,0.3); }
```
`--shadow-lg` already exists (`0 8px 32px rgba(0,0,0,0.12)` in light, `0 8px 32px rgba(0,0,0,0.4)` in dark). Use the variable.

---

### L-12: `UserConfigModal` inline `style` attributes for flexbox layout
**File:** `frontend/src/components/UserConfigModal.jsx:276, 326`  
```jsx
<div style={{ display: 'flex', gap: 8, marginTop: 4 }}>
<div style={{ display: 'flex', gap: 8, marginTop: 6 }}>
```
Two instances of inline styles for button rows. Should be a utility class (e.g. `.btn-row`) to keep styling in CSS.

---

### L-13: `auth-consent` links open in `_blank` without visual indicator
**File:** `frontend/src/components/AuthModal.jsx:211-213`  
The Privacy Policy and Terms links in the consent checkbox open in a new tab (`target="_blank"`) with no visual cue (no icon, no `aria-label` mentioning "opens in new tab"). This is a minor accessibility and UX expectation gap.

---

### L-14: `topbar-fx-rate` title attribute is informational but not accessible
**File:** `frontend/src/components/Header.jsx:118`  
```jsx
<span className="topbar-fx-rate" title="Cotação USD → BRL (comprasparaguai.com.br)">
```
`title` on a non-interactive element is not keyboard-reachable and not announced by screen readers by default. The source attribution is useful but invisible to many users.

**Fix:** Consider making the element a `<button>` or `<a>` pointing to the source, or add a `<abbr>` with the title on "Cotação do dólar".

---

### L-15: No `focus` style on `.view-chip` buttons
**File:** `frontend/src/styles.css:909-921`  
`.view-chip` has hover and `.is-active` states but no `:focus-visible` ring. Keyboard users tabbing through toolbar controls get no indicator when these buttons are focused.

---

### L-16: `.ucm-search-item` has no keyboard activation (mirror of C-6 for completeness)
Already filed as C-6 above.

---

### L-17: The `⬇` emoji in export button is not accessible
**File:** `frontend/src/components/UserConfigModal.jsx:316`  
```jsx
<button ...>⬇ Exportar meus dados (JSON)</button>
```
Emoji in button text is read as "down arrow" by screen readers, creating noise. Use a `<span aria-hidden="true">⬇</span>` or an SVG icon with `aria-hidden`.

---

## Quick Wins (under 5 minutes each)

| # | What | Where | Fix |
|---|------|--------|-----|
| QW-1 | Footer invisible border and transparent bg | `styles.css:434-435` | `var(--card-bg)` + `var(--line)` |
| QW-2 | Hide `topbar-fx-rate` on mobile | `styles.css` | Add `.topbar-fx-rate { display: none; }` inside `@media (max-width: 480px)` |
| QW-3 | Remove duplicate `@keyframes spin` | `styles.css:834` | Delete lines 834 (keep 2049) |
| QW-4 | `badge-stale` background fix | `styles.css:1514` | `background: var(--card-bg)` |
| QW-5 | `od-chip` background fix | `styles.css:1329` | `background: var(--card-bg)` |
| QW-6 | `table-wrap` background fix | `styles.css:1073` | `background: var(--card)` |
| QW-7 | Add `type="button"` to auth modal close | `AuthModal.jsx:102` | `type="button"` attribute |
| QW-8 | Add `document.title` to legal pages | `PrivacyPage.jsx`, `TermsPage.jsx` | One `useEffect` each |
| QW-9 | Add `aria-expanded` to user menu trigger | `Header.jsx:129` | `aria-expanded={dropdownOpen}` |
| QW-10 | Fix `results-disclaimer` left padding | `styles.css:934` | `padding: 0 20px 32px` |
| QW-11 | Add `aria-label` to `expand-btn` | `ProductCard.jsx:89` | `aria-label="Ver N ofertas"` |
| QW-12 | `confidence-*` pills use CSS variables | `styles.css:1063-1065` | Replace with `--success-bg`, `--danger-bg` etc. |

---

## Summary by Category

| Category | Critical | Medium | Low |
|----------|----------|--------|-----|
| Dark theme breakage | C-3 | M-1, M-2, M-3, M-4, M-11 | L-4, L-5, L-6, L-7, L-10, L-11 |
| Broken variables | C-1 | — | — |
| Responsive / mobile | C-2 | — | — |
| Keyboard / Accessibility | C-5, C-6 | M-6, M-7, M-8, M-12 | L-13, L-14, L-15, L-17 |
| Missing functionality | C-4 | M-9 | — |
| Inconsistent tokens | — | M-5, M-13, M-14, M-16 | L-1, L-2, L-3, L-12 |
| Layout / spacing | — | M-11, M-15 | L-9 |
| UX / loading | — | M-10 | — |

**Highest-impact items to fix first:** C-1 (footer broken), C-2 (mobile overflow), M-1 (dark mode mass hardcodes), C-4 (table view dead CTA), C-5/C-6 (keyboard inaccessible lists).
