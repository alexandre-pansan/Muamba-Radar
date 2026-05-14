# Database Schema

```mermaid
erDiagram
    users {
        int id PK
        text email
        text username
        text name
        text password_hash
        bool is_admin
        timestamptz created_at
        int failed_login_attempts
        timestamptz locked_until
    }

    user_prefs {
        int user_id PK,FK
        bool show_margin
        bool hide_beta_notice
        jsonb tax_rates
    }

    user_searches {
        int id PK
        int user_id FK
        text query
        timestamptz searched_at
    }

    refresh_tokens {
        int id PK
        int user_id FK
        varchar token_hash
        timestamptz expires_at
        bool revoked
        timestamptz created_at
    }

    user_cart_items {
        int id PK
        int user_id FK
        int store_id FK
        text offer_url
        text source
        text country
        text store_name
        text title
        float price_amount
        text price_currency
        text image_url
        timestamptz added_at
    }

    data_reports {
        int id PK
        int user_id FK
        text report_type
        text product_title
        text offer_url
        text description
        text reporter_email
        jsonb snapshot
        timestamptz created_at
        bool resolved
        text admin_notes
    }

    stores {
        int id PK
        text name
        jsonb name_aliases
        text country
        text address
        text city
        float lat
        float lng
        text photo_url
        text google_maps_url
        timestamptz created_at
        timestamptz updated_at
    }

    product_offers {
        int id PK
        text url
        text source
        text country
        text store
        text title
        text title_norm
        text image_url
        float price_amount
        text price_currency
        text brand
        text model
        timestamptz captured_at
        timestamptz expires_at
    }

    search_cache {
        int id PK
        text query_raw
        text query_norm
        text country
        text sort
        jsonb result_json
        timestamptz created_at
        timestamptz expires_at
        int hit_count
    }

    access_logs {
        int id PK
        timestamptz created_at
        text method
        text path
        smallint status_code
        text ip
        int user_id
    }

    global_config {
        int id PK
        int beta_notice_version
        text beta_notice_title
        text beta_notice_body1
        text beta_notice_body2
        int donate_goal
        int donate_raised
        int donate_supporters
    }

    unknown_products {
        int id PK
        text title_norm
        text query
        text category
        int hit_count
        timestamptz first_seen
        timestamptz last_seen
    }

    users ||--|| user_prefs : "prefs"
    users ||--o{ user_searches : "histórico"
    users ||--o{ refresh_tokens : "sessões"
    users ||--o{ user_cart_items : "carrinho"
    users ||--o{ data_reports : "reportes"
    stores ||--o{ user_cart_items : "loja física"
```

## Índices e constraints notáveis

| Tabela | Índice / Constraint |
|---|---|
| `users` | `UNIQUE email`, `UNIQUE username` |
| `search_cache` | `INDEX (query_norm, country, sort, expires_at)` |
| `product_offers` | `UNIQUE url` · `INDEX (expires_at)` · `INDEX (country, title_norm)` |
| `user_cart_items` | `UNIQUE (user_id, offer_url)` · `INDEX user_id` |
| `refresh_tokens` | `UNIQUE token_hash` · `INDEX user_id` · `INDEX expires_at` |
| `data_reports` | `INDEX created_at` · `INDEX resolved` |
| `unknown_products` | `UNIQUE (title_norm, category)` · `INDEX (category, hit_count)` |

## Tabelas sem FK (standalone)

- **`search_cache`** — cache global de buscas, sem vínculo a usuário
- **`product_offers`** — catálogo de ofertas scrapeadas
- **`access_logs`** — log HTTP (Marco Civil art. 15 — retenção 6 meses)
- **`global_config`** — singleton row de configuração do app
- **`unknown_products`** — fila de produtos sem match na LUT
