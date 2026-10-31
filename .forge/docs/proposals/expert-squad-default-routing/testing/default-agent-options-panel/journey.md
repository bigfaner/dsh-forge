---
feature: "expert-squad-default-routing"
journey: "default-agent-options-panel"
module: "expert-squad"
risk_level: "High"
golden_path: true
surface_types: ["web"]
surface_keys: ["expert-squad", "host"]
sources:
  - .forge/docs/proposals/expert-squad-default-routing/proposal.md
  - .forge/docs/proposals/expert-squad-default-routing/review/report.md
generated: "2026-10-31"
---

# Journey: default-agent-options-panel

**Risk Level**: High

## Overview

「默认 Agent 选项」单面板（设置 → 插件 → `settings.plugins.tab` feature-owned tab）的配置读写闭环真机取证（proposal AC2 可机检半）：设置页打开 tab → 表单写 Provider/Model/Reasoning → 官方 settings/configForms 写径落活动 profile 的 `cordis.patch.yml`（id 定向条目 `- id: expert-squad`）→ volatile 变更通知热刷新——**同一应用实例内**消费面（experts 服务 get 应答折叠 defaultAgentOptions）与面板回读即生效，零重启。取证纪律：真实 Electron 宿主 + 真实官方 settings 域（configForms 服务在场的 dev profile）+ 真实 patch 文件落盘，**不可 fake**——不得以伪造 YAML 行或 stub ConfigForm 替代；volatile 生效断言必须发生在同一进程实例内（重启后读到值只证明持久化、不证明热刷新）。

dev 形态取证边界（如实注记）：e2e 宿主 = dev profile（`apps/host/profile.dev/` 直链装载），官方 settings 写径落 **dev profile 的 cordis.patch.yml**（tracked 文件——spec 备份/还原，与 fix-20 探针同口径）；真实用户形态落 `~/.dsh/profiles/<profile>/cordis.patch.yml`（proposal §数据面实证锚点），写径机械同源（configEditor.documentPath = 活动 profile patch），形态差异只在路径。

## Setup

- 隔离 userData 启动 dev 宿主（e2e 支撑层 launchHost；单实例纪律）
- `apps/host/profile.dev/cordis.patch.yml` 写前字节备份（测试后还原——tracked 文件零残留）
- 夹具工作区（仓外 tmp）含一个无路由 project 层专家档案（provider/model/reasoning 全缺省）
- 工作区经 RPC 注册入账（专家列表/取用读口的 workspace 参数锚）

## Happy Path

### Step 1: 设置页打开「默认 Agent 选项」tab

**User Action**: 点击官方设置入口（`[aria-label="设置"]`）→ 设置壳 section 导航选「插件」→ tab「默认 Agent 选项」（单贡献 = 面板直呈、多贡献 = role=tab，两态兼容）

**Expected Result**: 面板挂载（`data-cfg-state="ready"`）：单面板无 tab 导航/无警示块；Provider/Model 输入占位「继承父Agent」、Reasoning 四选当前值「默认」（`data-select-value=""`）；快照 ready = configForms 服务在场的官方写径就绪

### Step 2: 写配置 → patch 落 id 定向条目

**User Action**: 填 Provider 与 Model（blur/Enter 提交），Reasoning 选「高」

**Expected Result**: `cordis.patch.yml` 新增/更新 id 定向条目 `- id: expert-squad`，config 含 `defaultAgentOptions`（provider/model 逐字落盘 + `reasoning: high`）；schema 校验/revisioned 写径归官方（拒写 = 面板 console 留痕，不落半写态）

### Step 3: volatile 无重启生效（同实例回读 + 消费面折叠）

**User Action**: 写后不重启：读回面板草稿与 experts 服务取用面（`GET /api/expert-squad/get?key=<无路由专家>&workspace=<夹具>`）

**Expected Result**: 同一 renderer 实例内（boot 期窗口标记不变 = 零 reload）面板输入保持写入值（快照换代回填 = volatile 通知热刷新）；get 应答折叠 defaultAgentOptions——原「继承父Agent」专家的 provider/model/reasoning 位变为写入值（优先级链③基座在消费面即时可见）

## Edge Cases

### Step 2b: 逐项清空 = unset，patch 不残留空壳

**Precondition**: Step 2 的条目在盘

**User Action**: 清空 Provider/Model 输入、Reasoning 拨回「默认」并提交

**Expected Result**: patch 条目中 `defaultAgentOptions` 整字段移除（全空 = unset 整字段，回退组合层；不残留空键空串壳条目）；面板回到占位态（「继承父Agent」/「默认」）

### Step 3b: 配置服务缺席降级不悬空

**Precondition**: 宿主未组 settings 域（configForms 缺席——部署形态）

**User Action**: 观察 tab 注册与面板

**Expected Result**: tab 不注册（console.warn 留痕）、面板不悬空——注册门降级语义；本形态单测承载（settings-default-options.test），e2e 不复注

### Step 3c: 写拒绝（schema/revision 竞态）

**User Action**: stale 写或非法值提交

**Expected Result**: 官方拒写，面板 console 留痕「write rejected」，等待下一次修订重同步——UI 不崩、不落半写态（单元/契约面承载，e2e 不注错）

## Journey Invariants

- 配置写径唯一正门 = 官方 configForms/settings 服务（revisioned 读写 + schema 校验），插件零自持文件、零平行写径
- patch 条目 id 定向：只动 `- id: expert-squad` 行，其余行逐字不变（patch 按 row id 整体替换 config）
- volatile 生效 = 同进程实例内可观测（快照换代 + 服务现读 `ctx.config`）；重启后才可见不构成热刷新证据
- registry 不缓存 Config 值——get/list 每次现读，变更零额外接线即生效
