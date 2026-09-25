---
feature: "dsh-forge-m3"
journey: "task-dispatch-execution-loop"
risk_level: "High"
golden_path: true
surface_types: ["web"]
surface_keys: ["web"]
sources:
  - docs/features/dsh-forge-m3/prd/prd-user-stories.md
  - docs/features/dsh-forge-m3/prd/prd-spec.md
  - docs/features/dsh-forge-m3/prd/prd-ui-functions.md
generated: "2026-09-24"
---

# Journey: task-dispatch-execution-loop

**Risk Level**: High

<!-- Risk Classification Criteria:
  High   = Workflow involves state mutation, data loss risk, or irreversible operations
  Medium = Workflow involves multi-step interaction without irreversible side effects
  Low    = Workflow is read-only or purely observational
-->

## Overview

SDD 开发者从任务看板发起编排:多选无依赖任务并行派发为 subagent 执行(派发前经阶段产物齐全性检查),subagent 以预合成专业化系统提示词(任务类型协议 + feature 目标摘要 + 生效运行偏好)启动,审批请求与失败状态在看板可见可操作,agent 经 dsh tool 提交后状态 ≤5 秒回流——这是 dsh-forge-m3「流程即产品」的主线用户工作流(本 feature 的 Golden Path,SC1 零 CLI 执行链的运行载体)。

> PRD Traceability: Story 2(看板派发与并行执行闭环)、Story 3(派发即得预合成专业化上下文);SC1、SC3;UF1(任务派发与编排);proposal Key Scenarios「派发执行闭环(happy path)」「并行执行」。

## Setup

- 应用已安装并启动,M2 内核地基(看板/发起链/数据内核)可用;已注册并激活一个完成 SoT 迁移的 forge 项目(测试承载 = 一次性 fixture 项目:临时目录 + 隔离 userData、测试后清理;本旅程含任务状态变更,不得以生产仓为承载)
- fixture 内含 ≥3 个无依赖、可执行、带类型(如 coding-feature)与执行 prompt 的任务;另备一个带依赖关系的任务集(负例用)
- dsh 宿主可用(凭据就绪),subagent 会话通道就绪;所属 feature 处于可派发阶段且阶段产物齐全
- 跨面断言口径:subagent 系统提示词三要素断言经测试通道直读注入记录/宿主侧产物(浏览器面不自测提示词内容);零 CLI 断言 = 进程/日志级(forge CLI 调用数 = 0);agent 动作经 dsh tool 通道驱动或测试通道模拟,回流与来源断言不受模拟方式影响

## Happy Path

### Step 1: 看板浏览并多选无依赖任务

**User Action**: 用户进入工作台·任务看板,浏览依赖树并勾选 3 个无依赖的可执行任务

**Expected Result**: 可派发任务集仅含依赖满足、状态允许且属于当前阶段的任务;3 任务进入待派发态,派发入口可用;任务数/状态/依赖与数据内核一致

### Step 2: 发起派发并过阶段产物齐全性检查

**User Action**: 点击任务工具栏「派发」

**Expected Result**: 系统对 feature 当前阶段执行期望产物齐全性检查(确定性代码,断言无模型参与);产物齐全 → 无警告,直接进入派发确认

### Step 3: 确认派发,subagent 启动

**User Action**: 确认派发

**Expected Result**: 内核预合成系统提示词并启动各 subagent;派发 → subagent 可交互 ≤3 秒;各 subagent 独立启动互不串扰;任务卡片/侧板呈现运行态(running)

### Step 4: 确认预合成专业化上下文在场

**User Action**: 查看任务卡片/编排条目的预合成要素标识,并经测试通道断言 subagent 系统提示词

**Expected Result**: 系统提示词可断言包含三要素——该任务类型协议、所属 feature 的目标与摘要、生效运行偏好;subagent 启动后的调用日志无 `forge prompt` 类自跑合成调用

### Step 5: 处理审批请求

**User Action**: 在看板对待审批条目查看内容与来源任务,显式点击「批准」

**Expected Result**: 审批条目可见(内容 + 来源任务);批准后 subagent 继续执行;无默认自动批准(操作必须显式点击)

### Step 6: 进入会话界面观察执行并返回

**User Action**: 从编排条目点击「进入会话」观察 subagent 执行,随后返回

**Expected Result**: 跳转主窗口会话界面并定位该 subagent 会话;返回时回到任务看板(返回来源页)

### Step 7: agent 提交后状态回流看板

**User Action**: 保持看板打开,观察任务卡片状态

**Expected Result**: agent 经 dsh tool 完成 claim/submit(留 actor 标识);任务状态 ≤5 秒回流,免手动刷新;完成态(done)呈现;各任务独立回流互不串扰

## Edge Cases

### Step 1b: 多选包含依赖未满足的任务

<!-- surface-web required_outcomes 映射:validation-error → 本旅程无表单输入面,映射为多选校验失败(含依赖任务混入)的阻止 + 依赖关系提示 -->

**Precondition**: 用户勾选集内含依赖未满足(或互相依赖)的任务

**User Action**: 点击「派发」

**Expected Result**: 阻止派发并提示依赖关系(blocker 指向可辨);不启动任何 subagent

### Step 1c: 无可派发任务(idle 态)

**Precondition**: 当前项目无满足派发条件的任务(依赖/状态/阶段均不满足)

**User Action**: 察看任务工具栏派发入口

**Expected Result**: 派发入口禁用 + 引导说明;不存在可点选的派发路径

### Step 2b: 阶段产物缺失时警告不阻断

**Precondition**: feature 当前阶段期望产物缺失(如 tasks/ 阶段任务 md 缺失、manifest 状态不一致)

**User Action**: 点击「派发」

**Expected Result**: 呈现警告 + 缺失清单;用户确认后可继续派发,或取消;不因缺失硬阻断(检查仅警告)

### Step 4b: feature 目标摘要更新后的新派发

**Precondition**: 所属 feature 的目标摘要已更新

**User Action**: 再次派发同 feature 的任务并断言新 subagent 系统提示词

**Expected Result**: 新派发的系统提示词反映最新摘要;既有已派发 subagent 不受影响

### Step 5b: 审批拒绝

**Precondition**: 看板存在待审批条目

**User Action**: 显式点击「拒绝」

**Expected Result**: 拒绝结果回流 subagent,该请求不执行;任务/编排态呈现拒绝后的走向,不误呈完成态

### Step 5c: 宿主/会话通道异常

<!-- surface-web required_outcomes 映射:session-expired → 宿主不可用/凭据失效使会话通道不可用,呈现为编排错误/失败态 + 恢复引导 -->

**Precondition**: 审批链依赖的宿主会话通道不可用(宿主异常/凭据失效)

**User Action**: 察看看板编排条目状态

**Expected Result**: 通道异常以错误/失败态呈现 + 恢复引导(沿用 M1/M2 错误呈现模式),不静默;通道恢复后可继续,不残留半状态编排条目

### Step 7b: subagent 失败与一键重派发

**Precondition**: 某 subagent 执行失败

**User Action**: 查看失败态卡片与原因,点击「重派发」并完成二次确认

**Expected Result**: 失败状态与原因呈现;重派发需二次确认;确认后新 subagent 启动,重新进入运行态

### Step 7c: 连续多笔提交逐笔回流

**Precondition**: 多个并行 subagent 先后完成提交

**User Action**: 保持看板打开观察任务卡片

**Expected Result**: 每笔提交 ≤5 秒逐笔回流,来源与 actor 标识一致;最终状态与数据内核一致

## Journey Invariants

- 看板对人无任务状态写入口:全程任何视图不出现 add/claim/transition/submit/reopen 的写操作入口;人的写操作仅限编排发起(派发/审批/重派发)
- 零 CLI 执行链:旅程全程 forge CLI 调用数 = 0(进程/日志级断言,SC1 口径)
- 任务状态变更唯一通道 = agent 会话经 dsh tool;每笔变更留 actor 标识,且与看板来源标记一致
- 回流时效:感知链健康时每笔变更 ≤5 秒免手动刷新可见;数据内核恒为事实源,看板为派生快照
- 并行互不串扰:各 subagent 独立启动、独立审批、独立提交、独立回流
- 可派发任务集恒只含依赖满足 + 状态允许 + 当前阶段的任务
