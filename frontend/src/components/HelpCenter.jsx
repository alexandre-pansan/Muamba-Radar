import React, { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Modal, Button } from './ui/index.js'
import useToast from './ui/useToast.js'

/**
 * Guided tours that walk the visitor through the real pages instead of describing them
 * — the interactive half of the help center. BetaNoticeModal's slideshow stays as the
 * quick screenshot tour; this one actually navigates.
 *
 * Each step may carry a `route` (navigated to on entry) and a `scrollTo` selector
 * (scrolled into view once the route has painted). Steps never navigate to a route that
 * needs data we can't guarantee exists — e.g. /product/:key, which is keyed to a live
 * search result — so those steps explain in place rather than dead-ending on a 404.
 */
const TUTORIALS = {
  visitor: {
    label: 'Visitante (comprador)',
    steps: [
      {
        title: 'Comparação de preços PY × BR',
        content: 'Cada card mostra o preço no Paraguai em dólar, o equivalente convertido em reais pela cotação do dia, e o preço no Brasil — com a economia real destacada em porcentagem.',
        route: '/',
      },
      {
        title: 'Lojas e ofertas do produto',
        content: 'Clique em qualquer card de resultado para abrir a página do produto: lá aparece a lista completa de lojas que vendem aquele item, com preço de cada uma e o cupom da loja quando houver.',
      },
      {
        title: 'Salvar na lista de compras',
        content: 'O ♡ no card salva o item na sua lista de compras. Sem login funciona só neste navegador; com login a lista acompanha você em qualquer aparelho.',
      },
      {
        title: 'Cota e imposto de importação',
        content: 'Na lista de compras, use "🧾 Calcular imposto" para simular a cota por pessoa (US$ 500 pela ponte terrestre, US$ 1.000 por via aérea) e os 50% de imposto sobre o excedente.',
        route: '/cart',
      },
      {
        title: 'Cupons das lojas',
        content: 'Ainda na lista de compras, "🎟️ Meus cupons" reúne os cupons ativos das lojas dos seus itens e gera um PNG com QR Code para você apresentar no balcão em Ciudad del Este.',
        route: '/cart',
      },
      {
        title: 'Rota das lojas',
        content: 'A página de rota mostra as lojas dos seus itens no mapa de Ciudad del Este. Arraste as lojas para definir a ordem de visita — a distância total é recalculada na hora.',
        route: '/map',
      },
    ],
  },
  lojista: {
    label: 'Lojista (parceiro)',
    steps: [
      {
        title: 'Painel do lojista',
        content: 'Aqui você vincula sua loja física ao nome que já aparece nos resultados do MuambaRadar. O Muamba apenas lê os preços publicados no site da sua loja — você não edita preço nem nome por aqui.',
        route: '/lojista',
      },
      {
        title: 'Métricas',
        content: 'No topo do painel ficam as contagens de visualizações, favoritados e cliques que os compradores geraram nos produtos da sua loja.',
        route: '/lojista',
      },
      {
        title: 'Destaques',
        content: 'Destaque fixa um produto seu no topo dos resultados de busca, por um período de até 7 dias. A quantidade de destaques simultâneos depende do seu plano.',
        route: '/lojista',
      },
      {
        title: 'Cupons de desconto',
        content: 'Crie cupons para um produto específico ou para a loja inteira. Eles aparecem no card do produto e na lista de compras do comprador, que gera o QR Code em PNG e apresenta na sua loja física.',
        route: '/lojista',
      },
      {
        title: 'Planos',
        content: 'Destaques, cupons e banners exigem um plano ativo. A página de planos mostra o que cada um libera e o valor mensal.',
        route: '/plans',
      },
    ],
  },
}

/** Central de Ajuda — the chooser. Opens either the slideshow tour or a guided tour. */
export function HelpModal({ open, onClose, onStartSlides, onStartTutorial }) {
  return (
    <Modal open={open} onClose={onClose} size="sm" title="📖 Central de Ajuda">
      <p className="help-modal-intro">Escolha como você prefere aprender a usar a plataforma:</p>
      <div className="help-modal-options">
        <Button variant="primary" onClick={() => { onClose(); onStartTutorial('visitor') }}>
          🚶 Tutorial guiado do visitante
        </Button>
        <Button variant="secondary" onClick={() => { onClose(); onStartTutorial('lojista') }}>
          💼 Tutorial guiado do lojista
        </Button>
        <Button variant="ghost" onClick={() => { onClose(); onStartSlides() }}>
          🖼️ Tour rápido em slides
        </Button>
      </div>
    </Modal>
  )
}

/** Floating step card that drives the guided tour. `mode` null = not running. */
export function TutorialCard({ mode, onClose }) {
  const navigate = useNavigate()
  const toast = useToast()
  const [step, setStep] = useState(0)

  useEffect(() => { setStep(0) }, [mode])

  const tutorial = mode ? TUTORIALS[mode] : null
  const current = tutorial?.steps[step]

  useEffect(() => {
    if (!current) return
    if (current.route) navigate(current.route)
    if (!current.scrollTo) return
    // One frame for the route to paint before we look for the target.
    const id = requestAnimationFrame(() => {
      document.querySelector(current.scrollTo)?.scrollIntoView({ behavior: 'smooth', block: 'center' })
    })
    return () => cancelAnimationFrame(id)
  }, [current, navigate])

  if (!tutorial || !current) return null

  const total = tutorial.steps.length
  const isLast = step === total - 1

  function next() {
    if (!isLast) { setStep(s => s + 1); return }
    onClose()
    toast('Tutorial concluído! Boas compras!')
  }

  return (
    <div className="tutorial-card" role="dialog" aria-label="Tutorial guiado">
      <div className="tutorial-card-header">
        <span className="tutorial-card-title">Guia MuambaRadar</span>
        <span className="tutorial-card-step">Passo {step + 1}/{total}</span>
      </div>
      <div className="tutorial-card-content">
        <h4 className="tutorial-card-step-title">{current.title}</h4>
        <p>{current.content}</p>
      </div>
      <div className="tutorial-card-actions">
        <button type="button" className="tutorial-card-skip" onClick={onClose}>Pular</button>
        <div className="tutorial-card-nav">
          {step > 0 && (
            <Button variant="secondary" size="sm" onClick={() => setStep(s => s - 1)}>Anterior</Button>
          )}
          <Button variant="primary" size="sm" onClick={next}>{isLast ? 'Concluir' : 'Avançar'}</Button>
        </div>
      </div>
    </div>
  )
}
