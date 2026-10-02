import React, { useCallback, useEffect, useRef, useState } from 'react'
import { Button, Badge, Modal, useModal, FormInput } from './ui/index.js'
import useToast from './ui/useToast.js'
import { useFeatures } from '../features.js'
import {
  apiGetSellerProfile, apiCreateSellerProfile, apiSellerStoreSuggestions,
  apiGetSellerOffers, apiGetSellerMetrics,
  apiListSellerHighlights, apiCreateSellerHighlight, apiRemoveSellerHighlight, apiUnlockSellerHighlight,
  apiListSellerCoupons, apiCreateSellerCoupon, apiDeleteSellerCoupon,
  apiListSellerBanners, apiCreateSellerBanner, apiDeleteSellerBanner,
  apiBillingCancel,
} from '../api.js'

const PLAN_LABELS = { visibilidade: 'Visibilidade', destaque_pro: 'Destaque Pro', dominio_total: 'Domínio Total' }

function debounce(fn, ms) {
  let timer
  return (...args) => {
    clearTimeout(timer)
    timer = setTimeout(() => fn(...args), ms)
  }
}

function todayStr() {
  return new Date().toISOString().split('T')[0]
}

function addDays(dateStr, days) {
  const d = new Date(dateStr + 'T00:00:00')
  d.setDate(d.getDate() + days)
  return d.toISOString().split('T')[0]
}

function fmtDate(dateStr) {
  return new Date(dateStr + 'T00:00:00').toLocaleDateString('pt-BR')
}

function fmtBRL(value) {
  return `R$ ${value.toFixed(2).replace('.', ',')}`
}

function ProfileCreateForm({ onCreated }) {
  const toast = useToast()
  const [name, setName] = useState('')
  const [suggestions, setSuggestions] = useState([])
  const [showSuggestions, setShowSuggestions] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const wrapRef = useRef(null)

  useEffect(() => {
    function handler(e) {
      if (wrapRef.current && !wrapRef.current.contains(e.target)) setShowSuggestions(false)
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [])

  const debouncedFetch = useCallback(debounce(async (q) => {
    if (!q || q.length < 2) { setSuggestions([]); setShowSuggestions(false); return }
    try {
      const items = await apiSellerStoreSuggestions(q)
      setSuggestions(items)
      setShowSuggestions(items.length > 0)
    } catch {
      setSuggestions([]); setShowSuggestions(false)
    }
  }, 300), [])

  function handleChange(e) {
    setName(e.target.value)
    debouncedFetch(e.target.value.trim())
  }

  async function handleSubmit(e) {
    e.preventDefault()
    if (!name.trim()) return
    setSubmitting(true)
    try {
      const created = await apiCreateSellerProfile(name.trim())
      onCreated(created)
    } catch (err) {
      toast(err.message || 'Erro ao criar perfil de lojista.', 'error')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="lojista-page">
      <div className="lojista-section lojista-onboarding">
        <h1 className="lojista-title">🏪 Criar perfil de lojista</h1>
        <p className="lojista-section-note">
          Digite o nome da sua loja como ele aparece nos resultados do MuambaRADAR — isso é o que usamos
          para achar suas ofertas reais e permitir destacá-las depois.
        </p>
        <form onSubmit={handleSubmit} className="lojista-form" ref={wrapRef} style={{ position: 'relative' }}>
          <FormInput
            as="input"
            label="Nome da loja"
            value={name}
            onChange={handleChange}
            autoComplete="off"
            required
          />
          {showSuggestions && (
            <ul className="lojista-suggestions">
              {suggestions.map(s => (
                <li key={s}>
                  <button type="button" onClick={() => { setName(s); setShowSuggestions(false) }}>{s}</button>
                </li>
              ))}
            </ul>
          )}
          <Button type="submit" variant="primary" disabled={submitting || !name.trim()}>
            {submitting ? 'Criando…' : 'Criar perfil'}
          </Button>
        </form>
      </div>
    </div>
  )
}

export default function Lojista({ currentUser, onNeedAuth }) {
  const toast = useToast()
  const { coupons: couponsEnabled } = useFeatures()
  const [loading, setLoading] = useState(true)
  const [profile, setProfile] = useState(null)
  const [offers, setOffers] = useState([])
  const [metrics, setMetrics] = useState(null)
  const [highlights, setHighlights] = useState([])
  const [coupons, setCoupons] = useState([])
  const [banners, setBanners] = useState([])

  const couponModal = useModal()
  const bannerModal = useModal()
  const programModal = useModal()
  const [programTarget, setProgramTarget] = useState(null)

  const loadDashboard = useCallback(async () => {
    const [o, m, h, c, b] = await Promise.all([
      apiGetSellerOffers(), apiGetSellerMetrics(),
      apiListSellerHighlights(), apiListSellerCoupons(), apiListSellerBanners(),
    ])
    setOffers(o); setMetrics(m); setHighlights(h); setCoupons(c); setBanners(b)
  }, [])

  useEffect(() => {
    if (!currentUser) { setLoading(false); return }
    (async () => {
      setLoading(true)
      try {
        const p = await apiGetSellerProfile()
        setProfile(p)
        if (p && p.plan_tier !== 'none') await loadDashboard()
      } catch (err) {
        toast(err.message || 'Erro ao carregar painel de lojista.', 'error')
      } finally {
        setLoading(false)
      }
    })()
  }, [currentUser, loadDashboard]) // eslint-disable-line react-hooks/exhaustive-deps

  function highlightFor(productKey) {
    return highlights.find(h => h.product_key === productKey)
  }

  function highlightStatus(row) {
    if (!row) return 'available'
    const today = todayStr()
    if (row.cooldown_until) return row.cooldown_until >= today ? 'cooldown' : 'available'
    return row.end_date >= today ? 'active' : 'available'
  }

  async function handleQuickHighlight(productKey, duration) {
    try {
      const created = await apiCreateSellerHighlight({ product_key: productKey, duration })
      setHighlights(prev => [...prev.filter(h => h.product_key !== productKey), created])
      toast(`Produto destacado com sucesso até ${fmtDate(created.end_date)}! 🚀`)
    } catch (err) {
      toast(err.message || 'Erro ao destacar produto.', 'error')
    }
  }

  function openProgram(productKey) {
    setProgramTarget(productKey)
    programModal.open()
  }

  async function handleRemove(row) {
    try {
      const updated = await apiRemoveSellerHighlight(row.id)
      setHighlights(prev => prev.map(h => h.id === row.id ? updated : h))
      const isDaily = updated.duration === 'diario'
      toast(`Destaque finalizado. Produto entrou em carência de ${isDaily ? '1 dia' : '1 semana'} (até ${fmtDate(updated.cooldown_until)}) ⏳`)
    } catch (err) {
      toast(err.message || 'Erro ao remover destaque.', 'error')
    }
  }

  async function handleUnlock(row) {
    try {
      const updated = await apiUnlockSellerHighlight(row.id)
      setHighlights(prev => prev.map(h => h.id === row.id ? updated : h))
      toast(`Pagamento de ${fmtBRL(row.unlock_cost ?? 19.90)} verificado. Cooldown liberado com sucesso! ⚡`)
    } catch (err) {
      toast(err.message || 'Erro ao liberar cooldown.', 'error')
    }
  }

  async function handleConfirmProgram(e) {
    e.preventDefault()
    const form = e.target
    const start = form.startDate.value
    const end = form.endDate.value
    const days = (new Date(end) - new Date(start)) / (1000 * 60 * 60 * 24)
    if (!(days > 0 && days <= 7)) {
      toast('O período selecionado excede o limite máximo de 1 semana (7 dias) ou é inválido.', 'error')
      return
    }
    try {
      const created = await apiCreateSellerHighlight({
        product_key: programTarget, duration: 'programado', start_date: start, end_date: end,
      })
      setHighlights(prev => [...prev.filter(h => h.product_key !== programTarget), created])
      toast(`Produto destacado com sucesso até ${fmtDate(created.end_date)}! 🚀`)
      programModal.close()
    } catch (err) {
      toast(err.message || 'Erro ao programar destaque.', 'error')
    }
  }

  async function handleDeleteCoupon(id) {
    try {
      await apiDeleteSellerCoupon(id)
      setCoupons(prev => prev.filter(c => c.id !== id))
      toast('Cupom excluído.')
    } catch (err) {
      toast(err.message || 'Erro ao excluir cupom.', 'error')
    }
  }

  async function handleCreateCoupon(e) {
    e.preventDefault()
    const form = e.target
    try {
      const created = await apiCreateSellerCoupon({
        code: form.code.value.trim(),
        type: form.type.value,
        value: parseFloat(form.value.value),
        product_key: form.productId.value === 'all' ? null : form.productId.value,
      })
      setCoupons(prev => [created, ...prev])
      toast('Cupom criado com sucesso! 🎟️')
      couponModal.close()
      form.reset()
    } catch (err) {
      toast(err.message || 'Erro ao criar cupom.', 'error')
    }
  }

  async function handleDeleteBanner(id) {
    try {
      await apiDeleteSellerBanner(id)
      setBanners(prev => prev.filter(b => b.id !== id))
      toast('Campanha cancelada.')
    } catch (err) {
      toast(err.message || 'Erro ao cancelar campanha.', 'error')
    }
  }

  async function handleCreateBanner(e) {
    e.preventDefault()
    const form = e.target
    try {
      const created = await apiCreateSellerBanner({
        title: form.title.value.trim(),
        start_date: form.startDate.value,
        end_date: form.endDate.value,
      })
      setBanners(prev => [created, ...prev])
      toast('Campanha de banner agendada com sucesso! 🗺️')
      bannerModal.close()
      form.reset()
    } catch (err) {
      toast(err.message || 'Erro ao agendar campanha.', 'error')
    }
  }

  async function handleCancelSubscription() {
    try {
      const updated = await apiBillingCancel()
      setProfile(prev => ({ ...prev, ...updated }))
      toast('Assinatura cancelada.')
    } catch (err) {
      toast(err.message || 'Erro ao cancelar assinatura.', 'error')
    }
  }

  if (!currentUser) {
    return (
      <div className="lojista-page">
        <div className="lojista-section" style={{ textAlign: 'center' }}>
          <p className="lojista-empty-text">Você precisa entrar para acessar o Painel Lojista.</p>
          <Button variant="primary" onClick={onNeedAuth}>Entrar</Button>
        </div>
      </div>
    )
  }

  if (loading) {
    return <div className="lojista-page"><p className="lojista-empty-text">Carregando…</p></div>
  }

  if (!profile) {
    return <ProfileCreateForm onCreated={setProfile} />
  }

  if (profile.plan_tier === 'none') {
    return (
      <div className="lojista-page">
        <div className="lojista-demo-banner">
          ⏳ Perfil de <strong>{profile.store_name}</strong> criado — aguardando aprovação do plano pelo admin
          para liberar cupons, destaque e campanhas de banner.
        </div>
      </div>
    )
  }

  return (
    <div className="lojista-page">
      <div className="lojista-header">
        <h1 className="lojista-title">📊 Painel Lojista</h1>
        <Badge variant="new">{profile.store_name}</Badge>
        <Badge variant="default">{PLAN_LABELS[profile.plan_tier] || profile.plan_tier}</Badge>
        {profile.subscription_id && profile.subscription_status === 'authorized' && (
          <Button variant="ghost" size="sm" onClick={handleCancelSubscription}>Cancelar assinatura</Button>
        )}
      </div>

      {metrics && (
        <div className="lojista-metrics">
          <div className="lojista-metric-tile">
            <span className="lojista-metric-value">{metrics.active_offers}</span>
            <span className="lojista-metric-label">Ofertas ativas</span>
          </div>
          <div className="lojista-metric-tile">
            <span className="lojista-metric-value">{metrics.favorites_count}</span>
            <span className="lojista-metric-label">Favoritos recebidos</span>
          </div>
          <div className="lojista-metric-tile">
            <span className="lojista-metric-value">{metrics.cart_adds_count}</span>
            <span className="lojista-metric-label">Adicionados ao carrinho</span>
          </div>
          <div className="lojista-metric-tile">
            <span className="lojista-metric-value">{metrics.active_highlights}</span>
            <span className="lojista-metric-label">Destaques ativos</span>
          </div>
        </div>
      )}

      {/* ── Product highlights ── */}
      <section className="lojista-section">
        <h2 className="lojista-section-title">🚀 Produtos em destaque</h2>
        {offers.length === 0 ? (
          <p className="lojista-empty-text">
            Nenhuma oferta atual encontrada para "{profile.store_name}" — seus produtos aparecem aqui
            quando forem localizados numa busca real no site.
          </p>
        ) : (
          <div className="lojista-product-list">
            {offers.map(p => {
              const row = highlightFor(p.product_key)
              const status = highlightStatus(row)

              return (
                <div className="lojista-product-row" key={p.product_key}>
                  <div className="lojista-product-info">
                    <span className="lojista-product-name">{p.canonical_name}</span>
                    <span className="lojista-product-price">🇵🇾 {p.price_currency} {p.price_amount}</span>
                  </div>
                  <div className="lojista-product-actions">
                    {status === 'active' ? (
                      <>
                        <span className="lojista-status lojista-status--active">
                          ⭐ Ativo ({row.duration === 'diario' ? 'Diário' : row.duration === 'semana' ? 'Semanal' : 'Programado'}) até {fmtDate(row.end_date)}
                        </span>
                        <Button variant="danger" size="sm" onClick={() => handleRemove(row)}>Remover</Button>
                      </>
                    ) : status === 'cooldown' ? (
                      <>
                        <span className="lojista-status lojista-status--cooldown">
                          ⏳ Cooldown até {fmtDate(row.cooldown_until)}
                        </span>
                        <Button variant="primary" size="sm" onClick={() => handleUnlock(row)}>⚡ Liberar ({fmtBRL(row.unlock_cost)})</Button>
                      </>
                    ) : (
                      <>
                        <Button variant="secondary" size="sm" onClick={() => handleQuickHighlight(p.product_key, 'diario')}>🚀 Diário</Button>
                        <Button variant="primary" size="sm" onClick={() => handleQuickHighlight(p.product_key, 'semana')}>🚀 Semanal</Button>
                        <Button variant="secondary" size="sm" onClick={() => openProgram(p.product_key)}>📅 Programar</Button>
                      </>
                    )}
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </section>

      {/* ── Coupons ── */}
      {couponsEnabled && (
      <section className="lojista-section">
        <div className="lojista-section-header">
          <h2 className="lojista-section-title">🎟️ Cupons da loja</h2>
          <Button variant="primary" size="sm" onClick={couponModal.open} disabled={offers.length === 0}>+ Novo cupom</Button>
        </div>
        <div className="lojista-coupon-list">
          {coupons.length === 0 ? (
            <p className="lojista-empty-text">Nenhum cupom ativo no momento.</p>
          ) : coupons.map(c => (
            <div className="lojista-coupon-row" key={c.id}>
              <span className="lojista-coupon-code">{c.code}</span>
              <span className="lojista-coupon-value">
                {c.type === 'percent' ? `${c.value}% OFF` : `US$ ${c.value} OFF`}
              </span>
              <span className="lojista-coupon-scope">
                {c.product_key ? offers.find(o => o.product_key === c.product_key)?.canonical_name || c.product_key : 'Todos os produtos'}
              </span>
              <Button variant="ghost" size="sm" onClick={() => handleDeleteCoupon(c.id)}>Excluir</Button>
            </div>
          ))}
        </div>
      </section>
      )}

      {/* ── Banner campaigns ── */}
      <section className="lojista-section">
        <div className="lojista-section-header">
          <h2 className="lojista-section-title">🗺️ Campanhas de banner</h2>
          <Button variant="primary" size="sm" onClick={bannerModal.open}>+ Nova campanha</Button>
        </div>
        <p className="lojista-section-note">
          Registro real no seu painel — estas campanhas ainda não alteram o banner real da página inicial.
        </p>
        <div className="lojista-banner-list">
          {banners.length === 0 ? (
            <p className="lojista-empty-text">Nenhuma campanha agendada.</p>
          ) : banners.map(b => (
            <div className="lojista-banner-row" key={b.id}>
              <span className="lojista-banner-title">{b.title}</span>
              <span className="lojista-banner-dates">{fmtDate(b.start_date)} – {fmtDate(b.end_date)}</span>
              <Button variant="ghost" size="sm" onClick={() => handleDeleteBanner(b.id)}>Excluir</Button>
            </div>
          ))}
        </div>
      </section>

      {/* ── New coupon modal ── */}
      <Modal open={couponModal.isOpen} onClose={couponModal.close} title="Novo cupom">
        <form onSubmit={handleCreateCoupon} className="lojista-form">
          <FormInput as="input" name="code" label="Código do cupom" required maxLength={20} />
          <FormInput as="select" name="type" label="Tipo" defaultValue="percent">
            <option value="percent">Percentual (%)</option>
            <option value="usd">Valor fixo (US$)</option>
          </FormInput>
          <FormInput as="input" name="value" type="number" min="1" step="1" label="Valor" required />
          <FormInput as="select" name="productId" label="Produto" defaultValue="all">
            <option value="all">Todos os produtos</option>
            {offers.map(p => <option key={p.product_key} value={p.product_key}>{p.canonical_name}</option>)}
          </FormInput>
          <Button type="submit" variant="primary">Criar cupom</Button>
        </form>
      </Modal>

      {/* ── New banner campaign modal ── */}
      <Modal open={bannerModal.isOpen} onClose={bannerModal.close} title="Nova campanha de banner">
        <form onSubmit={handleCreateBanner} className="lojista-form">
          <FormInput as="input" name="title" label="Título da campanha" required maxLength={60} />
          <FormInput as="input" name="startDate" type="date" label="Data de início" required defaultValue={todayStr()} />
          <FormInput as="input" name="endDate" type="date" label="Data de término" required defaultValue={addDays(todayStr(), 7)} />
          <Button type="submit" variant="primary">Agendar campanha</Button>
        </form>
      </Modal>

      {/* ── Programar destaque modal ── */}
      <Modal open={programModal.isOpen} onClose={programModal.close} title="Programar destaque">
        <form onSubmit={handleConfirmProgram} className="lojista-form">
          <p className="lojista-section-note">Período máximo de 1 semana (7 dias).</p>
          <FormInput as="input" name="startDate" type="date" label="Data de início" required defaultValue={todayStr()} />
          <FormInput as="input" name="endDate" type="date" label="Data de término" required defaultValue={addDays(todayStr(), 7)} />
          <Button type="submit" variant="primary">Confirmar agendamento</Button>
        </form>
      </Modal>
    </div>
  )
}
