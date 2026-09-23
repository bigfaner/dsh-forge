---
feature: "dsh-forge-m2"
journey: "feature-board-docs-browsing"
risk_level: "Medium"
golden_path: false
surface_types: ["web"]
surface_keys: ["web"]
sources:
  - docs/features/dsh-forge-m2/prd/prd-user-stories.md
  - docs/features/dsh-forge-m2/prd/prd-spec.md
  - docs/features/dsh-forge-m2/prd/prd-ui-functions.md
generated: "2026-09-23"
---

# Journey: feature-board-docs-browsing

**Risk Level**: Medium

## Overview

SDD 开发者在应用内浏览 feature 状态机与 manifest/prd/design/ui/tasks 五类过程文档(只读渲染),并支持把过程文档放在仓外本地路径注册的项目上获得同等完整的浏览能力。

> PRD Traceability: Story 6(feature 文档浏览与仓外文档);SC4(feature 看板)、SC5(仓外文档);G4(feature 看板);UF4(feature 看板与文档浏览)。

## Setup

- 应用已启动且已注册并激活一个 forge 项目 fixture(测试承载 = 一次性 fixture 项目:临时目录 + 隔离 userData、测试后清理,不以生产仓为承载;SC4 真实仓口径[dsh-forge-m1 completed]以本仓注册另腿验收;跑腿前探测本机无活跃 dsh-forge 实例——单实例锁教训),fixture 含双 feature:completed 样板(五类文档齐备)与 in-progress 样板(缺可选文档类)
- 仓外腿供给 = 另造与代码根目录分离的仓外 docs 树 fixture(同构五类文档),并备第二仓外树作重指向恢复腿目标;空态腿 = 另备零 feature fixture 项目;错误腿 = fixture 副本注入单文档内容损坏;外链/注入腿 = fixture 文档预置外链与脚本/HTML 内容,均随 fixture 一并清理
- 跨面断言口径:「与 forge 数据一致」= 测试进程直读 fixture forge 文件(仓内/仓外同口径),渲染文本空白剥离规范化后与文件投影全等(已落地 sc4/sc5 e2e 对比口径);注册落库形态 = 工作台状态读数对拍(浏览器侧不自行观测文件系统/注册库)

## Happy Path

### Step 1: 进入 feature 看板

**User Action**: 用户切换到工作台·feature 看板

**Expected Result**: 激活项目的 feature 列表显示双 feature,各带状态标识与任务计数:completed 样板带完成徽标、计数全满,in-progress 样板无徽标、计数部分完成,与 fixture 模型一致(校验通道见 Setup)

### Step 2: 查看 feature 状态机

**User Action**: 依次点击 completed 样板与 in-progress 样板 feature

**Expected Result**: completed 样板状态机显示 completed,in-progress 样板显示 in-progress(forge manifest 词表透传);进入 feature 详情/文档目录:五类 tab 恒在,按该 feature 实际文档类启用、缺类禁用不隐藏

### Step 3: 浏览五类过程文档

**User Action**: 依次点击 completed 样板的 manifest/prd/design/ui/tasks 文档

**Expected Result**: 五类文档在应用内只读渲染,渲染文本与 fixture 文件按规范化口径全等(校验通道见 Setup);返回 feature 详情的导航可用

### Step 4: 注册仓外文档项目

<!-- surface-web required_outcomes 映射:validation-error → Step 4 复用 UF1 注册向导表单,其非法输入腿(路径未检出 forge 数据/仓外路径=代码根目录/未授权)不在本旅程展开,由 multi-project-management journey Step 2b/3b/3c 持有(家族认领) -->

**User Action**: 以仓外本地路径为文档位置注册该 forge 项目(向导步骤②显式选择仓外路径并勾选授权确认)

**Expected Result**: ≤3 步注册完成并激活;注册信息落库为仓外文档位置(≠代码根目录,状态读数见 Setup);feature 列表与文档均读仓外树(slug 与仓外 fixture 一致)

### Step 5: 仓外文档一致渲染

**User Action**: 打开该仓外项目的 feature 过程文档浏览

**Expected Result**: feature 详情带仓外文档角标;文档与仓内同一渲染面只读展示,按同一规范化口径与仓外 fixture 文件全等(「格式与仓内一致」的可观测口径,见 Setup)

## Edge Cases

### Step 1b: 项目无 feature

**Precondition**: 注册并激活零 feature fixture 项目(Setup 另备)

**User Action**: 用户进入 feature 看板

**Expected Result**: 显示空(empty)态"无 feature"引导,不显示错误

### Step 1c: 首次加载 loading 态

**Precondition**: feature 看板数据尚未就绪(首次加载/切换项目)

**User Action**: 用户进入 feature 看板

**Expected Result**: 先行显示 loading 骨架,数据就绪后转入正常列表,未就绪期间不显示错误态或空态(UF4 States:loading 行)

### Step 3b: 单文档读取异常

<!-- source: inferred:「不影响其他文档与其他 feature 的浏览」无 PRD 明文;依据 = Interface 1 readFeatureDoc 为逐文档读取动词,失败面收敛于被读文档,UF4 error 行(错误+重试)仅作用于失败文档 -->

**Precondition**: 文档位置路径有效,但某个过程文档内容读取失败(文件损坏;fixture 副本注入,见 Setup)

**User Action**: 点击该文档

**Expected Result**: 显示错误(error)态与重试;不影响其他文档与其他 feature 的浏览;恢复文件后重试,渲染恢复正常(校验通道见 Setup)

### Step 3c: 文档外链防护

**Precondition**: 过程文档内容中包含外部链接(Setup 预置)

**User Action**: 渲染该文档并尝试点击外链

**Expected Result**: 只读渲染禁用外链跳转离开应用(安全约束),用户停留在应用内

### Step 3d: markdown 内容注入防护

**Precondition**: 过程文档内容包含注入性内容(脚本/HTML 标签;Setup 预置)

**User Action**: 浏览该文档

**Expected Result**: 内容按 forge 原文只读安全渲染(markdown 防注入),不执行任何注入内容

### Step 5b: 仓外路径失效

<!-- surface-web required_outcomes 映射:session-expired → 本旅程为离线桌面应用(继承 M1 无端口/无服务端会话模型),无字面会话过期面;通道失效类比 = 已注册仓外文档通道失效(watcher 失联 + 文档读取复验失败),映射为 UF4 error(读取异常,含仓外路径失效)态 = 本边 -->

**Precondition**: 已注册仓外项目的文档路径失效(仓外 docs 树被移动/删除;fixture 临时目录内操作)

**User Action**: 打开该项目的 feature 详情并点击文档

**Expected Result**: 明确提示路径不可访问(error 态)并提供重新指向/移除项目引导;已扫快照数据不被静默清空(feature 列表仍在);经重新指向入口走向导编辑模式,指向第二仓外树并重确认授权后,错误态消退、feature 列表与文档按新树重建(已落地 e2e sc5 口径)

## Journey Invariants

- 全部过程文档为只读渲染:不提供任何编辑入口;外链不离开应用
- feature 列表与状态机展示与 forge 数据一致(状态为 forge manifest 词表透传;校验通道见 Setup)
- 仓外与仓内文档格式一致、浏览功能等价(同一渲染面 + 同一对比口径,见 Setup)

> 覆盖说明:Story 6 AC3(默认仓内/外置默认关闭)由 multi-project-management journey Step 3c 持有;向导非法输入腿由其 Step 2b/3b 持有;UF1 重指向腿(向导编辑模式)由本旅程 Step 5b 持有(其覆盖说明所指衔接点);显示名编辑(rename)腿本旅程不覆盖,家族未认领。
