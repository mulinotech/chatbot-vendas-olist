import { context, user } from '@botpress/runtime'

// Nome do cliente da conversa: guardado em user.state.nomeCliente pela ferramenta salvarNomeCliente.
// Vocativos carinhosos da Bila ("querida", "meu bem") nunca valem como nome.

const VOCATIVOS = new Set([
  'querida', 'querido', 'meu bem', 'minha querida', 'meu querido', 'amiga', 'amigo', 'flor', 'linda', 'lindo',
  'cliente', 'senhora', 'senhor', 'você', 'voce', 'moça', 'moca', 'moço', 'moco',
])

export function nomeValido(nome: string | null | undefined): string | null {
  const limpo = (nome ?? '').replace(/[^\p{L}\s'.-]/gu, ' ').replace(/\s+/g, ' ').trim()
  if (limpo.length < 2 || VOCATIVOS.has(limpo.toLowerCase())) return null
  return limpo.replace(/\b\p{L}/gu, (letra) => letra.toUpperCase())
}

/** Nome confirmado na conversa (ou null se ainda não sabemos). */
export const nomeDoCliente = (): string | null => nomeValido(user.state.nomeCliente)

/** Nome do perfil do WhatsApp (pushName): serve só como sugestão para a Bila confirmar. */
export function nomeDoPerfil(): string | null {
  const perfil = (context.get('user', { optional: true }) as any)?.name
  return nomeValido(typeof perfil === 'string' ? perfil.split(/\s+/)[0] : null)
}
