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
}

export function mergeRates(saved) {
  return saved ? { ...DEFAULT_RATES, ...saved } : { ...DEFAULT_RATES }
}
