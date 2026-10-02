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
- Preconditions: "安装完成且完好（衔接 Step 1 终态——启动路径无异常预置），启动入口在位；目标机器联网（网络可用），且为首次启动（此前无成功启动记录，用户数据目录未初始化）"
  fixture_spec:
    entities:
      - entity_type: "Project"
        min_count: 0
    state_requirements:
      - description: "已安装完成，启动入口（快捷方式）在位，启动路径完好（无异常预置）；联网；首次启动"
        scope: "environment"
        abstraction: "environment-state（OS 层机器态，非 er-diagram.md 领域实体）"
- Input: "从安装入口（Step 1 快捷方式）启动应用"
- Output: "应用主窗口打开并完成装载进入首屏——全程无报错弹窗、无白屏停留；装载在等待窗口内完成（等待窗口 = 180s——boot watchdog 上界，超时 exit(3)，fact ELECTRON_MAIN；超时未呈现即冒烟失败，口径见 launch-failure-fail-fast）。审计注记：装载机制（薄宿主 + 自有前端入口 + 壳内核经 boot manifest 掌舵）为架构内部件（提案 In Scope M0），由契约面 pin 测试（G1 门）承载，非浏览器可观察断言"
- State: "应用进程运行、主窗口就绪（首屏在 180s 等待窗口内到达——fact ELECTRON_MAIN）"
- Side-effect: "none（相对安装态）"

## Outcome "offline-launch-self-sufficient"
<!-- 溯源: journey Step 2b（离线环境启动） -->
- Preconditions: "安装完成且完好（衔接 Step 1 终态），目标机器处于断网环境；首次启动"
  fixture_spec:
    entities:
      - entity_type: "Project"
        min_count: 0
    state_requirements:
      - description: "已安装完成，启动路径完好；首次启动"
        scope: "environment"
        abstraction: "environment-state（OS 层机器态，非 er-diagram.md 领域实体）"
      - description: "目标机器断网环境（网络请求全部不可达）；断网实现通道 UNKNOWN——OS 级断网或请求拦截桩均需 harness 提供（fact E2E_INFRA 既有探针不含该设施）"
        scope: "environment"
- Input: "启动应用并走查主界面加载"
- Output: "应用加载与 UI 走查不因网络请求失败而阻塞或降级（离线自足断言：无远程脚本 / 字体 / 样式拉取；观察通道 = UNKNOWN——fact E2E_INFRA 既有探针 = boot ready / RPC / UI / session log，无网络请求记录器，需 harness 新增请求监听设施，落地前不臆断通道）"
- State: "离线装载成功（首屏可达，见 Step 3 断言；等待窗口同 success = 180s，fact ELECTRON_MAIN）"
- Side-effect: "none"

## Outcome "launch-failure-fail-fast"
<!-- 溯源: journey Step 2c（启动异常的失败口径——显式记账） -->
- Preconditions: "安装完成但启动路径被预置破坏（运行时缺失 / 首启崩溃 / 白屏类故障）；网络环境不设限（判定无关；与 success / offline 的完好前置互斥）"
  fixture_spec:
    entities:
      - entity_type: "Project"
        min_count: 0
    state_requirements:
      - description: "已安装但启动路径异常预置：运行时缺失可经删除 / 改名已安装文件实现；首启崩溃 / 白屏注入通道 UNKNOWN（fact FAULT_INJECTION_CONTRACT：e2e 无故障注入设施）——由 harness 以文件级预置破坏落地，不臆断注入点"
        scope: "environment"
        abstraction: "environment-state（OS 层机器态，非 er-diagram.md 领域实体）"
- Input: "启动应用并观察结果"
- Output: "冒烟即判失败——首屏未在等待窗口内呈现；可见失败呈现 = OS 级进程退出（含 boot watchdog 180s 超时 exit(3)——fact ELECTRON_MAIN）/ 崩溃对话框。产品级启动错误态 UI 归 M8「空错态与过渡打磨」（提案 Out of Scope），本旅程不设断言（记账：失败可检出，失败态呈现不属本旅程）"
- State: "冒烟失败判定成立（等待窗口 180s 超时可观测——fact ELECTRON_MAIN）"
- Side-effect: "none"

## Outcome "second-launch-consistent"
<!-- source: inferred -->
<!-- reasoning: 已安装应用可重复启动为冒烟基线；旅程范围记账仅排除覆盖安装 / 升级边界，不排除多次启动；「安装 ≡ 开发」不变式隐含启动行为可重复。口径锚定 fact ELECTRON_MAIN 单实例锁：首实例存活时的二次启动为锁接管路径非本 Outcome，本 Outcome 行使冷重启 -->
- Preconditions: "应用已安装且完好，此前至少完整启动过一次且首实例已正常退出（冷重启——衔接 success 终态后关闭应用），机器状态未变；联网环境"
  fixture_spec:
    entities:
      - entity_type: "Project"
        min_count: 0
    state_requirements:
      - description: "已安装且已成功启动过一次（用户数据目录已初始化）；无存活的首实例（冷重启——单实例锁无竞争，fact ELECTRON_MAIN）"
        scope: "environment"
        abstraction: "environment-state（OS 层机器态，非 er-diagram.md 领域实体）"
- Input: "再次从同一安装入口启动应用（首实例已退出后的冷重启）"
- Output: "冷重启下新进程获得单实例锁、主窗口再次打开并在等待窗口（180s，fact ELECTRON_MAIN）内到达首屏——与首次启动同相位（零项目 hero 相位，fact HERO_PHASE），无首启异常回归；首实例存活时的二次启动为锁接管 / 退出语义（fact ELECTRON_MAIN），非本 Outcome 口径"
- State: "已安装态可重复启动（用户数据目录持久，无一次性首启依赖）"
- Side-effect: "none"

## Journey Invariants

- 加载与走查全程无远程资源请求（无远程脚本 / 字体 / 样式拉取）——运行期观察由 Step 2b 行使，安装产物侧由 Step 1 产物检查承载
- 安装形态行为与开发形态一致——机制 = 同一 boot manifest 掌舵装载链路（提案 In Scope M0 定义该装载机制；「安装 ≡ 开发」等价性主张 cited sources 未明文，source: inferred），属审计通道（构建产物链路审查承载），非浏览器可观察断言

## Fixture Specification

本 Contract 各 Outcome 的前置数据状态并集（均为 OS 层环境态，非设计领域实体，见各 state_requirements 的 abstraction 注记）：已安装完好（success / offline / second-launch）与异常预置（launch-failure-fail-fast），按 联网/断网 × 首次启动/冷重启 分区互斥；Project 计 0 为四 Outcome 共同 Given（零项目用户数据）。等待窗口口径 = 180s（boot watchdog 上界，fact ELECTRON_MAIN；超时未呈现首屏即冒烟失败）。机器复位纪律：四态互斥不可共存——逐 Outcome 从同一基线（全新安装已就位、零项目用户数据、无存活实例）以快照恢复或重装置置；fail-fast 的破坏预置在其场景内施加并在结束时还原，second-launch 在首实例正常退出后行使，否则 Outcome 顺序污染（异常预置残留破坏 second-launch）。
