import React from 'react'

export default function EmptyState({ icon, title, text, action }) {
  return (
    <div className="ui-empty-state">
      {icon && <div className="ui-empty-state-icon">{icon}</div>}
      {title && <h3 className="ui-empty-state-title">{title}</h3>}
      {text && <p className="ui-empty-state-text">{text}</p>}
      {action}
    </div>
  )
}
