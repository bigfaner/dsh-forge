---
journey: "project-registration-projection"
step: 2
step-action: "给定代码区路径并侦测"
generated: "2026-09-30"
sources:
  - docs/features/dsh-forge-m4/testing/project-registration-projection/journey.md
anchors:
  web:
    page: "添加项目确认卡(C7)·路径侦测面"
    route: "project(卡内即时侦测)"
    requires_auth: false
    layout: "probeProjectPath(DetectReport)→ CardPhase:invalid-entry/registered/missing/parent/valid/nogit"
last_anchor_sync: "2026-09-30T00:00:00Z"
---

# Contract: project-registration-projection / Step 2: 给定代码区路径并侦测

<!-- gen-contracts: do not edit manually. Regenerate via /gen-contracts. -->
<!-- state-verification: full (CardPhase 状态机纯函数可直接对拍;FT-132;DetectReport 形状 FT-131) -->
<!-- surface-web required_outcomes 映射:validation-error → 路径输入面即表单面:非法/异常输入(不存在/已注册/父目录误选/非法入口)映射为对应态即时提示 + 添加禁用、留在卡内可修正(即时校验不静默;各态 Preconditions 互斥) -->

## Outcome "success"
- Preconditions: "确认卡已打开;给定一个存在的 git 仓代码区路径(未被注册,无 ≥2 子仓)"
  fixture_spec:
    entities:
      - entity_type: "Project"
        min_count: 1
        field_constraints:
          - field: "codeRoot"
            value: "另一已注册项目(同名同序基线)"
      - entity_type: "CodeRoot"
        min_count: 1
        field_constraints:
          - field: "exists"
            value: true
          - field: "isDir"
            value: true
          - field: "readable"
            value: true
          - field: "gitRoot"
            value: "顶层 .git 存在"
          - field: "childRepos"
            value: "少于 2 个(非父目录形态)"
- Input: "编排者在卡内给定该 git 仓路径(拖拽/粘贴/浏览)"
- Output: "侦测陈述与文档位置预览行呈现,呈 valid 态可添加;项目名自动取文件夹名(✎ 可改);侦测覆盖 git/仓内 forge 树特征/已注册/父目录多子仓"
- State: "卡处于 valid 态;注册表零变更(纯侦测)"
- Side-effect: "none"

## Outcome "missing-path"
- Preconditions: "给定路径不存在(或非目录/不可读)"
  fixture_spec:
    entities:
      - entity_type: "CodeRoot"
        min_count: 1
        field_constraints:
          - field: "exists"
            value: "false(或 isDir=false / readable=false)"
- Input: "编排者提交该路径"
- Output: "missing 态「路径不存在」+ 添加禁用;即时提示、留在卡内修正;不产生半注册状态"
- State: "卡处于 missing 态;注册表零变更"
- Side-effect: "none"

## Outcome "registered-duplicate"
- Preconditions: "给定路径已注册为某项目代码区(realpath 归一命中)"
  fixture_spec:
    entities:
      - entity_type: "Project"
        min_count: 1
        field_constraints:
          - field: "codeRoot"
            value: "与待提交路径 realpath 归一同一(canonical/pathKey/(dev,ino) 三层比对)"
      - entity_type: "CodeRoot"
        min_count: 1
        field_constraints:
          - field: "registered"
            value: "命中既有项目(快车道)"
- Input: "编排者提交该已注册代码根路径"
- Output: "registered 态「已注册项目 — 同一代码根仅一个项目」+ 添加禁用;快车道 toast 打开既有项目,不出卡流程"
- State: "卡处于 registered 态;注册表零新增(同一代码根仅一个项目)"
- Side-effect: "none"

## Outcome "parent-multi-repo"
- Preconditions: "给定目录下含 ≥2 个 .git 子仓(父目录误选形态)"
  fixture_spec:
    entities:
      - entity_type: "CodeRoot"
        min_count: 1
        field_constraints:
          - field: "childRepos"
            value: "≥2 个 .git 子仓"
- Input: "编排者提交该父目录路径"
- Output: "parent 态呈现子仓 chips,一键选择具体子仓;不误注册父目录"
- State: "卡处于 parent 态;父目录本身不进入注册面"
- Side-effect: "none"

## Outcome "nogit-info"
- Preconditions: "给定存在且可读的目录,但无 .git(零 git 形态)"
  fixture_spec:
    entities:
      - entity_type: "CodeRoot"
        min_count: 1
        field_constraints:
          - field: "exists"
            value: true
          - field: "gitRoot"
            value: "null(未检测到 git)"
- Input: "编排者提交该无 .git 目录"
- Output: "nogit 态信息提示「未检测到 git — 文档将由应用管理」(信息,非错误);文档位置预选 = 应用管理主路径;添加可用,任何流程不以「先 git init」为前置"
- State: "卡处于 nogit 态(信息态);文档位置预选落 app 管理"
- Side-effect: "none"
- Invariants: "零 git 强制:无 .git 目录为一等公民"

## Journey Invariants

- forge 项目注册表为唯一权威;dsh workspaceRegistry 恒为单向投影(DF001),旅程全程无 dsh→forge 反向写
- 注册硬校验仅 2 条:代码区存在且为目录 + 可读;跨项目唯一(realpath 归一比对)
- 零 git 强制:无 .git 目录为一等公民;任何流程不得以「先 git init」为前置
- 黏性禁令:文档位置默认只由本仓证据决定,不跨项目携带仓内选择
- 投影失败不阻断注册(降级承诺,提供手动重试);健康时同名同序恒成立;投影操作 ≤2s
- 词汇统一「添加项目 / 文档位置」;场景演示 chips 不上产品 UI
