import React, { useLayoutEffect, useMemo, useRef, useState } from 'react'
import { useVirtualizer } from '@tanstack/react-virtual'
import { useSearchParams } from 'react-router-dom'
import { useI18n } from '../i18n.jsx'
import ResultsSkeleton from './ResultsSkeleton.jsx'
import { detectCategory } from '../loadingTexts.js'
import ProductCard from './ProductCard.jsx'
import { Breadcrumb, FilterSidebar } from './ui/index.js'
import VirtualGrid from './ui/VirtualGrid.jsx'
import {
  sortGroups,
  cheapestByCountry,
  estimateSellingPrice,
  buildConfigChip,
  familyDisplayName,
  formatMoney,
  sourceDomain,
  detectProductType,
  detectVariant,
} from '../utils.js'

const TABLE_ROW_HEIGHT = 49

/** Tabela virtualizada: linhas espaçadoras em cima/embaixo, só as visíveis no DOM. */
function FlatTable({ groups, marginPct, t, onOpenOffers, scrollRef }) {
  const bodyRef = useRef(null)
  const [scrollMargin, setScrollMargin] = useState(0)
  useLayoutEffect(() => {
    const body = bodyRef.current
    const scroller = scrollRef?.current
    if (!body || !scroller) return
    setScrollMargin(body.getBoundingClientRect().top - scroller.getBoundingClientRect().top + scroller.scrollTop)
  }, [scrollRef, groups])

  const virtualizer = useVirtualizer({
    count: groups.length,
    getScrollElement: () => scrollRef?.current || null,
    estimateSize: () => TABLE_ROW_HEIGHT,
    overscan: Math.max(10, Math.ceil((scrollRef?.current?.clientHeight || 800) / TABLE_ROW_HEIGHT)),
    scrollMargin,
  })
  const rows = virtualizer.getVirtualItems()
  const padTop = rows.length ? rows[0].start - scrollMargin : 0
  const padBottom = rows.length ? virtualizer.getTotalSize() - (rows[rows.length - 1].end - scrollMargin) : 0

  return (
    <div className="flat-table-wrap">
      <table className="flat-table">
        <thead>
          <tr>
            <th>{t('table.model')}</th>
            <th>{t('table.config')}</th>
            <th>{t('table.py_price')}</th>
            <th>{t('table.py_source')}</th>
            <th>{t('table.br_market')}</th>
            <th>{t('table.br_source')}</th>
            <th>{t('table.est_sell')}</th>
            <th>{t('table.margin')}</th>
            <th>{t('table.offers')}</th>
          </tr>
        </thead>
        <tbody ref={bodyRef}>
          {padTop > 0 && <tr aria-hidden="true"><td colSpan={9} style={{ height: padTop, padding: 0, border: 'none' }} /></tr>}
          {rows.map(vRow => {
            const i = vRow.index
            const group = groups[i]
            const py     = cheapestByCountry(group.offers, 'py')
            const br     = cheapestByCountry(group.offers, 'br')
            const sell   = estimateSellingPrice(py, br, marginPct)
            const margin = (py && sell != null)
              ? Math.round(((sell / py.price.amount_brl) - 1) * 100)
              : null
            const config = buildConfigChip(group) || '—'
            const name   = familyDisplayName(group)

            return (
              <tr key={group.product_key || i}>
                <td className="ft-model">{name}</td>
                <td><span className="config-chip">{config}</span></td>
                <td className="ft-py">{py ? formatMoney(py.price.amount_brl, 'BRL') : '—'}</td>
                <td>
                  {py
                    ? <a className="ft-link" href={py.url} target="_blank" rel="noopener noreferrer">{sourceDomain(py.url)}</a>
                    : '—'}
                </td>
                <td className="ft-br">{br ? formatMoney(br.price.amount_brl, 'BRL') : '—'}</td>
                <td>
                  {br
                    ? <a className="ft-link" href={br.url} target="_blank" rel="noopener noreferrer">{sourceDomain(br.url)}</a>
                    : '—'}
                </td>
                <td><strong className="ft-sell">{sell != null ? formatMoney(sell, 'BRL') : '—'}</strong></td>
                <td>{margin != null ? <span className="margin-tag">+{margin}%</span> : '—'}</td>
                <td className="ft-count">
                  <button
                    className="ft-offers-btn"
                    type="button"
                    onClick={() => onOpenOffers(group, name, config)}
                    aria-label={`Ver ${group.offers.length} oferta${group.offers.length !== 1 ? 's' : ''} de ${name}`}
                  >
                    {group.offers.length}
                  </button>
                </td>
              </tr>
            )
          })}
          {padBottom > 0 && <tr aria-hidden="true"><td colSpan={9} style={{ height: padBottom, padding: 0, border: 'none' }} /></tr>}
        </tbody>
      </table>
    </div>
  )
}

// ── Ordenação (opções do protótipo; "Venda estimada" só pra quem usa margem) ──
const SORT_OPTIONS = [
  { value: 'relevancia', label: 'Melhor Resultado' },
  { value: 'menor-py', label: 'Menor Preço PY' },
  { value: 'menor-br', label: 'Menor Preço BR' },
  { value: 'economia', label: 'Maior Economia' },
]

// Faixas de preço do protótipo, sobre o menor preço no Paraguai em US$.
const PRICE_BUCKETS = [
  { value: '0-100', label: 'Até US$ 100', min: 0, max: 100 },
  { value: '100-500', label: 'US$ 100 – 500', min: 100, max: 500 },
  { value: '500-1000', label: 'US$ 500 – 1.000', min: 500, max: 1000 },
  { value: '1000-2000', label: 'US$ 1.000 – 2.000', min: 1000, max: 2000 },
  { value: '2000-', label: 'Acima de US$ 2.000', min: 2000, max: Infinity },
]

// Chave de cada grupo de filtro na URL (?cat=Console&loja=Nissei&loja=Cellshop).
const FILTER_KEYS = ['cat', 'variante', 'conc', 'preco', 'loja']

function economyPct(g) {
  const py = cheapestByCountry(g.offers, 'py')
  const br = cheapestByCountry(g.offers, 'br')
  if (!py || !br || !(br.price.amount_brl > 0)) return null
  return ((br.price.amount_brl - py.price.amount_brl) / br.price.amount_brl) * 100
}

function sortResults(groups, order, targetMargin) {
  if (order === 'venda') return sortGroups(groups, 'estimated_asc', targetMargin)
  const base = sortGroups(groups, 'default', targetMargin) // ambos países primeiro, ordem do backend
  if (order === 'relevancia') return base
  const key = {
    'menor-py': g => cheapestByCountry(g.offers, 'py')?.price?.amount_brl,
    'menor-br': g => cheapestByCountry(g.offers, 'br')?.price?.amount_brl,
    economia: g => { const e = economyPct(g); return e == null ? null : -e },
  }[order]
  if (!key) return base
  return base
    .map((g, i) => ({ g, i, k: key(g) }))
    .sort((a, b) => {
      if (a.k == null && b.k == null) return a.i - b.i
      if (a.k == null) return 1
      if (b.k == null) return -1
      return a.k - b.k || a.i - b.i
    })
    .map(e => e.g)
}

// ── Facetas: cada uma diz como ler o valor de um grupo de produto ──
function groupCategory(g) {
  const candidates = [familyDisplayName(g), g.canonical_name, ...(g.offers || []).map(o => o.title).filter(Boolean)]
  return candidates.reduce((found, name) => found || detectProductType(name), null)
}

function groupVariant(g) {
  const fk = g.family_key || ''
  if (fk.includes('_bundle')) return 'Bundle'
  if (fk.includes('_digital')) return 'Digital'
  const candidates = [familyDisplayName(g), ...(g.offers || []).map(o => o.title).filter(Boolean)]
  for (const name of candidates) {
    const v = detectVariant(name)
    if (v) return v
  }
  return null
}

function groupPyUSD(g) {
  const py = (g.offers || []).filter(o => (o.country || '').toLowerCase() === 'py' && o.price?.currency === 'USD')
  return py.length ? Math.min(...py.map(o => o.price.amount)) : null
}

function groupPriceBucket(g) {
  const usd = groupPyUSD(g)
  if (usd == null) return null
  return PRICE_BUCKETS.find(b => usd >= b.min && usd < b.max)?.value ?? null
}

function groupPyStores(g) {
  return [...new Set((g.offers || [])
    .filter(o => (o.country || '').toLowerCase() === 'py')
    .map(o => o.store)
    .filter(Boolean))]
}

// valores de cada faceta pra um grupo (sempre lista — loja pode ter várias)
const FACETS = {
  cat: { title: 'Categoria', values: g => [groupCategory(g)].filter(Boolean) },
  variante: { title: 'Variante', values: g => [groupVariant(g)].filter(Boolean) },
  conc: { title: 'Concentração', values: g => [g.concentration].filter(Boolean) },
  preco: { title: 'Faixa de Preço (US$)', values: g => [groupPriceBucket(g)].filter(Boolean) },
  loja: { title: 'Loja (Paraguai)', values: g => groupPyStores(g) },
}

// entry = { group, values: { cat: [...], loja: [...], ... } } — valores calculados uma
// vez por resultado (detectar categoria/variante varre os títulos das ofertas; refazer
// isso a cada clique em milhares de produtos travava a página).
function matches(entry, selected, exceptKey) {
  return FILTER_KEYS.every(key => {
    if (key === exceptKey) return true
    const want = selected[key]
    if (!want || want.size === 0) return true // sem filtro neste grupo
    return entry.values[key].some(v => want.has(v)) // OU dentro do grupo
  })
}

export default function ResultsArea({
  isLoading,
  lastData,
  lastQuery,
  status,
  isStale,
  targetMargin,
  showMargin,
  onMarginChange,
  onRetry,
  onClear,
  onOpenOffers,
  onNeedAuth,
  onReport,
  scrollRef,
}) {
  const { t } = useI18n()
  const [params, setParams] = useSearchParams()
  const [marginPickerOpen, setMarginPickerOpen] = useState(false)
  const [mobileFiltersOpen, setMobileFiltersOpen] = useState(false)

  // Ordem, visualização e filtros vivem na URL — recarregar ou compartilhar o link
  // mantém tudo. `replace` pra cada clique não virar uma entrada no histórico.
  const order = params.get('ordem') || 'relevancia'
  const viewMode = params.get('vista') === 'tabela' ? 'table' : 'card'
  const selected = useMemo(() => {
    const out = {}
    for (const key of FILTER_KEYS) out[key] = new Set(params.getAll(key))
    return out
  }, [params])

  function updateParams(mutate) {
    setParams(prev => {
      const next = new URLSearchParams(prev)
      mutate(next)
      return next
    }, { replace: true })
  }

  function setOrder(value) {
    updateParams(p => (value === 'relevancia' ? p.delete('ordem') : p.set('ordem', value)))
  }
  function setViewMode(mode) {
    updateParams(p => (mode === 'table' ? p.set('vista', 'tabela') : p.delete('vista')))
  }
  function toggleFilter(key, value) {
    updateParams(p => {
      const values = new Set(p.getAll(key))
      values.has(value) ? values.delete(value) : values.add(value)
      p.delete(key)
      ;[...values].forEach(v => p.append(key, v))
    })
  }
  function clearFilters() {
    updateParams(p => FILTER_KEYS.forEach(k => p.delete(k)))
  }

  const showClear = Boolean(lastData)
  const showRetry = status?.isError && lastQuery != null

  const sorted = useMemo(
    () => (lastData?.groups ? sortResults(lastData.groups, order, targetMargin) : []),
    [lastData, order, targetMargin],
  )

  const indexed = useMemo(
    () => sorted.map(group => ({
      group,
      values: Object.fromEntries(FILTER_KEYS.map(k => [k, FACETS[k].values(group)])),
    })),
    [sorted],
  )
  const displayed = useMemo(
    () => indexed.filter(e => matches(e, selected, null)).map(e => e.group),
    [indexed, selected],
  )

  // Opções de cada faceta com contagem "se marcar isto": conta sobre os resultados
  // filtrados por todos os OUTROS grupos. Grupo com menos de 2 opções não aparece
  // (filtro de uma opção só não filtra nada) — a não ser que já esteja marcado.
  const sections = useMemo(() => FILTER_KEYS.map(key => {
    const pool = indexed.filter(e => matches(e, selected, key))
    const counts = new Map()
    indexed.forEach(e => e.values[key].forEach(v => counts.has(v) || counts.set(v, 0)))
    pool.forEach(e => e.values[key].forEach(v => counts.set(v, (counts.get(v) || 0) + 1)))
    let options = [...counts.entries()].map(([value, count]) => ({ value, count }))
    if (key === 'preco') {
      options = PRICE_BUCKETS
        .filter(b => counts.has(b.value))
        .map(b => ({ value: b.value, label: b.label, count: counts.get(b.value) }))
    } else {
      options.sort((a, b) => b.count - a.count || String(a.value).localeCompare(String(b.value)))
      options = options.slice(0, key === 'loja' ? 15 : 12).map(o => ({ ...o, label: o.value }))
    }
    // mantém visível o que está marcado mesmo se saiu do top-N
    selected[key].forEach(v => {
      if (!options.some(o => o.value === v)) options.push({ value: v, label: PRICE_BUCKETS.find(b => b.value === v)?.label || v, count: 0 })
    })
    return { key, title: FACETS[key].title, options }
  }).filter(sec => sec.options.length >= 2 || selected[sec.key].size > 0), [indexed, selected])

  const activeFilterCount = FILTER_KEYS.reduce((n, k) => n + selected[k].size, 0)
  const sortOptions = showMargin ? [...SORT_OPTIONS, { value: 'venda', label: 'Venda estimada ↑' }] : SORT_OPTIONS

  return (
    <div className="content-area">
      {lastQuery && (
        <Breadcrumb items={[
          { label: 'Início', onClick: onClear },
          { label: `Resultados para "${lastQuery}"` },
        ]} />
      )}
      <div className="content-toolbar results-toolbar">
        <div className="toolbar-left">
          <p className={`status${status?.isError ? ' error' : ''}`}>
            {isLoading || status?.isError || !lastData
              ? (status?.text ?? t('status.ready'))
              : `${displayed.length} variante(s) encontrada(s)${activeFilterCount > 0 ? ` de ${sorted.length}` : ''}`}
          </p>
          {isStale && <span className="badge-stale">{t('status.stale')}</span>}
          {showRetry && <button className="btn-inline" onClick={onRetry}>{t('btn.retry')}</button>}
          {showClear && <button className="btn-inline btn-muted" onClick={onClear}>{t('btn.clear')}</button>}
        </div>
        <div className="toolbar-right">
          {showMargin && onMarginChange && (
            <div className="margin-picker-wrap">
              <button
                type="button"
                className={`drawer-toggle-btn${marginPickerOpen ? ' has-active' : ''}`}
                onClick={() => setMarginPickerOpen(o => !o)}
              >
                {t('sidebar.margin_title')}: {targetMargin}%
              </button>
              {marginPickerOpen && (
                <div className="margin-picker-popover">
                  {[10, 20, 30, 35, 40, 45, 50].map(m => (
                    <button
                      key={m}
                      type="button"
                      className={`margin-chip${targetMargin === m ? ' is-active' : ''}`}
                      onClick={() => { onMarginChange(m); setMarginPickerOpen(false) }}
                    >
                      {m}%
                    </button>
                  ))}
                </div>
              )}
            </div>
          )}
          <select
            className="toolbar-select results-toolbar__sort"
            value={order}
            onChange={e => setOrder(e.target.value)}
            aria-label="Ordenar resultados"
          >
            {sortOptions.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
          </select>
          <div className="view-switch">
            <button
              type="button"
              className={`view-chip${viewMode === 'card' ? ' is-active' : ''}`}
              onClick={() => setViewMode('card')}
              aria-label={t('toolbar.view_card')}
              title={t('toolbar.view_card')}
            >
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="3" y="3" width="7" height="7"/><rect x="14" y="3" width="7" height="7"/><rect x="3" y="14" width="7" height="7"/><rect x="14" y="14" width="7" height="7"/></svg>
            </button>
            <button
              type="button"
              className={`view-chip${viewMode === 'table' ? ' is-active' : ''}`}
              onClick={() => setViewMode('table')}
              aria-label={t('toolbar.view_table')}
              title={t('toolbar.view_table')}
            >
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><line x1="8" y1="6" x2="21" y2="6"/><line x1="8" y1="12" x2="21" y2="12"/><line x1="8" y1="18" x2="21" y2="18"/><line x1="3" y1="6" x2="3.01" y2="6"/><line x1="3" y1="12" x2="3.01" y2="12"/><line x1="3" y1="18" x2="3.01" y2="18"/></svg>
            </button>
          </div>
        </div>
      </div>

      <div className="search-layout">
        {!isLoading && sorted.length > 0 && (
          <>
            {mobileFiltersOpen && <div className="filter-backdrop" onClick={() => setMobileFiltersOpen(false)} />}
            <FilterSidebar
              sections={sections}
              selected={selected}
              onToggle={toggleFilter}
              onClear={clearFilters}
              mobileOpen={mobileFiltersOpen}
              onCloseMobile={() => setMobileFiltersOpen(false)}
              resultCount={displayed.length}
            />
            <button
              type="button"
              className="filter-btn-mobile"
              onClick={() => setMobileFiltersOpen(true)}
              aria-label="Abrir filtros"
            >
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polygon points="22 3 2 3 10 12.46 10 19 14 21 14 12.46 22 3"/></svg>
              Filtros{activeFilterCount > 0 && ` (${activeFilterCount})`}
            </button>
          </>
        )}

        <section ref={scrollRef} className={`results${isLoading ? ' is-loading' : ''}`}>
          {!isLoading && lastData?.total_groups > sorted.length && (
            <div className="results-capped">
              <strong>Mostrando os {sorted.length} produtos mais relevantes de {lastData.total_groups.toLocaleString('pt-BR')}.</strong>
              {' '}Busca muito ampla — use os filtros ou seja mais específico (ex.: marca e modelo) para achar o que procura.
            </div>
          )}

          {!isLoading && sorted.length > 0 && detectCategory(lastQuery) === 'perfume' && (
            <div className="category-notice">
              <span className="category-notice-icon">🚧</span>
              <div className="category-notice-body">
                <span className="category-notice-title">{t('notice.perfume_title')}</span>
                <span className="category-notice-text">{t('notice.perfume')}</span>
              </div>
            </div>
          )}

          {isLoading ? (
            <ResultsSkeleton query={lastQuery || ''} />
          ) : viewMode === 'table' && displayed.length > 0 ? (
            <FlatTable groups={displayed} marginPct={targetMargin} t={t} onOpenOffers={onOpenOffers} scrollRef={scrollRef} />
          ) : viewMode === 'card' && displayed.length > 0 ? (
            <VirtualGrid
              items={displayed}
              scrollRef={scrollRef}
              getKey={(group, i) => group.product_key || i}
              renderItem={(group, i) => (
                <ProductCard
                  group={group}
                  marginPct={targetMargin}
                  showMargin={showMargin}
                  idx={i % 8}
                  onOpenOffers={onOpenOffers}
                  onNeedAuth={onNeedAuth}
                  onReport={onReport}
                />
              )}
            />
          ) : lastData != null ? (
            <div className="empty-state">
              <p>Nenhum produto encontrado{sorted.length > 0 ? ' com esses filtros' : ` para "${lastQuery}"`}.</p>
              <p className="empty-state-hint">
                {sorted.length > 0 ? 'Tente remover algum filtro.' : 'Tente buscar por marca, modelo ou tipo de produto.'}
              </p>
              <button type="button" onClick={sorted.length > 0 ? clearFilters : onClear}>
                {sorted.length > 0 ? 'Limpar filtros' : 'Limpar busca'}
              </button>
            </div>
          ) : null}

          {!isLoading && displayed.length > 0 && (() => {
            const allOffers = displayed.flatMap(g => g.offers || [])
            const oldestCapture = allOffers.reduce((oldest, o) => {
              if (!o.captured_at) return oldest
              return !oldest || o.captured_at < oldest ? o.captured_at : oldest
            }, null)
            const pyOffer = allOffers.find(o => o.country === 'py' && o.price?.fx_rate_used)
            const fxRate = pyOffer?.price?.fx_rate_used
            const capturedDate = oldestCapture
              ? new Date(oldestCapture).toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' })
              : null
            return (
              <p className="results-capture-info">
                {capturedDate && <>Capturado em {capturedDate}</>}
                {capturedDate && fxRate && <span className="results-capture-sep"> · </span>}
                {fxRate && (
                  <span title="Os preços paraguaios são convertidos para BRL usando essa cotação estimada. Confirme o valor final na loja.">
                    Câmbio PY estimado: R$&nbsp;1&nbsp;≈&nbsp;Gs&nbsp;{Math.round(fxRate).toLocaleString('pt-BR')} ⓘ
                  </span>
                )}
              </p>
            )
          })()}
        </section>
      </div>
    </div>
  )
}
