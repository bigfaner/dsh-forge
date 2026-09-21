---
feature: "ui-plugin-foundation"
journey: "version-consistency-assertion"
risk_level: "Low"
surface_types: ["web"]
surface_keys: ["web"]
sources:
  - docs/proposals/ui-plugin-foundation/proposal.md
generated: "2026-09-22"
---

# Journey: version-consistency-assertion

**Risk Level**: Low

<!-- Risk Classification Criteria:
  High   = Workflow involves state mutation, data loss risk, or irreversible operations
  Medium = Workflow involves multi-step interaction without irreversible side effects
  Low    = Workflow is read-only or purely observational
-->

<!-- Risk rationale: 纯观察/校验型工作流——运行断言门禁读取版本声明与锁基准,输出红/绿灯;不修改任何产品状态(错配复现为临时改动且证据归档)。

Traceability: proposal.md Key Scenario "版本错配(edge)" + Success Criterion SC3。
注:本项目唯一配置面为 web;本 Journey 的执行载体是 CI/质量门(断言接入既有 CI/质量门),验收证据为门禁输出与归档,UI 面不涉及。 -->

## Overview

维护者/CI 运行版本一致性自动断言,验证插件对齐线依赖(`@deepseek-ai/dsh-client-*` 宿主契约族)exact ≡ `vendor/upstream.lock.json` 的 `desktopHostVersion`,cordis peer 以独立版本线单列仅校验 exact 锁定——错配红灯、匹配绿灯,把静默契约漂移变成显式红灯。

## Setup

- 断言已接入既有 CI/质量门(实现载体为 CI 步骤或质量门 hook,已按工程落位)
- 断言比对集显式界定:对齐线依赖族(`@deepseek-ai/dsh-client-*` 前缀的宿主契约族)+ cordis 单列独立版本线
- `vendor/upstream.lock.json` 在位,`desktopHostVersion` = `0.1.6-alpha.2`(SHA `c36ba648`)
- 工程模板侧版本戳经同源机制可见
- 存在可归档的红灯复现证据通道(错配红灯须复现并归档)

## Happy Path

### Step 1: 当前对齐状态跑绿灯

**User Action**: 用户在当前树(hello-world 及工程模板的对齐线依赖均为 exact `0.1.6-alpha.2`)上运行版本断言门禁

**Expected Result**: 绿灯——对齐线依赖 exact ≡ `UpstreamLock.desktopHostVersion`(0.1.6-alpha.2);cordis peer(实测 4.0.2)作为独立版本线单列,仅校验 exact 锁定、不与 `desktopHostVersion` 比对,不产生误报

### Step 2: 人为错配触发红灯

**User Action**: 用户临时把任一对齐线依赖版本改为与 `desktopHostVersion` 不一致的值(复现错配),再次运行断言门禁

**Expected Result**: 红灯——断言失败且显式指出比对集中失配的条目;红灯复现证据归档(SC3 验收件);恢复 exact 后复跑回到绿灯

### Step 3: 检查模板侧版本戳可见性

**User Action**: 用户经同源机制检查工程模板的版本戳

**Expected Result**: 模板流出侧的版本同步同样可见、可断言——模板版本戳与锁基准一致,漂移会被同一门禁暴露

## Edge Cases

### Step 1b: cordis 被误纳入对齐线比对(误报风险)

**Precondition**: 断言实现把 cordis peer 也拿来与 `desktopHostVersion` 比对(未按独立版本线单列)

**User Action**: 用户运行断言门禁

**Expected Result**: 判为实现缺陷——cordis 必须单列(仅校验 exact 锁定),当前树必须绿灯无误报;误报会淹没真失配信号,不可接受

### Step 2b: 借 alpha tag 定位但未锁定为 exact

**Precondition**: 对齐线依赖借 `alpha` dist-tag 定位(定位到现行线)但依赖声明中保留可变 tag 而非解析锁定的 exact 结果

**User Action**: 用户运行断言门禁

**Expected Result**: 红灯——可变 tag 不得直接写入依赖(纪律:借 tag 定位须解析并锁定为 exact 结果);tag 漂移即静默契约漂移的入口,门禁必须拦截

### Step 3b: 上游升级后断言/模板未同 diff bump

**Precondition**: vendored 基准(SHA/`desktopHostVersion`)已升级,插件依赖与模板版本戳未随同一 diff 更新

**User Action**: 用户在升级后的树上运行断言门禁

**Expected Result**: 红灯即升级提醒(不静默过期)——版本断言与上游 SHA 升级任务同 diff bump 的纪律由门禁守住;维护者完成对齐 bump 后回绿

## Journey Invariants

- 断言比对集显式界定且稳定:对齐线依赖族(`@deepseek-ai/dsh-client-*` 前缀)与 cordis 独立版本线,不因新增包而漂移界定
- 断言结果只有显式红/绿两态,无静默通过路径;红灯复现证据可归档
- 断言作为 CI/质量门的一部分随变更自动运行,不依赖人工自觉
- 断言只读版本声明与锁基准,不修改任何工程状态
