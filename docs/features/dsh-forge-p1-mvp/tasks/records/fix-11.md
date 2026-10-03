---
status: "completed"
started: "2026-10-03 16:26"
completed: "2026-10-03 17:30"
time_spent: "~1h 4m"
---

# Task Record: fix-11 Fix: p1-mvp e2e 失败三簇——轨迹台账未接线 / 知识段注入口径 / Step1c hero CTA 偶发隐藏

## Summary
p1-mvp e2e 三簇修复全数落地并复验：簇① 轨迹台账接线——WorkbenchPanel 装配新增 useConversation kit 钩子 + TranscriptAnchor（订阅官方 ConversationSnapshot → views.get('chat') → ChatSnapshot.legacy 兼容切片）+ transcriptOfChatSnapshot 纯函数（ConversationNode.kind wire 判别 → TranscriptEntry 语义类映射，装配层锚定，session README 表实跑收口），WorkbenchAssembly/SessionPanel transcript 注入贯通；簇② 知识段注入口径设计期裁决（B 侧）——知识段 = 能力性指引随插件加载无条件注入（tech-design Interface 3 静态注册 + 段文本自声明 may be registered + 两 tool 同为无条件注册 + 精确门控在设计边界内不可实现），contract/journey/spec 三处同步修订（Step2b/2c 翻 toContain、Step4d 按哨兵行口径重写：零命中 search = 已发生召回事件，计入召回次数不计覆盖/热度）；簇③ hero CTA 偶发 hidden 排障——当日 13 连 boot 未复现（4 诊断 + 6 单测重复 + 3 套件内），Step1c 内嵌失败取证（失败瞬间倾倒祖先 display/visibility/几何链 + 窗口尺寸 + 截图，断言零弱化）。随簇① 修复首次实跑到 sw Step4/5 与 flywheel 8b，暴露并修复两处潜伏真缺陷：client-plugin openSession 错接 ctx.sessions.open（Session Controller 无 open 面 → 行点击即 TypeError、会话切换/恢复全链哑）改接官方 uiWorkspace.openSession（retain(mainView)+selection 一体，inject 面增 uiWorkspace）；view-state select-session 不恢复 rightDock（知识视图隐藏后会话行切回右栏钉死收起）改与 show-session 同径按偏好恢复。冒烟断言稳健化（转录等值前活体静置窗 + 计时归一 + 长活体降级、恢复后轮询、8b 发送前回对话 tab——keep-alive 面板态保留为设计行为）。

## Changes

### Files Created
无

### Files Modified
- apps/web/src/workbench/WorkbenchPanel.tsx
- apps/web/src/workbench/WorkbenchPanel.test.tsx
- apps/web/src/workbench/ChatSurface.tsx
- apps/web/src/workbench/README.md
- apps/web/src/views/session/README.md
- apps/web/src/client-plugin/plugin.ts
- apps/web/src/client-plugin/plugin.test.ts
- apps/web/src/views/sidebar/ForgeSidebarSlot.tsx
- apps/web/src/views/sidebar/sidebar-actions.ts
- apps/web/src/shell/view-state.ts
- apps/web/src/shell/view-state.test.ts
- e2e/specs/p1mvp/session-workbench.spec.ts
- e2e/specs/p1mvp/knowledge-recall-flywheel.spec.ts
- docs/features/dsh-forge-p1-mvp/testing/knowledge-recall-flywheel/contracts/step-2-initiate-dsh-session.md
- docs/features/dsh-forge-p1-mvp/testing/knowledge-recall-flywheel/contracts/step-4-agentic-search-chain.md
- docs/features/dsh-forge-p1-mvp/testing/knowledge-recall-flywheel/journey.md
- tests/contract/pin-03-sidebar-slots.test.ts

### Key Decisions
- 簇②裁决 B 侧（无条件注入）：PRD Story 4 AC1 仅正向态、负向断言为 contract source:inferred 的 provisional 侧、Interface 3 静态注册无门控、段文本自声明 may be registered、两 tool 同为无条件注册（工具 schema 本就在场仅藏指引段不自洽）、精确门控不可实现（Interface 2 无路径反查/Hard Rule 禁第二 core 服务/绑定表不含知识目录/core 索引空态异步不可同步探测）——两侧不混改：代码零改，contract+journey+spec 一致修订并记 adjudication 注
- 簇②伴随哨兵行口径裁决：零命中 search = 已发生的召回事件（RecallGroup 契约一等分组 hitCount=0/hits=[]），计入召回次数、不计覆盖与热度（heatByEntry 排除哨兵行）；「本会话暂无召回」占位语义 = 零召回事件而非零命中
- 簇①映射表实跑收口：runningCalls（preparing|start 并集 = Wire 类型 RunningToolCall）单行映射 tool-running；partial（无 seq 流式态）→ assistant-message 尾行 seq=MAX_SAFE_INTEGER（落定即让位真实 seq 节点）；未知 kind 跳过（fail-soft）
- openSession 修正 = 官方 uiWorkspace.openSession（「Select a Session and show its Conversation as one UI navigation action」——内部 retain(source:'mainView')+selection.set 一体，历史恢复经此驱动）；Session Controller sessions 服务无 open 方法为实证（retain/using/create/fork/… 全表核对）
- select-session 右栏恢复与 show-session 同径（rightDock: rightDockPreference ?? false）——会话行切回是回会话视图主路径，唯一强制收起态 = 知识视图期，故恢复语义无歧义
- flywheel 冒烟残余红 = 既定设计：[链口径·缺陷信号] 组 expect.soft（召回次数 1 vs shipped per-call 2+、热度 +N）故意失败携带核心计数口径缺陷信号（fact-table FACT-TENSION #1，转正 = core 链口径裁决，M5+ 域）；soft 不中断但测试终态 failed——非本任务三簇范围、非回归
- 簇③处置：当日 13 连 boot 零复现（探针排除面维持有效），不强推猜测性产品修复；Step1c 内嵌失败取证把下次复现即时转为根因证据（ancestor 链 + boundingBox + innerWidth/Height + 截图，失败照常抛出）

## Test Results
- **Tests Executed**: Yes
- **Passed**: 984
- **Failed**: 0
- **Coverage**: 83.2%

## Acceptance Criteria
- [x] 簇① 轨迹台账接线：sw 冒烟 L378 与 flywheel 冒烟 L492-500（tool 行 ≥2 + search 先于 read-abstract 时序）转绿，禁止改这两处 e2e 断言
- [x] 簇① 改动面收敛在装配层（WorkbenchPanel.tsx + ChatSurface 窄面注记），投影/渲染面既有单测 pin 不动
- [x] 簇② 先裁决后动码：两侧不混改——B 侧（维持无条件注入）下 contract/spec 口径一致修订，Step2b/2c/4d 转绿
- [x] 簇③ 按 2s 轮询取证协议排障：boundingBox + 祖先 display/visibility 链 + 窗口尺寸 + 失败截图
- [x] 三簇对照原失败用例逐一复验（dispatcher 要求）
- [x] 单测/静态门：全量 vitest 绿 + tsc -b + oxlint（改动面）+ imports/tokens/selftest 绿

## Notes
复验账（最终全量重跑 session-workbench + knowledge-recall-flywheel 两套件，16 例）：11 过 / 4 留痕 skip / 1 败——唯一败例 = flywheel 冒烟的 [链口径·缺陷信号] soft 组（设计态缺陷信号，非三簇范围；其簇①轨迹断言组已绿且测试跑完全程至 7c 抽屉跳转与零写入不变式）。簇③ Step1c 当日 13 连 boot 零复现（含套件负载态），root cause 未钉，取证钩已内嵌。暴露并修复的潜伏缺陷：openSession 错接（sw Step4 恢复 60s 轮询全空 → 实证 sessions 服务无 open 面）、select-session 右栏不恢复（sw Step5）、转录等值活体计时陷阱（sw Step3）、8b 召回 tab 遗留（keep-alive 设计行为，测试侧回对话 tab）。测试口径：testsPassed/Failed = 全量 vitest 单测道（984/0）；e2e 道如上另记。coverage 83.2 = 主改动件 WorkbenchPanel.tsx 语句覆盖（runner 实测；plugin.ts/ChatSurface.tsx 100%、view-state.ts 81.8%）。环境：TMP 继承默认值未动（红线遵守），dogfood 真实凭据在场，全程无并发重负载干扰（早期一次 lint 并发致 firstWindow 假红已识别并干净重跑）。lint:ox 全仓失败仅源自他人会话遗留的未跟踪 tmp-ui-review/ 探针件（非本改动面，未触碰）。
