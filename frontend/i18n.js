/* ═══════════════════════════════════════════════════════════════════
   MAMU i18n — en / pt-BR / es-PY
   ═══════════════════════════════════════════════════════════════════ */

const LOCALES = {
  en: {
    "search.placeholder":      "iPhone 15 128GB\u2026",
    "search.sort_label":       "Sort",
    "search.sort_best":        "Best Match",
    "search.sort_lowest":      "Lowest Price",
    "search.btn":              "Compare Prices",
    "search.btn_loading":      "Searching\u2026",

    "sidebar.margin_title":    "Target Margin",
    "sidebar.recents_title":   "Last Searched",
    "sidebar.no_recents":      "No recent searches",
    "sidebar.refresh_btn":     "Refresh Saved Data",

    "toolbar.order_label":     "Order",
    "toolbar.order_sell_asc":  "Sell \u2191 Low\u2192High",
    "toolbar.order_sell_desc": "Sell \u2193 High\u2192Low",
    "toolbar.order_best":      "Best Match",
    "toolbar.view_card":       "Cards",
    "toolbar.view_table":      "Table",

    "card.py_cheapest":        "PY Cheapest",
    "card.br_cheapest":        "BR Cheapest",
    "card.est_sell":           "Estimated Sell",
    "card.est_sell_short":     "Est. Sell",
    "card.view_all":           "View All",
    "card.source":             "Source",

    "table.country":           "Country",
    "table.store":             "Store",
    "table.title":             "Title",
    "table.price":             "Price",
    "table.brl":               "BRL",
    "table.link":              "Link",
    "table.source":            "Source",
    "table.model":             "Model",
    "table.config":            "Config",
    "table.py_price":          "PY Price",
    "table.py_source":         "PY Source",
    "table.br_market":         "BR Market",
    "table.br_source":         "BR Source",
    "table.est_sell":          "Est. Sell",
    "table.margin":            "Margin",
    "table.offers":            "Offers",

    "status.ready":            "Ready. Type a product name to compare.",
    "status.comparing":        "Comparing offers\u2026",
    "status.found":            "Found {n} product variant(s).",
    "status.no_results":       "No offers found for this search.",
    "status.type_first":       "Type a product name first.",
    "status.stale":            "Cached data \u2014 live sources unavailable",
    "status.updating":         "Updating\u2026",
    "status.compare_failed":   "Compare failed: {msg}",

    "auth.login_register":     "Login / Register",
    "auth.login":              "Login",
    "auth.register":           "Register",
    "auth.welcome":            "Welcome back",
    "auth.create":             "Create account",
    "auth.email":              "Email",
    "auth.email_or_username":  "Email or username",
    "auth.username":           "Username",
    "auth.password":           "Password",
    "auth.name":               "Name",
    "auth.optional":           "(optional)",
    "auth.min_chars":          "(min. 8 chars)",
    "auth.login_failed":       "Login failed.",
    "auth.register_failed":    "Registration failed.",
    "auth.greeting":           "Hi,",
    "auth.logout":             "Logout",
    "auth.settings":           "Account Settings",

    "config.title":            "Account Settings",
    "config.profile_section":  "Profile",
    "config.name_label":       "Display Name",
    "config.save_name":        "Save Name",
    "config.change_password":  "Change Password",
    "config.new_password":     "New Password",
    "config.confirm_password": "Confirm Password",
    "config.password_mismatch":"Passwords don\u2019t match.",
    "config.prefs_section":    "Preferences",
    "config.show_margin":      "Show Target Margin",
    "config.searches_section": "Recent Searches",
    "config.saved":            "Saved \u2713",
    "config.save_error":       "Save failed.",

    "settings.api_url":        "API URL",

    "refresh.refreshing":      "Refreshing\u2026",
    "refresh.failed":          "Failed \u2014 retry?",
    "refresh.queued":          "Queued {n} {queries}",
    "refresh.query":           "query",
    "refresh.queries":         "queries",

    "loading.comparing":       "Comparing prices",
    "loading.tagline":         "so you don\u2019t have to.",

    "btn.retry":               "Retry",
    "btn.clear":               "Clear",
  },

  pt: {
    "search.placeholder":      "iPhone 15 128GB\u2026",
    "search.sort_label":       "Ordenar",
    "search.sort_best":        "Melhor Resultado",
    "search.sort_lowest":      "Menor Pre\u00e7o",
    "search.btn":              "Comparar Pre\u00e7os",
    "search.btn_loading":      "Buscando\u2026",

    "sidebar.margin_title":    "Margem Desejada",
    "sidebar.recents_title":   "Buscas Recentes",
    "sidebar.no_recents":      "Nenhuma busca recente",
    "sidebar.refresh_btn":     "Atualizar Dados",

    "toolbar.order_label":     "Ordenar",
    "toolbar.order_sell_asc":  "Venda \u2191 Menor\u2192Maior",
    "toolbar.order_sell_desc": "Venda \u2193 Maior\u2192Menor",
    "toolbar.order_best":      "Melhor Resultado",
    "toolbar.view_card":       "Cards",
    "toolbar.view_table":      "Tabela",

    "card.py_cheapest":        "Mais Barato PY",
    "card.br_cheapest":        "Mais Barato BR",
    "card.est_sell":           "Venda Estimada",
    "card.est_sell_short":     "Est. Venda",
    "card.view_all":           "Ver Todos",
    "card.source":             "Fonte",

    "table.country":           "Pa\u00eds",
    "table.store":             "Loja",
    "table.title":             "T\u00edtulo",
    "table.price":             "Pre\u00e7o",
    "table.brl":               "BRL",
    "table.link":              "Link",
    "table.source":            "Fonte",
    "table.model":             "Modelo",
    "table.config":            "Config",
    "table.py_price":          "Pre\u00e7o PY",
    "table.py_source":         "Fonte PY",
    "table.br_market":         "Mercado BR",
    "table.br_source":         "Fonte BR",
    "table.est_sell":          "Est. Venda",
    "table.margin":            "Margem",
    "table.offers":            "Ofertas",

    "status.ready":            "Pronto. Digite o nome de um produto para comparar.",
    "status.comparing":        "Comparando ofertas\u2026",
    "status.found":            "{n} variante(s) encontrada(s).",
    "status.no_results":       "Nenhuma oferta encontrada para esta busca.",
    "status.type_first":       "Digite o nome de um produto primeiro.",
    "status.stale":            "Dados em cache \u2014 fontes ao vivo indispon\u00edveis",
    "status.updating":         "Atualizando\u2026",
    "status.compare_failed":   "Erro na compara\u00e7\u00e3o: {msg}",

    "auth.login_register":     "Entrar / Cadastrar",
    "auth.login":              "Entrar",
    "auth.register":           "Cadastrar",
    "auth.welcome":            "Bem-vindo de volta",
    "auth.create":             "Criar conta",
    "auth.email":              "E-mail",
    "auth.email_or_username":  "E-mail ou usuário",
    "auth.username":           "Usuário",
    "auth.password":           "Senha",
    "auth.name":               "Nome",
    "auth.optional":           "(opcional)",
    "auth.min_chars":          "(m\u00edn. 8 caracteres)",
    "auth.login_failed":       "Falha no login.",
    "auth.register_failed":    "Falha no cadastro.",
    "auth.greeting":           "Ol\u00e1,",
    "auth.logout":             "Sair",
    "auth.settings":           "Configura\u00e7\u00f5es da Conta",

    "config.title":            "Configura\u00e7\u00f5es da Conta",
    "config.profile_section":  "Perfil",
    "config.name_label":       "Nome",
    "config.save_name":        "Salvar Nome",
    "config.change_password":  "Alterar Senha",
    "config.new_password":     "Nova Senha",
    "config.confirm_password": "Confirmar Senha",
    "config.password_mismatch":"As senhas n\u00e3o coincidem.",
    "config.prefs_section":    "Prefer\u00eancias",
    "config.show_margin":      "Exibir Margem Alvo",
    "config.searches_section": "Buscas Recentes",
    "config.saved":            "Salvo \u2713",
    "config.save_error":       "Falha ao salvar.",

    "settings.api_url":        "URL da API",

    "refresh.refreshing":      "Atualizando\u2026",
    "refresh.failed":          "Falhou \u2014 tentar novamente?",
    "refresh.queued":          "{n} {queries} adicionada(s) \u00e0 fila",
    "refresh.query":           "consulta",
    "refresh.queries":         "consultas",

    "loading.comparing":       "Comparando pre\u00e7os",
    "loading.tagline":         "para voc\u00ea n\u00e3o precisar.",

    "btn.retry":               "Tentar novamente",
    "btn.clear":               "Limpar",
  },

  es: {
    "search.placeholder":      "iPhone 15 128GB\u2026",
    "search.sort_label":       "Ordenar",
    "search.sort_best":        "Mejor Resultado",
    "search.sort_lowest":      "Precio m\u00e1s Bajo",
    "search.btn":              "Comparar Precios",
    "search.btn_loading":      "Buscando\u2026",

    "sidebar.margin_title":    "Margen Deseado",
    "sidebar.recents_title":   "B\u00fasquedas Recientes",
    "sidebar.no_recents":      "Sin b\u00fasquedas recientes",
    "sidebar.refresh_btn":     "Actualizar Datos",

    "toolbar.order_label":     "Ordenar",
    "toolbar.order_sell_asc":  "Venta \u2191 Menor\u2192Mayor",
    "toolbar.order_sell_desc": "Venta \u2193 Mayor\u2192Menor",
    "toolbar.order_best":      "Mejor Resultado",
    "toolbar.view_card":       "Tarjetas",
    "toolbar.view_table":      "Tabla",

    "card.py_cheapest":        "M\u00e1s Barato PY",
    "card.br_cheapest":        "M\u00e1s Barato BR",
    "card.est_sell":           "Venta Estimada",
    "card.est_sell_short":     "Est. Venta",
    "card.view_all":           "Ver Todos",
    "card.source":             "Fuente",

    "table.country":           "Pa\u00eds",
    "table.store":             "Tienda",
    "table.title":             "T\u00edtulo",
    "table.price":             "Precio",
    "table.brl":               "BRL",
    "table.link":              "Enlace",
    "table.source":            "Fuente",
    "table.model":             "Modelo",
    "table.config":            "Config",
    "table.py_price":          "Precio PY",
    "table.py_source":         "Fuente PY",
    "table.br_market":         "Mercado BR",
    "table.br_source":         "Fuente BR",
    "table.est_sell":          "Est. Venta",
    "table.margin":            "Margen",
    "table.offers":            "Ofertas",

    "status.ready":            "Listo. Escrib\u00ed el nombre de un producto para comparar.",
    "status.comparing":        "Comparando ofertas\u2026",
    "status.found":            "{n} variante(s) de producto encontrada(s).",
    "status.no_results":       "No se encontraron ofertas para esta b\u00fasqueda.",
    "status.type_first":       "Primero escrib\u00ed el nombre de un producto.",
    "status.stale":            "Datos en cach\u00e9 \u2014 fuentes en vivo no disponibles",
    "status.updating":         "Actualizando\u2026",
    "status.compare_failed":   "Error al comparar: {msg}",

    "auth.login_register":     "Entrar / Registrarse",
    "auth.login":              "Entrar",
    "auth.register":           "Registrarse",
    "auth.welcome":            "Bienvenido de nuevo",
    "auth.create":             "Crear cuenta",
    "auth.email":              "Correo",
    "auth.email_or_username":  "Correo o usuario",
    "auth.username":           "Usuario",
    "auth.password":           "Contrase\u00f1a",
    "auth.name":               "Nombre",
    "auth.optional":           "(opcional)",
    "auth.min_chars":          "(m\u00edn. 8 caracteres)",
    "auth.login_failed":       "Error al iniciar sesi\u00f3n.",
    "auth.register_failed":    "Error al registrarse.",
    "auth.greeting":           "Hola,",
    "auth.logout":             "Salir",
    "auth.settings":           "Configuraci\u00f3n de Cuenta",

    "config.title":            "Configuraci\u00f3n de Cuenta",
    "config.profile_section":  "Perfil",
    "config.name_label":       "Nombre",
    "config.save_name":        "Guardar Nombre",
    "config.change_password":  "Cambiar Contrase\u00f1a",
    "config.new_password":     "Nueva Contrase\u00f1a",
    "config.confirm_password": "Confirmar Contrase\u00f1a",
    "config.password_mismatch":"Las contrase\u00f1as no coinciden.",
    "config.prefs_section":    "Preferencias",
    "config.show_margin":      "Mostrar Margen Objetivo",
    "config.searches_section": "B\u00fasquedas Recientes",
    "config.saved":            "Guardado \u2713",
    "config.save_error":       "Error al guardar.",

    "settings.api_url":        "URL de la API",

    "refresh.refreshing":      "Actualizando\u2026",
    "refresh.failed":          "Fall\u00f3 \u2014 \u00bfreintentar?",
    "refresh.queued":          "{n} {queries} en cola",
    "refresh.query":           "consulta",
    "refresh.queries":         "consultas",

    "loading.comparing":       "Comparando precios",
    "loading.tagline":         "para que vos no tengas que hacerlo.",

    "btn.retry":               "Reintentar",
    "btn.clear":               "Limpiar",
  },
};

const _SUPPORTED   = ["en", "pt", "es"];
const _STORAGE_KEY = "muamba_locale";

function _detect() {
  const saved = localStorage.getItem(_STORAGE_KEY);
  if (saved && _SUPPORTED.includes(saved)) return saved;
  const nav = (navigator.language || "en").toLowerCase();
  if (nav.startsWith("pt")) return "pt";
  if (nav.startsWith("es")) return "es";
  return "en";
}

let _locale = _detect();

// ── Public API ────────────────────────────────────────────────────────────────

function t(key, vars) {
  const dict = LOCALES[_locale] ?? LOCALES.en;
  let str = dict[key] ?? LOCALES.en[key] ?? key;
  if (vars) {
    for (const [k, v] of Object.entries(vars)) str = str.replaceAll(`{${k}}`, v);
  }
  return str;
}

function currentLocale() { return _locale; }

function applyI18n(root = document) {
  root.querySelectorAll("[data-i18n]").forEach(el => {
    el.textContent = t(el.dataset.i18n);
  });
  root.querySelectorAll("[data-i18n-ph]").forEach(el => {
    el.placeholder = t(el.dataset.i18nPh);
  });
  document.documentElement.lang = { en: "en", pt: "pt-BR", es: "es-PY" }[_locale] ?? "en";
  document.querySelectorAll(".lang-btn").forEach(btn => {
    btn.classList.toggle("is-active", btn.dataset.lang === _locale);
  });
}

function setLocale(locale) {
  if (!_SUPPORTED.includes(locale)) return;
  _locale = locale;
  localStorage.setItem(_STORAGE_KEY, locale);
  applyI18n();
  window.dispatchEvent(new CustomEvent("i18n:change"));
}

// Expose on window so app.js (loaded after this script) can call t(), setLocale(), etc.
window.t             = t;
window.setLocale     = setLocale;
window.currentLocale = currentLocale;
window.applyI18n     = applyI18n;

// Wire lang buttons and apply on DOMContentLoaded
document.addEventListener("DOMContentLoaded", () => {
  applyI18n();
  document.querySelectorAll(".lang-btn").forEach(btn => {
    btn.addEventListener("click", () => setLocale(btn.dataset.lang));
  });
});
