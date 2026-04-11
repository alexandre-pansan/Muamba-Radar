# Monetização e Integrações — MuambaRadar

> Guia prático para desenvolvedores. Última revisão: abril 2026.
> Nota: WebSearch estava indisponível nesta sessão. Todas as informações são baseadas no conhecimento técnico e nas políticas vigentes até agosto de 2025, que permanecem estáveis para esses tópicos.

---

## 1. Google AdSense

### 1.1 Requisitos para Aprovação

| Critério | Detalhe |
|---|---|
| **Tráfego mínimo** | Não há número oficial. Na prática, sites com menos de ~300–500 visitas/mês raramente são aprovados. Google analisa consistência do tráfego, não só volume. |
| **Idade do domínio** | Nenhuma regra oficial, mas domínios com menos de 6 meses costumam ser rejeitados. |
| **Conteúdo original** | O site precisa ter conteúdo textual relevante e original — páginas de resultados com apenas preços e links são insuficientes. |
| **Política de privacidade** | Obrigatório ter página de Política de Privacidade que mencione uso de cookies e anúncios. |
| **Página "Sobre"** | Recomendada, aumenta chances de aprovação. |
| **HTTPS** | Obrigatório. |
| **Navegabilidade** | Site deve funcionar sem JavaScript crítico faltando. |
| **Sem conteúdo proibido** | Ver seção 1.2. |

**Recomendação para o MVP atual:** antes de aplicar, adicionar:
- Blog ou seção editorial com conteúdo próprio (guias de compra, dicas de viagem para CDE, etc.)
- Página `/sobre`, `/privacidade`, `/termos`
- Meta descriptions, títulos únicos por página de produto

### 1.2 O Que NÃO Pode Ter (causas de rejeição)

- **Conteúdo thin/scraped sem valor agregado:** Páginas que só reexibem dados de terceiros sem nenhum conteúdo editorial original. **Este é o maior risco do MuambaRadar — mitigar com conteúdo adicional.**
- **Botões/links que induzem cliques em anúncios:** Frases como "clique aqui" perto de ads.
- **Pop-ups agressivos ou intersticial no carregamento.**
- **Conteúdo adulto, drogas, armas, pirataria.**
- **Tráfego inválido:** Nunca clicar nos próprios anúncios, nunca incentivar usuários a clicar.
- **Downloads automáticos ou scripts que alteram o browser.**
- **Conteúdo copiado de outros sites sem transformação.**

### 1.3 Políticas Específicas para Sites de Comparação de Preços com Scraping

O AdSense **não proíbe explicitamente** scraping como técnica de coleta, mas aplica regras sobre o resultado:

- O conteúdo exibido deve ter **valor original percebido** — não pode ser uma cópia crua de outra página.
- Reexibir títulos, preços e imagens de e-commerces é aceitável **se** a página agrega contexto (comparação, conversão de moeda, cálculo de impostos/taxas de importação — o que o MuambaRadar já faz).
- Imagens de produtos scrapeadas podem violar direitos autorais — use apenas imagens com licença livre ou substitua por ícones genéricos de categoria.
- **Não** use o logo ou marca registrada dos e-commerces paraguaios sem permissão explícita nas páginas onde AdSense estiver ativo.

### 1.4 Integração no React (Vite)

#### Opção A — Script global no `index.html` (mais simples, sem lazy load)

```html
<!-- frontend/index.html — dentro do <head> -->
<script
  async
  src="https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js?client=ca-pub-XXXXXXXXXX"
  crossorigin="anonymous"
></script>
```

#### Opção B — Componente React com lazy load (recomendado para SPA)

```tsx
// src/components/AdBanner.tsx
import { useEffect, useRef } from "react";

interface AdBannerProps {
  slot: string;          // ex: "1234567890"
  format?: string;       // "auto" | "rectangle" | "horizontal"
  responsive?: boolean;
}

declare global {
  interface Window {
    adsbygoogle: unknown[];
  }
}

export function AdBanner({ slot, format = "auto", responsive = true }: AdBannerProps) {
  const adRef = useRef<HTMLInsElement>(null);
  const initialized = useRef(false);

  useEffect(() => {
    // Carrega o script apenas uma vez
    if (!document.querySelector('script[src*="adsbygoogle"]')) {
      const script = document.createElement("script");
      script.src =
        "https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js?client=ca-pub-XXXXXXXXXX";
      script.async = true;
      script.crossOrigin = "anonymous";
      document.head.appendChild(script);
    }

    // Pushes o ad apenas uma vez por montagem
    if (!initialized.current) {
      initialized.current = true;
      try {
        (window.adsbygoogle = window.adsbygoogle || []).push({});
      } catch (e) {
        console.warn("AdSense error:", e);
      }
    }
  }, []);

  return (
    <ins
      ref={adRef}
      className="adsbygoogle"
      style={{ display: "block" }}
      data-ad-client="ca-pub-XXXXXXXXXX"
      data-ad-slot={slot}
      data-ad-format={format}
      data-full-width-responsive={responsive ? "true" : "false"}
    />
  );
}
```

**Uso:**
```tsx
// Na página de resultados, entre os grupos de produtos
<AdBanner slot="1234567890" format="auto" />
```

#### Posicionamento recomendado no MuambaRadar

- Entre o 3º e 4º resultado de produto (in-feed ad)
- Sidebar em desktop (300×250 ou 300×600)
- Footer fixo mobile (320×50 banner adaptativo)
- **Evitar:** acima do fold na hero, bloqueando CTA principal

#### Arquivo `ads.txt` (obrigatório)

Criar `/frontend/public/ads.txt` com o conteúdo fornecido pelo AdSense após aprovação:
```
google.com, pub-XXXXXXXXXX, DIRECT, f08c47fec0942fa0
```

Esse arquivo precisa estar acessível em `https://seudominio.com/ads.txt`. No nginx, o volume do `public/` já serve isso automaticamente se o Vite foi buildado corretamente.

---

## 2. Alternativas ao AdSense

### 2.1 Comparativo para Audiência Brasileira

| Plataforma | Vale para BR? | Requisito mínimo | RPM estimado (BR) | Observação |
|---|---|---|---|---|
| **Google AdSense** | Sim | ~500 visitas/mês | R$ 3–15 | Melhor para começar |
| **Media.net** | Não recomendado | 50k visitas/mês | Baixo para PT-BR | Focado em inglês/Yahoo |
| **Ezoic** | Parcialmente | 10k sessions/mês (2026 removeu limite oficial, mas na prática rejeitam tráfego baixo) | R$ 5–20 | Exige integração via Cloudflare ou DNS swap — trabalhoso |
| **Taboola** | Sim, mas... | 1M pageviews/mês | Variável | Inviável no estágio atual |
| **AdMob** | Não se aplica | App mobile | — | Só para apps nativos |

**Conclusão:** Para o estágio atual do MuambaRadar, AdSense é o único viável. Migrar para Ezoic quando atingir 30k+ visitas/mês.

### 2.2 Programas de Afiliados Relevantes

| Programa | Comissão | Fit com o MuambaRadar | Como integrar |
|---|---|---|---|
| **Amazon Associates BR** | 1–10% por categoria (eletrônicos ~3–4%) | Alto — muitos produtos têm versão BR na Amazon | Link direto com `tag=seutag-20` na URL |
| **Mercado Livre Afiliados** | 3–12% (via Afiliados ML ou Lomadee) | Alto — referência de preço BR é ML no MVP | API de afiliados via Lomadee/Awin |
| **Magazine Luiza (parceria direta)** | 2–6% | Médio | Via Awin Brasil |
| **Americanas** | 2–5% | Médio | Via Afilio/Rakuten |
| **Zoom/Buscapé** | Modelo CPC (~R$ 0,30–2,00 por clique) | Alto — são concorrentes, mas têm programa de parceiros | Contato direto |

**Estratégia recomendada para o MVP:**
1. Integrar Amazon Associates BR imediatamente (aprovação fácil, links simples)
2. Lomadee para Mercado Livre (API REST documentada)
3. Mostrar preço BR como link de afiliado quando o produto tiver match

---

## 3. Links de Afiliados — Estrutura e Compliance

### 3.1 Como Estruturar sem Ferir Políticas

**Regra central:** links de afiliado devem ser **transparentes** — o usuário precisa saber que você pode receber comissão.

```tsx
// Componente de oferta com link de afiliado
<a
  href={buildAffiliateUrl(offer.url, offer.source)}
  target="_blank"
  rel="noopener noreferrer sponsored"  // <-- "sponsored" é obrigatório pelo Google
  data-affiliate="true"
>
  Ver na {offer.store} →
</a>
```

**Função para construir URLs de afiliado:**
```ts
// src/utils/affiliate.ts
const AFFILIATE_PARAMS: Record<string, (url: string) => string> = {
  amazon: (url) => {
    const u = new URL(url);
    u.searchParams.set("tag", "muambaradar-20");
    return u.toString();
  },
  mercadolivre: (url) => `${url}?matt_tool=XXXXXXX&matt_word=&matt_source=google`,
  // paraguaio: sem afiliado — link direto com rel="noopener"
};

export function buildAffiliateUrl(url: string, source: string): string {
  const builder = AFFILIATE_PARAMS[source];
  return builder ? builder(url) : url;
}
```

**O que NÃO fazer:**
- Não mascarar links de afiliado com redirect opaco sem disclosure
- Não usar links de afiliado em e-mails sem identificação
- Não fazer cloaking (mostrar URL diferente para Googlebot vs usuário)
- Não criar reviews/comparações falsas para empurrar afiliado de maior comissão

### 3.2 Disclaimer Legal Obrigatório

Adicionar em rodapé do site e na página `/sobre`:

```
MuambaRadar participa de programas de afiliados, incluindo Amazon Associates Brasil
e parceiros similares. Ao clicar em links marcados com "ver oferta" e realizar uma
compra, podemos receber uma comissão sem custo adicional para você. Isso não influencia
nossa metodologia de comparação de preços.
```

Em inglês para cumplimiento com FTC (se vier tráfego de fora do Brasil):
```
MuambaRadar is a participant in affiliate programs. We may earn commissions from
qualifying purchases at no additional cost to you.
```

---

## 4. Pagamentos / Plano Premium

### 4.1 Comparativo de Gateways para Usuários Brasileiros

| Gateway | PIX | Boleto | Cartão BR | Recorrência | Taxa | Complexidade de integração | Recomendação |
|---|---|---|---|---|---|---|---|
| **MercadoPago** | Sim | Sim | Sim | Sim (Subscriptions API) | 4,99% + R$0,40 (cartão) | Média | **Melhor para BR** |
| **PagSeguro** | Sim | Sim | Sim | Sim (Assinaturas) | ~3,99–4,99% | Alta (docs ruins) | Segunda opção |
| **Stripe** | Não nativo | Não | Cartão internacional | Sim (excelente) | 2,9% + US$0,30 | Baixa (melhor DX) | Apenas se aceitar pagamento em USD |
| **Pagar.me** | Sim | Sim | Sim | Sim | ~2,5–3,5% | Média | Boa alternativa enterprise |
| **Iugu** | Sim | Sim | Sim | Sim | ~2,3–3,5% | Média | Bom para SaaS BR |

**Recomendação:** MercadoPago para usuários BR (PIX + boleto + cartão nacional), Stripe para eventual plano internacional.

### 4.2 Backend FastAPI — O que Implementar para Assinaturas

#### Modelo de dados mínimo (PostgreSQL)

```sql
-- Adicionar à migration existente
CREATE TYPE subscription_status AS ENUM ('active', 'cancelled', 'past_due', 'trialing');
CREATE TYPE plan_tier AS ENUM ('free', 'premium');

ALTER TABLE users ADD COLUMN IF NOT EXISTS plan plan_tier DEFAULT 'free';
ALTER TABLE users ADD COLUMN IF NOT EXISTS subscription_id VARCHAR(255); -- ID externo (MP/Stripe)
ALTER TABLE users ADD COLUMN IF NOT EXISTS subscription_status subscription_status;
ALTER TABLE users ADD COLUMN IF NOT EXISTS plan_expires_at TIMESTAMPTZ;
```

#### Endpoints necessários

```python
# app/routers/billing.py

# POST /billing/subscribe          — inicia assinatura, redireciona para checkout MP
# POST /billing/webhook            — recebe notificações do gateway (pagamento, cancelamento)
# GET  /billing/subscription       — retorna status atual do plano do usuário autenticado
# POST /billing/cancel             — cancela assinatura

```

#### Integração MercadoPago Subscriptions (resumo)

```python
# pip install mercadopago
import mercadopago

sdk = mercadopago.SDK(settings.MP_ACCESS_TOKEN)

def create_subscription(user_email: str, plan_price_brl: float) -> str:
    """Retorna URL de checkout do MP."""
    body = {
        "reason": "MuambaRadar Premium",
        "auto_recurring": {
            "frequency": 1,
            "frequency_type": "months",
            "transaction_amount": plan_price_brl,
            "currency_id": "BRL",
        },
        "payer_email": user_email,
        "back_url": "https://muambaradar.com/premium/sucesso",
        "notification_url": "https://muambaradar.com/billing/webhook",
    }
    result = sdk.subscription().create(body)
    return result["response"]["init_point"]  # URL de checkout
```

#### Webhook — validação e atualização de status

```python
# app/routers/billing.py
@router.post("/webhook")
async def mp_webhook(request: Request, db: Session = Depends(get_db)):
    data = await request.json()
    # Verificar assinatura do webhook com X-Signature header (MP assina com HMAC)
    # ...validação...

    topic = data.get("type")
    if topic == "subscription_preapproval":
        subscription_id = data["data"]["id"]
        mp_data = sdk.subscription().get(subscription_id)["response"]
        status = mp_data["status"]  # "authorized" | "cancelled" | "paused"
        # Atualizar user.subscription_status e user.plan no DB
```

#### Middleware de autorização por plano

```python
# app/dependencies.py
def require_premium(current_user: User = Depends(get_current_user)):
    if current_user.plan != "premium" or (
        current_user.plan_expires_at and current_user.plan_expires_at < datetime.utcnow()
    ):
        raise HTTPException(status_code=403, detail="Plano Premium necessário.")
    return current_user
```

#### Features sugeridas para o plano Premium

| Feature | Free | Premium |
|---|---|---|
| Buscas por dia | 10 | Ilimitado |
| Histórico de preços | Não | Sim (30 dias) |
| Alertas de preço | Não | Sim (até 20 produtos) |
| Export CSV | Não | Sim |
| API access | Não | Sim (rate limit maior) |
| Sem anúncios | Não | Sim |

**Preço sugerido:** R$ 19,90/mês ou R$ 149/ano.

---

## 5. Restrições Legais Relevantes

> O arquivo `/docs/legal-compliance.md` não existia ao momento desta análise.

### 5.1 Scraping e Redistribuição de Dados

- **Termos de uso dos sites raspados:** Comprasparaguai.com.br e Mercado Livre proíbem scraping em seus ToS. Isso cria risco de:
  - Recebimento de carta de C&D (cease and desist)
  - Bloqueio de IP
  - Ação civil por danos (improvável para uso comparativo sem cópia massiva)
- **Mitigação:** Não armazenar dados por mais de 24h sem nova consulta, exibir apenas amostras (não catálogo completo), linkar de volta às fontes originais, respeitar `robots.txt`.
- **Precedente positivo:** Sites de comparação como Zoom, Buscapé e Google Shopping operam com scraping/feed e são amplamente tolerados quando geram tráfego de referência para as lojas.

### 5.2 LGPD (Lei Geral de Proteção de Dados — Lei 13.709/2018)

Obrigações imediatas para o MuambaRadar:

| Obrigação | Ação necessária |
|---|---|
| Informar coleta de dados pessoais | Banner de cookies + Política de Privacidade |
| Base legal para tratamento | Legítimo interesse ou consentimento explícito |
| Direito de exclusão | Endpoint `DELETE /users/me` para apagar conta |
| Dados de pagamento | **Nunca** armazenar número de cartão — delegar 100% ao gateway |
| DPO (Encarregado) | Obrigatório apenas se tratar dados em larga escala — indicar um e-mail de contato por ora |
| Notificação de vazamento | Notificar ANPD em até 2 dias úteis em caso de incidente |

### 5.3 Legislação Tributária (Importações PY → BR)

O site **não realiza** a transação de importação — apenas informa preços. Isso limita a responsabilidade tributária. Porém:

- **Não garantir** que os preços exibidos são os preços finais com impostos. Adicionar disclaimer: *"Preços em guaranis convertidos para BRL. Impostos de importação, IOF e taxas alfandegárias não incluídos. Consulte a Receita Federal."*
- Não se responsabilizar por compras realizadas — o usuário compra diretamente nas lojas paraguaias.

### 5.4 Publicidade (CONAR e Bacen)

- Links de afiliado devem ser claramente identificados como publicidade (regulamento CONAR)
- Anúncios AdSense são auto-rotulados pelo Google, mas o site deve ter a Política de Privacidade atualizada mencionando DoubleClick/Google Ads
- Não veicular publicidade de produtos financeiros (câmbio, empréstimos) sem registro no Bacen

### 5.5 O Que Definitivamente NÃO Fazer

1. **Não** armazenar imagens dos produtos raspados no próprio servidor (viola direitos autorais)
2. **Não** afirmar que os preços são "garantidos" ou "atualizados em tempo real" sem SLA real
3. **Não** usar marcas registradas (logos de Apple, Samsung, etc.) sem licença em peças de publicidade próprias
4. **Não** fazer cloaking de links de afiliado (URLs enganosas para SEO)
5. **Não** enviar e-mails marketing sem opt-in explícito (LGPD + Lei de Spam)
6. **Não** vender os dados dos usuários coletados para terceiros

---

## 6. Roadmap de Implementação Sugerido

```
Fase 1 — Imediato (sem tráfego ainda)
  [ ] Criar /privacidade, /termos, /sobre
  [ ] Banner de cookies (ex: react-cookie-consent)
  [ ] Disclaimer de afiliados no footer
  [ ] Endpoint DELETE /users/me (LGPD)
  [ ] Integrar Amazon Associates BR nos links de resultado BR

Fase 2 — Com 1k+ visitas/mês
  [ ] Aplicar para Google AdSense
  [ ] Adicionar seção de conteúdo editorial (blog/guias de compra)
  [ ] Integrar Lomadee para Mercado Livre

Fase 3 — Com 5k+ visitas/mês
  [ ] Lançar Plano Premium com MercadoPago Subscriptions
  [ ] Implementar histórico de preços e alertas
  [ ] Avaliar migração para Ezoic se RPM do AdSense for baixo

Fase 4 — Escala
  [ ] Negociar parceria direta com lojas paraguaias (CPA)
  [ ] Avaliar Taboola/Outbrain se tráfego > 500k/mês
```

---

## Referências

- [AdSense Program Policies](https://support.google.com/adsense/answer/48182)
- [AdSense — Webmaster Guidelines](https://support.google.com/adsense/answer/9724)
- [MercadoPago Subscriptions API](https://www.mercadopago.com.br/developers/pt/docs/subscriptions/landing)
- [Amazon Associates BR](https://associados.amazon.com.br)
- [Lomadee (afiliados ML)](https://www.lomadee.com)
- [LGPD — Lei 13.709/2018](https://www.planalto.gov.br/ccivil_03/_ato2015-2018/2018/lei/l13709.htm)
- [CONAR — Código Brasileiro de Autorregulamentação Publicitária](http://www.conar.org.br)
- [Stripe Docs](https://stripe.com/docs)
- [react-adsense](https://www.npmjs.com/package/react-adsense)
