// Autorização do aplicativo API V3 do Tiny (Olist ERP).
// Uso: node scripts/tiny-auth.mjs          → autoriza e grava os segredos no bot de desenvolvimento
//      node scripts/tiny-auth.mjs --prod   → autoriza e grava os segredos no bot publicado (produção)
// Lê TINY_CLIENT_ID e TINY_CLIENT_SECRET do arquivo .env, abre o login do Tiny no navegador,
// captura o código de autorização em http://localhost:8787/callback, troca pelos tokens,
// salva em .tiny-tokens.json (ignorado pelo git) e grava os segredos via "adk secret:set".
// Cada ambiente (dev/prod) precisa da sua própria autorização: o Tiny troca o refresh token a cada renovação.

import http from 'node:http'
import fs from 'node:fs'
import path from 'node:path'
import { exec, spawnSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const PORT = 8787
const REDIRECT_URI = `http://localhost:${PORT}/callback`
const AUTH_URL = 'https://accounts.tiny.com.br/realms/tiny/protocol/openid-connect/auth'
const TOKEN_URL = 'https://accounts.tiny.com.br/realms/tiny/protocol/openid-connect/token'
const API_URL = 'https://api.tiny.com.br/public-api/v3'

// Leitura simples do .env, sem dependências externas
function loadEnv() {
  const envPath = path.join(ROOT, '.env')
  if (!fs.existsSync(envPath)) return {}
  return Object.fromEntries(
    fs.readFileSync(envPath, 'utf8')
      .split(/\r?\n/)
      .filter((line) => line.trim() && !line.trim().startsWith('#') && line.includes('='))
      .map((line) => {
        const i = line.indexOf('=')
        return [line.slice(0, i).trim(), line.slice(i + 1).trim().replace(/^["']|["']$/g, '')]
      })
  )
}

const env = { ...loadEnv(), ...process.env }
const clientId = env.TINY_CLIENT_ID
const clientSecret = env.TINY_CLIENT_SECRET

if (!clientId || !clientSecret) {
  console.error('❌ TINY_CLIENT_ID e/ou TINY_CLIENT_SECRET não encontrados no arquivo .env')
  process.exit(1)
}

const authorizeUrl = `${AUTH_URL}?${new URLSearchParams({
  client_id: clientId,
  redirect_uri: REDIRECT_URI,
  scope: 'openid',
  response_type: 'code',
})}`

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, `http://localhost:${PORT}`)
  if (url.pathname !== '/callback') {
    res.writeHead(404).end()
    return
  }

  const code = url.searchParams.get('code')
  if (!code) {
    res.writeHead(400, { 'Content-Type': 'text/html; charset=utf-8' })
    res.end(`<h2>Autorização não concluída</h2><p>${url.searchParams.get('error_description') ?? 'Código não recebido.'}</p>`)
    console.error('❌ O Tiny não devolveu o código de autorização:', url.search)
    server.close()
    return
  }

  try {
    const tokenRes = await fetch(TOKEN_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        grant_type: 'authorization_code',
        client_id: clientId,
        client_secret: clientSecret,
        redirect_uri: REDIRECT_URI,
        code,
      }),
    })
    const tokens = await tokenRes.json()
    if (!tokenRes.ok) throw new Error(JSON.stringify(tokens))

    const now = Date.now()
    fs.writeFileSync(
      path.join(ROOT, '.tiny-tokens.json'),
      JSON.stringify({
        access_token: tokens.access_token,
        refresh_token: tokens.refresh_token,
        access_expires_at: now + tokens.expires_in * 1000,
        refresh_expires_at: now + (tokens.refresh_expires_in ?? 86400) * 1000,
      }, null, 2)
    )

    // Teste rápido: busca 3 produtos para confirmar que o acesso funciona
    const apiRes = await fetch(`${API_URL}/produtos?limit=3`, {
      headers: { Authorization: `Bearer ${tokens.access_token}` },
    })
    const data = await apiRes.json()

    if (apiRes.ok) {
      console.log(`✅ Autorizado! Total de produtos no Tiny: ${data.paginacao?.total ?? '?'}`)
      for (const p of data.itens ?? []) console.log(`   - ${p.sku} | ${p.descricao}`)
    } else {
      console.warn(`⚠️ Tokens salvos, mas o teste da API retornou ${apiRes.status}:`, JSON.stringify(data))
    }

    // Grava as credenciais no cofre de segredos do bot (dev ou produção)
    const isProd = process.argv.includes('--prod')
    console.log(`\nGravando segredos no bot (${isProd ? 'produção' : 'desenvolvimento'})...`)
    const secretsToSet = {
      TINY_CLIENT_ID: clientId,
      TINY_CLIENT_SECRET: clientSecret,
      TINY_REFRESH_TOKEN: tokens.refresh_token,
    }
    for (const [key, value] of Object.entries(secretsToSet)) {
      const result = spawnSync('adk', ['secret:set', key, `"${value}"`, ...(isProd ? ['--prod'] : [])], {
        cwd: ROOT,
        shell: true,
        encoding: 'utf8',
      })
      console.log(result.status === 0 ? `   ✅ ${key}` : `   ❌ ${key}: ${(result.stderr || result.stdout || '').trim()}`)
    }

    res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' })
    res.end('<h2>✅ Tudo certo!</h2><p>O bot Inpyx foi autorizado no Tiny. Pode fechar esta aba e voltar para o VS Code.</p>')
  } catch (err) {
    console.error('❌ Erro ao trocar o código pelos tokens:', err.message)
    res.writeHead(500, { 'Content-Type': 'text/html; charset=utf-8' })
    res.end('<h2>Erro</h2><p>Veja a mensagem no terminal do VS Code.</p>')
  } finally {
    server.close()
  }
})

server.listen(PORT, () => {
  console.log('Abrindo o login do Tiny no navegador...')
  console.log('Se não abrir sozinho, copie e cole este endereço no navegador:\n')
  console.log(authorizeUrl + '\n')
  const opener = process.platform === 'win32' ? `start "" "${authorizeUrl}"` : process.platform === 'darwin' ? `open "${authorizeUrl}"` : `xdg-open "${authorizeUrl}"`
  exec(opener)
})
