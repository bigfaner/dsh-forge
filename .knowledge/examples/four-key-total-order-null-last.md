---
title: 四键字典序严格全序 + NULL 垫底零回填兼容
summary: 手动排序读面用 (sort_order IS NULL, sort_order, created_at, id) 四元组字典序——末位主键保证严格全序（任意两次查询顺序确定一致）；NULL 语义 =「未手动排序、垫底、组内按注册序」，存量行零回填、升级前后显示序逐位一致，新项目自然落末尾不打扰已排布局。
keywords: [严格全序, NULL 垫底, 零回填, 字典序, SQLite]
domainPath: .knowledge/examples/
来源容器: project-manual-order
来源任务: first-pass 复盘（1.4）
bug id: 无
---

# 四键全序 + NULL 垫底（project-manual-order 判例）

给「可选手动序 + 缺省序」混排的列表定义确定性读序：

```sql
ORDER BY sort_order IS NULL, sort_order, created_at, id
```

1. **严格全序**：末位键为主键 ⇒ 任意两次查询顺序确定一致（同 created_at/同 order 的病态数据也不抖动）。
2. **NULL 垫底**：`IS NULL` 求值 0/1，升序时已排序行整体在前；NULL 组内由 `created_at, id` 注册序补位。
3. **零回填迁移**：存量行保持 NULL，语义即「未手动排序」，升级前后显示序逐位一致——新列默认 NULL 的语义设计让数据迁移直接消失。

配套性质：过滤（归档/搜索）一律做保序子列投影，不设归档专属排序分支——混排相对位置 = 全序相对位置。

落点：`packages/core/src/forge/project-service.ts`（project-manual-order 1.1，commit 6c89a8ab）；走查证据 `.forge/docs/proposals/project-manual-order/walkthrough/batch1/`。
