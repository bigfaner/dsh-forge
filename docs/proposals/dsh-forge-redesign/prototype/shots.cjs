/* 走查截图:生成关键状态 PNG 供人工评审 */
const { chromium } = require('Z:/project/dsh/dsh-forge/node_modules/@playwright/test');
const EXE = 'C:/Users/panda/AppData/Local/ms-playwright/chromium-1217/chrome-win64/chrome.exe';
const URL = 'file:///Z:/project/dsh/dsh-forge/docs/proposals/dsh-forge-redesign/prototype/index.html';

(async () => {
  const b = await chromium.launch({ executablePath: EXE });
  const p = await b.newPage({ viewport: { width: 1680, height: 980 } });
  await p.goto(URL);
  await p.waitForTimeout(400);
  const openKb = async () => { await p.locator('#sb-kn-btn').click(); await p.waitForTimeout(200); };
  const kbChip = async () => { await p.locator('.rb-chip', { hasText: '知识库' }).first().click(); await p.waitForTimeout(200); };
  const closeDock = async () => { await p.locator('.rb-tail [data-act="dock-toggle"]').click(); await p.waitForTimeout(150); };
  const setScope = async (label) => {
    await p.locator('#kb-scope-btn').click();
    await p.waitForTimeout(120);
    await p.locator('.menu-item', { hasText: label }).first().click();
    await p.waitForTimeout(150);
  };

  // 1. 默认工作台(左栏纯菜单导航;会话召回链路罐头)
  await p.locator('.sess-row', { hasText: '置信度四信号实现口径' }).first().click();
  await p.waitForTimeout(300);
  await p.screenshot({ path: 'shot-1-workbench.png' });

  // 2. 知识库 = 中区一等公民视图(搜索中)
  await openKb();
  await p.locator('#kb-q').fill('置信度');
  await p.waitForTimeout(250);
  await p.screenshot({ path: 'shot-2-kb-view.png' });
  await p.locator('#kb-clear').click();
  await p.waitForTimeout(150);

  // 3. 下钻:项目 → 会话(召回的知识 + 沉淀分组网格)
  await setScope('项目 · dsh-forge');
  await p.locator('.kb-drill-row').first().click();
  await p.waitForTimeout(200);
  await p.screenshot({ path: 'shot-3-drill-session.png' });

  // 4. 知识详情(右栏)+ 置信度构成气泡
  await openKb();
  await setScope('全部知识');
  await p.locator('.kn-card', { hasText: '单一归属' }).first().click();
  await p.waitForTimeout(250);
  await p.locator('.kd-badges .badge-conf').first().click();
  await p.waitForTimeout(250);
  await p.screenshot({ path: 'shot-4-detail-conf.png' });

  // 5. 会话知识召回 tab(当前会话召回了哪些知识)
  await p.keyboard.press('Escape');
  await p.waitForTimeout(100);
  await p.keyboard.press('Escape');
  await p.waitForTimeout(150);
  await p.locator('.sess-row', { hasText: '置信度四信号实现口径' }).first().click();
  await p.waitForTimeout(150);
  await p.locator('.conv-tab', { hasText: '知识召回' }).click();
  await p.waitForTimeout(250);
  await p.screenshot({ path: 'shot-5-knrec.png' });

  // 6. 审核工作台(合并队列;经开始页 —— 知识模式无右栏,整体切换)
  await openKb();
  await p.waitForTimeout(150);
  await p.locator('.sess-row').first().click();   /* 切回会话视图,右栏恢复 */
  await p.waitForTimeout(200);
  await p.locator('#rb-corner-expand').click();
  await p.waitForTimeout(150);
  await p.locator('[data-act="dock-plus"]').click();
  await p.waitForTimeout(150);
  await p.locator('.rb-start-card', { hasText: '审核工作台' }).click();
  await p.waitForTimeout(200);
  await p.locator('.rv-qtab', { hasText: '合并队列' }).click();
  await p.waitForTimeout(200);
  await p.screenshot({ path: 'shot-6-review.png' });

  // 7. 项目概览(对账卡 + 概要信息)
  await p.locator('.sess-row', { hasText: '置信度四信号实现口径' }).first().click();
  await p.waitForTimeout(150);
  await p.locator('[data-act="dock-plus"]').click();
  await p.waitForTimeout(150);
  await p.locator('.rb-start-card', { hasText: '项目概览' }).click();
  await p.waitForTimeout(250);
  await p.screenshot({ path: 'shot-7-overview.png' });

  // 8. 任务 DAG(feature 绑定)
  await p.locator('.ov-subtab', { hasText: '任务' }).click();
  await p.waitForTimeout(200);
  await p.locator('[data-act="ov-task-view"][data-v="dag"]').click();
  await p.waitForTimeout(250);
  await p.screenshot({ path: 'shot-8-tasks-dag.png' });

  // 9. 任务泳道图(状态分组七态)
  await p.locator('[data-act="ov-task-view"][data-v="swim"]').click();
  await p.waitForTimeout(250);
  await p.screenshot({ path: 'shot-9-tasks-swim.png' });

  // 10. 统计分析(召回分布 项目→feature 下钻 + 时间过滤)
  await openKb();
  await p.locator('.knview-tab', { hasText: '统计分析' }).click();
  await p.waitForTimeout(220);
  await p.locator('.stat-mod').first().locator('.stat-row.is-click', { hasText: 'dsh-forge' }).first().click();
  await p.waitForTimeout(250);
  await p.screenshot({ path: 'shot-10-knstats.png' });

  // 10b. 自由分析折线图(逐 x 着色)
  await p.locator('[data-act="stat-chart"][data-v="line"]').click();
  await p.waitForTimeout(250);
  await p.screenshot({ path: 'shot-10b-knstats-line.png' });
  await p.locator('[data-act="stat-chart"][data-v="bar"]').click();
  await p.waitForTimeout(150);

  // 11. 知识详情抽屉(右侧滑入;摘要 + 两列元数据 + @跳对话)
  await openKb();
  await p.locator('.knview-tab', { hasText: '浏览' }).click();
  await p.waitForTimeout(150);
  await p.locator('.kn-card', { hasText: '单一归属' }).first().click();
  await p.waitForTimeout(300);
  await p.screenshot({ path: 'shot-11-detail.png' });

  // 12. 暗色主题(知识统计)
  await p.keyboard.press('Escape');
  await p.waitForTimeout(120);
  await p.locator('[data-act="theme-toggle"]').click();
  await p.waitForTimeout(250);
  await p.screenshot({ path: 'shot-12-dark.png' });

  // 13. 知识文档 dock 页签(在 dock 打开 · 跟随所属项目)
  await p.locator('[data-act="theme-toggle"]').click();
  await p.waitForTimeout(200);
  await openKb();
  await p.locator('.knview-tab', { hasText: '浏览' }).click();
  await p.waitForTimeout(150);
  await p.locator('.kn-card', { hasText: '单一归属' }).first().locator('.icon-btn[data-act="kn-menu"]').click();
  await p.waitForTimeout(150);
  await p.locator('.menu-item', { hasText: '在 dock 打开文档' }).click();
  await p.waitForTimeout(300);
  await p.screenshot({ path: 'shot-13-kndoc-dock.png' });

  // 14. 召回日志(轨迹级:时间 / trace_id / 项目 / 会话 · 事后分析)
  await p.locator('.rb-tail [data-act="dock-toggle"]').click();
  await p.waitForTimeout(150);
  await openKb();
  await p.locator('.knview-tab', { hasText: '召回日志' }).click();
  await p.waitForTimeout(250);
  await p.locator('.rl-row').first().click();   /* 展开首行轨迹详情 */
  await p.waitForTimeout(200);
  await p.screenshot({ path: 'shot-14-rlog.png' });

  // 15. 添加项目 ①:文件浏览器先弹(选定工作区目录;已注册目录带标记)
  await p.keyboard.press('Escape');
  await p.waitForTimeout(150);
  await p.locator('[data-act="add-project"]').click();
  await p.waitForTimeout(300);
  await p.locator('.fb-item', { hasText: 'dsh-demo' }).click();
  await p.waitForTimeout(200);
  await p.screenshot({ path: 'shot-15-add-project-picker.png' });

  // 16. 添加项目 ②:工作区回填 + forge / 知识库目录按工作区构建预填
  await p.locator('.dialog [data-dlg-ok]').click();
  await p.waitForTimeout(300);
  await p.screenshot({ path: 'shot-16-add-project-form.png' });

  await b.close();
  console.log('截图完成: shot-1..shot-16');
})().catch(e => { console.error('CRASH', e.message); process.exit(1); });
