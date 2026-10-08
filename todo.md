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

