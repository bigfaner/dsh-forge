# events/

定位：**业务** —— 产品自建进程内事件总线 + 日志监听器（M3 3.3；tech-design Interface 3「事件两层抽象 + 业务日志」）。

3.3 已填充：
- `bus.ts` —— 进程内 emit/subscribe 总线（零上游事件面 import——形制参考 dsh/Cordis：订阅面/退订器/发射方异常隔离）；信封 `{ts,sessionId,slug,type,payload}` 恒全守卫（`assertForgeEventEnvelope`，emit 入口 fail-loud）
- `sink.ts` —— tool 面事件发射器（3.4）：emit 直通总线 + 会话→容器库目录记忆（prepare 经注入 resolveDir 调 core deriveTaskStoreDir 单源——监听器落盘位解析）+ `emitToolError`/`slugOfToolArgs`（全 tool 面 tool-error 发射守卫）
- `log-listener.ts` —— logs/{slug}.jsonl 唯一写者：事件标准化（键序恒定、slug = 归属判定产物）→ 归属三分支（任务容器 slug / contextSlug / `_pool` 兜底）→ 容器维度 JSONL 追加；`attachForgeLogListener` = 挂接缝（3.4 已接线：插件装配挂总线——`resolveContainerDir` 经 sink 会话目录记忆消费）；`readForgeEventLog` = 串联读法载面

敏感度边界（Security ③ / Hard Rules）：载荷面只承载 digest（`dispatchDigest`）——不含凭据、不含 dispatchPrompt 全文；logs = agent 面执行运营日志，UI 面状态审计 = feature_records/task_records（DB）——两纪律不混。
