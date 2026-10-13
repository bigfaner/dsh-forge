# views/docs/

定位：**业务** —— UF-2「文档」dock tab 体（3.9）：正文 MarkdownDoc 全量渲染（1.8 渲染链退役——官方渲染唯一径；mermaid fence 渲染为官方代码块后由 DOM 增强器出图——挂接归 client 插件 md-mermaid 增强面，能力单源 = `packages/plugins/md-mermaid`）+ 单行头（1.6——官方 PathLabel 路径 + 官方图标钮控件簇）+ 悬空只读占位面。填充：3.9（本目录）；dock tab 注册（multiple + docRel 去重 + 关闭回退）归 4.1（`sidebarRightTabs` 注册面注入 docRel props）。
边界：禁 import `../session/` `../knowledge/` `../overview/`（依赖铁律③ 同级业务互禁）；rpc 仅经 `rpc/` client；正文渲染唯一经 `MarkdownDoc`（官方渲染唯一包装入口——裸渲染器禁直用，结构 pin）；产品源零 mermaid 引用（唯一引用方 = `@dsh-forge/md-mermaid`）。

## 模块面

| 文件 | 职责 |
|---|---|
| `index.tsx` | `DocsTab`（状态 + 装载胶水：`docs.read` 单发 + 重读 nonce + seq 竞态守卫 + `openDocExternal` 触发即忘）+ `DocsFrame`（纯呈现帧：单行头[官方 `PathLabel` 路径——目录段弱化/左缘渐隐裁剪/悬浮全值自带 + 悬空 warn chip 仅 dangling + 官方图标钮：`IconFolderOpenOutlineRegular` 编辑器打开 / `IconRefreshOutlineRegular` 重读——1.6 对齐官方预览头 css$8 单行形；标题行/只读 chip/摘要卡退役——标题归 tab 页签、摘要归概览文档行悬浮] + `DocBody` 正文[MarkdownDoc 全量渲染——variant=body + `MD_PREVIEW_MARKDOWN_LABELS`；容器 dswf-doc-body 自持滚动]；悬空 = 只读占位面[单行头保留，不崩溃不写入不删行]）+ 装载落点纯函数（`pendingDocView`/`applyDocFetch`——切换清场/重读保旧内容）+ `fetchDocContent`/`mapDocsError` |
| `docs.css` | 文档 tab 样式（面板骨架/单行头[官方 PathLabel 零自绘 + 官方图标钮 css$8 同刻度镜像]/双入口官方同形容器刻度组[.dswf-doc-body/.dswf-kn-md-body]/mermaid 图卡与回退卡样式[`.dswf-doc-mermaid` 族——供 DOM 增强器出图复用，画布横向滚动 overflow-x:auto 兜底超宽源]/悬空面/骨架/错误条——全 `--dsw-*` 令牌；等宽族与图标钮 28×28/svg 15×15 官方刻度豁免注记在内） |

## 退役面（1.8 渲染链退役，proposal md-mermaid-plugin）

- 分段链整体退役：`doc-segments.ts`（分段器）、`md-segments-body.tsx`（共享分段 body 件）、`md-preview-body.tsx`（官方预览径 'dswf-md-mermaid' 扩展渲染器）、`mermaid-diagram.tsx`（渲染件——迁 `packages/plugins/md-mermaid` web 面）。
- client 插件 documentPreviews 反射缝注册链同步退役——sidebar md 预览回归官方 builtin。
- mermaid 出图机制：凡 `.md-code-block` DOM 由包内 DOM 增强器扫描增强（门控 + parse 确认 + fence 闭合），产品面与官方面同机制同主题。
