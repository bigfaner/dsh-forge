# M3.1 D28 双主题走查记录（弹窗/悬浮面板/下拉卡/插件行/新会话钮/rail 逐面）——SC-8 终验输入

> **任务**：`dsh-forge-m3.1-ui-alignment/1.13`（终局验证）——差异清单 [D28](../proposal.md)（八区·全局纪律）：亮/暗**全形态**走查（H 区先例口径）。
> **消费方**：SC-8 人工终验——用户实机按本记录「实机走查清单」逐面过亮/暗两遍后打勾。
> **证据口径**：与 [1.5 归档](./README.md) 同径——**实现侧证据 = 代码锚点 + 机械面令牌审计**（原型侧亮/暗截图为对照基线）；实机截图归 SC-8 用户终验时补拍（子代理无凭据 + Electron 壳无独立 HTTP 面，1.5 已声明的同一限制）。

## 双主题机制（逐面共担的机械面）

产品自绘面**零裸色值**：`just lint` → `[token-lint] 0 裸值（239 个 css/ts/tsx 文件扫描）`（2026-10-10 本任务实跑，exit=0）。颜色一律 `var(--dsw-alias-*)` 官方语义令牌 → 亮/暗由官方主题层解析联动（官方域，产品无自持开关——SMOKE-LEDGER §3 L748 口径）。`dsw-raw` 豁免通道经全量盘点（291 行 / 22 文件）**零颜色携带**——豁免仅结构刻度（宽高/内距/层号/过渡时长），逐行注记理由（盘点表见 [D1-D28 证据汇总](./D1-D28-evidence.md) D27 行）。

## 逐面记录

| # | 面 | 实现锚 | 双主题机制（色面令牌） | 原型对照 | 走查判定 |
|---|---|---|---|---|---|
| 1 | **弹窗**（任务详情，简要 440 ↔ 完整 720） | `views/overview/drawer/drawer.css`（壳 :31–40 抬升面 + 标题栏 hover :50–51）+ `transition-dialog.css` | `--dsw-alias-bg-base`（壳底）/ `--dsw-alias-border-l2`（壳缘+分隔）/ `--dsw-elevation-prominent`（投影，stroke 色随缘令牌 :34）/ `--dsw-alias-interactive-bg-hover`（标题栏 hover）/ 标签 `--dsw-alias-label-*` / 时间线 verb 分色 = 状态语义令牌族（:682 人工转移环 = `--dsw-alias-state-business-tertiary` 等） | 原型 H 区双主题口径（纠正版原型暗色 layer 解析）；`prototype/README.md` R 轮亮/暗双色断言 | 机械面绿（全令牌）；实机双主题归 SC-8 |
| 2 | **悬浮面板**（派发任务，D6） | `views/session/dispatch-panel.css`（壳 :23–26 + 头 :41–49 + 行 :85–109）+ `DispatchPanel.tsx` | `--dsw-alias-bg-base`（面板底）/ `--dsw-alias-border-l2`（缘+头分隔）/ `--dsw-elevation-prominent`（浮层投影）/ `--dsw-alias-interactive-bg-hover`（头与行 hover）/ 行尾 ⟞ 钮、状态 Tag = 官方件（主题官方自持）；层号 = `--dsh-dockkit-float-layer` 官方令牌 | 原型 E 区（05-dispatch-panel / 06-dp-badge 截图轮） | 机械面绿；**残差记账**：行状态 Tag `tone="neutral"` 硬编码（七态同灰）= D33 任务 1.18 承接项，不在 D1–D28 收口内 |
| 3 | **下拉卡**（Forge设置 Provider/Model Menu，D24） | `views/settings/forge-settings.css`（m31-dd 触发钮 :66–76 + 卡 :77–86）+ 官方 MenuSurface 件 | 卡底 `--dsw-alias-bg-layer-2` / 卡缘 `--dsw-alias-border-l2` / 触发钮 `--dsw-alias-bg-base` + hover `--dsw-alias-interactive-bg-hover` / 文字 `--dsw-alias-label-*`；项悬停/Check = 官方 Menu 件自持 | 原型 F 区（MenuSurface 半透卡 + trailing Check；07-settings 截图轮） | 机械面绿；实机双主题归 SC-8 |
| 4 | **插件行**（D4 记账·官方 plugin-manager panelList 承载） | 产品零自绘（官方件直用——proposal D4 行记账；原型 R17 轮裁决） | 官方 panelList 行样式 = 官方主题自持（亮/暗官方令牌解析）；产品侧零 CSS 干预面 | 原型 R17（原型十六/十七轮官方同位核对，proposal 裁决 #21） | **零差异（官方承载）**——实机核对 = SC-8 确认行在座 + 双主题观感与原生 dsh 一致 |
| 5 | **新会话钮**（D4/D18 记账·官方 SidebarRoot `.newSession` 承载） | 产品零自绘（官方壳自带——proposal 裁决 #18：h38/elevated 白卡/居中/NewChat） | 官方 `.newSession` 亮/暗底色官方自持（原型 R14 轮 computed-style 亮/暗双色断言已核对同值——`prototype/README.md` 十四轮） | 原型 R14（亮 #fff / 暗 #43454a · hover floating 双色断言） | **零差异（官方承载）**——同上 |
| 6 | **rail**（收起态 59px 图标列，D2） | `styles/wco.css`（轨宽 :48 / 与轨同宽 :55 / root 刻度 :60–90）+ `views/sidebar/sidebar.css`（rail 图标钮 36 命中区 :335–336 刻度） | 竖线/边 `--dsw-alias-border-l3`（wco.css :29——官方边框令牌族，亮/暗联动）/ 图标钮 hover `--dsw-alias-interactive-bg-hover` + focus ring `--dsw-alias-state-business-primary`（sidebar.css :124/:129）/ 文字 `--dsw-alias-label-*` | 原型 G 区「rail 在场/图标 ≥4」（08-sidebar-rail 截图轮） | 机械面绿；实机双主题归 SC-8 |

## 实机走查清单（SC-8 用户动线）

1. **切换口径**：官方主题切换（设置外观亮/暗；产品无自持开关）——每面先亮后暗各过一遍。
2. **弹窗**：任务行/DAG 节点/泳道卡/悬浮面板行点击四路开弹窗 → ⤢ 展开完整 720 → 时间线 verb 分色可辨 → 拖移/拖缘 → Esc 关（两主题各一遍；对照 [D21 台账](../../../apps/web/src/views/overview/drawer/README.md) 锚）。
3. **悬浮面板**：派发会话中面板浮层 → 头 hover/行 hover/⟞ 钮 hover → 折叠 ⟡N 角标再展开（两主题；D33 状态 Tag 单源残差知悉后走查）。
4. **下拉卡**：设置 → Forge设置 → Provider/Model 触发钮 → Menu 卡弹出 → 项悬停 + Check（两主题）。
5. **插件行 / 新会话钮**：左栏展开态核对官方件在座与观感（对照原型 R14/R17 双色断言基线）。
6. **rail**：左栏收起 → 59px 图标列 + 竖线 `--dsw-alias-border-l3` 两主题可辨（亮/暗皆不消失不刺眼）。
7. **补拍归档**：实机截图回填本目录（建议 `impl-d28-<面>-<light|dark>.png`）。

## 证据口径与限制（诚实声明）

- 机械面 = 本任务实跑：`just lint` 全绿（含 `[token-lint] 0 裸值 / 239 文件`）+ dsw-raw 291 行全量盘点（0 颜色携带）+ `vitest` 225 文件 / 3070 用例绿（含 D14/D15 结构 pin、D30 结构 pin 等形态语义锚）。
- 实机亮/暗观感走查 = **SC-8 用户终验面**（1.5 同径：实现侧子代理无凭据、Electron 壳无 HTTP 面；e2e 池按 SMOKE-LEDGER 口径不迁移主题切换行 L748——官方域）。本记录不含观感判定，仅锚定证据与动线。
- 本记录零裁决：D28 行为「亮/暗全形态走查」验收组织面，无新增裁决点。
