import { Action, z } from '@botpress/runtime'
import { ProductsTable } from '../tables/Products'
import axios from 'axios'
import productsBackup from './products_backup.json'

// Função auxiliar para extrair o conteúdo de tags do XML, limpando CDATA se presente
function extractTagContent(itemXml: string, tagName: string): string {
  const match = itemXml.match(new RegExp(`<${tagName}[^>]*>([\\s\\S]*?)<\/${tagName}>`))
  if (!match) return ''
  let content = match[1].trim()
  if (content.startsWith('<![CDATA[')) {
    content = content.substring(9, content.length - 3).trim()
  }
  return content
}

// Limpa entidades HTML básicas
function cleanContent(str: string): string {
  return str
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
}

// Função auxiliar para salvar ou atualizar produto no banco
async function saveProduct(productData: {
  sku: string
  name: string
  description: string
  price: number
  salePrice: number | null
  availability: 'in_stock' | 'out_of_stock'
  productLink: string
  imageUrl: string
  category: string
}) {
  const existing = await ProductsTable.findRows({
    filter: { sku: productData.sku },
    limit: 1,
  })

  if (existing.rows.length === 0) {
    await ProductsTable.createRows({ rows: [productData] })
  } else {
    // Atualizar caso já exista para manter os dados atualizados
    await ProductsTable.updateRows({
      rows: [
        {
          id: existing.rows[0].id,
          ...productData,
        },
      ],
    })
  }
}

export const seedProducts = new Action({
  name: 'seedProducts',
  description: 'Popula a tabela de produtos buscando dinamicamente do feed RSS da Herrmann Health.',
  input: z.object({}),
  output: z.object({
    success: z.boolean(),
    count: z.number(),
  }),

  async handler() {
    let count = 0
    try {
      console.log('Buscando feed RSS de produtos...')
      const response = await axios.get('https://www.herrmannhealth.com.br/products_google.rss', {
        headers: {
          'Accept': 'application/xml, text/xml, */*'
        },
        timeout: 10000 // 10s timeout para evitar travamento infinito no sandbox
      })
      const xml = response.data

      // Extrair todas as tags <item> do feed
      const itemRegex = /<item>([\s\S]*?)<\/item>/g
      let match
      const items: string[] = []
      while ((match = itemRegex.exec(xml)) !== null) {
        items.push(match[1])
      }

      for (const itemXml of items) {
        const sku = extractTagContent(itemXml, 'id')
        if (!sku) continue

        const name = cleanContent(extractTagContent(itemXml, 'title'))
        const description = cleanContent(extractTagContent(itemXml, 'description'))
        const productLink = extractTagContent(itemXml, 'link')
        const imageUrl = extractTagContent(itemXml, 'g:image_link')
        
        const priceStr = extractTagContent(itemXml, 'g:price')
        const priceClean = priceStr.replace(/[^\d.,]/g, '').replace(',', '.')
        const price = parseFloat(priceClean) || 0

        const salePriceStr = extractTagContent(itemXml, 'g:sale_price')
        let salePrice: number | null = null
        if (salePriceStr) {
          const salePriceClean = salePriceStr.replace(/[^\d.,]/g, '').replace(',', '.')
          const salePriceVal = parseFloat(salePriceClean) || 0
          if (salePriceVal < price) {
            salePrice = salePriceVal
          }
        }

        const availabilityRaw = extractTagContent(itemXml, 'g:availability')
        const availability = availabilityRaw === 'in_stock' ? ('in_stock' as const) : ('out_of_stock' as const)

        // Categorizar o produto com base no título e descrição
        const titleLower = name.toLowerCase()
        const descLower = description.toLowerCase()

        let category = 'suplementacao_reforco'
        if (
          titleLower.includes('floral') ||
          titleLower.includes('frequência') ||
          titleLower.includes('frequencia') ||
          descLower.includes('floral') ||
          descLower.includes('vibracional') ||
          descLower.includes('homeopática') ||
          descLower.includes('homeopatica')
        ) {
          category = 'florais_frequencias'
        } else if (
          titleLower.includes('carvão') ||
          titleLower.includes('carvao') ||
          titleLower.includes('detox') ||
          titleLower.includes('limpeza') ||
          descLower.includes('parasitária') ||
          descLower.includes('parasitaria') ||
          descLower.includes('desintoxicação') ||
          descLower.includes('desintoxicacao')
        ) {
          category = 'desintoxicacao_limpeza'
        } else if (
          titleLower.includes('pele') ||
          titleLower.includes('beleza') ||
          titleLower.includes('creme') ||
          titleLower.includes('cosmético') ||
          titleLower.includes('cosmetico') ||
          titleLower.includes('facial') ||
          descLower.includes('pele') ||
          descLower.includes('beleza')
        ) {
          category = 'pele_beleza'
        }

        const productData = {
          sku,
          name,
          description,
          price,
          salePrice,
          availability,
          productLink,
          imageUrl,
          category,
        }

        await saveProduct(productData)
        count++
      }

      console.log(`Semeado com sucesso via RSS: ${count} produtos.`)
      return {
        success: true,
        count,
      }
    } catch (error: any) {
      console.warn('Erro ao buscar ou processar feed RSS. Usando backup local de fallback...', error.message || error)
      try {
        for (const productData of productsBackup) {
          const formattedProduct = {
            ...productData,
            availability: productData.availability === 'in_stock' ? ('in_stock' as const) : ('out_of_stock' as const)
          }
          await saveProduct(formattedProduct)
          count++
        }
        console.log(`Semeado com sucesso via backup de fallback: ${count} produtos.`)
        return {
          success: true,
          count,
        }
      } catch (backupErr: any) {
        console.error('Erro catastrófico ao semear a base via backup local:', backupErr)
        return {
          success: false,
          count: 0,
        }
      }
    }
  },
})
