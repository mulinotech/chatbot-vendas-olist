import { spawnSync } from 'child_process'
import fs from 'fs'
import path from 'path'
import os from 'os'

const isWindows = os.platform() === 'win32'

function runCommand(command, args, cwd, ignoreError = false) {
  // Mascara valores de segredos e tokens antes de imprimir o comando
  const printable = args.map((arg) => (/^"?[A-Z_]+=/.test(arg) ? arg.replace(/=.*$/, '=***"') : arg))
  const tokenIndex = args.indexOf('--token')
  if (tokenIndex >= 0) printable[tokenIndex + 1] = '***'
  console.log(`Running: ${command} ${printable.join(' ')}`)
  const result = spawnSync(command, args, {
    cwd,
    stdio: 'inherit',
    shell: isWindows,
  })
  if (result.status !== 0) {
    console.error(`Command failed with exit code ${result.status}`)
    if (!ignoreError) {
      process.exit(result.status || 1)
    }
  }
  return result.status === 0
}

// 1. Resolve os caminhos e configurações
const homedir = os.homedir()
const projectDir = path.resolve()

// Caminho do agent.json
const agentJsonPath = path.join(projectDir, 'agent.json')
if (!fs.existsSync(agentJsonPath)) {
  console.error(`Erro: Arquivo agent.json não encontrado em ${agentJsonPath}`)
  process.exit(1)
}

const agentConfig = JSON.parse(fs.readFileSync(agentJsonPath, 'utf8'))
const { botId, workspaceId } = agentConfig

if (!botId || !workspaceId) {
  console.error('Erro: botId e workspaceId são obrigatórios no agent.json')
  process.exit(1)
}

// Caminho do credentials do ADK
const credentialsPath = path.join(homedir, '.adk', 'credentials')
if (!fs.existsSync(credentialsPath)) {
  console.error(`Erro: Arquivo de credenciais do ADK não encontrado em ${credentialsPath}. Por favor, rode adk login primeiro.`)
  process.exit(1)
}

const credentials = JSON.parse(fs.readFileSync(credentialsPath, 'utf8'))
const profileName = credentials.currentProfile || 'default'
const token = credentials.profiles?.[profileName]?.token

if (!token) {
  console.error(`Erro: Token não encontrado para o perfil "${profileName}" em credentials.`)
  process.exit(1)
}

// Localizar a versão mais recente do CLI no .adk
const bpCliBaseDir = path.join(homedir, '.adk', 'bp-cli')
if (!fs.existsSync(bpCliBaseDir)) {
  console.error(`Erro: Diretório do CLI do Botpress não encontrado em ${bpCliBaseDir}`)
  process.exit(1)
}

const versions = fs.readdirSync(bpCliBaseDir).filter(f => {
  return fs.statSync(path.join(bpCliBaseDir, f)).isDirectory()
})

if (versions.length === 0) {
  console.error('Erro: Nenhuma versão do CLI do Botpress encontrada.')
  process.exit(1)
}

// Ordenar e pegar a versão mais recente
versions.sort((a, b) => {
  return a.localeCompare(b, undefined, { numeric: true, sensitivity: 'base' })
})
const latestVersion = versions[versions.length - 1]
const bpCliPath = path.join(bpCliBaseDir, latestVersion, 'node_modules', '@botpress', 'cli', 'bin.js')

if (!fs.existsSync(bpCliPath)) {
  console.error(`Erro: bin.js do Botpress não encontrado em ${bpCliPath}`)
  process.exit(1)
}

console.log(`Usando Botpress CLI da versão: ${latestVersion}`)
const botDir = path.join(projectDir, '.adk', 'bot')

// 2. Executar o login no CLI do Botpress caso necessário
console.log('Efetuando login no Botpress CLI...')
runCommand('node', [
  bpCliPath,
  'login',
  '--token',
  token,
  '--workspaceId',
  workspaceId,
  '-y'
], botDir)

// 3. Executar o build via ADK para garantir geração dos tipos e empacotamento correto
console.log('Compilando projeto via ADK...')
const adkBuildSuccess = runCommand('adk', ['build'], projectDir, true)

if (!adkBuildSuccess) {
  console.log('adk build falhou (provavelmente devido ao bug do Bun/esbuild no Windows).')
  console.log('Tentando compilar o bot diretamente via Node.js...')
  runCommand('node', [
    bpCliPath,
    'build',
    '--sourceMap'
  ], botDir)
}

// Patch bot.definition.ts para injetar manualmente as definições de tabelas
const compiledBotDefPath = path.join(projectDir, '.adk', 'bot', 'bot.definition.ts')
if (fs.existsSync(compiledBotDefPath)) {
  let botDefContent = fs.readFileSync(compiledBotDefPath, 'utf8')
  if (!botDefContent.includes('ProductsTable')) {
    console.log('Injetando tabela ProductsTable no bot.definition.ts...')
    const targetPattern = 'attributes: {\r\n        runtime: "adk",\r\n        runtimeVersion: "1.18.3",\r\n        \r\n      },'
    const targetPatternLF = 'attributes: {\n        runtime: "adk",\n        runtimeVersion: "1.18.3",\n        \n      },'
    
    const tablesString = `
      tables: {
        "ProductsTable": {
          schema: z.object({
            sku: z.string().describe('Código SKU único do produto'),
            name: z.string().describe('Nome do produto'),
            description: z.string().describe('Descrição terapêutica e propriedades do produto'),
            price: z.number().describe('Preço padrão do produto'),
            salePrice: z.number().nullable().optional().describe('Preço promocional se ativo'),
            availability: z.enum(['in_stock', 'out_of_stock']).describe('Disponibilidade do estoque'),
            productLink: z.string().describe('Link de compra direta do produto'),
            imageUrl: z.string().describe('URL da imagem do produto'),
            category: z.string().describe('Categoria do produto'),
            keywords: z.string().optional().describe('Palavras-chave, órgãos e categorias do Tiny'),
            variantId: z.number().nullable().optional().describe('ID da variação na Nuvemshop'),
            tinyId: z.number().nullable().optional().describe('ID do produto no Tiny'),
            stockQty: z.number().nullable().optional().describe('Quantidade disponível no Tiny'),
            tinyUpdatedAt: z.string().nullable().optional().describe('Última alteração no Tiny'),
          }),
        },
        "AtendimentosTable": {
          schema: z.object({
            nome: z.string().describe('Nome do cliente'),
            telefone: z.string().describe('Telefone/WhatsApp do cliente'),
            canal: z.string().describe('Canal de origem da conversa'),
            motivo: z.string().describe('Motivo do encaminhamento'),
            resumo: z.string().describe('Resumo do que o cliente precisa'),
            conversationId: z.string().describe('ID da conversa no Botpress'),
            status: z.string().describe('Situação: pendente, em_atendimento, concluido'),
          }),
        }
      },`

    if (botDefContent.includes(targetPattern)) {
      botDefContent = botDefContent.replace(targetPattern, `attributes: {\r\n        runtime: "adk",\r\n        runtimeVersion: "1.18.3",\r\n        \r\n      },${tablesString}`)
    } else if (botDefContent.includes(targetPatternLF)) {
      botDefContent = botDefContent.replace(targetPatternLF, `attributes: {\n        runtime: "adk",\n        runtimeVersion: "1.18.3",\n        \n      },${tablesString}`)
    } else {
      // Fallback: tentar substituir baseada em regex flexível
      botDefContent = botDefContent.replace(
        /attributes\s*:\s*\{\s*runtime\s*:\s*"adk",\s*runtimeVersion\s*:\s*"1\.18\.3",?\s*\},?/g,
        `attributes: {\n        runtime: "adk",\n        runtimeVersion: "1.18.3"\n      },${tablesString}`
      )
    }
    
    fs.writeFileSync(compiledBotDefPath, botDefContent, 'utf8')
    console.log('Injeção de ProductsTable concluída com sucesso!')
  } else {
    console.log('Tabela ProductsTable já está declarada no bot.definition.ts.')
  }
} else {
  console.warn('Aviso: arquivo bot.definition.ts não encontrado para injeção de tabelas.')
}

// 4. Montar os segredos do bot (o bp CLI exige os segredos obrigatórios no deploy)
const envPath = path.join(projectDir, '.env')
const env = fs.existsSync(envPath)
  ? Object.fromEntries(
      fs.readFileSync(envPath, 'utf8')
        .split(/\r?\n/)
        .filter((line) => line.includes('=') && !line.trim().startsWith('#'))
        .map((line) => [line.slice(0, line.indexOf('=')).trim(), line.slice(line.indexOf('=') + 1).trim().replace(/^["']|["']$/g, '')])
    )
  : {}

const secretValues = {
  TINY_CLIENT_ID: env.TINY_CLIENT_ID,
  TINY_CLIENT_SECRET: env.TINY_CLIENT_SECRET,
  ELEVENLABS_API_KEY: env.ELEVENLABS_API_KEY,
}

// Refresh token do Tiny: só é enviado quando houver uma autorização nova (tiny-auth.mjs),
// pois o bot troca o token a cada renovação e reenviar um antigo quebraria o acesso.
const tokensPath = path.join(projectDir, '.tiny-tokens.json')
const seedMarkerPath = path.join(projectDir, '.tiny-seeded')
const tokensMtime = fs.existsSync(tokensPath) ? fs.statSync(tokensPath).mtimeMs : 0
const seededMtime = fs.existsSync(seedMarkerPath) ? Number(fs.readFileSync(seedMarkerPath, 'utf8')) : 0
const sendTinySeed = tokensMtime > 0 && tokensMtime !== seededMtime
if (sendTinySeed) {
  secretValues.TINY_REFRESH_TOKEN = JSON.parse(fs.readFileSync(tokensPath, 'utf8')).refresh_token
  console.log('Enviando nova autorização do Tiny (refresh token) para o bot...')
}

const missingSecrets = Object.entries(secretValues).filter(([, value]) => !value).map(([key]) => key)
if (missingSecrets.length > 0) {
  console.error(`Erro: segredos ausentes no .env: ${missingSecrets.join(', ')}`)
  process.exit(1)
}
const secretArgs = Object.entries(secretValues).flatMap(([key, value]) => ['--secrets', `"${key}=${value}"`])

// 5. Fazer o deploy do pacote gerado
console.log('Enviando bot ao Botpress Cloud...')
runCommand('node', [
  bpCliPath,
  'deploy',
  '--noBuild',
  '--botId',
  botId,
  ...secretArgs,
  '-y'
], botDir)

if (sendTinySeed) {
  fs.writeFileSync(seedMarkerPath, String(tokensMtime))
}

console.log('✅ Bot implantado com sucesso!')

