---
journey: "drawer-session-list-unread"
step: 5
action: "connection-disconnect"
title: "连接状态弹层与断开"
risk_level: "High"
surface: { type: "mobile", key: "mobile" }
anchors:
  endpoint: "POST /remote/__rpc forge:remote/disconnect（对偶缝，{revoked:true}）；断线 = {ok:false,error:{code:'disconnected'}}"
anchors_source: "design/api-handbook.md §三 + apps/host/src/boot/run.ts（forge:remote/disconnect 消费）"
last_anchor_sync: "2026-10-18T14:31:02+08:00"
sources:
  - "testing/drawer-session-list-unread/journey.md 步骤5 + 边界4/5"
  - "source: inferred —— 断线期间抽屉轮询停止自 disconnected 处置语义（停轮询）"
---

# Contract · step-5-connection-disconnect

## Outcome: success（断开呈现已断开态）

### Preconditions
- fixture_spec：对话主视图连接健康；底部连接状态入口在位。

### Input
用户动作：点底部连接状态，在弹层中执行断开。

### Output
弹层展开显示连接详情；断开后状态显示为已断开（impl-screen-4-disconnected 形态）。

### State
连接面 = 断开态；粘性位收回（对偶缝消费）。

### Side-effect
撤销手机端连接授权（forge:remote/disconnect 语义）；只影响手机端连接面，零宿主循环变更。

### Invariants
- 断开连接是状态变更动作：不改变宿主循环行为。

## Outcome: already-disconnected-reentry（已断开再操作）

### Preconditions
- fixture_spec：连接已断开。
- 分叉点：弹层重入。

### Input
用户动作：已断开态点连接状态并重复断开/重连。

### Output
弹层仍可查看详情；重连/断开操作不产生双重断开异常。

### State
断开态幂等保持。

### Side-effect
幂等撤销（重复断开零二次伤害）。

### Invariants
- 连接面操作幂等：重复断开无异常路径。

## Outcome: drawer-during-disconnect（断线期间打开抽屉）

### Preconditions
- fixture_spec：断线态（disconnected 覆盖/状态在显）。
- 分叉点：断线下的抽屉呈现（source: inferred —— 错误模型「断线覆盖层 + 停轮询」）。

### Input
用户动作：断线期间打开抽屉。

### Output
列表以最近缓存呈现，徽标不伪造更新；恢复后对账收敛。

### State
read-state 轮询停止；恢复后重启并对账。

### Side-effect
none

### Invariants
- 断线期不伪造数据：缓存呈现 + 恢复对账，零臆测更新。

## Journey Invariants
- 断开连接只收回手机端连接面；数据面以缓存 + 恢复对账呈现，绝不伪造。
