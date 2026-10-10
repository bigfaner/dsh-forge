# M3.1 D35 按钮风格对齐走查记录——深灰 toolbar 异类清零 + 全量按钮排查——任务 1.22 · SC-8 终验输入

> **任务**：`dsh-forge-m3.1-ui-alignment/1.22`——[D35 差异行](../proposal.md)（2026-10-10 用户实机报障「有些按钮是深灰色的，例如悬浮面板的扩大按钮，跟本应用的风格不搭，对齐 DSH 保持风格一致，要排查所有风格不一致的按钮」，源码核验属实 + 用户明令全量排查）。
> **消费方**：SC-8 人工终验——实机走查动线见文末「实机走查清单」。
> **证据口径**：实机 Electron 截图当场产出归档（e2e harness 实跑捕获，非原型对照图——D33 同径）；双主题 = 官方主题服务同位属性（`body[data-ds-dark-theme]`，CSS 解析等价面）；判读另附实机计算样式测量值（本记录第三节）。

## 根因与修法摘要（实现 = 提交 473f6fb）

- **根因**：产品 9 处 Button 使用官方 `variant="toolbar"`——该变体填充 `--dsw-alias-button-tool-bar-fill: #54555780`（半透明深灰片）+ hover `#54555799`；**原生 dsh 全部官方包该变体使用 0 次**（对照 ghost 7 / primary 32 / outline 45，正则计数核验）——官方图标钮语言 = ghost（透明底 + label-secondary 图标 + hover interactive-bg-hover）。toolbar 变体为官方保留件，产品在头行/关闭/折叠图标钮位错用 → 深灰异类。
- **修法**：9 处逐位替换为官方 `ghost`（全为图标钮位，无带边框动作钮位故零 outline 位）；尺寸/图标/className/data-* 锚/aria 标签逐字节原样（仅换 variant，零行为语义变化）。

### 逐位台账（9 处 · 6 文件，grep `variant="toolbar"` 清零）

| 位 | 文件:行 | 钮位 | 形 |
|---|---|---|---|
| ① | `apps/web/src/views/session/DispatchPanel.tsx:512` | 悬浮面板 ▁ 折叠钮（**用户点名「扩大按钮」面**） | toolbar → ghost |
| ② | `apps/web/src/views/knowledge/EntryDrawer.tsx:276` | 知识抽屉 ✕ 关闭钮 | toolbar → ghost |
| ③ | `apps/web/src/views/knowledge/KnowledgeToolbar.tsx:150` | 知识检索 ✕ 清除钮 | toolbar → ghost |
| ④ | `apps/web/src/views/overview/sticky-bar.tsx:81` | 概览检索 ✕ 清除钮 | toolbar → ghost |
| ⑤a | `apps/web/src/views/overview/drawer/index.tsx:451` | 任务弹窗 ⤢ 展开/收起钮（简要形态） | toolbar → ghost |
| ⑤b | `apps/web/src/views/overview/drawer/index.tsx:463` | 任务弹窗 ✕ 关闭钮（简要形态） | toolbar → ghost |
| ⑤c | `apps/web/src/views/overview/drawer/index.tsx:865` | 任务弹窗 ✕ 关闭钮（完整形态·变体一） | toolbar → ghost |
| ⑤d | `apps/web/src/views/overview/drawer/index.tsx:903` | 任务弹窗 ✕ 关闭钮（完整形态·变体二） | toolbar → ghost |
| ⑥ | `apps/web/src/views/overview/task-tab/list-view.tsx:139` | 任务列表行 ⋯ 行操作钮 | toolbar → ghost |

## 双主题截图归档（实机 Electron 捕获）

### ① 悬浮面板折叠钮（用户点名面；夹具 = blank 会话 + bridge claim link 源挂接——面板行集/锚定与真实派发会话同链路）

| 主题 | 面板近景（▁ 折叠钮） | 全页上下文 | hover 态 |
|---|---|---|---|
| 亮 | ![dp light](shots/d35-dp-light.png) | ![ctx light](shots/d35-dp-ctx-light.png) | ![hover light](shots/d35-dp-collapse-hover-light.png) |
| 暗 | ![dp dark](shots/d35-dp-dark.png) | ![ctx dark](shots/d35-dp-ctx-dark.png) | — |

### ②③ 知识面（工具栏清除钮 + 抽屉关闭钮；夹具 = kb 台账四条目库）

| 主题 | ③ 检索行近景（✕ 清除钮） | ② 抽屉近景（✕ 关闭钮） | ② 全页上下文 |
|---|---|---|---|
| 亮 | ![kn clear light](shots/d35-kn-searchclear-light.png) | ![kn drawer light](shots/d35-kn-drawer-light.png) | ![kn ctx light](shots/d35-kn-drawer-ctx-light.png) |
| 暗 | ![kn clear dark](shots/d35-kn-searchclear-dark.png) | ![kn drawer dark](shots/d35-kn-drawer-dark.png) | ![kn ctx dark](shots/d35-kn-drawer-ctx-dark.png) |

### ④⑤⑥ 概览面（sticky-bar 清除钮 + 任务弹窗四形态 + 列表行操作钮）

| 主题 | ④ 检索行近景 | ⑤ 弹窗简要（⤢ + ✕） | ⑤ 弹窗完整（头行 ✕） | ⑥ 行近景（⋯ 行尾） | ⑥ ⋯ 特写 |
|---|---|---|---|---|---|
| 亮 | ![ov clear light](shots/d35-ov-searchclear-light.png) | ![td light](shots/d35-td-drawer-light.png) | ![td full light](shots/d35-td-drawer-full-light.png) | ![row light](shots/d35-ov-listrow-light.png) | ![more light](shots/d35-ov-more-light.png) |
| 暗 | ![ov clear dark](shots/d35-ov-searchclear-dark.png) | ![td dark](shots/d35-td-drawer-dark.png) | ![td full dark](shots/d35-td-drawer-full-dark.png) | ![row dark](shots/d35-ov-listrow-dark.png) | ![more dark](shots/d35-ov-more-dark.png) |

**判读**（双层证据——截图走查 + 实机计算样式测量）：

- **实机测量值**（e2e 实跑直读 ① 折叠钮 `getComputedStyle`）：两主题 `backgroundColor = rgba(0, 0, 0, 0)`（**全透明底——#54555780 深灰片不在场**）；按钮 class = 官方 CSS module `_ghost_*` 变体 + 产品 `dswf-dp-btn`；图标色亮 `rgb(129,133,140)` / 暗 `rgb(173,178,184)`——**色值随官方主题层亮/暗自动联动**（ghost 官方令牌驱动，产品零自持色）。
- **截图走查**：六面全部图标钮（▁/✕/⤢/⋯）两主题下均透明底融入表面、无深灰片异类；① hover 态出官方 interactive-bg-hover 浅底气泡叠官方 Tooltip（D30 交付面）。亮/暗两主题均可辨、与官方件同语言。

## 机械面证据（引用 473f6fb 提交台账）

- **全量排查双通道之机械面**：产品自绘 `<button>` 31 面（25 类）CSS 全量过检——填充/边框全令牌化（transparent+hover / border-l2 chip / bg-base 卡面），异类仅 toolbar 变体一处来源（本轮清零）；记账豁免四面（tt-dispatch.is-off 置灰深灰实底 = v24 原型 ㊵ 显式映射、mode-chip is-unset/disabled 中性底、dp-badge 角标 interactive-bg-active 胶囊、td-sect 块头底色条——皆原型注记在案）；wco.css button 选择器 = 官方侧栏 WCO 覆写非产品按钮——台账零未记账项。
- **防回归结构 pin**：`tests/structure/web-shell.test.ts`（产品源 `variant="toolbar"` 零在场 sweep + 九位 ghost 逐锚 tag 级断言，含 `data-dswf-dp-collapse`）。
- **门**（473f6fb 实跑）：tsc -b + vite build 绿 + lint 六门（token-lint 0 裸值）+ 定向 vitest 11 文件/263 用例绿。

## 证据口径与限制（诚实声明）

- **原阻塞理由推翻记录**：1.22 首轮提交 blocked 称「本环境无 GUI 取证面……需实机 Electron 实跑，非本环境可靠可行」。本轮以一次性探针证伪：tmp spec `launchHost` 实跑产品 Electron 壳 37s boot + 1803×1128 截图落盘成功（phase=hero）——取证随后按 D33 同径完成，本归档即产物。探针/取证/样式探针 spec 均用后即删（e2e/specs 零 tmp 残留）。
- **夹具径与既有池红的规避**：①面挂接走 blank 会话 + bridge `claimTask`（link 源事件推送 → 面板挂载，tsl 台账径）；未使用共享夹具链「工作区芯片」步（1.13 台账在案既有红——`rpc.ts:69` 芯片正则失配族，与本取证零交集）。
- **生成环境**：2026-10-10；HEAD `6f29374`（D35 改面 = `473f6fb`，其后提交不涉六面）；node 24 + @playwright/test（仓内 node_modules）+ Playwright `_electron` 实跑产品壳（globalSetup 前置重建 dist——D35 改动保证入镜）。**树态注记**：捕获骑在工作树在途未提交 fix-7 改动之上（`e2e/support/launch.ts` 环境净化——正是 Electron 实跑确定性的使能面；`apps/web/.../task-tab.tsx` Tooltip tipwrap 包裹——非 D35 按钮面，仅随树入镜于 ⑥ 列表行截图背景）。这些在途文件不属于本归档提交。
- 每张截图截取前均有目标锚 DOM 在场断言（spec 内 expect——非空壳取证）；双主题经官方主题同位属性切换（CSS 解析等价——D33 口径）。

## 实机走查清单（SC-8 用户动线）

1. **切换口径**：官方主题切换（设置外观亮/暗）——每面先亮后暗各过一遍（对照本记录截图基线）。
2. **① 点名面**：进入有派发任务的会话 → 悬浮面板头行 ▁ 折叠钮 = 透明底图标钮（无深灰底片）；悬停出浅底 + 官方 Tooltip「折叠」；折叠/展开往返 ⟡N 角标正常。
3. **②③ 知识面**：知识库 → 检索词输入 → ✕ 清除钮透明底可辨；卡片点开抽屉 → 头行 ✕ 关闭钮同语言；Esc 同效。
4. **④ 概览检索**：概览任务子 tab → 检索词输入 → ✕ 清除钮透明底；Esc 清词。
5. **⑤ 任务弹窗**：任务行点击开弹窗 → 简要形态 ⤢/✕ 两钮；⤢ 翻转完整形态 → 头行 ✕ 同语言；Esc 收弹窗。
6. **⑥ 列表行**：任务列表行尾 ⋯ 行操作钮——行悬停出菜单，钮本体透明底。
7. **全量抽检**：任意表面再随手过一遍——图标类按钮统一透明底 + 悬停浅底语言；如发现深灰/实底异类钮，对 [proposal.md D35 行](../proposal.md) 全量排查台账比对（豁免四面有注记）。
8. **回填**：实机观感以「无异类/有异类 + 面位」回填本记录即可（截图已归档）。
