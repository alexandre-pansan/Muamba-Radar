Você é um auditor sênior de UX/UI especializado em React + CSS custom properties.

Faça uma auditoria completa do frontend do MuambaRadar. Analise os arquivos em `frontend/src/components/` e `frontend/src/styles.css`.

Foque em:

1. **CSS variables** — variáveis indefinidas, cores hardcoded que quebram o dark/light theme (ex: `#f8fafc`, `#fff`, `#1e2537` fora de variáveis)
2. **Acessibilidade** — elementos `<li>`, `<div>` com `onClick` sem `tabIndex`, `role` ou `onKeyDown`; imagens sem `alt`
3. **Responsividade** — elementos que somem ou transbordam em mobile (≤ 480px)
4. **Consistência visual** — componentes que não seguem o design system (variáveis: `--card`, `--card-bg`, `--line`, `--chrome-border`, `--text`, `--muted`)
5. **Bugs funcionais** — props recebidas mas não utilizadas, handlers ausentes

Para cada problema encontrado, informe:
- Arquivo e linha
- Descrição do problema
- Fix sugerido (código)

Priorize: CRÍTICO > MÉDIO > BAIXO
