---
feature: "dsh-forge M3.5：知识沉淀与保鲜（进气端 + 保鲜端）"
---

# User Stories: dsh-forge M3.5：知识沉淀与保鲜（进气端 + 保鲜端）

> 角色 derives from PRD Background：单人开发者（唯一人类用户）；dsh agent 会话为系统协作者（沉淀主会话 / 知识搜集子 agent / 知识撰写子 agent / 日常开发会话 agent——非用户故事角色，其行为经 Story 1 / 3 / 6 / 7 的系统侧断言覆盖）。

## Story 1: 老项目一键冷启动提取

**As a** 单人开发者
**I want to** 在知识视图发起「从项目提取」，配置源与范围后由沉淀模式会话自动分批执行（搜集 → 撰写 → 落盘待确认）
**So that** 没有会话历史的老项目也能把文档、代码与 git 历史中的可复用知识灌进库，召回能力立刻有货可用

**Acceptance Criteria:**

- Given 三源 fixture 项目（结构化文档 + 现状代码 + git 历史齐备）
- When 在浏览页签工具栏点「从项目提取」chip、按需裁剪源与范围并确认
- Then 以配置合成的首消息建立沉淀模式会话（blank 会话 + 预设选择 + 预填）；主会话规划分批后经派发 tool 分派子 agent，会话轨迹可断言（派发事件载荷含工具面收窄信息）

- Given 沉淀模式会话执行中
- When 知识撰写子 agent 产出条目
- Then 新域先经 `mkdir --desc` 显式建域（描述种子落 DB）、批次条目经 `write --batch` 落盘 `status: unconfirmed`（一次 N 条、逐条校验、批末单次索引联动；`write` 对未建域拒收；磁盘无产品自有文件）；经新会话模式选择器「知识沉淀」发起的会话行为同构（双入口同构断言）

- Given 提取中断（会话中断 / 子 agent 失败）
- When 重新发起或重派
- Then 分批幂等续跑、按条目幂等不重复落盘；空源项目（无文档无 git）得到提取空结果反馈而非报错（边界断言）

---

## Story 2: 待确认两级准入——域裁决与批量入库

**As a** 单人开发者
**I want to** 在浏览页签内对新域目录做就地裁决（确认 / 对齐 / 拒绝），再对剩余待确认条目批量勾选入库
**So that** 批量导入有轻量质检：域归属一键定，条目粒度可微调，噪声进不了召回

**Acceptance Criteria:**

- Given agent 落盘了含 `unconfirmed` 条目的拟建域目录（无已确认条目）
- When 查看浏览页签域树
- Then 该目录名右侧挂「待确认」chip（混合目录——含已确认条目——不挂）；点击 chip 呈现裁决面，拟建域与既有域对照**两侧描述**

- Given 域树 chip 裁决面
- When 选择「确认」
- Then 域转正、域内全部待确认条目一揽子翻转 `draft`——浏览可见且 `knowledge.search` 可命中（e2e）；左栏徽标计数相应递减

- Given 拟建域与既有域近似
- When 选择「对齐既有域」并选定目标域
- Then 条目移动至目标域且 status 不变（仍待条目级确认）；移动经能力面执行

- Given 裁决面
- When 选择「拒绝」
- Then 域内未确认条目文件经能力面物理删除、空目录清理（无墓碑）；后续增量重跑重提时由准入面再次兜底（再拒成本一次点击）

- Given 待确认状态视图（状态 chips 过滤至 `unconfirmed` 档）
- When 批量勾选 / 域级全选（跨分页）并可逐条改域 / 编辑摘要 / 三分文标记后确认
- Then 选中条目翻转 `draft` 入库；**未确认条目浏览可见但 `search` 零命中、`read-abstract` 拒收**（召回侧 status 过滤断言）；千条级候选分页不卡顿（服务端分页）

---

## Story 3: 日常会话顺手沉淀

**As a** 单人开发者
**I want to** 开发会话中 agent 在解决可复用问题时按时机指引自动产出知识条目，我在待确认视图单条确认
**So that** 新项目知识随开发持续沉淀，不必专门跑批量提取

**Acceptance Criteria:**

- Given 系统提示词知识段（沉淀侧最小化）
- When 检查其构成
- Then 含且仅含：知识库存在声明 + 沉淀时机规则 + 「详细方法论经沉淀技能获取」指针——**不含**写作契约细则与提取方法论正文（降载于写入 tool 自描述与技能正文）；**召回侧提示词内容维持 M1 现状不动**（拆分断言——其变更归召回提案）

- Given 开发会话中产生了可复用的解决过程
- When agent 依时机规则经写入 tool 产出条目
- Then 条目落盘 `unconfirmed`（既有域内），左栏知识库入口徽标计数 +1

- Given 待确认状态视图存在该单条候选
- When 单条确认
- Then 翻转 `draft` 入库、徽标计数归零（e2e：产出 +1 → 确认归零全链可见）

- Given knowledge 技能目录（customSkillDirs 装配）
- When 检查沉淀技能在场性
- Then 沉淀技能可被会话显式调用（技能在场断言）；沉淀能力不为沉淀模式私有——凡组合含 knowledge 的模式皆可用（能力抽取原则，代码审计断言）

---

## Story 4: 增量重跑三分文

**As a** 单人开发者
**I want to** 里程碑收尾或定期对新增材料重跑沉淀模式，agent 读已有条目后三分文处置
**So that** 知识库随项目演进保鲜：过时条目被在位修订，重复被标记，缺口被补上

**Acceptance Criteria:**

- Given 目标域已有条目且新增材料与之**同题过时**
- When 撰写 agent 读 `ls -l` 概览、`read` 同题候选现状正文后三分文
- Then 在位修订稿：frontmatter `id` 不变 + `updated` 更新 + 正文变化 + 回 `unconfirmed` 重审（断言；撰写 agent 存在 `read` 调用轨迹）

- Given 新增材料与已有条目**互补**
- When 三分文
- Then 产出新条目（`unconfirmed` 落盘，走准入）

- Given 新增材料与已有条目**近似重复**
- When 三分文
- Then 该条目带合并候选标记且于确认面可见（三选一最简标记）；本里程碑不执行就地合并（合并执行归 M4——n-gram 队列）

---

## Story 5: 漂移被动标记与处置

**As a** 单人开发者
**I want to** 过时或热度骤降的知识在浏览面带待复核徽章，我可发起修订重跑或归档
**So that** 失真知识不会继续以高置信被召回伤害我

**Acceptance Criteria:**

- Given 构造的超阈值陈旧条目（`updated` 超阈值）与热度骤降条目（对比窗内读取骤降）
- When 打开浏览页签
- Then 对应卡片与详情呈现待复核徽章（双信号读取时计算）；全程无后台监听（审计断言——无 watch / 无定时器）

- Given 带待复核徽章的条目
- When 选择处置「归档」
- Then status 变更为 `archived` 经能力面落盘（断言）；选择「修订」时发起沉淀模式重跑该域（进入 Story 4 流程）

- Given 未超阈值的正常条目
- When 浏览
- Then 不呈现徽章（无信号不标注——噪声纪律）

---

## Story 6: 写前结构对齐与域描述可见

**As a** 单人开发者
**I want to** agent 写入前先浏览已有域结构（含域描述），我在浏览页签选中域时看到域上下文条
**So that** 新知识归位准确、重复减少，我也理解每个域装的是什么

**Acceptance Criteria:**

- Given 沉淀模式提取链中每个执行写入的 agent（主会话或子 agent）
- When 检查其会话轨迹
- Then 首次 `write` 调用之前存在 `tree` / `ls` / `stat` / `search` 调用（写前纪律断言——deterministic fixture + 真 agent smoke 双轨）

- Given 导航读取能力面（`tree` / `ls` / `stat` / `read`）
- When 查询
- Then `tree` 返回全部域且各域附 DB 域描述（L0）；`ls` 仅列直接子项（不越界）、`-l` 长格式 = 域概览（L1——与索引缓存该域条目集一致，含 status / updated / keywords，上限可分页）；`stat` 返回单对象元数据全量（条目含 frontmatter 全字段/热度/id）；`read`（工作面全文读）可读 `unconfirmed` 且不入召回日志（能力面断言）

- Given 浏览页签选中某具体域树节点
- When 该域有描述（≤50 字，存 DB）
- Then 卡片区上方呈现域上下文条展示该域描述；「全部知识」态不显示此条；无描述的域不渲染上下文条且不报错、不显占位文案（缺省断言）

- Given 域描述数据（用户裁决 2026-10-10：只存 DB）
- When 检查其存储归属与 UI 呈现
- Then 知识目录零产品自有文件（`_domain.md` 类保留文件零存在——侵入性断言）；域描述不作为知识卡片出现在卡片网格（仅呈现于上下文条）；rebuild 按路径合并保留既有描述、路径消失行清理（丢失可由 agent 再生成）

---

## Story 7: 契约校验拒收即教学

**As a** 单人开发者（观察面）/ dsh agent 会话（执行面）
**I want to** 写入 tool 对不合格 frontmatter 明确拒收并告知缺什么与合规样例，新建 tool 的返回体都带下一步指引
**So that** agent 自我纠错、一次写对——库内不会混入不合格条目

**Acceptance Criteria:**

- Given 缺 `summary`、缺 `keywords`、域层级 >3 层三种不合格写入各一例
- When agent 调用写入 tool
- Then 各被契约校验拒收（三例各验一例），拒收反馈可观察（缺什么 + 合规样例——拒收即教学，SC-2②）

- Given 本里程碑新建的 tool（写入[单条+批量]·mkdir / 导航读 ls·tree·stat·read / 确认处置 / 派发）
- When 检查其返回体
- Then 均附 agent 友好且清晰的 hint 指引下一步：拒收给缺什么与合规样例、未命中给替代路径（域树空态 / 相邻域提示）、边界情形给语义说明（如 `unconfirmed` 不可召回的原因）；hint 与工具名 / 描述 / 参数说明同源（单一事实源 = 工具定义对象）

- Given 全流程走查（提取 → 落盘 → 裁决 → 归档）
- When 文件系统级监控知识目录
- Then 一切写入仅经宿主能力面（写入 tool 与确认面同一 API 后端，SC-2①）

---

## Story 8: 旧线沉淀技能迁移

**As a** 单人开发者
**I want to** `/learn` 成为顺手沉淀的显式入口、`/consolidate-specs` 的提取段成为文档源子流程，两者产出同走待确认准入
**So that** 既有沉淀习惯无缝迁入新线，且不破坏准入纪律

**Acceptance Criteria:**

- Given 会话中调用 `/learn`
- When 捕获一条知识（四类型 decision / lesson / convention / business-rule 各一例）
- Then 元数据按类型落位（各验一例）、条目**立即落盘 `unconfirmed`**（先写后审），经待确认视图后置审确认入库

- Given feature 文档集（`/consolidate-specs` 提取段输入）
- When 非交互批量提取
- Then 产出 CROSS 跨切条目批量落 `unconfirmed`（**非交互自动落 `unconfirmed` 而非 `draft`——准入不破断言**）；feature 文档仅作为通用文档源的一种形态（通用化断言——方法论不含 SDD 前提）

- Given 迁移后的知识技能集
- When 代码审计漂移段去向
- Then 新线无 specs-vs-代码自动修复路径（漂移段不迁，与 P5 巡检记账一致）；`.vocabulary.md` 派生索引零迁移（新线索引缓存天然涵盖）
