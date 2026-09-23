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
- Input: "保持默认仓内文档位置,点击确认完成"
- Output: "不超过 3 步完成注册(选代码根目录 → 选文档位置 → 完成);该项目被激活并进入工作台;以代码根目录名作为默认显示名进入项目列表(UF1 数据要求:目录名默认、可改)"
- State: "项目三分信息持久化为工作台自有状态(projects 行:code_root 规范化、doc_location_type = in_repo、doc_location_path 为空、display_name = 目录名;active_project_id 指向新项目——状态读数对拍);watch 链按新激活项目重建"
- Side-effect: "注册/激活只写工作台自有库(SQLite),零项目目录写入"
- Invariants: "单激活:激活新项目即原项目去激活"

## Outcome "same-path-conflict"
- Preconditions: "步骤 ② 选定的仓外文档位置与代码根目录为同一目录"
  fixture_spec:
    entities:
      - entity_type: "Project"
        min_count: 1
    state_requirements:
      - description: "向导步骤 ② 显式选择仓外路径 = 步骤 ① 所选代码根目录"
        prerequisite_entity: "Project"
- Input: "确认该文档位置"
- Output: "校验失败并拒绝,要求重新选择;不得以相同路径完成注册"
- State: "零注册写入(校验链序 3 纯库比对拒绝,错误码语义 ERR_DOC_PATH_CONFLICT——路径不得等于本项目代码根目录)"
- Side-effect: "none"

## Outcome "external-auth-required"
- Preconditions: "步骤 ② 选定的文档位置为仓外本地路径,且不等于代码根目录(与代码根目录相同的情形归 same-path-conflict)"
  fixture_spec:
    entities:
      - entity_type: "Project"
        min_count: 1
    state_requirements:
      - description: "仓外 docs 树路径可用且未授权(授权记录为空)"
        prerequisite_entity: "Project"
- Input: "用户在步骤 ② 查看授权提示并勾选确认授权(或在不勾选时尝试完成)"
- Output: "授权确认后方可完成注册(未确认时完成操作不可用);未显式切换仓外时,默认文档位置为仓内(外置默认关闭)"
- State: "勾选确认 = 经 authorizeExternalDocPath 动词落授权记录(向导步骤②确认的唯一落库通道),随后注册以 external 文档位置落库;校验链在授权关卡先于任何对未授权路径的文件系统探测"
- Side-effect: "授权记录与项目行均写工作台自有库;零项目目录写入"

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
