import React from 'react'
import { useNavigate } from 'react-router-dom'
import { Button } from './ui/index.js'

const HOW_STEPS = [
  { num: 1, title: 'Seu produto já está aqui', desc: 'O MuambaRADAR rastreia preços das principais lojas de Ciudad del Este automaticamente. Seu produto provavelmente já aparece nos resultados.' },
  { num: 2, title: 'Escolha o destaque', desc: 'Selecione quais produtos ou categorias você quer destacar no topo das buscas dos compradores. Defina o período e o orçamento.' },
  { num: 3, title: 'Venda mais', desc: 'Compradores vêem sua loja em primeiro, com badge de loja verificada e preço atualizado. Mais visibilidade = mais clientes na sua porta.' },
]

export const PLANS = [
  {
    key: 'visibilidade',
    icon: '📈',
    name: 'Visibilidade',
    tagline: 'Ideal para lojas que querem dar o primeiro passo',
    price: 99,
    features: [
      { text: 'Destaque de 1 produto por vez', included: true },
      { text: 'Badge "Loja Verificada" nos resultados', included: true },
      { text: 'Posição de destaque na lista (top 3)', included: true },
      { text: 'Painel de métricas básico (views/cliques)', included: true },
      { text: 'Banner na página inicial', included: false },
      { text: 'Destaque em múltiplas categorias', included: false },
      { text: 'Relatório de comparação de preços', included: false },
    ],
    cta: '📧 Solicitar Plano',
  },
  {
    key: 'destaque-pro',
    icon: '⭐',
    name: 'Destaque Pro',
    tagline: 'Para lojas que querem domínio nas buscas',
    price: 249,
    featured: true,
    features: [
      { text: 'Destaque de até 5 produtos simultâneos', included: true },
      { text: 'Badge "Loja Verificada" nos resultados', included: true },
      { text: 'Posição #1 garantida na sua categoria', included: true },
      { text: 'Banner na home (1× por semana)', included: true },
      { text: 'Destaque em múltiplas categorias', included: true },
      { text: 'Painel completo de métricas + concorrência', included: true },
      { text: 'Relatório semanal de preços', included: false },
    ],
    cta: '⭐ Escolher Destaque Pro',
  },
  {
    key: 'dominio-total',
    icon: '👑',
    name: 'Domínio Total',
    tagline: 'Presença máxima para grandes lojistas',
    price: 499,
    features: [
      { text: 'Produtos em destaque ilimitados', included: true },
      { text: 'Badge "Parceiro Oficial" + selo de confiança', included: true },
      { text: 'Posição #1 em todas as categorias', included: true },
      { text: 'Banner diário na página inicial', included: true },
      { text: 'Promoções exclusivas (ex: desconto por tempo limitado)', included: true },
      { text: 'Relatório semanal de preços vs concorrência', included: true },
      { text: 'Gerente de conta dedicado', included: true },
    ],
    cta: '👑 Contratar Plano',
  },
]

const BENEFITS = [
  {
    img: '/images/benefit_highlighted_card.jpg',
    title: '⭐ Destaque nas Buscas',
    desc: 'Seus produtos ganham uma estrela dourada especial de Destaque e sobem para o topo dos resultados de busca, gerando mais cliques e visibilidade.',
    plans: ['Visibilidade (1x)', 'Destaque Pro (5x)', 'Domínio Total (Ilimitados)'],
  },
  {
    img: '/images/benefit_home_banner.jpg',
    title: '⏳ Banners com Cronômetro',
    desc: 'Apareça em um banner rotativo na página inicial com um contador regressivo promocional para reforçar ofertas por tempo limitado.',
    plans: ['Destaque Pro (1x/semana)', 'Domínio Total (Diário)'],
  },
  {
    img: '/images/benefit_lojista_dashboard.jpg',
    title: '📊 Painel Modo Lojista',
    desc: 'Gerencie banners e acompanhe métricas de visualizações e cliques recebidos diretamente pela plataforma.',
    plans: ['Visibilidade (Básico)', 'Destaque Pro (Completo)', 'Domínio Total (Completo + API)'],
  },
]

export default function Plans() {
  const navigate = useNavigate()

  function choosePlan(plan) {
    navigate('/checkout', { state: { plan: { key: plan.key.replace(/-/g, '_'), name: plan.name, price: plan.price, icon: plan.icon } } })
  }

  return (
    <div className="plans-page">
      <div className="plans-header">
        <h1 className="plans-header-title">Destaque sua Loja no MuambaRADAR</h1>
        <p className="plans-header-subtitle">
          O MuambaRADAR já cataloga automaticamente os produtos das lojas do Paraguai.
          Com nossos planos, sua loja aparece <strong>em primeiro</strong> quando compradores brasileiros buscam o que você vende.
        </p>
        <span className="plans-header-badge">🚧 Assinaturas em breve — cadastre seu interesse</span>
      </div>

      <div className="plans-how">
        {HOW_STEPS.map(s => (
          <div className="plans-how-step" key={s.num}>
            <div className="plans-how-step-num">{s.num}</div>
            <h3 className="plans-how-step-title">{s.title}</h3>
            <p className="plans-how-step-desc">{s.desc}</p>
          </div>
        ))}
      </div>

      <div className="plans-grid">
        {PLANS.map(plan => (
          <div className={`plan-card${plan.featured ? ' plan-card--featured' : ''}`} key={plan.key}>
            {plan.featured && <div className="plan-card-ribbon">Mais popular</div>}
            <div className="plan-card-icon">{plan.icon}</div>
            <h3 className="plan-card-name">{plan.name}</h3>
            <p className="plan-card-tagline">{plan.tagline}</p>
            <div className="plan-card-price">R$ {plan.price}<span className="plan-card-period">/mês</span></div>
            <ul className="plan-card-features">
              {plan.features.map((f, i) => (
                <li key={i} className={`plan-feature ${f.included ? 'plan-feature--included' : 'plan-feature--excluded'}`}>
                  <span className="plan-feature-icon">{f.included ? '✓' : '✕'}</span> {f.text}
                </li>
              ))}
            </ul>
            <Button variant={plan.featured ? 'primary' : 'secondary'} className="plan-card-cta" onClick={() => choosePlan(plan)}>
              {plan.cta}
            </Button>
          </div>
        ))}
      </div>

      <div className="plans-benefits-section">
        <h2 className="plans-benefits-title">Destaque sua Loja no MuambaRADAR: Benefícios Detalhados</h2>
        <div className="plans-benefits-grid">
          {BENEFITS.map((b, i) => (
            <div className="plans-benefit-card" key={i}>
              <img src={b.img} alt={b.title} className="plans-benefit-img" />
              <h3 className="plans-benefit-heading">{b.title}</h3>
              <p className="plans-benefit-desc">{b.desc}</p>
              <div className="plans-benefit-footer">
                <span>Planos disponíveis:</span>
                <div className="plans-benefit-plans">
                  {b.plans.map((p, j) => <span key={j} className="plans-benefit-plan-chip">{p}</span>)}
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
