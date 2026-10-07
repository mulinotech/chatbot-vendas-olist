import { htmlToText, truncate } from './html'
import type { StoreProduct } from './nuvemshop'
import type { TinyProductDetail, TinyProductSummary } from './tiny'

// Monta a linha da ProductsTable juntando a loja (Nuvemshop) com o ERP (Tiny):
// - Loja: link, foto, nome comercial, descrição e ID da variação (carrinho)
// - Tiny: preço, estoque, categoria por órgão e palavras-chave

const MAX_DESCRIPTION = 3000

/** Converte o caminho de categoria do Tiny nas 4 categorias usadas nas camadas de conversa. */
export function mapCategory(categoryPath: string, name: string): string {
  const text = `${categoryPath} ${name}`.toUpperCase()
  if (text.includes('DESINTOXICA') || text.includes('DETOX')) return 'desintoxicacao_limpeza'
  if (text.includes('FLORAIS') || text.includes('FREQU')) return 'florais_frequencias'
  if (/COSM[EÉ]TICO|DESODORANTE|CREME|FACIAL/.test(text) && text.includes('CABELO/PELE/UNHA')) return 'pele_beleza'
  return 'suplementacao_reforco'
}

export function buildProductRow(params: {
  store: StoreProduct
  tiny?: TinyProductSummary
  detail?: TinyProductDetail
  stockQty?: number | null
}) {
  const { store, tiny, detail } = params

  const categoryPath = detail?.categoria?.caminhoCompleto ?? ''
  const keywords = [
    categoryPath.replace(/BUSQUE POR ÓRGÃO ->/g, ''),
    ...(detail?.seo?.keywords ?? []),
    ...(detail?.tags ?? []).map((t) => t.nome),
  ]
    .filter(Boolean)
    .join(', ')

  const description =
    store.description || (detail?.descricaoComplementar ? htmlToText(detail.descricaoComplementar) : '') || detail?.seo?.descricao || ''

  // Preço: o Tiny é a fonte da verdade; se o produto não estiver no Tiny, usa o preço da loja
  const price = tiny?.precos.preco || store.price
  const promo = tiny?.precos.precoPromocional || store.promotionalPrice || 0
  const salePrice = promo > 0 && promo < price ? promo : null

  // Estoque: Tiny quando disponível (negativo conta como zero); senão, a disponibilidade da loja
  const controlsStock = detail?.estoque?.controlar !== false && !detail?.estoque?.sobEncomenda
  const stockQty = params.stockQty == null ? null : Math.max(0, params.stockQty)
  const inStock = stockQty == null || !controlsStock ? store.available : stockQty > 0

  return {
    sku: store.sku,
    name: store.name || tiny?.descricao.trim() || store.sku,
    description: truncate(description, MAX_DESCRIPTION),
    price,
    salePrice,
    availability: inStock ? ('in_stock' as const) : ('out_of_stock' as const),
    productLink: store.url,
    imageUrl: store.imageUrl,
    category: mapCategory(categoryPath, store.name),
    keywords,
    variantId: store.variantId,
    tinyId: tiny?.id ?? null,
    stockQty,
    tinyUpdatedAt: tiny?.dataAlteracao ?? null,
  }
}

export type ProductRowInput = ReturnType<typeof buildProductRow>
