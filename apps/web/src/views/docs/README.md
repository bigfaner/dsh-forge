# views/docs/

定位：**业务** —— UF-2「文档」dock tab 体（3.9）：md 段经 MarkdownDoc、mermaid 段经 MermaidDiagram **懒加载**渲染 + 路径栏 + 悬空只读占位面。填充：3.9（本目录）；dock tab 注册（multiple + docRel 去重 + 关闭回退）归 4.1（`sidebarRightTabs` 注册面注入 docRel props）。
边界：禁 import `../session/` `../knowledge/` `../overview/`（依赖铁律③ 同级业务互禁）；rpc 仅经 `rpc/` client；Markdown 渲染唯一经 MarkdownDoc（裸渲染器禁直用——结构 pin）。

## 模块面

| 文件 | 职责 |
|---|---|
| `doc-segments.ts` | 分段解析纯函数（`splitDocSegments`：md 段/mermaid 段交替——info 首词 = `mermaid` 入图段；非 mermaid fence 整体归 md[嵌套 ```mermaid 文本不误分]；未闭合 fence 视为正文不吞正文；md 段首尾空白行裁去 + 纯空白段丢弃；`hasMermaidSegment` = 懒加载触发判据） |
| `mermaid-diagram.tsx` | mermaid 渲染件：`loadMermaidEngine`（**懒加载唯一动态 import 径**——模块级 promise 缓存 + 单次 `initialize({ startOnLoad: false, securityLevel: 'strict' })`；产品源零静态 import = 结构 pin）+ `renderMermaidDiagram`（渲染管线纯异步面——loader 注入；render 抛错/import 失败/svg 形状非法三路归一 `{ ok: false }`，异常不外溢）+ `MermaidDiagram`（effect 编排：rendering → rendered/fallback；SVG 经 strict 面 sanitize 后注入）+ `MermaidFallbackCard`（回退占位卡：源码 + 回退注记） |
| `index.tsx` | `DocsTab`（状态 + 装载胶水：`docs.read` 单发 + ↻ 重读 nonce + seq 竞态守卫 + `openDocExternal` 触发即忘）+ `DocsFrame`（纯呈现帧：头部[标题 + 只读/悬空徽标] + 路径栏[canonical + 📁 编辑器 + ↻ 重读] + 摘要块 + `DocBody` 分段渲染；悬空 = 只读占位面[路径栏保留，不崩溃不写入不删行]）+ 装载落点纯函数（`pendingDocView`/`applyDocFetch`——切换清场/重读保旧内容）+ `fetchDocContent`/`mapDocsError`/`docTitle` |
| `docs.css` | 文档 tab 样式（面板骨架/头部/路径栏/摘要/图卡[头 + 画布横向滚动]/回退卡[源码 + 注记]/悬空面/骨架/错误条——全 `--dsw-*` 令牌；等宽族豁免注记在内） |

## 安全边界（tech-design Dependencies + Mitigations ⑦，Hard Rule）

- **懒加载**：仅文档 tab 含 mermaid 块时动态 import——`DocBody` 按 `splitDocSegments` 分段挂载 `MermaidDiagram`，零 mermaid 段零挂载 = 零装载；`import('mermaid')` 是产品内唯一 mermaid 引用（静态 import = 结构 pin 违例）。
- **securityLevel='strict'**：库默认 sanitize；禁 click 回调交互（交互绑定面恒不接）；`startOnLoad=false`（渲染恒经显式 `render`）。
- **回退占位**：渲染失败/非法源 → 回退纯文本占位卡（源码 + 回退注记），异常不外溢（import/render/形状三路归一 fail，不炸文档 tab）。

erDiagram = 验收锚，全图型同库渲染——`mermaid-diagram.tsx` 零图型分支（源原样入 `engine.render`）。
