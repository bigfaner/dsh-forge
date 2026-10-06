# rpc/

定位：**基础** —— IPC client 封装 + 写推送事件订阅层（通道契约消费方）。填充：2.4（forge:projects/*）/ 3.5（forge:knowledge/*，只增通道不改建制）/ 3.1（M2 四族 forge:{tasks,features,proposals,docs}/* + projects 派生行扩族 + forge:events 订阅层）。
边界：禁 import `@dsh-forge/{core,knowledge}`（运行期边界：只经 IPC RPC）；禁 import `views/`、`flows/`（依赖铁律①）；禁 import host 源码（web/host 不 import 彼此——preload 暴露面结构同型镜像）。

## 机制（2.4 RPC 面）

- **通道名唯一源** = `@dsh-forge/contracts` `channels.ts`（client 禁字面量；preload/main 两侧 allowlist 守门，纵深防御）。
- **信封契约** = contracts `dto/rpc.ts` `RpcResult<T>`：成功 `{ ok: true, data }`；typed error `{ ok: false, error: { code, message, data } }`（错误不走 promise 拒绝——Electron invoke 拒绝抹平结构）。
- **消费方式**：`preloadRpcClientFactory()`（= `createForgeRpcClient(preloadTransport())` 单一缺省构造，fix-36 收敛）→ `client.projects.register/list/get/update/reconcile/deriveTaskStoreDir` + `client.{tasks,features,proposals,docs}.*`（typed 结果）；失败抛 `RpcClientError`（code ∈ contracts 全码，data 原样保真）。
- **传输注入**：`ForgeTransport = (channel, payload) => Promise<unknown>`——preload 真身 / 测试替身同型。
- **薄 Controller 铁律**：client 四族方法仅做参数映射与路由，禁业务逻辑（3.1 Implementation Notes）。

## 写推送事件订阅（3.1——tech-design §交互二）

`subscribeTasksChanged(listener)`（events.ts）：preload `window.dshForge.onForgeTasksChanged`（镜像 host preload-api.ts）→ 共享单订阅 + **50ms 尾沿合并**（窗内连发 latest-wins 单次重取通知）→ 概览/文档 tab/会话头 pill 重取活跃查询。preload 面缺席（非 Electron 载体）= 静默降级 no-op（交互重取兜底）。

## UI 错误消费约定（最简，AC5）

`catch (e)` → `e instanceof RpcClientError` → `rpcUiState(e.code)` 选状态组件，三态口径 = tech-design Propagation Strategy（空态/错误条/横幅）；**未映射码 → 通用错误条兜底（永无裸 code 泄漏）**：

| code | 状态 | 组件与口径 | data 喂点 |
|---|---|---|---|
| `ERR_WORKSPACE_CREATE` | error-bar | 注册表单错误条（创建中止，原地重试） | `wsPath` |
| `ERR_PROJECT_WRITE` | error-bar | 注册表单错误条；**`data.compensated` 存在 = 「补偿已执行，dsh 侧零孤儿」口径** | `compensated`/`wsPath` |
| `ERR_COMPENSATION` | banner | 应用级横幅（孤儿工作区已记账，启动对账将提示，不自动删） | `workspaceId`/`writeError`/`deleteError` |
| `ERR_ENTRY_NOT_FOUND` | empty-state | 详情面空态（索引重建后 ID 漂移） | — |
| `ERR_INDEX_STALE` | empty-state | 浏览面空态（静默重建中） | — |
| `ERR_INVALID_KNOWLEDGE_DIR` | empty-state | 浏览面空态 + 目录提示 | — |
| `ERR_TASK_NOT_FOUND` / `ERR_FEATURE_NOT_FOUND` / `ERR_PROPOSAL_NOT_FOUND` | empty-state | 详情/列表面目标缺席 = 空态（3.1 精化） | — |
| `ERR_INVALID_TRANSITION` 等 M2 动词校验八码 | error-bar | 表单/动作原地反馈（改参重试） | 码各自附载 |
| `ERR_SUSPECTED_MOVE` | error-bar | 注册表单错误条 + 手工指引留场（`data.guidance`） | `existingDir`/`derivedDir`/`guidance` |
| `ERR_WORKSPACE_DB_UNAVAILABLE` | banner | 工作区隔离态横幅（单库腐化不瘫痪全局，其余工作区照常） | `projectId` |

非 RpcClientError 的异常（信封形状非法 / Electron 拒绝面 / 装配断裂）= fail-loud 上抛，不进三态映射（编程错误不静默降级）。
