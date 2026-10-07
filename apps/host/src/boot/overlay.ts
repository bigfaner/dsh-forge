// boot overlay 生成（4.2；定位：基础）——产品插件行 config 的装配期注入面。
// 动机：core 插件 dbFile 与 knowledge 插件 bindingsFile 均为应用数据目录派生的
// 绝对路径（e2e 隔离 userData 逐次变化、packaged 形态随安装机器变化）——静态
// profile 模板（首启落地幂等不重写）无法承载；runProfile 的 patchFiles 叠层
// （用户层之后应用，按 row id 整体替换 config）正是装配期覆盖缝。
// fix-12：官方首启「预览版说明」等值预确认入同一缝——产品宿主形态下 welcome ack
// 写路径被拒（settings/rejected：dsh-app-boot 模块二象性致 profile reload 失败，
// 见 fix-12 记录；该二象性已由 fix-20 统一实例修复——boot-chain.ts，本行预确认
// 仍保留为产品口径：非官方桌面分发面预置官方当前版本常量即「已确认」），模态
// 关不掉阻断 fresh 用户；说明不再出现（版本随上游 pin 冻结——pin 单测机械核查）。
// fix-26：凭据桥入同一缝——dsh-base credentials 行注 config.path 指真 home
// {homedir}/.dsh/.credentials.yaml（官方 resolveSpec 显式 path 优先缝），数据走隔离
// dshHome 而凭据留真 home（单一真相源，原生 dsh 同步可见/可改；e2e 隔离态缺席不桥）。
// M2 3.4 增三行：core 行增 tasksHome（M2 派生根注入——四域服务装配门）；plugin-forge
// 行 bindingsFile（Interface 8 cwd 路由数据缝——与 knowledge 同一 {wsPath,projectId}
// 表文件，生产端 = ipc/bindings.ts 刷新面单源）；skill-filesystem 行 customSkillDirs
// （plugin-forge skills 物理挂载——静态模板无法承载形态化绝对路径：dev = workspace
// 链接、packaged = runtime/node_modules 邻接，故与 dbFile/bindingsFile 同入装配期缝；
// 官方 cordis 预设的 !!js 表达式形制在打包形态不可解析——baseUrl 只见 {userData}
// profile 链，无 installAnchor BFS）。
// M3 3.7 预设装配：cordis/expedition/blitz 三底稿（apps/host/src/profile/presets/）每启
// 注行（行所有权 = 产品工件——用户不可经 UI 改组合；ui-settings 开关行走首启预置让位
// 用户，两径不混）。customSkillDirs 物化分叉：占位符解析为当形态绝对路径（dev = repo /
// packaged = resources 物化路径）；!!js 全形态死刑（spike S5-4 判决反转）——物化输出零
// 表达式残留（平台门行就地求值具体布尔，路径 only 绝对路径）。
// 产物：{userData}/boot-overlay.yml（每启重写，非用户层状态）。
import { mkdirSync, writeFileSync } from 'node:fs'
import { dirname } from 'node:path'
import type { PresetPatches } from '../profile/presets.js'

/**
 * 官方首启「预览版说明」确认版本（ui-settings-models `WELCOME_NOTICE_VERSION`
 * 精确等值比对，0.2.0-rc.2 实测值）。上游 bump 即失效——overlay pin 单测读取
 * profile.dev vendored 副本内常量断言等值，升级窗口机械核查。
 */
export const WELCOME_NOTICE_ACK_VERSION = '2026-09-28.1'

/** overlay 生成输入（路径均绝对路径——main 侧 resolveHostPaths 产出） */
export interface BootOverlayInput {
  /** core 插件 dbFile（应用状态库） */
  readonly stateDb: string
  /** knowledge 插件 bindingsFile（会话 cwd → projectId 绑定表） */
  readonly bindingsFile: string
  /** M2 派生根（3.4：core 行 config.tasksHome 注入——缺席 = M2 四域整体降级） */
  readonly tasksHome?: string
  /** plugin-forge skills 物理挂载目录（3.4：skill-filesystem 行 customSkillDirs 注入；
   *  缺席 = 解析失败 fail-soft 不注入——技能面降级，tools 半身照常） */
  readonly skillsDir?: string
  /** 真 home 凭据文档桥（fix-26：在场即给 credentials 行注 config.path——官方
   *  resolveSpec 显式 path 优先于 home 拼接；缺席 = e2e/测试隔离态不桥） */
  readonly credentialsPath?: string
  /** M3 预设装配（3.7）：三底稿 + 技能目录物化锚（缺席 = 预设面整体不注行 fail-soft） */
  readonly presets?: PresetOverlayInput
}

/** 预设装配输入（3.7）：三底稿全文 + customSkillDirs 双目录物化锚 */
export interface PresetOverlayInput extends PresetPatches {
  /** plugin-forge skills 当形态绝对路径（customSkillDirs[core]；缺席 = 剔除该目录行） */
  readonly coreSkillsDir?: string
  /** plugin-forge-spec skills 当形态绝对路径（customSkillDirs[spec]；缺席 = 剔除
   *  ——spec 技能面降级 fail-soft，突击/blitz 本就物理不含） */
  readonly specSkillsDir?: string
}

/** 底稿占位符（customSkillDirs 项——物化替换为当形态绝对路径双引号标量） */
const PRESET_SKILL_DIR_TOKENS = {
  core: '{{plugin-forge-skills}}',
  spec: '{{plugin-forge-spec-skills}}',
} as const

/**
 * 平台门行就地求值表（上游 standard 镜像逐字转写的 `disabled: !!js` 行——物化时替换为
 * 具体布尔；!!js 全形态死刑 = 物化输出零表达式残留）。求值在渲染机（host 侧）执行，
 * 与 loader 侧求值语义等价（同 process 平台）。
 */
const PLATFORM_GATE_ROWS: ReadonlyArray<{ readonly match: string; readonly value: () => string }> = [
  { match: "disabled: !!js process.platform === 'win32'", value: () => String(process.platform === 'win32') },
  { match: "disabled: !!js process.platform !== 'win32'", value: () => String(process.platform !== 'win32') },
]

/** 底稿行物化：占位符目录行 → 绝对路径（缺席剔除）；平台门行 → 具体布尔 */
function materializePresetLines(patch: string, input: PresetOverlayInput): string[] {
  const out: string[] = []
  for (const line of patch.split('\n')) {
    if (/^\s*#/.test(line)) continue // 底稿头注释不进 overlay（行块本体零注释）
    const trimmed = line.trim()
    const coreToken = `- "${PRESET_SKILL_DIR_TOKENS.core}"`
    const specToken = `- "${PRESET_SKILL_DIR_TOKENS.spec}"`
    if (trimmed === coreToken) {
      if (input.coreSkillsDir !== undefined) out.push(`${line.slice(0, line.length - trimmed.length)}- ${yamlQuote(input.coreSkillsDir)}`)
      continue
    }
    if (trimmed === specToken) {
      if (input.specSkillsDir !== undefined) out.push(`${line.slice(0, line.length - trimmed.length)}- ${yamlQuote(input.specSkillsDir)}`)
      continue
    }
    const gate = PLATFORM_GATE_ROWS.find((row) => row.match === trimmed)
    if (gate !== undefined) {
      out.push(`${line.slice(0, line.length - trimmed.length)}disabled: ${gate.value()}`)
      continue
    }
    out.push(line)
  }
  return collapseEmptyCustomSkillDirs(out)
}

/** 空目录列表收敛：customSkillDirs 全剔后残留空块（config: + customSkillDirs:）整块移除
 *  ——skill-filesystem 行回归上游镜像裸形态（无 config），schema 面零残留） */
function collapseEmptyCustomSkillDirs(lines: string[]): string[] {
  const out: string[] = []
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]!
    const dirsAt = /^(\s*)customSkillDirs:\s*$/.exec(line)
    if (dirsAt !== null) {
      const itemIndent = dirsAt[1]! + '  '
      let j = i + 1
      while (j < lines.length && lines[j]!.startsWith(itemIndent) && lines[j]!.trimStart().startsWith('- ')) j++
      if (j > i + 1) {
        out.push(line) // 有存活项——保留
        continue
      }
      // 空列表：连同紧邻的 config: 行一并剔除（仅当紧邻前导是 config:——底稿形状内建）
      if (out.length > 0 && /^(\s*)config:\s*$/.test(out[out.length - 1]!)) out.pop()
      continue
    }
    out.push(line)
  }
  return out
}

/** 底稿物化全文（行集合——尾空行收敛；调用方展平入 overlay） */
export function materializePresetPatch(patch: string, input: PresetOverlayInput): string {
  const lines = materializePresetLines(patch, input)
  while (lines.length > 0 && lines[lines.length - 1] === '') lines.pop()
  return lines.join('\n')
}

/** YAML 值转义（双引号标量——路径含反斜杠/冒号，单引号与裸标量均不稳） */
function yamlQuote(value: string): string {
  return `"${value.replace(/\\/g, '\\\\').replace(/"/g, '\\"')}"`
}

/** overlay 文本（纯函数——单测锚定逐字节形状） */
export function renderBootOverlay(input: BootOverlayInput): string {
  return [
    '# dsh-forge boot overlay（host 每启重写——产品插件行 config 注入；非用户层状态）',
    '- id: dsh-forge-core',
    '  config:',
    `    dbFile: ${yamlQuote(input.stateDb)}`,
    ...(input.tasksHome !== undefined ? [`    tasksHome: ${yamlQuote(input.tasksHome)}`] : []),
    '- id: dsh-forge-knowledge',
    '  config:',
    `    bindingsFile: ${yamlQuote(input.bindingsFile)}`,
    '- id: dsh-forge-plugin-forge',
    '  config:',
    `    bindingsFile: ${yamlQuote(input.bindingsFile)}`,
    ...(input.skillsDir !== undefined
      ? [
          // disabled:false 必须显式——官方 dsh-web-app 层禁用了主机面 skill-filesystem 行
          // （presets own local discovery），patch 行未写字段沿用前层定义（5.4 dogfood 实证：
          // 缺席时行保持禁用，customSkillDirs 全局层不注册，会话技能面恒缺席）。
          // includeDefaultRoots:false = 纯部署级 provider（只贡献 customSkillDirs，项目/用户
          // 根发现归 preset 层——与 web-app「presets own local discovery」架构注释一致）。
          '- id: skill-filesystem',
          '  disabled: false',
          '  config:',
          '    includeDefaultRoots: false',
          '    customSkillDirs:',
          `      - ${yamlQuote(input.skillsDir)}`,
        ]
      : []),
    ...(input.credentialsPath !== undefined
      ? ['- id: credentials', '  config:', `    path: ${yamlQuote(input.credentialsPath)}`]
      : []),
    '- id: ui-settings-general',
    '  config:',
    `    welcomeNoticeVersion: ${yamlQuote(WELCOME_NOTICE_ACK_VERSION)}`,
    // M3 预设装配（3.7）：registry 覆写 + 远征/突击双预设行——每启注行产品工件
    //（customSkillDirs 已物化当形态绝对路径；预设组合用户不可经 UI 改）
    ...(input.presets !== undefined
      ? [
          '# ── M3 预设装配（3.7）：registry default 覆写 + 双预设行（boot overlay 每启注行）──',
          ...materializePresetPatch(input.presets.cordis, input.presets).split('\n'),
          ...materializePresetPatch(input.presets.expedition, input.presets).split('\n'),
          ...materializePresetPatch(input.presets.blitz, input.presets).split('\n'),
        ]
      : []),
    '',
  ].join('\n')
}

/** 生成并落地 overlay，返回其路径（runProfile patchFiles 消费） */
export function writeBootOverlay(target: string, input: BootOverlayInput): string {
  mkdirSync(dirname(target), { recursive: true })
  writeFileSync(target, renderBootOverlay(input), 'utf8')
  return target
}
