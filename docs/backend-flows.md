# Backend Flows

## Arquitetura de módulos

```mermaid
graph TD
    subgraph API["FastAPI  (main.py)"]
        EP_COMPARE["/compare"]
        EP_AUTH["/auth/*"]
        EP_CART["/cart/*"]
        EP_ADMIN["/admin/*"]
        EP_MISC["/config · /fx · /suggestions · /reports"]
    end

    subgraph Services["services/"]
        SVC_COMPARE["compare.py\nscrape_offers\nbuild_response_from_offers"]
        SVC_MATCH["matcher.py\ngroup_offers"]
        SVC_NORM["normalization.py\nnormalize_text\nmatches_query\nextract_brand_model"]
        SVC_FX["fx.py\nbuild_price\nget_brl_per_usd"]
        SVC_LUT["product_lut.py\nlookup"]
    end

    subgraph Adapters["adapters/"]
        ADR_CP["ComprasParaguai\n🇵🇾 PY"]
        ADR_ML["MercadoLivre\n🇧🇷 BR"]
        ADR_BS["Buscape\n🇧🇷 BR"]
        ADR_REG["registry.py\nget_adapters()"]
    end

    subgraph DB["PostgreSQL"]
        T_OFFERS[("product_offers")]
        T_CACHE[("search_cache")]
        T_USERS[("users / user_prefs")]
        T_CART[("user_cart_items")]
        T_STORES[("stores")]
        T_UNK[("unknown_products")]
    end

    EP_COMPARE --> SVC_COMPARE
    SVC_COMPARE --> ADR_REG
    ADR_REG --> ADR_CP & ADR_ML & ADR_BS
    SVC_COMPARE --> SVC_NORM
    SVC_COMPARE --> SVC_MATCH
    SVC_MATCH --> SVC_LUT
    SVC_MATCH --> SVC_NORM
    SVC_COMPARE --> SVC_FX
    SVC_COMPARE --> T_OFFERS & T_CACHE & T_UNK
    EP_AUTH --> T_USERS
    EP_CART --> T_CART & T_STORES
    EP_ADMIN --> T_OFFERS & T_CACHE & T_USERS & T_STORES
```

---

## Fluxo principal — `/compare`

```mermaid
flowchart TD
    A([Client GET /compare?q=...]) --> B[normalize_text query]
    B --> C[_load_db_offers\nproduct_offers WHERE expires_at > now\n+ matches_query filter]

    C --> D{country == all?}

    D -- sim --> E[run PY adapters\nComprasParaguai]
    E --> F[_br_queries_from_py_offers\nLUT lookup → canonical names\nstrip SKU/storage/bundle]
    F --> G[run BR adapters\nMercadoLivre + Buscape\npor query derivada]
    G --> H[py_offers + br_offers]

    D -- não --> I[run adapters\nfiltrado por país]
    I --> H

    H --> J[Merge db_offers + live_offers\nlive wins on URL conflict]
    J --> K[Attach store_info\nbatch lookup stores + aliases]
    K --> L{live_offers?}

    L -- sim --> M[_upsert_offers → product_offers\nupsert on url conflict]
    M --> N[_purge_expired\ndelete expired offers + cache]
    N --> O

    L -- não --> O[update search_cache\nhit_count++ ou INSERT]
    O --> P{usuário logado?}
    P -- sim --> Q[_save_user_search\nupsert + trim 50 recentes]
    Q --> R
    P -- não --> R[group_offers\nLUT match → ProductGroupModel]
    R --> S[_compute_cheapest\n_compute_preview_offers\n_select_group_image]
    S --> T([CompareResponseModel\nX-Cache: MISS | FALLBACK])

    style T fill:#2d6a4f,color:#fff
    style A fill:#1b4332,color:#fff
```

---

## Fluxo de autenticação

### POST /auth/register

```mermaid
flowchart TD
    R1([body: email + username + password]) --> R2{email ou username\njá existe?}
    R2 -- sim --> R3([409 Conflict])
    R2 -- não --> R4[hash_password\ncreate User]
    R4 --> R5[create_access_token\ncreate_refresh_token]
    R5 --> R6([TokenResponse])
```

### POST /auth/login

```mermaid
flowchart TD
    L1([body: identifier + password]) --> L2[busca por email ou username]
    L2 --> L3{conta bloqueada?\nlocked_until > now}
    L3 -- sim --> L4([429 Retry-After])
    L3 -- não --> L5{credenciais válidas?}
    L5 -- não --> L6[failed_attempts++\nbloqueio se >= 5 tentativas]
    L6 --> L7([401 Unauthorized])
    L5 -- sim --> L8[reset failed_attempts]
    L8 --> L9[create_access_token\ncreate_refresh_token]
    L9 --> L10([TokenResponse])
```

### POST /auth/refresh  ·  rotas protegidas

```mermaid
flowchart TD
    RF1([refresh_token]) --> RF2[verify_refresh_token\nhash + expiry + revoked]
    RF2 --> RF3[revoke old token]
    RF3 --> RF4[create_access_token\ncreate_refresh_token]
    RF4 --> RF5([TokenResponse rotacionado])

    P1([Bearer access_token]) --> P2[get_current_user\nJWT decode + DB lookup]
    P2 --> P3{is_admin\nrequired?}
    P3 -- sim --> P4[require_admin\n403 se não admin]
    P3 -- não --> P5([handler])
    P4 --> P5
```

---

## Fluxo do carrinho

```mermaid
flowchart TD
    A([POST /cart]) --> B[get_current_user]
    B --> C{item já existe\nno carrinho?}
    C -- sim --> D([retorna item existente])
    C -- não --> E[_find_store_match\nbusca por name + aliases\nfiltrado por país]
    E --> F{store encontrada?}
    F -- sim --> G[UserCartItem com store_id]
    F -- não --> H[UserCartItem sem store_id]
    G & H --> I[INSERT user_cart_items]
    I --> J[_enrich_cart_item\nanexar StoreInfo]
    J --> K([CartItemResponse])

    L([GET /cart/grouped]) --> M[query por user_id\nordenado por store_name]
    M --> N[agrupar por store_name\nenriquecer com store_info\nlazy match se store_id null]
    N --> O([list CartGroupItem\npara o mapa])
```
