---
title: gate 留痕附退出码终态行——审计面不靠推断
summary: '质量门留痕统一附退出码终态行（如 `lint:types exit 0`），审计时可直接核验门终态，不靠输出内容推断成败。'
keywords:
  - gate
  - exit-code
  - 留痕
  - audit
status: unconfirmed
source_container: e2e-known-reds-triage
source_task: 1.11 评审 minor
source_bug: —
id: gate-log-exit-code-line
type: conventions
version_ts: '2026-11-05T00:00:00.000Z'
---

# gate 留痕附退出码行

## 规则

质量门执行留痕的末尾统一附一行退出码终态，如：

```text
lint:types exit 0
```

- 审计面据此直接判定门终态，不依赖对日志输出内容的推断（日志可能截断、可能含 warning 但整体通过）。
- 非零退出同样格式：`test:e2e exit 1`，配合失败摘要定位。

## 边界

适用于所有 run-once 质量门（compile/lint/test/e2e）的执行留痕；交互式过程记录不强制。
