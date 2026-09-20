---
id: "disc-2"
title: "Host dependency closure and upstream web dist assembly (Spike 2 landing)"
priority: "P1"
dependencies: []
status: 
type: "coding.feature"
---

# disc-2: Host dependency closure and upstream web dist assembly (Spike 2 landing)

Spike 2 收尾:在 vendored 树上安装宿主依赖闭包(node_modules,43 registry 依赖 + workspace 链接)并构建上游 web dist(apps/web),接入 assemble-app-resources 与 dev 启动路径;更新 closureNotes;验证 dev 模式宿主握手成功、dsh-app:// 载入真实上游 GUI;打包 staging 体积复核。完成后 SC1/SC9 打包复验前置条件就绪。
