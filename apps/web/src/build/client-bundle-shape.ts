// forge-client 产物形状断言（定位：装配——vite pin 的纯函数面，vite.config.ts 消费）。
// 形态契约（上游 client bundle 注册面，S2 清单 pin）：forge-client.js 必须是零 import/export
// 的自含 classic script（模块系统 defaultLoadBundle 以 <script> 装载求值即注册）。
// 破坏形态两源（fix 记录 2026-10-11）：① 共享 chunk 拆分 → 入口 chunk 头部
// `import{n}from"./assets/…"`（413e3dd）② 依赖被外部化 → 产物内残留 import 语句。
// 检测面 = 结构断言（1.46 改版）：chunk 数 / 外部 import / 导出名三facet——词素级正则扫描
// 会命中依赖携带的字符串/正则字面量（TextMate 语法 JSON、jsdoc 高亮正则等，非语句），
// 不可判定；结构 facet 由 rolldown bundle 元数据给出，零误报零漏检。
// 本模块单测面 = apps/web/src/build/。

/** 产物形状输入（generateBundle 由 bundle 元数据汇出） */
export interface ClientBundleShapeInput {
  /** 产物 chunk 总数（经典形态 = 1——共享 chunk 拆分即 413e3dd 破坏形态） */
  readonly chunkCount: number
  /** 入口 chunk 的外部 import specifier 列表（非空 = 产物含 import 语句） */
  readonly externalImports: readonly string[]
  /** 入口 chunk 的导出名列表（非空 = 产物含 export 语句；入口模块零导出 → 恒空） */
  readonly exportNames: readonly string[]
  /** 入口 chunk 代码（注册面字面量核验） */
  readonly code: string
}

/** classic script 形状 pin：结构三facet 零容忍 + __ModuleLoader__ 注册面在场。 */
export function assertClientBundleClassicScript(input: ClientBundleShapeInput): void {
  if (input.chunkCount !== 1) {
    throw new Error(
      `vite: forge-client 产物 chunk 数 = ${input.chunkCount}（恒 1）——共享 chunk 拆分产生跨 chunk import，classic script 形状破坏（413e3dd 形态）`,
    )
  }
  if (input.externalImports.length > 0) {
    throw new Error(
      `vite: forge-client 产物含外部 import（${input.externalImports.join(', ')}）——依赖须全部内联进 bundle（classic script 形状破坏）`,
    )
  }
  if (input.exportNames.length > 0) {
    throw new Error(
      `vite: forge-client 产物含 export（${input.exportNames.join(', ')}）——入口模块零导出契约破坏（classic script 形状破坏）`,
    )
  }
  if (!input.code.includes('__ModuleLoader__')) {
    throw new Error('vite: forge-client 产物未见 __ModuleLoader__ 注册面')
  }
  // bug d84fd8e5（4a00a8d2 实锤）：import.meta 维度——classic script 求值即 SyntaxError
  // （Cannot use 'import.meta' outside a module）→ 零注册。三结构 facet 均不覆盖该破坏
  // （单 chunk + 全内联 + 零导出下 import.meta 照样在产物内）。经
  // rewriteImportMetaForClassicScript 重写后此处应恒零残留；字面量噪声形态
  // （字符串内 'import.meta' 词素）理论可误报——fail-loud 优于静默放行。
  if (input.code.includes('import.meta')) {
    throw new Error('vite: forge-client 产物含 import.meta——classic script 求值即 SyntaxError（d84fd8e5 形态，重写面失效或未知成员入图）')
  }
}

/** import.meta.url 替换 token（与原词素等长——sourcemap 零漂移） */
const IMPORT_META_URL_TOKEN = '__dshImportMeta'
/** import.meta.resolve 替换 token（与原词素等长；垫片置 void 0 = 特征检测恒假，走 URL 回退） */
const IMPORT_META_RESOLVE_TOKEN = '__dshHasMetaResolve'

/**
 * import.meta classic-safe 重写（bug d84fd8e5 修面）：
 * - `import.meta.url` → `__dshImportMeta`、`import.meta.resolve` → `__dshHasMetaResolve`
 *   （等长替换，既有 sourcemap mappings 逐字节有效）；
 * - 垫片以 `var` 声明**追加**在产物尾部：classic 非 strict 下 var 声明提升至 script 顶，
 *   赋值于求值尾完成——vite preload 助手与动态 import 装载箭头对 token 的全部解引用
 *   均在惰性函数体内（用户动作期），求值期零解引用，基线 = 装载本 bundle 的
 *   `<script src>`（document.currentScript.src）；
 * - 未知 import.meta 成员（env/supports 等）fail-loud 拒绝——重写面只覆盖已实锤的
 *   url/resolve 两形，新形态必须显式进契约，不许静默漏检。
 */
export function rewriteImportMetaForClassicScript(code: string): { code: string; replacedCount: number } {
  const urlCount = code.split('import.meta.url').length - 1
  const resolveCount = code.split('import.meta.resolve').length - 1
  if (urlCount === 0 && resolveCount === 0) {
    if (code.includes('import.meta')) {
      throw new Error('vite: forge-client 产物含未知 import.meta 成员（仅 url/resolve 在重写契约内）——先扩契约再构建')
    }
    return { code, replacedCount: 0 }
  }
  const rewritten = code
    .replaceAll('import.meta.resolve', IMPORT_META_RESOLVE_TOKEN)
    .replaceAll('import.meta.url', IMPORT_META_URL_TOKEN)
  if (rewritten.includes('import.meta')) {
    throw new Error('vite: forge-client 产物含未知 import.meta 成员（仅 url/resolve 在重写契约内）——先扩契约再构建')
  }
  const shim = `;var ${IMPORT_META_URL_TOKEN}=(typeof document!=="undefined"&&document.currentScript&&document.currentScript.src)||(typeof location!=="undefined"?location.href:"");var ${IMPORT_META_RESOLVE_TOKEN}=void 0;`
  // 尾部 sourcemap 注释保持在文件末行（垫片插于其前——注释后追加会被吞进注释行）
  const mapMatch = /\/\/# sourceMappingURL=\S+\s*$/.exec(rewritten)
  if (mapMatch === null) return { code: rewritten + shim, replacedCount: urlCount + resolveCount }
  const body = rewritten.slice(0, mapMatch.index)
  return { code: `${body}${shim}\n${mapMatch[0]}`, replacedCount: urlCount + resolveCount }
}
