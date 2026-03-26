// ── Category detection ────────────────────────────────────────────────────────

export function detectCategory(query) {
  const q = (query || '').toLowerCase()
  if (/iphone|ipad|macbook|airpods|apple watch|mac mini|imac/.test(q))           return 'apple'
  if (/perfume|colônia|cologne|fragrance|eau de|edp|edt|parfum|deo|lattafa|dior sauvage|bleu de|acqua di|oud|musk|bvlgari|creed|chanel n|carolina herrera|armani|versace eros|paco rab|viktor.?rolf|marc jacobs daisy|givenchy|lancome|yves saint laurent|ysl|tom ford|coach floral|montblanc|thierry mugler|narciso|viktor/.test(q))     return 'perfume'
  if (/ps5|ps4|playstation|xbox|nintendo|switch|game boy|gameboy|console/.test(q)) return 'console'
  if (/notebook|laptop|dell|lenovo|asus rog|asus zeph|acer|chromebook/.test(q))  return 'notebook'
  if (/samsung galaxy|xiaomi|motorola|redmi|celular|smartphone/.test(q))          return 'smartphone'
  if (/\btv\b|televisão|television|smart tv|oled|qled|monitor/.test(q))           return 'tv'
  if (/fone|headphone|earphone|airpod|headset|jbl|earbuds|som|speaker/.test(q))  return 'headphone'
  if (/câmera|camera|gopro|lente|flash|tripé|fotografía/.test(q))                return 'camera'
  return 'generic'
}

// ── Loading texts per category and locale ─────────────────────────────────────

const texts = {
  pt: {
    apple: [
      'Perguntando pro Tim Cook quanto custa no Paraguai...',
      'Calculando quantos iPhones cabem na mala de mão...',
      'Checando o preço antes de você vender um rim...',
      'Consultando Ciudad del Este antes de você comprar...',
      'Modo muamba ativado para buscar seu Apple...',
    ],
    perfume: [
      'Farejando as melhores ofertas dos dois lados...',
      'Sniffando os preços antes de você embarcar...',
      'Procurando aquele cheirinho bom pelo menor preço...',
      'Consultando o nariz eletrônico da fronteira...',
      'Garimpando fragrâncias antes de você fazer as malas...',
    ],
    console: [
      'Carregando o save de preços do Paraguai...',
      'Buscando o respawn mais barato do mercado...',
      'Verificando se o preço no PY é boss ou final boss...',
      'Player 2 paraguaio consultado, aguarda...',
      'Modo turbo ativado pra achar seu console...',
    ],
    notebook: [
      'Abrindo 500 abas pra achar o menor preço pra você...',
      'Bootando o comparador da fronteira...',
      'Compilando os melhores preços disponíveis...',
      'Processando os dados dos dois lados da fronteira...',
      'Calculando o custo-benefício antes de você decidir...',
    ],
    smartphone: [
      'Consultando as operadoras paraguaias sobre o preço...',
      'Buscando o melhor smartphone dos dois lados...',
      'Comparando chips e preços da fronteira...',
      'Garimpando o celular certo pelo menor preço...',
      'Cruzando a fronteira digitalmente pelo seu smartphone...',
    ],
    tv: [
      'Sintonizando nos melhores preços do Paraguai...',
      'Ajustando o sinal pra captar as melhores ofertas...',
      'Procurando a melhor tela pelo menor preço...',
      'Verificando quantas polegadas cabem no bolso...',
      'Ligando a antena da fronteira...',
    ],
    headphone: [
      'Captando as melhores frequências de preço...',
      'Ligando o noise-cancelling nos preços altos...',
      'Ouvindo o Paraguai falar em preços baixos...',
      'Sintonizando nas melhores ofertas de som...',
      'Volume no máximo pra achar o menor preço...',
    ],
    camera: [
      'Focando nos melhores preços da fronteira...',
      'Revelando as ofertas dos dois lados...',
      'Capturando o menor preço antes de você viajar...',
      'Ajustando a lente pra ver melhor as ofertas...',
      'Fotografando os preços do Paraguai e do Brasil...',
    ],
    generic: [
      'Garimpando ofertas nos dois lados da fronteira...',
      'Cruzando a fronteira digitalmente em busca do menor preço...',
      'Vasculhando as prateleiras virtuais, espera um segundo...',
      'Calculando se vale mais a pena comprar aqui ou lá...',
      'Modo muamba ativado, buscando os preços...',
      'A Muamba tá trabalhando, só um segundo...',
      'Muamba digital em ação nos dois lados da fronteira...',
      'Consultando Ciudad del Este e São Paulo ao mesmo tempo...',
    ],
  },

  en: {
    apple: [
      'Asking Tim Cook about Paraguayan prices...',
      'Calculating how many iPhones fit in a carry-on...',
      'Checking the price before you sell a kidney...',
      'Consulting Ciudad del Este before you buy...',
      'Muamba mode activated for your Apple device...',
    ],
    perfume: [
      'Sniffing out the best deals on both sides of the border...',
      'Tracking down that scent for the lowest price...',
      'Smelling the savings before you travel...',
      'Consulting the digital nose of the border...',
      'Finding the best fragrance deal before you pack...',
    ],
    console: [
      'Loading Paraguay\'s price save file...',
      'Finding the cheapest respawn on the market...',
      'Checking if PY prices are boss level or final boss...',
      'Player 2 from Paraguay is on it, hold tight...',
      'Turbo mode on to find your console...',
    ],
    notebook: [
      'Opening 500 tabs to find the best price for you...',
      'Booting up the border price comparator...',
      'Compiling the best available prices...',
      'Processing data from both sides of the border...',
      'Calculating value before you decide...',
    ],
    smartphone: [
      'Consulting Paraguayan carriers for the best price...',
      'Searching both sides for the best smartphone deal...',
      'Comparing specs and prices across the border...',
      'Finding the right phone for the lowest price...',
      'Crossing the border digitally for your smartphone...',
    ],
    tv: [
      'Tuning in to Paraguay\'s best prices...',
      'Adjusting the signal to catch the best deals...',
      'Finding the best screen for your budget...',
      'Checking how many inches fit in your wallet...',
      'Picking up the border signal...',
    ],
    headphone: [
      'Picking up the best price frequencies...',
      'Noise-cancelling the high prices...',
      'Listening to Paraguay talk low prices...',
      'Tuning in to the best audio deals...',
      'Volume up to find the lowest price...',
    ],
    camera: [
      'Focusing on the best prices across the border...',
      'Developing deals from both sides...',
      'Capturing the lowest price before you travel...',
      'Adjusting the lens for a better view of offers...',
      'Shooting prices in Paraguay and Brazil...',
    ],
    generic: [
      'Digging for deals on both sides of the border...',
      'Crossing the border digitally for the best price...',
      'Browsing virtual shelves, just a moment...',
      'Calculating whether it\'s cheaper here or there...',
      'Muamba mode activated, searching prices...',
      'Muamba is on the job, one second...',
      'Digital muamba in action across the border...',
      'Consulting Ciudad del Este and São Paulo at once...',
    ],
  },

  es: {
    apple: [
      'Preguntándole a Tim Cook cuánto cuesta en Paraguay...',
      'Calculando cuántos iPhones caben en el equipaje de mano...',
      'Verificando el precio antes de que vendas un riñón...',
      'Consultando Ciudad del Este antes de comprar...',
      'Modo muamba activado para tu dispositivo Apple...',
    ],
    perfume: [
      'Olfateando las mejores ofertas de los dos lados...',
      'Rastreando ese aroma por el menor precio...',
      'Buscando ese perfumito bueno antes de viajar...',
      'Consultando la nariz digital de la frontera...',
      'Encontrando la mejor fragancia antes de hacer las maletas...',
    ],
    console: [
      'Cargando el archivo de precios de Paraguay...',
      'Buscando el respawn más barato del mercado...',
      'Verificando si el precio en PY es jefe o jefe final...',
      'Consultando al jugador 2 paraguayo, aguarda...',
      'Modo turbo activado para encontrar tu consola...',
    ],
    notebook: [
      'Abriendo 500 pestañas para encontrar el mejor precio...',
      'Iniciando el comparador de la frontera...',
      'Compilando los mejores precios disponibles...',
      'Procesando datos de ambos lados de la frontera...',
      'Calculando el costo-beneficio antes de decidir...',
    ],
    smartphone: [
      'Consultando las operadoras paraguayas sobre el precio...',
      'Buscando el mejor smartphone de ambos lados...',
      'Comparando chips y precios de la frontera...',
      'Encontrando el celular correcto al menor precio...',
      'Cruzando la frontera digitalmente por tu smartphone...',
    ],
    tv: [
      'Sintonizando los mejores precios de Paraguay...',
      'Ajustando la señal para captar las mejores ofertas...',
      'Buscando la mejor pantalla al menor precio...',
      'Verificando cuántas pulgadas caben en el bolsillo...',
      'Captando la señal de la frontera...',
    ],
    headphone: [
      'Captando las mejores frecuencias de precio...',
      'Activando el cancelador de ruido para los precios altos...',
      'Escuchando a Paraguay hablar de precios bajos...',
      'Sintonizando las mejores ofertas de audio...',
      'Volumen al máximo para encontrar el menor precio...',
    ],
    camera: [
      'Enfocando los mejores precios de la frontera...',
      'Revelando ofertas de ambos lados...',
      'Capturando el menor precio antes de viajar...',
      'Ajustando el lente para ver mejor las ofertas...',
      'Fotografiando precios en Paraguay y Brasil...',
    ],
    generic: [
      'Buscando ofertas en ambos lados de la frontera...',
      'Cruzando la frontera digitalmente en busca del menor precio...',
      'Revisando las estanterías virtuales, un momento...',
      'Calculando si conviene más comprar aquí o allá...',
      'Modo muamba activado, buscando precios...',
      'La Muamba está trabajando, un segundo...',
      'Muamba digital en acción a ambos lados de la frontera...',
      'Consultando Ciudad del Este y São Paulo al mismo tiempo...',
    ],
  },
}

export function getLoadingTexts(query, locale) {
  const category = detectCategory(query)
  const lang = texts[locale] || texts.pt
  return lang[category] || lang.generic
}
