import React, { useState } from 'react'
import { LoginForm, RegisterForm } from './AuthForms.jsx'

// Direct-nav/header-link destination for auth. Shares the exact same LoginForm/RegisterForm
// (and therefore the same apiLogin/apiRegister calls) as AuthModal — no separate/duplicated
// auth logic, and no fake "auto-fill lojista account" shortcut like the prototype had.
export default function LoginPage({ onAuthSuccess, onOpenLegal }) {
  const [tab, setTab] = useState('login')

  return (
    <div className="login-page">
      <div className="login-card">
        <div className="login-card-header">
          <h1 className="login-card-title">Entrar no MuambaRADAR</h1>
          <p className="login-card-subtitle">Salve favoritos, acompanhe seu carrinho e acesse o Modo Lojista.</p>
        </div>

        <nav className="auth-tabs login-page-tabs">
          <button
            className={`auth-tab${tab === 'login' ? ' is-active' : ''}`}
            onClick={() => setTab('login')}
          >
            Entrar
          </button>
          <button
            className={`auth-tab${tab === 'register' ? ' is-active' : ''}`}
            onClick={() => setTab('register')}
          >
            Criar conta
          </button>
        </nav>

        {tab === 'login'
          ? <LoginForm onSuccess={onAuthSuccess} />
          : <RegisterForm onSuccess={onAuthSuccess} onOpenLegal={onOpenLegal} />
        }
      </div>
    </div>
  )
}
