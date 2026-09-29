---
journey: "project-lifecycle-projection"
step: 1
step-action: "查看投影状态"
generated: "2026-09-30"
sources:
  - docs/features/dsh-forge-m4/testing/project-lifecycle-projection/journey.md
anchors:
  web:
    page: "项目工作台·右栏概览·投影状态行(UF8 投影与生命周期)"
    route: "project(右栏概览 tab;状态行 = healthy/degraded/deviation + [重试投影] + 偏差明细折叠)"
    requires_auth: false
    layout: "投影状态行(Shared Components);生命周期动作(改名/归档/恢复/删除)与归档语义说明"
last_anchor_sync: "2026-09-30T00:00:00Z"
---

# Contract: project-lifecycle-projection / Step 1: 查看投影状态

<!-- gen-contracts: do not edit manually. Regenerate via /gen-contracts. -->
<!-- state-verification: full (getProjectionStatus 状态行 + 偏差明细;状态机 4 态全矩阵 FT-123;对账 verdict 桥 FT-124) -->

## Outcome "success"
- Preconditions: "已注册 ≥2 个项目,投影健康(对账一致)"
  fixture_spec:
    entities:
      - entity_type: "Project"
        min_count: 2
        field_constraints:
          - field: "projectionState"
            value: "healthy"
      - entity_type: "Workspace"
        min_count: 2
        relationship_type: "belongs_to"
        parent_entity: "Project"
        field_constraints:
          - field: "title"
            value: "与 forge 期望名一致(同名,对账 match)"
          - field: "orderIdx"
            value: "与 projects.sort_order 一致(同序,对账 match)"
- Input: "编排者在右栏概览打开「投影与生命周期」投影状态行(UF8)"
- Output: "投影状态 healthy(对账一致);生命周期动作(改名/归档/恢复/删除)与归档语义说明呈现"
- State: "纯读;两侧一致状态保持"
- Side-effect: "none"

## Outcome "degraded-retry"
<!-- source: journey Step 1b -->
<!-- reasoning: 投影写入失败 → degraded + 手动重试(push_succeeded → healthy 恢复路径;FT-123/FT-126) -->
- Preconditions: "投影处于降级态(workspace 不可写致投影写入失败)"
  fixture_spec:
    entities:
      - entity_type: "Project"
        min_count: 1
        field_constraints:
          - field: "projectionState"
            value: "degraded(last_error 落表)"
      - entity_type: "Workspace"
        min_count: 1
        relationship_type: "belongs_to"
        parent_entity: "Project"
        field_constraints:
          - field: "path"
            value: "期望投影路径在库(ensure 定位键)"
          - field: "title"
            value: "最近成功 title(重推 diff 基线)"
    state_requirements:
      - description: "投影通道处于不可写态(通道注错或宿主半身不可达);恢复可写后可重试"
        prerequisite_entity: "Workspace"
- Input: "编排者在右栏概览投影状态行确认降级呈现,并在 workspace 恢复可写后点击「重试投影」"
- Output: "degraded 态降级提示 + 手动「重试投影」入口;生命周期操作不被阻断;重试成功即两侧一致"
- State: "投影自降级恢复为两侧一致(healthy);降级期间期望状态不丢失"
- Side-effect: "重试重新推送该项目全部投影期望,直至两侧一致"
  <!-- FT-126:retryProjection = 幂等全量重推(单 plan 收敛全部期望,含 forge 子集相对序);FT-123:push_succeeded → healthy -->

## Outcome "deviation-renamed"
<!-- source: journey Step 1c -->
<!-- reasoning: 对账检出 dsh 侧手改 → reconcile_drift → deviation(仅呈现,禁反向写;FT-123/FT-124) -->
- Preconditions: "dsh 侧手工改了某 workspace 名(与 forge 期望名偏离)"
  fixture_spec:
    entities:
      - entity_type: "Project"
        min_count: 1
      - entity_type: "Workspace"
        min_count: 1
        relationship_type: "belongs_to"
        parent_entity: "Project"
        field_constraints:
          - field: "title"
            value: "dsh 侧实际名(被手工改,偏离期望快照 title 基线)"
- Input: "编排者触发启动/刷新对账,在右栏概览投影状态行展开偏差明细"
- Output: "偏差提示(deviation 明细:差异事实 + 处理建议);不回流,任何入口不触发反向写"
- State: "投影状态 deviation;forge 侧权威数据不被改动"
- Side-effect: "none"
- Invariants: "单向投影:偏差仅呈现,任何入口不得触发 dsh→forge 反向写"

## Outcome "deviation-deleted-reordered"
<!-- source: journey Step 1d -->
<!-- reasoning: dsh 侧手工删除/乱序 → drift 明细重算物化(偏差明细不落表,对账重算供给;FT-123) -->
- Preconditions: "dsh 侧手工删除 workspace 或打乱顺序"
  fixture_spec:
    entities:
      - entity_type: "Project"
        min_count: 2
      # 分支布景(两支路各自满足其一):
      #  - 删除分支:被删 workspace 不物化宿主实例,仅以陈旧期望快照布景(期望快照行 path/title/orderIdx 在库、dsh 侧实况缺席)——为缺席实体播种 forge 侧期望,不物化计数
      #  - 乱序分支:dsh 侧宿主 ≥2 在位(序可比需 ≥2),实际序偏离期望序
      - entity_type: "Workspace"
        min_count: 2
        relationship_type: "belongs_to"
        parent_entity: "Project"
        field_constraints:
          - field: "path"
            value: "期望投影路径在库(删除分支的陈旧期望锚点)"
          - field: "orderIdx"
            value: "乱序分支:实际序偏离 forge 期望序(orderIdx ≠ projects.sort_order)"
    state_requirements:
      - description: "dsh 侧实况集/序已偏离 forge 期望(宿主缺席或序被打乱),待对账暴露为 deviation"
        prerequisite_entity: "Workspace"
- Input: "编排者触发启动/刷新对账,在右栏概览投影状态行展开偏差明细"
- Output: "deviation 偏差明细呈现;forge 侧权威数据不被改动"
- State: "投影状态 deviation;forge 注册表与期望集/序不变"
- Side-effect: "none"
- Invariants: "单向投影:偏差仅呈现,任何入口不得触发 dsh→forge 反向写"

## Outcome "archived-sessions-zone"
<!-- source: journey Step 1e -->
<!-- reasoning: 会话归档恢复口 = 上游原生设置面「已归档会话」区(M4 零代码,裁决 #25-⑥);本旅程仅断言接续效果 -->
<!-- anchor-note: 本支路实际交互面 = 上游原生设置面「已归档会话」区;page-map 仅记 sidebar.settings(上游原生,M4 不动)座位、无元素条目 → 该支路 anchor = N/A(上游原生,无 handbook 条目,不造页);接续断言面 = 左栏项目树(C3)会话行回树 -->
- Preconditions: "存在经 UF3 会话行 ⋯ 菜单归档的会话(行已从会话列表消失)"
  fixture_spec:
    entities:
      - entity_type: "Project"
        min_count: 1
      - entity_type: "Workspace"
        min_count: 1
        relationship_type: "belongs_to"
        parent_entity: "Project"
        field_constraints:
          - field: "path"
            value: "该项目 workspace 投影路径(会话分组的宿主锚点,解除归档不触碰投影)"
      - entity_type: "Session"
        min_count: 1
        relationship_type: "belongs_to"
        parent_entity: "Project"
        field_constraints:
          - field: "archived"
            value: true
          - field: "cwd"
            value: "canonical 落在该项目 workspace 投影路径下(解除归档后回树分组所依;分组经宿主 workspace 派生)"
- Input: "编排者经上游原生设置面「已归档会话」区搜索该会话并逐条解除归档"
- Output: "会话行即时回左栏项目树,仍按该项目 workspace 分组"
  <!-- UF3/UF8 接续断言:解除归档即时生效,会话行回左栏项目树(C3);两个归档面互不混淆——会话归档(对象 = 会话)≠ 项目归档(本旅程主线对象 = 项目) -->
- State: "会话归档态解除,回树呈现"
- Side-effect: "none"

## Journey Invariants

- 归档 ≠ 删除:归档恒保留 workspace 与按项目分组;删除才移除投影,且会话历史永不删除
- 单向投影:任何入口不得触发 dsh→forge 反向写;dsh 侧手改仅呈现偏差提示
- 删除必经确认对话:确认后不可逆(条目删除 + workspace 移除 + 布局记忆清除),取消则零变更(Step 5d)
- 生命周期操作(注册/改名/归档)不被投影失败阻断(降级承诺,提供手动重试;注册语义由 project-registration-projection 旅程承载);删除遇通道失败 = 本地删除生效 + 投影删除待重试(Step 5e 补全口径)
- 投影不迁移、不删除 dsh 侧既有 workspace 之外的数据;未注册目录既有会话仍显示未分组(不破坏)
- 投影操作(注册/改名/归档/删除)同步完成 ≤2s(失败降级不阻断)
