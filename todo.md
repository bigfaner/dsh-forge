# dsh-forge 待办梳理

> 产品方向:以项目为中心的 SDD 工作台(dsh 引擎 × forge 方法论)。
> 状态标记:
> - 【M2 已覆盖】— dsh-forge-m2 已吸收,无需单独立项
> - 【M2 在建】— M2 已含该切片,随 feature 推进
> - 【M3 在建】— dsh-forge-m3 已吸收,随 feature 推进
> - 【M3+ 候选】— M2 收尾后优先考虑
> - 【远期】— 方向性,暂不立题
> - 【留坑】— 待想清楚再动
>
> 梳理日期:2026-09-22(条目重编号,括注原编号;M2 硬前置 ui-plugin-foundation 尚未开工)
> 更新:2026-09-23(dsh-forge-m3「流程即产品」任务分解完成;条目 2/3/5/14 转 M3 在建;主提案路线图 M3/M4 段修订;CLI 四动词 quality-gate/cleanup/worktree/verify-task-done M4 延后决议)

## 一、执行引擎与 agent 能力

### 1. SDD 流程提效,随 LLM 增强而越轻量(原 #1)
- forge skill 适配 dsh,通过插件引入【M2 已覆盖:M2 以双半身插件形态落地(UI + CLI 桥);M3 6.1 起 CLI 桥退役删除,技能面 = customSkillDirs 15 项 dsh 形态(D2)】
- forge CLI 转换为 dsh tool 或应用 API,以插件形式【M3 已落地(6.1 收口):查询/变更面 = dsh tool + 内核动词,预合成取代 forge prompt;quality-gate/cleanup/worktree/verify-task-done 四动词 M4 随 GUI 逐项归宿(PRD 归宿分解决议)】
- skill逐步迁移，分组。一组一个插件。

### 2. subagent 必须具备(原 #6)【M3 在建:预合成引擎 + 派发审批链(dsh-forge-m3 3.4/3.5)】
- 系统提示词专业化:提前合成,而非像 forge task-executor 启动后再合成

## 二、数据内核(SQLite)

### 3. 任务列表等信息存储 SQLite(原 #4)
- 运行时展示所属 worktree【M2 已覆盖:UF2 任务看板三视图含 worktree/来源标识】
- 任务索引、项目与会话关系入 SQLite,放 electron 侧并提供 API
  - 存储与查询【M2 在建:6 表(projects/app_state/session_links + 3 派生快照)】
  - 任务 CRUD API【M3 在建:tasks 域 + dsh tool 写集(dsh-forge-m3 1.3/2.1)】
- 运行偏好分级:全局/项目/feature(.forge/config.yaml)【M3 在建:prefs 三级(dsh-forge-m3 3.1)】

## 三、流程阶段化与模式

### 4. forge 研发流程整体集成到应用(原 #5)
- 全链路:proposal → 任务执行 → 测试用例【产品主线;M2 落地「会话挂接」切片,其余 M3+】
- 集成 opendesign【留坑:暂时不考虑】

### 5. SDD 流程融合 UI,强制阶段化(原 #8)【M3 在建:阶段门 + 强制注入 + 偏离标识(dsh-forge-m3 3.2/4.1-4.4)】
- 进入下一个阶段强制开启新会话
- 新会话要检查当前阶段的产物是否齐全
- 阶段结束时强制总结 feature 目标与摘要(参考 PI 的会话压缩机制)
- 强制注入目标与摘要,注入点暂时定为系统提示词
- 注入当前阶段相关的知识【留坑:想清楚后再引入,依赖条目 7 知识管理】
- 软性阶段化：同一个会话，进入下一个阶段自动压缩上下文？【留坑】

### 6. 内置 full / quick 模式,参考 dsh 官方模式(原 #13)【M3+ 候选】
- brainstorm 独立于任何一个模式
- 小修小改不走模式,但检查文档是否偏移了代码
- full模式正式名称：远征模式；quick正式名称：xx

## 四、知识管理

### 7. 知识库建设,参考 openviking(原 #3)【远期】
- 全 md 文档,frontmatter 存储关键词、摘要
- 动态知识目录：不约定目录结构与名称
- 动态注入系统提示词(prd 阶段与 tech-design 阶段所需知识不同)
- 知识分享，跨项目（项目组内）知识共享
- 用 jev 判断知识与当前阶段的相关性,参考 fast-dev-compaction【优先级最低】

## 五、插件生态

### 8. 文档模板插件化(原 #2)【M3+ 候选】
- proposal、prd 等模板通过插件引入;有内置模板,可替换

### 9. 测试能力插件化(原 #10)【M3+ 候选:衔接 forge surfaces 概念】
- 针对不同形态的应用安装针对性测试插件,并按当前项目/feature 条件加载

## 六、协作、评审与工作台补充

### 10. 研发流程多人协作(原 #7)【远期】
- proposal、PRD、UI 设计、技术设计等文档的针对性批注

### 11. 自动生成的专家团队,放看板迭代复用(原 #9)【远期:可复用 forge eval-* 评审技能作专家底座】
- 评审提案的专家 / 评审 PRD 的专家 / 评审 UI 的专家 / 评审技术方案的专家

### 12. 项目初始化引导(原 #11)【M3+ 候选:可复用 UF1 注册向导组件】
- 预览在线 design.md,选择对应的 design.md
- 预览并修改 design.md

### 13. 预览原型图(原 #12)【M3+ 候选】

### 14. 补充 proposal 看板(原 #14)【M3 在建:提案看板只读 + eval 报告 + 互跳(dsh-forge-m3 5.3-5.5)】

### 15. 增加todo看板，允许用户手动或通过agent9添加待办事项。

### 16. 协调多代码仓开发任务。

### 17. forge自身文档是否由git等进行版本化管理

### 18. 优化UI与dsh官方保持一致，去掉面板的实线线框。修复Bug

### 19. dsh原生的工作区对齐dsh-forge的项目

### 20. UI优化
  - 任务面板从属于feature
  - 使用文件选择器选择工作区、forge文件区以及知识区（后续）

### 21. 多端协同：手机控制dsh-forge，查询状态，下发任务。

### 22. fix-bug,bug（缺陷）看板，自动上报

### 23. 代码注释不添加任务标识

### 24. 任务调度优化：
   - 使用代码实现任务分派逻辑
   - subagent结束即任务结束后，程序接收到信号做后处理：读取agent写出的record.json，创建任务记录，更新任务状态

### 25. 目标牵引

### 26. quick模式：原型先行

### 27. 拆分功能插件

### 28. UI参考codex

### 29. 梳理清楚：源文件夹、forge文件夹、知识文件夹的模型

### 30. 已完成的任务，不允许再发起会话。

### 31. worker subagent： 
- forge 插件依赖knowledge插件，引入知识召回能力。
- worker 以goal为导向。

### 32. 项目概览>任务子tab:工具栏增加一个派发按钮
- 当存在未处于终态的任务时，派发亮起，可点击。所有任务都处于终态时，派发按钮置灰。
- 点击派发按钮，跟诊断失败消息一样，构造结构化消息直接发给agent，并且切换到对应的模式。
- 当前slug有正在执行的任务，则跳转到对应的dispatch会话，否则新开一个dispatch会话。
- 派发/诊断/任务视图切换等控件太多了，占得很宽。任务视图切换控件更改成类似切换模式的下列列表。
- 任务视图切换控件在slug切换控件的右侧。派发/诊断按钮固定在最右端。
- 不支持直接执行某一个任务，必须按照DAG的顺序依次领取并执行。

### 33. T-test-gen-journeys/T-test-gen-journeys/T-eval-journey/T-eval-contract/T-test-gen-journeys单独一条任务链
- 与业务任务并行
- 当业务任务与测试任务都完成时，才执行：T-test-run。

### 34. 去掉surfaceKey、surfaceType，在worker的系统提示词注入fmt、compile、执行单元测试等相关命令
- 验证dsh的subagent会不会加载AGENTS.md

## 推进建议(2026-09-23)

1. M2 已完成(PR#2 合并,53/53):会话挂接、任务看板三视图、SQLite 6 表、forge 核心插件双半身均已落地,原「M2 在建」条目全部转为「M2 已覆盖」。
2. 近期:M3「流程即产品」执行。设计定稿 + 任务分解已完成(2026-09-23,分支 dsh-forge-m3):T1 内核动词面 v2/schema v2 迁移、T2 dsh tool 桥、T3 派发与审批、T4 阶段门与阶段资产,共 41 业务任务/7 相位。
3. P0 四个 spike 相互独立,可并行开工:①工具注册契约 ②subagent 审批 ③系统提示词契约 ④prompt 模板移植(对拍源:forge-cli pkg/task + pkg/prompt)。
4. 原 2026-09-22 优先序(subagent 预合成 → 任务 CRUD API → 强制阶段化)已被 M3 T3/T1/T4 吸收,不再单独立项。
5. 远期条目(7/10/11)不立题,保持方向;留坑条目(opendesign、阶段知识注入)等想清楚再引入。
