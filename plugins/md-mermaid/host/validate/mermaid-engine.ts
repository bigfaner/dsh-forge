// @dsh-forge/md-mermaid/validate —— mermaid 引擎适配器（Node DOM shim + 懒加载 + parse 归一）。
// 校验面专用：securityLevel 'loose'（与渲染面 'strict' 只差标签净化，语法门同一条 parse 抛错路径）。

export type EngineParseResult =
  | { ok: true }
  | { ok: false; line?: number; message: string }

/** mermaid 引擎最小面（依赖直引 mermaid 包，类型本位——不引 mermaid 的类型入口以保持懒加载） */
interface MermaidEngine {
  initialize(config: Record<string, unknown>): void
  parse(text: string): Promise<unknown>
}

// ---- Node DOM shim（局限本适配器内、一次性执行）----
// mermaid（经 DOMPurify 模块级装配与 init 监听）在 Node 下需要最小 DOM 面：
// window=globalThis + Element 桩 + document 桩 + addEventListener 桩（2026-10-13 实证 ~6 行足够 headless parse）。
let shimApplied = false

function ensureNodeDomShim(): void {
  if (shimApplied) return
  shimApplied = true
  const g = globalThis as Record<string, unknown>
  if (typeof g.window === 'undefined') g.window = globalThis
  if (typeof g.Element === 'undefined') g.Element = class Element {}
  if (typeof g.addEventListener === 'undefined') g.addEventListener = () => {}
  if (typeof g.document === 'undefined') {
    const stub = () => ({
      style: {},
      setAttribute: () => {},
      getAttribute: () => null,
      appendChild: () => {},
      addEventListener: () => {},
      removeEventListener: () => {},
    })
    g.document = {
      nodeType: 9,
      createElement: stub,
      createElementNS: stub,
      createTextNode: () => ({}),
      addEventListener: () => {},
      removeEventListener: () => {},
    }
  }
}

// ---- 懒加载唯一径：动态 import + 模块级 promise 缓存 + 单次 initialize ----
let enginePromise: Promise<MermaidEngine> | null = null

export function loadMermaidEngine(): Promise<MermaidEngine> {
  if (!enginePromise) {
    enginePromise = (async () => {
      ensureNodeDomShim()
      const engine = (await import('mermaid')).default as unknown as MermaidEngine
      engine.initialize({ startOnLoad: false, securityLevel: 'loose' })
      return engine
    })()
  }
  return enginePromise
}

// 错误行号提取：jison 解析器错误携带 hash.loc.first_line；退化到 message 内文本。
function extractLine(err: unknown): number | undefined {
  const loc = (err as { hash?: { loc?: { first_line?: number } } })?.hash?.loc
  if (typeof loc?.first_line === 'number' && loc.first_line > 0) return loc.first_line
  const m = /line (\d+)/i.exec(String((err as { message?: string })?.message ?? ''))
  return m ? Number(m[1]) : undefined
}

/** parse 归一：合法 → {ok:true}；非法 → {ok:false, line?, message}（永不抛出） */
export async function parseMermaidSource(source: string): Promise<EngineParseResult> {
  let engine: MermaidEngine
  try {
    engine = await loadMermaidEngine()
  } catch (err) {
    return { ok: false, message: `mermaid 引擎装载失败：${String(err)}` }
  }
  try {
    await engine.parse(source)
    return { ok: true }
  } catch (err) {
    return {
      ok: false,
      line: extractLine(err),
      message: String((err as { message?: string })?.message ?? err).split('\n')[0] ?? String(err),
    }
  }
}
