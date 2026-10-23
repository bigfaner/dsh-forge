# quote-reference 版本台账（PROVENANCE）

## 版本纪律

1. 每修复一个 bug，bump patch 版本号（第三位）。
2. 每升级功能，bump minor 版本号（第二位）。

## bump 记录

| 版本 | 类型 | 说明 |
|---|---|---|
| 0.1.0 → 0.1.1 | patch | super-composer 提案累积缺陷修复面（2026-10-23 用户裁决） |
| 0.1.1 → 0.1.2 | patch | fix-25 发送消息引用块与用户文本空行分隔（bug 91135f89）：quote codec.serialize 输出 `\n\n` 前后包裹——官方 sinkSerialized 把 codec 输出与草稿切片零分隔拼接，块与相邻用户文本粘连；官方 defaultSink 末端 trim 保证引用块在消息首尾不残留空行 |
