---
journey: "plugin-management"
step: 1
step-action: "打开插件管理区"
generated: "2026-09-23"
sources:
  - docs/features/dsh-forge-m2/testing/plugin-management/journey.md

anchors:
  web:
    page: "workbench/overview"
    route: ""
    requires_auth: false
    layout: "WorkbenchShell → OverviewPage → PluginSection(两级插件清单)"

last_anchor_sync: "2026-09-23T01:18:11Z"
---

# Contract: plugin-management / Step 1: 打开插件管理区

<!-- gen-contracts: do not edit manually. Regenerate via /gen-contracts. -->

## Outcome "success"
- Preconditions: "应用已启动并进入工作台;插件装置就绪——forge 核心插件以必备身份装配(必备标识派生自产品级配置清单 mandatory 标注),第三方 fixture 插件至少 2 个且均启用(基座 hello-world + fixture 内动态注册第二实例,「仅该插件」收敛需第二实例对照方可证伪);plugin-runtime.json 为合法状态(缺失或无违规条目;失效形态腿见 overlay-invalid)"
  fixture_spec:
    entities:
      - entity_type: "Plugin"
        min_count: 3
        field_constraints:
          - field: "mandatory"
            value: "forge 核心插件恰一个 = true"
          - field: "enabled"
            value: "全部启用(覆盖文件缺失或为空 = 全启用)"
    state_requirements:
      - description: "一次性 fixture 装置:临时目录 + 隔离 userData(启停覆盖文件 plugin-runtime.json 归旅程控制)、测试后清理"
        prerequisite_entity: "Plugin"
      - description: "跨面断言口径:文件面断言由测试进程直读 fixture 文件(产品清单 sha256 前后对拍、覆盖文件写入、forge 数据 hash 对拍),不以「没报错」为据"
        prerequisite_entity: "Plugin"
- Input: "用户打开工作台设置区(插件管理区)"
- Output: "插件列表两级呈现:forge 核心插件标记「必备」且仅状态展示(无禁用入口);第三方插件显示启用状态与「禁用」动作"
- State: "插件行投影 = 产品清单(只读)× 运行时覆盖文件;两级层级与必备标识呈现"
- Side-effect: "none(打开只读)"
- Invariants: "必备清单对运行时只读"

## Outcome "mandatory-no-disable"
<!-- surface-web required_outcomes 映射:validation-error → 本旅程无表单输入面(插件区唯一可写件 = 第三方行启停动词,无自由文本输入);非法请求类比 = 对必备插件发起禁用(越权启停请求),映射为必备行不渲染禁用入口 + 写路径守卫拒绝 = 本边 -->
- Preconditions: "插件管理区已展示必备(核心)插件"
  fixture_spec:
    entities:
      - entity_type: "Plugin"
        min_count: 1
        field_constraints:
          - field: "mandatory"
            value: true
- Input: "用户在必备插件行寻找禁用入口并尝试发起禁用"
- Output: "必备插件行无禁用入口(不渲染,而非渲染后禁用);渲染面不存在禁用 forge 核心插件的通道"
- State: "无启停写请求可从浏览器面发出;纵深第二层(对必备名启停写请求的守卫拒绝,ERR_PLUGIN_MANDATORY)由 SC6 验收,不在浏览器面断言"
- Side-effect: "none"

## Outcome "overlay-invalid"
<!-- surface-web required_outcomes 映射:session-expired → 本旅程为离线桌面应用(继承 M1 无端口/无服务端会话模型),无字面会话过期面;通道失效类比 = 运行时启停状态通道失效(plugin-runtime.json 被篡改塞必备名/坏 JSON 解析失败),按 ERR_PLUGIN_RUNTIME_STATE 处置 = 本边 -->
<!-- source: inferred:处置口径(启动不阻断、违规条目剔除回退清单态)无 PRD 明文;依据 = tech-design Interface 4 双层防护(解析即校验)+ 已落地 sc6 e2e 两型篡改腿 -->
- Preconditions: "隔离 userData 内的 plugin-runtime.json 失效(①被篡改塞入必备名;②坏 JSON 解析失败;fixture 预置后启动)"
  fixture_spec:
    entities:
      - entity_type: "Plugin"
        min_count: 3
        field_constraints:
          - field: "mandatory"
            value: "forge 核心插件恰一个 = true"
    state_requirements:
      - description: "plugin-runtime.json 预置失效形态(塞必备名 / 坏 JSON)"
        prerequisite_entity: "Plugin"
- Input: "用户启动应用并打开插件管理区"
- Output: "启动不阻断;插件区按清单态呈现——必备插件全数在位且必备徽标在,两级行态不受违规内容影响;应用不崩溃、不展示残缺列表"
- State: "坏 JSON:原文件隔离为带时间戳的损坏备份 + 空覆盖重建;塞必备名:违规条目内存剔除 + 结构化日志(ERR_PLUGIN_RUNTIME_STATE),清单态获胜"
- Side-effect: "损坏文件隔离重建仅发生在隔离 userData 内(旅程控制);产品清单字节不变"

## Journey Invariants

- 两级插件模型恒成立:forge 核心插件始终以必备身份在位,任何操作不能使其退出或被禁用
- 启停仅写运行时启停覆盖文件(同一配置的可写区):forge 数据与项目文件零改动(数据零损坏)
- 运行时启停不得改写产品清单条目(必备清单/保护分区对运行时启停只读)
- 禁用第三方只收敛该插件注入内容,其余第三方插件与工作台核心能力(任务看板/会话挂接)不受影响(Setup 至少 2 第三方装置下可证伪)

## Fixture Specification

本 Contract 各 Outcome 的 fixture 实体并集(逐 Outcome 明细见各 Preconditions 内 fixture_spec):

```yaml
fixture_spec:
  entities:
    - entity_type: "Plugin"
      min_count: 3
```
