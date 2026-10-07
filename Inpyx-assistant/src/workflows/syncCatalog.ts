import { bot, Workflow, z } from '@botpress/runtime'
import { ProductsTable } from '../tables/Products'
import { buildProductRow } from '../lib/catalog'
import { fetchStoreProduct, listStoreProductUrls } from '../lib/nuvemshop'
import { getTinyAccessToken, getTinyProduct, getTinyStock, listActiveTinyProducts, type TinyProductSummary } from '../lib/tiny'

// Sincroniza o catálogo do bot com a loja (Nuvemshop) e o ERP (Tiny) a cada 3 horas.
// Também mantém o acesso ao Tiny vivo (o refresh token expira em 1 dia).

const BATCH_SIZE = 8
// O limite do Tiny é compartilhado com a integração da loja: ~1 requisição/segundo é seguro
const TINY_DELAY_MS = 1100

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms))

type SyncStatus = NonNullable<typeof bot.state.catalogSync>
const setSyncStatus = (patch: SyncStatus) => {
  try {
    bot.state.catalogSync = { ...bot.state.catalogSync, ...patch }
  } catch (err) {
    console.warn('[syncCatalog] Não foi possível salvar o status no estado do bot:', err)
  }
}

export const SyncCatalog = new Workflow({
  name: 'syncCatalog',
  description: 'Atualiza a tabela de produtos com dados da loja Nuvemshop e do ERP Tiny',
  schedule: '0 */3 * * *',
  timeout: '30m',

  input: z.object({
    fullSync: z.boolean().default(false).describe('Rebusca os detalhes de todos os produtos no Tiny'),
  }),

  output: z.object({
    productCount: z.number(),
  }),

  async handler({ input, step }) {
    setSyncStatus({ startedAt: new Date().toISOString(), finishedAt: null, status: 'running', error: null })

    try {
      // 1. Renova o acesso ao Tiny e indexa os produtos ativos por SKU
      // O token é obtido uma vez aqui e repassado aos lotes (vale 4h; a sincronização leva poucos minutos)
      const { token, tinyIndex } = await step('tiny-index', async () => {
        const token = await getTinyAccessToken({ forceRefresh: true })
        const products = await listActiveTinyProducts(token)
        return { token, tinyIndex: Object.fromEntries(products.map((p) => [p.sku.trim(), p])) as Record<string, TinyProductSummary> }
      })

      const syncProduct = async (url: string): Promise<string | null> => {
        const store = await fetchStoreProduct(url)
        if (!store) return null

        const tiny = tinyIndex[store.sku]
        const { rows: existing } = await ProductsTable.findRows({ filter: { sku: store.sku }, limit: 1 })
        const previous = existing[0]

        let detail
        let stockQty: number | null = null
        if (tiny) {
          // Detalhes só mudam quando o produto é editado no Tiny; estoque muda sempre
          const needsDetail = input.fullSync || !previous?.keywords || previous.tinyUpdatedAt !== tiny.dataAlteracao
          if (needsDetail) {
            detail = await getTinyProduct(tiny.id, token)
            await sleep(TINY_DELAY_MS)
          }
          stockQty = (await getTinyStock(tiny.id, token)).disponivel
          await sleep(TINY_DELAY_MS)
        }

        const row = buildProductRow({ store, tiny, detail, stockQty })
        if (!detail && previous) {
          // Mantém categoria e palavras-chave da sincronização anterior
          row.category = previous.category
          row.keywords = previous.keywords ?? ''
        }

        await ProductsTable.upsertRows({ rows: [row], keyColumn: 'sku' })
        return store.sku
      }

      // 2. Lista os produtos publicados na loja
      const urls = await step('store-urls', () => listStoreProductUrls())
      if (urls.length === 0) throw new Error('Nenhum produto encontrado nas páginas da loja')

      // 3. Processa em lotes (cada lote é um passo salvo; se falhar, retoma de onde parou)
      const syncedSkus: string[] = []
      for (let i = 0; i < urls.length; i += BATCH_SIZE) {
        const batchSkus = await step(`batch-${i / BATCH_SIZE}`, async () => {
          const skus: string[] = []
          for (const url of urls.slice(i, i + BATCH_SIZE)) {
            // Até 2 tentativas por produto (falhas pontuais de rede ou da loja)
            for (let attempt = 1; attempt <= 2; attempt++) {
              try {
                const sku = await syncProduct(url)
                if (sku) skus.push(sku)
                break
              } catch (err: any) {
                console.error(`[syncCatalog] Erro no produto ${url} (tentativa ${attempt}):`, err?.message ?? err)
                if (attempt < 2) await sleep(2000)
              }
            }
          }
          return skus
        })
        syncedSkus.push(...batchSkus)
      }

      // 4. Remove do bot o que saiu da loja (só se a sincronização trouxe um catálogo razoável)
      const removed = await step('cleanup', async () => {
        if (syncedSkus.length < urls.length * 0.8) return 0
        const keep = new Set(syncedSkus)
        const { rows } = await ProductsTable.findRows({ limit: 1000 })
        const stale = rows.filter((r) => !keep.has(r.sku)).map((r) => r.id)
        if (stale.length) await ProductsTable.deleteRowIds(stale)
        return stale.length
      })

      console.log(`[syncCatalog] ${syncedSkus.length} produtos sincronizados, ${removed} removidos`)
      setSyncStatus({ finishedAt: new Date().toISOString(), status: 'success', productCount: syncedSkus.length })
      return { productCount: syncedSkus.length }
    } catch (err: any) {
      setSyncStatus({ finishedAt: new Date().toISOString(), status: 'error', error: String(err?.message ?? err) })
      throw err
    }
  },
})
