---
journey: "installer-smoke"
step: 4
step-action: "会话面板可用"
generated: "2026-10-03"
sources:
  - docs/features/dsh-forge-p1-mvp/testing/installer-smoke/journey.md
anchors:
  web:
    page: "工作台·会话视图（默认态）"
    route: "workbench/session"
    requires_auth: false
    layout: "WorkbenchLayout（左 rail / 中会话面板 / 右 dock）"
last_anchor_sync: "2026-10-03T04:03:45+08:00"
---

# Contract: installer-smoke / Step 4: 会话面板可用

<!-- gen-contracts: do not edit manually. Regenerate via /gen-contracts. -->
<!-- state-verification: partial（真实 agent 往返由兄弟 Journeys 承载，本步验证安装形态下面板可达可用） -->

## Outcome "success"
- Preconditions: "首屏可达（衔接 Step 3 终态），工作台零项目态"
  fixture_spec:
    entities:
      - entity_type: "Project"
        min_count: 0
    state_requirements:
      - description: "已安装，首屏可达（衔接 Step 3）"
        scope: "environment"
        abstraction: "environment-state（OS 层机器态，非 er-diagram.md 领域实体）"
      - description: "零项目态（新建会话为空会话，无历史会话干扰）"
        prerequisite_entity: "Project"
- Input: "点左栏 rail「新会话」（品牌行为等价入口——UF-1 交互流第 1 条：点击 → 中区切换到会话视图并新建会话；fact NEW_SESSION_ENTRIES：「新会话」钮与品牌行同 onClick startSession）"
- Output: "中区切换为会话视图并新建会话，呈现引导输入的空会话态（UF-4 States）；「会话面板可用」的可观察判据 = 对话 tab 输入区可聚焦、键入字符即回显（发送不走查）。真实 agent 往返由兄弟 Journeys session-workbench（Step 2）与 knowledge-recall-flywheel 承载，本旅程验证安装形态下面板可达可用，不重复行使"
- State: "会话视图 + 新建会话（零消息引导态；会话为 dsh 侧实体，非本应用领域模型实体——账本不走查，见 Side-effect）"
- Side-effect: "none（新会话建立为 dsh 侧行为，不走查其账本）"

## Outcome "blank-send-blocked-min"
<!-- 溯源: journey Step 4b（空消息提交被拦截）；Web surface 必察项 validation-error 的实步承载——冒烟最小口径（完整行为断言由 session-workbench Step 2c 承载）；source: inferred -->
- Preconditions: "Step 4 会话已建，对话 tab 输入框为空或仅空白字符（空输入判据 = draft 去空白后为空且无附件——fact EMPTY_SEND_GUARD）"
  fixture_spec:
    entities:
      - entity_type: "Project"
        min_count: 0
    state_requirements:
      - description: "已安装，空会话已建（衔接 success 终态）"
        scope: "environment"
        abstraction: "environment-state（OS 层机器态，非 er-diagram.md 领域实体）"
- Input: "在空输入下尝试提交：对发送按钮施加点击意图（空态按钮禁用——fact EMPTY_SEND_GUARD，自动化对禁用钮的常规点击不成立，故以强制点击 / 回车 / 程序化 submit() 触发提交意图）"
- Output: "提交被拦截——无消息上屏、无 agent 往返（空提交零消息零往返：按钮禁用 + click guard + submit() 双重护栏，fact EMPTY_SEND_GUARD；冒烟最小口径）；焦点保持 / 引导态保持等完整行为断言由兄弟 Journey session-workbench Step 2c 承载（同一输入面）"
- State: "零消息零往返"
- Side-effect: "none"

<!-- surface 必察项 adjudication：session-expired — N/A：单机产品无登录会话 / 过期概念（PRD 单机安全边界：本机回环、模型 API 凭证归 dsh profile 域）——source: inferred（surface-web required_outcomes × PRD 安全边界映射）；validation-error 已由 blank-send-blocked-min 实步承载 -->

## Journey Invariants

- 加载与走查全程无远程资源请求（无远程脚本 / 字体 / 样式拉取）——运行期观察由 Step 2b 行使，安装产物侧由 Step 1 产物检查承载
- 安装形态行为与开发形态一致——机制 = 同一 boot manifest 掌舵装载链路（提案 In Scope M0 定义该装载机制；「安装 ≡ 开发」等价性主张 cited sources 未明文，source: inferred），属审计通道（构建产物链路审查承载），非浏览器可观察断言

## Fixture Specification

本 Contract 各 Outcome 的前置数据状态并集：环境态（已安装，首屏可达 / 空会话已建两态衔接——OS 层状态，非设计领域实体）＋ Project 计 0（零项目态）。冒烟最小口径：输入区可聚焦回显 + 空提交被拦截不产生往返。
