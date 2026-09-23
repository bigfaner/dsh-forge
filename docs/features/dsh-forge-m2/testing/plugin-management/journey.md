---
feature: "dsh-forge-m2"
journey: "plugin-management"
risk_level: "High"
golden_path: false
surface_types: ["web"]
surface_keys: ["web"]
sources:
  - docs/features/dsh-forge-m2/prd/prd-user-stories.md
  - docs/features/dsh-forge-m2/prd/prd-spec.md
  - docs/features/dsh-forge-m2/prd/prd-ui-functions.md
generated: "2026-09-23"
---

# Journey: plugin-management

**Risk Level**: High

## Overview

SDD 开发者(社区实践者)在工作台内查看插件清单与层级(必备/第三方),对第三方插件执行禁用/启用,且确信 forge 核心插件始终以必备身份在位、启停不损伤任何数据、产品清单不被运行时改写(两级插件模型)。

> PRD Traceability: Story 7(插件管理·两级模型);SC6(两级插件模型);G6(插件化);UF6(插件管理)。

## Setup

- 应用已启动并进入工作台。测试承载 = 一次性 fixture 装置:临时目录 + 隔离 userData(启停覆盖文件 plugin-runtime.json 归旅程控制)、测试后清理,不以生产用户数据为承载
- 插件装置:forge 核心插件以必备身份装配(必备标识派生自产品级配置清单 mandatory 标注);第三方 fixture 插件 ≥2 个且均启用(基座 hello-world + fixture 内动态注册第二实例,按 6.5 任务注记)——「仅该插件」收敛需第二实例对照方可证伪
- 重启腿执行假设:等待进程退出 + 单实例锁释放后再启动(否则 ERR_SINGLE_INSTANCE 环境性失败),每次启动前单实例探测
- 跨面断言口径:文件面断言(产品清单条目未被改写 = sha256 前后对拍;覆盖文件写入;forge 数据零损坏 = hash 对拍)由测试进程直读 fixture 文件,不以「没报错」为据;浏览器侧不自行观测文件系统(已落地 sc6 e2e 同款 Hard Rule)

## Happy Path

### Step 1: 打开插件管理区

**User Action**: 用户打开工作台设置区(插件管理区)

**Expected Result**: 插件列表两级呈现:forge 核心插件标记"必备"且仅状态展示(无禁用入口);第三方插件显示启用状态与"禁用"动作

### Step 2: 发起禁用第三方插件

**Precondition**: 第三方插件处于启用状态,其注入内容未在活跃会话/挂接视图内在线使用(常规启停场景)

**User Action**: 对第三方插件点击"禁用"

**Expected Result**: 出现二次确认,说明影响(仅该插件注入内容退出;forge 数据与工作台核心能力不受影响)

### Step 3: 确认禁用

**User Action**: 确认禁用

**Expected Result**: 仅该插件注入内容退出,该插件行转为已停用态(状态 + "启用"动作);另一第三方插件注入内容不受影响;任务看板/会话挂接等核心能力不受影响;forge 数据零损坏(校验通道见 Setup)

### Step 4: 重新启用

**User Action**: 对该第三方插件点击"启用"

**Expected Result**: 该插件注入内容恢复、行回到启用态;数据完整(校验通道见 Setup)

### Step 5: 启停后回看插件列表

**User Action**: 启停操作完成后,用户在插件管理区重新浏览插件列表

**Expected Result**: 列表仍两级呈现:forge 核心插件保持必备身份与启用状态,第三方插件按当前启停状态呈现(层级与必备标识不因启停改变);产品清单条目未被改写(必备清单对运行时启停只读;文件面断言经 Setup 跨面口径)。「升级/重装不冲突」面本 feature 旅程集无对应腿,family-unowned(留安装/升级验收),本旅程不作断言

## Edge Cases

### Step 1b: 尝试禁用 forge 核心插件

<!-- surface-web required_outcomes 映射:validation-error → 本旅程无表单输入面(插件区唯一可写件 = 第三方行启停动词,无自由文本输入);非法请求类比 = 对必备插件发起禁用(越权启停请求),映射为必备行不渲染禁用入口 + 写路径守卫拒绝 = 本边 -->

**Precondition**: 插件管理区已展示必备(核心)插件

**User Action**: 用户在必备插件行寻找禁用入口并尝试发起禁用

**Expected Result**: 必备插件行无禁用入口(不渲染,而非渲染后禁用),渲染面不存在禁用 forge 核心插件的通道;纵深第二层(对必备名启停写请求的守卫拒绝)由 SC6 验收,不在浏览器面断言

### Step 1c: 启停状态文件失效(篡改/损坏)

<!-- surface-web required_outcomes 映射:session-expired → 本旅程为离线桌面应用(继承 M1 无端口/无服务端会话模型),无字面会话过期面;通道失效类比 = 运行时启停状态通道失效(plugin-runtime.json 被篡改塞必备名/坏 JSON 解析失败),按 ERR_PLUGIN_RUNTIME_STATE 处置 = 本边 -->
<!-- source: inferred:处置口径(启动不阻断、违规条目剔除回退清单态)无 PRD 明文;依据 = tech-design Interface 4 双层防护(解析即校验)+ 已落地 sc6 e2e 两型篡改腿 -->

**Precondition**: 隔离 userData 内的 plugin-runtime.json 失效(①被篡改塞入必备名;②坏 JSON 解析失败;fixture 预置后启动)

**User Action**: 用户启动应用并打开插件管理区

**Expected Result**: 启动不阻断;插件区按清单态呈现——必备插件全数在位且必备徽标在,两级行态不受违规内容影响;应用不崩溃、不展示残缺列表

### Step 2b: 禁用时第三方注入内容在活跃会话内在线

**Precondition**: 待禁用第三方插件的注入内容正在活跃挂接会话内在线使用(会话界面可见其注入内容;与 Step 2 常规场景互斥)

**User Action**: 在此在线使用状态下对该插件发起禁用并确认

**Expected Result**: 二次确认明确提示影响(会话本体与核心挂接能力不受影响);确认后仅该插件注入内容退出,会话本体不中断,挂接区显示第三方扩展内容退出说明(UF5 third-party-disabled 态)

### Step 3b: 启停执行中重复操作

<!-- source: inferred:「重复点击不触发第二次启停执行」无 PRD 明文;依据 = UF6 transitioning 态语义(启停执行中行呈现操作中指示,动词在执行期不可再发起) -->

**Precondition**: 一次启停操作正在执行(行处于操作中 transitioning 指示)

**User Action**: 在操作完成前快速重复点击"禁用/启用"

**Expected Result**: 行保持操作中指示直至本次操作完成,重复点击不触发第二次启停执行(见注);不产生中间损坏状态(零损坏不变量,校验通道见 Setup)

### Step 3c: 确认对话框取消

**Precondition**: 禁用二次确认对话框已打开(Step 2 发起后)

**User Action**: 在确认对话框选择"取消"

**Expected Result**: 对话框关闭且无任何状态变化:该插件仍启用、注入内容保持在线;启停覆盖文件未被写入(校验通道见 Setup)

### Step 4b: 启停后重启应用

<!-- source: inferred:「重启后禁用状态保持」无 PRD 明文;依据 = UF6 Data Requirements「第三方插件状态 | 运行时启停状态(同一配置)」——启停状态持久于配置的运行时部分,跨启动并入装配对账 -->

**Precondition**: 第三方插件已被禁用

**User Action**: 重启应用并打开插件管理区与工作台(e2e 驱动面:测试进程等待进程退出与单实例锁释放后重新启动,见 Setup)

**Expected Result**: 该插件禁用状态保持(行仍呈现已停用、注入内容仍退出,见注);另一第三方插件启停状态不受牵连;数据完整;forge 核心插件仍以必备身份在位

### Step 5b: 禁用后核心能力波及面验证

**Precondition**: 第三方插件处于禁用状态

**User Action**: 依次使用任务看板、任务详情、一键发起会话等核心能力

**Expected Result**: 任务看板正常渲染依赖树与状态分组、任务详情可读、发起会话入口可用;第三方扩展内容退出说明显示(核心挂接能力不受影响);另一启用中的第三方插件注入内容不受影响;forge 数据零损坏(校验通道见 Setup)

## Journey Invariants

- 两级插件模型恒成立:forge 核心插件始终以必备身份在位,任何操作不能使其退出或被禁用
- 启停仅写运行时启停覆盖文件(同一配置的可写区):forge 数据与项目文件零改动(数据零损坏)
- 运行时启停不得改写产品清单条目(必备清单/保护分区对运行时启停只读)
- 禁用第三方只收敛该插件注入内容,其余第三方插件与工作台核心能力(任务看板/会话挂接)不受影响(Setup ≥2 第三方装置下可证伪)
