// @dsh-forge/host Electron 薄宿主入口（定位：装配，~100 行纪律）。
// 1.4 起填充：仅编排 profile/ boot/ ipc/ window/ 子模块（S1 spike 裁决 = 直跑形态）。
// S1 实测约束：ESM main 禁顶层 `await app.whenReady()`（死锁）——boot 逻辑入 `void (async () => {})()`。
// 本文件为 1.2 骨架占位，不含业务代码。
export {}
