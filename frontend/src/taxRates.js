// Default tax rates — overridden by user's saved prefs from the API

export const DEFAULT_RATES = {
  pix:            0.0099,
  open_finance:   0.0000,
  mp_saldo:       0.0499,
  prepago:        0.0499,
  linha_credito:  0.0499,
  boleto_fixed:   3.49,
  credit_na_hora: 0.0498,
  credit_14d:     0.0449,
  credit_30d:     0.0398,
  // Juros de parcelamento (% a.m. — juros compostos)
  // Padrão baseado em tabela MercadoPago BR (2025)
  installment_2x:  0.0499,
  installment_3x:  0.0399,
  installment_4x:  0.0349,
  installment_5x:  0.0329,
  installment_6x:  0.0319,
  installment_7x:  0.0299,
  installment_8x:  0.0289,
  installment_9x:  0.0279,
  installment_10x: 0.0269,
  installment_11x: 0.0259,
  installment_12x: 0.0249,
}

export function mergeRates(saved) {
  return saved ? { ...DEFAULT_RATES, ...saved } : { ...DEFAULT_RATES }
}
