---
status: "completed"
started: "2026-09-21 08:24"
completed: "2026-09-21 08:24"
time_spent: ""
---

# Task Record: fix-3 Rebuild stale upstream lib artifact (worker.cjs) breaking session rename/resume

## Summary
会话重命名失败(resume failed: lib/worker.cjs 缺失)根因: vendored lib/ 是上游构建产物投影, 上游 checkout 构建状态过期混杂(旧 lib/types × 新 src, clean:false+tsbuildinfo 跳过), tsdown cjs 产物从未生成; resume 时懒加载才暴露。定点重建两包(tsc -b + tsdown host 面)后重投影 lib; install-host-closure 增加构建产物金丝雀(worker.cjs 缺失→安装期失败+上游重建提示, 负向测试已验证); sweep 增加重命名回归步骤。15/15 PASS。

## Changes

### Files Created
无

### Files Modified
- scripts/install-host-closure.mjs
- scripts/acceptance/live-ui-sweep.mjs

### Key Decisions
- 上游定点重建(只清两包过期产物)而非全仓 clean, 不扰动用户 checkout 的其他构建状态
- 金丝雀守卫把静默的首用失败前移到安装期
- 重命名作为 persistence resume 路径的回归步骤入 sweep(操作按钮 hover 显现)

## Test Results
- **Tests Executed**: Yes
- **Passed**: 15
- **Failed**: 0
- **Coverage**: 0.0%

## Acceptance Criteria
无

## Notes
无
