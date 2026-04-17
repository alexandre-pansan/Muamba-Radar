# Plano: Lista de Compras (Carrinho de Economia)

> Objetivo: permitir que o usuário logado salve produtos de interesse num "carrinho",
> veja quais lojas visitar e (futuramente) visualize os pontos num mapa.

---

## Visão Geral

```
[Card do produto]
      │
   ❤️ clique
      │
  ┌───▼──────────────────────┐
  │  Usuário logado?         │
  │  Não → abre AuthModal    │
  │  Sim  → salva no carrinho│
  └──────────────────────────┘
      │
  [CartPage]
  ├── Lista de produtos salvos
  ├── Agrupados por loja
  ├── Ordenáveis (por loja, economia, nome)
  └── Mapa com pins das lojas (quando endereço disponível)
```

---

## Fase 1 — Backend: Modelo de Dados

### 1.1 Nova tabela: `user_cart_items`

| Coluna         | Tipo        | Descrição                                    |
|----------------|-------------|----------------------------------------------|
| id             | PK UUID     | —                                            |
| user_id        | FK → users  | Dono do item                                 |
| offer_url      | TEXT        | URL canônica da oferta (PK natural)          |
| source         | TEXT        | Adapter ID (ex: "comprasparaguai")           |
| country        | TEXT        | "py" ou "br"                                 |
| store_name     | TEXT        | Nome da loja extraído do scraper             |
| title          | TEXT        | Nome do produto                              |
| price_amount   | FLOAT       | Preço capturado                              |
| price_currency | TEXT        | "PYG", "BRL", etc.                           |
| image_url      | TEXT NULL   | Imagem do produto                            |
| store_id       | FK → stores | Liga à loja manual (nullable)                |
| added_at       | TIMESTAMP   | Quando foi adicionado                        |

> **Constraint**: `UNIQUE(user_id, offer_url)` — sem duplicatas.

---

### 1.2 Nova tabela: `stores`

| Coluna       | Tipo      | Descrição                              |
|--------------|-----------|----------------------------------------|
| id           | PK UUID   | —                                      |
| name         | TEXT      | Nome da loja (ex: "Loja Americana PY") |
| name_aliases | TEXT[]    | Variações do nome para auto-match      |
| country      | TEXT      | "py" ou "br"                           |
| address      | TEXT NULL | Endereço completo                      |
| city         | TEXT NULL | Cidade                                 |
| lat          | FLOAT NULL| Latitude (para mapa)                   |
| lng          | FLOAT NULL| Longitude (para mapa)                  |
| photo_url    | TEXT NULL | Foto da fachada                        |
| google_maps_url | TEXT NULL | Link direto no Maps                 |
| created_at   | TIMESTAMP | —                                      |
| updated_at   | TIMESTAMP | —                                      |

---

### 1.3 Auto-match loja → `stores`

Ao salvar um item no carrinho, o backend tenta casar `store_name` com `stores.name_aliases` (ilike).  
Se encontrar → preenche `store_id`.  
Se não → `store_id = NULL` (admin pode associar depois).

---

## Fase 2 — Backend: Endpoints

### Carrinho

| Método  | Rota                        | Descrição                              |
|---------|-----------------------------|----------------------------------------|
| GET     | `/cart`                     | Lista todos os itens do usuário        |
| POST    | `/cart`                     | Adiciona item (body: offer snapshot)   |
| DELETE  | `/cart/{item_id}`           | Remove item                            |
| DELETE  | `/cart`                     | Limpa carrinho completo                |
| GET     | `/cart/grouped`             | Agrupa por loja (para visualização)    |

### Lojas (admin)

| Método  | Rota                        | Descrição                              |
|---------|-----------------------------|----------------------------------------|
| GET     | `/admin/stores`             | Lista todas as lojas                   |
| POST    | `/admin/stores`             | Cria loja manualmente                  |
| PATCH   | `/admin/stores/{id}`        | Edita nome, endereço, coords, foto     |
| DELETE  | `/admin/stores/{id}`        | Remove loja                            |
| POST    | `/admin/stores/{id}/photo`  | Upload de foto da fachada              |

---

## Fase 3 — Frontend: Botão de Coração no Card

### Mudanças em `ProductCard.jsx`

- Adicionar botão `❤️` no canto superior direito do card.
- Estado: `isSaved` (booleano, consultado via contexto/API).
- Ao clicar:
  - Se não logado → abre `AuthModal` com mensagem "Faça login para salvar produtos".
  - Se logado → `POST /cart` com snapshot da oferta mais barata.
  - Toggle visual imediato (otimista), revert se API falhar.

```jsx
// Snapshot enviado ao POST /cart
{
  offer_url,
  source,
  country,
  store_name,
  title,
  price_amount,
  price_currency,
  image_url
}
```

---

## Fase 4 — Frontend: Página do Carrinho (`CartPage`)

### Rota: `/cart` (ou modal grande acessível pelo header)

#### Layout

```
┌─────────────────────────────────────────┐
│  🛒 Minha Lista de Compras        [Limpar]│
│                                          │
│  Ordenar por: [Loja ▼] [Economia] [Nome] │
│                                          │
│  📍 Loja Americana PY                    │
│  ├── iPhone 15 Pro — G$ 3.200.000        │
│  └── AirPods Pro 2 — G$ 850.000          │
│                                          │
│  📍 Mercado Libre PY                     │
│  └── Samsung S24 — G$ 2.100.000         │
│                                          │
│  [Ver no Mapa]                           │
└─────────────────────────────────────────┘
```

#### Funcionalidades

- Agrupamento por loja (usando `GET /cart/grouped`).
- Ordenação: por loja (A-Z), por maior economia, por nome do produto.
- Remover item individual (ícone 🗑️ no item).
- Botão "Ver no Mapa" → abre `CartMapView` (Fase 5).
- Badge no header com contagem de itens salvos.

---

## Fase 5 — Frontend: Mapa das Lojas (`CartMapView`)

> **Só funciona para lojas que têm `lat/lng` cadastrado pelo admin.**

### Opção de mapa: **Leaflet.js** (gratuito, OpenStreetMap)

```
npm install leaflet react-leaflet
```

#### Comportamento

- Mostra pins para cada loja com endereço conhecido.
- Popup no pin: nome da loja + lista dos produtos salvos lá.
- Lojas sem endereço → listadas abaixo do mapa com aviso "Endereço não disponível".
- Link "Abrir no Google Maps" no popup (usando `google_maps_url` ou gerando via lat/lng).

---

## Fase 6 — Admin: Gerenciamento de Lojas

### Nova aba no `AdminPage.jsx`: "Lojas"

#### Features

- **Lista de lojas** cadastradas com nome, país, endereço, status do endereço (✅/⚠️).
- **Formulário de criação/edição**:
  - Nome da loja
  - Aliases (para auto-match com scraper)
  - País
  - Endereço completo
  - Campo de lat/lng (ou botão "Buscar coordenadas" via Nominatim/OpenStreetMap — gratuito)
  - Upload de foto da fachada
  - Link Google Maps
- **Itens sem loja associada**: seção mostrando `store_name` distintos do carrinho que não casaram com nenhuma loja → facilita o admin criar as entradas faltantes.

---

## Fase 7 — LGPD & Dados

- `DELETE /auth/me` → já existente, deve também deletar `user_cart_items`.
- `GET /auth/me/export` → incluir itens do carrinho no export.

---

## Ordem de Implementação Sugerida

```
1. [Backend]  Criar tabelas stores + user_cart_items (models.py + database.py)
2. [Backend]  Endpoints /cart (CRUD)
3. [Backend]  Endpoints /admin/stores (CRUD + upload foto)
4. [Frontend] Botão ❤️ no ProductCard + CartContext
5. [Frontend] CartPage (lista agrupada por loja)
6. [Frontend] Badge no header
7. [Admin]    Aba "Lojas" no AdminPage
8. [Frontend] CartMapView com Leaflet (condicional: só se há endereços)
9. [Backend]  Incluir carrinho no export/delete LGPD
```

---

## Dependências Novas

| Pacote          | Onde     | Por quê                        |
|-----------------|----------|-------------------------------|
| `react-leaflet` | Frontend | Mapa interativo (gratuito)    |
| `leaflet`       | Frontend | Base do react-leaflet         |
| `python-multipart` | Backend | Upload de foto da fachada  |

> Geocoding de endereços → **Nominatim** (OpenStreetMap, gratuito, sem API key).
> Usado só no admin ao cadastrar loja, não em tempo real.

---

## O que o Scraper já Entrega (sem mudança)

O campo `store` já existe em `ProductOffer` e é extraído pelos adapters.  
Exemplos reais capturados pelo ComprasParaguai adapter:
- `"Loja Americana"`
- `"Mercado Libre"`
- `"InfoCell"`

Esses valores viram `store_name` no carrinho e são usados para o auto-match com a tabela `stores`.

---

## Estimativa de Complexidade

| Fase | Complexidade | Observação                              |
|------|-------------|----------------------------------------|
| 1-3  | Baixa       | CRUD padrão, padrão já existente       |
| 4    | Média       | Contexto global de carrinho + optimistic UI |
| 5    | Média       | Leaflet é simples, mas condicional     |
| 6    | Média       | Form com upload de imagem              |
| 7    | Baixa       | Adição ao fluxo existente              |

---

*Documento gerado em 2026-04-16*
