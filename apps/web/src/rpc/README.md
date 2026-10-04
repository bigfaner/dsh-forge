# rpc/

定位：**基础** —— IPC client 封装（通道契约消费方）。填充：2.4（forge:projects/*）/ 3.5（forge:knowledge/*，只增通道不改建制）。
边界：禁 import `@dsh-forge/{core,knowledge}`（运行期边界：只经 IPC RPC）；禁 import `views/`、`flows/`（依赖铁律①）；禁 import host 源码（web/host 不 import 彼此——preload 暴露面结构同型镜像）。

## 机制（2.4 RPC 面）

- **通道名唯一源** = `@dsh-forge/contracts` `channels.ts`（client 禁字面量；preload/main 两侧 allowlist 守门，纵深防御）。
- **信封契约** = contracts `dto/rpc.ts` `RpcResult<T>`：成功 `{ ok: true, data }`；typed error `{ ok: false, error: { code, message, data } }`（错误不走 promise 拒绝——Electron invoke 拒绝抹平结构）。
- **消费方式**：`preloadRpcClientFactory()`（= `createForgeRpcClient(preloadTransport())` 单一缺省构造，fix-36 收敛）→ `client.projects.register/list/get/update/reconcile`（typed 结果）；失败抛 `RpcClientError`（code ∈ contracts 六码，data 原样保真）。
- **传输注入**：`ForgeTransport = (channel, payload) => Promise<unknown>`——preload 真身 / 测试替身同型。

## UI 错误消费约定（最简，AC5）

`catch (e)` → `e instanceof RpcClientError` → `rpcUiState(e.code)` 选状态组件，三态口径 = tech-design Propagation Strategy（空态/错误条/横幅）：

| code | 状态 | 组件与口径 | data 喂点 |
|---|---|---|---|
| `ERR_WORKSPACE_CREATE` | error-bar | 注册表单错误条（创建中止，原地重试） | `wsPath` |
| `ERR_PROJECT_WRITE` | error-bar | 注册表单错误条；**`data.compensated` 存在 = 「补偿已执行，dsh 侧零孤儿」口径** | `compensated`/`wsPath` |
| `ERR_COMPENSATION` | banner | 应用级横幅（孤儿工作区已记账，启动对账将提示，不自动删） | `workspaceId`/`writeError`/`deleteError` |
| `ERR_ENTRY_NOT_FOUND` | empty-state | 详情面空态（索引重建后 ID 漂移） | — |
| `ERR_INDEX_STALE` | empty-state | 浏览面空态（静默重建中） | — |
| `ERR_INVALID_KNOWLEDGE_DIR` | empty-state | 浏览面空态 + 目录提示 | — |

非 RpcClientError 的异常（信封形状非法 / Electron 拒绝面 / 装配断裂）= fail-loud 上抛，不进三态映射（编程错误不静默降级）。
