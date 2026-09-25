---
journey: "out-of-repo-docs-root"
step: 2
step-action: "以默认仓外完成注册"
generated: "2026-09-25"
sources:
  - docs/features/dsh-forge-m3/testing/out-of-repo-docs-root/journey.md
anchors:
  web:
    page: "注册向导(仓外路径授权确认 → 提交)"
    route: "workbench/dialog/register-wizard"
    requires_auth: false
    layout: "WorkbenchShell → WizardDialog(授权确认 + submit)"
last_anchor_sync: "2026-09-25T00:59:32Z"
---

# Contract: out-of-repo-docs-root / Step 2: 以默认仓外完成注册

<!-- gen-contracts: do not edit manually. Regenerate via /gen-contracts. -->
<!-- state-verification: full -->

## Outcome "success"
- Preconditions: "文档位置步骤默认仓外路径呈现;授权登记为空;应用管理路径可写;代码根通过 forge 检出(含 .forge/)"
  fixture_spec:
    entities:
      - entity_type: "ForgeProjectCodeRoot"
        min_count: 1
        field_constraints:
          - field: "hasDotForge"
            value: true
          - field: "codeRootUnique"
            value: true
    state_requirements:
      - description: "仓外路径授权确认完成后提交(授权登记持久化于工作台自有状态)"
        prerequisite_entity: "ForgeProjectCodeRoot"
- Input: "用户接受默认仓外文档根,完成仓外路径授权确认,提交注册"
- Output: "注册成功;授权登记持久化(后续读写免再次授权);项目文档根位于仓外应用管理路径"
- State: "项目行落库(docLocationType = external,路径 = 仓外应用管理路径);注册过程不向代码仓写入任何过程文档;若项目检出 index.json,向导插入迁移确认步骤(行为见 explicit-sot-migration Step 4b)"
- Side-effect: "授权登记持久化(app_state;校验链只读登记,入参无旗标绕过通道)"
- Invariants: "代码仓内零新增过程文档"

## Outcome "authorization-incomplete"
<!-- source: prd-spec Security(文档根路径授权沿用 M2);BIZ-workbench-001(授权登记持久化于自有状态,校验链只读登记,无入参旗标绕过通道) -->
- Preconditions: "文档位置步骤的仓外路径授权确认呈现中(授权登记为空)"
  fixture_spec:
    entities:
      - entity_type: "ForgeProjectCodeRoot"
        min_count: 1
        field_constraints:
          - field: "hasDotForge"
            value: true
    state_requirements:
      - description: "授权登记为空(用户尚未完成授权确认)"
        prerequisite_entity: "ForgeProjectCodeRoot"
- Input: "用户拒绝或跳过授权确认,尝试继续注册"
- Output: "呈现授权引导(沿用 M2 机制);未完成授权不以仓外路径落注册(无绕过通道);完成授权后注册与后续读写正常"
- State: "零注册写入;未授权仓外路径在校验链中先于任何 fs 探测被拒(ERR_EXTERNAL_PATH_UNREADABLE 语义)"
- Side-effect: "none"
- Invariants: "仓外路径非法或未授权均阻止落注册(无绕过通道)"

## Outcome "path-validation-failed"
<!-- surface-web required_outcomes 映射:validation-error → 文档位置步骤仓外路径输入校验失败的阻止 + 成因可辨错误 + 修正后可继续(不可读路径 → ERR_EXTERNAL_PATH_UNREADABLE;路径与代码根相同 → ERR_DOC_PATH_CONFLICT;BIZ-workbench-003 注册校验链沿用) -->
<!-- surface-web required_outcomes 映射:session-expired → 离线桌面壳无登录会话语义(N/A);注册向导为本地流程,无会话过期分支 -->
- Preconditions: "用户在文档位置步骤将仓外路径改写为非法值(不存在/不可读的路径,或与代码根相同的路径)"
  fixture_spec:
    entities:
      - entity_type: "ForgeProjectCodeRoot"
        min_count: 1
        field_constraints:
          - field: "hasDotForge"
            value: true
    state_requirements:
      - description: "用户改写的仓外路径为不存在/不可读路径,或与代码根相同"
        prerequisite_entity: "ForgeProjectCodeRoot"
- Input: "用户提交该路径继续注册"
- Output: "注册被阻止并按成因呈现可辨错误(路径无法访问 / 路径与代码根冲突);修正为合法仓外路径或回退默认应用管理路径后可继续完成注册"
- State: "零注册写入;成因可辨(ERR_EXTERNAL_PATH_UNREADABLE / ERR_DOC_PATH_CONFLICT)"
- Side-effect: "none"
- Invariants: "错误成因可辨;修正后可继续"

## Outcome "duplicate-registration"
<!-- source: BIZ-workbench-002(code_root 注册时规范化后 UNIQUE,重复注册 → ERR_PROJECT_EXISTS) -->
- Preconditions: "该代码根(规范化路径)已在注册表中"
  fixture_spec:
    entities:
      - entity_type: "Project"
        min_count: 1
        field_constraints:
          - field: "code_root"
            value: "与本次注册所选代码根规范化后相同"
      - entity_type: "ForgeProjectCodeRoot"
        min_count: 1
        field_constraints:
          - field: "path"
            value: "与已注册代码根相同"
- Input: "用户再次经项目切换器「添加项目」选择同一代码根发起注册"
- Output: "注册被阻止并呈现重复注册错误;既有注册与其文档根配置零变化;不产生第二条注册记录"
- State: "注册表零新增(UNIQUE 约束拒绝);既有项目行不变"
- Side-effect: "none"
- Invariants: "重复注册阻止落注册"

## Journey Invariants

- 新注册项目的文档根默认恒为仓外(应用管理路径);仓内仅为显式选项
- 仓外注册项目:代码仓内零新增过程文档(应用/agent 写入语义,用户自有改动除外)
- 全部过程资产读写按文档根寻址(看板/提案板/阶段资产同源)
- 既有仓内项目行为零破坏(默认值翻转不回溯影响存量项目)
- 注册期校验链沿用 M2:forge 数据未检出、重复注册、仓外路径非法或未授权均阻止落注册(无绕过通道,错误成因可辨)
