import { Autonomous, z } from '@botpress/runtime'
import { ProductsTable } from '../tables/Products'
import { getTinyStock } from '../lib/tiny'

// Consulta o estoque em tempo real no ERP (Tiny) para uma quantidade específica.
// Usado em pedidos de quantidade, orçamentos e compras para revenda/clínicas.

export const consultarEstoque = new Autonomous.Tool({
  name: 'consultarEstoque',
  description:
    'Consulta no ERP, em tempo real, quantas unidades de um produto estão disponíveis e se atendem a quantidade que o cliente quer. ' +
    'Use SEMPRE que o cliente pedir uma quantidade específica (ex: "quero 10", "orçamento de 50 unidades") antes de responder sobre disponibilidade.',

  input: z.object({
    sku: z.string().describe('SKU exato do produto (retornado pela searchProducts)'),
    quantidade: z.number().int().min(1).describe('Quantidade que o cliente deseja'),
  }),

  output: z.string(),

  handler: async ({ sku, quantidade }) => {
    const cleanSku = sku.replace(/^sku\s*:\s*/i, '').trim().toUpperCase()
    const { rows } = await ProductsTable.findRows({ filter: { sku: cleanSku }, limit: 1 })
    const product = rows[0]
    if (!product) return `Produto com SKU ${cleanSku} não encontrado no catálogo. Use a searchProducts para achar o SKU correto.`

    let disponivel = product.stockQty ?? null
    let fonte = 'última sincronização'
    if (product.tinyId) {
      try {
        disponivel = Math.max(0, (await getTinyStock(product.tinyId)).disponivel)
        fonte = 'ERP, consultado agora'
        await ProductsTable.updateRows({
          rows: [{ id: product.id, stockQty: disponivel, availability: disponivel > 0 ? 'in_stock' : 'out_of_stock' }],
        })
      } catch (err) {
        console.error('Erro ao consultar estoque no Tiny:', err)
      }
    }

    if (disponivel == null) {
      return `Não foi possível confirmar o estoque de ${product.name} agora. Ofereça encaminhar para um vendedor (solicitarVendedor) confirmar a quantidade.`
    }

    const precoUnitario = product.salePrice ?? product.price
    if (disponivel >= quantidade) {
      return `[ESTOQUE] ${product.name} (SKU ${cleanSku}): ATENDE. Pedido de ${quantidade} un. — disponível (${fonte}). ` +
        `Valor estimado: ${quantidade} x R$ ${precoUnitario.toFixed(2)} = R$ ${(quantidade * precoUnitario).toFixed(2)}. ` +
        (quantidade >= 10
          ? 'Pedido de volume: ofereça também falar com um vendedor (solicitarVendedor) para condição especial de atacado.'
          : 'Pode adicionar ao carrinho com manageCart.')
    }

    return `[ESTOQUE] ${product.name} (SKU ${cleanSku}): NÃO ATENDE a quantidade pedida. Pedido: ${quantidade} un. | Disponível agora: ${disponivel} un. (${fonte}). ` +
      'Informe com transparência quantas unidades existem, ofereça levar as disponíveis agora e ' +
      'ofereça encaminhar para um vendedor (solicitarVendedor) verificar reposição/outros estoques para completar o pedido.'
  },
})
