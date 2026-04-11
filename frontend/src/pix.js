// PIX EMV payload generator — BCB spec (BR Code / EMV Merchant Presented Mode)

function emv(id, value) {
  const len = String(value.length).padStart(2, '0')
  return `${id}${len}${value}`
}

function crc16(str) {
  let crc = 0xFFFF
  for (let i = 0; i < str.length; i++) {
    crc ^= str.charCodeAt(i) << 8
    for (let j = 0; j < 8; j++) {
      crc = crc & 0x8000 ? (crc << 1) ^ 0x1021 : crc << 1
      crc &= 0xFFFF
    }
  }
  return crc.toString(16).toUpperCase().padStart(4, '0')
}

/**
 * Gera o payload EMV para QR Code PIX estático.
 * @param {Object} opts
 * @param {string} opts.key       - Chave PIX (UUID, CPF, e-mail, telefone)
 * @param {string} opts.name      - Nome do recebedor (max 25 chars, sem acentos)
 * @param {string} opts.city      - Cidade do recebedor (max 15 chars, sem acentos)
 * @param {number} [opts.amount]  - Valor em reais (opcional)
 * @param {string} [opts.txid]    - ID da transação (max 25 chars, padrão "***")
 */
export function buildPixPayload({ key, name, city, amount, txid = '***' }) {
  const mai = emv('00', 'br.gov.bcb.pix') + emv('01', key)
  const additionalData = emv('05', txid.slice(0, 25))

  let payload =
    emv('00', '01') +                          // Payload Format Indicator
    emv('01', '11') +                          // Static QR (reusável)
    emv('26', mai) +                           // Merchant Account Info
    emv('52', '0000') +                        // MCC
    emv('53', '986') +                         // BRL
    (amount != null
      ? emv('54', amount.toFixed(2))           // Valor
      : '') +
    emv('58', 'BR') +                          // País
    emv('59', name.slice(0, 25)) +             // Nome
    emv('60', city.slice(0, 15)) +             // Cidade
    emv('62', additionalData) +                // Dados adicionais
    '6304'                                     // CRC placeholder

  return payload + crc16(payload)
}

// Dados fixos do recebedor
export const PIX_KEY   = '78db0ebb-b1f0-4b93-a1b4-7f10a5c31d40'
export const PIX_NAME  = 'ALEXANDRE PANSAN JUNIOR'
export const PIX_CITY  = 'SAO PAULO'
