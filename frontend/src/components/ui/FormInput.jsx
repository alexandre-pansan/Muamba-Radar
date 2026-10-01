import React from 'react'

// Chosen input system for new pages: a Material-style floating label (ported from the
// prototype's `.md-field`/`.md-input`/`.md-label`), NOT the prototype's other, plainer
// `.form-input` system — that one didn't make the cut. Existing forms (AuthModal,
// UserConfigModal) are unaffected and keep their current plain inputs.
export default function FormInput({ as = 'input', label, className = '', children, ...rest }) {
  const Tag = as === 'select' ? 'select' : as === 'textarea' ? 'textarea' : 'input'
  return (
    <div className="ui-field">
      <Tag className={`ui-field-control ${className}`.trim()} {...rest}>
        {as === 'select' ? children : null}
      </Tag>
      {label && <label className="ui-field-label">{label}</label>}
    </div>
  )
}
