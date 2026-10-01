---
created: "2026-10-02"
author: "faner"
status: "Active"
intent: "reference"
---

# dsh 扩展体系参考（插件之外）

> 自《技术预研笔记》§1.4 独立成册：P1 spike 与插件工程线反复引用的**配置手册**。上游唯一权威 = `Z:\project\github\deepseek-harness`（0.2.0-rc.2），行号漂移按符号复核；各节标注核实来源。
>
> 术语约定：本册「扩展」= **不写插件代码**即可增加能力的面。cordis 数据行（预设声明、MCP 行、hook 桥行）形态上是插件行，作者视角是纯配置，计入。

## 1. 技能目录（filesystem skills）

来源：`packages/skill/skill-filesystem/src/index.ts` + `packages/preset/agent-preset/tests/skills.spec.ts`。

### 1.1 五类根与 rank

| 根 | 位置 | rank | 作用域 |
|---|---|---|---|
| 项目根 | `<gitRoot>/.dsh/skills` | 100 | 随仓库走，可 git 共享 |
| 项目根 | `<gitRoot>/.agents/skills` | 200 | 同上（与 Claude Code 生态兼容） |
| custom | 组合内 `customSkillDirs` | 300 | 单组合显式指定 |
| 用户根 | `$DSH_HOME/skills`（默认 `~/.dsh`） | 400 | 跨项目全局 |
| 用户根 | `$DSH_AGENTS_HOME/skills`（默认 `~/.agents`） | 500 | 同上 |
| bundled | `$DSH_BUNDLED_SKILL_DIR` | bundled | app 级（trustedHost，绕 `ctx.fs` 直读） |

同名技能跨根**按 rank 决胜**（数值小者优先），不重复呈现。

### 1.2 技能文件格式

目录式（推荐，可带资源）：

```
.dsh/skills/commit-style/
  SKILL.md            ← 必需
  references/         ← 可选：skill 正文引用的补充文档
  templates/          ← 可选：skill 使用的模板文件
```

`SKILL.md` frontmatter 字段：

```yaml
---
name: commit-style            # 必填，合法技能名（isSkillName 校验）
description: >-               # 必填，目录清单里的一句话
  Create git commits following Conventional Commits.
whenToUse: Use when the user asks to commit staged changes   # 可选，触发提示
user-invocable: true          # 可选（默认 true）：进 sessionSkillCatalog，用户可调
disable-model-invocation: true # 可选（默认 false）：模型不得自行调用
metadata:                     # 可选：任意键值
  owner: forge
---

# Commit Style

正文 = `skill` tool 返回的完整内容……
```

注意：旧式键 `disableModelInvocation` / `modelInvocable` / `userInvocable`（无连字符）会**直接报错拒绝**，必须用连字符形式。扁平单文件 `.md`（放根目录直下）也支持，frontmatter 同上。

### 1.3 三种配置方式

**a. 零配置（默认根）**——standard 等出厂组合即此形态：`includeDefaultRoots` 默认 `true`，把技能目录丢进项目/用户根即完成，chokidar watch 热更新即时可见。

**b. `customSkillDirs`（组合内配置行）**——上游 `cordis` 预设实证：

```yaml
- id: skill-filesystem
  name: '@deepseek-ai/dsh-skill-filesystem'
  config:                      # 默认根保持开启；custom 与默认根并存
    customSkillDirs:
      # 相对路径按进程 cwd 解析（内部 resolve()）——慎用
      - C:/tools/my-skills
      # 上游先例：!!js 表达式解析某 npm 包内的 skills/ 目录（绝对路径）
      - !!js process.getBuiltinModule('node:path').join(process.getBuiltinModule('node:path').dirname(process.getBuiltinModule('node:module').createRequire(baseUrl).resolve('@deepseek-ai/dsh-agent-preset/package.json')), 'skills')
```

**c. 环境变量 / 行配置重定向（产品级通道）**——两条路：

```yaml
# 路 1：行配置字段（该 provider 实例生效）
- id: skill-filesystem
  name: '@deepseek-ai/dsh-skill-filesystem'
  config:
    dshHome: C:/product/profile/dsh          # 覆盖用户根（默认 $DSH_HOME → ~/.dsh）
    agentsHome: C:/product/profile/agents    # 覆盖第二用户根（默认 ~/.agents）
    bundledSkillDir: C:/product/bundled-skills
    includeDefaultRoots: false               # 极简形态：只认显式根（隔离 provider 用）
```

```text
# 路 2：宿主环境变量（进程级，所有默认根组合生效）
DSH_HOME=C:\product\profile\dsh              # 用户根 + 全局 AGENTS.md 一并重定向
DSH_AGENTS_HOME=C:\product\profile\agents
DSH_BUNDLED_SKILL_DIR=C:\product\skills      # app 级技能目录
```

forge 产品用法：远征/突击走 b（customSkillDirs 接插件包技能），标准模式共享走 c（宿主设 env，见《技术预研笔记》§5.5 / S6）。

### 1.4 行为语义与边界

- watch：目录增删改即时进目录清单（稳定性阈值 200ms 默认；host 变更经 edit/write 也触发失效）。
- **人类命令（`ctx.commands`，如 `/plan`）只能插件注册**；文件系统侧的用户可调面 = `user-invocable` 技能（经 `ctx.sessionSkillCatalog` 列出，不激活冷 Agent）。
- frontmatter 缺 `name`/`description`、YAML 非法 → 该文件忽略并 warn，不影响其余技能。
- 单技能体积受组合的 tool-result-pruner 阈值约束（standard：8192 code points 内完整到达模型）。

## 2. 指令文件（AGENTS.md 链）

来源：`packages/context/agent-instructions/README.md`（含 Model Experience 全节）。`dsh-base` 默认含（`maxBytes: 65536`）。

### 2.1 分层结构

```
L0  $DSH_HOME/AGENTS.md                 ← 用户全局（唯一，无 local 叠加）
L1  <gitRoot>/AGENTS.md                 ← 项目链起点（最宽）
L2  <gitRoot>/packages/app/AGENTS.md    ← 中间目录
LN  <cwd>/AGENTS.md                     ← 会话工作目录（最窄）
    每目录内：base 候选（AGENTS.md → CLAUDE.md）→ local 叠加（AGENTS.local.md → CLAUDE.local.md）
```

- 优先级语义（注入模板明文）：**更具体的指令压过更宽的**，但不覆盖 system/developer/直接用户指令。
- 同目录去重按内容：trim 后字节相同只渲染一次；**漂移过的副本全量并列加载**。

### 2.2 触发时机与加载顺序

**① 基线注入**——会话**首个合格的 `agent/pre-step`**（非会话创建时）：整条链渲染为一条 durable user 消息，折叠进 entering batch、紧跟 claimed messages。空链零注入。

**② 增量刷新（touch 驱动，无 watcher）**——成功的**第一方** `read`/`write`/`edit` 产生 touch（经父执行 token 冒泡），enclosing step durable 后由 projection 对账，**下一请求**注入：

| 情形 | 注入 |
|---|---|
| 触达更深目录 | `Additional instructions from: <path>`（附目录适用声明） |
| 文件变更 | `Updated instructions from: <path>` + 替换内容 |
| 消失 / 变同容重复 | removal notice |
| 路径与 digest 均未变 | 永不再注入 |

**③ 恢复 / 重进入**——resume 按 digest 对账：可见基线兼容（发现规则/优先级/项目根/预算未变）则复用原消息保 KV cache；不兼容则后续位置追加完整替换。

顺序：宽→窄单遍（用户全局 → 项目根 → … → cwd，每目录 base → local）；预算同向——先整丢宽文件、最后截断最窄。

**边界**：shell 导航（`cd`）不触发发现（只认结构化 fs 工具）；外部编辑下次第一方 fs 操作 / resume / pre-step 才可见；PTC 模式增量消息推迟到外层 `run_code` 结果后；符号链接跨信任边界跟随（不受信仓库配 fs 策略门）；内容中字面 `</system-reminder>` 被转义。

### 2.3 配置

`dsh-base` 已默认包含此插件（`maxBytes: 65536`）；需要调整行为时按下表覆写：

```yaml
- name: '@deepseek-ai/dsh-agent-instructions'
  config:
    maxBytes: 65536                          # 必填：整条链渲染上限
    maxSourceBytes: 1048576                  # 单文件读取上限
    instructionFileCandidates: [AGENTS.md, CLAUDE.md]
    localInstructionFileCandidates: [AGENTS.local.md, CLAUDE.local.md]
    projectRootMarkers: ['.git']             # 项目根判定标记
    dshHome: C:/product/profile/dsh          # 用户全局 AGENTS.md 所在（默认 $DSH_HOME）
```

forge 观察（非计划）：项目约定可经 AGENTS.md 链注入——工作台产品的「项目引导」有现成载体。

## 3. MCP 服务器

来源：`packages/mcp/mcp-client/README.md`。默认零启用；每服务器一行。

### 3.1 stdio（本地程序）

```yaml
- id: mcp-github
  name: '@deepseek-ai/dsh-mcp-client'
  config:
    serverName: github                       # 命名空间，[A-Za-z0-9_-]{1,32}，作用域内唯一
    transport: stdio
    command: npx
    args: ['-y', '@modelcontextprotocol/server-github']
    env:
      GITHUB_TOKEN: !!js process.env.GITHUB_TOKEN   # 覆盖在清洗过的环境之上
```

### 3.2 streamable-http（远程服务）

```yaml
- id: mcp-web
  name: '@deepseek-ai/dsh-mcp-client'
  config:
    serverName: web
    transport: streamable-http
    url: http://localhost:3000/mcp
    headers:
      Authorization: !!js '`Bearer ${process.env.MCP_TOKEN}`'
```

### 3.3 字段速查

| 字段 | 默认 | 含义 |
|---|---|---|
| `transport` | 必填 | `stdio` / `streamable-http` |
| `serverName` | 必填 | 工具命名空间（`mcp__<serverName>__<tool>`） |
| `command`/`args`/`env`/`cwd` | — | stdio：程序、参数、附加环境、工作目录 |
| `url`/`headers` | — | http：端点与请求头 |
| `toolCallTimeoutMs` | 60000 | 单次 tools/call 超时 |
| `maxInstructionBytes` | 32768 | 服务器指令注入上限（超限拒绝连接） |
| `failOnStartupError` | false | 启动连接失败是否拒绝激活 |
| `reconnect.{enabled,initialDelayMs,maxDelayMs,maxAttempts}` | true/500/30000/10 | 断线重连（指数退避） |

### 3.4 行为语义

- 工具名 `mcp__<server>__<rawName>`，与 Claude Code/Codex 同形——会话历史与权限规则跨重启稳定。
- 两服务器同名工具共存于各自命名空间；同 `serverName` 重复注册报错；服务器内工具重名 → 工具清单被拒、沿用旧集。
- 服务器指令以字面文本并入已记录系统提示；MCP prompt 模板不支持；慢/崩服务器可能拖延启动或调用直至恢复。

## 4. Hooks 兼容桥

来源：`packages/hooks/README.md` + `hooks-claude-code/README.md`。定位：**兼容适配器**——复用既有 Claude Code / Codex `hooks.json`，非原生能力出口（无对应物时写原生插件）。

### 4.1 配置

```yaml
- name: '@deepseek-ai/dsh-hooks-claude-code'
  config:
    configPath: ./.claude/hooks.json         # 必填：hooks.json 或含 hooks 键的 settings 文件
    pluginRoot: ./.claude/plugins/my-plugin   # 替换命令串中的 ${CLAUDE_PLUGIN_ROOT}
    projectDir: .                             # 替换 ${CLAUDE_PROJECT_DIR} 并设其 env
    defaultTimeoutMs: 600000                  # 单钩子超时（未自设时）
    stderrSummaryMaxChars: 500                # 持久化 stderr 摘要上限
```

（`dsh-hooks-codex` 同形，指 Codex 的 hooks 配置。）

### 4.2 钩子事件与能力

| 钩子 | 触发时刻 | 能力 |
|---|---|---|
| `SessionStart` | 会话启动 | 附加上下文 |
| `UserPromptSubmit` | 收到提示 | 阻断提示 / 附加上下文 |
| `PreToolUse` | 工具执行前 | 阻断 / 转人工审批 |
| `PostToolUse` | 工具执行后 | 以反馈阻断结果 / 附加上下文 |
| `Stop` | 将停止时 | 附理由强制续轮 |
| `SubagentStart` | 子代理启动 | 向运行中子代理注入上下文（仅 in-process） |
| `SubagentStop` | 子代理结束 | 仅观察 |

运行语义：钩子在会话工作区目录执行；同事件按配置顺序串行（决策折叠 `deny > ask > allow` 与顺序无关）；配置读不出/解析失败 → 不注册任何钩子但 Agent 照常启动；单钩子崩溃仅记日志。

## 5. 预设与 persona（声明式数据行）

机制详见《技术预研笔记》§1.2（原理与实现）、§5.6（出厂双预设完整示例）。最小形态：

```yaml
- id: agent-preset-registry
  name: '@deepseek-ai/dsh-agent-preset-registry'
  config:
    default: standard                  # 部署默认；用户 selectedDefault（volatile）优先

- id: preset-mine
  name: '@deepseek-ai/dsh-agent-preset'
  config:
    id: mine
    name: 我的工作模式                  # 自带 name → 不走 locale 字典，显示名直出
    order: 5                           # hero chip 排序
    plugins: [ …完整 cordis entry list… ]
```

persona 行（挂组合内，只谈作风）字段：`prefix`（必填）、`suffix`、`complete`（唯一系统提示）、`includeRuntimeContext`（false 关全部运行时上下文快照）。

## 6. Profile patch 与设置面

- **按 row id patch 任意行**（`config-editor` 持久化于 profile、经 HMR 生效；Web 编辑器保存即此机制）：

```yaml
# insert 新行
- insert:
    - id: my-row
      name: '…'
# 或覆写既有行 config（同 id）
- id: agent-preset-registry
  config:
    default: expedition
```

- **设置面**：插件 Config 的 volatile 字段（如预设 `selectedDefault`、subagent 模型选择）经设置页编辑，落 config patch，不随部署更新被覆盖。
- 已知语义：**覆写预设行的 `config.plugins` = 替换整表**，不与出厂清单自动合并（用户改造不丢，上游演进需自行跟踪）。

## 7. 外部 agent provider

`ctx.subagents` seam 的进程外实现，组合行翻开关即启用（standard 出厂为 disabled）：

```yaml
- id: tool-subagent-codex
  name: '@deepseek-ai/dsh-tool-subagent'
  disabled: false                       # 出厂 true，启用即翻此开关
  config:
    provider: codex                     # 经 subagent-codex 包 → ctx.subprocess spawn 外部 CLI
    toolName: subagent_codex
    backgroundMode: one-shot
    maxDepth: provider-managed
# claude-code 同式（provider: claude-code）；ACP agent 经 subagent-acp 接入
```

## 8. 长尾一览

| 通道 | 入口 | 一句话 |
|---|---|---|
| workflow 脚本 | `tool-workflow`（组合行） | JS 脚本编排子代理（phase/parallel/pipeline hooks） |
| webhook | `webhook-github` | 入站 webhook 转计划消息入原会话（`ctx.schedule`） |
| 计划消息 | `ctx.schedule` | 独立会话的定时任务存储，到期注入原会话 |
| LSP | `lsp-stdio` + `tool-lsp` | 语言服务器导航 seam（定义/引用跳转） |
| 凭据 | 设置页（`credentials` seam） | 引用式机密，轮换下次请求即生效 |
| UI 主题 | `web-styling` 令牌 | CSS 令牌化主题定制 |

## 9. 与 forge 产品的映射

| 通道 | forge 用途 |
|---|---|
| ①技能目录 | brainstorm 全局根共享（§5.5 / S6）；远征/突击 customSkillDirs 接插件技能 |
| ②AGENTS.md 链 | 「项目约定注入」现成载体（观察项） |
| ③④ MCP / hooks | 与 forge 正交，用户自便 |
| ⑤⑥⑦ 预设/patch/provider | 模式预设迁移的机制底座（§5） |

## 版本历史

- 2026-10-02：可读性梳理（内容不变；§2.3 补配置引导句）。
- 2026-10-02：§2 重构——分层结构（L0 全局 + 项目链 base→local）、触发时机三类（首个 `agent/pre-step` 基线 / touch 驱动增量刷新含四情形表 / resume digest 对账保 KV cache）、宽→窄顺序与预算同向、边界五条（shell 导航不触发、无 watcher、PTC 推迟、symlink 信任边界、`</system-reminder>` 转义）。
- 2026-10-02：初版——自《技术预研笔记》§1.4 独立成册；技能（五类根/格式/三配置方式/行为语义）、AGENTS.md 链、MCP（双传输/字段表/行为）、hooks 桥（配置/事件表/运行语义）、预设与 persona、profile patch、外部 provider、长尾表、forge 映射。
