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

### 35. 应用重启后，WORKER也已经终止，但是任务显示进行中，无法重新派发任务。、
- 打开子会话时，项目概览tab展示主会话的项目信息
- 打开正在运行中任务的子会话页面

### 36. 新增追加/派发/继续任务的指令
- 追加任务指令：根据用户输入梳理并核实问题，再添加任务到指定slug的任务池。
- 通过askUser工具，让用户选择一个尚有未执行完任务的slug(提案或feature)。根据选中的slug构建消息，让agent执行dispatchTask(slug)。done
- 派发任务与继续任务逻辑相近，消息模板稍有不同。done

### 37. 优化worker：done
- ~~设定worker的系统提示词~~会继承主agent的系统提示词，派发subagent时能不能自定义/追加subagent的系统提示词？
- 优化worker的初始提示词
- 项目的部分基本信息注入到初始提示词
- 过滤掉不必要的skill
- 目标导向，允许使用create_goal/get_goal/update_goal/todo_write工具
- 限制测试范围，改动哪里，测试哪里
- 生成的任务摘要要简洁，格式化，可读性好
- worker引入知识召回/沉淀机制（允许使用知识库相关的技能）
- 子会话面板隐藏消息输入框
- 针对不同类型的任务，采用不同的模型，设置不同提示词。例如，把面向前端任务和面向后端的任务要区分开来
- 采用workflow??

### 38. 优化系统提示词
- 告诉agent：截图等临时产物，存放到哪里

### 39. 知识库优化/重构
- 知识支持启用/禁用
- 知识要支持沉淀
- 采用虚拟文件目录
- 知识库跟项目的关系从一对一改为多对多。一个项目默认有一个自身的知识库，可以绑定项目组的知识库，也可以绑定跟全局知识库。也可以理解为，知识库跟项目不强绑定。
- 项目组知识库，承载多个项目共享的知识。例如，一个系统有三个微服务，项目组知识库专门承载系统的整体架构，服务之间的依赖关系、接口调用关系等。

### 40. E2E测试用例，根据页面组件树来组织

### 41. worker健康上报/探活。skipped
- 避免worker死掉了，任务状态依旧是“进行中”
- worker可能中途崩溃又再次派发，持久化的事件可能失真。logs/{slug}.log

### 42. 简化dispatchTask工具的输出(skipped)

### 43. 优化任务详情弹窗 done
- 任务内容对齐原型，要有目标、改动范围等
- 目标、结果等文字不要逻辑，要简约
- 挂接的会话展示会话名称而不是会话id。
- 无论小弹窗还是大弹窗，都可以跳过对应的会话。
- 任务名称去掉slug，任务名称跟任务子tab列表的任务名称保持一致，格式为：{编号} {title}
- 弹窗标题格式为：派发 {slug} 的任务 
- 扩大与缩小跟dockkit的全屏与退出全屏采用一样的图标
- 任务行新增打开worker会话的按钮
- 诊断任务的提示词：直接包含必要的信息。不要有“（任务时间线见概览 → 任务子 tab → 该任务详情）”，没有提供相关的工具，agent获取不了。
- dag的箭头方向要契合线的走向，看起来要自然，箭头不要都是向下的。
- 快速直接打开对slug的任务视图/列表(pending)

### 44. 优化UI：项目列表。doing
- 不展示归档的项目
- 每一个项目只展示最近24小时的前10条活跃会话。根据更新时间计算。折叠多余的会话
- 运行中即活跃会话排列在前面
- 对齐dsh：鼠标悬浮到某一条会话上时，右端显示图标按钮。图标风格与功能与dsh一致。
- 有后台任务运行的会话，也要类似正在响应的会话一样有特殊标识。

### 45. dockkit打开md文档时，要支持渲染mermaid等格式的流程图。done

### 46. 编排不同提案/feature的依赖关系
- 先跑前置提案/feature的任务，再跑本提案/feature的任务

### 47. 排查skill是否适配新形态。doing
- 例如，新形态下不再读写.forge\state.json

### 48. 新增初始化 dsh-forge 项目环境的指令
- 例如补充.gitignore条件，忽略

### 49. 项目概览的基本信息展示不正确
- 例如：dsh-forge dsh-forge-m3.5-knowledge-consolidation · 27 会话 · 40 完成


### 50. clean code，抽取注释内含的知识，消除死代码等。

### 51. 新增worktree的功能

### 52. 打开文档后，消息输入框悬浮在文档上方，类似codex

### 53. 优化提案/feature/tech-design的文档模板，要保持简洁。
- 不保留调整/修复的说明。

### 54. 集成手机remote controll、插件市场

### 55. 优化远征/突击模式的系统提示词（人格）。done

### 56. 涉及UI的任务要进行先进行视觉验证，再进行e2e，确保视觉效果和功能符合预期。
- 细化任务：拆分coding类型

## 57. 增加修改任务的tool，增加查询任务统计信息tool，仅限主agent使用。done

## 59. run-dag-tasks发出提问，人类回答后，主会话没有回复。

## 60. 优化QUICK-TASKS:要明确改动范围，不是需求范围。done
- 突击模式/远征模式的系统提示词要包含：提案/feature的存储目录

## 61. Bug 子 tab 统计报表视图（fix-bug 提案排除项）doing
- 按状态、错误类型等维度计数
- 视图切换控件随统计视图一并落地（复用任务子 tab ViewDropdown 形态）

## 62. 阻塞性任务，记录已经完成的部分，并且提交，把未完成的部分塞进新任务。不要每次重头开始。doing

## 63. ChatView支持渲染mermaid等流程图。doing
- 把markdown chart的能力抽取成独立的插件。后续

## 64. 增加一个tool尝试渲染mermaid等流程图，判断语法是否正确。doing

## 65. 会话内新交付的 agent 工具不可用（技能热刷新 vs 工具面快照）
- 现象：长会话中随特性交付的新工具（如 recordBug/resolveBug）直到会话重启才可用——技能目录可被宿主热刷新，工具清单却是会话启动快照，技能指令与工具面不一致（2026-10-13 /fix-bug 实证：修复完成但台账无法落库）。
- 可选处置：工具面随插件重载热刷新；或技能文本内置「工具缺席降级条款」（缺席时如实标注、禁手填绕库）。

## 66. v1 直改后陈旧工作区库的隔离提示误导（重启重试恒败）
- 现象：schema v1 直改（+bugs 表）后，存量旧库过版本门（v1==v1）但挂结构健全性检查 → 工作区隔离；对账降级提示「下次重启重试」——此类失败无迁移路径，重试恒败（2026-10-14 实证：五个空壳旧库全隔离）。
- 可选处置：结构不符（schema-mismatch 类）单独提示「需废弃重建」而非「重试」；对零数据陈旧空库（tasks/proposals/features 全 0）可考虑自动废弃重建。

## 67. 没有回答的问题，始终渲染成卡片，即使重启了。

## 68. 增加待办清单功能，有面板

## 69. worker因阻塞而提问时，不要followup消息。不然会造成：主会话在进行中，同时展示问题卡片。用户回答的问题，没有意义。

## 70. 续跑说明，能不能替换成具体的内容，而不是规则。
 <resume>
续跑说明：本段在场 = 本任务已有部分进度，进度文件为 {forge.task_logs_dir}/resume.md。
1. 首步读取该文件：内容为「已完成 / 进行中 / 待办」三项；将未完成项转入 todo_write 后继续执行，不得重做已完成部分。
2. 同目录下按编号命名的子文件夹（如 001-login-fail/）为此前各轮产物：先核对内容，再决定沿用或重跑；未核对不得覆盖。
3. 遇到阻塞性问题时覆盖写入该文件，仅保留最新状态。
4. 本段缺席 = 首次执行：从零开始，并自第一轮起按上述方式维护该文件。
</resume>


## 71. agent自动执行指令 run-dag-tasks

## 72. dsh-plugin-marketplace 发布日接入出厂组合
 - 前提：@deepseek-ai/dsh-plugin-marketplace 官方发布（2026-10-14 实测：npm/npmmirror 双源 404，上游 fork 源码亦无此包——未写出）。
 - 发布日动作（两形态各一行）：dev 形态 `apps/host/profile.dev/package.json` 加依赖 + boot manifest 启用；打包形态 profile 清单同步。开机即得官方市场分区，产品侧零自建（dsh-plugin-marketplace 提案 1.5 已收口，方向裁决：市场面完全对齐 dsh）。

md的FRONTMATTER渲染成表格，跟github一样

不自动切换明暗主题。

1、能不能撤回/修改用户最近输入的消息、
2、方向键浏览当前会话中的用户之前输入的消息。

## 73. 任务循环注入改用 agent.send（mobile-ui 技术设计裁决，未来演进）
- 任务循环注入统一切到底层原语 `agent.send(message, target: 'next-turn'|'next-step', wakeup)`（现走 followup/inject 便捷方法）。
- 桌面端适配：`packages/plugin-forge/src/faces.ts`（forgeUserMessage）与 `notify/` 通道注入点、`run-dag-tasks.ts` 指令单行 followup 改走 send，并保留 `source.kind:'forge-loop'` 声明合并（mobile-ui tech-design AD-4）。
- 手机端适配：循环叙述卡判别只消费 `source.kind`（tech-design 投影白名单 B 档），send 语义（next-turn/next-step、wakeup 与否、cancel parked）不影响渲染契约；惰性续轮（send('next-turn', wakeup:false)）为可选增强。
- 上下文：mobile-ui tech-design.md AD-4 / 投影白名单；官方正本 dsh-agent runtime-types.d.ts（send/steer/followup/inject 全收显式 UserMessage）。