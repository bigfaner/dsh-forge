---
status: "completed"
started: "2026-10-03 13:29"
completed: "2026-10-03 13:56"
time_spent: "~27m"
---

# Task Record: fix-5 Fix: 知识浏览关键词交互缺陷——键入被弹回 + 卡片网格整体消失落「尚无知识」空库面（实测复现）

## Summary
知识浏览关键词交互缺陷修复：根因 = useKnowledgeBrowse 双状态源不同步——装载态（useState）内嵌的 state.filter 是上一次装载转移保留的滞后快照（pendingBrowseState/applyBrowseLoad 均取 prev.filter 透传，过滤派发 set-keyword/select-domain/clear-filters 不经装载转移），hook 原样 return [state, actions] 导致消费面（工具栏受控值、清除钮判据、域树高亮、browseFaceState 的 filterActive 分流）全读滞后快照：键入被受控 value='' 弹回、零命中（cards:[] + 快照空过滤）误落「尚无知识」空库面且无后续状态转移（表象即『过滤态被复位 + 卡死』——插桩证明不存在复位写入者，clear-filters 全程仅 mount 幂等一次）。修复 = use-knowledge-browse.ts 新增纯函数 consumedBrowseState(state, filter)（同引用原样返回，否则盖写 reducer 实时过滤态），hook 输出改 return [consumedBrowseState(state, filter), actions]；装载判定/转移纯函数面（browseLoadPlan/pendingBrowseState/applyBrowseLoad）、五锚装载机制、reducer 语义、官方件全部零改动（Hard Rules 遵守）。插桩证据（tmp-ui-review/fix5probe.mjs 修复前后同径对照）：修复前 body render kw=""（reducer 已消费 'z'）+ face=empty-library；修复后 input='z'→'zz'、无结果面（无匹配知识）+ 清除入口在场、稳态不落空库面、Esc 全量恢复、重进视图健康。

## Changes

### Files Created
- tmp-ui-review/fix5probe.mjs

### Files Modified
- apps/web/src/views/knowledge/use-knowledge-browse.ts
- apps/web/src/views/knowledge/use-knowledge-browse.test.ts
- e2e/specs/p1mvp/knowledge-browsing.spec.ts
- docs/features/dsh-forge-p1-mvp/tasks/fix-5.md

### Key Decisions
- 修复落点选 hook 输出合成（consumedBrowseState 纯函数）而非改装载转移纯函数面：Hard Rules 禁动 pendingBrowseState/applyBrowseLoad 语义，且滞后快照是 hook 双状态源接线缺陷，非转移函数缺陷
- 消费态合成走同引用快速路径（state.filter === filter 原样返回）——未过滤常态零对象合成
- e2e 缺陷信号转正：Step2b soft 记账转硬断言（受控值 + 无结果面 + 清除恢复），并按 AC5 补向导注册全径新用例（补 4.2/3.8 手动键入盲区）
- 插桩采用 globalThis.__KNDBG__ 环形日志 + CDP 探针 dump（复用前次会话净化 env 形态），验证后全部移除（git diff 仅剩修复 + 测试）

## Test Results
- **Tests Executed**: Yes
- **Passed**: 78
- **Failed**: 0
- **Coverage**: 62.0%

## Acceptance Criteria
- [x] 键入关键词：受控值即时更新（输入框显示键入内容、清除钮在场）；命中关键词过滤网格、不存在关键词落「无结果 + 清除过滤入口」面
- [x] 清除过滤（钮/Esc）恢复全量卡片；过滤期间旧卡片缓存先行不闪不丢
- [x] 域过滤（select-domain）与关键词组合过滤语义正确、互不复位
- [x] 根因结论入执行记录（插桩证据：复位写入者 + 受控值弹回机制）
- [x] 补 e2e：向导注册 → 知识视图 → 键入不存在关键词 → 无结果面 → 清除恢复
- [x] 既有单测与 e2e 零褪色；tsc + lint 全绿

## Notes
根因结论（AC4）：复位写入者不存在——『过滤态被复位』是装载态内嵌 filter 快照永久滞后的错觉；受控值弹回机制 = 消费面读滞后快照致 value='' 由 React 受控恢复落回 DOM。实机验证：node tmp-ui-review/fix5probe.mjs（Electron dev profile + CDP 直连，修复前后对照日志 tmp-ui-review/fix5probe-run{2,3,4}.log）。静态门：playwright --list 60 例通过、tsc -b 0 错、pnpm lint 全绿。单测：knowledge 8 文件 78 例全过（新增 consumedBrowseState 语义面 5 例）；覆盖率（v8，改动文件）：use-knowledge-browse.ts 62% stmts / 100% branch（未覆盖 = hook effect 胶水，归 e2e 面，文件头注释口径）。全量 e2e 由 submit 质量门执行。
