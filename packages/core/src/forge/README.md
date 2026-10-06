# forge/

定位：**业务** —— projects 服务、四步补偿链（预检/create/确认/delete 补偿）、启动对账、app_key_logs。填充：2.2 / 2.3。
`workspace/`（M2 1.2 起步）：每工作区任务库共享基建——ForgeWorkspaceStore 惰性开库/迁移/隔离态/缺席补建 + 工作区 schema v1 独立版本线 + 事件发射器底座 + 工作区 app_key_logs（scope: tasks|workspace）。
边界：禁 import `../knowledge/`（依赖铁律③ 同级业务互禁）；四域（tasks/features/proposals/docs，2.x 落地）互禁 import 彼此、均可 → `workspace/`。
