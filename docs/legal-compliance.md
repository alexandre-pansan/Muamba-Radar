# MuambaRadar — Compliance Legal (Brasil)

> **Escopo:** Este documento cobre as obrigações legais mais relevantes para operar o MuambaRadar (comparador de preços BR/PY com contas de usuário). Não substitui consultoria jurídica formal, mas serve de checklist prático para o time de desenvolvimento.
>
> **Última revisão:** Abril 2026

---

## 1. LGPD — Lei Geral de Proteção de Dados (Lei 13.709/2018)

### 1.1 Dados que o site coleta hoje

| Dado | Tabela/campo | Classificação LGPD |
|------|-------------|-------------------|
| E-mail | `users.email` | Dado pessoal |
| Nome / username | `users.name`, `users.username` | Dado pessoal |
| Senha (hash PBKDF2) | `users.password_hash` | Dado pessoal (anonimizado em uso, mas coletado) |
| Histórico de buscas | `user_searches.query` | Dado pessoal (vinculado ao `user_id`) |
| Preferências (taxas, margem) | `user_prefs.tax_rates` | Dado pessoal |
| Logs de request (IP implícito) | Middleware FastAPI | Dado pessoal |

> Todos estes dados exigem base legal para tratamento (art. 7º LGPD).

### 1.2 Base legal recomendada

- **Contas de usuário + histórico de buscas:** `consentimento` (art. 7º, I) coletado no ato do cadastro — caixa de aceite explícita vinculada à Política de Privacidade.
- **Logs de servidor (acesso/erro):** `legítimo interesse` (art. 7º, IX) e cumprimento de obrigação legal pelo Marco Civil (ver seção 2).
- **Cache de buscas (`search_cache`):** não contém dado pessoal diretamente — sem base legal necessária, mas verifique que nenhum dado de usuário vaze para essa tabela.

### 1.3 O que PRECISA existir (obrigatório)

#### a) Política de Privacidade (art. 9º LGPD)
Deve informar:
- Quais dados são coletados e por quê
- Com quem são compartilhados (ex.: se usar Google Analytics, Meta Pixel, servidores de CDN)
- Por quanto tempo são mantidos
- Direitos do titular (ver abaixo)
- Dados de contato do controlador (você/empresa)

#### b) Aviso de cookies / banner de consentimento
Obrigatório se usar qualquer cookie de rastreamento (Analytics, anúncios). Para cookies estritamente necessários (sessão/JWT), apenas informar na política é suficiente — não precisa de banner de aceite.

#### c) Direitos do titular (art. 18 LGPD) — você PRECISA implementar
O usuário tem direito a:
1. **Acesso** — ver todos os dados que o site possui sobre ele
2. **Correção** — o endpoint `PATCH /auth/me` já cobre parcialmente
3. **Exclusão** — endpoint `DELETE /conta` (não existe ainda — **implementar**)
4. **Portabilidade** — exportar dados em JSON/CSV
5. **Revogação de consentimento** — cancelar conta e apagar dados

**Ação necessária:** Criar endpoint autenticado `DELETE /auth/me` que apague `users`, `user_searches` e `user_prefs` do titular. Manter apenas logs de acesso (obrigação Marco Civil).

#### d) DPO (Encarregado de Dados)
- **Obrigatório formalmente** para empresas (art. 41 LGPD).
- Para pessoa física / microempreendedor early-stage: indique um e-mail de contato de privacidade (ex.: `privacidade@muambaradar.com.br`) na política. A ANPD tem tolerado isso para operações de pequeno porte, mas formalize assim que escalar.

### 1.4 Retenção e exclusão de dados

| Dado | Prazo de retenção recomendado | Motivo |
|------|------------------------------|--------|
| Conta de usuário ativa | Enquanto conta existir | Relação contratual |
| Histórico de buscas | 12 meses (já há trim de 50 últimas) | Experiência UX + proporcionalidade |
| Logs de servidor (IP + path) | **6 meses** (mínimo Marco Civil) | Obrigação legal |
| Cache de produtos (`product_offers`) | TTL configurável (atual: por `expires_at`) | Sem dado pessoal — ok |
| Dados de conta após exclusão | **Apagar imediatamente**, exceto logs de acesso | Direito à exclusão LGPD |

> **Atenção:** O campo `searched_at` em `user_searches` é suficiente para cumprir proporcionalidade. Não guarde buscas de usuários indefinidamente.

### 1.5 Segurança (art. 46 LGPD)

O site já usa PBKDF2-SHA256 com 600.000 iterações para senhas — excelente. Verificar adicionalmente:
- HTTPS obrigatório em produção (sem exceção)
- JWT secret rotacionável via variável de ambiente (já usa `settings.jwt_secret`)
- CORS configurado corretamente (hoje usa `"*"` para dev — **restringir em produção**)
- Banco de dados não exposto publicamente

---

## 2. Marco Civil da Internet (Lei 12.965/2014)

### 2.1 Logs de acesso — obrigação legal

O **art. 15 do Marco Civil** obriga provedores de aplicações a guardar **logs de conexão por 6 meses**. O que deve ser registrado:

| Campo obrigatório | Status atual |
|------------------|-------------|
| IP de origem | Não salvo em DB — apenas logado no console |
| Data/hora da requisição | Salvo em log do middleware FastAPI |
| Identificador da aplicação/endpoint acessado | Salvo |
| Porta (se aplicável) | Depende do servidor |

**Ação necessária:** O `log_requests` middleware atual loga no stdout, mas não persiste. Para cumprir o art. 15, os logs precisam ser armazenados de forma durável por pelo menos 6 meses. Opções:
1. Usar um serviço de log com retenção configurada (ex.: Loki, Datadog, CloudWatch com retenção de 6 meses)
2. Gravar em tabela `access_logs` no banco com `created_at` + `ip` + `path` + `user_id` (nullable)

> **Atenção:** O Marco Civil proíbe fornecer esses logs a terceiros sem ordem judicial (art. 10, §1º). Mencione isso na Política de Privacidade.

### 2.2 Termos de Uso

Não são explicitamente obrigados pela lei, mas o Marco Civil (art. 7º) exige que o usuário seja informado das condições de uso **de forma clara**. Na prática, os Termos de Uso são a forma padrão de fazer isso e protegem você de responsabilidades. Devem cobrir:

- O que o serviço faz e o que não faz
- Que os preços são informativos (ver seção CDC abaixo)
- Que o site não é responsável por compras realizadas nas lojas parceiras
- Que conteúdo gerado pelo usuário (buscas, preferências) pode ser usado para melhorar o serviço
- Proibições de uso (scraping do seu próprio site, automação de buscas em massa)
- Foro eleito para disputas (recomendado: comarca da sede da empresa)

---

## 3. Código de Defesa do Consumidor (CDC — Lei 8.078/1990)

### 3.1 Responsabilidade pela exibição de preços

O CDC (art. 6º, III) garante ao consumidor informação adequada e clara sobre produtos e preços. Como o site exibe preços de terceiros:

**Riscos:**
- Preços exibidos podem estar desatualizados (TTL do cache)
- Preço em guaranis/dólares pode gerar confusão com a conversão BRL
- O consumidor pode alegar que foi induzido ao erro se o preço na loja for diferente

**Posição do site:** O MuambaRadar atua como **agregador de informações**, não como vendedor. O CDC responsabiliza diretamente o **fornecedor** (a loja paraguaia) pela oferta. Porém, para evitar reclamações:

**Disclaimer obrigatório em cada resultado de busca:**
```
Os preços exibidos são aproximados e podem variar. Consulte sempre
o preço final diretamente na loja antes de comprar. O MuambaRadar
não vende produtos e não garante a disponibilidade ou o preço anunciado.
```

### 3.2 Variação cambial

O site converte preços (USD/PYG → BRL). A taxa de câmbio varia diariamente.

**Disclaimer obrigatório junto à conversão:**
```
Conversão baseada na cotação do dia [data]. O valor em reais pode
variar de acordo com a taxa de câmbio no momento da compra e das
tarifas bancárias aplicadas.
```

O campo `captured_at` em `product_offers` já existe — use-o para mostrar "Preço capturado em [data/hora]" na interface.

### 3.3 Site de informação vs. intermediário

Se o site futuramente facilitar a compra (ex.: link de afiliado, redirecionamento com cookie de afiliado), o risco de ser enquadrado como intermediário (e consequentemente responsabilizado) aumenta. Enquanto for apenas link externo + disclaimer, o risco é baixo.

---

## 4. Importação Pessoal / Receita Federal

### 4.1 Limites atuais (regras federais)

| Modalidade | Limite | Tributação |
|------------|--------|------------|
| Compra presencial (mala/mão) | USD 500 por pessoa, por viagem | Isento até o limite; acima disso, 50% sobre o excedente |
| Remessa internacional (e-commerce) | USD 50 por remetente pessoa física (para pessoa física) | Isento |
| Remessa internacional (demais casos) | USD 50–500 | 20% II + possível ICMS-importação estadual |

> **Importante (2026):** A Receita Federal tem intensificado a fiscalização de compras em Ciudad del Este. As regras de importação pessoal têm passado por revisões desde 2023 (Programa Remessa Conforme). Verifique as regras atuais em [receita.fazenda.gov.br](https://www.gov.br/receitafederal) antes de publicar valores específicos.

### 4.2 Disclaimers obrigatórios na interface

O site **precisa** exibir um aviso claro sobre as regras aduaneiras. Sugestão de texto:

```
ATENÇÃO — Importação de produtos do Paraguai está sujeita às regras
da Receita Federal Brasileira. Viajantes podem trazer até USD 500
em compras presenciais isentas de imposto por viagem. Valores acima
disso estão sujeitos a tributação. O MuambaRadar não se responsabiliza
por eventuais taxações, apreensões ou penalidades aduaneiras.
Consulte sempre as regras vigentes em receita.fazenda.gov.br.
```

### 4.3 Risco de responsabilização por "incentivar importação irregular"

**Risco jurídico: baixo, desde que o site:**
1. Não instrua o usuário a declarar menos do que comprou
2. Não sugira formas de burlar a alfândega
3. Exiba claramente os limites legais e oriente a seguir a legislação
4. Não faça afirmações do tipo "compre sem pagar imposto"

O site é um **comparador de preços informativo** — isso é protegido pela liberdade de expressão e pelo direito à informação. Calculadoras de economia que incluem os impostos como custo (o que o site já faz com `tax_rates`) são especialmente seguras porque não omitem o custo real.

---

## 5. Scraping de Dados

### 5.1 Legalidade no Brasil

Não existe lei brasileira que proíba explicitamente o web scraping de dados **publicamente disponíveis**. A discussão jurídica gira em torno de:

- **LGPD:** Se os dados raspados contiverem dados pessoais de terceiros (ex.: nomes de vendedores, avaliações com identificação), pode haver violação. Preços de produtos **não são dados pessoais** — sem problema.
- **Concorrência desleal / propriedade intelectual:** Compilar e exibir preços de terceiros como informação ao consumidor está protegido. O risco aumenta se você reproduzir textos, imagens ou bases de dados proprietárias de forma integral.
- **Termos de Uso dos sites raspados:** A maioria proíbe scraping em seus ToS. Violação dos ToS não é crime no Brasil, mas pode gerar ação civil (ex.: danos por sobrecarga de servidor, reprodução indevida de conteúdo).

### 5.2 Sites paraguaios — jurisdição

O scraping ocorre de servidores brasileiros em sites com sede no Paraguai. O Paraguai ainda não tem legislação robusta sobre scraping/dados. O risco prático de ação legal de um e-commerce paraguaio contra um site brasileiro é baixo, mas não nulo.

### 5.3 Boas práticas para minimizar risco

- **Rate limiting:** O `time.sleep(2)` no refresh de cache é um bom começo. Manter `User-Agent` identificável (ex.: `MuambaRadar/1.0 (+https://muambaradar.com.br/bot)`) demonstra boa-fé.
- **Respeitar `robots.txt`:** Verificar e honrar as diretivas dos sites-alvo. Não é obrigação legal, mas protege de alegações de má-fé.
- **Não reproduzir imagens de terceiros diretamente:** Carregar imagens do CDN de outra empresa pode gerar hotlink abuse e alegação de violação de direitos autorais. Considere proxy de imagens ou apenas exibir link.
- **Cache proporcional:** O TTL atual (`expires_at`) limita o tempo em que dados de terceiros ficam armazenados — boa prática.

### 5.4 Dados de imagem / IA

O módulo `image_detect.py` (atualmente comentado) provavelmente chama APIs externas. Quando ativado, verificar se as imagens enviadas para análise contêm dados de usuários e cumprir LGPD.

---

## 6. Proteções que o Site PODE Usar

### 6.1 Termos de Uso — cláusulas recomendadas

```
1. NATUREZA DO SERVIÇO
   O MuambaRadar é um serviço de comparação de preços informativo.
   Não somos vendedor, intermediário ou representante de qualquer
   loja listada. As compras são realizadas diretamente com os
   estabelecimentos comerciais.

2. EXATIDÃO DAS INFORMAÇÕES
   Os preços exibidos são obtidos automaticamente e podem não
   refletir o preço atual da loja. O MuambaRadar não garante a
   exatidão, completude ou atualidade das informações.

3. RESPONSABILIDADE ADUANEIRA
   O usuário é inteiramente responsável pelo cumprimento das normas
   aduaneiras brasileiras e paraguaias. O site não incentiva nem
   instrui práticas que violem a legislação de importação.

4. LIMITAÇÃO DE RESPONSABILIDADE
   Na máxima extensão permitida por lei, o MuambaRadar não se
   responsabiliza por danos diretos, indiretos ou consequenciais
   resultantes do uso das informações aqui disponibilizadas.

5. PROPRIEDADE INTELECTUAL
   O conteúdo editorial, marca e código do MuambaRadar são
   protegidos. Preços e dados de produtos são informações públicas
   coletadas de terceiros.

6. FORO
   Fica eleito o foro da Comarca de [sua cidade], para dirimir
   quaisquer controvérsias.
```

### 6.2 Disclaimers recomendados na interface

| Local | Texto |
|-------|-------|
| Junto a cada preço | "Preço capturado em [data]. Verifique na loja." |
| Junto à conversão BRL | "Câmbio aproximado. Pode variar." |
| Página inicial / FAQ | Bloco completo sobre regras aduaneiras |
| Rodapé | "Somos um comparador de preços. Não vendemos produtos." |
| Cadastro (checkbox) | "Li e aceito a Política de Privacidade e os Termos de Uso." |

### 6.3 Publicidade / Monetização futura

Quando adicionar anúncios:
- **Google AdSense / Meta Audience Network:** Requer atualização da Política de Privacidade mencionando cookies de terceiros e banner de consentimento (LGPD + padrões IAB).
- **Links de afiliado:** Obrigação de disclosure explícito ("Este link é um link de afiliado. Podemos receber comissão se você comprar.") — exigido pelo CONAR e boas práticas FTC/CADE.

---

## 7. Checklist de Implementação

### Prioridade Alta (antes do lançamento público)

- [ ] Criar página `/privacidade` com Política de Privacidade
- [ ] Criar página `/termos` com Termos de Uso
- [ ] Adicionar checkbox de aceite no cadastro (`/auth/register`)
- [ ] Implementar `DELETE /auth/me` para exclusão de conta + dados pessoais
- [ ] Configurar retenção de logs de acesso por 6 meses (sistema de log durável)
- [ ] Adicionar disclaimer de câmbio junto à conversão BRL
- [ ] Adicionar disclaimer aduaneiro (página de resultados e/ou FAQ)
- [ ] Mostrar `captured_at` na interface ("Preço de [data]")
- [ ] Restringir CORS em produção (remover `"*"`)

### Prioridade Média (primeiros 3 meses)

- [ ] Implementar endpoint `GET /auth/me/export` (portabilidade de dados)
- [ ] Verificar e honrar `robots.txt` dos sites raspados
- [ ] Adicionar `User-Agent` identificável no scraper
- [ ] Definir e documentar e-mail de privacidade (`privacidade@...`)
- [ ] Revisar imagens de produtos (hotlink vs. proxy)

### Prioridade Baixa (antes de monetizar)

- [ ] Banner de cookies se adicionar Analytics/Ads
- [ ] Disclosure de links de afiliado (se aplicável)
- [ ] Registrar DPO formalmente na ANPD (quando empresa constituída)
- [ ] Revisar Termos de Uso com advogado antes de escalar

---

## Referências Legislativas

| Lei | Ementa | Link |
|-----|--------|------|
| Lei 13.709/2018 | LGPD | https://www.planalto.gov.br/ccivil_03/_ato2015-2018/2018/lei/l13709.htm |
| Lei 12.965/2014 | Marco Civil da Internet | https://www.planalto.gov.br/ccivil_03/_ato2011-2014/2014/lei/l12965.htm |
| Lei 8.078/1990 | Código de Defesa do Consumidor | https://www.planalto.gov.br/ccivil_03/leis/l8078compilado.htm |
| Portaria MF 156/1999 e atualizações | Limites importação pessoal | https://www.gov.br/receitafederal |
| Resolução ANPD 2/2022 | Regulamento de comunicação de incidentes | https://www.gov.br/anpd |
