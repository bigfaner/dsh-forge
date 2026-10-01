# rpc/

定位：**基础** —— IPC client 封装（通道契约消费方）。填充：2.4 / 3.5。
边界：禁 import `@dsh-forge/{core,knowledge}`（运行期边界：只经 IPC RPC）；禁 import `views/`、`flows/`（依赖铁律①）。
