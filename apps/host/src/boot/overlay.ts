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
// 产物：{userData}/boot-overlay.yml（每启重写，非用户层状态）。
import { mkdirSync, writeFileSync } from 'node:fs'
import { dirname } from 'node:path'

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
  /** 真 home 凭据文档桥（fix-26：在场即给 credentials 行注 config.path——官方
   *  resolveSpec 显式 path 优先于 home 拼接；缺席 = e2e/测试隔离态不桥） */
  readonly credentialsPath?: string
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
    ...(input.credentialsPath !== undefined
      ? ['- id: credentials', '  config:', `    path: ${yamlQuote(input.credentialsPath)}`]
      : []),
    '- id: ui-settings-general',
    '  config:',
    `    welcomeNoticeVersion: ${yamlQuote(WELCOME_NOTICE_ACK_VERSION)}`,
    '',
  ].join('\n')
}

/** 生成并落地 overlay，返回其路径（runProfile patchFiles 消费） */
export function writeBootOverlay(target: string, input: BootOverlayInput): string {
  mkdirSync(dirname(target), { recursive: true })
  writeFileSync(target, renderBootOverlay(input), 'utf8')
  return target
}
