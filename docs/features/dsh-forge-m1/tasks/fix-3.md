---
id: "fix-3"
title: "Rebuild stale upstream lib artifact (worker.cjs) breaking session rename/resume"
priority: "P0"
estimated_time: "20min"
dependencies: []
status: pending
breaking: false
type: "coding.fix"
---

# Rebuild stale upstream lib artifact (worker.cjs) breaking session rename/resume

## Root Cause

会话重命名失败: `resume failed for session ...: Cannot find module .../session-persistence-jsonl/lib/worker.cjs`。vendored lib/ 是上游构建产物的投影(install-host-closure 第 5 步), 上游 checkout 的构建状态过期混杂(旧 lib/types × 新 src, `clean:false` + tsbuildinfo 增量跳过), tsdown 的 cjs 产物 worker.cjs 从未在当前树中生成。宿主在 resume(migration-verifier) 时懒加载该文件 → 用户首次重命名才暴露。构建依赖层与 fix-2 的数据层同构: vendored 树没有"构建产物新鲜度"保证。

## Fix

上游定点重建: 清理 session-persistence-jsonl 与 session-persistence 两包的过期 lib/tsbuildinfo → `tsc -b`(项目引用) → 包内 `tsdown --env.DSH_BUILD_FACE host`(产出 lib/index.js + lib/worker.cjs 469KB 依赖内联) → lib 重投影到 vendored。install-host-closure 增加 built-artifact 金丝雀(worker.cjs 缺失即安装期失败并提示先跑 `pnpm run build:lib:host`), 头注释写明上游需新鲜构建的前置条件。sweep 增加重命名回归步骤(hover 显现操作按钮 → 重命名 → persistence resume 完整路径)。

## Verification

- rename 探针: RENAME_OK, 标题更新, 转录完整恢复(缓存命中 99.7%), 零 resume failed
- live-ui-sweep --send: 15/15 PASS(新增重命名步骤 3.4s)
- install-host-closure --check: CLOSURE_CHECK_OK(金丝雀在位)

## Acceptance Criteria

- [ ] vendored packages/session/session-persistence-jsonl/lib/worker.cjs 在位
- [ ] UI 重命名会话成功且转录可恢复(无 resume failed)
- [ ] install-host-closure --check 金丝雀通过; 删除 worker.cjs 后 --check 失败并给出上游重建提示
- [ ] live-ui-sweep --send 15/15 PASS
