---
id: "fix-27"
title: "Fix(P0): 重注册死锁——悬空引用行卡死 register（fix-18 home 翻转遗留 + 启动对账从未接线）：boot 接线 reconcileAtStartup + register 链按 ws_path 自愈/幂等"
priority: "P0"
estimated_time: "4h"
complexity: "medium"
dependencies: []
surface-key: ""
surface-type: "web"
breaking: false
type: "coding.fix"
mainSession: false
---

# Fix(P0): 重注册死锁——悬空引用 + 对账未接线

> 来源：走查人实机（2026-10-04）注册 Z:\learn 报「注册失败（未预期错误）…应用库 projects 行写入失败（registry.delete 补偿已执行，dsh 侧零孤儿）：Z:\learn」，重试恒复现。

## 根因（实库 + 源码全链实证）

走查人 state.db 实存一行：`projects(ws_path='Z:\learn', workspace_id=5781de21…, created=10-03 13:31)`——**创建于 fix-18 之前的隔离 home 时代**（当时 dshHome={userData}/dsh-home，workspace 落隔离注册表）。fix-18（10-04 晨）缺省翻真 home 后：

1. 该行 workspace 引用**悬空**（真 home 注册表无 5781de21）；
2. **启动对账从未接线**：`reconcileAtStartup` 仅有 RPC 通道（[projects-rpc.ts:31](../../../apps/host/src/ipc/projects-rpc.ts) `forge:projects/reconcile`）——boot 链无调用方（tech-design §交互三「每次启动」未落地）——本该修它的机制从未执行（key logs 空 + 行 updated_at 未变实证）；
3. 走查人重注册 Z:\learn → [project-service.ts](../../../packages/core/src/forge/project-service.ts) 预检按 **dsh 注册表** path 匹配（:67）不命中 → `registry.create` 新建工作区 → INSERT 撞 **UNIQUE(ws_path)**（[schema.ts:39](../../../packages/core/src/db/schema.ts) idx_projects_ws_path——旧行仍在）→ 补偿 `registry.delete` 删**新建**工作区（dsh 零孤儿 ✓ 补偿语义正确）→ ProjectWriteError；
4. **每次重试同径死循环**——该路径永久无法注册。

次生缺口（同链发现）：register 无「产品库已注册」判——预检只查 dsh 注册表；若 dsh 工作区健康而行已存在（正常重注册场景，UI 表单 ownership 预检之外的服务面），INSERT 同样 UNIQUE 炸（未补偿分支——挂接保护）。服务面应幂等/明确化，不能只靠 UI 表单挡。

## Description

1. **boot 接线启动对账**（tech-design §交互三落地）：boot child 服务就绪后（`forgeProjects` 在场）调一次 `reconcileAtStartup()`（fire-and-forget，报告入日志；e2e 隔离态同径）——悬空引用启动即修（失配找回/幂等重建，既有实现），走查人场景重启一次即解锁；
2. **register 链自愈防御**（project-service.ts）：
   - INSERT 前按 `ws_path` 查既有行：**存在** → 校验其 workspace 引用（registry.get）——健康 = **幂等成功返回**（attachedToExisting=true，返回既有 projectId——注册幂等语义）；悬空 = 复用 reconcile 单项修复（relink/recreate）后续行（不新 INSERT，UPDATE 修引用 + 幂等成功返回）；
   - 不存在 → 现行链（预检/create/INSERT/补偿）不变；
   - 单测：悬空行自愈、健康行幂等、新路径现行、补偿语义不回归（AC4 幂等锚保持）；
3. **UI 表单 ownership 预检口径同步**：已注册路径的表单标记 = 幂等成功语义（非错误面）；确认不再炸 UNIQUE（服务面兜底后表单标记仅为提示）；
4. 走查人即刻解锁（任务记录，零代码）：devtools 控制台 `await window.dshForge.invoke('forge:projects/reconcile')` 一次即修（悬空引用 recreated+relinked，项目 'learn' 恢复健康，无需重注册）。

## 验收

1. 走查人场景（悬空行 + 真 home）：启动产品即自愈（对账日志/引用更新）——Z:\learn 项目恢复，会话归属正常；
2. 对 Z:\learn 再次走注册向导：幂等成功（不炸、不删工作区、返回既有项目）；
3. 全新路径注册现行不回归；补偿链（新建失败→registry.delete）AC4 幂等锚保持；
4. e2e：悬空引用夹具（行指向不存在 workspaceId）→ boot 后引用修复；重复注册 = 幂等成功。

## Reference Files

- [packages/core/src/forge/project-service.ts](../../../packages/core/src/forge/project-service.ts)（:63-140 register 链 / :237-325 reconcile 修复逻辑复用点）；[packages/core/src/db/schema.ts:26-39](../../../packages/core/src/db/schema.ts)（UNIQUE 约束）；[apps/host/src/ipc/projects-rpc.ts:31](../../../apps/host/src/ipc/projects-rpc.ts)（reconcile 通道已存在）；boot 接线点：[apps/host/src/main.ts](../../../apps/host/src/main.ts)（forgeProjects 服务就绪分支 :67-73）或 child boot 尾（run.ts/child.ts——执行裁决）
- 实证：tmp-ui-review/fix27-inspect-db.mjs（走查人库巡检输出——单行 Z:\learn + key logs 空）；UI 表单 ownership 面：apps/web/src/flows/add-project/{AddProjectFlow,RegisterForm}.tsx（registeredPaths 预检）
- 关联：fix-18（home 翻转——悬空根源）、fix-26（隔离回摆将再次换注册表——本任务自愈使其无痛）、fix-28（typed error 跨桥保真——本例 UI 落错文案分支的独立修复）

## 边界与不做

- 不改 schema（UNIQUE 约束正确——防多行同路径本就是产品不变量）；
- 不做用户数据手工迁移（对账自愈覆盖）；
- 补偿语义（保目录保日志、挂接保护）零变化。
