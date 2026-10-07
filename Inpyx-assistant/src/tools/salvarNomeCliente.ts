import { Autonomous, z, user } from '@botpress/runtime'
import { nomeValido } from '../lib/cliente'

export const salvarNomeCliente = new Autonomous.Tool({
  name: 'salvarNomeCliente',
  description:
    'Guarda o nome do cliente assim que ele se apresentar ou confirmar como quer ser chamado. ' +
    'Esse nome é usado nos orçamentos em PDF e no encaminhamento para vendedores. ' +
    'Nunca use vocativos ("querida", "meu bem") como nome.',

  input: z.object({
    nome: z.string().describe('Nome do cliente exatamente como ele informou (de preferência nome e sobrenome)'),
  }),

  output: z.string(),

  handler: async ({ nome }) => {
    const valido = nomeValido(nome)
    if (!valido) return `"${nome}" não parece um nome. Pergunte com carinho como o cliente se chama.`
    user.state.nomeCliente = valido
    return `Nome salvo: ${valido}. Use-o para chamar o cliente na conversa.`
  },
})
