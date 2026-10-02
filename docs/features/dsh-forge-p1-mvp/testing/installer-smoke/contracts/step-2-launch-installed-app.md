---
journey: "installer-smoke"
step: 2
step-action: "启动已安装应用"
generated: "2026-10-03"
sources:
  - docs/features/dsh-forge-p1-mvp/testing/installer-smoke/journey.md
anchors:
  web:
    page: ""
    route: ""
    requires_auth: false
    layout: ""
last_anchor_sync: "2026-10-03T04:03:45+08:00"
---

# Contract: installer-smoke / Step 2: 启动已安装应用

<!-- gen-contracts: do not edit manually. Regenerate via /gen-contracts. -->
<!-- anchors 注记: OS 级启动场景，无 web 页面对应——锚点留空（不猜测） -->
<!-- state-verification: partial（装载机制为架构内部件，由契约面 pin 测试承载——G1 门；浏览器可观察断言 = 首屏呈现与失败可检出） -->

## Outcome "success"
- Preconditions: "安装完成（衔接 Step 1 终态），启动入口在位"
  fixture_spec:
    entities:
      - entity_type: "InstallerArtifact"
        min_count: 1
        field_constraints:
          - field: "install_state"
            value: "已安装完成，启动入口（快捷方式）在位"
- Input: "从安装入口（Step 1 快捷方式）启动应用"
- Output: "应用主窗口打开并完成装载进入首屏——全程无报错弹窗、无白屏停留；装载在等待窗口内完成（超时未呈现即冒烟失败，口径见 launch-failure-fail-fast）。审计注记：装载机制（薄宿主 + 自有前端入口 + 壳内核经 boot manifest 掌舵）为架构内部件（提案 In Scope M0），由契约面 pin 测试（G1 门）承载，非浏览器可观察断言"
- State: "应用进程运行、主窗口就绪（等待窗口内到达首屏）"
- Side-effect: "none（相对安装态）"

## Outcome "offline-launch-self-sufficient"
<!-- 溯源: journey Step 2b（离线环境启动） -->
- Preconditions: "安装完成且目标机器处于断网环境"
  fixture_spec:
    entities:
      - entity_type: "InstallerArtifact"
        min_count: 1
        field_constraints:
          - field: "install_state"
            value: "已安装完成"
    state_requirements:
      - description: "目标机器断网环境（网络请求全部不可达）"
        prerequisite_entity: "InstallerArtifact"
- Input: "启动应用并走查主界面加载"
- Output: "应用加载与 UI 走查不因网络请求失败而阻塞或降级（离线自足断言：无远程脚本 / 字体 / 样式拉取；观察通道 = 启动期网络请求记录）"
- State: "离线装载成功（首屏可达，见 Step 3 断言）"
- Side-effect: "none"

## Outcome "launch-failure-fail-fast"
<!-- 溯源: journey Step 2c（启动异常的失败口径——显式记账） -->
- Preconditions: "安装完成但启动异常（运行时缺失 / 首启崩溃 / 白屏类故障）"
  fixture_spec:
    entities:
      - entity_type: "InstallerArtifact"
        min_count: 1
        field_constraints:
          - field: "install_state"
            value: "已安装但启动路径异常（运行时缺失 / 首启崩溃 / 白屏类故障注入或预置）"
- Input: "启动应用并观察结果"
- Output: "冒烟即判失败——首屏未在等待窗口内呈现；可见失败呈现 = OS 级进程退出 / 崩溃对话框。产品级启动错误态 UI 归 M8「空错态与过渡打磨」（提案 Out of Scope），本旅程不设断言（记账：失败可检出，失败态呈现不属本旅程）"
- State: "冒烟失败判定成立（等待窗口超时可观测）"
- Side-effect: "none"

## Outcome "second-launch-consistent"
<!-- source: inferred -->
<!-- reasoning: 已安装应用可重复启动为冒烟基线（fact ELECTRON_MAIN——单实例锁下二次启动自有接管/退出语义，非安装回归异常）；旅程范围记账仅排除覆盖安装 / 升级边界，不排除多次启动；「安装 ≡ 开发」不变式隐含启动行为可重复 -->
- Preconditions: "应用已安装且此前至少完整启动过一次（衔接 success 终态），机器状态未变"
  fixture_spec:
    entities:
      - entity_type: "InstallerArtifact"
        min_count: 1
        field_constraints:
          - field: "install_state"
            value: "已安装且已成功启动过一次（用户数据目录已初始化）"
- Input: "再次从同一安装入口启动应用"
- Output: "主窗口再次打开并在等待窗口内到达首屏——与首次启动同相位（零项目 hero 相位），无首启异常回归"
- State: "已安装态可重复启动（用户数据目录持久，无一次性首启依赖）"
- Side-effect: "none"

## Journey Invariants

- 加载与走查全程无远程资源请求（无远程脚本 / 字体 / 样式拉取）——运行期观察由 Step 2b 行使，安装产物侧由 Step 1 产物检查承载
- 安装形态行为与开发形态一致——机制 = 同一 boot manifest 掌舵装载链路（提案 In Scope M0 定义该装载机制；「安装 ≡ 开发」等价性主张 cited sources 未明文，source: inferred），属审计通道（构建产物链路审查承载），非浏览器可观察断言

## Fixture Specification

本 Contract 各 Outcome 的前置数据状态并集：InstallerArtifact（已安装 / 断网 / 异常预置 / 二次启动四态）。等待窗口口径 = 冒烟失败判定的时间边界（超时未呈现首屏即失败）。
