1. 优化forge的sdd流程，提升执行效率。sdd流程随LLM越强而越轻量。
   - forge skill 适配dsh，通过插件引入
   - forge cli 转换为dsh tool或应用API，以插件的形式。
2. proposal、prd等文档模板通过插件引入。有内置的模板，但可替换。
3. 知识管理参加openviking，全md文档，frontmatter存储关键词、摘要。
4. 任务列表等信息，存储到sqlite
   1. 运行时，要展示所属worktree
   2. 任务索引、项目与会话的关系等采用sqlite存储，放在electron侧，提供相关的API(特别是任务CRUD)。
   3. 运行偏好，区分全局、项目、feature级。.forge/config.yaml
5. 把forge的流程即软件研发流程集成到应用中：
   - 从proposal到任务执行，再到测试用例
   - 把forge集成opendesign？暂时不考虑。
6. 必须具备subagent。
   - 系统提示词专业化：提前合成，而不要像forge task-executor启动后再合成提示词。
7. 研发流程支持多人协作
   - 提案、PRD、UI设计、技术设计等文档针对性地批注。
8. SDD流程融合到UI中，强制阶段化，进入下一个阶段开启新的会话。
   - 阶段结束时，强制总结feature目标与摘要。参考PI的会话压缩机制。
   - 强制注入：目标与摘要。注入目标暂时是：系统提示词。
   - 注入当前阶段相关的知识。（留坑，后面想清楚后，再引入）
9.  自动生成的专家团队，放在看板，迭代与复用。
   - 评审提案的专家
   - 评审PRD的专家
   - 评审UI的专家
   - 评审技术方案的专家
10. 测试能力插件化
   - 针对不同形态的应用，安装针对性的测试插件。并且这些插件根据当前项目/feature而有条件地加载。
11. 增加初始化项目的引导：
   - 预览在线design.md，选择对应的design.md
   - 预览并修改design.md
12. 预览原型图
13. 参考dsh官方的不同模式，内置full、quick模式。
   - brainstorm独立于任何一个模式
   - 小修小改，不走任何一个模式，但是检查文档是否偏移了代码
