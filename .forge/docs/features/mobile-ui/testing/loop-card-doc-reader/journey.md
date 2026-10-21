---
feature: "mobile-ui"
journey: "loop-card-doc-reader"
risk_level: "Low"
surface_types: ["mobile"]
surface_keys: ["mobile"]
sources:
  - ".forge/docs/features/mobile-ui/prd/user-stories.md#US-9"
  - ".forge/docs/features/mobile-ui/prd/ui-functions.md#F8"
generated: "2026-10-17"
---

# Journey：循环哨兵卡与文档阅读页

**用户故事**：US-9 阅读循环卡与文档（批次③）。

## 搭建前置条件

- 会话消息流中含桌面循环注入的哨兵消息（同 runId 多张卡）与 agent 产出的文档（html/md/csv/txt 各至少一份）。

## Happy Path

1. **用户滚动消息流查看循环卡** → 预期：哨兵消息按 kind 显示色条循环卡（dispatch 蓝/followup 浅蓝/state 灰/done 绿）。
2. **用户继续滚动使同 runId 的非最新卡离视野** → 预期：非最新卡退化为单行 chip，时间线不重排、既有卡位置稳定。
3. **用户查看最新循环卡** → 预期：保持完整卡形态，可读循环脉络。
4. **用户点文档卡** → 预期：看到类型徽标卡（文件名 + size 右对齐）；点开进入全屏阅读页（← 退出 + 文件名 + 「渲染｜文本」胶囊）。
5. **用户浏览 html/md 文档默认渲染** → 预期：渲染视图呈现（md 表格居中），可切「文本」胶囊看纯文本。
6. **用户浏览 csv 文档** → 预期：表格渲染居中，可切纯文本。
7. **用户按 ← 退出阅读页** → 预期：返回消息流，文档卡位置不变。

## 边界用例

1. **（引步骤 5）txt 文档**：分叉前置 = 文档类型为 txt → 恒纯文本呈现，不提供渲染态。
2. **（引步骤 5）md 含 mermaid 图**：分叉前置 = md 内嵌 mermaid → 动态 import 增强渲染，暗色锚同源，超宽图横滚/双指缩放可用。
3. **（引步骤 4）无类型徽标的未知类型**：分叉前置 = 文档类型不在已知集 → 不崩溃，按纯文本兜底呈现，无类型说明文案杜撰。
4. **（引步骤 2）滚动后回看**：分叉前置 = 用户滚回最早循环卡 → 退化 chip 与完整卡的分布与滚前一致（时间线不重排）。

## Journey Invariants

- 循环卡渲染是消息流的确定性投影：同 runId 非最新卡退化 chip、时间线不重排——任何滚动/渲染路径都不改变事件序呈现。
- 阅读页是纯只读面：浏览文档不产生任何会话状态变更。
- 文档类型行为契约：html/md/csv 默认渲染可切纯文本；txt 恒纯文本。
