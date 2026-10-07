// Publica a integração no workspace do Botpress (privada). Uso: npm run deploy
// Usa o Botpress CLI instalado pela ADK (~/.adk/bp-cli) com o login feito pelo deploy do bot.
import { spawnSync } from 'node:child_process'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const cliBase = path.join(os.homedir(), '.adk', 'bp-cli')
const versions = fs.existsSync(cliBase)
  ? fs.readdirSync(cliBase).sort((a, b) => a.localeCompare(b, undefined, { numeric: true }))
  : []
if (versions.length === 0) {
  console.error('Botpress CLI não encontrado em ~/.adk/bp-cli. Rode "npm run deploy" no bot primeiro.')
  process.exit(1)
}
const bin = path.join(cliBase, versions.at(-1), 'node_modules', '@botpress', 'cli', 'bin.js')

const cwd = path.dirname(fileURLToPath(import.meta.url))
console.log(`Publicando integração a partir de ${cwd}...`)
const result = spawnSync('node', [bin, 'deploy', '-y', '--visibility', 'private'], { stdio: 'inherit', cwd })
if (result.error) console.error('Erro ao executar o Botpress CLI:', result.error.message)
process.exit(result.status ?? 1)
