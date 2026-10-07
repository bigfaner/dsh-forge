// M3 3.9 复跑叠层生成器——S5/S6 spike 残余在 M3 真实装配面（3.4/3.7/3.8 之上）的确认件。
//
// 与一版 overlay.mjs 的形制差异（任务 3.9 裁决——预设归产品）：
//   远征/突击双预设、registry default、ui-settings 开关行全部由产品自带（3.7 三底稿 +
//   renderBootOverlay 物化 + 首启预置），复跑叠层**不再生成任何预设行**——只注两件：
//   ① dogfood 模型行（zai-coding-cn / glm-5.3-flash——隔离 dshHome 播种凭据）；
//   ② m3_probe 探针插件行（工具面/worker 收窄判定物——spike 工件，非产品结构）。
//   唯一例外 = m3-packaged-js 负对照：读产品远征底稿、仅把 customSkillDirs[core] 一行
//   替换为 §5.6 官方 !!js 表达式后整行重述（外部叠层在 boot overlay 之后应用——按 row id
//   覆盖产品行；实验变量恰一行 = 路径形制），用于打包形态 !!js 判决的确认性复核。
//
// 用法：node overlay-m3.mjs --form m3-dev|m3-packaged|m3-packaged-js [--release <win-unpacked>] [--out <dir>]
// 产物：<out>/overlay-<form>.yml；预设归属/路径物化零参与（见上）。
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const SPIKE_ROOT = dirname(fileURLToPath(import.meta.url))
const REPO_ROOT = join(SPIKE_ROOT, '..', '..')
const EXPEDITION_DRAFT = join(REPO_ROOT, 'apps', 'host', 'src', 'profile', 'presets', 'expedition.patch.yml')

const argOf = (name, fallback) => {
  const i = process.argv.indexOf(name)
  return i >= 0 && process.argv[i + 1] !== undefined ? process.argv[i + 1] : fallback
}
const FORM = argOf('--form', 'm3-dev')
const RELEASE_ROOT = argOf(
  '--release',
  join(REPO_ROOT, 'release', 'installer', 'win-unpacked'),
)
const OUT_DIR = argOf('--out', join(SPIKE_ROOT, 'generated'))
const FORMS = ['m3-dev', 'm3-packaged', 'm3-packaged-js']
if (!FORMS.includes(FORM)) {
  console.error(`未知形态 ${FORM}（可选：${FORMS.join(' | ')}）`)
  process.exit(1)
}

const yamlQuote = (v) => `"${v.replace(/\\/g, '\\\\').replace(/"/g, '\\"')}"`

// ── m3-packaged-js 负对照行：产品远征底稿变换（变量隔离 = 仅 core 目录行换 !!js）──
// §5.6 官方 !!js 形制（一版 overlay.mjs 逐字——baseUrl 语义即判定物）
const PF_SKILLS_EXPR =
  "!!js process.getBuiltinModule('node:path').join(process.getBuiltinModule('node:path').dirname(process.getBuiltinModule('node:module').createRequire(baseUrl).resolve('@dsh-forge/plugin-forge/package.json')), 'skills')"

/** 底稿行变换：注释行剔除；core 占位符 → !!js 表达式；spec 占位符 → release 绝对路径；
 *  bindingsFile 占位块 → 剔除（fix-1 后底稿新增——boot overlay 才能物化的装配期路径，
 *  生成器语境不可知；负对照变量隔离 = 仅 skill 目录行，剔块回 config-less 旧形）；
 *  平台门求值 */
function negativeControlLines() {
  if (!existsSync(EXPEDITION_DRAFT)) throw new Error(`远征底稿缺席：${EXPEDITION_DRAFT}`)
  const pfSpecSkills = join(RELEASE_ROOT, 'resources', 'runtime', 'node_modules', '@dsh-forge', 'plugin-forge-spec', 'skills')
  const gates = new Map([
    ["disabled: !!js process.platform === 'win32'", String(process.platform === 'win32')],
    ["disabled: !!js process.platform !== 'win32'", String(process.platform !== 'win32')],
  ])
  const out = []
  for (const line of readFileSync(EXPEDITION_DRAFT, 'utf8').split('\n')) {
    if (/^\s*#/.test(line)) continue
    const trimmed = line.trim()
    const indent = line.slice(0, line.length - trimmed.length)
    if (trimmed === '- "{{plugin-forge-skills}}"') {
      out.push(`${indent}- ${PF_SKILLS_EXPR}`) // 唯一实验变量（负对照预期：{userData} profile 链不可解析 → 行 broken）
      continue
    }
    if (trimmed === '- "{{plugin-forge-spec-skills}}"') {
      out.push(`${indent}- ${yamlQuote(pfSpecSkills)}`)
      continue
    }
    if (trimmed === 'bindingsFile: "{{plugin-forge-bindings}}"') {
      // fix-1 占位块剔除：连同紧邻前导 config: 行（若恰为该块首）一并回 config-less 形
      if (out.length > 0 && /^\s*config:\s*$/.test(out[out.length - 1])) out.pop()
      continue
    }
    if (gates.has(trimmed)) {
      out.push(`${indent}disabled: ${gates.get(trimmed)}`)
      continue
    }
    out.push(line)
  }
  while (out.length > 0 && out[out.length - 1] === '') out.pop()
  return out
}

const L = []
L.push(`# M3 3.9 复跑叠层（form=${FORM}）——dogfood 模型 + m3_probe 探针；预设归产品（3.7），零预设行`)
L.push(`# 生成物：node overlay-m3.mjs --form ${FORM}；不进产品结构。`)
L.push('- id: llm-pi-ai')
L.push('  config:')
L.push('    providers:')
L.push('      zai-coding-cn:')
L.push('        apiKeyEnv: ZAI_CODING_CN_API_KEY')
L.push('- id: agent-default-model')
L.push('  config:')
L.push('    provider: zai-coding-cn')
L.push('    model: glm-5.3-flash')
L.push('- insert:')
L.push('    - id: dsh-m3-probe')
L.push("      name: '@dsh-m3/probe-env'")
if (FORM === 'm3-packaged-js') {
  L.push('# 负对照（packaged-js 残余确认）：产品远征行整行重述，customSkillDirs[core] 换 !!js 表达式——')
  L.push('# 外部叠层在 boot overlay 之后应用（row id 覆盖）；预期该行在打包形态 broken。')
  L.push(...negativeControlLines()) // 底稿首行自带 `- insert:`
}
L.push('')

mkdirSync(OUT_DIR, { recursive: true })
const out = join(OUT_DIR, `overlay-${FORM}.yml`)
writeFileSync(out, L.join('\n'), 'utf8')
console.log(`[overlay-m3] ${out}（${L.length} 行；form=${FORM}${FORM === 'm3-packaged-js' ? ' 含负对照行' : ''}）`)
