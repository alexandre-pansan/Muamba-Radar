import React, { useEffect, useRef, useState } from 'react'
import ProductCard from './ProductCard.jsx'
import { Badge, Button, EmptyState, FormInput, Modal, Select, useModal, useToast } from './ui/index.js'

/**
 * Design System (aba do admin): os componentes REAIS do app, lado a lado no tema claro e
 * no escuro. Não é onde se altera nada — a fonte da verdade continua em styles.css (cores)
 * e components/ui/ (componentes). É onde se VALIDA: mudou um token ou componente, abre
 * aqui e confere que botões, campos, listas, checkboxes, popovers e cards continuam
 * coerentes nos dois temas. Peça nova do app entra aqui também.
 */

const TOKENS = [
  ['--accent', 'Marca / ação principal'],
  ['--accent-2', 'Destaque laranja (carrinho, selos)'],
  ['--success', 'Sucesso / preço PY'],
  ['--danger', 'Erro / preço BR'],
  ['--warning', 'Aviso'],
  ['--info', 'Informação'],
  ['--ink', 'Texto principal'],
  ['--text', 'Texto secundário'],
  ['--muted', 'Texto apagado'],
  ['--line', 'Bordas'],
  ['--card', 'Fundo de card'],
  ['--card-bg', 'Fundo de área interna'],
  ['--content-bg', 'Fundo da página'],
  ['--success-bg', 'Fundo de sucesso'],
  ['--warning-bg', 'Fundo de aviso'],
  ['--danger-bg', 'Fundo de erro'],
]

const now = new Date().toISOString()
function offer(country, store, amount, currency = 'USD', brl = amount * 5.23) {
  return {
    offer_id: `${store}-${amount}`, source: 'design-system', country, store,
    title: `${store} oferta`, url: `https://exemplo.invalid/${store}`, captured_at: now,
    price: { amount, currency, amount_brl: brl, fx_rate_used: 5.23 },
  }
}

// Variações do card de produto (dados de exemplo, não vão pro carrinho de verdade)
const SAMPLE_CARDS = [
  {
    label: 'Perfume com marca e chip',
    group: {
      product_key: 'ds-perfume', family_key: 'ds_perfume', canonical_name: 'Lattafa Yara (EDP, 100ML)',
      brand: 'Lattafa', line: 'Yara', concentration: 'EDP', volume_ml: '100ml',
      offers: [offer('py', 'Cellshop', 28.5), offer('py', 'Nissei', 30), offer('br', 'buscape.com.br', 189.9, 'BRL', 189.9)],
    },
  },
  {
    label: 'Eletrônico sem chip',
    group: {
      product_key: 'ds-jbl', family_key: 'jbl flip 6', canonical_name: 'JBL Flip 6',
      brand: 'JBL', line: 'Flip 6',
      offers: [offer('py', 'Visãovip', 70), offer('br', 'buscape.com.br', 578.55, 'BRL', 578.55)],
    },
  },
  {
    label: 'Nome longo, sem preço BR',
    group: {
      product_key: 'ds-long', family_key: 'ds long', canonical_name: 'Anel Inteligente Amazfit Helio Ring A2321 Tamanho 10 Titânio',
      offers: [offer('py', 'Mega Eletrônicos', 199)],
    },
  },
  {
    label: 'Em destaque, com cupom',
    group: {
      product_key: 'ds-highlight', family_key: 'ds highlight', canonical_name: 'Apple iPhone 16 (128GB)',
      brand: 'Apple', line: 'iPhone 16', is_highlighted: true,
      coupon: { code: 'MUAMBA10', description: '10% na loja', discount_pct: 10, store_name: 'Nissei' },
      offers: [offer('py', 'Nissei', 760), offer('py', 'Cellshop', 789), offer('br', 'buscape.com.br', 4958.99, 'BRL', 4958.99)],
    },
  },
]

const SORT_OPTIONS = [
  { value: 'relevancia', label: 'Melhor Resultado' },
  { value: 'menor-py', label: 'Menor Preço PY' },
  { value: 'menor-br', label: 'Menor Preço BR' },
  { value: 'economia', label: 'Maior Economia' },
]

/** Valor real do token naquele tema (lido do CSS, não copiado). */
function TokenSwatch({ name, description }) {
  const ref = useRef(null)
  const [value, setValue] = useState('')
  useEffect(() => {
    if (ref.current) setValue(getComputedStyle(ref.current).getPropertyValue(name).trim())
  }, [name])
  return (
    <div className="ds-token" ref={ref}>
      <span className="ds-token__swatch" style={{ background: `var(${name})` }} />
      <span className="ds-token__name">{name}</span>
      <span className="ds-token__desc">{description}</span>
      <code className="ds-token__value">{value}</code>
    </div>
  )
}

function Row({ label, children, legacy = false }) {
  return (
    <div className="ds-row">
      <span className={`ds-row__label${legacy ? ' is-legacy' : ''}`} title={legacy ? 'Estilo avulso — candidato a migrar pro componente de ui/' : undefined}>
        {label}{legacy && <em> legado</em>}
      </span>
      <div className="ds-row__items">{children}</div>
    </div>
  )
}

/** Mostra o mesmo conteúdo nos dois temas, lado a lado. */
function Themes({ children }) {
  return (
    <div className="ds-themes">
      {['light', 'dark'].map(theme => (
        <div key={theme} className="ds-theme" data-theme={theme}>
          <span className="ds-theme__tag">{theme === 'light' ? 'Claro' : 'Escuro'}</span>
          {typeof children === 'function' ? children(theme) : children}
        </div>
      ))}
    </div>
  )
}

function Section({ id, title, hint, children }) {
  return (
    <section className="ds-section" id={`ds-${id}`}>
      <h3 className="ds-section__title">{title}</h3>
      {hint && <p className="ds-section__hint">{hint}</p>}
      {children}
    </section>
  )
}

const SECTIONS = [
  ['cores', 'Cores'], ['tipografia', 'Tipografia'], ['botoes', 'Botões'], ['campos', 'Campos'],
  ['selecao', 'Seleção'], ['popovers', 'Popovers'], ['chips', 'Chips e selos'],
  ['avisos', 'Avisos'], ['estados', 'Estados'], ['cards', 'Cards'],
]

function SelectDemo() {
  const [value, setValue] = useState('relevancia')
  return <Select value={value} options={SORT_OPTIONS} onChange={setValue} ariaLabel="Exemplo de seleção" />
}

function CheckDemo() {
  const [a, setA] = useState(true)
  const [b, setB] = useState(false)
  const [t, setT] = useState(true)
  return (
    <>
      <label className="ds-inline"><input type="checkbox" checked={a} onChange={e => setA(e.target.checked)} /> Marcado</label>
      <label className="ds-inline"><input type="checkbox" checked={b} onChange={e => setB(e.target.checked)} /> Desmarcado</label>
      <label className="ds-inline"><input type="checkbox" disabled /> Desabilitado</label>
      <label className="ds-inline">
        <input type="checkbox" className="pref-toggle" role="switch" checked={t} aria-checked={t} onChange={e => setT(e.target.checked)} /> Interruptor
      </label>
    </>
  )
}

/** Seção visível no momento (destaca o atalho no menu enquanto rola). */
function useCurrentSection(ids) {
  const [current, setCurrent] = useState(ids[0])
  useEffect(() => {
    const sections = ids.map(id => document.getElementById(`ds-${id}`)).filter(Boolean)
    const scroller = sections[0]?.closest('.admin-tab-body') || null
    const observer = new IntersectionObserver(
      entries => {
        const visible = entries.filter(e => e.isIntersecting).sort((a, b) => a.boundingClientRect.top - b.boundingClientRect.top)
        if (visible[0]) setCurrent(visible[0].target.id.replace('ds-', ''))
      },
      // faixa logo abaixo do menu fixo
      { root: scroller, rootMargin: '-70px 0px -60% 0px' },
    )
    sections.forEach(el => observer.observe(el))
    return () => observer.disconnect()
  }, [ids])
  return current
}

const SECTION_IDS = SECTIONS.map(([id]) => id)

export default function DesignSystem() {
  const show = useToast()
  const modal = useModal()
  const current = useCurrentSection(SECTION_IDS)

  // Regras "[data-theme=dark] .x" valem pra tudo dentro do <html data-theme="dark"> —
  // com o site no escuro, vazariam pra coluna clara. A página fica no claro enquanto
  // aberta (a coluna escura tem o próprio data-theme) e devolve o tema ao sair.
  useEffect(() => {
    const root = document.documentElement
    const previous = root.getAttribute('data-theme')
    // depois do efeito do App, que aplica o tema salvo e roda depois deste (pai)
    const timer = setTimeout(() => root.setAttribute('data-theme', 'light'), 0)
    return () => {
      clearTimeout(timer)
      if (previous) root.setAttribute('data-theme', previous)
    }
  }, [])

  return (
    <div className="ds">
      <nav className="ds-nav" aria-label="Seções do design system">
        {SECTIONS.map(([id, label]) => (
          <a
            key={id}
            href={`#ds-${id}`}
            className={current === id ? 'is-active' : undefined}
            aria-current={current === id ? 'location' : undefined}
          >
            {label}
          </a>
        ))}
      </nav>
      <p className="ds-intro">
        Os componentes reais do app nos dois temas. Mudou uma cor em <code>styles.css</code> ou um
        componente em <code>components/ui/</code>? Confira aqui que tudo continua coerente.
        Itens marcados como <em>legado</em> são estilos avulsos que ainda devem ir para os componentes padrão.
      </p>

      <Section id="cores" title="Cores" hint="Valores lidos do CSS em cada tema.">
        <Themes>
          <div className="ds-tokens">
            {TOKENS.map(([name, description]) => <TokenSwatch key={name} name={name} description={description} />)}
          </div>
        </Themes>
      </Section>

      <Section id="tipografia" title="Tipografia">
        <Themes>
          <h1 className="page-title" style={{ margin: 0 }}>Título de página</h1>
          <h2 className="home-section-title">Título de seção da home</h2>
          <h3 className="ucm-section-title">Título de card de configuração</h3>
          <h4 className="filter-group__title">Título de grupo de filtro</h4>
          <p className="ds-body">Texto corrido — Compare preços entre Paraguai e Brasil.</p>
          <p className="ds-muted">Texto apagado / legenda</p>
        </Themes>
      </Section>

      <Section id="botoes" title="Botões" hint="Padrão: Button (ui/Button.jsx). Os demais são estilos avulsos em uso.">
        <Themes>
          <Row label="Button">
            <Button>Primário</Button>
            <Button variant="secondary">Secundário</Button>
            <Button variant="ghost">Ghost</Button>
            <Button variant="danger">Perigo</Button>
            <Button disabled>Desabilitado</Button>
          </Row>
          <Row label="Tamanhos">
            <Button size="sm">Pequeno</Button>
            <Button>Médio</Button>
            <Button size="lg">Grande</Button>
          </Row>
          <Row label="btn-save" legacy>
            <button type="button" className="btn-save">Salvar</button>
            <button type="button" className="btn-save btn-save-secondary">Secundário</button>
            <button type="button" className="btn-save" disabled>Desabilitado</button>
          </Row>
          <Row label="btn-inline" legacy>
            <button type="button" className="btn-inline">Link de ação</button>
            <button type="button" className="btn-inline btn-muted">Apagado</button>
          </Row>
          <Row label="outros" legacy>
            <button type="button" className="cart-primary-btn">cart-primary-btn</button>
            <button type="button" className="compare-btn">compare-btn</button>
            <button type="button" className="btn-delete">btn-delete</button>
          </Row>
        </Themes>
      </Section>

      <Section id="campos" title="Campos" hint="Padrão para telas novas: FormInput (rótulo flutuante).">
        <Themes>
          <Row label="FormInput"><FormInput label="E-mail" placeholder=" " /></Row>
          <Row label="field" legacy>
            <label className="field" style={{ width: '100%' }}><span>Nome</span><input type="text" placeholder="Seu nome" /></label>
          </Row>
          <Row label="list-input" legacy><input className="list-input" placeholder="Nome da nova lista" /></Row>
          <Row label="busca em filtro"><input type="search" className="filter-group__search" placeholder="Buscar loja..." /></Row>
        </Themes>
      </Section>

      <Section id="selecao" title="Seleção" hint="Select (ui/Select.jsx), checkbox, interruptor, filtros e alternadores.">
        <Themes>
          <Row label="Select"><SelectDemo /></Row>
          <Row label="Checkbox"><CheckDemo /></Row>
          <Row label="Filtro">
            <div style={{ width: 220 }}>
              <label className="filter-checkbox"><input type="checkbox" defaultChecked /><span className="filter-checkbox__label">Nissei</span><span className="filter-checkbox__count">12</span></label>
              <label className="filter-checkbox is-empty"><input type="checkbox" /><span className="filter-checkbox__label">Sem resultado</span><span className="filter-checkbox__count">0</span></label>
            </div>
          </Row>
          <Row label="Alternador">
            <div className="view-switch">
              <button type="button" className="view-chip is-active">Cards</button>
              <button type="button" className="view-chip">Tabela</button>
            </div>
            <button type="button" className="cart-sort-chip is-active">Ativo</button>
            <button type="button" className="cart-sort-chip">Inativo</button>
          </Row>
        </Themes>
      </Section>

      <Section id="popovers" title="Popovers" hint="Lista aberta do Select (estática pra comparar), modal e toast.">
        <Themes>
          <Row label="Lista aberta">
            <div className="ui-select is-open ds-static-popover">
              <ul className="ui-select__list" role="presentation">
                <li className="ui-select__option is-selected"><span>Melhor Resultado</span><span>✓</span></li>
                <li className="ui-select__option is-active"><span>Menor Preço PY</span></li>
                <li className="ui-select__option"><span>Maior Economia</span></li>
              </ul>
            </div>
          </Row>
          <Row label="Modal / toast">
            <Button variant="secondary" onClick={modal.open}>Abrir modal</Button>
            <Button variant="secondary" onClick={() => show('Toast padrão')}>Toast</Button>
            <Button variant="secondary" onClick={() => show('Salvo com sucesso', 'success')}>Toast sucesso</Button>
            <Button variant="secondary" onClick={() => show('Algo deu errado', 'error')}>Toast erro</Button>
          </Row>
        </Themes>
      </Section>

      <Section id="chips" title="Chips e selos">
        <Themes>
          <Row label="Badge">
            <Badge>Padrão</Badge><Badge variant="count">12</Badge><Badge variant="trending">Em alta</Badge>
            <Badge variant="new">Novo</Badge><Badge variant="stale">Desatualizado</Badge>
          </Row>
          <Row label="Card">
            <span className="config-chip">EDP · 100ml</span>
            <span className="pc-store-count-badge" style={{ position: 'static' }}>⭐ 9 lojas</span>
            <span className="pc-economy-badge" style={{ position: 'static' }}>-43%</span>
            <span className="list-row__badge">No carrinho</span>
          </Row>
        </Themes>
      </Section>

      <Section id="avisos" title="Avisos">
        <Themes>
          <div className="pref-notice"><span>⭐ Aviso de sucesso / informação.</span><button type="button" className="btn-inline">Ação</button></div>
          <div className="list-notice">Aviso de atenção — algo ainda não foi salvo.</div>
          <div className="category-notice">
            <span className="category-notice-icon">🚧</span>
            <div className="category-notice-body">
              <span className="category-notice-title">Aviso de categoria</span>
              <span className="category-notice-text">Texto explicando a limitação.</span>
            </div>
          </div>
          <p className="ucm-error">Mensagem de erro de formulário.</p>
        </Themes>
      </Section>

      <Section id="estados" title="Estados">
        <Themes>
          <Row label="Vazio">
            <EmptyState icon="🛒" title="Nada por aqui" text="Texto do estado vazio." action={<Button size="sm">Ação</Button>} />
          </Row>
          <Row label="Carregando">
            <span className="results-skeleton__spinner" aria-hidden="true" />
            <div className="skeleton-card" style={{ width: 200 }} aria-hidden="true">
              <div className="skeleton skeleton-image" style={{ height: 90 }} />
              <div className="skeleton-card__body">
                <div className="skeleton skeleton-text skeleton-text--title" />
                <div className="skeleton skeleton-text skeleton-text--short" />
              </div>
            </div>
          </Row>
        </Themes>
      </Section>

      <Section id="cards" title="Cards" hint="ProductCard real com dados de exemplo — todos devem ter a mesma altura.">
        <Themes>
          <div className="ds-cards">
            {SAMPLE_CARDS.map(({ label, group }, i) => (
              <div key={group.product_key} className="ds-card">
                <span className="ds-card__label">{label}</span>
                <ProductCard group={group} marginPct={20} showMargin={false} idx={i} />
              </div>
            ))}
          </div>
        </Themes>
      </Section>

      <Modal open={modal.isOpen} onClose={modal.close} title="Modal de exemplo" size="sm">
        <p className="ds-body">Conteúdo do modal padrão (ui/Modal.jsx).</p>
      </Modal>
    </div>
  )
}
