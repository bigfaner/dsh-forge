---
journey: "out-of-repo-docs-root"
step: 1
step-action: "注册向导到达文档位置步骤"
generated: "2026-09-25"
sources:
  - docs/features/dsh-forge-m3/testing/out-of-repo-docs-root/journey.md
anchors:
  web:
    page: "注册向导(文档位置步骤)"
    route: "workbench/dialog/register-wizard"
    requires_auth: false
    layout: "WorkbenchShell → WizardDialog → StepExternal(文档位置)"
last_anchor_sync: "2026-09-25T00:59:32Z"
---

# Contract: out-of-repo-docs-root / Step 1: 注册向导到达文档位置步骤

<!-- gen-contracts: do not edit manually. Regenerate via /gen-contracts. -->
<!-- state-verification: full -->

## Outcome "success"
- Preconditions: "新 forge 项目代码仓(fixture:含 .git、代码文件与 .forge/,无过程文档);应用已启动;起始环境授权登记为空,应用管理路径可写"
  fixture_spec:
    entities:
      - entity_type: "ForgeProjectCodeRoot"
        min_count: 1
        field_constraints:
          - field: "hasDotForge"
            value: true
          - field: "hasProcessDocs"
            value: false
- Input: "用户经项目切换器「添加项目」发起注册新项目,走到文档位置步骤"
- Output: "默认值 = 仓外文档根(应用管理路径);仓内存放为可选项(非默认)"
- State: "纯呈现;默认值翻转落点 = 内核管理位置(docsRoot);零注册写入"
- Side-effect: "none"
- Invariants: "新注册项目的文档根默认恒为仓外(应用管理路径);仓内仅为显式选项"

## Outcome "explicit-in-repo"
- Preconditions: "文档位置步骤呈现中;用户主动选择仓内选项"
  fixture_spec:
    entities:
      - entity_type: "ForgeProjectCodeRoot"
        min_count: 1
        field_constraints:
          - field: "hasDotForge"
            value: true
- Input: "用户显式选择仓内选项并完成注册"
- Output: "注册成功,文档根位于仓内;仓内文档工作流照常可用(选项保留,非淘汰)"
- State: "项目行 docLocationType = in_repo(路径空);不经仓外授权链(仓内路径无授权要求)"
- Side-effect: "none"
- Invariants: "仓内选项保留;仓内无授权要求"

## Outcome "forge-not-detected"
<!-- source: BIZ-workbench-003(注册校验链:`.forge/` 与文档位置均无 → ERR_FORGE_NOT_DETECTED,错误引导修正路径或先初始化项目) -->
- Preconditions: "注册所选代码根目录不含 .forge/ 且文档位置无 forge 数据"
  fixture_spec:
    entities:
      - entity_type: "CodeRootDirectory"
        min_count: 1
        field_constraints:
          - field: "hasDotForge"
            value: false
          - field: "docLocationHasForgeData"
            value: false
- Input: "用户选择该目录作为代码根继续注册"
- Output: "注册被阻止,呈现 forge 数据未检出的错误引导(修正路径或先初始化项目);不进入文档位置步骤"
- State: "零注册写入;校验链在文档位置步骤之前拦截"
- Side-effect: "none"
- Invariants: "注册期校验链沿用 M2:forge 数据未检出即阻止"

## Journey Invariants

- 新注册项目的文档根默认恒为仓外(应用管理路径);仓内仅为显式选项
- 仓外注册项目:代码仓内零新增过程文档(应用/agent 写入语义,用户自有改动除外)
- 全部过程资产读写按文档根寻址(看板/提案板/阶段资产同源)
- 既有仓内项目行为零破坏(默认值翻转不回溯影响存量项目)
- 注册期校验链沿用 M2:forge 数据未检出、重复注册、仓外路径非法或未授权均阻止落注册(无绕过通道,错误成因可辨)
