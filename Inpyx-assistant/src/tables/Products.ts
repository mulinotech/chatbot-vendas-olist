import { Table, z } from '@botpress/runtime'

export const ProductsTable = new Table({
  name: 'ProductsTable',
  description: 'Tabela de produtos e fórmulas da Herrmann Health',

  keyColumn: 'sku',

  columns: {
    // Nota: O campo id NÃO deve ser definido aqui. O ADK o cria automaticamente como número.
    sku: z.string().describe('Código SKU único do produto'),
    name: {
      schema: z.string().describe('Nome do produto'),
      searchable: true,
    },
    description: {
      schema: z.string().describe('Descrição terapêutica e propriedades do produto'),
      searchable: true,
    },
    price: z.number().describe('Preço padrão do produto'),
    salePrice: z.number().nullable().optional().describe('Preço promocional se ativo'),
    availability: z.enum(['in_stock', 'out_of_stock']).describe('Disponibilidade do estoque'),
    productLink: z.string().describe('Link de compra direta do produto'),
    imageUrl: z.string().describe('URL da imagem do produto'),
    category: {
      schema: z.string().describe('Categoria do produto (ex: desintoxicacao_limpeza, suplementacao_reforco, florais_frequencias, pele_beleza)'),
      searchable: true,
    },
    // Campos vindos da integração Tiny (ERP) + Nuvemshop (loja)
    keywords: {
      schema: z.string().optional().describe('Palavras-chave, órgãos e categorias do Tiny, usadas na busca'),
      searchable: true,
    },
    variantId: z.number().nullable().optional().describe('ID da variação na Nuvemshop, usado no link de carrinho'),
    tinyId: z.number().nullable().optional().describe('ID do produto no Tiny, usado para consultar estoque em tempo real'),
    stockQty: z.number().nullable().optional().describe('Quantidade disponível em estoque no Tiny'),
    tinyUpdatedAt: z.string().nullable().optional().describe('Data da última alteração do produto no Tiny'),
  },
})
