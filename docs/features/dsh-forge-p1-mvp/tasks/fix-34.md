---
id: "fix-34"
title: "Fix(P1): clean code 紧要批——契约注释承诺漂移（ERROR_NAMES/FRONTMATTER_KEYS 声称被消费实则零引用）+ dswf-kn-retry 孤儿类名（用户可见）+ e2e closeApp 竞态全员设防 + 跨包 StubRegistry 桩五份收编"
priority: "P1"
estimated_time: "4h"
complexity: "medium"
dependencies: []
surface-key: ""
surface-type: "web"
breaking: false
type: "coding.fix"
mainSession: false
---

# Fix(P1): clean code 紧要批（三路评审 P1 项集中）

> 来源：三路 clean code subagent 评审（2026-10-04：服务端 B+ / 客户端 A- / e2e 基建 B）的 P1 项打包。

## 清单（逐项独立）

1. **契约注释承诺漂移**（密集注释库最伤信任的「说了没做」）：
   - [contracts/src/errors.ts:17-34](../../../packages/contracts/src/errors.ts)：注释称「core 侧据此定义错误类」——core 错误类（forge/errors.ts:16-56、knowledge/errors.ts:13-45）手写字面量从未消费 ERROR_NAMES；且 `ERROR_NAMES`+`ErrorCodeNameMap` 零生产消费（仅自测）+ 同映射写两遍。**裁决二选一**：让 core 错误类真消费（`satisfies Record<ErrorCode,string>` 单份化）；或删除死常量 + 注释降格为「文档性映射」；
   - [contracts/src/frontmatter.ts:2](../../../packages/contracts/src/frontmatter.ts)：注释称「解析器执行本常量」——parser 仅消费 6 常量中 2 个，FRONTMATTER_KEYS/REQUIRED/OPTIONAL 三清单 parser 零引用（必填校验是手写 if，parser.ts:88-96）。同上二选一（驱动化 parser 校验，或注释降格）；
2. **用户可见瑕疵**：[KnowledgeCardGrid.tsx:123](../../../apps/web/src/views/knowledge/KnowledgeCardGrid.tsx)、[EntryDrawer.tsx:219](../../../apps/web/src/views/knowledge/EntryDrawer.tsx) `dswf-kn-retry` 类名全仓 CSS 零规则——错误条重试钮呈浏览器默认按钮样式，与 sidebar/recall 文本钮形制不一致。补规则（照 `.dswf-recall-retry` 刻度）或复用 `.dswf-kn-textaction`；
3. **e2e closeApp 竞态全员设防**：session-workbench/krf/p1mvp-installer 三 spec 用裸 `app.close()`，而其余 4 spec 有「进程退出等待 + 2s 静置」防句柄/端口复用竞态（自注已知问题）——同一竞态未全员设防，Electron 挂起时无兜底。closeApp 统一入共享 helper（与 fix-37 e2e 支撑层衔接，本项先止血：三 spec 补等待）；
4. **跨包 StubRegistry 桩收编**（第 4/5 份拷贝，行为已分叉）：host projects-rpc.test:65-90（failCreate/failDelete 注入 + resolve 规范化）、knowledge integration-core.test:29-42（create 幂等）↔ core 内部三份（无注入）——CoreContextFace 演进时五处齐改。core 导出 testutil 桩（失败注入作 superset 选项），host/knowledge 复用。

## 验收

1. ERROR_NAMES/FRONTMATTER 承诺与消费对齐（驱动化或注释如实），死常量删除后测试全绿；
2. 知识错误条重试钮与 sidebar 形制一致（截图对照）；
3. 三 spec 补 closeApp 等待后 CI 无挂起回归；五处 registry 桩收敛为一 testutil（行为 superset 兼容各注入面）。

## Reference Files

- 见清单逐项定位；三路评审报告（本会话 2026-10-04）为规格源

## 边界与不做

- 驱动化 vs 降格的裁决交执行（倾向最小改动=降格+删死码）；不改六码语义与 parser 行为。

## 裁决记录（fix-34 收口，2026-10-04）

- **项 1 取「降格 + 删死码」**：删 `ERROR_NAMES` + `ErrorCodeNameMap`（零生产消费、同映射两遍）
  与 `FRONTMATTER_KEYS`/`REQUIRED`/`OPTIONAL` 三清单及其派生类型（parser 零引用）；表 Name 列
  降格为 `ERROR_CODES` 行尾文档性注释（`→ 类名` 形态），必填/可选口径由 `KnowledgeFrontmatter`
  形状承载；两契约测试收窄到被消费面（ERROR_CODES 行序 pin + 两常量 pin）。core 双域 errors.ts
  头注的「类名 = ERROR_NAMES 映射」失实引用同步改写实。六码值与 parser 行为零改动。
- **项 2 取「复用 `.dswf-kn-textaction`」**（其声明与 `.dswf-recall-retry` 逐条等值——形制一致性
  由结构等价承载）：`KnowledgeCardGrid.tsx` / `EntryDrawer.tsx` 错误条重试钮 className 换为
  `dswf-kn-textaction`，data 属性不变（测试锚不受影响）；孤儿类名 `dswf-kn-retry` 全仓清除。
- **项 3 止血形态**：三 spec（session-workbench / knowledge-recall-flywheel / installer-smoke）
  各内联 `closeApp`（进程退出等待 ≤10s + 2s 静置，hero-control 等 4 spec 同源复制），全部
  关闭点（6+6+4 处）改经 helper；共享 helper 收编归 fix-37 e2e 支撑层（注释内已留衔接锚）。
- **项 4 superset 形态**：`packages/core/src/testutil/registry-stub.ts` 单份 `StubRegistry`
  （records/dirs/createCalls/deleteCalls 断言面 + failCreate/failDelete/failList/beforeDelete
  注入面 + seed/get/list/create 幂等/delete 幂等 no-op）；五处拷贝（core project-service /
  reconcile-queries / service + host projects-rpc + knowledge integration-core）全部改引单份，
  host/knowledge 沿测试面相对引入惯例（`*.test.*` 结构豁免，生产面边界零触碰）。
- 验证：`tsc -b` / `pnpm lint`（ox+imports+tokens+selftest+types）/ `pnpm test` 1009/1009 全绿；
  三 spec `playwright --list` 装载通过（21 tests/3 files）。截图对照 AC 以结构等价替代：
  两类名声明逐条相同 + `.dswf-kn-textaction` 既有渲染面（EmptyState 动作钮）已在历次 e2e 中
  实证，且 KnowledgeCardGrid/EntryDrawer 模块均直接 import knowledge.css。
