# quote-reference 版本台账（PROVENANCE）

## 版本纪律

1. 每修复一个 bug，bump patch 版本号（第三位）。
2. 每升级功能，bump minor 版本号（第二位）。

## bump 记录

| 版本 | 类型 | 说明 |
|---|---|---|
| 0.1.0 → 0.1.1 | patch | super-composer 提案累积缺陷修复面（2026-10-23 用户裁决） |
| 0.1.1 → 0.1.2 | patch | fix-25 发送消息引用块与用户文本空行分隔（bug 91135f89）：quote codec.serialize 输出 `\n\n` 前后包裹——官方 sinkSerialized 把 codec 输出与草稿切片零分隔拼接，块与相邻用户文本粘连；官方 defaultSink 末端 trim 保证引用块在消息首尾不残留空行 |
| 0.1.2 → 0.1.3 | patch | fix-26 相邻引用块间双空行归一化（bug 8ef4525f）：逐块 `\n\n` 包裹在相邻两块间叠加为 4 换行（2 空行）——quote-reference client 对 conversation 服务 sendSession 方法 wrap（AGENTS §1.1 合法缝），含 quote 块消息在全文汇聚点把连续 ≥3 换行收敛为恰一空行、首尾 trim；无 quote 块文本零改动（非介入面零行为差异） |
