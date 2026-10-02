---
journey: "project-registration"
step: 3
step-action: "核对注册表单默认值与只读派生行"
generated: "2026-10-03"
sources:
  - docs/features/dsh-forge-p1-mvp/testing/project-registration/journey.md
anchors:
  web:
    page: "添加项目（两段模态流程）"
    route: "modal/add-project"
    requires_auth: false
    layout: "覆盖中区的模态"
last_anchor_sync: "2026-10-03T04:03:45+08:00"
---

# Contract: project-registration / Step 3: 核对注册表单默认值与只读派生行

<!-- gen-contracts: do not edit manually. Regenerate via /gen-contracts. -->
<!-- state-verification: partial -->

## Outcome "success"
- Preconditions: "第二段注册表单就位（工作区目录已选定并只读回填）"
  fixture_spec:
    entities:
      - entity_type: "WorkspaceDirectory"
        min_count: 1
        field_constraints:
          - field: "registration_state"
            value: "未注册"
          - field: "forge_dir_default"
            value: "工作区内的 .forge 子目录（默认推导）"
- Input: "查看表单字段（必要时直接输入或点「浏览…」改选目录）"
- Output: "文档位置（forge 目录）默认为工作区下的 .forge 子目录、知识库目录默认为工作区下的 .knowledge 子目录，两者均可直接输入或浏览改选；任务清单与记录为只读自动派生（dsh-forge-home 下按扁平化工作区路径拼接）；仓内/仓外由 forge 目录是否位于工作区内自动推导（无 radio 字段）；表单不含「默认召回域」字段"
- State: "表单值与派生规则一致；「确认」在校验无问题时可用"
- Side-effect: "none"

## Outcome "cancel-return-clean-exit"
<!-- 溯源: journey Step 3b（注册表单段取消） -->
- Preconditions: "流程处于第二段注册表单（表单可能已有部分输入）"
  fixture_spec:
    entities:
      - entity_type: "WorkspaceDirectory"
        min_count: 1
        field_constraints:
          - field: "registration_state"
            value: "未注册"
- Input: "点「返回上一步」回到文件浏览器后关闭，或直接关闭对话框"
- Output: "干净退出回工作台——模态关闭无残留；返回上一步时已填表单状态在浏览器⇄表单往返间保持"
- State: "取消点均在 dsh create 之前——无任何 dsh 侧与应用侧副作用，无补偿动作；projects 表零新增"
- Side-effect: "none"

## Outcome "reselect-rederive-fields"
<!-- 溯源: journey Step 3c（换选工作区的字段联动） -->
- Preconditions: "表单态下部分字段已被手动修改或经「浏览…」选定过（存在被标记为已触碰的字段）"
  fixture_spec:
    entities:
      - entity_type: "WorkspaceDirectory"
        min_count: 2
        field_constraints:
          - field: "roles"
            value: "一个为原选定目录（含已触碰字段的原语境），一个为换选目标目录（未注册）"
- Input: "点「重新选择」重开文件浏览器，换选另一个工作区目录"
- Output: "未手改的字段随新工作区重构（forge 目录 / 知识库目录默认值重算、项目名重取、任务清单与记录重新派生）；手改或浏览选定过的字段保留原值不重置"
- State: "字段触碰标记保持；派生行与新工作区一致；校验状态按新值重算"
- Side-effect: "none"

## Outcome "illegal-path-blocked"
<!-- 溯源: journey Step 3d（非法路径拦截于表单态）；Web surface 必察项 validation-error 的实步承载 -->
- Preconditions: "表单态下 forge 目录或知识库目录输入框可编辑，用户即将输入非法路径"
  fixture_spec:
    entities:
      - entity_type: "WorkspaceDirectory"
        min_count: 1
        field_constraints:
          - field: "registration_state"
            value: "未注册"
- Input: "在文档位置（forge 目录）或知识库目录直接输入非法路径（如相对路径片段或清空必填项）"
- Output: "非法路径被拦截于表单态——字段级可修正提示呈现（如「需为绝对路径」「不能为空」类文案），「确认」在校验问题存在时不可用；不进入注册执行；工作区目录必选且必须为存在的本地目录"
- State: "无注册执行启动；dsh 侧与应用侧零变更"
- Side-effect: "none"

## Outcome "external-forge-dir-derivation"
<!-- source: inferred -->
<!-- reasoning: Fact Table（FACT_DEF_6 isForgeDirExternal 相对位置推导，packages/core/src/forge/project-service.ts:58-61 与 apps/web/src/flows/add-project/form-model.ts:96-102；RegisterForm 仓内/仓外 StateChip）——旅程 Step 3 仓内/仓外派生规则的另一半取值，默认态（仓内）之外的边界取值 -->
- Preconditions: "表单态下 forge 目录经手动输入或浏览改选为工作区外的合法绝对路径（字段已触碰）"
  fixture_spec:
    entities:
      - entity_type: "WorkspaceDirectory"
        min_count: 1
      - entity_type: "ForgeDirectory"
        min_count: 1
        relationship_type: "belongs_to"
        parent_entity: "WorkspaceDirectory"
        field_constraints:
          - field: "location"
            value: "工作区外（合法绝对路径，已手动改选）"
- Input: "查看仓内/仓外派生标识"
- Output: "仓内/仓外标识按 forge 目录相对工作区的位置自动推导——工作区外路径呈「仓外」，与默认（工作区内 .forge 呈「仓内」）可区分；注册不因此受阻（合法绝对路径）"
- State: "派生标识与 forge 目录位置一致；表单校验通过"
- Side-effect: "none"

## Journey Invariants

- 取消点只存在于两段对话框（返回上一步或直接关闭），均在 dsh create 之前；任何取消后 dsh 侧与应用侧零残留
- 应用库 projects 记录必须携带 workspace 外键，canonical path 为对账 join key
- 左栏会话列表实时读 dsh 账本，零缓存零副本（无投影同步）
- hero 空态仅在项目数 = 0 时呈现；首个项目注册成功后永久让位，不残留

## Fixture Specification

本 Contract 各 Outcome 的前置数据状态并集：WorkspaceDirectory（未注册候选，换选场景至少 2 个）、可选 ForgeDirectory（工作区外改选，belongs_to WorkspaceDirectory）。非法路径与取消场景复用单一未注册候选目录。
