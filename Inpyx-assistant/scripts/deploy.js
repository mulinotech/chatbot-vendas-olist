import { spawnSync } from 'child_process'
import fs from 'fs'
import path from 'path'
import os from 'os'

const isWindows = os.platform() === 'win32'

function runCommand(command, args, cwd, ignoreError = false) {
  console.log(`Running: ${command} ${args.join(' ')}`)
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

// 4. Fazer o deploy do pacote gerado
console.log('Enviando bot ao Botpress Cloud...')
runCommand('node', [
  bpCliPath,
  'deploy',
  '--noBuild',
  '--botId',
  botId,
  '-y'
], botDir)

console.log('✅ Bot implantado com sucesso!')

