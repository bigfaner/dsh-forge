// boot overlay 生成（4.2；定位：基础）——产品插件行 config 的装配期注入面。
// 动机：core 插件 dbFile 与 knowledge 插件 bindingsFile 均为应用数据目录派生的
// 绝对路径（e2e 隔离 userData 逐次变化、packaged 形态随安装机器变化）——静态
// profile 模板（首启落地幂等不重写）无法承载；runProfile 的 patchFiles 叠层
// （用户层之后应用，按 row id 整体替换 config）正是装配期覆盖缝。
// 产物：{userData}/boot-overlay.yml（每启重写，非用户层状态）。
import { mkdirSync, writeFileSync } from 'node:fs'
import { dirname } from 'node:path'

/** overlay 生成输入（两路径均绝对路径——main 侧 resolveHostPaths 产出） */
export interface BootOverlayInput {
  /** core 插件 dbFile（应用状态库） */
  readonly stateDb: string
  /** knowledge 插件 bindingsFile（会话 cwd → projectId 绑定表） */
  readonly bindingsFile: string
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
    '- id: dsh-forge-knowledge',
    '  config:',
    `    bindingsFile: ${yamlQuote(input.bindingsFile)}`,
    '',
  ].join('\n')
}

/** 生成并落地 overlay，返回其路径（runProfile patchFiles 消费） */
export function writeBootOverlay(target: string, input: BootOverlayInput): string {
  mkdirSync(dirname(target), { recursive: true })
  writeFileSync(target, renderBootOverlay(input), 'utf8')
  return target
}
