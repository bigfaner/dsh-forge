---
feature: "dsh-forge-m3"
journey: "out-of-repo-docs-root"
risk_level: "Medium"
golden_path: false
surface_types: ["web"]
surface_keys: ["web"]
sources:
  - docs/features/dsh-forge-m3/prd/prd-user-stories.md
  - docs/features/dsh-forge-m3/prd/prd-spec.md
  - docs/features/dsh-forge-m3/prd/prd-ui-functions.md
generated: "2026-09-24"
---

<!-- golden_path 语义:标识「本旅程是否为 feature 指定的 Golden Path 主旅程」(每 feature 至多一条;dsh-forge-m3 指定主旅程 = task-dispatch-execution-loop);false ≠ 缺少 Happy Path——本旅程含完整 4 步 Happy Path(Steps 1-4,覆盖 Story 7 全部 AC) -->

# Journey: out-of-repo-docs-root

**Risk Level**: Medium

<!-- Risk Classification Criteria:
  High   = Workflow involves state mutation, data loss risk, or irreversible operations
  Medium = Workflow involves multi-step interaction without irreversible side effects
  Low    = Workflow is read-only or purely observational
-->

## Overview

SDD 开发者注册新项目时,过程文档根默认位于代码仓外(应用管理路径),仓内仅显式可选;以默认仓外注册的项目,任务/记录/阶段资产/proposals 全部读写落于文档根,代码仓保持零新增过程文档;既有仓内文档项目在 M3 读写兼容不破坏。

> PRD Traceability: Story 7(过程文档默认仓外);SC9;proposal Key Scenarios「新注册默认仓外」。

## Setup

- 应用已启动;备一个新 forge 项目代码仓(fixture 1:含 .git、代码文件与 `.forge/`,无过程文档——默认仓外文档根为空,forge 数据检出经代码根 `.forge/` 通过,BIZ-workbench-003 检出链)
- 备一个既有仓内文档根的已注册项目(fixture 2,兼容性承载)
- 备一个未注册、仓内已有过程文档但无 `tasks/index.json` 的 forge 项目(fixture 3,含 `.forge/`;Step 2e 承载)
- 文档根路径授权沿用 M2:显式授权确认、登记持久化于工作台自有状态;起始环境授权登记为空,应用管理路径可写
- 断言口径:浏览器面断言 = 向导/看板/面板呈现;代码仓工作区与文档根目录内容断言 = harness 级(测试通道直读文件系统,浏览器面不自证)

## Happy Path

### Step 1: 注册向导到达文档位置步骤

**User Action**: 用户经项目切换器「添加项目」发起注册新项目,走到文档位置步骤

**Expected Result**: 默认值 = 仓外文档根(应用管理路径);仓内存放为可选项(非默认)

### Step 2: 以默认仓外完成注册

**User Action**: 接受默认仓外文档根,完成仓外路径授权确认,提交注册

**Expected Result**: 注册成功;授权登记持久化(后续读写免再次授权);项目文档根位于仓外应用管理路径;注册过程不向代码仓写入任何过程文档(若项目检出 `index.json`,向导插入迁移确认步骤,行为见 explicit-sot-migration Step 4b)

### Step 3: 过程资产读写落于文档根

<!-- source: prd-spec 阶段资产与文档根数据模型(过程资产全部按文档根寻址)与阶段线(阶段总结会话 → 阶段资产文件落文档根);BIZ-task-ops-001 M3 修订(任务写 = agent 域) -->

**User Action**: 在该注册项目上经 agent 会话产出多类过程资产(任务派发 subagent 执行并留执行记录;阶段总结会话生成阶段资产;管线会话产出提案),并在任务看板/提案看板/阶段资产面板浏览

**Expected Result**: 各看板/面板呈现的内容与产出一致,且全部来自仓外文档根下的过程文档(各视图同源寻址文档根);代码仓工作区无应用新增的过程文档(harness 级:测试通道检查仓工作区)

### Step 4: 既有仓内项目兼容

**User Action**: 打开既有仓内文档根项目,执行 M3 读写(任务看板/阶段资产面板/提案看板)

**Expected Result**: 全部功能兼容不破坏;文档根仍在仓内;行为不因默认值翻转而改变

## Edge Cases

### Step 1b: 显式选择仓内文档根

**Precondition**: 文档位置步骤呈现中

**User Action**: 显式选择仓内选项并完成注册

**Expected Result**: 注册成功,文档根位于仓内;仓内文档工作流照常可用(选项保留,非淘汰);不经仓外授权链(仓内路径无授权要求)

### Step 1c: 所选代码根无 forge 数据

<!-- source: BIZ-workbench-003(注册校验链:`.forge/` 与文档位置均无 → ERR_FORGE_NOT_DETECTED,错误引导修正路径或先初始化项目) -->

**Precondition**: 注册所选代码根目录不含 `.forge/` 且文档位置无 forge 数据

**User Action**: 选择该目录作为代码根继续注册

**Expected Result**: 注册被阻止,呈现 forge 数据未检出的错误引导(修正路径或先初始化项目);不进入文档位置步骤

### Step 2b: 仓外路径授权未完成

<!-- source: prd-spec Security(文档根路径授权沿用 M2);BIZ-workbench-001(授权登记持久化于自有状态,校验链只读登记,无入参旗标绕过通道) -->

**Precondition**: 文档位置步骤的仓外路径授权确认呈现中(授权登记为空)

**User Action**: 拒绝或跳过授权确认,尝试继续注册

**Expected Result**: 呈现授权引导(沿用 M2 机制);未完成授权不以仓外路径落注册(无绕过通道);完成授权后注册与后续读写正常

### Step 2c: 文档位置路径校验失败

<!-- surface-web required_outcomes 映射:validation-error → 文档位置步骤仓外路径输入校验失败的阻止 + 成因可辨错误 + 修正后可继续(不可读路径 → ERR_EXTERNAL_PATH_UNREADABLE;路径与代码根相同 → ERR_DOC_PATH_CONFLICT;BIZ-workbench-003 注册校验链沿用) -->
<!-- surface-web required_outcomes 映射:session-expired → 离线桌面壳无登录会话语义(N/A);注册向导为本地流程,无会话过期分支 -->

**Precondition**: 用户在文档位置步骤将仓外路径改写为非法值(不存在/不可读的路径,或与代码根相同的路径)

**User Action**: 提交该路径继续注册

**Expected Result**: 注册被阻止并按成因呈现可辨错误(路径无法访问 / 路径与代码根冲突);修正为合法仓外路径或回退默认应用管理路径后可继续完成注册

### Step 2d: 重复注册同一项目

<!-- source: BIZ-workbench-002(code_root 注册时规范化后 UNIQUE,重复注册 → ERR_PROJECT_EXISTS) -->

**Precondition**: 该代码根(规范化路径)已在注册表中

**User Action**: 再次经项目切换器「添加项目」选择同一代码根发起注册

**Expected Result**: 注册被阻止并呈现重复注册错误;既有注册与其文档根配置零变化;不产生第二条注册记录

### Step 2e: 仓内含过程文档(无 index.json)的项目接受默认仓外

<!-- source: inferred: UF3 Placement「仅检出 index.json 时插入迁移确认」+ 本旅程 INV3(全部过程资产读写按文档根寻址)推演——仓内既有 md 过程文档不被工作台呈现,亦不被迁移/改动;PRD 未定义该形态的警告/搬迁语义,本步骤仅断言最小推演、不定界警告行为 -->

**Precondition**: fixture 3(未注册,仓内已有过程文档,无 `tasks/index.json`)

**User Action**: 走注册向导,保持默认仓外文档根完成注册,随后浏览任务看板/提案看板

**Expected Result**: 不插入迁移确认步骤(未检出 index.json);注册成功且文档根 = 仓外;工作台各视图按仓外文档根寻址——仓内既有过程文档不出现在视图,文件零改动、零搬迁(harness 级)

### Step 3b: 长期运行后的仓内零新增边界

<!-- source: inferred: SC9「代码仓内零新增过程文档」语义上仅约束应用/agent 写入的过程文档,用户自有改动不在该语义内(PRD 未显式定义此排除项) -->

**Precondition**: 仓外注册项目已完成 Step 3 的多类过程资产产出与读写(任务/执行记录/阶段资产/proposals 各 ≥1 笔)

**User Action**: 检查代码仓工作区是否保持干净(经测试通道检查 git 状态与未跟踪文件,harness 级)

**Expected Result**: 代码仓工作区除用户自有改动外无任何应用/agent 新增的过程文档;全部过程资产仅存在于仓外文档根

### Step 3c: 移除仓外注册项目

<!-- source: BIZ-workbench-001(移除注册仅级联清除快照/挂接等自有数据,不触碰项目仓内文件与 forge 数据) -->
<!-- source: inferred: 应用管理文档根的删除/保留归宿 PRD 未定界(BIZ-workbench-001 移除范围成文于 M2 仓内文档世界),本步骤显式不定界、不作断言 -->

**Precondition**: 仓外注册项目已注册且文档根含过程文档

**User Action**: 在工作台移除该注册项目

**Expected Result**: 移除完成;项目仓内文件与 forge 数据零改动;再次注册同一代码根可行;仓外文档根内容的清除/保留归宿不作断言(PRD 未定界)

### Step 4b: 仓内项目的外部变更回流

<!-- source: inferred: ≤5s 回流口径仅任务看板(BIZ-workbench-005)与提案看板(SC6/Story 6)有源;阶段资产面板的回流呈现为 M2 DF003 感知机制延续的推演,PRD 未对其单列时效断言 -->

**Precondition**: 既有仓内项目的文档被外部(终端 CLI/编辑器)修改

**User Action**: 回看应用内工作台(任务看板/提案看板/阶段资产面板)

**Expected Result**: 外部修改在应用内可见——任务与提案变更 ≤5 秒回流(免手动刷新),阶段资产/文档视图呈现最新内容;兼容为持续感知的读写,非仅启动时静态读取

## Journey Invariants

- 新注册项目的文档根默认恒为仓外(应用管理路径);仓内仅为显式选项
- 仓外注册项目:代码仓内零新增过程文档(应用/agent 写入语义,用户自有改动除外)
- 全部过程资产读写按文档根寻址(看板/提案板/阶段资产同源)
- 既有仓内项目行为零破坏(默认值翻转不回溯影响存量项目)
- 注册期校验链沿用 M2:forge 数据未检出、重复注册、仓外路径非法或未授权均阻止落注册(无绕过通道,错误成因可辨)
