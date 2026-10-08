import React, { useEffect, useId, useRef, useState } from 'react'

/**
 * Lista de seleção no visual do site. O <select> nativo abre uma lista desenhada pelo
 * sistema (azul do Windows/GTK) que CSS nenhum alcança — por isso um botão + listbox.
 *
 * options: [{ value, label }] · value: valor atual · onChange(value)
 * Teclado: ↑/↓ andam, Enter/Espaço escolhem, Esc fecha, Home/End vão às pontas.
 */
export default function Select({ value, options, onChange, ariaLabel, className = '', placeholder = '' }) {
  const [open, setOpen] = useState(false)
  const [active, setActive] = useState(0)
  const rootRef = useRef(null)
  const buttonRef = useRef(null)
  const listId = useId()

  const selectedIndex = options.findIndex(o => o.value === value)
  const selected = options[selectedIndex]

  // fecha ao clicar fora
  useEffect(() => {
    if (!open) return
    function onDown(e) {
      if (!rootRef.current?.contains(e.target)) setOpen(false)
    }
    document.addEventListener('mousedown', onDown)
    return () => document.removeEventListener('mousedown', onDown)
  }, [open])

  // item ativo sempre visível ao navegar pelo teclado
  useEffect(() => {
    if (!open) return
    rootRef.current?.querySelector(`[data-index="${active}"]`)?.scrollIntoView({ block: 'nearest' })
  }, [open, active])

  function openList() {
    setActive(selectedIndex >= 0 ? selectedIndex : 0)
    setOpen(true)
  }

  function choose(index) {
    const option = options[index]
    setOpen(false)
    buttonRef.current?.focus()
    if (option && option.value !== value) onChange(option.value)
  }

  function onKeyDown(e) {
    if (!open) {
      if (['ArrowDown', 'ArrowUp', 'Enter', ' '].includes(e.key)) {
        e.preventDefault()
        openList()
      }
      return
    }
    const last = options.length - 1
    const moves = {
      ArrowDown: () => setActive(i => Math.min(last, i + 1)),
      ArrowUp: () => setActive(i => Math.max(0, i - 1)),
      Home: () => setActive(0),
      End: () => setActive(last),
      Enter: () => choose(active),
      ' ': () => choose(active),
      Escape: () => setOpen(false),
    }
    if (moves[e.key]) {
      e.preventDefault()
      moves[e.key]()
    } else if (e.key === 'Tab') {
      setOpen(false)
    }
  }

  return (
    <div className={`ui-select${open ? ' is-open' : ''} ${className}`.trim()} ref={rootRef}>
      <button
        ref={buttonRef}
        type="button"
        className="ui-select__button"
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-controls={listId}
        aria-label={ariaLabel}
        onClick={() => (open ? setOpen(false) : openList())}
        onKeyDown={onKeyDown}
      >
        <span className="ui-select__value">{selected?.label ?? placeholder}</span>
        <svg className="ui-select__chevron" viewBox="0 0 16 16" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <path d="M4 6l4 4 4-4" />
        </svg>
      </button>

      {open && (
        <ul className="ui-select__list" role="listbox" id={listId} aria-label={ariaLabel}>
          {options.map((option, i) => (
            <li
              key={option.value}
              data-index={i}
              role="option"
              aria-selected={option.value === value}
              className={`ui-select__option${i === active ? ' is-active' : ''}${option.value === value ? ' is-selected' : ''}`}
              onMouseEnter={() => setActive(i)}
              onMouseDown={e => e.preventDefault()}  // não tira o foco do botão
              onClick={() => choose(i)}
            >
              <span>{option.label}</span>
              {option.value === value && (
                <svg viewBox="0 0 16 16" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                  <path d="M3.5 8.5l3 3 6-7" />
                </svg>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
