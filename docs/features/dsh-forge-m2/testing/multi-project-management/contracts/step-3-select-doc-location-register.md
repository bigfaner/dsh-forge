---
journey: "multi-project-management"
step: 3
step-action: "选择文档位置并完成注册"
generated: "2026-09-23"
sources:
  - docs/features/dsh-forge-m2/testing/multi-project-management/journey.md

anchors:
  web:
    page: "workbench/overview"
    route: ""
    requires_auth: false
    layout: "WorkbenchShell → OverviewPage → RegisterWizard 步骤②③(选文档位置/确认)"

last_anchor_sync: "2026-09-23T01:18:11Z"
---

# Contract: multi-project-management / Step 3: 选择文档位置并完成注册

<!-- gen-contracts: do not edit manually. Regenerate via /gen-contracts. -->

## Outcome "success"
- Preconditions: "向导处于步骤 ②;所选代码根目录检出通过;用户保持默认仓内文档位置"
  fixture_spec:
    entities:
      - entity_type: "Project"
        min_count: 1
        field_constraints:
          - field: "active"
            value: true
    state_requirements:
      - description: "第二个项目路径检出通过(Setup 供给)"
        prerequisite_entity: "Project"
      - description: "注册/激活态断言口径 = 工作台状态读数对拍(浏览器侧不自行观测文件系统)"
        prerequisite_entity: "Project"
- Input: "保持默认仓内文档位置,点击确认完成"
- Output: "不超过 3 步完成注册(选代码根目录 → 选文档位置 → 完成);该项目被激活并进入工作台;以代码根目录名作为默认显示名进入项目列表(UF1 数据要求:目录名默认、可改)"
- State: "项目三分信息持久化为工作台自有状态(projects 行:code_root 落库——路径规范化口径未收录于事实表,UNKNOWN、doc_location_type = in_repo、doc_location_path 为空(FT-036:in_repo → 路径为空)、display_name = 目录名(FT-036:未提供时默认目录名);active_project_id 指向新项目);watch 链按新激活项目重建(FT-047:激活切换 = 全量 watch 重建)"
- Side-effect: "注册/激活只写工作台自有库,零项目目录写入"
- Invariants: "单激活:激活新项目即原项目去激活"

## Outcome "same-path-conflict"
<!-- 事实锚:FT-037(3)(仓外文档路径等于本项目代码根目录 → ERR_DOC_PATH_CONFLICT;纯库比对、零文件系统探测) -->
- Preconditions: "步骤 ② 选定的仓外文档位置与代码根目录为同一目录"
  fixture_spec:
    entities:
      - entity_type: "Project"
        min_count: 1
        field_constraints:
          - field: "active"
            value: true
    state_requirements:
      - description: "向导步骤 ② 显式选择仓外路径 = 步骤 ① 所选代码根目录"
        prerequisite_entity: "Project"
- Input: "确认该文档位置"
- Output: "校验失败并拒绝,要求重新选择;不得以相同路径完成注册"
- State: "零注册写入(文档位置与代码根目录一致性校验拒绝——FT-037(3):纯库比对,错误码语义 ERR_DOC_PATH_CONFLICT,路径不得等于本项目代码根目录)"
- Side-effect: "none"

## Outcome "external-auth-required"
<!-- 事实锚:FT-051(向导步骤②显式授权的唯一落库通道;校验链对仓外路径先查授权记录、先于任何对该路径的文件系统探测) -->
- Preconditions: "步骤 ② 选定的文档位置为仓外本地路径,且不等于代码根目录、路径可读(与代码根目录相同的情形归 same-path-conflict;授权后不可读的情形归 external-authorized-unreadable)"
  fixture_spec:
    entities:
      - entity_type: "Project"
        min_count: 1
        field_constraints:
          - field: "active"
            value: true
    state_requirements:
      - description: "仓外 docs 树路径可用且未授权(授权记录为空)"
        prerequisite_entity: "Project"
- Input: "用户在步骤 ② 查看授权提示并勾选确认授权,随后完成注册"
- Output: "授权确认后完成注册;未显式切换仓外时,默认文档位置为仓内(外置默认关闭)"
- State: "勾选确认即授权记录落库(向导步骤②显式授权的唯一落库通道,FT-051),随后注册以 external 文档位置落库;授权校验先于任何对未授权路径的文件系统探测(FT-051)"
- Side-effect: "授权记录与项目行均写工作台自有库;零项目目录写入"

## Outcome "external-auth-declined"
<!-- 事实锚:FT-051(未授权仓外路径在校验关卡拒绝,先于任何文件系统探测);source: inferred:「未确认时完成操作不可用」的禁用呈现推自 journey Step 3c 口径(授权确认为仓外注册的前置关卡) -->
- Preconditions: "步骤 ② 选定的仓外本地路径不等于代码根目录,授权确认处于未勾选状态且用户即此尝试完成(与 external-auth-required 以授权勾选状态互斥;与 same-path-conflict 以路径异于代码根目录互斥)"
  fixture_spec:
    entities:
      - entity_type: "Project"
        min_count: 1
        field_constraints:
          - field: "active"
            value: true
    state_requirements:
      - description: "仓外路径可用且未授权(授权记录为空)"
        prerequisite_entity: "Project"
- Input: "用户不勾选授权,直接尝试点击完成"
- Output: "完成操作不可用;向导停留步骤 ② 并提示需先完成授权"
- State: "零注册写入、零授权记录(FT-051:授权为仓外注册的前置关卡,未经确认不得以该路径落库)"
- Side-effect: "none"

## Outcome "external-authorized-unreadable"
<!-- 事实锚:FT-037(5)(已授权仓外路径不可读 → ERR_EXTERNAL_PATH_UNREADABLE;FT-051 授权关卡之后的可读性关卡) -->
- Preconditions: "步骤 ② 选定的仓外本地路径不等于代码根目录,用户已勾选确认授权(授权记录已落库),但该路径已不可读——被移动/删除或无权限(与 external-auth-required 以路径可读性互斥)"
  fixture_spec:
    entities:
      - entity_type: "Project"
        min_count: 1
        field_constraints:
          - field: "active"
            value: true
    state_requirements:
      - description: "仓外路径在授权落库后注入不可读(移动/删除/权限收回;fixture 临时目录内操作,随 fixture 清理)"
        prerequisite_entity: "Project"
- Input: "用户在勾选授权后点击完成"
- Output: "注册失败并呈现路径不可读错误提示;停留向导,不得以该路径完成注册"
- State: "零注册写入(授权后路径可读性校验拒绝——FT-037(5),错误码语义 ERR_EXTERNAL_PATH_UNREADABLE)"
- Side-effect: "none"

## Journey Invariants

- 项目三分模型:代码根目录、工作台自有状态、过程文档位置三者独立存放;工作台自有状态不与 forge 数据混放
- 移除项目只删工作台注册信息:任何移除操作不改动项目仓内文件与 forge 数据
- 单激活约束:任意时刻至多一个激活项目

## Fixture Specification

本 Contract 各 Outcome 的 fixture 实体并集(逐 Outcome 明细见各 Preconditions 内 fixture_spec):

```yaml
fixture_spec:
  entities:
    - entity_type: "Project"
      min_count: 1
```
