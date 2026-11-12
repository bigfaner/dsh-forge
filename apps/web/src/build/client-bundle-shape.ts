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
}
