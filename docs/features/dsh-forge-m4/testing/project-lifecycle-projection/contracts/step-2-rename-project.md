---
journey: "project-lifecycle-projection"
step: 2
step-action: "改名项目"
generated: "2026-09-30"
sources:
  - docs/features/dsh-forge-m4/testing/project-lifecycle-projection/journey.md
anchors:
  web:
    page: "项目工作台·左栏项目树(C3)项目行 ⋯ 菜单·改名"
    route: "project(改名入口 = 项目行 ⋯ 菜单,UF7「随时可改:左栏 ⋯ / 设置」)"
    requires_auth: false
    layout: "左栏项目树(C3)项目行 ⋯ 菜单 → 改名确认 → forge 侧项目名更新 → 投影同步改名(dsh workspace 同名)"
last_anchor_sync: "2026-09-30T00:00:00Z"
---

# Contract: project-lifecycle-projection / Step 2: 改名项目

<!-- gen-contracts: do not edit manually. Regenerate via /gen-contracts. -->
<!-- state-verification: full (renameProject 语义 + rename op 经 relay 执行;FT-133/FT-125) -->

## Outcome "success"
- Preconditions: "项目已注册,投影通道就绪(healthy),且提交的新名为合法名(非空且非纯空白)"
  fixture_spec:
    entities:
      - entity_type: "Project"
        min_count: 1
        field_constraints:
          - field: "displayName"
            value: "改名前的既有名称"
      - entity_type: "Workspace"
        min_count: 1
        relationship_type: "belongs_to"
        parent_entity: "Project"
      - entity_type: "Session"
        min_count: 1
        relationship_type: "belongs_to"
        parent_entity: "Project"
        field_constraints:
          - field: "cwd"
            value: "canonical 落在该项目 workspace 投影路径下(分组经宿主 workspace 派生,改名不迁移)"
- Input: "编排者经左栏项目行 ⋯ 菜单修改项目名并确认"
- Output: "forge 侧项目名更新;投影同步改名 → dsh 侧 workspace 同名;会话分组随 workspace 保持;改名本身不被投影失败阻断(本地生效)"
- State: "forge displayName 更新;dsh workspace 同步改名;会话分组不变"
- Side-effect: "改名投影单向推送;项目列表变更通知"
  <!-- FT-125:执行序 ensure→rename→reorder→delete,rename op 经 relay 执行;FT-135:通知经 workbench-events 通道 project_list_changed 载荷 -->
- Invariants: "改名不被投影失败阻断(本地生效)"

## Outcome "rename-projection-failure"
<!-- source: journey Step 2b -->
<!-- reasoning: 必答④降级承诺——投影写入失败/通道不可达 → 本地生效 + 待重试 degraded(FT-126/FT-127) -->
<!-- surface-web required_outcomes 映射:session-expired → 桌面壳无独立登录会话,最近似面 = 宿主/投影通道失联 mid-workflow,映射为降级态呈现——降级提示 + 手动「重试投影」,恢复后重试成功即两侧一致,无数据丢失 -->
- Preconditions: "投影通道处于不可写态(workspace 不可写或宿主通道不可达;改名投影写入必经此通道)"
  fixture_spec:
    entities:
      - entity_type: "Project"
        min_count: 1
        field_constraints:
          - field: "displayName"
            value: "改名前的既有名称"
      - entity_type: "Workspace"
        min_count: 1
        relationship_type: "belongs_to"
        parent_entity: "Project"
        field_constraints:
          - field: "path"
            value: "期望投影路径在库(ensure 定位键)"
          - field: "title"
            value: "最近成功 title(rename 重推的 diff 基线)"
    state_requirements:
      - description: "投影通道处于不可写态(通道注错或宿主半身不可达);恢复后可重试"
        prerequisite_entity: "Workspace"
- Input: "编排者确认改名"
- Output: "改名本地生效不被阻断;投影待重试(降级态);两侧最终一致可达成"
- State: "forge displayName 已更新;投影 degraded、待重试投影期望保留;重试成功后两侧同名"
- Side-effect: "降级不阻断本地写(Propagation Strategy:动词不因投影失败 reject)"

## Outcome "rename-blank-input"
<!-- source: inferred -->
<!-- reasoning: journey Step 2c(推自 surface-web 即时校验不静默基线;空名行为 PRD 未明文,记 open question 待 PRD 对账) -->
<!-- surface-web required_outcomes 映射:validation-error → 设置面输入/确认边界:改名空名/纯白名映射为即时校验提示、留在编辑态可修正 -->
- Preconditions: "改名输入为空名或纯空白"
  fixture_spec:
    entities:
      - entity_type: "Project"
        min_count: 1
        field_constraints:
          - field: "displayName"
            value: "既有名称(应保持不变)"
      - entity_type: "Workspace"
        min_count: 1
        relationship_type: "belongs_to"
        parent_entity: "Project"
        field_constraints:
          - field: "title"
            value: "与 forge 期望名一致(dsh 侧零变更对照面)"
- Input: "编排者提交空/纯空白新名"
- Output: "即时校验提示,留在编辑态可修正;不发起投影写、两侧零变更"
- State: "forge 与 dsh 两侧零变更"
- Side-effect: "none"

## Journey Invariants

- 归档 ≠ 删除:归档恒保留 workspace 与按项目分组;删除才移除投影,且会话历史永不删除
- 单向投影:任何入口不得触发 dsh→forge 反向写;dsh 侧手改仅呈现偏差提示
- 删除必经确认对话:确认后不可逆(条目删除 + workspace 移除 + 布局记忆清除),取消则零变更(Step 5d)
- 生命周期操作(注册/改名/归档)不被投影失败阻断(降级承诺,提供手动重试;注册语义由 project-registration-projection 旅程承载);删除遇通道失败 = 本地删除生效 + 投影删除待重试(Step 5e 补全口径)
- 投影不迁移、不删除 dsh 侧既有 workspace 之外的数据;未注册目录既有会话仍显示未分组(不破坏)
- 投影操作(注册/改名/归档/删除)同步完成 ≤2s(失败降级不阻断)
