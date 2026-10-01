import React, { useEffect, useState } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import { Button } from './ui/index.js'
import { apiBillingStatus, apiBillingSubscribe, apiGetSellerProfile } from '../api.js'

const DEFAULT_PLAN = { key: 'destaque_pro', name: 'Destaque Pro', price: 249, icon: '⭐' }

// Real payment via Mercado Pago (backend Phase 3) when configured + the visitor already
// has a seller profile; otherwise falls back to the honest mailto lead-capture flow from
// Phase 6 — never shows fake/disabled payment fields either way.
const CONTACT_EMAIL = 'muambaradar@gmail.com'

const PLAN_BENEFITS = {
  'Visibilidade': [
    '📈 Ideal para lojas que querem dar o primeiro passo',
    '✓ Destaque de 1 produto por vez nos resultados',
    '✓ Badge "Loja Verificada" estampado nas suas ofertas',
    '✓ Posição garantida no topo da lista (top 3)',
    '✓ Acesso ao Modo Lojista com painel analítico básico',
  ],
  'Destaque Pro': [
    '⭐ Excelente visibilidade e volume de busca',
    '✓ Destaque de até 5 produtos simultâneos',
    '✓ Badge "Loja Verificada" nos resultados de busca',
    '✓ Posição #1 garantida na sua categoria principal',
    '✓ Banner promocional rotativo na home (1x por semana)',
    '✓ Painel de métricas completo e relatórios de concorrência',
  ],
  'Domínio Total': [
    '👑 Domínio de tráfego e visualizações',
    '✓ Destaque de produtos ilimitado',
    '✓ Badge "Parceiro Oficial" + selo exclusivo de confiança',
    '✓ Posição #1 em todas as categorias relacionadas',
    '✓ Banner promocional diário na home',
    '✓ Painel completo + integração via API',
  ],
}

export default function Checkout({ currentUser }) {
  const location = useLocation()
  const navigate = useNavigate()
  const plan = location.state?.plan || DEFAULT_PLAN
  const planKey = plan.key || 'destaque_pro'
  const benefits = PLAN_BENEFITS[plan.name] || PLAN_BENEFITS['Destaque Pro']

  const [checking, setChecking] = useState(true)
  const [billingEnabled, setBillingEnabled] = useState(false)
  const [hasProfile, setHasProfile] = useState(false)
  const [redirecting, setRedirecting] = useState(false)
  const [billingError, setBillingError] = useState('')

  const [name, setName] = useState('')
  const [email, setEmail] = useState(currentUser?.email || '')
  const [storeName, setStoreName] = useState('')
  const [sent, setSent] = useState(false)
  const [revealed, setRevealed] = useState(false)

  useEffect(() => {
    (async () => {
      const [status, profile] = await Promise.all([
        apiBillingStatus(),
        currentUser ? apiGetSellerProfile().catch(() => null) : Promise.resolve(null),
      ])
      setBillingEnabled(status.enabled)
      setHasProfile(!!profile)
      setChecking(false)
    })()
  }, [currentUser])

  async function handleRealSubscribe() {
    setRedirecting(true)
    setBillingError('')
    try {
      const { checkout_url } = await apiBillingSubscribe(planKey)
      window.location.href = checkout_url
    } catch (err) {
      if (err.status === 503) {
        setBillingEnabled(false)
      } else {
        setBillingError(err.message || 'Erro ao iniciar assinatura no Mercado Pago.')
      }
      setRedirecting(false)
    }
  }

  function handleLeadSubmit() {
    const subject = `Interesse no plano ${plan.name} — MuambaRADAR`
    const body = [
      `Nome: ${name}`,
      `E-mail: ${email}`,
      `Loja: ${storeName || '(não informado)'}`,
      `Plano de interesse: ${plan.name} (R$ ${plan.price}/mês)`,
    ].join('\n')
    window.location.href = `mailto:${CONTACT_EMAIL}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`
    setSent(true)
  }

  const canPayForReal = billingEnabled && currentUser && hasProfile

  return (
    <div className="checkout-page">
      <div className="checkout-topbar">
        <Button variant="secondary" size="sm" onClick={() => navigate('/plans')}>← Voltar para Planos</Button>
        <span className="checkout-breadcrumb">Início &gt; Planos &gt; Checkout</span>
      </div>

      <div className="checkout-grid">
        <div className="checkout-col">
          <h2 className="checkout-col-title">1. Plano selecionado</h2>
          <div className="checkout-plan-summary">
            <span className="checkout-plan-icon">{plan.icon}</span>
            <div>
              <strong className="checkout-plan-name">{plan.name}</strong>
              <div className="checkout-plan-price">R$ {plan.price}/mês</div>
            </div>
          </div>
          <div className="checkout-plan-benefits">
            {benefits.map((b, i) => <div key={i} className="checkout-plan-benefit-row">{b}</div>)}
          </div>
        </div>

        <div className="checkout-col">
          {checking ? (
            <p className="lojista-empty-text">Carregando…</p>
          ) : canPayForReal ? (
            <>
              <h2 className="checkout-col-title">2. Assinar</h2>
              <p className="checkout-col-desc">
                Você será redirecionado ao checkout seguro do Mercado Pago para confirmar a
                assinatura mensal do plano <strong>{plan.name}</strong> (PIX, boleto ou cartão).
                Nenhum dado de pagamento passa pelo nosso servidor.
              </p>
              {billingError && <p className="auth-error">{billingError}</p>}
              <Button
                variant="primary"
                className="checkout-submit-btn"
                onClick={handleRealSubscribe}
                disabled={redirecting}
              >
                {redirecting ? 'Redirecionando…' : '💳 Assinar com Mercado Pago'}
              </Button>
            </>
          ) : currentUser && !hasProfile ? (
            <>
              <h2 className="checkout-col-title">2. Crie seu perfil de lojista</h2>
              <p className="checkout-col-desc">
                Para assinar um plano, primeiro crie seu perfil de lojista — é rápido e gratuito.
              </p>
              <Button variant="primary" onClick={() => navigate('/lojista')}>Criar perfil de lojista</Button>
            </>
          ) : (
            <>
              <h2 className="checkout-col-title">2. Fale com a gente</h2>
              <p className="checkout-col-desc">
                {billingEnabled
                  ? <>Entre na sua conta e crie um perfil de lojista para assinar direto. Enquanto isso, deixe seus dados que avisamos.</>
                  : <>As assinaturas do Modo Lojista ainda não estão abertas para pagamento automático. Deixe seus dados que avisamos assim que o plano <strong>{plan.name}</strong> estiver disponível.</>
                }
              </p>

              {sent ? (
                <div className="checkout-sent">
                  <p className="checkout-sent-title">✓ Abrimos seu aplicativo de e-mail</p>
                  <p className="checkout-sent-body">
                    Confira se uma mensagem para <strong>{CONTACT_EMAIL}</strong> foi preparada com seus dados — é só clicar em enviar por lá.
                    Se não abriu automaticamente, escreva você mesmo para{' '}
                    <a href={`mailto:${CONTACT_EMAIL}`}>{CONTACT_EMAIL}</a> mencionando o plano {plan.name}.
                  </p>
                  <Button variant="secondary" size="sm" onClick={() => setSent(false)}>← Editar dados</Button>
                </div>
              ) : !revealed ? (
                // Fields are revealed on click rather than always-mounted: this page is
                // the one place a lead-capture form and the global AuthModal (header
                // "Login/Register", always mounted) can both be reachable at once for an
                // anonymous visitor — and that combination reliably broke AuthModal's
                // register submit (reproduced deterministically: bisected down to "any
                // controlled <input> present here", independent of FormInput vs plain
                // HTML, <form> vs <div>, labels, or the `required` attribute — root cause
                // not fully pinned down, smells like a Chromium autofill/form-heuristics
                // interaction). Not mounting these inputs until asked for sidesteps it.
                <Button variant="primary" className="checkout-submit-btn" onClick={() => setRevealed(true)}>📧 Quero ser avisado</Button>
              ) : (
                <div className="checkout-form">
                  <div className="ui-field">
                    <input className="ui-field-control" placeholder="Seu nome" value={name} onChange={e => setName(e.target.value)} />
                  </div>
                  <div className="ui-field">
                    <input className="ui-field-control" type="email" placeholder="E-mail" value={email} onChange={e => setEmail(e.target.value)} />
                  </div>
                  <div className="ui-field">
                    <input className="ui-field-control" placeholder="Nome da loja (opcional)" value={storeName} onChange={e => setStoreName(e.target.value)} />
                  </div>
                  <Button
                    variant="primary"
                    className="checkout-submit-btn"
                    onClick={handleLeadSubmit}
                    disabled={!name.trim() || !email.trim()}
                  >
                    📧 Enviar
                  </Button>
                </div>
              )}
            </>
          )}

          <div className="checkout-support">
            <span className="checkout-support-icon">📧</span>
            <div>
              <strong>Dúvidas sobre os planos?</strong><br />
              Fale com a gente em <a href={`mailto:${CONTACT_EMAIL}`}>{CONTACT_EMAIL}</a>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
