import React from 'react'

// Slides do banner da home — aqui (e não no Home.jsx) pra o Design System do admin
// mostrar o banner de verdade.
export const HERO_SLIDES = [
  {
    key: 'compare',
    bg: 'linear-gradient(135deg, var(--py-color) 0%, var(--accent) 50%, var(--br-color) 100%)',
    title: 'Compare preços Paraguai × Brasil',
    subtitle: 'Descubra quanto você pode economizar comprando em Ciudad del Este.',
    cta: 'Ver ofertas',
  },
  {
    key: 'save',
    bg: 'linear-gradient(135deg, var(--accent) 0%, var(--accent-2) 100%)',
    title: 'Economize na sua próxima viagem',
    subtitle: 'Eletrônicos, perfumes e mais — tudo comparado automaticamente.',
    cta: 'Buscar agora',
  },
]

/** Bandeira do Paraguai em SVG — o emoji 🇵🇾 vira as letras "PY" no Windows. */
function ParaguayFlag() {
  return (
    <svg className="home-hero-deco" viewBox="0 0 150 90" aria-hidden="true">
      <rect width="150" height="30" fill="#D52B1E" />
      <rect y="30" width="150" height="30" fill="#FFFFFF" />
      <rect y="60" width="150" height="30" fill="#0038A8" />
      <circle cx="75" cy="45" r="11" fill="none" stroke="#0038A8" strokeWidth="2" />
      <circle cx="75" cy="45" r="5" fill="#F4C400" />
    </svg>
  )
}

export default function HeroSlide({ slide, onCta }) {
  return (
    <div className="home-hero-slide" style={{ background: slide.bg }}>
      <div className="home-hero-text">
        <h2 className="home-hero-title">{slide.title}</h2>
        <p className="home-hero-subtitle">{slide.subtitle}</p>
        <button type="button" className="ui-btn home-hero-cta" onClick={onCta}>
          {slide.cta}
        </button>
      </div>
      <ParaguayFlag />
    </div>
  )
}
