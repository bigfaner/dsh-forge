---
created: "2026-10-11"
author: "faner"
status: "Draft"
intent: "enhancement"
---

# Proposal: 任务 UI 视觉与文案对齐——内容结构/文字简约/图标/诊断提示词/DAG 箭头（task-ui-visual-copy-blitz）

> **定位**：任务相关 UI 十点走查优化批次二（视觉文案面）；姊妹批次一（信息密度面）见
> `task-ui-info-density-blitz`。本批六点：任务内容块对齐原型、**任务面板文本结构化展示（整面
> 吸收 worker-lean-execution 原 S4——Note 折叠/结构化提交消费展示/ResultView 与目标收起
> 展开）**、弹窗扩大缩小图标对齐 dockkit、诊断提示词自包含、DAG 箭头走向、**概览子 tab
> 状态 chip 加宽防内部换行**。
> **血统注记**：前版 `task-ui-visual-copy`（expedition 血统）因 plugin-forge mode 溯源
> 读会话出生头而非当前预设投影（根因 2026-10-11 查实）注册错档，本行 = blitz 重注册。

## Problem

六个视觉/文案病灶（用户实机走查裁决 2026-10-11，代码级证据）：

1. **任务内容块与原型漂移**：M3.1 走查原型任务内容段序 = 目标 → 变更范围 → 实现要点 →
   测试要点 → 验收标准 → 参考文档 → 备注（prototype app.js 任务内容块组装
   `.forge/docs/proposals/dsh-forge-m3.1-ui-alignment/prototype/app.js:1716-1726`；类型模板
   impl/tests 缺席不渲染 :1688-1689）；现实现 = 目标/结果对行 + 类型模板，coding 族模板仅
   参考文档 → 改动范围（预期↔实际双列）→ 验收标准（coding.tsx:91-107）——**缺实现要点/
   测试要点段**。原型以 coding 为示例，各类型各有模板（routing 7 族路由 20 类型）、字段有
   差异、**没有则不展示**（用户裁决口径）。
2. **任务面板长文本整段平铺（吸收 worker-lean-execution 原 S4——病灶 4 后半）**：
   时间线 submit 记录 summary 纯文本内联 Note 无折叠、无行结构保留（timeline.tsx:272-314
   ——summary 内联 :284-294）；「目标/结果」对行 ResultView 把整段 summary 内联塞进一个
   span（drawer/index.tsx:210-242——submitted 档 :218-230）；目标回退链
   goal→scenario→taskDesc→title（detail-model.ts taskGoalOf:106-114）——taskDesc 多行
   长文整段平铺；AC 结果/决策/分类字段无结构化展示（worker-lean S3 结构化提交入库后
   面板无消费面）。原 S4 已裁决「默认收起显首行 + 点击展开 + 保留换行」交互与结构化提交
   消费——2026-10-11 对齐裁决整面移交本批承载（worker-lean 聚焦 worker 效率：提示词端 +
   数据端，见其裁决 27）。
3. **扩大/缩小按钮两态同图**：弹窗 ⤢ 恒用 IconFullscreenOutlineMedium（drawer/index.tsx
   :509-519），简要/完整两态无视觉区分（D37 现状：官方 primitives 无 shrink 专用件——
   单图标 + aria-pressed 承载，drawer/README.md「图标对缺口记账」）；dockkit PanelChrome
   全屏/退出全屏 = 两图形随状态翻转（FullscreenGlyph 填充四角 / ExitFullscreenGlyph 描边
   括弧——dsh-client-ui-sidebar-right client.js PanelChrome）。
4. **诊断消息含 UI 指路括注**：formatDiagMessage 任务失败请求行尾「（任务时间线见概览 →
   任务子 tab → 该任务详情）」（message-format.ts:226）——接收 agent 无 GUI 相关工具，
   指路悬空；且任务目标未内嵌，消息不自包含（任务行已为「编号+标题」格式——姊妹批 S3
   已落地；子图请求行的「五类检查 = …」括注为检查词汇说明、非 UI 指路，保留）。
5. **DAG 箭头恒向下**：边路径 `M x1,y1 C x1,y1+arm, x2,y2-arm, x2,y2`——两控制点分别
   与起终点同 x（dag-layout.ts:159-168），终点切线恒垂直；斜向边（源/目标横向错位）
   线体斜走、箭头却垂直向下扎进节点顶，视觉不契合。
6. **概览子 tab 状态 chip 内部换行**：三族状态 chips 固定统一宽 78px（D44 裁决——
   overview.css .dswf-ov-stchip:218-232 / feature-tab.css:29 / proposal-tab.css:29 三族
   同值互指），「已完成 + StateDot + 两位计数」实测放不下（3 字 39 + gap 6×2 + 点 8 +
   计数 ~15 + 内距 4 ≈ 78 贴边，计数两位/字号渲染即溢出）——内部文字换行把 24px 高的
   胶囊挤成两行（用户实机例：「 已完成 12 」换行）。

## Solution

六条改动线（纯呈现/几何/文案面，零数据迁移）：

### S1 任务内容块对齐原型（点 1）

- 块内段序对齐原型：目标（简约——S2）→ 类型模板（20 类型路由，字段缺席不渲染）→
  覆盖率/备注尾段（现序保留）。
- coding 族模板补**实现要点**（vars.impl）/ **测试要点**（vars.tests）段位——有数据才
  渲染，缺席不出现空段。
- 「改动范围」保持现实现的预期↔实际双列 + 差异摘要（比原型单列强，保留不动）。

### S2 面板文本结构化展示（点 2——整面吸收 worker-lean-execution 原 S4）

- **timeline submit 记录 Note**：默认收起（显示首行/前几行），点击展开全文，**保留换行**
  （多行摘要按行呈现，不压成一串）；
- **结构化提交消费（消费 worker-lean S3 结构化列）**：AC 数组逐项徽标渲染（✓/✗ +
  criterion + 一行证据），收起态「AC N/M ✓」计数；keyDecisions 决策行分列；**分类字段
  按 category 渲染**（doc/test/validation/gate 字段组）——数据来自 task_records 的
  `ac_json` / `record_fields_json`（该提案交付），非文本解析；**字段缺席（历史记录/
  该提案未交付）= 降级纯文本行结构**（fail-soft）；
- **「目标/结果」对行**：多行文本保留行结构，长文本收起/展开与时间线同款交互；
- **目标文本**：taskDesc 多行长文同等收起/展开处理（原 S4 未覆盖，本批补齐）；
- 纯文本结构化 + 折叠即可，**不引入 Markdown 渲染组件**（原 S4 裁决维持）；
- 历史已存长摘要同样受益（渲染面改动，无数据迁移）；
- 收起/展开交互**组件单源**（Note/ResultView/目标同件复用）；
- 数据端摘要契约与结构化入库（worker-lean S3）不在本批；本批只做展示端消费。

### S3 弹窗扩大/缩小图标对齐 dockkit（点 7）

- 弹窗 ⤢ 翻转钮改用 dockkit 全屏/退出全屏同款两图形：简要态 = FullscreenGlyph
  （填充四角）、完整态 = ExitFullscreenGlyph（描边括弧），随展开态翻转。
- 图形按 bundle 自含纪律内联复刻（SVG path 直拷——禁 import 上游运行期包），
  视觉走查比对 dockkit 原图。

### S4 诊断提示词自包含（点 9）

- 请求行去掉「（任务时间线见概览 → 任务子 tab → 该任务详情）」括注。
- 消息直接内嵌必要信息：增「目标：」行（goal/taskDesc 首行级摘要）；既有容器
  （@path/所属/摘要/阶段）、任务（编号+标题——姊妹批 S3 格式）、状态+原因、
  失败记录 ≤3 保留。消息对无 GUI 工具的 agent 自包含。

### S5 DAG 箭头契合线走向（点 10）

- 边几何改**终点切线随源→目标向量**：控制臂按 dx 分量偏置，斜向边对角进入目标节点，
  垂直边不变（垂直进入）；marker orient=auto 本就沿切线定向——几何改向后箭头方向
  自然贴合线走向。改动面 = dag-layout.ts 纯函数（渲染层零变化）。

### S6 概览子 tab 状态 chip 加宽防换行（点 6）

- 三族状态 chip 固定宽 78px → **加宽至容纳最长内容**（3 字标签 + StateDot + 两位计数
  实测不溢出的刻度，~90px 档；三族同值——overview.css / feature-tab.css / proposal-tab.css
  三处同改，维持 D44「三族零漂移互指」口径，仅替换数值）。
- 兜底加 `white-space: nowrap`（label/count 两侧 span 均不折行）+ `flex-shrink: 0`——
  刻度再漂移也不允许胶囊内部换行。
- ✕ 重置钮 auto 宽形态保持不动（D44 原口径）；「✕ 重置」钮与等长互指口径随数值更新。
- 本项**部分取代 D44 的 78px 数值裁决**（固定统一宽形态保留、仅换值）——落地注记入
  drawer/README 同源走查台账（overview README chips 段）。

## Alternatives

| 方案 | 取舍 | 结论 |
|---|---|---|
| do nothing | 内容漂移/长文平铺/两态同图/指路悬空/箭头垂直维持 | 落选（用户实机走查裁决） |
| Markdown 渲染长文本 | 表达力强，但违背原 worker-lean S4 裁决（双端契约+折叠已够——裁决随 S4 吸收本批）且引入渲染组件依赖 | 落选 |
| 目标/结果换短字段数据源（goalShort 等） | 数据端一次到位，但摘要契约归 worker-lean S3（提示词端）；纯渲染收起/展开即可达简约 | 落选（数据端契约成熟后可再收敛） |
| 任务内容全套 20 类型逐字段重设计 | 全量对齐彻底，但原型仅 coding 示例、其余类型无原型基准，重设计无锚 | 落选——仅补齐原型已示段位，其余类型模板维持现字段集 |
| 十点单提案一次收口 | 省协调，但与信息密度面性质/测试面不同 | 落选（用户裁决拆两批） |

## Scope

**In Scope（交付物级）**：

1. 任务内容块段序对齐 + coding 族模板补实现要点/测试要点段（字段缺席不渲染）
2. 面板文本结构化展示（吸收 worker-lean 原 S4 整面：timeline Note 折叠 + 结构化提交
   消费——AC 徽标/决策分列/分类字段按 category 渲染，消费 ac_json/record_fields_json，
   缺席降级纯文本 + ResultView/目标收起展开；交互组件单源）
3. 弹窗扩大/缩小钮图标复刻 dockkit 两图形 + 状态翻转
4. 诊断消息自包含改写（去 UI 指路括注 + 目标行内嵌）
5. DAG 边终点切线几何改向（箭头贴合线走向）
6. 概览子 tab 状态 chip 加宽（三族同值 78px→容纳刻度 + nowrap 兜底，三处 CSS 同改）
7. 测试随迁（dag-layout 几何断言、message-format 快照、drawer/type-templates/timeline
   组件测试——含结构化列有/无两态夹具、status-chips 宽度/nowrap 断言）

**Out of Scope（含理由）**：

- 提示词端摘要契约与结构化提交入库（summary 行协议/submitTask 结构化字段/ac_json/
  record_fields_json 列——worker-lean-execution S3 所有；本批仅展示端消费其列）
- Markdown 渲染（原 S4 裁决：纯文本 + 折叠）
- 20 类型模板字段全集重设计（无原型基准——仅补原型 coding 示例已示段位）
- 信息密度批次内容（会话名/跳转/命名/面板标题/worker 钮——姊妹提案
  `task-ui-info-density-blitz`）

## Risks

| # | 风险 | 缓解 |
|---|---|---|
| R1 | 结构化提交消费依赖 worker-lean S3 数据端（ac_json/record_fields_json——跨提案依赖，交付顺序不定） | 展示 fail-soft：字段缺席降级纯文本行结构（历史记录/先行交付态均可运行）；S3 交付后结构化展示自动生效 |
| R2 | DAG 几何变更破坏 dag-layout 纯函数快照断言 | 几何断言随迁 + 新增终点切线方向断言（垂直边回归锚） |
| R3 | 图标内联复刻与 dockkit 原图漂移（path 手拷误差） | path 数据直拷上游产物 + 视觉走查截图比对（走查件归档不提交） |
| R4 | 诊断消息快照变更牵连 DiagToast/4.4 导出面 | message-format.test 快照一次随迁（导出面同源单源，零额外改码） |
| R5 | 收起/展开引入组件状态破坏纯渲染体可测性 | 展开态受控化（props 注入或装载壳本地态——设计期定），组件测试喂两态夹具 |
| R6 | chip 加宽与 D44 78px 数值裁决冲突（三处 CSS 同值互指漏改一处即漂移） | 三处（overview.css/feature-tab.css/proposal-tab.css）同批同值改 + 互指注释数值随迁 + 组件测试断言；固定统一宽形态本身保留不改 |

## Success Criteria

| # | 判据 | 度量面 |
|---|---|---|
| SC1 | coding 族模板：impl/tests 有数据时段位渲染、无数据不渲染 | 组件测试（两态夹具） |
| SC2 | timeline Note 与 ResultView/目标多行文本默认收起显首行、点击展开、保留换行；历史长文本同生效 | 组件测试（多行夹具 + 旧格式夹具） |
| SC3 | 结构化提交消费：带 ac_json/record_fields_json 的 submit 记录呈现 AC 徽标逐项（收起「AC N/M ✓」）、决策分列、分类字段按 category 渲染；字段缺席降级纯文本行结构 | 组件测试（有/无结构化列两态夹具） |
| SC4 | 弹窗两态图标 = dockkit 同款两图形随展开态翻转 | 组件测试 + 视觉走查 |
| SC5 | 诊断消息不含 UI 指路括注、含目标行；其余行保留 | message-format 快照断言 |
| SC6 | 非垂直边（dx≠0）终点切线方向与源→目标向量一致（箭头贴合线走向）；垂直边不变 | dag-layout 几何断言 |
| SC7 | 三族状态 chip 固定宽容纳「3 字标签 + StateDot + 两位计数」不换行（label/count span nowrap；✕ 重置钮 auto 宽不受影响）；三处 CSS 同值零漂移 | 组件测试（markup 断言）+ 视觉走查 |

**一致性检查（2026-10-11 S4 吸收 + S6 增补后重核）**：SC1↔交付 1；SC2/SC3↔交付 2；
SC4↔交付 3；SC5↔交付 4；SC6↔交付 5；SC7↔交付 6；交付 7 承载全部断言随迁。七条 SC
每条有 In-Scope 交付项承载；无悬空 SC，无无消费交付，SC 间无互斥。**检查结果：一致，
无冲突。**

## 用户裁决记录（brainstorm 对话，2026-10-11）

1. 十点走查清单（原始输入）：本批承载第 1/2/7/9/10 点（内容结构/文字简约/图标/提示词/
   箭头），第 3/4/5/6/8 点归姊妹批 task-ui-info-density
2. 文字简约方式：按 worker-lean-execution 提案提取要求——原 S4 收起/展开 + 行结构保留 +
   结构化提交消费（后整面吸收到本批——见裁决 6）
3. 任务内容对齐口径：原型以 coding 为示例；不同类型不同模板、字段有差异、**没有则不
   展示**（选项裁决）
4. 范围边界（裁决 6 部分修正）：不加 Markdown 渲染（选项裁决）；提示词端摘要契约与
   结构化入库归 worker-lean S3——本批仅展示端消费
5. 交付形状：十点拆两提案分批——视觉文案批（本提案）+ 信息密度批（选项裁决）
6. S4 整面吸收（2026-10-11 再次对齐裁决：「UI 相关的内容吸收到过来，原提案聚焦于 worker
   效率提升」）：timeline Note 折叠 / 结构化提交消费展示（AC 徽标逐项/决策分列/分类字段
   按 category 渲染）/ ResultView 与目标收起展开全部由本批承载——worker-lean-execution
   S4 交付项随迁移除（其裁决 9 落地面随迁、裁决 27 记录移交）；AC 对照消费该提案 S3 的
   ac_json/record_fields_json 结构化列，缺席 fail-soft 降级纯文本
7. 状态 chip 加宽（2026-10-11 实机补充：「 已完成 12 」内部换行——chips 长一点、
   文字不换行；归本批视觉面，S6 承载）

## 代码核对记录（结合最新代码修正，2026-10-11）

逐病灶重核最新代码（apps/web/src/views/overview/），病灶事实全部仍成立，修正项：

1. **原型锚更名**：前版引用「prototype app.js fillTaskModal:1716-1726」——`fillTaskModal`
   在全部原型产物中不存在（grep 零命中）。实际锚 = M3.1 走查原型
   `.forge/docs/proposals/dsh-forge-m3.1-ui-alignment/prototype/app.js` 任务内容块组装
   :1716-1726（类型模板 impl/tests 缺席不渲染 :1688-1689）——Problem 1 与 S1 已改引。
2. **行号漂移随姊妹批落地**（task-ui-info-density-blitz 已交付：detail-model 增
   sessionTitleOfOrId/sessionJumpHandler 等，drawer/timeline 行号后移）：Problem 2/3/4
   代码锚全部重标——timeline submit :272-314、ResultView :210-242、⤢ 图标 :509-519、
   taskGoalOf :106-114、message-format 括注 :226。
3. **S4 边界澄清**：任务失败诊断任务行已是「编号+标题」格式（姊妹批 S3 落地）；子图
   请求行「五类检查 = …」括注为检查词汇说明、非 UI 指路——S4 只去任务失败行 UI 括注，
   不动子图括注。
4. **S3 现状注记**：drawer/README.md 已记「官方 primitives 无 shrink 专用件——单图标 +
   aria-pressed（图标对缺口记账）」——本批 S3 即该缺口的收口面，现况注记入 Problem 3。
5. **核对未变锚**：coding.tsx:91-107（模板渲染体）、dag-layout.ts:159-168（边路径几何）、
   20 类型 7 族路由（type-templates/routing.ts）、worker-lean S3 结构化列
   （ac_json/record_fields_json）代码库中尚无实现（grep 零命中）——R1 fail-soft 依赖
   仍在交付前态，提案面无需改动。
6. **S6 代码核实**：换行根因 = D44 三族状态 chip 固定统一宽 78px（overview.css
   .dswf-ov-stchip:218-232——宽 78/内距收窄 0 2px/内容居中；feature-tab.css:29 与
   proposal-tab.css:29 同值互指）；StatusChips 同件三 tab 复用（status-chips.tsx——label
   :69 / count :70 两侧 span，无 nowrap）；✕ 重置钮 :256-260 auto 宽不参与等长。
   「3 字 39 + 点 8 + 两位计数 ~15 + 内距 12 ≈ 74」为 D44 估算口径，实测两位计数 +
   字号渲染即溢出 78px（用户实机换行例）——加宽 + nowrap 双保险（S6）。
