import React, { useEffect, useRef } from 'react'

export default function TermsModal({ open, onClose }) {
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
        <h1 className="modal-title">Termos de Uso</h1>
        <button type="button" className="modal-close" aria-label="Fechar" onClick={onClose}>✕</button>
      </div>
      <div className="modal-body legal-body legal-page-inner">
        <p className="legal-updated">Última atualização: abril de 2026</p>

        <h2>1. Natureza do serviço</h2>
        <p>
          O MuambaRadar é um <strong>serviço de comparação de preços informativo</strong>.
          Não somos vendedor, intermediário, representante ou agente de nenhuma loja listada.
          As compras são realizadas diretamente entre o usuário e os estabelecimentos comerciais.
        </p>

        <h2>2. Exatidão das informações</h2>
        <p>
          Os preços exibidos são obtidos automaticamente de fontes públicas e podem não refletir
          o preço atual praticado pela loja. O MuambaRadar não garante a exatidão, completude
          ou atualidade das informações. Sempre verifique o preço final diretamente na loja antes de comprar.
        </p>
        <p>
          A conversão de preços para reais (R$) utiliza cotações aproximadas do mercado e pode
          diferir do câmbio aplicado no momento da compra, incluindo taxas bancárias e IOF.
        </p>

        <h2>3. Responsabilidade aduaneira</h2>
        <p>
          O usuário é inteiramente responsável pelo cumprimento das normas aduaneiras brasileiras
          e paraguaias. O MuambaRadar não incentiva nem instrui práticas que violem a legislação
          de importação vigente. Viajantes podem trazer até <strong>USD 500</strong> em compras
          presenciais isentas de imposto por viagem, conforme regras da Receita Federal.
          Consulte sempre as regras atuais em{' '}
          <a href="https://www.gov.br/receitafederal" target="_blank" rel="noopener noreferrer">
            receita.fazenda.gov.br
          </a>.
        </p>

        <h2>4. Limitação de responsabilidade</h2>
        <p>
          Na máxima extensão permitida por lei, o MuambaRadar não se responsabiliza por:
        </p>
        <ul>
          <li>Diferenças de preço entre o exibido no site e o cobrado pela loja.</li>
          <li>Problemas com compras realizadas nos estabelecimentos listados.</li>
          <li>Danos decorrentes de tributação, apreensão ou penalidades aduaneiras.</li>
          <li>Indisponibilidade temporária do serviço.</li>
        </ul>

        <h2>5. Uso adequado</h2>
        <p>É proibido utilizar o MuambaRadar para:</p>
        <ul>
          <li>Realizar scraping automatizado ou em massa do nosso site.</li>
          <li>Sobrecarregar nossos servidores com requisições automatizadas.</li>
          <li>Criar contas falsas ou fraudulentas.</li>
          <li>Qualquer atividade ilegal ou que viole direitos de terceiros.</li>
        </ul>

        <h2>6. Propriedade intelectual</h2>
        <p>
          A marca MuambaRadar, o logotipo, o design e o código-fonte são de propriedade exclusiva
          dos seus criadores. Preços e dados de produtos são informações públicas coletadas de terceiros
          e pertencem aos seus respectivos fornecedores.
        </p>

        <h2>7. Modificações</h2>
        <p>
          Podemos atualizar estes termos a qualquer momento. O uso continuado do serviço após
          a publicação de alterações constitui aceitação dos novos termos.
        </p>

        <h2>8. Foro</h2>
        <p>
          Fica eleito o foro da comarca de São Paulo/SP para dirimir quaisquer controvérsias
          decorrentes do uso deste serviço, com renúncia a qualquer outro, por mais privilegiado que seja.
        </p>

        <h2>9. Contato</h2>
        <p>
          Para dúvidas sobre estes termos:{' '}
          <a href="mailto:muambaradar@gmail.com">muambaradar@gmail.com</a>
        </p>
      </div>
    </dialog>
  )
}
