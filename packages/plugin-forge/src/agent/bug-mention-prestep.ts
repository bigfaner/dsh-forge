// bug mention 发送期展开 pre-step（bug-mention-prestep 提案——零流程直挂，用户裁决 2026-10-15）。
// 缝：官方公开 cordis 事件 'agent/pre-step'（waterfall——dsh-agent runtime-types：payload
// {agent, messages, turn, step, signal}，next() → PreStepDecision（reject | enter+messages），
// 「Reject a proposed step or replace the messages that enter it」）。session-reference 的
// prepareDirectMessages 同径先例：结构化引用块放在引用它的直接消息之后。
//
// 行为（提案已定）：
// ① 扫描直接用户消息文本中的 bug mention——正则双锚定 @[…](bug:<uuid36>)（scheme +
//    uuid 形状，误报面极小）；
// ② 命中 → 台账现查：项目锚 = 会话 cwd→projectId（4.2 绑定表）优先，未解析则注册项目
//    有界遍历（client 侧 ea4fe3be serialize 二段化同口径——单遍首命中即全卡）；
// ③ 查得 → 该消息后追加 <bug bugId=…> 九字段块（summary/bugStatus/errorType?/bugDesc/
//    triggerDesc/expected/actual/suspected?——与 apps/web bug-source serializeBugCard 单源
//    同构：plugin-forge 禁 import core/web，跨面结构判别先例 = ForgeBugsToolFace；块投影
//    在 plugin-forge 内自持镜像）；查无 → 原文不动（占位块都不加——避免伪造上下文）；
// ④ 幂等：消息已含同 bugId 块（真 chip serialize 产物）不追加；多 mention 去重按 id；
// ⑤ fail-soft：监听器内任何异常 → 决策原样放行，绝不阻断发送。
//
// 形态：扫描/投影/取数纯函数 + attachBugMentionPrestep 挂接（ctx.on 防御读取——服务缺席 =
// 不注册 fail-soft，同 forgeSettings/commands reflect 先例；global 注册使任意 agent scope
// waterfall 可达——approval relay 同径）。
import type { BugCard } from '@dsh-forge/contracts'

// ─────────────────────────── 官方面结构化消费面（零上游 import——faces.ts 同纪律） ───────────────────────────

/** pre-step payload 的 agent 消费子面（cwd 读取位 = session.header.cwd，顶层 cwd 兼容位） */
export interface PrestepAgentFace {
  readonly session?: {
    readonly header?: { readonly cwd?: string }
    readonly cwd?: string
  }
}

/** UserMessage 消费子面（role 判别 + content 文本块；展开 = 结构拷贝新消息对象） */
export interface PrestepUserMessageFace {
  readonly role?: unknown
  readonly content?: readonly unknown[]
  readonly [key: string]: unknown
}

/** pre-step payload 消费子面 */
export interface PrestepPayloadFace {
  readonly agent?: PrestepAgentFace
}

/**
 * PreStepDecision 消费子面（dsh-agent runtime-types 同形）：
 * reject = 拒绝该步；enter = 以（可能替换的）messages 进入。
 */
export type PreStepDecisionFace =
  | { readonly kind: 'reject' }
  | { readonly kind: 'enter'; readonly messages: readonly PrestepUserMessageFace[]; readonly startsRequestSeries?: true }

/**
 * dsh ctx.on 事件注册收窄面（官方 Context.on——'agent/pre-step' waterfall 单事件）：
 * 返回注销器；options.global 使任意 agent scope 可达（apps/host approval relay 同径）。
 */
export interface PreStepRegisterFace {
  on?(
    event: 'agent/pre-step',
    listener: (payload: PrestepPayloadFace, next: () => Promise<PreStepDecisionFace>) => Promise<PreStepDecisionFace>,
    options?: { readonly global?: boolean },
  ): () => void
}

// ─────────────────────────── 取数面（core createBugsService 结构兼容判别） ───────────────────────────

/** bug 台账读面（ForgeBugsToolFace.listBugs 收窄——core listBugs 结构兼容，ListBugsQuery 子集） */
export interface BugMentionLookupFace {
  listBugs(q: { readonly projectId: string }): Promise<readonly BugCard[]>
}

/** 注册项目枚举面（ProjectService.listProjects 收窄——有界遍历的项目全集源） */
export interface BugMentionProjectsFace {
  listProjects(): Promise<readonly { readonly id: string }[]>
}

/** 挂接依赖（index.ts 装配注入——resolver 复用 tools/session.ts 绑定表产物） */
export interface BugMentionPrestepDeps {
  bugs: BugMentionLookupFace
  projects: BugMentionProjectsFace
  resolveProjectId: (cwd: string) => string | undefined
}

// ─────────────────────────── ① 扫描（正则双锚定纯函数） ───────────────────────────

/** uuid36 形状源（单源正则拼装面——测试钉住） */
export const UUID36_PATTERN_SOURCE =
  '[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}'

const BUG_MENTION_RE = new RegExp(`@\\[[^\\]]*\\]\\(bug:(${UUID36_PATTERN_SOURCE})\\)`, 'g')

/**
 * 扫描文本中的 bug mention → 去重 bugId 序（首现顺位）。双锚定 = `bug:` scheme +
 * uuid36 形状，短号/缺 scheme/非 bug 链接不命中。
 */
export function scanBugMentions(text: string): string[] {
  const ids: string[] = []
  const seen = new Set<string>()
  const re = new RegExp(BUG_MENTION_RE.source, BUG_MENTION_RE.flags)
  for (let m = re.exec(text); m !== null; m = re.exec(text)) {
    const id = m[1]
    if (id === undefined) continue
    if (!seen.has(id)) {
      seen.add(id)
      ids.push(id)
    }
  }
  return ids
}

/** 幂等判别：文本已含该 bugId 的 <bug> 块（真 chip serialize 产物同形） */
export function hasBugBlock(text: string, bugId: string): boolean {
  return text.includes(`<bug bugId="${bugId}"`)
}

/** 消息全文（content 文本块拼接——幂等判别与扫描的统一读面） */
function messageTextOf(message: PrestepUserMessageFace): string {
  if (!Array.isArray(message.content)) return ''
  const parts: string[] = []
  for (const block of message.content) {
    if (typeof block === 'object' && block !== null && (block as { type?: unknown }).type === 'text') {
      const text = (block as { text?: unknown }).text
      if (typeof text === 'string') parts.push(text)
    }
  }
  return parts.join('\n')
}

// ─────────────────────────── ③ 投影（九字段块——apps/web serializeBugCard 自持镜像） ───────────────────────────

/**
 * BugCard → 结构化字段块。与 apps/web bug-source serializeBugCard 单源同构（字段序：
 * summary/bugStatus/errorType?/bugDesc/triggerDesc/expected/actual/suspected?；可空键
 * 缺席不出键；两空格缩进）。跨面禁 import——本镜像自持，漂移由块结构测试钉住。
 */
export function serializeBugCardBlock(bug: BugCard): string {
  const lines: string[] = [`<bug bugId="${bug.bugId}">`]
  const field = (key: string, value: string | undefined): void => {
    if (value !== undefined && value !== '') lines.push(`  ${key}: ${value}`)
  }
  field('summary', bug.summary)
  field('bugStatus', bug.bugStatus)
  field('errorType', bug.errorType)
  field('bugDesc', bug.bugDesc)
  field('triggerDesc', bug.triggerDesc)
  field('expected', bug.expected)
  field('actual', bug.actual)
  field('suspected', bug.suspected)
  lines.push('</bug>')
  return lines.join('\n')
}

// ─────────────────────────── ② 取数（项目锚定 + 有界遍历） ───────────────────────────

/** 注册项目全集 → projectId 序（fail-soft：枚举失败 = 空集，不遍历不外抛） */
async function registeredProjectIds(projects: BugMentionProjectsFace): Promise<string[]> {
  try {
    const rows = await projects.listProjects()
    return rows.map((row) => row.id).filter((id): id is string => typeof id === 'string')
  } catch {
    return []
  }
}

/**
 * 台账现查：会话 cwd→projectId 绑定优先（单项目查询）；未解析（或锚定项目未命中——
 * 跨项目洞）则注册项目有界遍历（单遍首命中即全卡——client 侧 ea4fe3be 同口径）。
 * fail-soft：任何单项目查询失败 = 跳过继续；全程查无 = undefined（原文不动）。
 */
async function lookupBug(deps: BugMentionPrestepDeps, bugId: string, cwd: string | undefined): Promise<BugCard | undefined> {
  const anchored = cwd !== undefined ? deps.resolveProjectId(cwd) : undefined
  const projectIds = anchored !== undefined ? [anchored] : await registeredProjectIds(deps.projects)
  for (const projectId of projectIds) {
    try {
      const bugs = await deps.bugs.listBugs({ projectId })
      const hit = bugs.find((bug) => bug !== null && typeof bug === 'object' && bug.bugId === bugId)
      if (hit !== undefined) return hit
    } catch {
      // fail-soft：单项目台账不可用 = 跳过（下一个项目/终局查无）
    }
  }
  return undefined
}

// ─────────────────────────── 展开核心（消息变换——零改动返回原引用） ───────────────────────────

/**
 * 对直接用户消息做 bug mention 展开：命中且台账在场 → 消息 content 尾部追加该 bug 的
 * 九字段块（原文 mention 保留——只追加不替换；同 id 多 mention 只追加一块；已含同 id
 * 块 = 幂等跳过且零取数）。查无/无 mention = 原样返回**同一引用**（零改动零开销）。
 * 非 user 角色消息不扫描。
 */
export async function expandBugMentions(
  messages: readonly PrestepUserMessageFace[],
  deps: BugMentionPrestepDeps,
  cwd: string | undefined,
): Promise<readonly PrestepUserMessageFace[]> {
  if (!Array.isArray(messages)) return messages
  let result = messages
  for (let i = 0; i < result.length; i++) {
    const message = result[i]
    if (typeof message !== 'object' || message === null) continue
    if (message.role !== 'user') continue
    const text = messageTextOf(message)
    if (text === '') continue
    const pending = scanBugMentions(text).filter((bugId) => !hasBugBlock(text, bugId))
    if (pending.length === 0) continue
    const blocks: string[] = []
    for (const bugId of pending) {
      const bug = await lookupBug(deps, bugId, cwd)
      if (bug !== undefined) blocks.push(serializeBugCardBlock(bug))
    }
    if (blocks.length === 0) continue // 查无此 bug = 原文不动（不伪造上下文）
    if (result === messages) result = messages.slice()
    result[i] = {
      ...message,
      content: [
        ...(Array.isArray(message.content) ? message.content : []),
        { type: 'text', text: blocks.join('\n\n') },
      ],
    }
  }
  return result
}

// ─────────────────────────── ⑤ 挂接（waterfall + fail-soft + global） ───────────────────────────

/** 会话 cwd 读取位（payload.agent.session.header.cwd——顶层 cwd 结构兼容位） */
function cwdOf(payload: PrestepPayloadFace): string | undefined {
  return payload?.agent?.session?.header?.cwd ?? payload?.agent?.session?.cwd
}

/**
 * 挂接 'agent/pre-step' waterfall：next() 先行取得官方决策，enter 态对直接用户消息做
 * bug mention 展开（替换 messages 进决策）；reject 原样透传。展开面任何异常 = 决策原样
 * 放行（fail-soft——不阻断发送，不影响官方 session-reference 等既有 pre-step 链）。
 * global 注册（任意 agent scope waterfall 可达——approval relay 同径）。
 * face.on 缺席/非函数 = 不注册（返回 undefined）；注册抛错由装配方 try/catch 收口。
 */
export function attachBugMentionPrestep(
  face: PreStepRegisterFace,
  deps: BugMentionPrestepDeps,
): (() => void) | undefined {
  if (typeof face.on !== 'function') return undefined
  const listener = async (
    payload: PrestepPayloadFace,
    next: () => Promise<PreStepDecisionFace>,
  ): Promise<PreStepDecisionFace> => {
    const decision = await next()
    if (decision.kind !== 'enter') return decision
    try {
      const messages = await expandBugMentions(decision.messages, deps, cwdOf(payload))
      if (messages === decision.messages) return decision
      return {
        kind: 'enter',
        messages,
        ...(decision.startsRequestSeries === true ? { startsRequestSeries: true as const } : {}),
      }
    } catch {
      return decision // fail-soft：展开故障 = 原文放行
    }
  }
  return face.on('agent/pre-step', listener, { global: true })
}
