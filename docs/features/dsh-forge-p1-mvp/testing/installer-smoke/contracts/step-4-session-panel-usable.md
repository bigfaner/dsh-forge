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
      - entity_type: "InstallerArtifact"
        min_count: 1
        field_constraints:
          - field: "install_state"
            value: "已安装，首屏可达（衔接 Step 3）"
    state_requirements:
      - description: "零项目态（新建会话为空会话，无历史会话干扰）"
        prerequisite_entity: "Project"
- Input: "点左栏 rail「新会话」（品牌行为等价入口——UF-1 交互流第 1 条：点击 → 中区切换到会话视图并新建会话）"
- Output: "中区切换为会话视图并新建会话，呈现引导输入的空会话态（UF-4 States）；「会话面板可用」的可观察判据 = 对话 tab 输入区可聚焦、键入字符即回显（发送不走查）。真实 agent 往返由兄弟 Journeys session-workbench（Step 2）与 knowledge-recall-flywheel 承载，本旅程验证安装形态下面板可达可用，不重复行使"
- State: "会话视图 + 新建会话（零消息引导态）"
- Side-effect: "none（新会话建立为 dsh 侧行为，不走查其账本）"

## Outcome "blank-send-blocked-min"
<!-- 溯源: journey Step 4b（空消息提交被拦截）；Web surface 必察项 validation-error 的实步承载——冒烟最小口径（完整行为断言由 session-workbench Step 2c 承载） -->
- Preconditions: "Step 4 会话已建，对话 tab 输入框为空或仅空白字符"
  fixture_spec:
    entities:
      - entity_type: "InstallerArtifact"
        min_count: 1
        field_constraints:
          - field: "install_state"
            value: "已安装，空会话已建（衔接 success 终态）"
- Input: "直接点发送"
- Output: "不发送——无消息上屏、无 agent 往返（冒烟最小口径）；焦点保持 / 引导态保持等完整行为断言由兄弟 Journey session-workbench Step 2c 承载（同一输入面）"
- State: "零消息零往返"
- Side-effect: "none"

## Journey Invariants

- 加载与走查全程无远程资源请求（无远程脚本 / 字体 / 样式拉取）——运行期观察由 Step 2b 行使，安装产物侧由 Step 1 产物检查承载
- 安装形态行为与开发形态一致——机制 = 同一 boot manifest 掌舵装载链路（提案 In Scope M0 定义该装载机制；「安装 ≡ 开发」等价性主张 cited sources 未明文，source: inferred），属审计通道（构建产物链路审查承载），非浏览器可观察断言

## Fixture Specification

本 Contract 各 Outcome 的前置数据状态并集：InstallerArtifact（已安装，首屏可达 / 空会话已建两态衔接）。冒烟最小口径：输入区可聚焦回显 + 空提交不产生往返。
