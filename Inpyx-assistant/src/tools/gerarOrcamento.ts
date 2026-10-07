import { Autonomous, z, context, user } from '@botpress/runtime'
import { ProductsTable } from '../tables/Products'
import { getTinyStock } from '../lib/tiny'
import { buildCartUrl, STORE_URL } from '../lib/nuvemshop'
import { gerarOrcamentoPdf } from '../lib/orcamentoPdf'

// Gera um orçamento em PDF (com estoque conferido no ERP e link de carrinho) e deixa pronto
// para o handler da conversa enviar como arquivo, no mesmo padrão do áudio (pendingAudioUrl).

const VALIDADE_DIAS = 7

export const gerarOrcamento = new Autonomous.Tool({
  name: 'gerarOrcamento',
  description:
    'Gera um orçamento formal em PDF e envia ao cliente como arquivo. Use quando o cliente pedir um orçamento ' +
    '(ex: "me manda um orçamento de 50 unidades") e as quantidades estiverem disponíveis em estoque. ' +
    'O estoque é conferido novamente no ERP; se algum item não atender, nada é gerado e você recebe as quantidades disponíveis.',

  input: z.object({
    nomeCliente: z.string().describe('Nome do cliente, como ele se apresentou na conversa'),
    itens: z
      .array(
        z.object({
          sku: z.string().describe('SKU exato do produto (retornado pela searchProducts)'),
          quantidade: z.number().int().min(1).describe('Quantidade orçada'),
        })
      )
      .min(1),
  }),

  output: z.string(),

  handler: async ({ nomeCliente, itens }) => {
    const linhas = []
    const faltas: string[] = []

    for (const item of itens) {
      const sku = item.sku.replace(/^sku\s*:\s*/i, '').trim().toUpperCase()
      const { rows } = await ProductsTable.findRows({ filter: { sku }, limit: 1 })
      const produto = rows[0]
      if (!produto) return `Produto com SKU ${sku} não encontrado no catálogo. Use a searchProducts para achar o SKU correto.`

      let disponivel = produto.stockQty ?? null
      if (produto.tinyId) {
        try {
          disponivel = Math.max(0, (await getTinyStock(produto.tinyId)).disponivel)
        } catch (err) {
          console.error('[gerarOrcamento] Erro ao consultar estoque no Tiny:', err)
        }
      }
      if (disponivel != null && disponivel < item.quantidade) {
        faltas.push(`${produto.name} (SKU ${sku}): pedido ${item.quantidade} un., disponível ${disponivel} un.`)
      }
      if (!produto.variantId) {
        faltas.push(`${produto.name} (SKU ${sku}): não está à venda na loja online`)
      }
      linhas.push({ produto, sku, quantidade: item.quantidade })
    }

    if (faltas.length > 0) {
      return `Orçamento NÃO gerado, estoque insuficiente: ${faltas.join('; ')}. ` +
        'Informe o cliente com transparência e ofereça: (1) orçamento com as quantidades disponíveis ou (2) encaminhar a um vendedor (solicitarVendedor).'
    }

    const agora = new Date()
    const numero = `ORC-${agora.toISOString().slice(0, 10).replace(/-/g, '')}-${Math.floor(1000 + Math.random() * 9000)}`
    const linkCarrinho = buildCartUrl(linhas.map((l) => ({ variantId: l.produto.variantId!, quantity: l.quantidade })))
    const itensPdf = linhas.map((l) => ({
      nome: l.produto.name,
      sku: l.sku,
      quantidade: l.quantidade,
      precoUnitario: l.produto.salePrice ?? l.produto.price,
    }))
    const total = itensPdf.reduce((soma, i) => soma + i.quantidade * i.precoUnitario, 0)

    const bytes = await gerarOrcamentoPdf({
      numero,
      data: agora,
      validadeDias: VALIDADE_DIAS,
      cliente: nomeCliente,
      itens: itensPdf,
      linkCarrinho,
      loja: { nome: 'Herrmann Health', site: STORE_URL.replace(/^https?:\/\//, ''), contato: 'WhatsApp (11) 94524-2662' },
      condicoes: [
        'Pagamento em até 3x sem juros no cartão ou 5% de desconto no PIX.',
        'Frete grátis para Sul e Sudeste a partir de R$ 299 e demais regiões a partir de R$ 499.',
        `Preços e estoque conferidos no momento da emissão. Orçamento válido por ${VALIDADE_DIAS} dias, sujeito à disponibilidade.`,
      ],
    })

    const client = context.get('client')
    const { file } = await client.uploadFile({
      key: `orcamentos/${numero}.pdf`,
      content: Buffer.from(bytes),
      contentType: 'application/pdf',
      accessPolicies: ['public_content'],
      publicContentImmediatelyAccessible: true,
    })
    if (!file?.url) return 'Não consegui gerar o arquivo do orçamento agora. Envie o resumo em texto com o link do carrinho.'

    // O handler da conversa envia o arquivo depois que a Bila terminar de responder
    user.state.pendingDocument = { url: file.url, title: `Orçamento ${numero}.pdf` }
    console.log(`[gerarOrcamento] ${numero} gerado para ${nomeCliente}: R$ ${total.toFixed(2)}`)

    return `Orçamento ${numero} gerado (total R$ ${total.toFixed(2)}, no PIX R$ ${(total * 0.95).toFixed(2)}, válido por ${VALIDADE_DIAS} dias) ` +
      `e será enviado como PDF logo após sua mensagem. Escreva uma mensagem curta e calorosa avisando que o orçamento segue em anexo, ` +
      `com o link do carrinho para finalizar: ${linkCarrinho}`
  },
})
