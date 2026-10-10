# M3.1 对照走查归档（D7–D9、D11）——SC-8 终验输入

> **任务**：`dsh-forge-m3.1-ui-alignment/1.5` 对照走查项归档（[proposal.md](../proposal.md) Solution #6）。
> **口径**：四面对照**总纲冻结形态**（纠正版原型 [`prototype/`](../prototype/)）——**既有对照走查，不新增裁决**；残差走查归档驱动。零代码改动（纯文档 + 截图素材产出）。
> **消费方**：SC-8 人工终验——用户按差异清单 D1–D30 逐行打勾时，D7–D9/D11 四行以本归档为走查底稿。

## 文件索引

| 面 | 差异清单行 | 归档文件 | 截图（原型目标形态） |
|---|---|---|---|
| 知识召回 tab | D7 | [D7-recall-tab.md](./D7-recall-tab.md) | [recall light](shots/proto-d7-recall-light.png) · [dark](shots/proto-d7-recall-dark.png) |
| hero 面板 | D8 | [D8-hero-panel.md](./D8-hero-panel.md) | [hero light](shots/proto-d8-hero-light.png) · [dark](shots/proto-d8-hero-dark.png) · [项目选择弹层](shots/proto-d8-hero-picker-menu.png) |
| 知识面板 | D9 | [D9-knowledge-view.md](./D9-knowledge-view.md) | [knowledge light](shots/proto-d9-knowledge-light.png) · [dark](shots/proto-d9-knowledge-dark.png) |
| dock 开始页 | D11 | [D11-dock-start.md](./D11-dock-start.md)（**去留 = 待用户裁决 · 单列**） | [start light](shots/proto-d11-dock-start-light.png) · [dark](shots/proto-d11-dock-start-dark.png) |

## 走查结论总表

| 面 | 走查判定 | 样式性残差 | 范围性记账（数据/功能面，不收口） |
|---|---|---|---|
| D7 知识召回 tab | 卡语言主体已对齐（分组浮卡行 + verb 胶囊 + 点击跳详情语义同构） | **1 项**：统计头 = 文本行 ↔ 原型 pill 胶囊 ×4（R1） | 反馈统计/沉淀分组/状态置信徽章（R4/R6/R7） |
| D8 hero 面板 | 构图同构对齐；项目选择弹层官方件优于原型 mock | **1 项**：鲸绘插画高 85% ↔ 原型 80%（R2，一行 CSS 量级） | 文案场景语义拆分/CTA 超集/模式 pill（R3/R4/R6） |
| D9 知识面板 | **M3.8 对齐结论复核成立**（布局刻度逐值一致，零样式残差） | 0 项 | 统计分析/召回日志页签、状态过滤/抽取、会话下钻（R3/R4/R5） |
| D11 dock 开始页 | 产品无开始页；官方 guide 入口卡承载同职能导航 | —（去留本身 = 裁决项） | **待用户裁决**（选项 A 保留 / B 裁除记账，见 [D11 memo](./D11-dock-start.md) 第三节） |

**SPEC 勘误记账两条**（行文 ↔ 原型实物不符，走查按原型实物口径）：① D7「verb 分色胶囊」——原型实物为单色胶囊；② D11 卡片清单行文「项目概览/文档/新会话」——原型实物「项目概览/知识库/审核工作台」。

## 证据口径与限制（诚实声明）

- **原型侧截图** = 目标形态基线实拍（playwright + chromium，1680×980，与 [`prototype/shots-m31.cjs`](../prototype/shots-m31.cjs) 同 harness；亮/暗双主题；生成脚本 [capture-prototype.cjs](./capture-prototype.cjs) 随档可复现：`node capture-prototype.cjs`）。截图内容经 DOM 探针验证非空壳（召回 15 行 + 4 统计 pill；hero 相位 + 鲸绘在场；知识面板 23 域行 + 18 卡；开始页 3 卡含待审徽标）。
- **实现侧证据** = 代码锚点对照（各归档文件逐行锚 `apps/web/src/...` ↔ `prototype/...`）。**实机截图本轮未产出**：产品 web 面 = Electron 壳（无独立 HTTP dev 面，`just probe` 口径 = 宿主进程 + dist 产物）；会话内 GUI（`DSH_WEB_URL`）鉴权 401，子代理无凭据。**实机截图归 SC-8 用户终验时补拍**——各归档文件「实机走查清单」节即拍摄/走查动线（步骤 + 断言点），补拍后回填本目录（建议命名 `impl-d{7,8,9,11}-*.png`）。
- 本归档**不含任何裁决**：除记录既有裁决与勘误外，唯一开放决策 = D11 去留（单列待用户）。

## 生成环境

- 日期：2026-10-09（M3.1 轮内）；仓库 `main` @ `9a54649`（D26 注释清理已落；D1–D6/D21–D26 已在库——四走查面不涉这些改动面）。
- 工具：node 24 + @playwright/test（仓内 node_modules）+ ms-playwright chromium-1217。

## 1.13 终局验证补充归档（2026-10-10）

| 文件 | 内容 |
|---|---|
| [D28-dual-theme.md](./D28-dual-theme.md) | D28 双主题走查记录——弹窗/悬浮面板/下拉卡/插件行/新会话钮/rail 六面逐面（机制 + 令牌锚 + SC-8 实机动线） |
| [D1-D28-evidence.md](./D1-D28-evidence.md) | D1–D28 逐行证据汇总（差异清单打勾表）——质量门 + 零弱化台账汇总 + D27 盘点 + e2e 池记录，SC-8 签字底稿 |
