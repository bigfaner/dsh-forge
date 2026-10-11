# views/docs/

定位：**业务** —— UF-2「文档」dock tab 体（3.9）：正文分段渲染经共享件 `MdSegmentsBody`（md 段 MarkdownDoc、mermaid 段 MermaidDiagram **懒加载**——1.5 起官方预览径/dock tab/知识抽屉三入口单源）+ 路径栏 + 悬空只读占位面。填充：3.9（本目录）；dock tab 注册（multiple + docRel 去重 + 关闭回退）归 4.1（`sidebarRightTabs` 注册面注入 docRel props）。
边界：禁 import `../session/` `../knowledge/` `../overview/`（依赖铁律③ 同级业务互禁）；rpc 仅经 `rpc/` client；md 文档 body 渲染唯一经共享件 `MdSegmentsBody`（内层 md 段唯一经 MarkdownDoc——裸渲染器禁直用，结构 pin）。

## 模块面

| 文件 | 职责 |
|---|---|
| `doc-segments.ts` | 分段解析纯函数（`splitDocSegments`：md 段/mermaid 段交替——info 首词 = `mermaid` 入图段；非 mermaid fence 整体归 md[嵌套 ```mermaid 文本不误分]；未闭合 fence 视为正文不吞正文；md 段首尾空白行裁去 + 纯空白段丢弃；`hasMermaidSegment` = 懒加载触发判据） |
| `mermaid-diagram.tsx` | mermaid 渲染件：`loadMermaidEngine`（**懒加载唯一动态 import 径**——模块级 promise 缓存 + 单次 `initialize({ startOnLoad: false, securityLevel: 'strict' })`；产品源零静态 import = 结构 pin）+ `renderMermaidDiagram`（渲染管线纯异步面——loader 注入；render 抛错/import 失败/svg 形状非法三路归一 `{ ok: false }`，异常不外溢）+ `MermaidDiagram`（effect 编排：rendering → rendered/fallback；SVG 经 strict 面 sanitize 后注入）+ `MermaidFallbackCard`（回退占位卡：源码 + 回退注记） |
| `md-segments-body.tsx` | **共享 md 文档 body 件**（1.5 三入口单源——官方预览径 `md-preview-body` / dock tab `DocBody` / 知识抽屉 `EntryDrawer` 正文区全部经它）：`splitDocSegments` 分段 + md 段 `MarkdownDoc`（variant=body + `MD_PREVIEW_MARKDOWN_LABELS` 冻结常量单源——CodeToolbar labels 递达）+ mermaid 段 `MermaidDiagram`；纯段列表零容器节点（容器与滚动所有权归三入口语境，官方同形容器刻度组单源于 docs.css）；`pathImages`/`streaming` 预览径专属面经 props 透传 |
| `index.tsx` | `DocsTab`（状态 + 装载胶水：`docs.read` 单发 + ↻ 重读 nonce + seq 竞态守卫 + `openDocExternal` 触发即忘）+ `DocsFrame`（纯呈现帧：头部[标题 + 只读/悬空徽标] + 路径栏[canonical + 📁 编辑器 + ↻ 重读] + 摘要块 + `DocBody` 正文[容器 dswf-doc-body 自持滚动 + 内层委托共享件]；悬空 = 只读占位面[路径栏保留，不崩溃不写入不删行]）+ 装载落点纯函数（`pendingDocView`/`applyDocFetch`——切换清场/重读保旧内容）+ `fetchDocContent`/`mapDocsError`/`docTitle` |
| `md-preview-body.tsx` | 官方预览径 md mermaid 扩展渲染器 body（`sidebar.right.tab.document` keyed 'dswf-md-mermaid' 占用者）：保持适配层身份——owner props（`content`/`wrap` 等）+ `useTabInfo`/`useResource` 窄面 + `pathImages` 图片词表纯函数（官方 path-images 口径镜像——认证 `/api/file` 改写、HTTP(S) 保持原 URL、escape 解码一次），内层渲染委托共享件 `MdSegmentsBody`（1.5 单源）；非 text 相位渲染 null、wrap 偏好零消费（容器恒官方同形 white-space:normal）、不认领 scrollport（注册面归 client-plugin） |
| `docs.css` | 文档 tab 样式（面板骨架/头部/路径栏/摘要/图卡[头 + 画布横向滚动]/回退卡[源码 + 注记]/悬空面/骨架/错误条——全 `--dsw-*` 令牌；等宽族豁免注记在内） |

## 安全边界（tech-design Dependencies + Mitigations ⑦，Hard Rule）

- **懒加载**：仅 body 含 mermaid 段时动态 import——共享件 `MdSegmentsBody` 按 `splitDocSegments` 分段挂载 `MermaidDiagram`（三入口同面：dock 文档 tab / 官方预览径 / 知识抽屉正文——1.5），零 mermaid 段零挂载 = 零装载；`import('mermaid')` 是产品内唯一 mermaid 引用（静态 import = 结构 pin 违例）。
- **securityLevel='strict'**：库默认 sanitize；禁 click 回调交互（交互绑定面恒不接）；`startOnLoad=false`（渲染恒经显式 `render`）。
- **回退占位**：渲染失败/非法源 → 回退纯文本占位卡（源码 + 回退注记），异常不外溢（import/render/形状三路归一 fail，不炸文档 tab）。

erDiagram = 验收锚，全图型同库渲染——`mermaid-diagram.tsx` 零图型分支（源原样入 `engine.render`）。
