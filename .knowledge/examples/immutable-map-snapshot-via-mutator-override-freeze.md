---
title: Map 不可变快照 = 覆写 mutator 后 freeze
summary: Object.freeze 不拦截 Map 内部槽；实现不可变快照须先覆写 set/delete/clear 三个 mutator（抛错）再 freeze 整个实例——快照契约「整体换代无半代索引」由此兑现。
keywords: [Object.freeze, Map, 不可变, 快照, 整体换代]
domainPath: .knowledge/examples/
来源容器: expert-squad
来源任务: 1.3（D-3，phase-1-summary.md）
bug id: 无
---

# Map 不可变快照 = 覆写 mutator 后 freeze

## 判例

专家索引快照要求冻结后读方拿到的永远是一致代际。`Object.freeze(map)` 只冻实例属性，`map.set()` 照常工作。落地配方：

1. 子类/包装覆写 `set`/`delete`/`clear`，函数体直接 throw。
2. 再对实例 `Object.freeze`。
3. 换代 = 构建新快照整体替换引用，不在旧快照上打补丁——热刷新失效统一走整体换代回调，竞速事件 microtask 合并。
