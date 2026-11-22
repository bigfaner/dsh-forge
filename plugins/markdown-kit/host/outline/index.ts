// getOutline 纯逻辑单源（定位：业务——md 标题层级树提取全部语义在此，壳零业务逻辑）：
//   - ATX 标题（#~######）解析为嵌套树（title/level/line 行号锚 1-based/children）；
//   - ``` 围栏代码块内 # 行零误判（围栏开合状态机跳过）；
//   - setext 下划线风格（===/---）不支持时显式标注（非静默跳过）——标注行号集合
//     随结果返回，壳层呈现为 setextUnsupportedLines；
//   - depth 截断：level > depth 的节点裁剪，剩余节点按原序重嵌套。
// 零 IO、零 dsh 依赖——fs 读取与 cwd 锚在壳层（tools/get-outline.ts 注入缝）。
/** 标题层级树节点（契约 GO-1 输出面——children 恒在场，空数组 = 叶） */
export interface OutlineNode {
  readonly title: string
  readonly level: 1 | 2 | 3 | 4 | 5 | 6
  /** 1-based 行号锚（源文档中的真实行） */
  readonly line: number
  readonly children: OutlineNode[]
}

/** 提取结果（树 + setext 显式不支持标注——后者仅在有 setext 样式行时在场） */
export interface OutlineResult {
  readonly nodes: OutlineNode[]
  /** 检测到的 setext 下划线标题文本行号（1-based，升序）——不支持语义的显式标注 */
  readonly setextUnsupportedLines?: number[]
}

export interface OutlineParseOptions {
  /** 截断层级（只保留 level <= depth 的节点）——缺省全深度 */
  readonly depth?: number
}

/** ATX 标题行判别（# 开头 1~6 个 # + 空格/行尾——####### 或 #foo 不是标题） */
const ATX_PATTERN = /^(#{1,6})\s+(.*)$/

/** setext 下划线判别：=== 一档（h1）；--- 需 ≥2 连字符（单 `-` 是列表项不误判） */
function setextUnderlineLevel(trimmed: string): 1 | 2 | undefined {
  if (/^=+$/.test(trimmed)) return 1
  if (/^-{2,}$/.test(trimmed)) return 2
  return undefined
}

/**
 * 纯文本扫描：逐行收集真实标题（跳过 ``` 围栏内一切行），同步记录 setext
 * 下划线标题文本行——单趟扫描，行号即锚。
 */
function scanHeadings(doc: string): { headings: Array<{ title: string; level: 1 | 2 | 3 | 4 | 5 | 6; line: number }>; setextLines: number[] } {
  const lines = doc.split(/\r\n|\n/)
  const headings: Array<{ title: string; level: 1 | 2 | 3 | 4 | 5 | 6; line: number }> = []
  const setextLines: number[] = []
  let inFence = false
  for (let i = 0; i < lines.length; i++) {
    const raw = lines[i]
    if (raw === undefined) continue
    const trimmed = raw.trim()
    if (trimmed.startsWith('```')) {
      inFence = !inFence
      continue
    }
    if (inFence) continue
    const atx = ATX_PATTERN.exec(trimmed)
    if (atx !== null) {
      headings.push({ title: atx[2]!.trim(), level: atx[1]!.length as 1 | 2 | 3 | 4 | 5 | 6, line: i + 1 })
      continue
    }
    const prev = i > 0 ? lines[i - 1] : undefined
    if (prev === undefined) continue
    const prevTrimmed = prev.trim()
    if (trimmed !== '' && !trimmed.startsWith('#') && prevTrimmed !== '' && !prevTrimmed.startsWith('#') && setextUnderlineLevel(prevTrimmed) === undefined && setextUnderlineLevel(trimmed) !== undefined) {
      setextLines.push(i + 1) // 下划线行号（1-based）——不支持语义的显式标注锚
    }
  }
  return { headings, setextLines }
}

/**
 * 平铺标题序列 → 嵌套树：栈式回挂——新节点挂到栈中最近一个 level 更小的节点；
 * 跳级（h1 直接跟 h3）不报错，h3 挂到 h1（宽松嵌套，不丢节点）。
 */
function buildTree(headings: Array<{ title: string; level: 1 | 2 | 3 | 4 | 5 | 6; line: number }>): OutlineNode[] {
  const roots: OutlineNode[] = []
  const stack: OutlineNode[] = []
  for (const h of headings) {
    const node: OutlineNode = { title: h.title, level: h.level, line: h.line, children: [] }
    while (stack.length > 0 && (stack[stack.length - 1]?.level ?? 0) >= h.level) stack.pop()
    const parent = stack[stack.length - 1]
    if (parent === undefined) roots.push(node)
    else parent.children.push(node)
    stack.push(node)
  }
  return roots
}

/**
 * 提取 md 文档标题层级树（单源执行体——壳层只传纯文本与可选项）。
 * depth 在场 = 只保留 level <= depth 的节点后按原序重嵌套（双向截断判决锚）。
 */
export function parseMarkdownOutline(doc: string, options: OutlineParseOptions = {}): OutlineResult {
  const { headings, setextLines } = scanHeadings(doc)
  const kept = options.depth === undefined ? headings : headings.filter((h) => h.level <= options.depth!)
  return {
    nodes: buildTree(kept),
    ...(setextLines.length > 0 ? { setextUnsupportedLines: setextLines } : {}),
  }
}

/** 树 → 缩进文本（output.render 纯投影用——模型可读形态） */
export function renderOutlineTree(nodes: readonly OutlineNode[]): string {
  const lines: string[] = []
  const walk = (list: readonly OutlineNode[], depth: number): void => {
    for (const n of list) {
      lines.push(`${'  '.repeat(depth)}${'#'.repeat(n.level)} ${n.title} (line ${n.line})`)
      walk(n.children, depth + 1)
    }
  }
  walk(nodes, 0)
  return lines.join('\n')
}
