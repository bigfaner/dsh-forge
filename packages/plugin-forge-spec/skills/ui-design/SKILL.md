---
name: ui-design
description: 从 PRD 的 ui-functions 文档出发产出 UI 设计规格与 HTML 原型——设计风格选型、逐功能布局/状态/交互，以及可评审的原型。
---

# UI 设计（ui-design）

定义界面"长什么样、如何表现"，与 PRD 的"做什么"相分离。

<HARD-GATE>
不得编写实现代码（HTML 原型是唯一例外）。本技能只产出设计规格文档与原型文件。
</HARD-GATE>

## State-Layer Discipline (boundary)

文档注册表词表封闭于七种 kind 且**没有 ui-design kind**——`ui-design.md` 与原型文件
是磁盘工件，不注册。不得在错配的 kind 下伪造注册（`ui-functions` 已命名
`prd/prd-ui-functions.md`；把它改指 `ui-design.md` 会丢掉 PRD 那一行）。存储布局
（`<slug>` feature 目录树）见 forge-pipeline 系统提示段「文档位置」。

本技能拥有的唯一状态层动作：每当本技能**回写 `prd/prd-ui-functions.md`**（第 2 步的
导航架构回填、第 7 步的 PRD 对账），就重新注册它。回写内容含 mermaid 图时：图写完 → `validateMermaid` 自检 → 再重新注册：

```
upsertFeatureDoc { feature_slug: "<slug>", doc_kind: "ui-functions",
                   rel_path: "docs/features/<slug>/prd/prd-ui-functions.md", summary: "<一句话>" }
```

### 冻结锚点清单

以下内容被 e2e 断言或机械消费，**一律保留英文原样、禁止翻译**：

- 段名锚点：`State-Layer Discipline`（e2e 注释级引用——非断言锚点）
- 消费段名：`## Navigation Architecture`（`prd-ui-functions.md` 的固定节名，write-prd 同款约定）
- 工件约定名：`prd-spec.md` / `prd-ui-functions.md`（discovery 机械消费）；`ui-design.md`（技能链约定名——on-disk 工件不入册，非机械消费）
- 文档 kind：`ui-functions`（封闭词表七种之一）
- 工具/动词名：`upsertFeatureDoc`
- 标签名：`<HARD-GATE>` 等沿用英文原样（标签体内正文用中文）

## 前置条件

| 工件 | 缺失时 |
|---|---|
| `prd/prd-ui-functions.md`（feature 目录相对约定，注册为 `ui-functions`） | 先跑 `write-prd` 并补齐 UI 功能定义 |

## 工作流

1. **读 UI 功能**——逐项记录其落位：`new-page`（设计完整页面）vs
   `existing-page:<route>`（只设计内嵌组件；Position 字段约束布局，如宽度须与既有
   内容区一致）。
2. **提取导航架构**——读 `prd-ui-functions.md` 的 `## Navigation Architecture` 节。
   若缺失，向用户收集（平台、主入口、次级页面、导航规则）并**回写**进
   `prd-ui-functions.md`，再重新注册该文档（见上方边界）。
3. **选设计风格**——优先级：用户提供的 DESIGN.md（项目根或 feature 目录）→
   用户在内置风格中挑选 → 内置不足时从外部风格仓库克隆。多平台特性逐平台选一种
   风格。将所选令牌内联进设计文档的设计系统节（不引外部文件）。
4. **起草设计**——逐 UI 功能定义：**组件层级树**（目录树形式——围栏代码块内 `├─`/`└─`
   缩进层级；`new-page` 从页面根起，`existing-page:<route>` 只画内嵌组件子树）、
   布局结构、状态（加载/空/错误/有数据）、交互（触发、动作、反馈）、数据绑定
   （元素 → 数据字段）。`existing-page` 功能必须带
   经实地发现约束精化后的落位子节。TUI 平台：每个面板含 ASCII 示意图、尺寸、字符
   调色板、颜色映射与边界渲染。
5. **写设计文档**——`ui/ui-design.md`（web）、`ui/ui-design-tui.md`（TUI）、
   `ui/ui-design-mobile.md`（移动）；多平台特性一平台一份。不注册（见边界）。
6. **生成原型**——以设计文档 + 所选风格产出 HTML：共享 CSS/JS + 逐页 HTML +
   `index.html` 导航；四种状态全部实现；导航、弹窗、页签可交互；响应式。TUI：单个
   `index.html` 模拟终端窗口（深色等宽、CSS 画框线、按键条切换面板、面板状态可切换）。
   存放在 `ui/prototype/` 下（多平台逐平台子目录）。
7. **人工评审门**——呈现原型（浏览器打开 `index.html`）并等待明确批准后再继续。
   派发任务语境下，在输出中记录原型位置与亮点，不做阻塞等待。
8. **对账 PRD（批准后）**——对照原型与 `prd-ui-functions.md`：原型中出现而 PRD 没有
   的页面/交互/数据字段/导航 → 提议回写。用户批准则更新 `prd-ui-functions.md` 并重新
   注册（原型即"设计了什么"的事实源）；拒绝则在 `ui-design.md` 内记录差异。
