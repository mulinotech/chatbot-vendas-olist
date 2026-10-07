import { PDFDocument, PDFFont, PDFPage, PDFString, rgb, StandardFonts } from 'pdf-lib'

// Gera o PDF de orçamento enviado pela Bila. Layout simples, em A4, com a identidade da loja.
// As fontes padrão do PDF (Helvetica) cobrem os acentos do português, mas não emojis.

export type OrcamentoItem = { nome: string; sku: string; quantidade: number; precoUnitario: number }

export type OrcamentoData = {
  numero: string
  data: Date
  validadeDias: number
  cliente: string
  itens: OrcamentoItem[]
  linkCarrinho: string
  loja: { nome: string; site: string; contato: string }
  condicoes: string[]
}

const VERDE = rgb(0.01, 0.69, 0.44) // #03b06f, mesma cor do webchat
const CINZA = rgb(0.35, 0.35, 0.35)
const CINZA_CLARO = rgb(0.94, 0.95, 0.94)
const PRETO = rgb(0.1, 0.1, 0.1)

const brl = (valor: number) => `R$ ${valor.toFixed(2).replace('.', ',').replace(/\B(?=(\d{3})+(?!\d))/g, '.')}`
const dataBr = (d: Date) => d.toLocaleDateString('pt-BR', { timeZone: 'America/Sao_Paulo' })

/** Quebra o texto em linhas que caibam na largura informada. */
function quebrarLinhas(texto: string, fonte: PDFFont, tamanho: number, largura: number): string[] {
  const linhas: string[] = []
  let atual = ''
  for (const palavra of texto.split(/\s+/)) {
    const teste = atual ? `${atual} ${palavra}` : palavra
    if (fonte.widthOfTextAtSize(teste, tamanho) > largura && atual) {
      linhas.push(atual)
      atual = palavra
    } else {
      atual = teste
    }
  }
  if (atual) linhas.push(atual)
  return linhas
}

/** Remove caracteres que as fontes padrão do PDF não conseguem desenhar (ex: emojis). */
const seguro = (texto: string) => texto.replace(/[^\u0000-ÿ–—•…“”‘’€]/g, '').trim()

export async function gerarOrcamentoPdf(dados: OrcamentoData): Promise<Uint8Array> {
  const pdf = await PDFDocument.create()
  pdf.setTitle(`Orçamento ${dados.numero} - ${dados.loja.nome}`)
  pdf.setAuthor(dados.loja.nome)

  const page: PDFPage = pdf.addPage([595.28, 841.89]) // A4
  const { width, height } = page.getSize()
  const regular = await pdf.embedFont(StandardFonts.Helvetica)
  const negrito = await pdf.embedFont(StandardFonts.HelveticaBold)
  const margem = 48
  const larguraUtil = width - margem * 2

  const texto = (t: string, x: number, y: number, opts: { fonte?: PDFFont; tamanho?: number; cor?: ReturnType<typeof rgb> } = {}) =>
    page.drawText(seguro(t), { x, y, font: opts.fonte ?? regular, size: opts.tamanho ?? 10, color: opts.cor ?? PRETO })
  const textoDireita = (t: string, xDireita: number, y: number, opts: { fonte?: PDFFont; tamanho?: number; cor?: ReturnType<typeof rgb> } = {}) => {
    const fonte = opts.fonte ?? regular
    const tamanho = opts.tamanho ?? 10
    texto(t, xDireita - fonte.widthOfTextAtSize(seguro(t), tamanho), y, opts)
  }

  // Cabeçalho
  page.drawRectangle({ x: 0, y: height - 110, width, height: 110, color: VERDE })
  texto(dados.loja.nome, margem, height - 55, { fonte: negrito, tamanho: 24, cor: rgb(1, 1, 1) })
  texto(dados.loja.site, margem, height - 78, { tamanho: 10, cor: rgb(1, 1, 1) })
  textoDireita('ORÇAMENTO', width - margem, height - 52, { fonte: negrito, tamanho: 16, cor: rgb(1, 1, 1) })
  textoDireita(`Nº ${dados.numero}`, width - margem, height - 72, { tamanho: 10, cor: rgb(1, 1, 1) })

  // Dados do orçamento
  let y = height - 150
  const validade = new Date(dados.data.getTime() + dados.validadeDias * 86400000)
  texto('Cliente', margem, y, { fonte: negrito, tamanho: 9, cor: CINZA })
  texto('Emissão', margem + 280, y, { fonte: negrito, tamanho: 9, cor: CINZA })
  texto('Válido até', margem + 390, y, { fonte: negrito, tamanho: 9, cor: CINZA })
  y -= 16
  texto(dados.cliente, margem, y, { tamanho: 12 })
  texto(dataBr(dados.data), margem + 280, y, { tamanho: 12 })
  texto(dataBr(validade), margem + 390, y, { tamanho: 12 })

  // Tabela de itens
  y -= 40
  // Posições: produto alinhado à esquerda; quantidade, unitário e subtotal alinhados pela direita
  const colunas = { produto: margem + 8, qtd: margem + 300, unit: margem + 400, total: width - margem - 8 }
  page.drawRectangle({ x: margem, y: y - 8, width: larguraUtil, height: 26, color: VERDE })
  texto('Produto', colunas.produto, y, { fonte: negrito, cor: rgb(1, 1, 1) })
  textoDireita('Qtd', colunas.qtd, y, { fonte: negrito, cor: rgb(1, 1, 1) })
  textoDireita('Unitário', colunas.unit, y, { fonte: negrito, cor: rgb(1, 1, 1) })
  textoDireita('Subtotal', colunas.total, y, { fonte: negrito, cor: rgb(1, 1, 1) })
  y -= 30

  let total = 0
  dados.itens.forEach((item, i) => {
    const subtotal = item.quantidade * item.precoUnitario
    total += subtotal
    const linhasNome = quebrarLinhas(seguro(item.nome), regular, 10, 230)
    const alturaLinha = 14 * linhasNome.length + 24
    if (i % 2 === 0) page.drawRectangle({ x: margem, y: y + 14 - alturaLinha, width: larguraUtil, height: alturaLinha, color: CINZA_CLARO })
    linhasNome.forEach((linha, j) => texto(linha, colunas.produto, y - j * 14))
    texto(`SKU ${item.sku}`, colunas.produto, y - linhasNome.length * 14, { tamanho: 8, cor: CINZA })
    textoDireita(String(item.quantidade), colunas.qtd, y)
    textoDireita(brl(item.precoUnitario), colunas.unit, y)
    textoDireita(brl(subtotal), colunas.total, y, { fonte: negrito })
    y -= alturaLinha
  })

  // Totais
  y -= 6
  page.drawLine({ start: { x: margem + 280, y: y + 10 }, end: { x: width - margem, y: y + 10 }, thickness: 1, color: VERDE })
  y -= 8
  texto('Total', margem + 300, y, { fonte: negrito, tamanho: 13 })
  textoDireita(brl(total), colunas.total, y, { fonte: negrito, tamanho: 13 })
  y -= 18
  texto('No PIX (5% de desconto)', margem + 300, y, { tamanho: 10, cor: VERDE })
  textoDireita(brl(total * 0.95), colunas.total, y, { fonte: negrito, tamanho: 10, cor: VERDE })

  // Condições
  y -= 44
  texto('Condições', margem, y, { fonte: negrito, tamanho: 11 })
  y -= 16
  for (const condicao of dados.condicoes) {
    for (const linha of quebrarLinhas(`•  ${seguro(condicao)}`, regular, 9.5, larguraUtil)) {
      texto(linha, margem, y, { tamanho: 9.5, cor: CINZA })
      y -= 13
    }
  }

  // Link do carrinho (clicável)
  y -= 18
  page.drawRectangle({ x: margem, y: y - 34, width: larguraUtil, height: 50, borderColor: VERDE, borderWidth: 1.2, color: rgb(0.96, 1, 0.98) })
  texto('Finalize sua compra com os itens já no carrinho:', margem + 12, y - 2, { fonte: negrito, tamanho: 10 })
  const link = dados.linkCarrinho
  texto(link, margem + 12, y - 20, { tamanho: 9, cor: rgb(0.05, 0.4, 0.8) })
  const linkAnnot = pdf.context.obj({
    Type: 'Annot',
    Subtype: 'Link',
    Rect: [margem, y - 34, width - margem, y + 16],
    Border: [0, 0, 0],
    A: { Type: 'Action', S: 'URI', URI: PDFString.of(link) },
  })
  page.node.addAnnot(pdf.context.register(linkAnnot))

  // Rodapé
  texto(`${dados.loja.nome}  •  ${dados.loja.contato}`, margem, 40, { tamanho: 8.5, cor: CINZA })
  textoDireita('Orçamento gerado pela Bila, consultora virtual', width - margem, 40, { tamanho: 8.5, cor: CINZA })

  return pdf.save()
}
