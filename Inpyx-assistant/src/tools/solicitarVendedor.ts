import { Autonomous, z, context } from '@botpress/runtime'
import { AtendimentosTable } from '../tables/Atendimentos'

// Encaminha o cliente para um vendedor humano, registrando o pedido na AtendimentosTable.

export const solicitarVendedor = new Autonomous.Tool({
  name: 'solicitarVendedor',
  description:
    'Encaminha o cliente para um vendedor humano da equipe. Use quando: o estoque não atende a quantidade pedida, ' +
    'for orçamento de volume/atacado/revenda, o cliente pedir para falar com uma pessoa, ou houver algo que você não consegue resolver. ' +
    'Só chame DEPOIS que o cliente aceitar ser encaminhado.',

  input: z.object({
    nome: z.string().describe('Nome do cliente, como ele se apresentou na conversa'),
    motivo: z
      .enum(['estoque_insuficiente', 'orcamento_volume', 'pedido_do_cliente', 'duvida_complexa', 'outro'])
      .describe('Motivo do encaminhamento'),
    resumo: z.string().describe('Resumo objetivo para o vendedor: produtos, SKUs, quantidades, contexto clínico relevante e o que o cliente espera'),
    telefone: z.string().optional().describe('Telefone informado pelo cliente (só peça se a conversa não for pelo WhatsApp)'),
  }),

  output: z.string(),

  handler: async ({ nome, motivo, resumo, telefone }) => {
    const conversation = context.get('conversation', { optional: true }) as any
    const user = context.get('user', { optional: true }) as any
    const canal = String(conversation?.integration ?? 'desconhecido').includes('evolution') ? 'whatsapp' : String(conversation?.integration ?? 'desconhecido')

    // No WhatsApp, o telefone vem das tags do usuário criadas pela integração
    const tags: Record<string, string> = user?.tags ?? {}
    const telefoneWhatsApp = Object.entries(tags).find(([key]) => key.endsWith('phone'))?.[1]
    const telefoneFinal = telefone ?? telefoneWhatsApp ?? ''

    await AtendimentosTable.createRows({
      rows: [
        {
          nome,
          telefone: telefoneFinal,
          canal,
          motivo,
          resumo,
          conversationId: String(conversation?.id ?? ''),
          status: 'pendente',
        },
      ],
    })
    console.log(`[solicitarVendedor] Novo atendimento: ${nome} (${telefoneFinal || 'sem telefone'}) — ${motivo}`)

    return telefoneFinal
      ? `Atendimento registrado. Um vendedor vai entrar em contato com ${nome} pelo número ${telefoneFinal}, em horário comercial (seg a sex, 9h às 11h30 e 13h30 às 17h). Avise o cliente com carinho e pergunte se pode ajudar em algo mais enquanto isso.`
      : `Atendimento registrado, mas sem telefone. Peça com delicadeza um WhatsApp para contato e chame solicitarVendedor de novo informando o telefone.`
  },
})
