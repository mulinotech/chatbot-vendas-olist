import { Autonomous, z, user } from '@botpress/runtime'
import { ProductsTable } from '../tables/Products'

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
    
    // Pulo do Gato: Montagem do link de checkout do e-commerce
    // Ex: https://herrmannhealth.com.br/carrinho?itens=SKU:QTD,SKU2:QTD
    const queryItens = carrinho.map((item) => `${item.sku}:${item.quantity}`).join(',')
    const checkoutUrl = `https://herrmannhealth.com.br/carrinho?itens=${queryItens}`

    const itemLines = carrinho.map(
      (item) => `- ${item.name} (SKU: ${item.sku}) - Qtd: ${item.quantity} - Valor Unitário: R$ ${item.price.toFixed(2)} - Total: R$ ${(item.price * item.quantity).toFixed(2)}`
    ).join('\n')

    return `[RESUMO DO CARRINHO]
${itemLines}

Total do Investimento: R$ ${total.toFixed(2)}
Link de Finalização de Compra (Checkout Seguro): ${checkoutUrl}
----------------------------------------`
  },
})

