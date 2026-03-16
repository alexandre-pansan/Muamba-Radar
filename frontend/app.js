// Surface any uncaught JS error in the status bar so it's visible during dev
window.addEventListener("error", (ev) => {
  const el = document.getElementById("status");
  if (el) { el.textContent = `JS error: ${ev.message} (${ev.filename?.split("/").pop()}:${ev.lineno})`; el.classList.add("error"); }
});

const queryInput       = document.getElementById("queryInput");
const sortSelect       = document.getElementById("sortSelect");
const groupOrderSelect = document.getElementById("groupOrderSelect");
const viewModeButtons  = document.getElementById("viewModeButtons");
const marginButtons    = document.getElementById("marginButtons");
const searchBtn        = document.getElementById("searchBtn");
const btnLabel         = searchBtn?.querySelector(".btn-label");
// const imageInput  = document.getElementById("imageInput");   // image detection deferred
// const imagePreview = document.getElementById("imagePreview"); // image detection deferred
const statusNode       = document.getElementById("status");
const retryBtn         = document.getElementById("retryBtn");
const clearBtn         = document.getElementById("clearBtn");
const resultsNode      = document.getElementById("results");
const groupTemplate    = document.getElementById("groupTemplate");

// Cached state
let lastData        = null; // last API response — lets sort/view re-render without re-fetching
let lastQuery       = null; // last text query — used by Retry
let _featuredImages = [];   // product images from DB, seeded on load for the loading scene

// ── Getters ────────────────────────────────────────────────────────────────

function getSelectedMarginPct() {
  const active = marginButtons?.querySelector(".margin-chip.is-active");
  const raw    = active?.dataset?.margin ?? "20";
  const parsed = Number.parseFloat(raw);
  return Number.isFinite(parsed) ? parsed : 20;
}

function getSelectedViewMode() {
  return viewModeButtons?.querySelector(".view-chip.is-active")?.dataset?.view === "table"
    ? "table"
    : "card";
}

function getApiBase() {
  // Prefer config.js value (set by Docker entrypoint or setup.ps1).
  if (typeof window.__MUAMBA_API__ === "string") {
    return window.__MUAMBA_API__.replace(/\/+$/, "");
  }
  // config.js didn't load — auto-detect: port 80 means nginx proxy (relative),
  // any other port means direct dev server → hit backend on :8000.
  const p = window.location.port;
  return (p === "80" || p === "443" || p === "") ? "" : "http://localhost:8000";
}

// ── UI state helpers ───────────────────────────────────────────────────────

function setStatus(message, isError = false) {
  statusNode.textContent = message;
  statusNode.classList.toggle("error", Boolean(isError));
  retryBtn.hidden = !(isError && lastQuery !== null);
}

function setSearchLoading(loading) {
  if (searchBtn) searchBtn.disabled = loading;
  if (btnLabel)  btnLabel.textContent = loading ? t("search.btn_loading") : t("search.btn");
  searchBtn.classList.toggle("is-loading", loading);
  if (loading) {
    retryBtn.hidden = true;
    _showSkeletonLoading();
  } else {
    _hideSkeletonLoading();
  }
}

// Launch one flyer across the scene, then relaunch with a new image when done.
// wrap   = .lf-flyer-wrap  (handles horizontal travel + opacity via lf-fly)
// state  = { index }       (advances the image pool on each pass)
function _launchFlyer(wrap, pool, state) {
  if (!wrap.isConnected) return;
  const scene = wrap.closest(".loading-scene");
  if (!scene) return;

  const sceneW   = scene.offsetWidth;
  const sceneH   = scene.offsetHeight;
  const tileSize = 120;

  // Random vertical position: keep tile fully visible (10%–78% of height)
  const topPx = Math.round(sceneH * 0.10 + Math.random() * sceneH * 0.68);
  wrap.style.top = `${topPx}px`;

  // Random direction — start X off-screen; --fly-dx drives travel distance
  const goLtr = Math.random() > 0.5;
  const dist   = sceneW + tileSize * 2 + 40;
  wrap.style.left = goLtr ? `${-(tileSize + 20)}px` : `${sceneW + 20}px`;
  wrap.style.setProperty("--fly-dx", `${goLtr ? dist : -dist}px`);

  // Random speed: 2.6–5.0 s
  const dur = (2.6 + Math.random() * 2.4).toFixed(2);

  // Advance to next image in pool
  state.index = (state.index + 1) % pool.length;
  wrap.querySelector("img").src = pool[state.index];

  // Restart lf-fly animation cleanly (reflow between "none" and new value)
  wrap.style.animation = "none";
  void wrap.offsetWidth;
  wrap.style.animation = `lf-fly ${dur}s linear forwards`;
}

function _showSkeletonLoading() {
  resultsNode.innerHTML = "";
  clearBtn.hidden = true;
  resultsNode.classList.add("is-loading");

  const scene = document.createElement("div");
  scene.className = "loading-scene";
  scene.id = "loadingScene";

  resultsNode.appendChild(scene);

  // Central text block
  const center = document.createElement("div");
  center.className = "lf-center";
  center.innerHTML = `
    <div class="lf-glow"></div>
    <p class="lf-headline">${t("loading.comparing")}</p>
    <p class="lf-sub">${t("loading.tagline")}</p>
    <div class="lf-dots"><span></span><span></span><span></span></div>`;
  scene.appendChild(center);

  // Flyers — only when we have images
  const pool = _featuredImages;
  if (pool.length) {
    const N = 4; // concurrent flyers
    for (let i = 0; i < N; i++) {
      // Outer wrap: absolute position + horizontal fly animation
      const wrap = document.createElement("div");
      wrap.className = "lf-flyer-wrap";

      // Inner tile: box styling + bob/giggle CSS animations
      const tile = document.createElement("div");
      tile.className = "lf-flyer";

      const img = document.createElement("img");
      img.alt = "";
      img.src = pool[i % pool.length];

      tile.appendChild(img);
      wrap.appendChild(tile);
      scene.appendChild(wrap);

      const state = { index: i };
      // animationend fires on the wrap (lf-fly); relaunch with next image
      wrap.addEventListener("animationend", () => _launchFlyer(wrap, pool, state));

      // Stagger initial launches so they don't all enter at once
      setTimeout(() => _launchFlyer(wrap, pool, state), i * 780);
    }
  }
}

function _hideSkeletonLoading() {
  document.getElementById("loadingScene")?.remove();
  resultsNode.classList.remove("is-loading");
}

// ── Formatting ─────────────────────────────────────────────────────────────

function formatMoney(amount, currency) {
  try {
    return new Intl.NumberFormat("pt-BR", { style: "currency", currency }).format(amount);
  } catch {
    return `${amount} ${currency}`;
  }
}

function countryBadge(country) {
  const c = (country || "").toLowerCase();
  if (c === "py") return '<span class="badge-country badge-py">Paraguay</span>';
  if (c === "br") return '<span class="badge-country badge-br">Brazil</span>';
  return '<span class="badge-country">Unknown</span>';
}

function linkTypeBadge(url) {
  try {
    const { hostname: host, pathname: path } = new URL(url);
    const h = host.toLowerCase();
    const p = path.toLowerCase();
    const direct =
      h.includes("produto.mercadolivre.com.br") ||
      /\/mlb-\d+/.test(p) ||
      p.includes("/p/mlb") ||
      (h.includes("comprasparaguai.com.br") &&
        (p.includes("/produto") || p.includes("/oferta") || p.includes("/promocao")));
    return direct
      ? '<span class="badge-link badge-direct">Direct</span>'
      : '<span class="badge-link badge-fallback">Listing</span>';
  } catch {
    return '<span class="badge-link badge-fallback">Invalid</span>';
  }
}

function sourceDomain(url) {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return t("card.source");
  }
}

function confidenceClass(score) {
  if (score >= 0.8) return "confidence-high";
  if (score >= 0.6) return "confidence-mid";
  return "confidence-low";
}

// ── Price math ─────────────────────────────────────────────────────────────

function cheapestByCountry(offers, country) {
  const filtered = (offers || []).filter((o) => (o.country || "").toLowerCase() === country);
  if (!filtered.length) return null;
  return filtered.reduce((best, cur) => (cur.price.amount_brl < best.price.amount_brl ? cur : best));
}

function estimateSellingPrice(pyOffer, brOffer, marginPct) {
  const margin   = Number.isFinite(marginPct) ? marginPct / 100 : 0.2;
  const pyCost   = pyOffer?.price?.amount_brl ?? null;
  const brMarket = brOffer?.price?.amount_brl ?? null;
  if (pyCost == null) return null;
  if (brMarket != null) return Math.max(pyCost, Math.min(pyCost * (1 + margin), brMarket * 0.97));
  return pyCost * (1 + margin);
}

function estimatedSellForGroup(group, marginPct) {
  return estimateSellingPrice(
    cheapestByCountry(group.offers, "py"),
    cheapestByCountry(group.offers, "br"),
    marginPct,
  );
}

// ── Sorting ────────────────────────────────────────────────────────────────

function sortGroups(groups, marginPct) {
  const mode = groupOrderSelect?.value ?? "estimated_asc";
  if (mode === "default") return groups;
  const indexed = groups.map((group, idx) => ({
    group, idx, estimate: estimatedSellForGroup(group, marginPct),
  }));
  indexed.sort((a, b) => {
    if (a.estimate == null && b.estimate == null) return a.idx - b.idx;
    if (a.estimate == null) return 1;
    if (b.estimate == null) return -1;
    return mode === "estimated_desc" ? b.estimate - a.estimate : a.estimate - b.estimate;
  });
  return indexed.map((e) => e.group);
}

function sortOffersByColumn(offers, col, dir) {
  const sorted = [...offers];
  sorted.sort((a, b) => {
    let av, bv;
    switch (col) {
      case "country": av = a.country || "";        bv = b.country || "";        break;
      case "store":   av = a.store   || "";        bv = b.store   || "";        break;
      case "title":   av = a.title   || "";        bv = b.title   || "";        break;
      case "price":   av = a.price.amount;         bv = b.price.amount;         break;
      case "brl":     av = a.price.amount_brl;     bv = b.price.amount_brl;     break;
      case "source":  av = sourceDomain(a.url);    bv = sourceDomain(b.url);    break;
      default: return 0;
    }
    if (typeof av === "number") return dir === "asc" ? av - bv : bv - av;
    return dir === "asc"
      ? String(av).localeCompare(String(bv))
      : String(bv).localeCompare(String(av));
  });
  return sorted;
}

// ── Render ─────────────────────────────────────────────────────────────────

function renderCompare(data) {
  lastData              = data;
  resultsNode.innerHTML = "";
  resultsNode.classList.remove("is-loading", "card-grid");
  retryBtn.hidden       = true;
  clearBtn.hidden       = false;

  if (!data.groups || data.groups.length === 0) {
    setStatus(t("status.no_results"));
    return;
  }

  const marginPct = getSelectedMarginPct();
  const sorted    = sortGroups(data.groups, marginPct);

  setStatus(t("status.found", { n: data.groups.length }));

  if (getSelectedViewMode() === "table") {
    resultsNode.appendChild(renderFlatTable(sorted, marginPct));
  } else {
    const grid = document.createElement("div");
    grid.className = "product-grid";
    sorted.forEach((group, i) => {
      grid.appendChild(renderProductCard(group, marginPct, i));
    });
    resultsNode.appendChild(grid);
  }
}

function renderFlatTable(groups, marginPct) {
  const wrap = document.createElement("div");
  wrap.className = "flat-table-wrap";

  const table = document.createElement("table");
  table.className = "flat-table";
  table.innerHTML = `<thead><tr>
    <th>${t("table.model")}</th><th>${t("table.config")}</th>
    <th>${t("table.py_price")}</th><th>${t("table.py_source")}</th>
    <th>${t("table.br_market")}</th><th>${t("table.br_source")}</th>
    <th>${t("table.est_sell")}</th><th>${t("table.margin")}</th><th>${t("table.offers")}</th>
  </tr></thead>`;

  const tbody = document.createElement("tbody");
  for (const [i, group] of groups.entries()) {
    const py     = cheapestByCountry(group.offers, "py");
    const br     = cheapestByCountry(group.offers, "br");
    const sell   = estimateSellingPrice(py, br, marginPct);
    const margin = (py && sell != null) ? Math.round(((sell / py.price.amount_brl) - 1) * 100) : null;
    const config = buildConfigChip(group) || "—";

    const tr = document.createElement("tr");
    tr.style.animationDelay = `${i * 20}ms`;
    tr.innerHTML = `
      <td class="ft-model">${familyDisplayName(group)}</td>
      <td><span class="config-chip">${config}</span></td>
      <td class="ft-py">${py ? formatMoney(py.price.amount_brl, "BRL") : "—"}</td>
      <td>${py ? `<a class="ft-link" href="${py.url}" target="_blank" rel="noopener noreferrer">${sourceDomain(py.url)}</a>` : "—"}</td>
      <td class="ft-br">${br ? formatMoney(br.price.amount_brl, "BRL") : "—"}</td>
      <td>${br ? `<a class="ft-link" href="${br.url}" target="_blank" rel="noopener noreferrer">${sourceDomain(br.url)}</a>` : "—"}</td>
      <td><strong class="ft-sell">${sell != null ? formatMoney(sell, "BRL") : "—"}</strong></td>
      <td>${margin != null ? `<span class="margin-tag">+${margin}%</span>` : "—"}</td>
      <td class="ft-count">${group.offers.length}</td>`;
    tbody.appendChild(tr);
  }
  table.appendChild(tbody);
  wrap.appendChild(table);
  return wrap;
}

// ── Family clustering ─────────────────────────────────────────────────────────

function clusterByFamily(groups) {
  const map = new Map();
  for (const g of groups) {
    const fk = g.family_key || g.product_key;
    if (!map.has(fk)) map.set(fk, []);
    map.get(fk).push(g);
  }
  for (const variants of map.values()) {
    variants.sort((a, b) => parseStorageGB(a) - parseStorageGB(b));
  }
  return [...map.values()];
}

function parseStorageGB(group) {
  const tb = group.canonical_name.match(/(\d+)\s*TB/i);
  if (tb) return parseInt(tb[1]) * 1024;
  const gb = group.canonical_name.match(/(\d+)\s*GB/i);
  return gb ? parseInt(gb[1]) : 9999;
}

function familyDisplayName(group) {
  // family_key already includes variant suffixes (Pro/Plus/Max) — prefer it
  if (group.family_key) return formatModelName(group.family_key);
  // Fallback: strip storage/RAM from canonical name
  const raw = group.canonical_name.replace(/\s*\([^)]*\)\s*$/, "").trim();
  return formatModelName(raw);
}

function formatModelName(name) {
  // Works on both lowercase (family_key) and UPPERCASE (canonical_name) input
  const exceptions = {
    iphone: "iPhone", ipad: "iPad", airpods: "AirPods",
    note: "Note", galaxy: "Galaxy", redmi: "Redmi",
    xiaomi: "Xiaomi", samsung: "Samsung", apple: "Apple",
    pro: "Pro", max: "Max", plus: "Plus", ultra: "Ultra",
    mini: "Mini", lite: "Lite", ram: "RAM", gb: "GB", tb: "TB",
  };
  return name
    .toLowerCase()
    .replace(/\b\w+\b/g, (w) => exceptions[w] ?? (w[0].toUpperCase() + w.slice(1)));
}

function buildConfigChip(group) {
  // For perfumes: show concentration (EDP/EDT/Elixir) + volume (100ml)
  if (group.concentration || group.volume_ml) {
    return [group.concentration, group.volume_ml].filter(Boolean).join(" · ");
  }
  // For electronics: extract "(256GB, 8GB)" from canonical_name
  return (group.canonical_name.match(/\(([^)]+)\)/) || ["", ""])[1];
}

function renderProductCard(group, marginPct, idx) {
  const py     = cheapestByCountry(group.offers, "py");
  const br     = cheapestByCountry(group.offers, "br");
  const sell   = estimateSellingPrice(py, br, marginPct);
  const margin = (py && sell != null) ? Math.round(((sell / py.price.amount_brl) - 1) * 100) : null;
  const config = buildConfigChip(group);
  const name   = familyDisplayName(group);

  const card = document.createElement("article");
  card.className = "product-card";
  card.style.animationDelay = `${idx * 40}ms`;

  // ── Image ──────────────────────────────────────────────────────────
  const imgWrap = document.createElement("div");
  imgWrap.className = group.product_image_url ? "pc-img" : "pc-img no-image";
  if (group.product_image_url) {
    const img = document.createElement("img");
    img.src     = group.product_image_url;
    img.alt     = name;
    img.loading = "lazy";
    imgWrap.appendChild(img);
  }

  // ── Title block ────────────────────────────────────────────────────
  const titleBlock = document.createElement("div");
  titleBlock.className = "pc-title-block";
  titleBlock.innerHTML = `
    <h2 class="pc-name">${name}</h2>
    ${config ? `<span class="config-chip">${config}</span>` : ""}`;

  // ── Price rows ─────────────────────────────────────────────────────
  const prices = document.createElement("div");
  prices.className = "pc-prices";
  prices.innerHTML = `
    <div class="pc-row pc-row-py${py ? "" : " is-na"}">
      <span class="pc-dot py-dot"></span>
      <span class="pc-ctry">PY</span>
      <strong class="pc-val">${py ? formatMoney(py.price.amount_brl, "BRL") : "—"}</strong>
      ${py ? `<a class="pc-src" href="${py.url}" target="_blank" rel="noopener noreferrer">${sourceDomain(py.url)}</a>` : ""}
    </div>
    <div class="pc-row pc-row-br${br ? "" : " is-na"}">
      <span class="pc-dot br-dot"></span>
      <span class="pc-ctry">BR</span>
      <strong class="pc-val">${br ? formatMoney(br.price.amount_brl, "BRL") : "—"}</strong>
      ${br ? `<a class="pc-src" href="${br.url}" target="_blank" rel="noopener noreferrer">${sourceDomain(br.url)}</a>` : ""}
    </div>`;

  // ── Footer: Est. Sell + expand ─────────────────────────────────────
  const footer = document.createElement("div");
  footer.className = "pc-footer";
  footer.innerHTML = `
    <div class="pc-sell">
      <span class="pc-sell-lbl">${t("card.est_sell_short")}</span>
      <strong class="pc-sell-val">${sell != null ? formatMoney(sell, "BRL") : "—"}</strong>
      ${margin != null ? `<span class="margin-tag">+${margin}%</span>` : ""}
    </div>
    <button class="expand-btn" type="button">▾ ${group.offers.length}</button>`;

  card.append(imgWrap, titleBlock, prices, footer);

  // ── Expand button → open offers dialog ────────────────────────────
  const expandBtn = footer.querySelector(".expand-btn");
  expandBtn.addEventListener("click", (e) => {
    e.stopPropagation();
    openOffersDialog(group, name, config);
  });

  const wrap = document.createElement("div");
  wrap.className = "product-card-wrap";
  wrap.append(card);
  return wrap;
}

// ── Offers dialog ──────────────────────────────────────────────────────────

const offersDialog = document.getElementById("offersDialog");
const odName       = document.getElementById("odName");
const odChip       = document.getElementById("odChip");
const odTbody      = document.getElementById("odTbody");
const odClose      = document.getElementById("odClose");

function openOffersDialog(group, name, config) {
  odName.textContent  = name;
  odChip.textContent  = config || "";
  odChip.hidden       = !config;

  odTbody.innerHTML = "";
  for (const offer of group.offers) {
    const titleEsc = (offer.title || "").replace(/"/g, "&quot;");
    const tr = document.createElement("tr");
    tr.innerHTML = `
      <td>${countryBadge(offer.country)}</td>
      <td class="od-store">${offer.store}</td>
      <td class="od-title" title="${titleEsc}">${offer.title || ""}</td>
      <td class="od-price">${formatMoney(offer.price.amount, offer.price.currency)}</td>
      <td class="od-brl">${formatMoney(offer.price.amount_brl, "BRL")}</td>
      <td class="od-link"><a href="${offer.url}" target="_blank" rel="noopener noreferrer">${sourceDomain(offer.url)}</a></td>`;
    odTbody.appendChild(tr);
  }

  offersDialog.showModal();
}

odClose?.addEventListener("click", () => offersDialog.close());

// Close on backdrop click
offersDialog?.addEventListener("click", (e) => {
  if (e.target === offersDialog) offersDialog.close();
});


// ── API calls ──────────────────────────────────────────────────────────────

async function compareByName() {
  const query = queryInput.value.trim();
  if (!query) { setStatus(t("status.type_first"), true); return; }

  lastQuery = query;
  hideSuggestions();

  const url = new URL(`${getApiBase()}/compare`, window.location.href);
  url.searchParams.set("q",       query);
  url.searchParams.set("country", "all");
  url.searchParams.set("sort",    sortSelect.value);

  setStatus(t("status.comparing"));
  setSearchLoading(true);

  try {
    const res = await fetch(url);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = await res.json();
    renderCompare(data);
    saveRecentSearch(lastQuery);
    // Refresh random images for next loading scene in the background
    fetch(`${getApiBase()}/featured-images`).then(r => r.ok && r.json()).then(imgs => { if (imgs?.length) _featuredImages = imgs; }).catch(() => {});

    const cacheHeader = res.headers.get("X-Cache");
    if (cacheHeader === "FALLBACK") {
      showStaleIndicator(t("status.stale"));
    } else {
      hideStaleIndicator();
    }
  } catch (error) {
    setStatus(t("status.compare_failed", { msg: error.message }), true);
  } finally {
    setSearchLoading(false);
  }
}

function showStaleIndicator(text) {
  text = text ?? t("status.updating");
  let badge = document.getElementById("staleBadge");
  if (!badge) {
    badge = document.createElement("span");
    badge.id = "staleBadge";
    badge.className = "badge-stale";
    statusNode.after(badge);
  }
  badge.textContent = text;
  badge.hidden = false;
}

function hideStaleIndicator() {
  const badge = document.getElementById("staleBadge");
  if (badge) badge.hidden = true;
}

// compareByImage — image detection deferred until real vision integration is ready
// async function compareByImage(file) { ... }

// ── Event listeners ────────────────────────────────────────────────────────

searchBtn.addEventListener("click", compareByName);
queryInput.addEventListener("keydown", (e) => { if (e.key === "Enter") compareByName(); });

// imageInput event listener — deferred with compareByImage

// Retry — re-runs last query
retryBtn.addEventListener("click", () => {
  if (lastQuery) { queryInput.value = lastQuery; compareByName(); }
});

// Clear — resets everything
clearBtn.addEventListener("click", () => {
  lastData = null;
  lastQuery = null;
  resultsNode.innerHTML = "";
  queryInput.value      = "";
  clearBtn.hidden       = true;
  retryBtn.hidden       = true;
  setStatus(t("status.ready"));
});

// Margin — client-side re-render only (not sent to API)
if (marginButtons) {
  marginButtons.addEventListener("click", (e) => {
    const target = e.target;
    if (!(target instanceof HTMLElement) || !target.classList.contains("margin-chip")) return;
    for (const chip of marginButtons.querySelectorAll(".margin-chip")) chip.classList.remove("is-active");
    target.classList.add("is-active");
    if (lastData) renderCompare(lastData);
  });
}

// View mode — client-side re-render only
if (viewModeButtons) {
  viewModeButtons.addEventListener("click", (e) => {
    const target = e.target;
    if (!(target instanceof HTMLElement) || !target.classList.contains("view-chip")) return;
    for (const chip of viewModeButtons.querySelectorAll(".view-chip")) chip.classList.remove("is-active");
    target.classList.add("is-active");
    if (lastData) renderCompare(lastData);
  });
}

// Order by — client-side re-render only
if (groupOrderSelect) {
  groupOrderSelect.addEventListener("change", () => { if (lastData) renderCompare(lastData); });
}

setStatus(t("status.ready"));

// ── Auth ────────────────────────────────────────────────────────────────────

const authBar        = document.getElementById("authBar");
const authModal      = document.getElementById("authModal");
const authModalClose = document.getElementById("authModalClose");
const loginForm      = document.getElementById("loginForm");
const registerForm   = document.getElementById("registerForm");
const loginError     = document.getElementById("loginError");
const registerError  = document.getElementById("registerError");

let currentUser  = null;
let currentPrefs = { show_margin: false };

function getToken()   { return localStorage.getItem("muamba_token"); }
function setToken(t)  { localStorage.setItem("muamba_token", t); }
function clearToken() { localStorage.removeItem("muamba_token"); }

function renderAuthBar() {
  if (!authBar) return;
  const loggedIn = Boolean(currentUser);

  if (loggedIn) {
    const display = currentUser.name || currentUser.email;
    const adminLink = currentUser.is_admin
      ? `<a class="btn-inline admin-link" href="/admin.html">Dev Tools</a>`
      : "";
    authBar.innerHTML = `
      <span class="auth-greeting">${t("auth.greeting")} <strong>${display}</strong></span>
      ${adminLink}
      <button class="btn-inline auth-settings-btn" id="openSettingsBtn" title="${t("auth.settings")}">&#9881;</button>
      <button class="btn-inline" id="logoutBtn">${t("auth.logout")}</button>`;
    document.getElementById("openSettingsBtn")?.addEventListener("click", openUserConfig);
    document.getElementById("logoutBtn")?.addEventListener("click", logout);
  } else {
    authBar.innerHTML = `<button class="btn-inline" id="openLoginBtn">${t("auth.login_register")}</button>`;
    document.getElementById("openLoginBtn")?.addEventListener("click", () => openAuthModal("login"));
  }

  // Margin section: only for logged-in users who enabled it in prefs
  const showMargin  = loggedIn && (currentPrefs?.show_margin ?? false);
  const marginBlock = document.getElementById("marginBlock");
  const marginSep   = document.getElementById("marginSep");
  if (marginBlock) marginBlock.hidden = !showMargin;
  if (marginSep)   marginSep.hidden   = !showMargin;
}

function openAuthModal(tab = "login") {
  switchAuthTab(tab);
  authModal?.showModal();
}

function switchAuthTab(tab) {
  if (loginForm)    loginForm.hidden    = tab !== "login";
  if (registerForm) registerForm.hidden = tab !== "register";
  authModal?.querySelectorAll(".auth-tab").forEach(btn => {
    btn.classList.toggle("is-active", btn.dataset.tab === tab);
  });
  if (loginError)    loginError.hidden    = true;
  if (registerError) registerError.hidden = true;
}

function showAuthError(el, msg) {
  el.textContent = msg;
  el.hidden = false;
}

function _setAuthBtnLoading(form, loading) {
  const btn = form?.querySelector("button[type=submit]");
  if (!btn) return;
  btn.disabled = loading;
  btn.dataset.origText = btn.dataset.origText || btn.textContent;
  btn.textContent = loading ? "\u2026" : btn.dataset.origText;
}

async function submitLogin(identifier, password) {
  _setAuthBtnLoading(loginForm, true);
  try {
    const res = await fetch(`${getApiBase()}/auth/login`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ identifier, password }),
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      showAuthError(loginError, err.detail || t("auth.login_failed"));
      return;
    }
    const { access_token } = await res.json();
    setToken(access_token);
    authModal?.close();
    await fetchMe(); // also loads prefs + recent searches
  } catch {
    showAuthError(loginError, t("auth.login_failed"));
  } finally {
    _setAuthBtnLoading(loginForm, false);
  }
}

async function submitRegister(username, name, email, password) {
  _setAuthBtnLoading(registerForm, true);
  try {
    const res = await fetch(`${getApiBase()}/auth/register`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ username, name: name || undefined, email, password }),
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      showAuthError(registerError, err.detail || t("auth.register_failed"));
      return;
    }
    const { access_token } = await res.json();
    setToken(access_token);
    authModal?.close();
    await fetchMe();
  } catch {
    showAuthError(registerError, t("auth.register_failed"));
  } finally {
    _setAuthBtnLoading(registerForm, false);
  }
}

async function fetchPrefs() {
  const token = getToken();
  if (!token) { currentPrefs = { show_margin: false }; return; }
  try {
    const res = await fetch(`${getApiBase()}/auth/me/prefs`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (res.ok) currentPrefs = await res.json();
  } catch (_) {}
}

async function savePrefs(updates) {
  const token = getToken();
  if (!token) return;
  try {
    const res = await fetch(`${getApiBase()}/auth/me/prefs`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
      body: JSON.stringify(updates),
    });
    if (res.ok) {
      currentPrefs = await res.json();
      renderAuthBar();
    }
  } catch (_) {}
}

async function fetchMe() {
  const token = getToken();
  if (!token) { currentUser = null; currentPrefs = { show_margin: false }; renderAuthBar(); return; }
  const res = await fetch(`${getApiBase()}/auth/me`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (res.ok) {
    currentUser = await res.json();
    await fetchPrefs();
    fetchAndRenderUserSearches(); // non-blocking sidebar refresh
  } else {
    clearToken();
    currentUser = null;
    currentPrefs = { show_margin: false };
  }
  renderAuthBar();
}

function logout() {
  clearToken();
  currentUser = null;
  currentPrefs = { show_margin: false };
  renderAuthBar();
  renderRecentSearches(); // fall back to localStorage
}

// Auth modal tabs
authModal?.querySelectorAll(".auth-tab").forEach(btn => {
  btn.addEventListener("click", () => switchAuthTab(btn.dataset.tab));
});

// Close button + backdrop click
authModalClose?.addEventListener("click", () => authModal?.close());
authModal?.addEventListener("click", (e) => { if (e.target === authModal) authModal.close(); });

// Login form submit
loginForm?.addEventListener("submit", (e) => {
  e.preventDefault();
  const identifier = document.getElementById("loginIdentifier").value.trim();
  const password   = document.getElementById("loginPassword").value;
  submitLogin(identifier, password);
});

// Register form submit
registerForm?.addEventListener("submit", (e) => {
  e.preventDefault();
  const username = document.getElementById("registerUsername").value.trim();
  const name     = document.getElementById("registerName").value.trim();
  const email    = document.getElementById("registerEmail").value.trim();
  const password = document.getElementById("registerPassword").value;
  submitRegister(username, name, email, password);
});

// ── User Config Modal ─────────────────────────────────────────────────────────

const userConfigModal = document.getElementById("userConfigModal");

function openUserConfig() {
  if (!currentUser) return;
  document.getElementById("profileName").value   = currentUser.name || "";
  document.getElementById("newPassword").value   = "";
  document.getElementById("confirmPassword").value = "";
  document.getElementById("profileError").hidden  = true;
  document.getElementById("passwordError").hidden = true;
  document.getElementById("prefShowMargin").checked = currentPrefs?.show_margin ?? false;
  _loadUserSearchesIntoModal();
  userConfigModal?.showModal();
}

document.getElementById("userConfigClose")?.addEventListener("click", () => userConfigModal?.close());
userConfigModal?.addEventListener("click", (e) => { if (e.target === userConfigModal) userConfigModal.close(); });

// Profile name form
document.getElementById("profileForm")?.addEventListener("submit", async (e) => {
  e.preventDefault();
  const name  = document.getElementById("profileName").value.trim();
  const errEl = document.getElementById("profileError");
  const btn   = e.target.querySelector("button[type=submit]");
  btn.disabled = true;
  try {
    const res = await fetch(`${getApiBase()}/auth/me`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${getToken()}` },
      body: JSON.stringify({ name: name || null }),
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      errEl.textContent = err.detail || t("config.save_error");
      errEl.hidden = false;
      return;
    }
    currentUser  = await res.json();
    errEl.hidden = true;
    renderAuthBar();
    const orig = btn.textContent;
    btn.textContent = t("config.saved");
    setTimeout(() => { btn.textContent = orig; }, 2000);
  } catch {
    errEl.textContent = t("config.save_error");
    errEl.hidden = false;
  } finally {
    btn.disabled = false;
  }
});

// Password change form
document.getElementById("passwordChangeForm")?.addEventListener("submit", async (e) => {
  e.preventDefault();
  const newPw  = document.getElementById("newPassword").value;
  const confPw = document.getElementById("confirmPassword").value;
  const errEl  = document.getElementById("passwordError");
  const btn    = e.target.querySelector("button[type=submit]");
  if (newPw !== confPw) {
    errEl.textContent = t("config.password_mismatch");
    errEl.hidden = false;
    return;
  }
  btn.disabled = true;
  try {
    const res = await fetch(`${getApiBase()}/auth/me`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${getToken()}` },
      body: JSON.stringify({ password: newPw }),
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      errEl.textContent = err.detail || t("config.save_error");
      errEl.hidden = false;
      return;
    }
    errEl.hidden = true;
    document.getElementById("newPassword").value    = "";
    document.getElementById("confirmPassword").value = "";
    const orig = btn.textContent;
    btn.textContent = t("config.saved");
    setTimeout(() => { btn.textContent = orig; }, 2000);
  } catch {
    errEl.textContent = t("config.save_error");
    errEl.hidden = false;
  } finally {
    btn.disabled = false;
  }
});

// Preference toggles
document.getElementById("prefShowMargin")?.addEventListener("change", async (e) => {
  await savePrefs({ show_margin: e.target.checked });
});

async function _loadUserSearchesIntoModal() {
  const list = document.getElementById("userSearchList");
  if (!list || !currentUser) return;
  list.innerHTML = `<li class="ucm-empty">\u2026</li>`;
  try {
    const res = await fetch(`${getApiBase()}/auth/me/searches`, {
      headers: { Authorization: `Bearer ${getToken()}` },
    });
    if (!res.ok) { list.innerHTML = ""; return; }
    const searches = await res.json();
    list.innerHTML = "";
    if (!searches.length) {
      list.innerHTML = `<li class="ucm-empty">${t("sidebar.no_recents")}</li>`;
      return;
    }
    for (const s of searches) {
      const li = document.createElement("li");
      li.className = "ucm-search-item";
      li.textContent = s.query;
      li.addEventListener("click", () => {
        queryInput.value = s.query;
        userConfigModal?.close();
        compareByName();
      });
      list.appendChild(li);
    }
  } catch (_) { list.innerHTML = ""; }
}

// ── Autocomplete ────────────────────────────────────────────────────────────

const suggestionsList = document.getElementById("suggestionsList");
let _activeSuggestion = -1;

function debounce(fn, ms) {
  let timer;
  return (...args) => { clearTimeout(timer); timer = setTimeout(() => fn(...args), ms); };
}

function hideSuggestions() {
  if (!suggestionsList) return;
  suggestionsList.hidden = true;
  suggestionsList.innerHTML = "";
  _activeSuggestion = -1;
}

function renderSuggestions(items) {
  if (!suggestionsList || !items.length) { hideSuggestions(); return; }
  suggestionsList.innerHTML = "";
  _activeSuggestion = -1;
  items.forEach((text) => {
    const li = document.createElement("li");
    li.textContent = text;
    li.addEventListener("mousedown", (e) => {
      e.preventDefault(); // prevent blur firing before click
      selectSuggestion(text);
    });
    suggestionsList.appendChild(li);
  });
  suggestionsList.hidden = false;
}

function setActiveSuggestion(index) {
  const items = suggestionsList?.querySelectorAll("li") ?? [];
  items.forEach((li, i) => li.classList.toggle("is-active", i === index));
  _activeSuggestion = index;
}

function selectSuggestion(text) {
  queryInput.value = text;
  hideSuggestions();
  compareByName();
}

async function fetchSuggestions(q) {
  if (!q || q.length < 2) { hideSuggestions(); return; }
  try {
    const url = new URL(`${getApiBase()}/suggestions`, window.location.href);
    url.searchParams.set("q", q);
    const res = await fetch(url);
    if (!res.ok) return;
    renderSuggestions(await res.json());
  } catch (_) {
    hideSuggestions();
  }
}

const _debouncedFetchSuggestions = debounce(fetchSuggestions, 300);

queryInput?.addEventListener("input", () => {
  _debouncedFetchSuggestions(queryInput.value.trim());
});

queryInput?.addEventListener("keydown", (e) => {
  const items = suggestionsList?.querySelectorAll("li") ?? [];
  if (suggestionsList?.hidden || !items.length) return;

  if (e.key === "ArrowDown") {
    e.preventDefault();
    setActiveSuggestion(Math.min(_activeSuggestion + 1, items.length - 1));
  } else if (e.key === "ArrowUp") {
    e.preventDefault();
    setActiveSuggestion(Math.max(_activeSuggestion - 1, -1));
  } else if (e.key === "Enter" && _activeSuggestion >= 0) {
    e.preventDefault();
    selectSuggestion(items[_activeSuggestion].textContent);
  } else if (e.key === "Escape") {
    hideSuggestions();
  }
});

queryInput?.addEventListener("blur", () => {
  // Slight delay so mousedown on suggestion fires first
  setTimeout(hideSuggestions, 150);
});

// ── Restore session on page load ─────────────────────────────────────────────

fetchMe();

(async () => {
  try {
    const res = await fetch(`${getApiBase()}/featured-images`);
    if (res.ok) _featuredImages = await res.json();
  } catch (_) { /* non-critical — loading scene just won't have pre-seeded images */ }
})();

// ── Recent searches ───────────────────────────────────────────────────────────

const RECENT_KEY = "muamba_recent";
const RECENT_MAX = 8;

function saveRecentSearch(query) {
  if (!query) return;
  if (currentUser) {
    // Server saves automatically via /compare; just refresh the sidebar list
    fetchAndRenderUserSearches();
  } else {
    let recents = loadRecentSearches();
    recents = [query, ...recents.filter((q) => q !== query)].slice(0, RECENT_MAX);
    localStorage.setItem(RECENT_KEY, JSON.stringify(recents));
    renderRecentSearches(recents);
  }
}

function loadRecentSearches() {
  try {
    return JSON.parse(localStorage.getItem(RECENT_KEY) || "[]");
  } catch { return []; }
}

async function fetchAndRenderUserSearches() {
  if (!currentUser) return;
  try {
    const res = await fetch(`${getApiBase()}/auth/me/searches`, {
      headers: { Authorization: `Bearer ${getToken()}` },
    });
    if (!res.ok) return;
    const data = await res.json();
    renderRecentSearches(data.map((s) => s.query));
  } catch (_) {}
}

function renderRecentSearches(recents) {
  if (!recents) recents = currentUser ? [] : loadRecentSearches();
  const list = document.getElementById("recentList");
  if (!list) return;
  if (!recents.length) {
    list.innerHTML = `<li class="recent-empty">${t("sidebar.no_recents")}</li>`;
    return;
  }
  list.innerHTML = "";
  for (const q of recents) {
    const li = document.createElement("li");
    li.className = "recent-item";
    li.textContent = q;
    li.addEventListener("click", () => {
      queryInput.value = q;
      compareByName();
      document.getElementById("sidebar")?.classList.remove("is-open");
      document.getElementById("sidebarOverlay").hidden = true;
    });
    list.appendChild(li);
  }
}

renderRecentSearches();

// ── Mobile sidebar toggle ────────────────────────────────────────────────────

const sidebar        = document.getElementById("sidebar");
const sidebarToggle  = document.getElementById("sidebarToggle");
const sidebarOverlay = document.getElementById("sidebarOverlay");

if (sidebarToggle && sidebar) {
  sidebarToggle.addEventListener("click", () => {
    const opening = !sidebar.classList.contains("is-open");
    sidebar.classList.toggle("is-open", opening);
    if (sidebarOverlay) sidebarOverlay.hidden = !opening;
  });
}

if (sidebarOverlay) {
  sidebarOverlay.addEventListener("click", () => {
    sidebar?.classList.remove("is-open");
    sidebarOverlay.hidden = true;
  });
}

// Close sidebar when Compare is clicked on mobile
searchBtn.addEventListener("click", () => {
  if (window.innerWidth <= 820) {
    sidebar?.classList.remove("is-open");
    if (sidebarOverlay) sidebarOverlay.hidden = true;
  }
});

// ── Refresh cache button ──────────────────────────────────────────────────────

const refreshCacheBtn  = document.getElementById("refreshCacheBtn");
const refreshBtnLabel  = document.getElementById("refreshBtnLabel");

refreshCacheBtn?.addEventListener("click", async () => {
  refreshCacheBtn.disabled = true;
  refreshCacheBtn.classList.add("is-spinning");
  refreshBtnLabel.textContent = t("refresh.refreshing");

  try {
    const res = await fetch(`${getApiBase()}/admin/refresh-cache`, { method: "POST" });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = await res.json();
    const n = data.unique_queries;
    refreshBtnLabel.textContent = t("refresh.queued", { n, queries: t(n === 1 ? "refresh.query" : "refresh.queries") });
    setTimeout(() => { refreshBtnLabel.textContent = t("sidebar.refresh_btn"); }, 4000);
  } catch (err) {
    refreshBtnLabel.textContent = t("refresh.failed");
    setTimeout(() => { refreshBtnLabel.textContent = t("sidebar.refresh_btn"); }, 3000);
  } finally {
    refreshCacheBtn.classList.remove("is-spinning");
    refreshCacheBtn.disabled = false;
  }
});

// ── i18n live re-render ───────────────────────────────────────────────────────

window.addEventListener("i18n:change", () => {
  if (lastData) {
    setStatus(t("status.found", { n: lastData.groups.length }));
    renderCompare(lastData);
  } else {
    setStatus(t("status.ready"));
  }
  btnLabel.textContent = t("search.btn");
  if (refreshBtnLabel) refreshBtnLabel.textContent = t("sidebar.refresh_btn");
  renderAuthBar();
  if (currentUser) {
    fetchAndRenderUserSearches();
  } else {
    renderRecentSearches();
  }
});
