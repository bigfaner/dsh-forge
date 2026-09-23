---
feature: "dsh-forge-m2"
journey: "task-board-browsing"
risk_level: "Low"
golden_path: false
surface_types: ["web"]
surface_keys: ["web"]
sources:
  - docs/features/dsh-forge-m2/prd/prd-user-stories.md
  - docs/features/dsh-forge-m2/prd/prd-spec.md
  - docs/features/dsh-forge-m2/prd/prd-ui-functions.md
generated: "2026-09-23"
---

# Journey: task-board-browsing

**Risk Level**: Low

## Overview

SDD 开发者在应用内以只读方式浏览项目的任务/依赖树、状态分组、worktree 标识与任务详情,不依赖终端 `forge task list` 就能掌握 feature 全部任务的状态、依赖与执行记录。

> PRD Traceability: Story 1(任务可视化浏览);SC1(真实项目数据一致性)、G1(任务可视化);UF2(任务看板只读)、UF3(任务详情面板)。

## Setup

- 应用已启动且已注册并激活一个 forge 项目 fixture(测试承载 = 一次性 fixture 项目:临时目录 + 隔离 userData、测试后清理,不以生产仓为承载;SC1 真实项目口径以本仓注册另腿验收),含 ≥10 个任务、含依赖关系(链/菱形/悬空依赖各 ≥1)、含带执行记录的任务(actor = 会话/终端各 ≥1)与无记录任务
- fixture 预置 ≥1 个在非默认 worktree 有执行痕迹、带执行分支名的任务(真实 git worktree + 执行痕迹写入;生成器方言恒不虚构 branch/worktree 字段)
- 首屏计时腿 = 同一生成器 500 任务/50 feature 固定种子 preset(同种子 ⇒ 同文件字节)
- forge 数据可正常读取(`.forge`/`docs/features` 存在且格式有效);错误腿供给 = 在 fixture 副本上注入文件损坏/权限异常、排除障碍后复测,空态腿 = 另备零任务 fixture 项目,均随 fixture 一并清理
- 跨面断言口径:与 `forge task list` 输出一致的校验通道 = 测试进程直读 fixture forge 文件或 stub CLI stdout(浏览器侧不自行观测 CLI 输出)

## Happy Path

### Step 1: 打开任务看板(依赖树视图)

**User Action**: 用户进入工作台·任务看板

**Expected Result**: 默认展示图形化依赖树,blocker 关系可视化;任务数/状态/依赖与 `forge task list` 输出一致(含已完成历史任务;校验通道见 Setup);首屏 ≤2 秒(计时口径 = Setup 的 500 任务 fixture 腿:进入任务页到依赖树 500 节点首屏可交互,预热一次不计、连续 3 次取中位数——已落地 sc1 e2e 口径)

### Step 2: 切换状态分组/列表视图

**Precondition**: fixture 含带执行分支名的任务(Setup 预置)

**User Action**: 用户切换"状态分组/列表"视图

**Expected Result**: 按 forge 任务状态(7 态)分组展示;列表视图含执行分支名列,带执行分支的任务显示分支名、无执行痕迹的任务显示空占位(不虚构 forge 未写的字段)

### Step 3: 筛选与排序

**User Action**: 使用筛选器(feature/状态/worktree)与排序

**Expected Result**: 视图即时更新,筛选/排序结果与 forge 任务数据一致(校验通道见 Setup)

### Step 4: 查看 worktree 标识

**Precondition**: 看板上存在在非默认 worktree 有执行痕迹的任务(Setup 预置)

**User Action**: 点击该任务卡片/节点,查看卡片角标与详情内标识

**Expected Result**: worktree 标识可见(卡片角标)

### Step 5: 打开任务详情

**Precondition**: 所选任务已有执行记录(Setup 预置)

**User Action**: 点击一个已有执行记录的任务卡片/节点

**Expected Result**: 详情面板展示描述、依赖链、执行记录,均可只读浏览;无挂接历史时该区显示空态说明

## Edge Cases

### Step 1b: forge 数据读取异常

<!-- surface-web required_outcomes 映射:session-expired → 本旅程为离线桌面应用(继承 M1 无端口/无服务端会话模型),无字面会话过期面;通道失效类比 = forge 数据读取失败,映射为 UF2 error(读取失败)态 = 本边 -->
<!-- source: inferred:「不崩溃、不展示残缺或错误的数据」推自 UF2 error 态语义(读取失败为整体失败,不部分渲染)+ 唯一事实源纪律(forge 文件为 SoT、看板为派生快照) -->

**Precondition**: forge 任务数据读取失败(文件损坏/权限异常;fixture 副本上注入,见 Setup)

**User Action**: 用户进入任务看板

**Expected Result**: 显示错误(error)态与重试入口;应用不崩溃、不展示残缺或错误的数据;排除读取障碍后点击重试,看板恢复渲染且与 forge 数据一致(校验通道见 Setup)

### Step 1c: 项目无任务数据

**Precondition**: 注册激活的项目没有任何任务数据(Setup 另备零任务 fixture 项目)

**User Action**: 用户进入任务看板

**Expected Result**: 显示空(empty)态"无任务"引导(指向 forge 初始化),不显示错误

### Step 1d: 首次加载 loading 态

**Precondition**: 任务看板数据尚未就绪(首次加载大任务集;切换项目同口径)

**User Action**: 用户进入任务看板

**Expected Result**: 先行显示 loading 态(骨架/进度),数据就绪后转入正常树/列表视图,未就绪期间不显示错误态或空态(UF2 States:loading 行)

### Step 3b: 筛选组合无结果

<!-- surface-web required_outcomes 映射:validation-error → 本旅程无表单输入面;唯一输入面 = 筛选器组合,按 UF2 校验规则映射为明确空态(非错误)= 本边 -->
<!-- source: inferred:「清除筛选后视图恢复」无 PRD 明文;依据 = 筛选为视图态而非数据态,清除即全量重查,UF2 flow 3「即时更新」对称适用 -->

**Precondition**: 当前筛选条件组合下无匹配任务

**User Action**: 用户应用该筛选组合

**Expected Result**: 显示明确空态,不显示错误;清除筛选后视图恢复

### Step 5b: 单任务数据异常

<!-- source: inferred:「其余任务不受影响」= Step 1b 原子性的单任务粒度推广(失败面收敛于读取对象) -->

**Precondition**: 看板正常加载,但所选任务的单任务数据读取异常(如该任务记录文件损坏;fixture 注入)

**User Action**: 用户点击该任务卡片/节点打开详情

**Expected Result**: 详情面板显示错误(error)态与重试入口(UF3 error 行:单任务数据异常),不展示残缺的描述/依赖链/记录;看板其余任务浏览不受影响

## Journey Invariants

- 人侧只读:看板任何视图与任务详情不出现任务状态变更的写操作入口
- 看板信息覆盖 `forge task list` 全部维度(状态/依赖树/worktree/记录),展示状态与 forge 7 态一致
- 只读浏览不产生任何 forge 数据变更,不写入注册表/挂接索引等工作台自有事实数据;当前视图/筛选/排序的本地记忆属 DF005 视图状态按需读写,不在此限(写入面细节留数据内核设计)
- 可达性:看板交互件(视图切换/筛选/排序/任务卡片/详情开关)可经键盘到达与操作,动态内容(任务卡片/状态列/详情)带可读名称(aria-label/文本,中英双语)——surface-web 可达性原则
