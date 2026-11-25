---
title: 夹具直写合成不构成实现能力证据
summary: 测试用 writeFileSync+裸 INSERT 手工构造产物形状（如归并台账行）而绕过被测执行面，绿测证明的是夹具不是实现——评审必查「生产代码有无该写径」。
keywords: [测试证据, 夹具, 直写合成, 评审]
type: lessons
status: unconfirmed
id: fixture-synthesis-is-not-implementation-proof
version_ts: 2026-11-05T09:01:00.000Z
来源容器: knowledge-stage2-write-gateway
来源任务: 1.10 评审
bug id: 6ca979cf
---

# 夹具直写合成不构成实现能力证据

distill-integration 测试「归并台账正确」的 AC 证据由测试手工 INSERT 台账行模拟——AC 核销证据失真。spec-reviewer 与 architect 两路独立命中同点。

判例：**断言某能力时，夹具只允许构造前置条件，不允许合成被断言的产物**；评审该类 AC 时先 grep 生产写径（如全包 grep `INSERT INTO knowledge_merge_ledger` 应命中服务面唯一处）。
