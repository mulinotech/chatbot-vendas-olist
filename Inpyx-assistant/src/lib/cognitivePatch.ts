import { RemoteModelProvider } from '@botpress/cognitive'

// Compatibilidade com provedores de IA em integrações PRIVADAS (ex: mulinotech/gemini).
//
// Para descobrir os modelos instalados, o @botpress/cognitive chama "<nome>:listLanguageModels"
// usando o NOME da integração. Em integrações públicas o nome é igual ao apelido (ex: "openai"),
// mas nas privadas o nome tem o prefixo do workspace ("mulinotech/gemini") e o Botpress só aceita
// o apelido ("gemini") nas chamadas de ação. Sem este ajuste, o modelo "gemini:..." não é encontrado.
//
// Convenção do projeto: o apelido da integração no agent.config.ts é o nome sem o prefixo do workspace.
//
// Em produção o bot pode não ter permissão para listar as próprias integrações; nesse caso o
// @botpress/cognitive usa uma lista fixa (google-ai, openai...). Por isso os apelidos dos
// provedores privados são sempre incluídos (chamadas para os não instalados são ignoradas).
const PRIVATE_LLM_ALIASES = ['gemini']

const proto = RemoteModelProvider.prototype as any
const original = proto._fetchInstalledIntegrationNames

if (typeof original === 'function' && !proto.__mulinoAliasPatch) {
  proto.__mulinoAliasPatch = true
  proto._fetchInstalledIntegrationNames = async function (this: unknown) {
    const names: string[] = await original.call(this)
    const aliases = names.map((name) => (name.includes('/') ? name.split('/').pop()! : name))
    return [...new Set([...aliases, ...PRIVATE_LLM_ALIASES])]
  }
}
