import React from 'react'
import { useNavigate } from 'react-router-dom'

export default function ProfilePage({ currentUser, onLogout }) {
  const navigate = useNavigate()

  if (!currentUser) {
    return (
      <div className="profile-page">
        <div className="profile-card">
          <p className="profile-guest-text">Você precisa entrar para ver seu perfil.</p>
          <button className="compare-btn" onClick={() => navigate('/login')}>Entrar</button>
        </div>
      </div>
    )
  }

  const displayName = currentUser.name || currentUser.username || currentUser.email
  const initial = (displayName || '?').trim().charAt(0).toUpperCase()

  function handleLogout() {
    onLogout()
    navigate('/')
  }

  return (
    <div className="profile-page">
      <div className="profile-header">
        <div className="profile-avatar">{initial}</div>
        <h1 className="profile-name">{displayName}</h1>
        <span className="profile-email">{currentUser.email}</span>
        {currentUser.is_admin && <span className="profile-badge">Admin</span>}
      </div>

      <div className="profile-actions">
        <button className="profile-action-card" onClick={() => navigate('/conta')}>
          <span className="profile-action-icon profile-action-icon--settings">⚙️</span>
          <span className="profile-action-text">
            <strong>Configurações da conta</strong>
            <span>Nome, senha, preferências, buscas recentes e privacidade.</span>
          </span>
        </button>

        <button className="profile-action-card" onClick={() => navigate('/lojista')}>
          <span className="profile-action-icon profile-action-icon--lojista">🏪</span>
          <span className="profile-action-text">
            <strong>Modo Lojista</strong>
            <span>Painel de demonstração para lojistas — banners e destaque de produtos.</span>
          </span>
        </button>

        <button className="profile-action-card" onClick={() => navigate('/plans')}>
          <span className="profile-action-icon profile-action-icon--plans">👑</span>
          <span className="profile-action-text">
            <strong>Assinar Plano Lojista</strong>
            <span>Veja os planos para dar destaque à sua loja nas buscas.</span>
          </span>
        </button>

        <button className="profile-action-card profile-action-card--danger" onClick={handleLogout}>
          <span className="profile-action-icon profile-action-icon--logout">🚪</span>
          <span className="profile-action-text">
            <strong>Sair da conta</strong>
            <span>Desconectar da sessão atual.</span>
          </span>
        </button>
      </div>
    </div>
  )
}
