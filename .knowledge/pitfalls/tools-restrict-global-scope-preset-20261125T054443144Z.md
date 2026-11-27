---
title: tools.restrict 掩码边界=祖先层可掩/own 层豁免——白名单须落子 agent scope 而非 preset 自身
summary: >-
  tools.restrict 只掩 viewing scope 祖先层的工具，own 层恒豁免——限制是层级位置而非「scope 层」属性。restrict
  写在 preset 自身 scope 掩不到同层工具行（allow 含其名即 unknown 硬抛、整 preset broken）；写在子 agent
  scope（agent/created）则 preset 层工具为
  inherited，可掩，同包工具可按档案逐个区分。求交基准须与时刻无关（全模式并集探针），求交在 async 上下文做、监听器只查表。
keywords:
  - tools.restrict
  - whitelist
  - agent-created
  - scope-chain
  - own-layer
  - preset-row
  - expert-squad
id: tools-restrict-global-scope-preset
status: unconfirmed
version_ts: '2026-11-25T05:44:43.144Z'
updated: '2026-11-25T05:44:43.144Z'
type: pitfalls
procedure: true
supersedes: '2026-11-24T09:23:51.070Z'
slug_hint: tools-restrict-global-mask-unknown-name-throws
---
# tools.restrict 的掩码边界——只掩 viewing scope 祖先层，own 层豁免

# 官方契约（dsh-tools `view()` / `restrict()` / `ToolLayer.admits()`，rc.5 源码核销）

```
own       = peek(scope)                      // 调用方自己这一层
inherited = global 层 ∪ 祖先链各层的 tools
restrictableNames = inherited 的名字          // allow/deny 里的名字必须在此，否则整条抛
可见 = inherited 中被「链上所有层的 restrictions」放行的 + own 的全部
```

三条推论：
- **一层里的 restrict 只能掩比它更外层的工具**（global / 祖先 scope）；调用方 own 层注册的工具恒可见——官方文档 "scoped registrations remain visible" 说的就是 own；
- **未知名硬抛**：`tools.restrict() names unknown global tool "x"`——allow 里一个不存在的名字让整条 restrict 作废；
- **空 filter 硬抛**（官方判定为 materialized-empty-config bug）；保留名 `run_code` 硬抛；非 scoped ctx 硬抛。

# 两种落点，两种结果（专家 preset 判例）

专家 preset 子树挂 `tool-fs` 行（注册 read/write/edit/…）后，白名单写在哪一层决定成败：

| restrict 落点 | 工具对该层是 | 结果 |
|---|---|---|
| **preset 自己的 scope**（行插件 apply 期） | own | ❌ 掩不到——且 allow 里写 `read` 即 unknown 硬抛，行 activation 失败 → 整 preset broken |
| **子 agent scope**（`agent/created` 事件） | inherited（preset scope 是子 agent 的父） | ✅ 可掩——真机：挂行不落 restrict = 80 个工具，落后 = 3 个；`write` 留 / `edit` 掩 可按档案逐个区分（同包工具也能分开） |

**之前记录的错误**：把「preset scope 内掩不到」泛化成「官方平台不支持对 scope 层工具做掩码白名单」——错。限制是**层级位置**，不是「scope 层」这个属性。preset 行只能整包装载（官方包不导出单工具定义），工具级区分靠子 scope 上的 restrict 补上。

# 配方

**求交基准必须与时刻无关**：`agent/created` 时点子 scope 的瞬时视图不稳定（preset 行激活有竞态窗——真机两次读数不一致：一次 78 个无 tool-fs，一次 known 含 `edit`）。用「调用时刻可见集」求交会把 `read/write` 误剔。正确基准 = 全模式并集探针（`createUnionToolNamesProbe`：global ∪ 各 preset standing scope 的 `acquireScope` 视图）——那是宿主启动期就稳定的集合。

**求交在 async 上下文做，监听器只查表**：并集探针返回 Promise；`agent/created` 监听器里 `await` 一旦 rejection 即宿主 fatal。故 allow 在 preset 注册流程（reconcile）算好存台账，监听器同步读。

**监听器零外抛**（2026-11-25 宿主崩溃判例）：`agent/created` 由 `announce()` 串行 await，监听器抛错 = agent 创建事务回滚 = 宿主 fatal。全同步、整体 try/catch、diag 自身抛错也要兜、服务经 `agent.ctx.tools`（Agent 对象本体不挂服务——`agent.tools` 是 undefined，已致一次崩溃）。

**与 2026-11-05 裁决的关系**：「工具可见性边界=预设组合行进出，不靠运行期拦截」禁的是**调用期守卫**（`tools.guard` 每次调用检查身份）。restrict 是官方**可见性**机制（工具从模型可见面消失），落子 scope 达成的正是「物理不可见」——与裁决同旨，是包粒度内工具级区分的官方路径。

# 引用前核对

官方 dsh-tools / dsh-subagent 升级可能改变 `view()` 或 `agent/created` 时序——引用前核销当版源码。
