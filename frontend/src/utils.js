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
    iphone: 'iPhone', ipad: 'iPad', airpods: 'AirPods',
    note: 'Note', galaxy: 'Galaxy', redmi: 'Redmi',
    xiaomi: 'Xiaomi', samsung: 'Samsung', apple: 'Apple',
    pro: 'Pro', max: 'Max', plus: 'Plus', ultra: 'Ultra',
    mini: 'Mini', lite: 'Lite', ram: 'RAM', gb: 'GB', tb: 'TB',
  }
  return name
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
  [/^(console|playstation|xbox|nintendo\s+switch)/i,       'Console'],
  [/^(smartphone|celular)/i,                               'Smartphone'],
  [/^(tablet|ipad)/i,                                      'Tablet'],
  [/^(headset|headphone)/i,                                'Headset'],

  // Anywhere in title (keyword-based — catches "Notebook Gamer MSI..." or "ASUS Notebook...")
  [/\b(notebook|laptop)\b/i,                               'Notebook'],
  [/\b(geforce|radeon)\s+rtx\b|\brtx\s+\d{4}\b|\bgtx\s+\d{4}\b/i, 'Placa de Vídeo'],
  [/\b(intel\s+core\s+i[3579]|amd\s+ryzen\s+[357]|core\s+ultra)\b/i,'Processador'],
  [/\biphone\b/i,                                          'Smartphone'],
  [/\bipad\b/i,                                            'Tablet'],
  [/\bplaystation\s*[345]\b|\bps\s*[345]\b|\bxbox\b|\bswitch\s*(oled|lite)?\b/i, 'Console'],
]

export function detectProductType(name) {
  if (!name) return null
  const n = name.trim()
  for (const [pattern, label] of _TYPE_RULES) {
    if (pattern.test(n)) return label
  }
  return null
}

export function buildConfigChip(group) {
  if (group.concentration || group.volume_ml) {
    return [group.concentration, group.volume_ml].filter(Boolean).join(' · ')
  }
  return (group.canonical_name.match(/\(([^)]+)\)/) || ['', ''])[1]
}
