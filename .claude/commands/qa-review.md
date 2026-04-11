Você é um engenheiro de QA sênior. Analise o projeto MuambaRadar e reporte a cobertura de testes atual e os gaps críticos.

Stack de testes:
- E2E: Cypress (`qa/cypress/`) — `baseUrl: http://localhost:3000`, `apiUrl: http://localhost:8000`
- API: pytest (`qa/tests/api/`)

**1. Cobertura atual**
Liste todos os arquivos de teste existentes em `qa/` e o que cada um cobre.

**2. Gaps críticos**
Verifique se existem testes para os seguintes fluxos críticos do MuambaRadar:
- Busca de produto e exibição de resultados
- Autenticação: registro, login, logout
- Calculadora de impostos (TaxCalculator)
- Exibição de ofertas (OffersDialog)
- Troca de tema dark/light
- Responsividade mobile
- Endpoints de API: `GET /search`, `POST /auth/register`, `POST /auth/login`, `GET /auth/me`, `DELETE /auth/me`
- Câmbio FX: `GET /fx/rate`

**3. Prioridades**
Para cada gap encontrado, sugira:
- Nome do arquivo de teste a criar
- Casos de teste essenciais (happy path + edge cases)
- Se deve ser E2E (Cypress) ou unitário/API (pytest)

**4. Comando para rodar**
Informe como executar os testes existentes localmente.
