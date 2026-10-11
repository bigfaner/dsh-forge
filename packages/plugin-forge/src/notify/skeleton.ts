// notify · 叙述骨架机械（S4 纯模块——不依赖循环；notification-samples.md「统一骨架与
// 文案原则」段 + decisions #24/#25/#27）。三件机械：
// ① key: val 单冒号格式——值内零冒号由 sanitizeValue 机械保证（冒号一律净化为全角逗号，
//    不与键冒号混淆——decisions #27③）；
// ② 「下一步动作:」单行封闭两值——`无` / `提示用户"<指令文本>"`（动作宾语在用户侧，
//    agent 只做转达——防消息→执行→消息无限循环，decisions #27④；样例 ⑬ 的
//    「，并在问询中决定」为该封闭族的唯一终结后缀）；
// ③ 机制词黑名单——「处置代理/宿主循环/adopt/退避/follow-up/收口」零进消息面（#25：
//    处置决策用户视角呈现，机制细节留 blueprint/decisions）。
// 纯文本面：零 I/O、零上游依赖；validateNarrative 供测试锚与调用方自检共用。
// 通道无关（decisions #28——文案规格对 notice/followup 两通道同一套）。

/** 值内冒号净化（ASCII 与全角冒号 → 全角逗号） */
export function sanitizeValue(value: string): string {
  return value.replaceAll(':', '，').replaceAll('：', '，')
}

/** key: val 单行（值经净化——值内零冒号的机械保证点） */
export function line(key: string, value: string): string {
  return `${key}: ${sanitizeValue(value)}`
}

/** 类型行（decisions #25②——`[forge·X]` 前缀与首个 key: val 同物理行） */
export function typeLine(badge: string, key: string, value: string): string {
  return `[forge·${badge}] ${line(key, value)}`
}

/** 下一步动作值（封闭两值形状——非两值不可构造，decisions #27④） */
export type NextAction =
  | { readonly kind: 'none' }
  | { readonly kind: 'prompt'; readonly instruction: string; readonly alsoInquiry?: boolean }

/** 无需任何处理（封闭值一） */
export const NEXT_ACTION_NONE: NextAction = { kind: 'none' }

/** 提示用户"<指令文本>"（封闭值二——宾语定向用户侧；alsoInquiry = 样例 ⑬ 的问询终结后缀） */
export function nextActionPromptUser(instruction: string, options: { alsoInquiry?: boolean } = {}): NextAction {
  return { kind: 'prompt', instruction, ...(options.alsoInquiry === true ? { alsoInquiry: true } : {}) }
}

/** 下一步动作行渲染 */
export function nextActionLine(action: NextAction): string {
  if (action.kind === 'none') return line('下一步动作', '无')
  const suffix = action.alsoInquiry === true ? '，并在问询中决定' : ''
  return line('下一步动作', `提示用户"${sanitizeValue(action.instruction)}"${suffix}`)
}

/** 下一步动作封闭值校验模式（枚举测试锚；运行期 validateNarrative 复用） */
export const NEXT_ACTION_PATTERN = /^无$|^提示用户"[^"]*"(，并在问询中决定)?$/

/** 机制词黑名单（decisions #25/#27——ASCII 词大小写不敏感） */
export const MECHANISM_WORDS: readonly string[] = [
  '处置代理',
  '宿主循环',
  'adopt',
  '退避',
  'follow-up',
  'followup',
  '收口',
]

/** 机制词扫描（返回命中的词清单——空数组 = 消息面干净） */
export function findMechanismWords(text: string): readonly string[] {
  const folded = text.toLowerCase()
  return MECHANISM_WORDS.filter((word) => folded.includes(word.toLowerCase()))
}

const KEY_LINE_RE = /^([^:：]+): (.*)$/

/** reason 摘要截断（decisions #24——reason 全文只进裁决问询，叙述面仅摘要） */
export const REASON_SUMMARY_MAX_CHARS = 80

export function summarizeReason(reason: string, maxLength = REASON_SUMMARY_MAX_CHARS): string {
  const firstLine = (reason.split('\n')[0] ?? '').trim()
  const flat = firstLine !== '' ? firstLine : reason.trim().replaceAll('\n', ' ')
  return flat.length > maxLength ? `${flat.slice(0, maxLength)}……` : flat
}

/**
 * 叙述骨架校验（每条叙述的机械门；返回问题清单——空数组 = 合法）：
 * 首行带 `[forge·X]` 类型行前缀；每行 key: val 单冒号且值内零冒号；
 * 「下一步动作:」恰一行、为末行、值取封闭两值；机制词零出现。
 */
export function validateNarrative(text: string): readonly string[] {
  const problems: string[] = []
  if (!text.startsWith('[forge·')) problems.push('首行缺 [forge·X] 类型行前缀')
  const lines = text.split('\n')
  const nextActionIndexes: number[] = []
  lines.forEach((raw, index) => {
    const match = KEY_LINE_RE.exec(raw)
    if (match === null) {
      problems.push(`L${index + 1}: 非 key: val 单冒号行`)
      return
    }
    const value = match[2] ?? ''
    if (value.includes(':') || value.includes('：')) problems.push(`L${index + 1}: 值内出现冒号`)
    if (raw.startsWith('下一步动作:')) nextActionIndexes.push(index)
  })
  const last = lines.length - 1
  if (nextActionIndexes.length !== 1) {
    problems.push('「下一步动作:」行必须恰一行')
  } else if (nextActionIndexes[0] !== last) {
    problems.push('「下一步动作:」行必须为末行')
  } else {
    const value = KEY_LINE_RE.exec(lines[last] ?? '')?.[2] ?? ''
    if (!NEXT_ACTION_PATTERN.test(value)) problems.push(`「下一步动作」值越出封闭两值: ${value}`)
  }
  for (const word of findMechanismWords(text)) problems.push(`机制词出现: ${word}`)
  return problems
}
