Você é um especialista em compliance legal para produtos digitais brasileiros (LGPD, Marco Civil, CDC).

Audite o MuambaRadar para verificar conformidade legal. Analise o código em `backend/app/` e `frontend/src/`.

Verifique:

1. **LGPD**
   - Endpoint `DELETE /auth/me` existe? (exclusão de conta + dados pessoais)
   - Endpoint `GET /auth/me/export` existe? (portabilidade)
   - Página `/privacidade` existe no frontend?
   - Checkbox de aceite no cadastro (`/auth/register`)?

2. **Marco Civil**
   - Logs de acesso persistidos por 6 meses? (não apenas stdout)
   - Campos `ip`, `created_at`, `path`, `user_id` nos logs?

3. **CDC / Disclaimers**
   - Disclaimer de câmbio exibido junto à conversão BRL?
   - `captured_at` exibido nos resultados ("Preço de [data]")?
   - Disclaimer aduaneiro presente?

4. **Segurança**
   - CORS configurado com `"*"`? (deve ser restrito em produção)
   - JWT secret via variável de ambiente?
   - HTTPS enforçado?

5. **Monetização futura**
   - `rel="sponsored"` nos links de afiliado?
   - Disclaimer de afiliados no rodapé?

Para cada item, informe: ✅ OK | ⚠️ Parcial | ❌ Ausente — e o arquivo/linha relevante.

Ao final, liste as ações prioritárias antes do lançamento público.
