import { Autonomous, z, user } from '@botpress/runtime'
import { ProductsTable } from '../tables/Products'
import { getTinyStock } from '../lib/tiny'
import { buildCartUrl } from '../lib/nuvemshop'

export const manageCart = new Autonomous.Tool({
  name: 'manageCart',
  description: 'Gerencia o carrinho de compras do usuário (adicionar, remover, limpar ou obter o link de checkout final).',

  input: z.object({
    action: z.enum(['add', 'remove', 'clear', 'get_summary']).describe('Ação a ser executada no carrinho'),
    sku: z.string().optional().describe('SKU do produto (obrigatório para as ações "add" e "remove")'),
    quantity: z.number().int().min(1).default(1).describe('Quantidade do produto (aplicável para a ação "add")'),
  }),

  output: z.string(),

  handler: async ({ action, sku, quantity }) => {
    // Inicializar o carrinho se não existir
    if (!user.state.carrinho) {
      user.state.carrinho = []
    }

    let carrinho = [...user.state.carrinho]

    if (action === 'add') {
      if (!sku) {
        return 'Erro: O SKU é obrigatório para adicionar itens ao carrinho ..'
      }

      // Normalizar SKU: trim, remover prefixo "sku:" (case-insensitive) se houver, e converter para maiúsculas
      let cleanSku = sku.trim()
      const skuPrefixRegex = /^sku\s*:\s*/i
      cleanSku = cleanSku.replace(skuPrefixRegex, '').trim().toUpperCase()

      // Buscar produto na tabela para garantir dados de preço e nome reais
      const { rows } = await ProductsTable.findRows({
        filter: { sku: cleanSku },
        limit: 1,
      })

      if (!rows || rows.length === 0) {
        return `Erro: Produto com SKU ${cleanSku} não foi encontrado na base de dados ..`
      }

      const product = rows[0]
      const price = product.salePrice !== null && product.salePrice !== undefined ? product.salePrice : product.price

      // Confere o estoque em tempo real no Tiny antes de colocar no carrinho
      if (product.tinyId) {
        try {
          const { disponivel } = await getTinyStock(product.tinyId)
          const inStock = disponivel > 0
          await ProductsTable.updateRows({
            rows: [{ id: product.id, stockQty: Math.max(0, disponivel), availability: inStock ? 'in_stock' : 'out_of_stock' }],
          })
          if (!inStock) {
            return `Produto ${product.name} (SKU ${cleanSku}) está ESGOTADO no momento (estoque conferido agora no ERP). Não foi adicionado ao carrinho. Ofereça uma alternativa similar ou avisar quando voltar.`
          }
          const jaNoCarrinho = carrinho.find((item) => item.sku === cleanSku)?.quantity ?? 0
          if (jaNoCarrinho + quantity > disponivel) {
            return `Estoque insuficiente: o cliente quer ${jaNoCarrinho + quantity} un. de ${product.name} (SKU ${cleanSku}), mas há apenas ${disponivel} un. disponíveis agora. Nada foi alterado no carrinho. Informe o cliente, ofereça adicionar as ${disponivel - jaNoCarrinho} un. disponíveis e/ou encaminhar para um vendedor (solicitarVendedor) verificar reposição.`
          }
        } catch (err) {
          // Se o Tiny estiver fora do ar, segue com a disponibilidade da última sincronização
          console.error('Erro ao consultar estoque no Tiny:', err)
          if (product.availability !== 'in_stock') {
            return `Produto ${product.name} (SKU ${cleanSku}) está esgotado. Não foi adicionado ao carrinho. Ofereça uma alternativa similar.`
          }
        }
      }

      // Verificar se o item já está no carrinho
      const index = carrinho.findIndex((item) => item.sku === cleanSku)
      if (index > -1) {
        carrinho[index].quantity += quantity
      } else {
        carrinho.push({
          sku: cleanSku,
          name: product.name,
          price,
          quantity,
        })
      }

      user.state.carrinho = carrinho
    } else if (action === 'remove') {
      if (!sku) {
        return 'Erro: O SKU é obrigatório para remover itens do carrinho ..'
      }

      let cleanSku = sku.trim()
      const skuPrefixRegex = /^sku\s*:\s*/i
      cleanSku = cleanSku.replace(skuPrefixRegex, '').trim().toUpperCase()

      const index = carrinho.findIndex((item) => item.sku === cleanSku)
      if (index > -1) {
        carrinho.splice(index, 1)
        user.state.carrinho = carrinho
      } else {
        return `Produto com SKU ${cleanSku} não estava no carrinho ..`
      }
    } else if (action === 'clear') {
      carrinho = []
      user.state.carrinho = carrinho
      return 'Carrinho de compras limpo com sucesso !'
    }

    // Gerar resumo e link de checkout
    if (carrinho.length === 0) {
      return 'O carrinho está vazio no momento ..'
    }

    const total = carrinho.reduce((sum, item) => sum + item.price * item.quantity, 0)
    
    // Pulo do Gato: link de carrinho da Nuvemshop, que abre o checkout com os itens já adicionados
    // Ex: https://herrmannhealth.com.br/comprar/1537849830-2,1537862958-1/
    const { rows: cartRows } = await ProductsTable.findRows({
      filter: { sku: { $in: carrinho.map((item) => item.sku) } },
      limit: carrinho.length,
    })
    const variantBySku = new Map(cartRows.map((row) => [row.sku, row.variantId]))
    const linkItems = carrinho
      .filter((item) => variantBySku.get(item.sku))
      .map((item) => ({ variantId: variantBySku.get(item.sku)!, quantity: item.quantity }))
    const checkoutUrl = linkItems.length > 0 ? buildCartUrl(linkItems) : null
    const missingFromLink = carrinho.filter((item) => !variantBySku.get(item.sku)).map((item) => item.name)

    const itemLines = carrinho.map(
      (item) => `- ${item.name} (SKU: ${item.sku}) - Qtd: ${item.quantity} - Valor Unitário: R$ ${item.price.toFixed(2)} - Total: R$ ${(item.price * item.quantity).toFixed(2)}`
    ).join('\n')

    return `[RESUMO DO CARRINHO]
${itemLines}

Total do Investimento: R$ ${total.toFixed(2)}
Link de Finalização de Compra (Checkout Seguro): ${checkoutUrl ?? 'indisponível no momento'}${
      missingFromLink.length > 0 ? `\nAtenção: estes itens não estão à venda na loja online e ficaram fora do link: ${missingFromLink.join(', ')}` : ''
    }
----------------------------------------`
  },
})

