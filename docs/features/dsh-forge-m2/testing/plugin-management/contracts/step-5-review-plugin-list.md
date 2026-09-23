---
journey: "plugin-management"
step: 5
step-action: "启停后回看插件列表"
generated: "2026-09-23"
sources:
  - docs/features/dsh-forge-m2/testing/plugin-management/journey.md

anchors:
  web:
    page: "workbench/overview"
    route: ""
    requires_auth: false
    layout: "WorkbenchShell → OverviewPage → PluginSection(两级行态复核)"

last_anchor_sync: "2026-09-23T01:18:11Z"
---

# Contract: plugin-management / Step 5: 启停后回看插件列表

<!-- gen-contracts: do not edit manually. Regenerate via /gen-contracts. -->

## Outcome "success"
- Preconditions: "启停操作序列已完成(至少经历一次禁用与启用),回看时目标第三方插件处于启用态(与 core-capability-unaffected 的目标禁用态互斥)"
  fixture_spec:
    entities:
      - entity_type: "Plugin"
        min_count: 5
        field_constraints:
          - field: "mandatory"
            value: "产品清单条目全部 mandatory = true(当前 3 条:@deepseek-ai/dsh-base、@deepseek-ai/dsh-web-app、@dsh-forge/plugin-forge-workbench;hello-world 已移出产品清单)"
    state_requirements:
      - description: "第三方 fixture 插件经测试 profile 清单变体物化(口径见 step-1 Setup:产品 3 必备 + 2 第三方样例,行集唯一来源 = 清单文件)"
        prerequisite_entity: "Plugin"
      - description: "跨面断言口径:产品清单条目未被改写 = sha256 前后对拍(测试进程直读,不以「没报错」为据)"
        prerequisite_entity: "Plugin"
- Input: "启停操作完成后,用户在插件管理区重新浏览插件列表"
- Output: "列表仍两级呈现:forge 核心插件保持必备身份与启用状态,第三方插件按当前启停状态呈现(层级与必备标识不因启停改变);产品清单条目未被改写(必备清单对运行时启停只读,FT-048)。「升级/重装不冲突」面本 feature 旅程集无对应腿,family-unowned(留安装/升级验收),本旅程不作断言"
- State: "行态 = 清单(只读)× 覆盖文件(当前启停)的投影;无中间态残留"
- Side-effect: "none(只读复核)"
- Invariants: "层级与必备标识恒定;清单只读"

## Outcome "core-capability-unaffected"
<!-- anchors:本腿断言面跨双视图——插件启停面 = workbench/overview(PluginSection);任务看板/任务详情/UF5 发起入口 = workbench/tasks(TaskBoardPage → TaskDetailPanel → UF5 发起入口,page-map 视图键,FT-053)。frontmatter page 键为主锚(overview),tasks 视图为本腿核心能力断言面 -->
- Preconditions: "目标第三方插件处于禁用状态(fixture 直供:装置预置启停覆盖文件含目标插件名;不要求由 Step 3/4 启停序列派生——Step 4 终态为目标已启用,序列派生需额外一次未声明的禁用,故本腿以 fixture 直供终态)"
  fixture_spec:
    entities:
      - entity_type: "Plugin"
        min_count: 5
        field_constraints:
          - field: "mandatory"
            value: "目标第三方插件 = false,已停用;另一第三方启用中"
      - entity_type: "Project"
        min_count: 1
        field_constraints:
          - field: "active"
            value: true
      - entity_type: "Feature"
        min_count: 1
        relationship_type: "belongs_to"
        parent_entity: "Project"
      - entity_type: "Task"
        min_count: 1
        relationship_type: "belongs_to"
        parent_entity: "Project"
        field_constraints:
          - field: "task_key"
            value: "feature 限定地址 <featureSlug>/<localId>(FT-040)"
          - field: "prompt"
            value: "该任务存在可发起 prompt(getTaskPrompt 探测成功,FT-043)——「发起会话入口可用」断言的可达前提"
    state_requirements:
      - description: "装置直供目标插件禁用态:plugin-runtime.json 预置 disabled 集含目标插件名、不含对照插件名"
        prerequisite_entity: "Plugin"
      - description: "跨面断言口径:forge 数据零损坏 = hash 对拍(测试进程直读)"
        prerequisite_entity: "Project"
- Input: "依次使用任务看板、任务详情、一键发起会话等核心能力"
- Output: "任务看板正常渲染依赖树与状态分组、任务详情可读、发起会话入口可用;第三方扩展内容退出说明显示(核心挂接能力不受影响);另一启用中的第三方插件注入内容不受影响;forge 数据零损坏"
- State: "核心能力链(看板数据/详情读取/UF5 发起)与插件启停状态解耦"
- Side-effect: "none(能力使用只读;发起会话属 UF5 契约,此处仅入口可用性)"

## Journey Invariants

- 两级插件模型恒成立:forge 核心插件始终以必备身份在位,任何操作不能使其退出或被禁用
- 启停仅写运行时启停覆盖文件(同一配置的可写区):forge 数据与项目文件零改动(数据零损坏)
- 运行时启停不得改写产品清单条目(必备清单/保护分区对运行时启停只读)
- 禁用第三方只收敛该插件注入内容,其余第三方插件与工作台核心能力(任务看板/会话挂接)不受影响(Setup 至少 2 第三方装置下可证伪)

## Fixture Specification

本 Contract 各 Outcome 的 fixture 实体并集(逐 Outcome 明细见各 Preconditions 内 fixture_spec):

```yaml
fixture_spec:
  entities:
    - entity_type: "Plugin"
      min_count: 5
    - entity_type: "Project"
      min_count: 1
    - entity_type: "Feature"
      min_count: 1
      relationship_type: "belongs_to"
      parent_entity: "Project"
    - entity_type: "Task"
      min_count: 1
      relationship_type: "belongs_to"
      parent_entity: "Project"
```
