import { Autonomous, z } from '@botpress/runtime'
import { ProductsTable } from '../tables/Products'
import { fetchStorePaymentConditions } from '../lib/nuvemshop'
import { listarFormasEnvioAtivas, listarFormasPagamentoAtivas } from '../lib/tiny'

// Condições comerciais lidas ao vivo (somente leitura): compra pelo site (loja) e cadastro do ERP (Tiny).
// Os dois mundos são diferentes: o checkout online tem suas próprias condições; as formas do ERP
// são as que a equipe usa em pedidos manuais, como negociações de volume com um vendedor.

const CACHE_MS = 60 * 60 * 1000
let cache: { em: number; texto: string } | null = null

export const consultarCondicoesComerciais = new Autonomous.Tool({
  name: 'consultarCondicoesComerciais',
  description:
    'Consulta, ao vivo, as condições de pagamento e as formas de envio da empresa: as do site (PIX e parcelamento no checkout) ' +
    'e as cadastradas no ERP (usadas em pedidos negociados com um vendedor). Use quando o cliente perguntar como pode pagar, ' +
    'parcelamento, boleto, formas de entrega, transportadora ou retirada.',

  input: z.object({}),
  output: z.string(),

  handler: async () => {
    if (cache && Date.now() - cache.em < CACHE_MS) return cache.texto

    const { rows } = await ProductsTable.findRows({ filter: { availability: 'in_stock' }, limit: 1 })
    const [loja, pagamentosErp, enviosErp] = await Promise.all([
      rows[0] ? fetchStorePaymentConditions(rows[0].productLink).catch(() => null) : null,
      listarFormasPagamentoAtivas().catch(() => null),
      listarFormasEnvioAtivas().catch(() => null),
    ])

    const linhas = ['[CONDIÇÕES COMERCIAIS — consultadas agora]', '', 'Compra pelo site / link do carrinho:']
    if (loja) {
      if (loja.descontoPix) linhas.push(`- PIX com ${loja.descontoPix}% de desconto`)
      linhas.push(`- Cartão em até ${loja.parcelasMax}x, sendo até ${loja.parcelasSemJuros}x sem juros`)
    } else {
      linhas.push('- Não consegui ler as condições do site agora; o checkout mostra as opções na finalização.')
    }
    linhas.push('- Frete grátis: Sul e Sudeste a partir de R$ 299; demais regiões a partir de R$ 499. O valor exato do frete é calculado no checkout pelo CEP.')

    linhas.push('', 'Pedidos negociados com um vendedor (cadastro do ERP):')
    linhas.push(pagamentosErp?.length ? `- Formas de pagamento: ${pagamentosErp.map((f) => f.nome).join(', ')}` : '- Formas de pagamento: não disponíveis agora')
    linhas.push(enviosErp?.length ? `- Formas de envio: ${enviosErp.map((f) => f.nome).join(', ')}` : '- Formas de envio: não disponíveis agora')

    linhas.push(
      '',
      'Como usar: para compras normais, apresente as condições do site. As formas do ERP valem para pedidos fechados com um vendedor ' +
        '(ex: volume, boleto para empresas); nesse caso ofereça o encaminhamento com solicitarVendedor. Nunca prometa prazos de entrega.'
    )

    const texto = linhas.join('\n')
    cache = { em: Date.now(), texto }
    return texto
  },
})
