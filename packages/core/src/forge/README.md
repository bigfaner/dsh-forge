# forge/

定位：**业务** —— projects 服务、四步补偿链（预检/create/确认/delete 补偿）、启动对账、app_key_logs。填充：2.2 / 2.3。
`workspace/`（M2 1.2 起步）：每工作区任务库共享基建——ForgeWorkspaceStore 惰性开库/迁移/隔离态/缺席补建 + 工作区 schema v1 独立版本线 + 事件发射器底座 + 中央行路由（projectId → ws_path/forge_dir，2.7）+ 工作区 app_key_logs（scope: tasks|workspace）。
`tasks/`（M2 2.1 起步）：状态机 + 相位推导机（纯函数核心）；`service.ts` = 2.7 provide ×4 装配壳（Interface 1 十一法面先行，动词 2.2–2.6 接线）。
`small-domains/`（M2 2.7）：三小域合并单目录承载（布局自由度注记——服务面四分是契约，文件布局非契约）——features 域（registerFeature/transitionFeature/upsertFeatureDoc 登记即推进/listFeatures）+ proposals 域（createProposal/transitionProposal 裁决写 decided_at/listProposals）+ docs 域（read 路径守卫 + 悬空态）。相位推导机经装配注入（四域互禁 import 彼此——不直 import tasks/phase-deriver）。
边界：禁 import `../knowledge/`（依赖铁律③ 同级业务互禁）；四域（tasks/features/proposals/docs）互禁 import 彼此、均可 → `workspace/`；`tasks → project-service` 单向允许（路由查中央表），反向禁止。
