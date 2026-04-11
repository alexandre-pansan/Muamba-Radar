import React, { useEffect, useRef } from 'react'

export default function PrivacyModal({ open, onClose }) {
  const dialogRef = useRef(null)

  useEffect(() => {
    const dialog = dialogRef.current
    if (!dialog) return
    if (open && !dialog.open) {
      dialog.showModal()
      setTimeout(() => dialog.querySelector('.modal-close')?.focus(), 50)
    } else if (!open && dialog.open) dialog.close()
  }, [open])

  function handleBackdropClick(e) {
    if (e.target === dialogRef.current) onClose()
  }

  return (
    <dialog
      ref={dialogRef}
      className="modal modal-lg"
      onClick={handleBackdropClick}
      onClose={onClose}
    >
      <div className="modal-header">
        <h1 className="modal-title">Política de Privacidade</h1>
        <button type="button" className="modal-close" aria-label="Fechar" onClick={onClose}>✕</button>
      </div>
      <div className="modal-body legal-body legal-page-inner">
        <p className="legal-updated">Última atualização: abril de 2026</p>

        <h2>1. Quem somos</h2>
        <p>
          O MuambaRadar é um serviço de comparação de preços entre o Paraguai e o Brasil.
          Para dúvidas sobre privacidade, entre em contato pelo e-mail:{' '}
          <a href="mailto:privacidade@muambaradar.com.br">privacidade@muambaradar.com.br</a>.
        </p>

        <h2>2. Dados que coletamos</h2>
        <ul>
          <li><strong>Dados de cadastro:</strong> nome, e-mail e senha (armazenada em hash irreversível).</li>
          <li><strong>Histórico de buscas:</strong> as pesquisas realizadas enquanto você está logado, para exibir no histórico pessoal.</li>
          <li><strong>Preferências:</strong> configurações de taxas e margem salvas na sua conta.</li>
          <li><strong>Logs de acesso:</strong> IP, data/hora e endpoint acessado, conforme exigido pelo Marco Civil da Internet (Lei 12.965/2014), retidos por 6 meses.</li>
        </ul>

        <h2>3. Como usamos seus dados</h2>
        <ul>
          <li>Autenticar sua conta e personalizar sua experiência.</li>
          <li>Exibir seu histórico de buscas.</li>
          <li>Cumprir obrigações legais (Marco Civil).</li>
          <li>Não vendemos nem compartilhamos seus dados pessoais com terceiros para fins comerciais.</li>
        </ul>

        <h2>4. Base legal (LGPD)</h2>
        <p>
          O tratamento dos seus dados de conta e histórico é baseado no seu <strong>consentimento</strong> (art. 7º, I, Lei 13.709/2018),
          dado no momento do cadastro. Os logs de acesso são tratados com base em <strong>obrigação legal</strong> (art. 7º, II).
        </p>

        <h2>5. Seus direitos (LGPD, art. 18)</h2>
        <ul>
          <li><strong>Acesso:</strong> solicite uma cópia de todos os seus dados via Configurações → Exportar dados.</li>
          <li><strong>Correção:</strong> atualize nome e senha em Configurações.</li>
          <li><strong>Exclusão:</strong> apague sua conta e todos os dados pessoais em Configurações → Excluir conta.</li>
          <li><strong>Portabilidade:</strong> exporte seus dados em formato JSON via Configurações → Exportar dados.</li>
          <li><strong>Revogação:</strong> você pode cancelar sua conta a qualquer momento sem custo.</li>
        </ul>

        <h2>6. Retenção de dados</h2>
        <ul>
          <li>Dados de conta: mantidos enquanto a conta existir.</li>
          <li>Histórico de buscas: últimas 50 buscas.</li>
          <li>Logs de acesso: 6 meses (obrigação legal), após isso são excluídos automaticamente.</li>
          <li>Após exclusão da conta: dados pessoais são apagados imediatamente, exceto logs de acesso (obrigação legal).</li>
        </ul>

        <h2>7. Cookies</h2>
        <p>
          Utilizamos apenas cookies estritamente necessários para autenticação (token JWT armazenado localmente no navegador).
          Não utilizamos cookies de rastreamento ou publicidade no momento.
          Caso venha a utilizar Google Analytics ou AdSense no futuro, este documento será atualizado e um banner de consentimento será exibido.
        </p>

        <h2>8. Segurança</h2>
        <p>
          Senhas são armazenadas com hash PBKDF2-SHA256 (600.000 iterações). A comunicação é protegida por HTTPS.
          Em caso de incidente de segurança com dados pessoais, notificaremos a ANPD e os titulares afetados no prazo previsto em lei.
        </p>

        <h2>9. Alterações nesta política</h2>
        <p>
          Podemos atualizar esta política periodicamente. A data de "Última atualização" indica quando a versão atual entrou em vigor.
          Alterações relevantes serão comunicadas por e-mail ou aviso no site.
        </p>

        <h2>10. Contato</h2>
        <p>
          Encarregado de Dados (DPO):{' '}
          <a href="mailto:privacidade@muambaradar.com.br">privacidade@muambaradar.com.br</a>
        </p>
      </div>
    </dialog>
  )
}
