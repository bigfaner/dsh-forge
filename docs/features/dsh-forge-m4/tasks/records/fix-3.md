---
status: "completed"
started: "2026-09-30 12:35"
completed: "2026-09-30 12:53"
time_spent: "~18m"
---

# Task Record: fix-3 Fix: detached window title — renderer document.title overrides main-process 「项目名 · 视图名」

## Summary
P-1 修复:detached 窗 OS 标题被渲染层 document.title 覆写。根因 = Electron 默认把渲染层 document.title 申请原生应用到窗题(page-title-updated 未被拦截),vendored SPA 自设标题(实测 ["DSH 本地构建","MW 顶层会话 B — DSH 本地构建"],无「·」)盖掉主进程 composeDetachedTitle 组装值,违反 M4 窗口角色 boot 契约「标题归主进程」(C10/4.3)。修法(主进程侧,渲染层零改动):manager.adoptHostWindow 注册 page-title-updated 守卫 —— preventDefault 挡下渲染层申请 + 重申主进程组装值(经 titleOf 在事件时点重算,归档追加分即时合并);DetachedHostWindow 接口补该事件面;index.ts 宿主适配器 on 显式分派 close/page-title-updated 两事件。M1 主窗 createWindow 零触碰(byte-stable)。验证:两处 P-1 e2e 转绿(step-2 2/2 含此前 DNR 的 main-pane-rearrange;smoke 1/1 全旅程含 Step 2 标题断言);windows-detached 单测 31/31(新增 4 个标题权威测试:挡下+重申/归档追加分事件时点合并/restore 后无追加分/幂等重申);全单元道 2452 绿/2 跳过;compile 门 479/226;回归探针 sc3-degrade/shell/sc1/sc2 全绿;e2e 批次前单实例锁探测(无活跃实例)、仅重建 desktop dist(插件产物新鲜)、workers:1。

## Changes

### Files Created
- docs/features/dsh-forge-m4/tasks/process/record-fix-3.json
- docs/features/dsh-forge-m4/tasks/records/fix-3.md

### Files Modified
- apps/desktop/src/main/windows/detached.ts
- apps/desktop/src/main/index.ts
- apps/desktop/tests/windows-detached.spec.ts

### Key Decisions
- 守卫落位 manager.adoptHostWindow 而非 index.ts 构造点:detached.ts 是纯 DI 面(零 Electron 依赖),标题权威语义可单测直证;构造入参 title 仍是首帧标题(构造即组装),此后渲染层每次 document.title 申请都被逐次挡下并重申。
- 重申值经 titleOf 闭包在事件时点重算(而非缓存构造期字串):归档/恢复的追加分随下一次渲染层申请即时合并,与 setProjectArchived 的主动 setTitle 刷新互补,不待下次开窗。
- 仅 detached 径:M1 主窗无此守卫,标题行为保持 byte-stable(createWindow 零触碰);index.ts 适配器 on 面按事件名显式分派,不引入泛型转发。
- 渲染层零改动:vendored SPA 继续设 document.title(页内语义保留),仅 OS 窗题不再被夺;e2e 识别 detached 窗本就用内容标记(data-dsh-forge-detached-board),helpers/windows.ts 零影响。
- 附带闭合:windows-detached.spec 构造失败腿 harness 补 archivedSuffix 依赖(vitest/esbuild 不查类型,scoped tsc 暴露的存量缺参 —— 纯类型补齐,零行为变更;顺手修因在本次触达文件内)。

## Test Results
- **Tests Executed**: Yes
- **Passed**: 2452
- **Failed**: 0
- **Coverage**: 97.6%

## Acceptance Criteria
- [x] P-1 两处 e2e 失败转绿:multi-window-tearout/smoke.spec.ts(Step 2 标题断言及全旅程)+ step-2-tearout-window.spec.ts step2/success —— 真链 OS titles 含「·」
- [x] 修法落在主进程窗口域(标题归主进程契约),M1 主窗行为 byte-stable(createWindow 零触碰)
- [x] 单元面绿:windows-detached 31/31(含新增 P-1 标题权威测试)+ 邻接 windows 域 41/41 + 全单元道 2452/0
- [x] 回归探针绿:sc3-projection-degrade / shell / sc1-zero-cli / sc2-migration
- [x] 范围纪律:P-2..P-7 六缺口零触碰(一源一活跃 fix 门)

## Notes
证据:.forge/e2e-logs/fix3-step2.log、fix3-smoke.log、fix3-regress.log(修复前对照 = j5-rerun2.log:OS titles 无「·」)。覆盖率口径:coverage 字段取 detached.ts scoped v8 statements 97.56%(branches 79.54% / functions 100% / lines 100%)。P-1 之外的 12 失败 + 12 DNR 原样站立:P-2(二次拆出复用窗)等六缺口未触碰;T-test-run 维持 blocked 直至全 lane 过。smoke 全绿含 Step 5 —— 本腿流程(recall 后再拆出 ×2)下 P-2 未复现;P-2 的权威证据仍在 step-5-second-tearout-set.spec(本次未跑,超范围)。构建纪律:仅重建 apps/desktop dist(main.cjs 12:45);插件源零触碰,lib/tarball mtime(08:13)晚于最后插件提交(04:12)判新鲜;每批次前单实例锁探测均无活跃实例。执行前核verify:forge prompt 的 fix-record-missed 前提不成立(工作树零实现、无 fix-3 提交)—— 按派发指令实施修复而非 blocked(与 fix-2 同款处置)。
