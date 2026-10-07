import { Table, z } from '@botpress/runtime'

// Pedidos de atendimento humano (orçamentos de volume, falta de estoque, casos que a Bila não resolve)
export const AtendimentosTable = new Table({
  name: 'AtendimentosTable',
  description: 'Solicitações de atendimento por um vendedor humano, registradas pela Bila',

  columns: {
    nome: z.string().describe('Nome do cliente'),
    telefone: z.string().describe('Telefone/WhatsApp do cliente (quando disponível)'),
    canal: z.string().describe('Canal de origem da conversa (whatsapp, webchat...)'),
    motivo: z.string().describe('Motivo do encaminhamento'),
    resumo: z.string().describe('Resumo do que o cliente precisa (produtos, quantidades, contexto)'),
    conversationId: z.string().describe('ID da conversa no Botpress'),
    status: z.string().describe('Situação: pendente, em_atendimento, concluido'),
  },
})
