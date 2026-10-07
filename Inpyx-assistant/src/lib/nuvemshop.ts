import { decodeEntities, htmlToText } from './html'

// Leitura das páginas públicas da loja Nuvemshop (sem API/credenciais).
// Daqui vêm: quais produtos estão publicados, link, foto, descrição e o ID da variação
// usado no link de carrinho. Para reaproveitar com outro cliente Nuvemshop, troque STORE_URL.

export const STORE_URL = 'https://herrmannhealth.com.br'

const HEADERS = { 'User-Agent': 'MulinoBot/1.0 (+catalogo chatbot)', Accept: 'text/html' }

export type StoreProduct = {
  url: string
  productId: number
  variantId: number
  sku: string
  name: string
  description: string
  imageUrl: string
  price: number
  promotionalPrice: number | null
  available: boolean
}

async function fetchHtml(url: string): Promise<string | null> {
  const res = await fetch(url, { headers: HEADERS, redirect: 'follow' })
  if (res.status === 404) return null
  if (!res.ok) throw new Error(`Loja retornou ${res.status} para ${url}`)
  return res.text()
}

/** Percorre as páginas de listagem da loja e devolve os links de todos os produtos publicados. */
export async function listStoreProductUrls(maxPages = 30): Promise<string[]> {
  const urls = new Set<string>()
  const productLink = new RegExp(`href="(${STORE_URL.replace(/[.]/g, '\\.')}/produtos/[^"/?#]+/)"`, 'g')

  for (let page = 1; page <= maxPages; page++) {
    const html = await fetchHtml(`${STORE_URL}/produtos/page/${page}/`)
    if (!html) break
    const before = urls.size
    for (const match of html.matchAll(productLink)) urls.add(match[1])
    if (urls.size === before) break // página sem produtos novos = fim da listagem
  }
  return [...urls]
}

/** Extrai o conteúdo interno de uma <div> cuja abertura começa em `start`, respeitando divs aninhadas. */
function innerDiv(html: string, start: number): string {
  const openEnd = html.indexOf('>', start) + 1
  const tag = /<(\/?)div\b[^>]*>/gi
  tag.lastIndex = openEnd
  let depth = 1
  for (let m = tag.exec(html); m; m = tag.exec(html)) {
    depth += m[1] ? -1 : 1
    if (depth === 0) return html.slice(openEnd, m.index)
  }
  return ''
}

const meta = (html: string, property: string) =>
  decodeEntities(html.match(new RegExp(`<meta property="${property}" content="([^"]*)"`))?.[1] ?? '').trim()

/** Lê a página de um produto. Retorna null se a página não existir ou não tiver formulário de compra. */
export async function fetchStoreProduct(url: string): Promise<StoreProduct | null> {
  const html = await fetchHtml(url)
  if (!html) return null

  const productId = Number(html.match(/data-store="product-form-(\d+)"/)?.[1])
  if (!productId) return null

  // A página tem vários data-variants (produtos relacionados); pegamos o do produto principal
  let variants: any[] = []
  for (const match of html.matchAll(/data-variants=(?:"([^"]*)"|'([^']*)')/g)) {
    try {
      const parsed = JSON.parse(decodeEntities(match[1] ?? match[2]))
      if (parsed[0]?.product_id === productId) {
        variants = parsed
        break
      }
    } catch {
      // JSON malformado em algum card relacionado: ignorar
    }
  }
  const variant = variants.find((v) => v.is_visible !== false) ?? variants[0]
  if (!variant?.sku) return null

  const descStart = html.search(/<div[^>]*class="[^"]*product-description[^"]*"/)
  const description = descStart >= 0 ? htmlToText(innerDiv(html, descStart)) : meta(html, 'og:description')

  return {
    url: meta(html, 'og:url') || url,
    productId,
    variantId: variant.id,
    sku: String(variant.sku).trim(),
    name: meta(html, 'og:title'),
    description,
    imageUrl: meta(html, 'og:image').replace(/^http:/, 'https:'),
    price: variant.price_number,
    promotionalPrice: variant.has_promotional_price ? variant.promotional_price_number : null,
    available: Boolean(variant.available),
  }
}

/**
 * Link de carrinho da Nuvemshop: abre o checkout com os itens já adicionados.
 * Formato: {loja}/comprar/{idVariacao}-{quantidade},{idVariacao}-{quantidade}/
 */
export function buildCartUrl(items: { variantId: number; quantity: number }[]): string {
  return `${STORE_URL}/comprar/${items.map((i) => `${i.variantId}-${i.quantity}`).join(',')}/`
}

export type CondicoesLoja = { descontoPix: number | null; parcelasMax: number; parcelasSemJuros: number }

/** Lê as condições de pagamento exibidas na página de um produto da loja (PIX e parcelamento). */
export async function fetchStorePaymentConditions(productUrl: string): Promise<CondicoesLoja | null> {
  const html = await fetchHtml(productUrl)
  if (!html) return null
  for (const match of html.matchAll(/data-variants=(?:"([^"]*)"|'([^']*)')/g)) {
    try {
      const variant = JSON.parse(decodeEntities(match[1] ?? match[2]))[0]
      if (!variant?.installments_data) continue
      const planos = Object.values(JSON.parse(variant.installments_data))[0] as Record<string, { without_interests: boolean }>
      const parcelas = Object.keys(planos).map(Number).sort((a, b) => a - b)
      const pix = Number(String(variant.price_with_payment_discount_short ?? '').replace(/[^\d,]/g, '').replace(',', '.'))
      return {
        descontoPix: pix && variant.price_number ? Math.round((1 - pix / variant.price_number) * 100) : null,
        parcelasMax: parcelas.at(-1) ?? 1,
        parcelasSemJuros: parcelas.filter((p) => planos[p]?.without_interests).at(-1) ?? 1,
      }
    } catch {
      // card com JSON malformado: tenta o próximo
    }
  }
  return null
}
