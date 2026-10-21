# Error Handling Decisions

| Date | Feature | Decision | Rationale | Source |
|------|---------|----------|-----------|--------|
| 2026-10-19 | host-boot-ipc-crash | sendToChild 恒带 send 回调（错误进回调留痕），不加实例级 error 监听兜底 | 单收口点覆盖全部主→子发送面；实例监听会吞 spawn 失败语义且覆盖面靠枚举 | apps/host/src/boot/run.ts |
