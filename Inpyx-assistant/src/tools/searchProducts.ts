import { Autonomous, z } from '@botpress/runtime'
import { ProductsTable } from '../tables/Products'

// Função auxiliar para remover acentos e diacríticos em português e converter para minúsculas
const normalizeText = (text: string): string => {
  return text
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
}

// Stopwords comuns em português para ignorar na busca por termos chave de sintomas
const PORTUGUESE_STOPWORDS = new Set([
  'o', 'a', 'os', 'as', 'um', 'uma', 'uns', 'umas',
  'de', 'do', 'da', 'dos', 'das', 'em', 'no', 'na', 'nos', 'nas',
  'por', 'para', 'com', 'sem', 'sob', 'sobre', 'tras', 'e', 'ou',
  'mas', 'porem', 'contudo', 'todavia', 'entretanto', 'porque', 'que', 'se',
  'como', 'eu', 'tu', 'ele', 'ela', 'nos', 'vos', 'eles', 'elas',
  'me', 'te', 'lhes', 'meu', 'minha', 'meus', 'minhas', 'teu', 'tua',
  'teus', 'tuas', 'seu', 'sua', 'seus', 'suas', 'nosso', 'nossa',
  'nossos', 'nossas', 'este', 'esta', 'estes', 'estas', 'esse', 'essa',
  'esses', 'esas', 'aquele', 'aquela', 'aqueles', 'aquela', 'isto', 'isso', 'aquilo',
  'tem', 'temos', 'tinha', 'tinhamos', 'tinham', 'ter', 'terei', 'tera', 'terao',
  'foi', 'fomos', 'foram', 'era', 'eram', 'sou', 'somos', 'sao',
  'estao', 'estava', 'estavamos', 'estavam', 'estou', 'estamos', 'esteve',
  'muito', 'muita', 'muitos', 'muitas', 'pouco', 'pouca', 'poucos', 'poucas',
  'mais', 'menos', 'tudo', 'nada', 'todo', 'toda', 'todos', 'todas',
  'cada', 'qual', 'quais', 'quem', 'onde', 'como', 'quando', 'nao', 'sim',
  'bem', 'mal', 'ja', 'ainda', 'agora', 'entao', 'depois', 'antes', 'tendo',
  'tenho', 'sentido', 'sentindo', 'sinto', 'sente', 'sintoma', 'sintomas'
])

export const searchProducts = new Autonomous.Tool({
  name: 'searchProducts',
  description: 'Busca produtos na base de dados Herrmann Health por termo de pesquisa e/ou categoria.',

  input: z.object({
    query: z.string().optional().describe('Termo de pesquisa para buscar no nome ou descrição do produto'),
    category: z.string().optional().describe('Categoria do produto para filtrar (ex: desintoxicacao_limpeza, suplementacao_reforco, florais_frequencias, pele_beleza)'),
  }),

  output: z.string(),

  handler: async ({ query, category }) => {
    console.log(`[DEBUG] searchProducts chamado com - Query: "${query}", Category: "${category}"`)
    let filter: any = {}
    // Apenas aplica o filtro rígido de categoria se NÃO houver termo de busca (query).
    // Se houver query, buscamos em todo o catálogo e priorizamos a categoria via pontuação (score).
    if (category && !query) {
      filter.category = category
    }

    // Buscando uma quantidade maior de registros para fazer o rankeamento e busca em memória
    // (Útil no ambiente local onde o FTS do SQLite não possui stemmer para português como plural/singular)
    const { rows: allRows } = await ProductsTable.findRows({
      filter: Object.keys(filter).length > 0 ? filter : undefined,
      limit: 200,
    })

    console.log(`[DEBUG] Linhas retornadas do banco: ${allRows.length}`)
    if (allRows.length > 0) {
      console.log(`[DEBUG] Exemplo de SKU em allRows: ${allRows[0].sku}, Categoria: ${allRows[0].category}`)
    }

    let filteredRows = [...allRows]

    if (query) {
      const queryLower = query.toLowerCase()
      // Normalize query and map common symptoms to standard product description words
      const queryNorm = normalizeText(queryLower)
      const expandedTerms = new Set<string>()

      // Mapping of Portuguese symptom words to database keywords
      if (/queimac|azia|reflux|gastrit|queima|estomag|digest|gastri|barrig|enjoo|nause|digestivie/i.test(queryNorm)) {
        expandedTerms.add('estomago')
        expandedTerms.add('digestivie')
        expandedTerms.add('digestivo')
        expandedTerms.add('gástrico')
        expandedTerms.add('gastrico')
        expandedTerms.add('intestino')
        expandedTerms.add('aloe')
      }
      if (/imun|gripe|resfria|defes|viral|virus|infecc|vulner|peito|tosse|antiviral/i.test(queryNorm)) {
        expandedTerms.add('imunium')
        expandedTerms.add('imunidade')
        expandedTerms.add('defesa')
        expandedTerms.add('antiviral')
        expandedTerms.add('viral')
        expandedTerms.add('respiratorio')
        expandedTerms.add('respirium')
      }
      if (/cansac|fadig|energia|disposic|desanim|vitali|forca|desenho|mag/i.test(queryNorm)) {
        expandedTerms.add('energia')
        expandedTerms.add('disposição')
        expandedTerms.add('disposicao')
        expandedTerms.add('fadiga')
        expandedTerms.add('vitalidade')
        expandedTerms.add('cansaço')
        expandedTerms.add('cansaco')
        expandedTerms.add('mag')
      }
      if (/sono|insoni|dormir|ansied|estres|calm|relax|agitac|trist|nervos|sleep|serenia/i.test(queryNorm)) {
        expandedTerms.add('serenia')
        expandedTerms.add('sono')
        expandedTerms.add('insônia')
        expandedTerms.add('insonia')
        expandedTerms.add('relaxamento')
        expandedTerms.add('relaxar')
        expandedTerms.add('ansiedade')
        expandedTerms.add('estresse')
        expandedTerms.add('calma')
        expandedTerms.add('sleep')
      }
      if (/figad|hepat|vesic|pancr/i.test(queryNorm)) {
        expandedTerms.add('figado')
        expandedTerms.add('hepatico')
        expandedTerms.add('hepatovie')
        expandedTerms.add('vesicula')
      }
      if (/pele|belez|creme|rost|facial|ruga|acne|espinha/i.test(queryNorm)) {
        expandedTerms.add('pele')
        expandedTerms.add('beleza')
        expandedTerms.add('facial')
        expandedTerms.add('creme')
      }

      // Divide em palavras, remove acentos e ignora termos muito curtos ou stopwords
      const terms = queryLower
        .split(/\s+/)
        .map(t => normalizeText(t))
        .filter(t => t.length > 2 && !PORTUGUESE_STOPWORDS.has(t))

      // Combina os termos originais filtrados com os termos expandidos
      const combinedTerms = new Set([...terms])
      expandedTerms.forEach(t => combinedTerms.add(t))

      let finalTerms = Array.from(combinedTerms)
      if (finalTerms.length === 0) {
        finalTerms = queryLower
          .split(/\s+/)
          .map(t => normalizeText(t))
          .filter(t => t.length > 0)
      }

      const scoredRows = allRows.map(p => {
        let score = 0
        const nameNorm = normalizeText(p.name || '')
        const descriptionNorm = normalizeText(p.description || '')
        const categoryNorm = normalizeText(p.category || '')

        for (const term of finalTerms) {
          // Trata variações comuns de singular/plural no português (ex: pulmões -> pulmão, rins -> rim)
          const variations = [term]
          if (term.endsWith('s')) {
            variations.push(term.slice(0, -1)) // tira o 's'
          }
          if (term.endsWith('oes')) {
            variations.push(term.replace(/oes$/, 'ao'))
          }
          if (term.endsWith('ins')) {
            variations.push(term.replace(/ins$/, 'im'))
          }

          // Atribui pontos baseados na onde o termo foi encontrado
          for (const v of variations) {
            if (nameNorm.includes(v)) {
              score += 15 // Nome tem maior relevância
            }
            if (descriptionNorm.includes(v)) {
              score += 3  // Descrição
            }
            if (categoryNorm.includes(v)) {
              score += 5  // Categoria
            }
          }
        }

        // Se a categoria foi informada e o produto pertence a ela, ganha um bônus de pontuação
        if (category && p.category === category) {
          score += 10
        }

        return { product: p, score }
      })

      // Filtra apenas produtos que tiveram alguma correspondência (score > 0)
      const matched = scoredRows.filter(item => item.score > 0)
      
      // Ordena por relevância (score) decrescente, e se empatar, coloca produtos em estoque primeiro
      matched.sort((a, b) => {
        if (b.score !== a.score) {
          return b.score - a.score
        }
        if (a.product.availability === 'in_stock' && b.product.availability !== 'in_stock') {
          return -1
        }
        if (a.product.availability !== 'in_stock' && b.product.availability === 'in_stock') {
          return 1
        }
        return 0
      })

      filteredRows = matched.map(item => item.product)
    } else {
      // Se não houver query de pesquisa, apenas ordena colocando os em estoque primeiro
      filteredRows.sort((a, b) => {
        if (a.availability === 'in_stock' && b.availability !== 'in_stock') {
          return -1
        }
        if (a.availability !== 'in_stock' && b.availability === 'in_stock') {
          return 1
        }
        return 0
      })
    }

    const finalRows = filteredRows.slice(0, 10)

    if (!finalRows || finalRows.length === 0) {
      return 'Nenhum produto correspondente encontrado na base de dados ..'
    }

    // Formatando os resultados para a IA consumir de forma estruturada e clara
    const formattedProducts = await Promise.all(finalRows.map(async (p) => {
      const precoFinal = p.salePrice !== null && p.salePrice !== undefined ? p.salePrice : p.price
      const precoOriginalStr = `R$ ${p.price.toFixed(2)}`
      const precoFinalStr = `R$ ${precoFinal.toFixed(2)}`
      const promocaoStr = p.salePrice ? ` (Promoção! De ${precoOriginalStr} por ${precoFinalStr})` : ` ${precoFinalStr}`
      const estoqueStatus = p.availability === 'in_stock' ? 'Em estoque' : 'Esgotado/Reposição'

      let resolvedImageUrl = p.imageUrl
      if (p.imageUrl && !p.imageUrl.startsWith('http')) {
        try {
          const asset = await assets.get(p.imageUrl as any)
          resolvedImageUrl = asset.url
        } catch (err) {
          console.error(`Erro ao obter URL do asset para ${p.imageUrl}:`, err)
        }
      }

      return `[PRODUTO]
- SKU: ${p.sku}
- Nome: ${p.name}
- Categoria: ${p.category}
- Preço:${promocaoStr}
- Disponibilidade: ${estoqueStatus} (${p.availability})
- Descrição: ${p.description}
- Link Direto: ${p.productLink}
- Imagem: ${resolvedImageUrl}
----------------------------------------`
    }))

    return formattedProducts.join('\n')
  },
})

