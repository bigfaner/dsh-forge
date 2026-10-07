// M3 S5/S6 spike 叠层生成器——按形态产出 overlay YAML（DSH_FORGE_PATCH_FILES 消费）。
//
// 单一源程序化构建：远征/突击双预设声明行 = standard.patch.yml 全量镜像（persona/
// agent-instructions/工具行/planning/compaction/delegation 三组/ask-user/todo/web/
// present）+ forge 增量行（plugin-forge）+ skill-filesystem customSkillDirs（形态化）。
// 形态差异仅三处（提案方案③/⑥ 载体问题的实验变量）：
//   dev           = spike 技能根字面绝对路径 + plugin-forge skills 用官方 !!js 表达式（§5.6 底稿形制）
//   dev-tf        = dev + delegation 组 tool-subagent 行 toolFilter deny（二期，工具名取自一期 dump）
//   packaged-abs  = 全部字面绝对路径（含 release runtime 的 plugin-forge skills）——「宿主物化绝对路径」形态
//   packaged-js   = 同 dev（!!js 表达式）——负对照：预期打包形态 {userData} profile 链不可解析（M2 3.4 复核）
//
// 用法：node overlay.mjs --form dev [--deny web,ask_user] [--out <dir>]
// 产物：<out>/overlay-<form>.yml
import { mkdirSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const SPIKE_ROOT = dirname(fileURLToPath(import.meta.url))
const REPO_ROOT = join(SPIKE_ROOT, '..', '..')
const FORGE_CORE_DIR = join(SPIKE_ROOT, 'skill-roots', 'forge-core')
const FORGE_SPEC_DIR = join(SPIKE_ROOT, 'skill-roots', 'forge-spec')
const PLUGIN_FORGE_SKILLS_DEV = join(REPO_ROOT, 'packages', 'plugin-forge', 'skills')
const PLUGIN_FORGE_SKILLS_PACKAGED =
  'Z:\\project\\dsh\\dsh-forge\\.forge\\worktrees\\fix-projects-register-handler\\release\\installer\\win-unpacked\\resources\\runtime\\node_modules\\@dsh-forge\\plugin-forge\\skills'

/** §5.6 官方 !!js 形制（逐字）——baseUrl 语义即 S5 判定物之一 */
const PF_SKILLS_EXPR =
  "!!js process.getBuiltinModule('node:path').join(process.getBuiltinModule('node:path').dirname(process.getBuiltinModule('node:module').createRequire(baseUrl).resolve('@dsh-forge/plugin-forge/package.json')), 'skills')"

const yamlQuote = (v) => `"${v.replace(/\\/g, '\\\\').replace(/"/g, '\\"')}"`

// ── standard.patch.yml 全量镜像行（2026-10-07 自上游 0.2.0-rc.2 逐行转写）──
// includePluginForge：dev 形态含 plugin-forge 增量行（profile.dev workspace 链接在場）；
// packaged 形态不含——试验床 release（faa0152，2026-10-06 11:35）早于 M2 3.4 的 plugin-forge
// 物化，包缺席；plugin-forge 打包机制本身 = M2 3.4 已落地+冒烟验证，非本 spike 判定物。
function mirrorRows({ personaPrefix, skillDirs, toolsubagentExtra, includePluginForge }) {
  const L = []
  L.push('          - id: persona')
  L.push("            name: '@deepseek-ai/dsh-persona'")
  L.push('            config:')
  L.push('              suffix: Your working directory is {{cwd}}.')
  L.push('              prefix: >-')
  for (const line of personaPrefix.split('\n')) L.push(`                ${line}`)
  L.push('          - id: agent-instructions')
  L.push("            name: '@deepseek-ai/dsh-agent-instructions'")
  L.push('            config:')
  L.push('              maxBytes: 65536')
  L.push('          - id: tool-bash')
  L.push("            name: '@deepseek-ai/dsh-tool-bash'")
  L.push('            disabled: !!js process.platform === \'win32\'')
  L.push('          - id: tool-pwsh')
  L.push("            name: '@deepseek-ai/dsh-tool-pwsh'")
  L.push('            disabled: !!js process.platform !== \'win32\'')
  L.push('          - id: tool-fs')
  L.push("            name: '@deepseek-ai/dsh-tool-fs'")
  L.push('          - id: tool-fs-search')
  L.push("            name: '@deepseek-ai/dsh-tool-fs-search'")
  L.push('            config:')
  L.push('              sampleOverCapGlobResults: false')
  L.push('          - id: tool-jobs')
  L.push("            name: '@deepseek-ai/dsh-tool-jobs'")
  L.push('          - id: skill-filesystem')
  L.push("            name: '@deepseek-ai/dsh-skill-filesystem'")
  L.push('            config:')
  L.push('              customSkillDirs:')
  for (const dir of skillDirs) L.push(`                - ${dir}`)
  L.push('          - id: tool-skill')
  L.push("            name: '@deepseek-ai/dsh-tool-skill'")
  L.push('          - id: command-goal')
  L.push("            name: '@deepseek-ai/dsh-command-goal'")
  L.push('          - id: tool-goal')
  L.push("            name: '@deepseek-ai/dsh-tool-goal'")
  // planning 组（plan-mode section 逐字）
  L.push('          - id: planning')
  L.push('            name: cordis:group')
  L.push('            group: true')
  L.push('            isolate:')
  L.push('              planMode: true')
  L.push('            config:')
  L.push('              - id: plan-mode')
  L.push("                name: '@deepseek-ai/dsh-plan-mode'")
  L.push('                config:')
  L.push('                  section: |')
  for (const line of PLAN_MODE_SECTION.split('\n')) L.push(`                    ${line}`)
  // compaction 组
  L.push('          - id: compaction')
  L.push('            name: cordis:group')
  L.push('            group: true')
  L.push('            isolate:')
  L.push('              compaction: true')
  L.push('              toolResultPruner: true')
  L.push('            config:')
  L.push('              - id: compaction-basic')
  L.push("                name: '@deepseek-ai/dsh-compaction-basic'")
  L.push('              - id: command-compact')
  L.push("                name: '@deepseek-ai/dsh-command-compact'")
  L.push('              - id: tool-result-pruner')
  L.push("                name: '@deepseek-ai/dsh-compaction-tool-result-pruner'")
  L.push('                config:')
  L.push('                  thresholdChars: 8192')
  L.push('                  headChars: 4096')
  L.push('                  tailChars: 1024')
  // delegation 组（tool-subagent 行 = M3 worker 派发面实验位）
  L.push('          - id: delegation')
  L.push('            name: cordis:group')
  L.push('            group: true')
  L.push('            isolate:')
  L.push('              workflowEngine: true')
  L.push('            config:')
  L.push('              - id: tool-subagent-control')
  L.push("                name: '@deepseek-ai/dsh-tool-subagent-control'")
  L.push('              - id: tool-subagent-list-agents')
  L.push("                name: '@deepseek-ai/dsh-tool-subagent-control/list-agents'")
  L.push('              - id: tool-subagent')
  L.push("                name: '@deepseek-ai/dsh-tool-subagent'")
  L.push('                config:')
  L.push('                  provider: spawn')
  L.push('                  toolName: subagent')
  L.push('                  modelSelectionSettings: true')
  L.push('                  backgroundMode: continuable')
  for (const line of toolsubagentExtra) L.push(line)
  L.push('              - id: tool-subagent-fork')
  L.push("                name: '@deepseek-ai/dsh-tool-subagent'")
  L.push('                config:')
  L.push('                  provider: fork')
  L.push('                  toolName: subagent_fork')
  L.push('                  backgroundMode: continuable')
  L.push('              - id: tool-subagent-codex')
  L.push("                name: '@deepseek-ai/dsh-tool-subagent'")
  L.push('                disabled: true')
  L.push('                config:')
  L.push('                  provider: codex')
  L.push('                  toolName: subagent_codex')
  L.push('                  backgroundMode: one-shot')
  L.push('                  maxDepth: provider-managed')
  L.push('              - id: tool-subagent-claude-code')
  L.push("                name: '@deepseek-ai/dsh-tool-subagent'")
  L.push('                disabled: true')
  L.push('                config:')
  L.push('                  provider: claude-code')
  L.push('                  toolName: subagent_claude_code')
  L.push('                  backgroundMode: one-shot')
  L.push('                  maxDepth: provider-managed')
  L.push('              - id: workflow-ptc')
  L.push("                name: '@deepseek-ai/dsh-workflow-ptc'")
  L.push('                config:')
  L.push('                  provider: spawn')
  L.push('              - id: tool-workflow')
  L.push("                name: '@deepseek-ai/dsh-tool-workflow'")
  L.push('              - id: tool-ralph')
  L.push("                name: '@deepseek-ai/dsh-tool-ralph'")
  L.push('                disabled: true')
  L.push('                config:')
  L.push('                  subagentProvider: spawn')
  L.push('                  maxRounds: 64')
  L.push('          - id: tool-ask-user')
  L.push("            name: '@deepseek-ai/dsh-tool-ask-user'")
  L.push('          - id: tool-todo')
  L.push("            name: '@deepseek-ai/dsh-tool-todo'")
  L.push('            config:')
  L.push('              allowParallelInProgress: true')
  L.push('          - id: tool-web')
  L.push("            name: '@deepseek-ai/dsh-tool-web'")
  L.push('            config:')
  L.push('              fetch: true')
  L.push('              searchTimeoutMs: 60000')
  L.push('          - id: present')
  L.push("            name: '@deepseek-ai/dsh-tool-present'")
  L.push('          - id: tool-plugin-manager')
  L.push("            name: '@deepseek-ai/dsh-plugin-manager/tools'")
  L.push('            disabled: true')
  // forge 增量行（远征/突击同携核心包——工具半身；skills 经 customSkillDirs 物理挂载）
  if (includePluginForge) {
    L.push('          - id: plugin-forge')
    L.push("            name: '@dsh-forge/plugin-forge'")
  }
  return L
}

/** plan-mode section（standard 逐字，2026-10-07 转写） */
const PLAN_MODE_SECTION = `You are in plan mode. Stay in plan mode until exit_plan_mode succeeds or the user switches the session mode. Imperative language to implement changes means plan the implementation, not execute it. A user's conversational agreement — including an answer confirming something you asked — approves nothing and does not end plan mode; fold the confirmed decision into the plan and submit it through exit_plan_mode.

Explore first. Use non-mutating reads, searches, static analysis, and checks to ground the plan in the actual repository. Do not edit or write files, change configuration, run formatters or code generation that rewrites tracked files, commit, or otherwise carry out the plan. Prefer existing functions and patterns over new machinery.

The tool catalog stays the same across modes for request-cache stability. These plan-mode rules override any later tool description or guidance that suggests using mutation tools; those tools remain listed to keep the tool catalog unchanged. Do not use todo_write to track this planning phase: it tracks implementation after an approved plan, while the plan itself belongs in exit_plan_mode.

Resolve discoverable facts by inspection. Use ask_user_question only for user-owned choices or material ambiguity that inspection cannot answer. Do not ask the user where code lives or how current behavior works when you can find out.

Make the plan decision-complete: state the goal and success criteria; group implementation changes by subsystem; identify public API, schema, and data-flow changes; cover edge cases, failure modes, tests, acceptance criteria, and explicit assumptions. Keep it concise enough to review yet detailed enough that another engineer can implement it without making design decisions.

When ready, call exit_plan_mode with the complete plan markdown, starting with a # title. Make exit_plan_mode the only and final tool call in that assistant response: it presents the plan for approval, and implementation begins only in a later step after approval. Do not paste the final plan as a plain reply or ask "should I proceed?" through prose or ask_user_question. If review rejects it, incorporate the feedback and present again. If the review channel is unavailable or aborted, stay in plan mode and ask the user to switch modes manually; do not proceed to implementation.`

function presetBlock({ rowId, presetId, name, description, order, personaPrefix, skillDirs, toolsubagentExtra, includePluginForge }) {
  const L = []
  L.push(`    - id: ${rowId}`)
  L.push("      name: '@deepseek-ai/dsh-agent-preset'")
  L.push('      config:')
  L.push(`        id: ${presetId}`)
  L.push(`        name: ${yamlQuote(name)}`)
  L.push(`        description: ${yamlQuote(description)}`)
  L.push(`        order: ${order}`)
  L.push('        plugins:')
  L.push(...mirrorRows({ personaPrefix, skillDirs, toolsubagentExtra, includePluginForge }))
  return L
}

function buildOverlay({ form, deny }) {
  const jsForm = form === 'packaged-js' // !!js 仅存于 packaged-js 负对照——dev 形态实测该形制死于
  // ESM-only exports（ERR_PACKAGE_PATH_NOT_EXPORTED ./package.json 子路径缺席，第 8 轮实证）
  const includePluginForge = !form.startsWith('packaged-')
  const pfSkills = includePluginForge ? yamlQuote(PLUGIN_FORGE_SKILLS_DEV) : null
  const coreDir = yamlQuote(FORGE_CORE_DIR)
  const specDir = yamlQuote(FORGE_SPEC_DIR)
  const toolsubagentExtra = []
  if (deny !== undefined && deny.length > 0) {
    toolsubagentExtra.push('                  toolFilter:')
    toolsubagentExtra.push(`                    deny:`)
    for (const d of deny) toolsubagentExtra.push(`                      - ${d}`)
  }
  // packaged 叠层不含 plugin-forge 目录与行（试验床 = pre-3.4 release，包缺席——见 mirrorRows 注）；
  // packaged-js = 负对照：第三目录特置 !!js 表达式（预期 {userData} profile 链不可解析——3.4 复核）
  const expDirs = form === 'packaged-js' ? [coreDir, specDir, PF_SKILLS_EXPR] : pfSkills === null ? [coreDir, specDir] : [coreDir, specDir, pfSkills]
  const blitzDirs = form === 'packaged-js' ? [coreDir, PF_SKILLS_EXPR] : pfSkills === null ? [coreDir] : [coreDir, pfSkills]
  const L = []
  L.push(`# M3 S5/S6 spike 叠层（form=${form}）——registry 默认覆写 + dogfood 模型 + 探针插件 + 远征/突击双预设`)
  L.push(`# 生成物：node overlay.mjs --form ${form}${deny !== undefined ? ` --deny ${deny.join(',')}` : ''}；不进产品结构。`)
  L.push('- id: agent-preset-registry')
  L.push('  config:')
  L.push('    default: expedition')
  // developerTools 门控出厂开启（hero chips 默认隐藏的解法）：ui-settings 行 config 单字段
  // {enabled: volatile boolean}（上游 ui-settings/src/index.ts Config 实核）——产品首启
  // 物化/叠层直接置 true 即开，零 UI 依赖。S5-6 判定物「门控前置」的载体证明。
  L.push('- id: ui-settings')
  L.push('  config:')
  L.push('    enabled: true')
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
  L.push('- insert:')
  L.push(
    ...presetBlock({
      rowId: 'preset-expedition',
      presetId: 'expedition',
      name: '远征模式',
      description: 'M3 spike 远征：standard 全量镜像 + 双技能根（core+spec）+ plugin-forge',
      order: 1,
      personaPrefix: 'You are a coding agent powered by the {{model}} model.\n严谨、全流程、不跳步、证据驱动（M3 spike expedition persona——只谈作风，不谈角色与工具禁令）。',
      skillDirs: expDirs,
      toolsubagentExtra,
      includePluginForge,
    }),
  )
  L.push(
    ...presetBlock({
      rowId: 'preset-blitz',
      presetId: 'blitz',
      name: '突击模式',
      description: 'M3 spike 突击：镜像减 spec 技能根与 spec 增量——L1 物理边界判定物',
      order: 2,
      personaPrefix: 'You are a coding agent powered by the {{model}} model.\n短促突击、直奔要害、单写路径纪律不折扣（M3 spike blitz persona——只谈作风，不谈角色与工具禁令）。',
      skillDirs: blitzDirs,
      toolsubagentExtra,
      includePluginForge,
    }),
  )
  L.push('')
  return L.join('\n')
}

// ── CLI ──
const args = process.argv.slice(2)
const formArg = (() => {
  const i = args.indexOf('--form')
  return i >= 0 ? args[i + 1] : 'dev'
})()
const denyArg = (() => {
  const i = args.indexOf('--deny')
  if (i < 0 || args[i + 1] === undefined || args[i + 1] === '') return undefined
  return args[i + 1].split(',').map((s) => s.trim()).filter((s) => s !== '')
})()
const outArg = (() => {
  const i = args.indexOf('--out')
  return i >= 0 ? args[i + 1] : join(SPIKE_ROOT, 'generated')
})()

const FORMS = ['dev', 'dev-abs', 'dev-tf', 'packaged-js', 'packaged-abs']
if (!FORMS.includes(formArg)) {
  console.error(`未知形态 ${formArg}（可选：${FORMS.join(' | ')}）`)
  process.exit(1)
}
const deny = formArg === 'dev-tf' ? (denyArg ?? ['web']) : denyArg
const content = buildOverlay({ form: formArg, deny })
mkdirSync(outArg, { recursive: true })
const out = join(outArg, `overlay-${formArg}.yml`)
writeFileSync(out, content, 'utf8')
console.log(`[overlay] ${out}（${content.split('\n').length} 行；deny=${JSON.stringify(deny ?? null)}）`)
