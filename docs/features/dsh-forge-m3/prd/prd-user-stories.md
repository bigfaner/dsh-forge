---
feature: "dsh-forge-m3"
created: "2026-09-23"
---

# User Stories: dsh-forge M3 — 流程即产品

> 角色来源(prd-spec Background):SDD 开发者(作者本人/社区实践者)、多项目拥有者(社区实践者)、双形态使用者(终端插件与应用交替)、M2 升级用户(已注册项目持有者)。
> 主体模型约束(M3 定形):任务状态变更 = agent 域(经 dsh tool);人 = 观察与编排发起(派发/审批/迁移/偏好);无任务写 UI。

## Story 1: 显式迁移到数据内核

**As a** M2 升级用户
**I want to** 在工作台对我已注册的项目显式发起一次性迁移(确认 + 自动备份 + 原子执行),或在新项目注册向导内完成同一迁移确认
**So that** 任务结构化状态交由应用数据内核权威承载,index.json 多写者风险根除,且迁移时机与安全完全由我掌控

**Acceptance Criteria:**
- Given M2 已注册且文档树含 `tasks/index.json` 的项目,When 在工作台发起「迁移到 M3 内核」并确认,Then 迁移前自动备份,原子执行完成后项目文档树内 `tasks/index.json` 不存在,任务全集(ID/状态/依赖/标题)与迁移前对拍零差异
- Given 迁移过程中断或失败,When 重新发起迁移,Then 从备份恢复且无半迁移态,重试可成功
- Given 项目含任务 md 与执行记录,When 迁移完成,Then `tasks/*.md` 与 `tasks/records/*.md` 原样留存于原位置(不迁移不改动)
- Given 新注册的既有 forge 项目检出 `index.json`,When 走注册向导,Then 向导内呈现同一迁移确认步骤(含备份说明)

---

## Story 2: 看板派发与并行执行闭环

**As a** SDD 开发者
**I want to** 从看板选择一个或多个无依赖任务并行派发为 subagent 执行,审批请求与失败状态在工作台可见可操作
**So that** 不依赖终端派发指令,并行推进任务且全程可观察、可干预

**Acceptance Criteria:**
- Given 3 个无依赖的可执行任务,When 从看板多选并行派发,Then 各 subagent 独立启动互不串扰,派发到 subagent 可交互 ≤3 秒
- Given subagent 执行中产生审批请求,When 查看看板,Then 审批条目可见,且可执行批准/拒绝操作
- Given 某任务被 agent 经 dsh tool 提交,When 查看看板,Then 状态 ≤5 秒回流,免手动刷新
- Given 某subagent 执行失败,When 查看看板,Then 失败状态与原因呈现,且可一键重派发

---

## Story 3: 派发即得预合成专业化上下文

**As a** SDD 开发者
**I want to** 派发任务时执行策略已一次性合成进 subagent 系统提示词(任务类型协议 + feature 目标摘要 + 生效偏好)
**So that** 专业化上下文每回合即时在场,不再为合成付出重复成本,也不依赖子代理启动后自跑命令

**Acceptance Criteria:**
- Given 派发一个带类型(如 coding-feature)的任务,When subagent 启动,Then 其系统提示词可断言包含该任务类型协议、所属 feature 的目标与摘要、生效运行偏好三要素
- Given 派发完成,When 检查 subagent 启动后的调用日志,Then 无 `forge prompt` 类自跑合成调用
- Given feature 目标摘要更新,When 再次派发同 feature 任务,Then 新派发的系统提示词反映最新摘要

---

## Story 4: 阶段门与上下文跨阶段传递

**As a** SDD 开发者
**I want to** 派发前得到当前阶段产物齐全性的确定性检查(缺失时警告不阻断),阶段推进以阶段总结为门,新阶段会话自动携带目标与摘要
**So that** 流程阶段化被编排层强制,上下文不断裂,我保留知情后的例外裁量权

**Acceptance Criteria:**
- Given feature 处于某阶段且期望产物缺失,When 派发新会话/任务,Then 呈现警告与缺失清单,确认后可继续派发(检查为确定性代码,无模型参与)
- Given 阶段总结未生成,When 请求推进阶段,Then 请求被拒绝并给出可观察的引导文案
- Given 阶段总结已生成,When 推进成功,Then 项目文档根存在对应阶段资产文件(目标 + 摘要),工作台面板可只读查看
- Given 阶段已推进,When 新阶段会话启动,Then 其系统提示词强制包含目标 + 摘要(断言)
- Given 外部会话跨阶段操作,When 查看看板,Then 偏离标识可见,外部会话不被硬阻断

---

## Story 5: 偏好三级覆盖

**As a** 多项目拥有者
**I want to** 在全局、项目、feature 三个层级设置与覆盖运行偏好,并在最简编辑面查看最终生效值
**So that** 全局默认一次设定、按项目与按 feature 精细覆盖,派发链始终消费正确偏好

**Acceptance Criteria:**
- Given 全局/项目/feature 三级对同一键设置不同值,When 解析生效值,Then feature > 项目 > 全局逐级覆盖正确
- Given 修改任一层级偏好,When 下次派发任务,Then 预合成系统提示词反映新的最终生效值(断言)
- Given 打开偏好编辑面,When 查看三级,Then 全局/项目/feature 均可查看与修改,生效值与覆盖来源可辨;surfaces 不出现在继承键集

---

## Story 6: 提案只读浏览

**As a** SDD 开发者
**I want to** 在工作台提案看板浏览文档根下全部提案(列表/详情/eval 报告),并与 feature 看板互跳
**So that** 管线早期(尚无 feature)的提案有了 GUI 载体,提案到 feature 的追溯链应用内闭环

**Acceptance Criteria:**
- Given 文档根 `proposals/` 含 ≥2 个提案,When 打开提案看板,Then 列表呈现 status/created/作者/关联 feature 徽标
- Given 点击某提案,When 打开详情,Then proposal 正文与 eval 报告只读渲染,内容与文件一致
- Given 提案关联了 feature,When 点击徽标,Then 跳转 feature 看板对应条目,且可返回
- Given 外部新增或修改提案文件,When 回到提案看板,Then 变更 ≤5 秒回流;全程无任何状态写入口

---

## Story 7: 过程文档默认仓外

**As a** SDD 开发者(注册新项目)
**I want to** 新注册项目的过程文档根默认位于代码仓外(应用管理),仓内存放仍可选
**So that** 过程资产默认不进代码仓视野,代码仓保持干净,文档根由工作台统一管理与呈现

**Acceptance Criteria:**
- Given 注册新项目,When 到达文档位置步骤,Then 默认值为仓外文档根(应用管理路径),仓内为可选项
- Given 以默认仓外注册的项目,When 任务/记录/阶段资产/proposals 发生读写,Then 全部落于文档根,代码仓内零新增过程文档
- Given 既有仓内文档项目,When 在 M3 读写,Then 全部功能兼容不破坏

---

## Story 8: 过渡双形态不破坏

**As a** 双形态使用者(终端插件与应用交替)
**I want to** 未注册项目继续全程使用 forge CLI,已注册项目切换应用通道后日常管线不再依赖冻结 CC 插件
**So that** 过渡期两种形态并存,我按项目自由选择,互不破坏

**Acceptance Criteria:**
- Given 未注册项目,When 在终端全程使用 forge CLI,Then 行为与 M3 之前完全一致
- Given 已注册项目已切换应用通道,When 执行日常任务管线(派发→执行→提交),Then 全程无冻结 CC 插件 spawn(脚本断言)
- Given 同一机器混合使用两种形态于不同项目,When 交替操作,Then 双方数据与行为互不破坏

---

## Story 9: 会话内原生操作与技能寻址

**As a** SDD 开发者
**I want to** agent 在已注册项目会话内经 dsh tool 直接查询与变更任务,并以扁平名调用 forge 技能(submit-task 等)
**So that** 会话内零 CLI 依赖、零 `forge:` 前缀障碍,agent 操作面原生且可审计

**Acceptance Criteria:**
- Given 已注册项目的 agent 会话,When agent 经 dsh tool 执行 claim/submit,Then 操作成功且留 actor 标识(审计可查)
- Given 会话中调用必迁技能集(15 项),When 以 dsh 原生扁平名寻址,Then 全部解析成功
- Given dsh tool 暂不可用,When 会话中尝试任务操作,Then 得到明确的降级提示(而非静默失败)
