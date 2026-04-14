// Shared utility / formatting functions

export function formatMoney(amount, currency) {
  try {
    return new Intl.NumberFormat('pt-BR', { style: 'currency', currency }).format(amount)
  } catch {
    return `${amount} ${currency}`
  }
}

export function sourceDomain(url) {
  try {
    return new URL(url).hostname.replace(/^www\./, '')
  } catch {
    return 'Source'
  }
}

export function confidenceClass(score) {
  if (score >= 0.8) return 'confidence-high'
  if (score >= 0.6) return 'confidence-mid'
  return 'confidence-low'
}

export function cheapestByCountry(offers, country) {
  const filtered = (offers || []).filter(o => (o.country || '').toLowerCase() === country)
  if (!filtered.length) return null
  return filtered.reduce((best, cur) =>
    cur.price.amount_brl < best.price.amount_brl ? cur : best
  )
}

export function estimateSellingPrice(pyOffer, brOffer, marginPct) {
  const margin   = Number.isFinite(marginPct) ? marginPct / 100 : 0.2
  const pyCost   = pyOffer?.price?.amount_brl ?? null
  const brMarket = brOffer?.price?.amount_brl ?? null
  if (pyCost == null) return null
  if (brMarket != null) return Math.max(pyCost, Math.min(pyCost * (1 + margin), brMarket * 0.97))
  return pyCost * (1 + margin)
}

export function estimatedSellForGroup(group, marginPct) {
  return estimateSellingPrice(
    cheapestByCountry(group.offers, 'py'),
    cheapestByCountry(group.offers, 'br'),
    marginPct,
  )
}

function hasBothCountries(group) {
  const countries = new Set((group.offers || []).map(o => o.country?.toLowerCase()))
  return countries.has('py') && countries.has('br')
}

export function sortGroups(groups, groupOrder, marginPct) {
  const indexed = groups.map((group, idx) => ({
    group,
    idx,
    both: hasBothCountries(group) ? 0 : 1,   // 0 = both countries, 1 = single
    estimate: estimatedSellForGroup(group, marginPct),
    pyPrice: cheapestByCountry(group.offers, 'py')?.price?.amount_brl ?? null,
    name: familyDisplayName(group).toLowerCase(),
  }))

  indexed.sort((a, b) => {
    // Primary: groups with both countries always come first
    if (a.both !== b.both) return a.both - b.both

    // Secondary: user-selected sort within each tier
    switch (groupOrder) {
      case 'estimated_asc':
        if (a.estimate == null && b.estimate == null) return a.idx - b.idx
        if (a.estimate == null) return 1
        if (b.estimate == null) return -1
        return a.estimate - b.estimate

      case 'estimated_desc':
        if (a.estimate == null && b.estimate == null) return a.idx - b.idx
        if (a.estimate == null) return 1
        if (b.estimate == null) return -1
        return b.estimate - a.estimate

      case 'py_asc':
        if (a.pyPrice == null && b.pyPrice == null) return a.idx - b.idx
        if (a.pyPrice == null) return 1
        if (b.pyPrice == null) return -1
        return a.pyPrice - b.pyPrice

      case 'py_desc':
        if (a.pyPrice == null && b.pyPrice == null) return a.idx - b.idx
        if (a.pyPrice == null) return 1
        if (b.pyPrice == null) return -1
        return b.pyPrice - a.pyPrice

      case 'name_asc':
        return a.name.localeCompare(b.name)

      case 'name_desc':
        return b.name.localeCompare(a.name)

      default: // 'default' — keep original order within tier
        return a.idx - b.idx
    }
  })

  return indexed.map(e => e.group)
}

export function familyDisplayName(group) {
  if (group.family_key) return formatModelName(group.family_key)
  const raw = group.canonical_name.replace(/\s*\([^)]*\)\s*$/, '').trim()
  return formatModelName(raw)
}

export function formatModelName(name) {
  const exceptions = {
    iphone: 'iPhone', ipad: 'iPad', airpods: 'AirPods', playstation: 'PlayStation',
    note: 'Note', galaxy: 'Galaxy', redmi: 'Redmi',
    xiaomi: 'Xiaomi', samsung: 'Samsung', apple: 'Apple',
    pro: 'Pro', max: 'Max', plus: 'Plus', ultra: 'Ultra',
    mini: 'Mini', lite: 'Lite', ram: 'RAM', gb: 'GB', tb: 'TB',
  }
  return name
    .replace(/_/g, ' ')
    .toLowerCase()
    .replace(/\b\w+\b/g, w => exceptions[w] ?? (w[0].toUpperCase() + w.slice(1)))
}

// Rules are checked in order; first match wins.
// Each entry: [pattern to match anywhere in title, label]
// Patterns with ^ anchor take priority (more specific).
const _TYPE_RULES = [
  // Anchored (title starts with these — high confidence)
  [/^(notebook|laptop)/i,                                   'Notebook'],
  [/^(placa\s+de\s+v[ií]deo)/i,                            'Placa de Vídeo'],
  [/^(placa\s+m[aã]e|motherboard)/i,                       'Placa-mãe'],
  [/^(processador|processor)/i,                            'Processador'],
  [/^(mem[oó]ria\s+ram|mem[oó]ria\s+ddr)/i,               'Memória RAM'],
  [/^(ssd|hdd|disco\s+r[ií]gido)/i,                       'Armazenamento'],
  [/^(fonte\s+de\s+alimenta|fonte\s+atx)/i,               'Fonte'],
  [/^(gabinete)/i,                                         'Gabinete'],
  [/^(smart\s*tv|tv\s+\d)/i,                              'TV'],
  [/^(monitor)/i,                                          'Monitor'],
  [/^(impressora)/i,                                       'Impressora'],
  [/^(c[aâ]mera|câmera)/i,                               'Câmera'],
  [/^(perfume|eau\s+de\s+(parfum|toilette)|edp\b|edt\b)/i,'Perfume'],
  [/^(playstation\s+portal)/i,                              'PS Portal'],
  [/^(playstation\s+vr2?|ps\s*vr2?|óculos.*vr|oculos.*vr)/i, 'PS VR'],
  [/^(console|playstation|xbox|nintendo\s+switch)/i,       'Console'],
  [/^(controle|gamepad|joystick|dualsense|dualshock|joy.con)/i, 'Controle'],
  [/^(volante|racing\s+wheel|steering\s+wheel)/i,           'Volante'],
  [/^(jogo|game\b|juego)\b/i,                              'Jogo'],
  [/^(smartphone|celular)/i,                               'Smartphone'],
  [/^(tablet|ipad)/i,                                      'Tablet'],
  [/^(headset|headphone)/i,                                'Headset'],

  // Anywhere in title (keyword-based — catches "Notebook Gamer MSI..." or "ASUS Notebook...")
  [/\b(notebook|laptop)\b/i,                               'Notebook'],
  [/\b(geforce|radeon)\s+rtx\b|\brtx\s+\d{4}\b|\bgtx\s+\d{4}\b/i, 'Placa de Vídeo'],
  [/\b(intel\s+core\s+i[3579]|amd\s+ryzen\s+[357]|core\s+ultra)\b/i,'Processador'],
  [/\biphone\b/i,                                          'Smartphone'],
  [/\bipad\b/i,                                            'Tablet'],
  [/\bplaystation\s+portal\b/i,                              'PS Portal'],
  [/\bplaystation\s+vr2?\b|\bps\s*vr2?\b/i,                 'PS VR'],
  [/\bplaystation\s*[345]\b|\bps\s*[345]\b|\bxbox\b|\bswitch\s*(oled|lite)?\b/i, 'Console'],
  [/\b(dualsense|dualshock|joy.con|controle\s+(ps|xbox|nintendo))/i, 'Controle'],
  [/\b(volante|racing\s+wheel|steering\s+wheel)\b/i,        'Volante'],
  [/\b(jogo\s+|game\s+).*(ps[345]|xbox|switch|nintendo)/i, 'Jogo'],

  // Eletrodomésticos
  [/\b(secador\s+de\s+cabelo|hair\s+dryer|secador\b)/i,    'Secador'],
  [/\b(chapinha|prancha\s+de\s+cabelo|flat\s+iron|alisador)/i, 'Chapinha'],
  [/\b(ferro\s+de\s+passar|steam\s+iron)\b/i,               'Ferro de Passar'],
  [/\b(maquina\s+de\s+lavar|lavadora|washing\s+machine)\b/i,'Lavadora'],
  [/\b(micro.?ondas|microwave)\b/i,                          'Micro-ondas'],
  [/\b(geladeira|refrigerador|refrigerator|frigobar)\b/i,   'Geladeira'],
  [/\b(liquidificador|blender\b)\b/i,                        'Liquidificador'],
  [/\b(air\s*fryer|airfryer|fritadeira\s+el[eé]trica)\b/i,  'Air Fryer'],
  [/\b(aspirador\s+de\s+p[oó]|vacuum\s+cleaner)\b/i,        'Aspirador'],
  [/\b(ar\s*condicionado|air\s+conditioner)\b/i,            'Ar-Condicionado'],
  [/\b(ventilador|fan\s+elétrico)\b/i,                       'Ventilador'],
  [/\b(batedeira|batedeira\s+planet[aá]ria|stand\s+mixer)\b/i, 'Batedeira'],
]

export function detectProductType(name) {
  if (!name) return null
  const n = name.trim()
  for (const [pattern, label] of _TYPE_RULES) {
    if (pattern.test(n)) return label
  }
  return null
}

// Detects product variant from name:
// 1. Bundle (group key ends with "_bundle" or display name ends with "Bundle")
// 2. Special editions: "God of War Edition", "Spider-Man Bundle", etc.
// 3. Standard variants: Pro, Slim, Digital, Plus, Max, etc.
export function detectVariant(name) {
  if (!name) return null

  // Bundle — backend marks all game bundles with "_bundle" key suffix
  if (/(_|\s)bundle$/i.test(name)) return 'Bundle'

  // Special editions — capture what's before Edition/Bundle/Pack/Ed.
  const editionMatch = name.match(
    /\b([\w\s\-']+?)\s+(edition|bundle|pack|ed\.)\b/i
  )
  if (editionMatch) {
    const label = editionMatch[1].trim()
    // Ignore generic words that aren't real edition names
    const ignore = /^(standard|digital|slim|disc|launch|special|limited|deluxe|collector|the|a|an|this)$/i
    if (!ignore.test(label) && label.length > 2) {
      // Capitalize each word
      return label.replace(/\b\w/g, c => c.toUpperCase()) + ' Edition'
    }
  }

  // Standard model variants (ordered: more specific first)
  const VARIANTS = [
    'Pro Max', 'Pro Plus', 'Ultra Max',
    'Pro', 'Plus', 'Max', 'Ultra',
    'Slim', 'Lite', 'Mini',
    'Digital', 'Standard', 'Disc',
    'Air', 'SE', 'FE',
    'Deluxe', 'Limited', 'Collector',
  ]
  const upper = name.toUpperCase()
  for (const v of VARIANTS) {
    const pattern = new RegExp(`\\b${v.toUpperCase()}\\b`)
    if (pattern.test(upper)) return v
  }

  return null
}

// Extracts the game name from a bundle offer title.
// Handles "PlayStation 5 + Jogo Astro Bot" and "PS5 Fortnite Bundle"
export function extractBundleGame(title) {
  if (!title) return null

  // "+ Jogo Astro Bot" (Portuguese)
  const jogoMatch = title.match(/\+\s*jogo\s+([\w\s\-'&:]+?)(?:\s*\+|$)/i)
  if (jogoMatch) return jogoMatch[1].trim()

  // "Fortnite Flowering Chaos Bundle" — words before "bundle" that look like a game name
  const bundleMatch = title.match(/\b([\w\s\-'&:]+?)\s+bundle\b/i)
  if (bundleMatch) {
    const _generic = /^(console|playstation|ps[345]|xbox|sony|nintendo|switch|slim|digital|disc|standard|pro|launch|special|collector|deluxe|a|an|the)$/i
    const words = bundleMatch[1].trim().split(/\s+/).filter(w => !_generic.test(w) && w.length > 1)
    if (words.length >= 1) return words.join(' ')
  }
  return null
}

export function buildConfigChip(group) {
  if (group.concentration || group.volume_ml) {
    return [group.concentration, group.volume_ml].filter(Boolean).join(' · ')
  }
  if (group.voltage) {
    return group.voltage
  }
  return (group.canonical_name.match(/\(([^)]+)\)/) || ['', ''])[1]
}
