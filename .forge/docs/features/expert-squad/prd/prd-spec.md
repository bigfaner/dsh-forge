# PRD 规格：专家团插件

```yaml
db-schema: "no"
intent: new-feature
```

## 背景

dsh 生态没有「专家/角色」基础设施：角色 prompt 硬编码在各应用源码（如 forge 的 `PERSONA_VARIANTS` 矩阵），用户调优（话术、履历、工具搭配）与源码发版强耦合；也没有「目录 `.md` 文件 → 可取用/可派发人格档案」的机制。用户与上层应用都需要一个独立于任何应用源码演进的专家能力层。

**干系人**：终端用户（管理与委派专家）；上层应用开发者（如 forge，经服务键取用专家、随包内置专家、代码式派发）。

## 目标

1. 新建/修改专家全程零源码改动、零发版；建档（对话指令）完成后**立即可取用可委派**。
2. 档案热刷新生效 **≤ 5s**（下一次派发即可用新内容）。
3. 单个坏档案不中断其余专家服务（坏文件被拒、其余照常可取用可派发）。

## 范围

**In Scope**：
- 专家档案：`.md` 正本（frontmatter + 正文）、对话式增改禁用、文件直编热刷新
- **委派双通道**：
  - 通道一（主会话对话式）：插件模型面委派工具——纯 dsh 环境开箱可用；continuable 子会话、工具白名单强制、追问续聊
  - 通道二（使用方代码式）：取用 API 供 forge 等使用方自行组装派发（人设 → persona、白名单 → toolFilter、model → 派发模型、自有规范 → systemPrompt.section）；其编排细节归消费提案
- 三层档案来源：plugin 内置（root 注册缝）/ user / project，同名遮蔽
- Web 管理面板：大卡片网格 / 详情 Dialog（查看/编辑双模式）/ 启停
- HR 预设：部署侧 agent 预设（dsh-forge 装配层）——人格（Persona）专职招聘与管理，绑定专家团管理工具（招募/修改/禁用/取用列表），不含委派；专家团插件自身不感知 HR
- 独立插件发布：本仓 `packages/plugins/expert-squad` → npm 包，plugin-manager 安装启停

**Out of Scope**：
- 通道二的编排细节（接力编排、使用方规范段内容）——归 expert-squad-forge 消费提案
- 存储选型细节、UI 视觉细节（归 tech-design / ui-design）
- 履历（工作记录）：执行任务与委派主/子会话的记录、迭代优化事实依据——归独立提案（expert-squad-career，派发链产物）
- 多专家并行竞争、专家绩效评估、执行日志分析（展望项）
- 官方 agent-presets / skill 装载机制改制
- 并发写入冲突的合并语义（last-write-wins 等，归 tech-design）；派发只要求读到某一时点的一致档案快照

## 用例图

```mermaid
flowgraph LR
    用户((终端用户)) --> UC1([对话式增改禁用专家])
    用户 --> UC2([文件直编专家档案])
    用户 --> UC3([面板管理专家：浏览/检索/详情/编辑])
    用户 --> UC4([主会话对话式委派专家])
    用户 --> UC5([追问续聊])
    HR((HR 预设)) --> UC1
    开发者((上层应用开发者)) --> UC6([经服务键取用档案并代码式派发])
    开发者 --> UC7([随包内置专家目录声明])
    UC7 -.扩展.-> UC6
```

## 业务流程

```mermaid
flowchart TD
    A[用户/使用方需要专家] --> B{专家已存在?}
    B -->|否| C[入职：HR 对话 / 手写 .md]
    C --> D[档案落专家目录]
    B -->|是| E[取用档案]
    D --> E
    E --> F[校验通过?]
    F -->|否| G[写入口 fail-loud 报错<br/>不影响其余专家]
    F -->|是| H[组装：人设 → persona<br/>白名单 → toolFilter · model → 派发模型]
    H --> I[ctx.subagents continuable 子会话]
    I --> J[执行 · 成果入子会话记录<br/>追问经 send_message 续聊]
    J --> K{追问/续聊?}
    K -->|是| I
    K -->|否| M[结束]
```

## 功能规格

1. **专家档案**：`.md` 正本 = frontmatter（`name` 英文标识即键正本、`description` 简介、`title` 岗位、`tools` 白名单、`skills` 标签、`model` 派发模型偏好；`SKILL` 引用弃选——官方无 per-expert 技能注入缝）+ 正文（**人设** Markdown 自由输入）。履历（工作记录）不在本提案，归独立提案。
2. **对话式管理**：主会话经插件 tool 面完成招募、修改、禁用；被禁用专家取用/派发 fail-loud（降级契约）。
3. **文件直编**：专家目录直接编辑/新增 `.md`（含模型经 edit/write），热刷新生效。
4. **三层来源与遮蔽**：project > user > plugin 内置同名遮蔽；禁用状态按来源隔离、升级不丢失。
5. **委派双通道**（共用组装内核：人设 → persona 前缀段、白名单 → toolFilter、model → 派发模型；经 `ctx.subagents.startContinuable()` 正门；persona 非完整系统提示词，业务规范经 systemPrompt.section 独立成段）：
   - **通道一（模型面）**：插件委派工具，主会话对专家说任务即触发，白名单外工具在子会话不可见且调用被拒；委派即返回 childId，成果经子会话记录可见，追问经 send_message 同上下文续聊
   - **通道二（程序面）**：取用 API 返回完整档案，使用方自行组装派发
6. **Web 管理面板**：见 ui-functions 文档。
7. **HR 预设**：人格（Persona，招聘/管理专家的 SOP）+ 工具绑定 = 专家团管理工具集；对话式完成招募、修改、禁用与专家查询；无委派工具。
8. **独立发布**：安装/启用/禁用经 plugin-manager；管理面板经 Host `/plugins/` 路由加载。

## 非功能注记（保健项）

- **可移植性**：插件源码与档案 schema 零上层业务词汇；纯 dsh 环境经通道一完成通用派发（开箱委派即证基础能力）。
- **官方合规**：只走官方合法缝（inject 服务键、storage、subagents continuable 面、ui-slots、fetch 路由、plugin-manager）；persona 子 scope 唯一注入。
- **真机结算**：外部依赖装配面以 dsh desktop 真机端到端取证为交付门。
