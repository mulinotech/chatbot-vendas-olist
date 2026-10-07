import { bot, secrets } from '@botpress/runtime'

// Cliente da API V3 do Tiny (Olist ERP).
// Os tokens OAuth ficam em bot.state.tiny e são renovados automaticamente:
// access token vale 4h e refresh token vale só 1 dia, por isso o workflow
// de sincronização (a cada 3h) também mantém a "corrente" de renovação viva.

const TOKEN_URL = 'https://accounts.tiny.com.br/realms/tiny/protocol/openid-connect/token'
const API_URL = 'https://api.tiny.com.br/public-api/v3'

// Renova o access token quando faltar menos que isso para expirar
const REFRESH_MARGIN_MS = 70 * 60 * 1000

const readSecret = (name: string): string | undefined =>
  ((secrets as Record<string, string | undefined>)[name] ?? process.env[name])?.trim().replace(/^["']|["']$/g, '')

const fingerprint = (token: string) => token.slice(-16)

export class TinyAuthError extends Error {}

async function refreshTokens(refreshToken: string) {
  const clientId = readSecret('TINY_CLIENT_ID')
  const clientSecret = readSecret('TINY_CLIENT_SECRET')
  if (!clientId || !clientSecret) {
    throw new TinyAuthError('Segredos TINY_CLIENT_ID / TINY_CLIENT_SECRET não configurados')
  }

  const res = await fetch(TOKEN_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'refresh_token',
      client_id: clientId,
      client_secret: clientSecret,
      refresh_token: refreshToken,
    }),
  })
  const data: any = await res.json().catch(() => ({}))
  if (!res.ok) {
    throw new TinyAuthError(
      `Falha ao renovar token do Tiny (${res.status}): ${data.error_description ?? data.error ?? 'erro desconhecido'}. ` +
        'Rode "node scripts/tiny-auth.mjs" para autorizar novamente.'
    )
  }

  const now = Date.now()
  return {
    accessToken: data.access_token as string,
    refreshToken: data.refresh_token as string,
    accessExpiresAt: now + data.expires_in * 1000,
    refreshExpiresAt: now + (data.refresh_expires_in ?? 86400) * 1000,
  }
}

/** Retorna um access token válido, renovando se necessário. */
export async function getTinyAccessToken(options: { forceRefresh?: boolean } = {}): Promise<string> {
  let state = bot.state.tiny ?? null

  // Semente: refresh token gerado pelo script tiny-auth.mjs e salvo como segredo.
  // Só é usado na primeira vez ou quando uma nova autorização for feita.
  const seed = readSecret('TINY_REFRESH_TOKEN')
  if (seed && state?.seededFrom !== fingerprint(seed)) {
    state = {
      accessToken: null,
      refreshToken: seed,
      accessExpiresAt: 0,
      refreshExpiresAt: 0,
      seededFrom: fingerprint(seed),
    }
  }

  if (!state) {
    throw new TinyAuthError('Bot ainda não autorizado no Tiny. Rode "node scripts/tiny-auth.mjs".')
  }

  if (!options.forceRefresh && state.accessToken && state.accessExpiresAt - Date.now() > REFRESH_MARGIN_MS) {
    return state.accessToken
  }

  const tokens = await refreshTokens(state.refreshToken)
  bot.state.tiny = { ...tokens, seededFrom: state.seededFrom }
  return tokens.accessToken
}

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms))

/**
 * GET na API do Tiny com retentativa em caso de limite de requisições (429) ou token expirado (401).
 * `token` permite passar um access token já obtido (usado pelo workflow, que não lê bot.state a cada chamada).
 */
export async function tinyGet<T = any>(path: string, options: { token?: string } = {}, attempt = 1): Promise<T> {
  const token = options.token ?? (await getTinyAccessToken())
  const res = await fetch(`${API_URL}${path}`, {
    headers: { Authorization: `Bearer ${token}` },
  })

  if (res.status === 401 && attempt < 3) {
    return tinyGet<T>(path, { token: await getTinyAccessToken({ forceRefresh: true }) }, attempt + 1)
  }
  if (res.status === 429 && attempt < 4) {
    const resetSeconds = Number(res.headers.get('x-ratelimit-reset')) || 2
    await sleep(resetSeconds * 1000 + 500)
    return tinyGet<T>(path, options, attempt + 1)
  }

  if (!res.ok) {
    const body = await res.text().catch(() => '')
    throw new Error(`Tiny API ${path} retornou ${res.status}: ${body.slice(0, 300)}`)
  }
  return (await res.json()) as T
}

// --- Tipos e chamadas usadas pelo bot ---

export type TinyProductSummary = {
  id: number
  sku: string
  descricao: string
  tipo: string
  situacao: string
  dataAlteracao: string
  precos: { preco: number; precoPromocional: number }
}

export type TinyProductDetail = TinyProductSummary & {
  descricaoComplementar?: string
  categoria?: { nome: string; caminhoCompleto: string } | null
  seo?: { titulo?: string; descricao?: string; keywords?: string[]; slug?: string }
  tags?: { nome: string; nomeGrupoTag?: string }[]
  anexos?: { url: string }[]
  estoque?: { controlar?: boolean; sobEncomenda?: boolean }
}

export type TinyStock = { id: number; codigo: string; saldo: number; reservado: number; disponivel: number }

/** Lista todos os produtos ativos (paginado). */
export async function listActiveTinyProducts(token?: string): Promise<TinyProductSummary[]> {
  const all: TinyProductSummary[] = []
  const limit = 100
  for (let offset = 0; ; offset += limit) {
    const page = await tinyGet<{ itens: TinyProductSummary[]; paginacao: { total: number } }>(
      `/produtos?situacao=A&limit=${limit}&offset=${offset}`,
      { token }
    )
    all.push(...page.itens)
    if (page.itens.length < limit || all.length >= page.paginacao.total) break
  }
  return all
}

export const getTinyProduct = (id: number, token?: string) => tinyGet<TinyProductDetail>(`/produtos/${id}`, { token })

export const getTinyStock = (id: number, token?: string) => tinyGet<TinyStock>(`/estoque/${id}`, { token })
