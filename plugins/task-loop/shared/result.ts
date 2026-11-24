// 包内两半共享泛型基型（不出包——exports 基线不含 shared，host 半方法签名单点实例化）。
// 复用优先侦察定谳：@dsh-forge/contracts 无同义 Result/Envelope 基型；plugins/project 同义形
// （RemoteResult）属 typert 协议壳面、不承载业务 DTO——本文件为包内单源，实例化点收口于
// host/assembly/typert-remotes.ts（禁重复手写具体形态、禁 any/unknown 退路）。

// ok/err 运行期构造函数已删（终轮核清：信封去 Result 化后运行期消费面为 0——Result/
// Envelope/RemoteMethodError 类型经 host/types.ts 再导出保留，Envelope 仍被 follow 流消费）。

/** 方法族结构化拒绝载荷（typed unavailable——code 封闭码集、message 前置修单源 pin） */
export interface RemoteMethodError {
  readonly code: string;
  readonly message: string;
}

/** 快照方法族返回基型：ok 携聚合 DTO / error 携 typed unavailable（诚实降级非抛错折叠） */
export type Result<T> =
  | { readonly ok: true; readonly value: T }
  | { readonly ok: false; readonly error: RemoteMethodError };

/** follow 流帧信封：seq 自 baseline 帧起单调递增，snapshot 恒全量快照（增量 = 变化才发帧） */
export interface Envelope<T> {
  readonly seq: number;
  readonly snapshot: T;
}
