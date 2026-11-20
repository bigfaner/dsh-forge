// mermaid 门控头词表（单源常量 + detectFormat 探测——机制零变化，表为唯一改动点）。
// 版本基：mermaid@12.1.0 包本体 detector 全量重抽（mermaid.esm.mjs 逐个 detector 正则
// 实证，核销清单见 tests/host/validate/head-words.test.ts 参数化全表——真引擎 headless
// parse 逐词 × 门控判决一致性对照，可红守卫）。
//
// 12.1.0 detector 重抽核销清单（detector 正则 → 头词，大小写归一门控侧小写比对）：
//   c4（C4Context|C4Container|C4Component|C4Dynamic|C4Deployment）→ c4context/c4container/
//     c4component/c4dynamic/c4deployment
//   flowchart-v2（graph|flowchart）→ graph/flowchart；flowchart-elk（lazy elk 布局）
//     → flowchart-elk
//   agentflow-beta / swimlane-beta / erdiagram（erDiagram）/ gitgraph（gitGraph）/
//   gantt / info / pie / quadrantchart（quadrantChart）/ xychart(-beta) /
//   requirement(diagram)（requirementDiagram）→ requirement/requirementdiagram /
//   sequencediagram / classdiagram / statediagram（前缀匹配，v2 同径）→ statediagram/
//   statediagram-v2 / journey / timeline / mindmap / kanban / sankey(-beta) /
//   packet(-beta) / radar-beta / block(-beta) / treeview-beta（treeView-beta）/
//   architecture / eventmodeling / ishikawa(-beta, i) / venn-beta / treemap /
//   usecase-beta / wardley-beta(i) / cynefin-beta / railroad-{beta,ebnf-beta,abnf-beta,
//   peg-beta}(i)
// zenuml 12.1.0 已无此 detector（外部图型退役）——不入表，显式 unsupported 反判 case。

/** mermaid 头词表（首行图型关键字，小写比对；12.1.0 全 detector 重抽） */
export const MERMAID_HEAD_WORDS: ReadonlySet<string> = new Set([
  // 流程图族（flowchart-v2 detector + elk 布局变体）
  'flowchart',
  'graph',
  'flowchart-elk',
  // 时序 / 类 / 状态 / ER / 需求
  'sequencediagram',
  'classdiagram',
  'statediagram',
  'statediagram-v2',
  'erdiagram',
  'requirement',
  'requirementdiagram',
  // 甘特 / 旅程 / 饼 / 时间线 / 象限 / 思维导图 / git
  'gantt',
  'journey',
  'pie',
  'timeline',
  'quadrantchart',
  'mindmap',
  'kanban',
  'gitgraph',
  // C4 族
  'c4context',
  'c4container',
  'c4component',
  'c4dynamic',
  'c4deployment',
  // -beta 后缀族（12.x 新图——后缀可选与否逐词对齐 detector 正则）
  'sankey',
  'sankey-beta',
  'xychart',
  'xychart-beta',
  'block',
  'block-beta',
  'packet',
  'packet-beta',
  'radar-beta',
  'architecture',
  'architecture-beta',
  'venn-beta',
  'treemap',
  'treeview-beta',
  'usecase-beta',
  'agentflow-beta',
  'swimlane-beta',
  'cynefin-beta',
  'wardley-beta',
  'ishikawa',
  'ishikawa-beta',
  'eventmodeling',
  'info',
  'railroad-beta',
  'railroad-ebnf-beta',
  'railroad-abnf-beta',
  'railroad-peg-beta',
])

/** 头词所在行（1-based）——unsupported 裁决的行号依据 */
export function headWordInfo(source: string): { word: string; line: number } {
  const lines = source.split(/\r?\n/)
  let i = 0
  if (lines[0]?.trim() === '---') {
    i = 1
    while (i < lines.length && lines[i]?.trim() !== '---') i++
    i++ // 越过闭合 ---
  }
  while (i < lines.length && lines[i]?.trim() === '') i++
  const word = lines[i]?.trim().split(/\s+/)[0] ?? ''
  return { word, line: i + 1 }
}

/**
 * auto 探测：首行头词 → 引擎 format（'mermaid'）| null（未知头词，显式 unsupported）。
 * 跳过 YAML frontmatter（--- 界定）与空行，取首个非空词。
 */
export function detectFormat(source: string): string | null {
  const { word } = headWordInfo(source)
  const head = word.toLowerCase()
  if (!head) return null
  return MERMAID_HEAD_WORDS.has(head) ? 'mermaid' : null
}
