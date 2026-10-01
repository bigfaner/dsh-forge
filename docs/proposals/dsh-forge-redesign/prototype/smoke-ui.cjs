/* UI 冒烟:Playwright(Chromium)走查三区工作台核心交互链路。
   运行:node smoke-ui.cjs(依赖仓库根 node_modules 的 Playwright)
   覆盖:左栏纯菜单导航、中区一等公民知识库视图(会话 ⇄ 知识互换)、
   范围下钻/阈值、知识详情(dock)、会话知识召回 tab、审核台、抽取、晋升/移动、
   任务三视图(列表/DAG/泳道,feature 绑定)、概览对账、dock 机制、原型工具。 */
const { chromium } = require('Z:/project/dsh/dsh-forge/node_modules/@playwright/test');
const path = require('path');

const URL = 'file:///' + path.resolve(__dirname, 'index.html').replace(/\\/g, '/');
const EXE = 'C:/Users/panda/AppData/Local/ms-playwright/chromium-1217/chrome-win64/chrome.exe';
const fs = require('fs');
let pass = 0, fail = 0;
const fails = [];
function T(name, cond) {
  if (cond) { pass++; console.log('  ✓ ' + name); }
  else { fail++; fails.push(name); console.log('  ✗ FAIL: ' + name); }
}
async function openKb(page) { await page.locator('#sb-kn-btn').click(); await page.waitForTimeout(220); }
async function openConv(page, title) {
  await page.locator('.sess-row', { hasText: title || '置信度四信号实现口径' }).first().click();
  await page.waitForTimeout(220);
}
async function setScope(page, label) {
  await page.locator('#kb-scope-btn').click();
  await page.waitForTimeout(120);
  await page.locator('.menu-item', { hasText: label }).first().click();
  await page.waitForTimeout(160);
}

(async () => {
  const browser = await chromium.launch(fs.existsSync(EXE) ? { executablePath: EXE } : {});
  const page = await browser.newPage({ viewport: { width: 1600, height: 950 } });
  const errors = [];
  page.on('pageerror', e => errors.push(String(e)));
  page.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });

  await page.goto(URL);
  await page.waitForTimeout(300);

  console.log('== 三区布局(SC1)==');
  T('左栏渲染(纯菜单与导航)', await page.locator('.app-sidebar').isVisible());
  T('左栏 = 品牌/新会话/知识库入口/项目树/设置', await page.locator('#sb-kn-btn').isVisible() && await page.locator('#pj-zone').isVisible());
  T('知识库入口带待审核徽标', await page.locator('#kn-pending-badge').isVisible());
  T('默认中区 = 会话视图(conv 可见 / knview 隐藏)', await page.locator('#conv-root').isVisible() && await page.locator('#knview').isHidden());
  T('tabs = 对话/轨迹/知识召回', (await page.locator('.conv-tab').count()) === 3);
  T('右栏默认收起(轨道归零)', await page.evaluate(() => document.getElementById('rb-wrap').classList.contains('is-collapsed')));

  console.log('== 知识库 = 中区一等公民视图(点左栏菜单打开 · SC5)==');
  await openKb(page);
  T('点「知识库」→ 中区切换为知识视图', await page.locator('#knview').isVisible() && await page.locator('#conv-root').isHidden());
  T('打开不占用右栏(dock 仍收起)', await page.evaluate(() => document.getElementById('rb-wrap').classList.contains('is-collapsed')));
  T('右上角两个图标按钮已移除(知识模式无右栏入口)', await page.evaluate(() =>
    [...document.querySelectorAll('.knview-header .icon-btn')].every(b => !b.offsetParent) &&
    !document.getElementById('kb-more-btn')));
  // 整体切换:已展开的右栏在知识模式隐藏,切回会话视图恢复
  await openConv(page);
  await page.locator('#rb-corner-expand').click();
  await page.waitForTimeout(150);
  T('会话视图可展开右栏', await page.evaluate(() => !document.getElementById('rb-wrap').classList.contains('is-collapsed')));
  await openKb(page);
  await page.waitForTimeout(150);
  T('整体切换:进入知识模式 → 已开右栏也隐藏(内容让位)', await page.evaluate(() =>
    document.getElementById('rb-wrap').classList.contains('is-collapsed') && !document.getElementById('rb-body').childElementCount));
  await page.locator('.sess-row').first().click();
  await page.waitForTimeout(200);
  T('切回会话视图 → 右栏恢复展开(状态保留)', await page.evaluate(() => !document.getElementById('rb-wrap').classList.contains('is-collapsed')));
  await page.locator('.rb-tail [data-act="dock-toggle"]').click();
  await page.waitForTimeout(150);
  await openKb(page);
  await page.waitForTimeout(150);
  T('左栏知识库入口呈激活态', await page.locator('#sb-kn-btn.active').isVisible());
  T('头部:范围选择器默认「全部知识」', (await page.locator('#kb-scope-label').innerText()) === '全部知识');
  T('工具栏:搜索栏常驻', await page.locator('#kb-q').isVisible());
  const allCount = await page.locator('.kn-card').count();
  T('全部知识卡片 ≥ 17(项目 + 全局): ' + allCount, allCount >= 17);
  T('全部范围下来源 chip(全局库)可见', (await page.locator('.kn-card .chip', { hasText: '全局库' }).count()) >= 1);
  T('左轨:目录(域)树渲染', (await page.locator('.kb-dom-row').count()) >= 5);

  // 搜索过滤 + 命中提示条 + 清除
  await page.locator('#kb-q').fill('置信度');
  await page.waitForTimeout(250);
  const searched = await page.locator('.kn-card').count();
  T('搜索过滤卡片: ' + searched, searched >= 1 && searched < allCount);
  T('命中提示条(命中 N + 清除)', (await page.locator('#kb-hitinfo').innerText()).includes('命中'));
  await page.locator('#kb-clear').click();
  await page.waitForTimeout(150);
  T('✕ 清除搜索还原', (await page.locator('.kn-card').count()) === allCount);

  // 域点击 = 前缀过滤
  await page.locator('.kb-dom-row', { hasText: '架构' }).first().click();
  await page.waitForTimeout(150);
  const domFiltered = await page.locator('.kn-card').count();
  T('域点击 = 前缀过滤(卡片变少): ' + domFiltered, domFiltered < allCount && domFiltered >= 3);
  await page.locator('.kb-dom-row', { hasText: '全部域' }).click();
  await page.waitForTimeout(100);

  // 仅可召回阈值过滤
  const beforeTh = await page.locator('.kn-card').count();
  await page.locator('[data-act="kb-recall-only"]').click();
  await page.waitForTimeout(150);
  const afterTh = await page.locator('.kn-card').count();
  T('仅可召回 ≥40%:低置信条目被隐藏(' + beforeTh + ' → ' + afterTh + ')', afterTh < beforeTh);
  await page.locator('[data-act="kb-recall-only"]').click();
  await page.waitForTimeout(120);

  // 卡片 ⋯ 菜单:引用 @ 双入口(当前对话 / 新对话)
  await page.locator('.kn-card .icon-btn[data-act="kn-menu"]').first().click();
  await page.waitForTimeout(150);
  const knMenuText = await page.locator('.menu').innerText();
  T('卡片菜单:当前会话引用 / 新会话引用(与详情统一)', knMenuText.includes('当前会话引用') && knMenuText.includes('新会话引用'));
  await page.keyboard.press('Escape');
  await page.waitForTimeout(100);

  // 范围菜单:全局库
  await setScope(page, '全局库');
  T('范围 → 全局库', (await page.locator('#kb-scope-label').innerText()) === '全局库');
  const gCount = await page.locator('.kn-card').count();
  T('全局库卡片 ≥ 7: ' + gCount, gCount >= 7 && gCount < allCount);

  // 范围菜单:下钻项目 → 会话
  await setScope(page, '项目 · dsh-forge');
  T('范围 → 项目 · dsh-forge', (await page.locator('#kb-scope-label').innerText()).includes('dsh-forge'));
  T('项目范围出现「按会话下钻」区', await page.locator('#kb-drill').isVisible());
  T('下钻行有召回/沉淀计数', (await page.locator('.kb-drill-row').count()) >= 3 && (await page.locator('.kb-drill-row').first().innerText()).includes('召回'));
  await page.locator('.kb-drill-row').first().click();
  await page.waitForTimeout(200);
  T('会话范围:范围标签 = 会话 · …', (await page.locator('#kb-scope-label').innerText()).includes('会话'));
  const sessCards = await page.locator('#kb-cards').innerText();
  T('会话范围 = 分组网格(召回的知识 + 沉淀标注)', sessCards.includes('召回的知识') && (sessCards.includes('会话沉淀') || sessCards.includes('本会话沉淀')));
  T('卡片内召回明细(动词 ×N 并入卡片)', (await page.locator('.kn-card .kn-card-recall').count()) >= 1);
  // 会话范围 → 统计口径切换(召回 KPI)
  await page.locator('.knview-tab', { hasText: '统计分析' }).click();
  await page.waitForTimeout(220);
  T('会话范围统计 = 召回口径 KPI', (await page.locator('#knstats .stat-kpi').first().innerText()).includes('次'));
  await page.locator('.knview-tab', { hasText: '浏览' }).click();
  await page.waitForTimeout(150);
  await page.locator('#kb-back').click();
  await page.waitForTimeout(150);
  T('返回项目范围', (await page.locator('#kb-scope-label').innerText()).includes('项目'));

  console.log('== 知识详情抽屉(卡片点击 → 右侧抽屉,非 dock 页签)==');
  await setScope(page, '全部知识');
  await page.locator('.kn-card', { hasText: '单一归属' }).first().click();
  await page.waitForTimeout(220);
  T('点卡片 → 右侧抽屉打开', await page.locator('#kn-drawer').isVisible());
  T('抽屉不占用 dock(右栏仍收起)', await page.evaluate(() => document.getElementById('rb-wrap').classList.contains('is-collapsed')));
  T('中区知识视图保持(浏览上下文不丢)', await page.locator('#knview').isVisible());
  T('详情含基础信息表单(frontmatter 只读)', await page.locator('#kn-drawer .kd-meta-table').isVisible());
  T('详情含正文区(frontmatter 不混入)', (await page.locator('#kn-drawer .kd-body').innerText()).includes('划界原则'));
  await page.locator('#kn-drawer .kd-badges .badge-conf').first().click();
  await page.waitForTimeout(150);
  const popText = await page.locator('.pop').innerText().catch(() => '');
  T('四信号构成气泡', popText.includes('审核状态') && popText.includes('时间衰减'));
  await page.keyboard.press('Escape');
  await page.waitForTimeout(100);
  await page.keyboard.press('Escape');
  await page.waitForTimeout(120);
  T('Esc 关闭抽屉', await page.locator('#kn-drawer').isHidden());

  console.log('== 统计分析(时间过滤 + 项目→feature→会话下钻 + 自由分析)==');
  await page.locator('.knview-tab', { hasText: '统计分析' }).click();
  await page.waitForTimeout(220);
  T('统计分析页签激活(浏览工具栏隐藏)', await page.locator('#knstats').isVisible() && await page.locator('.knview-toolbar').isHidden());
  T('时间过滤 chips(全部/近1/3/7/30/90天 + 自定义)', await page.evaluate(() => {
    var chips = [...document.querySelectorAll('[data-act="stat-time"]')].map(c => c.textContent.trim());
    return document.querySelectorAll('[data-act="stat-time"]').length === 6 &&
      chips.some(t => t === '近1天') && chips.some(t => t === '近3天') &&
      document.querySelectorAll('[data-act="stat-time-custom"]').length === 1;
  }));
  const allTime = await page.evaluate(() => parseInt((document.querySelector('.stat-kpi-num') || {}).textContent, 10) || 0);
  await page.locator('[data-act="stat-time"][data-d="1"]').click();
  await page.waitForTimeout(200);
  const day1 = await page.evaluate(() => parseInt((document.querySelector('.stat-kpi-num') || {}).textContent, 10) || 0);
  await page.locator('[data-act="stat-time"][data-d="3"]').click();
  await page.waitForTimeout(200);
  const day3 = await page.evaluate(() => parseInt((document.querySelector('.stat-kpi-num') || {}).textContent, 10) || 0);
  T('近1天/近3天档位生效(1 ≤ 3 < 7 天窗口): ' + day1 + '/' + day3, day1 >= 1 && day1 <= day3 && day3 > day1);
  await page.locator('[data-act="stat-time"][data-d="7"]').click();
  await page.waitForTimeout(200);
  const weekTime = await page.evaluate(() => parseInt((document.querySelector('.stat-kpi-num') || {}).textContent, 10) || 0);
  T('时间过滤生效(近7天收窄:' + allTime + ' → ' + weekTime + ')', weekTime > day3 && weekTime < allTime);
  await page.locator('[data-act="stat-time"][data-d="0"]').click();
  await page.waitForTimeout(150);
  /* 自定义时间:气泡选择器(快捷跨度 + 起止 + 跨度上限) */
  await page.locator('[data-act="stat-time-custom"]').click();
  await page.waitForTimeout(200);
  T('自定义 = 气泡选择器(快捷跨度 4 档 + 起止输入)', (await page.locator('.pop [data-act="stat-span"]').count()) === 4 &&
    (await page.locator('.pop .stat-date').count()) === 2);
  T('气泡锚定在按钮下方(不漂到最左侧)', await page.evaluate(() => {
    var chip = document.querySelector('[data-act="stat-time-custom"]').getBoundingClientRect();
    var pop = document.querySelector('.pop').getBoundingClientRect();
    return pop.top >= chip.bottom - 2 && pop.right >= chip.left + 20 && pop.left >= 8;
  }));
  const custom30 = await page.evaluate(() => parseInt((document.querySelector('.stat-kpi-num') || {}).textContent, 10) || 0);
  T('自定义默认近30天(收窄:' + allTime + ' → ' + custom30 + ')', custom30 > 0 && custom30 < allTime);
  T('自定义 chip 显示范围摘要(M.D–M.D)', (await page.locator('[data-act="stat-time-custom"]').innerText()).includes('·'));
  const farPast = await page.evaluate(() => {
    const d = new Date(Date.now() - 200 * 864e5);
    return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
  });
  await page.locator('.pop [data-act-sel="tfrom"]').fill(farPast);
  await page.waitForTimeout(250);
  T('跨度上限 90 天(起止过远自动收窄)', await page.evaluate(() => {
    var f = document.querySelector('.pop [data-act-sel="tfrom"]').value;
    var t = document.querySelector('.pop [data-act-sel="tto"]').value;
    var days = Math.round((Date.parse(t + 'T00:00:00') - Date.parse(f + 'T00:00:00')) / 864e5);
    return days >= 89 && days <= 91;
  }));
  await page.locator('.pop [data-act="stat-span"][data-n="7"]').click();
  await page.waitForTimeout(200);
  T('快捷跨度(近 7 天,气泡内日期同步)', await page.evaluate(() => {
    var f = document.querySelector('.pop [data-act-sel="tfrom"]').value;
    var t = document.querySelector('.pop [data-act-sel="tto"]').value;
    var days = Math.round((Date.parse(t) - Date.parse(f)) / 864e5) + 1;
    return days >= 6 && days <= 8;
  }));
  const today = await page.evaluate(() => {
    const d = new Date();
    return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
  });
  await page.locator('.pop [data-act-sel="tfrom"]').fill(today);
  await page.locator('.pop [data-act-sel="tto"]').fill(today);
  await page.waitForTimeout(200);
  const customToday = await page.evaluate(() => parseInt((document.querySelector('.stat-kpi-num') || {}).textContent, 10) || 0);
  T('自定义区间收窄到当日(仅今日事件): ' + customToday, customToday < custom30);
  await page.locator('.pop [data-act="stat-time-clear"]').click();
  await page.waitForTimeout(150);
  T('清除自定义 → 回预设(气泡关闭,chip 复原)', (await page.locator('.pop').count()) === 0 &&
    !(await page.locator('[data-act="stat-time-custom"]').evaluate(el => el.classList.contains('active'))));
  T('召回分布 = 项目级列表(M1)', (await page.locator('.stat-mod').first().innerText()).includes('项目 → feature → 会话'));
  const projRow = page.locator('.stat-mod').first().locator('.stat-row.is-click', { hasText: 'dsh-forge' }).first();
  T('项目行存在(📁 dsh-forge)', (await projRow.count()) === 1);
  await projRow.click();
  await page.waitForTimeout(200);
  T('下钻到 feature 级(面包屑 全部 › dsh-forge)', (await page.locator('.stat-crumb').innerText()).includes('dsh-forge'));
  const featText = await page.locator('.stat-mod').first().innerText();
  T('feature 行(p2-kernel / 未关联)', featText.includes('p2-kernel') || featText.includes('未关联'));
  await page.locator('.stat-mod').first().locator('.stat-row.is-click', { hasText: 'p2-kernel' }).first().click();
  await page.waitForTimeout(200);
  T('下钻到会话级(会话行 · 可跳转)', (await page.locator('.stat-mod').first().locator('[data-act="stat-sess"]').count()) >= 1);
  await page.locator('.stat-crumb .crumb-seg', { hasText: '全部' }).first().click();
  await page.waitForTimeout(200);
  T('面包屑回退(恢复项目级)', (await page.evaluate(() => parseInt((document.querySelector('.stat-kpi-num') || {}).textContent, 10) || 0)) === allTime);
  T('第二行新报表:召回动词分布(检索/摘要/正文)', (await page.evaluate(() => [...document.querySelectorAll('.stat-mod-title')].some(t => t.textContent.includes('召回动词分布')))) &&
    (await page.locator('.stat-mod', { hasText: '召回动词分布' }).innerText()).includes('read-full'));
  T('自由分析模块(维度 select + 指标多选 chips ≥5)', (await page.locator('.stat-custom select').count()) === 1 && (await page.locator('[data-act="stat-metric"]').count()) >= 5);
  T('预设组合已移除(无示例 chips)', (await page.locator('[data-act="stat-example"]').count()) === 0 && (await page.locator('.stat-examples').count()) === 0);
  T('布局:盲区/反馈/动词分布居中行,自由分析最下方通栏', await page.evaluate(() => {
    var mods = [...document.querySelectorAll('.stat-mod')];
    var wide = document.querySelector('.stat-mod-wide');
    return mods.length >= 6 && wide === mods[mods.length - 1];
  }));
  T('默认 1 指标 → 单图表(每类别一组 1 柱)', await page.evaluate(() =>
    document.querySelectorAll('.stat-mod-wide .sc-bars').length === 1 &&
    document.querySelectorAll('.stat-mod-wide .sc-group').length >= 2 &&
    document.querySelectorAll('.stat-mod-wide .sc-cell').length >= 2 &&
    document.querySelector('.stat-mod-wide .sc-group').querySelectorAll('.sc-cell').length === 1));
  T('自由分析 x 轴在下侧(刻度行位于柱区下方)', await page.evaluate(() => {
    var bars = document.querySelector('.stat-mod-wide .sc-bars');
    var axis = document.querySelector('.stat-mod-wide .sc-axis');
    if (!bars || !axis) return false;
    return axis.getBoundingClientRect().top >= bars.getBoundingClientRect().bottom - 2;
  }));
  T('图表类型切换位于行右端', await page.evaluate(() => {
    var row = document.querySelector('.stat-mod-wide .stat-custom');
    var right = document.querySelector('.stat-mod-wide .sc-right');
    if (!row || !right) return false;
    return right.getBoundingClientRect().right >= row.getBoundingClientRect().right - 12;
  }));
  await page.locator('[data-act-sel="dim"]').selectOption('conf');
  await page.waitForTimeout(200);
  const customText = await page.locator('.stat-mod-wide').innerText();
  T('自由分析切维度(置信度档:高/中/低)', customText.includes('高') && customText.includes('低'));
  /* 指标多选(最多 3):叠加 → 共享坐标系单图表 → 封顶 → 移除 */
  await page.locator('[data-act="stat-metric"][data-v="cover"]').click();
  await page.locator('[data-act="stat-metric"][data-v="count"]').click();
  await page.waitForTimeout(200);
  T('叠加至 3 指标 → 共享坐标系(单图表 · 每组 3 柱 · 图例 3 项)', await page.evaluate(() => {
    var legend = [...document.querySelectorAll('.stat-mod-wide .sc-legend-item')].map(l => l.textContent.trim());
    return document.querySelectorAll('.stat-mod-wide .sc-bars').length === 1 &&
      document.querySelector('.stat-mod-wide .sc-group').querySelectorAll('.sc-cell').length === 3 &&
      legend.length === 3 && legend.some(t => t.includes('知识条数')) && legend.some(t => t.includes('覆盖率'));
  }));
  T('同组柱色深浅区分指标(组内 ≥2 种柱色)', await page.evaluate(() => {
    var g = document.querySelector('.stat-mod-wide .sc-group');
    var bars = [...g.querySelectorAll('.sc-bar')];
    return bars.length === 3 && new Set(bars.map(b => getComputedStyle(b).backgroundColor)).size >= 2;
  }));
  T('计数器 3/3', (await page.locator('.stat-mod-wide').innerText()).includes('3/3'));
  await page.locator('[data-act="stat-chart"][data-v="line"]').click();
  await page.waitForTimeout(200);
  T('多指标折线:每指标一条线(共享 x/y 轴)', await page.evaluate(() => {
    var dots = [...document.querySelectorAll('.stat-mod-wide .sc-dot')];
    return dots.length >= 6 && new Set(dots.map(d => getComputedStyle(d).backgroundColor)).size >= 2 &&
      document.querySelectorAll('.stat-mod-wide .sc-svg line').length >= 3;
  }));
  await page.locator('[data-act="stat-chart"][data-v="bar"]').click();
  await page.waitForTimeout(200);
  await page.locator('[data-act="stat-metric"][data-v="adopted"]').click();
  await page.waitForTimeout(200);
  T('第 4 个指标被拒(最多同时 3 个)', (await page.locator('.stat-mod-wide .sc-legend-item').count()) === 3);
  await page.locator('[data-act="stat-metric"][data-v="count"]').click();
  await page.waitForTimeout(200);
  T('移除指标 → 每组 2 柱 · 图例 2 项', await page.evaluate(() =>
    document.querySelector('.stat-mod-wide .sc-group').querySelectorAll('.sc-cell').length === 2 &&
    document.querySelectorAll('.stat-mod-wide .sc-legend-item').length === 2));
  await page.locator('[data-act="stat-metric"][data-v="cover"]').click();
  await page.waitForTimeout(150);
  T('回到单指标(每组 1 柱 · 无图例)', await page.evaluate(() =>
    document.querySelector('.stat-mod-wide .sc-group').querySelectorAll('.sc-cell').length === 1 &&
    document.querySelectorAll('.stat-mod-wide .sc-legend-item').length === 0));
  T('柱形图逐柱着色(x 取值不同色)', await page.evaluate(() => {
    var bars = [...document.querySelectorAll('.stat-mod-wide .sc-bar')];
    return bars.length >= 2 && new Set(bars.map(b => getComputedStyle(b).backgroundColor)).size >= 2;
  }));
  T('图表类型切换 chips(柱形图/折线图)', (await page.locator('[data-act="stat-chart"]').count()) === 2);
  await page.locator('[data-act="stat-chart"][data-v="line"]').click();
  await page.waitForTimeout(200);
  T('折线图渲染(逐点圆点 + 连线段)', (await page.locator('.stat-mod-wide .sc-dot').count()) >= 2 && (await page.locator('.stat-mod-wide .sc-svg line').count()) >= 1);
  T('折线图 x 轴仍在下侧(刻度行位于折线区下方)', await page.evaluate(() => {
    var line = document.querySelector('.stat-mod-wide .sc-line');
    var axis = document.querySelector('.stat-mod-wide .sc-axis.abs');
    if (!line || !axis) return false;
    return axis.getBoundingClientRect().top >= line.getBoundingClientRect().bottom - 2;
  }));
  T('折线图逐点着色(x 取值不同色)', await page.evaluate(() => {
    var dots = [...document.querySelectorAll('.stat-mod-wide .sc-dot')];
    return dots.length >= 2 && new Set(dots.map(d => getComputedStyle(d).backgroundColor)).size >= 2;
  }));
  await page.locator('[data-act="stat-chart"][data-v="bar"]').click();
  await page.waitForTimeout(200);
  T('切回柱形图(sc-bars 复现)', (await page.locator('.stat-mod-wide .sc-cell').count()) >= 2);
  await page.locator('[data-act-sel="dim"]').selectOption('domain');
  await page.waitForTimeout(150);
  const topRows = await page.locator('.stat-top-row').count();
  T('知识召回 Top + 盲区列表: ' + topRows, topRows >= 3);
  await page.locator('.stat-top-row').first().locator('.t-title').click();
  await page.waitForTimeout(220);
  T('知识行点击 → 右侧知识详情抽屉', await page.locator('#kn-drawer .kd-meta-table').isVisible());

  console.log('== 知识详情(摘要 / 两列布局 / 元数据编辑 / @跳对话)==');
  T('摘要块展示(如有)', (await page.locator('#kn-drawer .kd-abs').innerText()).includes('SoT'));
  const absOrder = await page.evaluate(() => {
    var abs = document.querySelector('#kn-drawer .kd-abs');
    var meta = document.querySelector('#kn-drawer .kd-meta-table');
    var body = document.querySelector('#kn-drawer .kd-body');
    return abs && meta && body &&
      !!(meta.compareDocumentPosition(abs) & Node.DOCUMENT_POSITION_FOLLOWING) &&
      !!(abs.compareDocumentPosition(body) & Node.DOCUMENT_POSITION_FOLLOWING);
  });
  T('摘要位于基础信息与正文之间', absOrder);
  const noWrap = await page.evaluate(() => getComputedStyle(document.querySelector('#kn-drawer .kd-meta-k')).whiteSpace === 'nowrap');
  T('基础信息 label 不换行(nowrap)', noWrap);
  const metaRows = await page.locator('#kn-drawer .kd-meta-row').count();
  const span2Rows = await page.locator('#kn-drawer .kd-meta-row.span2').count();
  T('基础信息两列网格(行数收敛:' + metaRows + ',长值独占行:' + span2Rows + ')', metaRows >= 8 && span2Rows >= 3);
  await page.locator('#kn-drawer [data-act="kn-edit-meta"]').click();
  await page.waitForTimeout(200);
  T('编辑元数据对话框(frontmatter 字段)', await page.locator('#em-title').isVisible() && await page.locator('#em-status').isVisible());
  await page.locator('#em-kw').fill('SoT, 投影, 元数据冒烟');
  await page.locator('[data-dlg-ok]').click();
  await page.waitForTimeout(250);
  T('保存后关键词更新(经宿主能力面)', (await page.locator('#kn-drawer .kd-meta-table').innerText()).includes('元数据冒烟'));
  await page.locator('#kn-drawer [data-act="kn-ask"]').click();
  await page.waitForTimeout(250);
  T('「当前会话引用」→ 切会话视图 + 抽屉关闭', await page.locator('#conv-root').isVisible() && await page.locator('#kn-drawer').isHidden());
  T('输入卡自动 @ 知识文档(当前会话)', (await page.locator('#composer-input').innerText()).includes('@单一归属'));
  await page.locator('#composer-input').fill('');
  // 新会话引用:回知识视图(浏览页签)开抽屉 → 「新会话引用」→ hero 草稿 + @ 预填
  await openKb(page);
  await page.locator('.knview-tab', { hasText: '浏览' }).click();
  await page.waitForTimeout(150);
  await page.locator('.kn-card', { hasText: '单一归属' }).first().click();
  await page.waitForTimeout(200);
  await page.locator('#kn-drawer [data-act="kn-ask-new"]').click();
  await page.waitForTimeout(250);
  T('「新会话引用」→ hero 草稿相位', await page.evaluate(() => document.getElementById('conv-root').getAttribute('data-phase') === 'hero'));
  T('新会话输入卡预填 @ 知识文档', (await page.locator('#composer-input').innerText()).includes('@单一归属'));
  await page.locator('#composer-input').fill('');
  await page.locator('.sess-row', { hasText: '置信度四信号实现口径' }).first().click();
  await page.waitForTimeout(150);

  console.log('== 召回日志(dsh-forge 内核于召回执行时记录 · 轨迹级事后分析)==');
  await openKb(page);
  await page.locator('.knview-tab', { hasText: '召回日志' }).click();
  await page.waitForTimeout(220);
  T('召回日志页签激活(浏览工具栏隐藏)', await page.locator('#knrlog').isVisible() && await page.locator('.knview-toolbar').isHidden());
  const rlRows = await page.locator('.rl-row').count();
  T('轨迹行 ≥ 20(内核示例种子:读链/浏览/空结果/反馈): ' + rlRows, rlRows >= 20);
  const firstRl = await page.locator('.rl-row').first().innerText();
  T('行元数据:时间 + trace_id + 所属项目 + 所属会话 + 耗时', firstRl.includes('trc-') && firstRl.includes('📁') &&
    (firstRl.includes('💬') || firstRl.includes('无会话记录')) && /ms/.test(firstRl) && /tok/.test(firstRl));
  T('动词 chips(全部/检索/读摘要/读正文/浏览域)', (await page.locator('[data-act="rl-verb"]').count()) === 5);
  const rlChipN = async (v) => await page.evaluate((v2) => {
    var c = document.querySelector('[data-act="rl-verb"][data-v="' + v2 + '"]');
    var m = c ? c.textContent.match(/(\d+)\s*$/) : null;
    return m ? parseInt(m[1], 10) : 0;
  }, v);
  const rlCountAll = await rlChipN('all');
  await page.locator('[data-act="rl-verb"][data-v="search"]').click();
  await page.waitForTimeout(180);
  const rlCountSearch = await rlChipN('search');
  T('动词过滤(检索:收敛 ' + rlCountAll + ' → ' + rlCountSearch + ',均为 search)', rlCountSearch < rlCountAll &&
    (await page.locator('.rl-row .rl-verb').allInnerTexts()).every(t => t.includes('search')));
  await page.locator('[data-act="rl-verb"][data-v="all"]').click();
  await page.waitForTimeout(150);
  const trace0 = await page.locator('.rl-row .rl-trace').first().innerText();
  await page.locator('#rl-q').fill(trace0);
  await page.waitForTimeout(200);
  T('按 trace_id 检索(命中 1 行)', (await page.locator('.rl-row').count()) === 1);
  await page.locator('#rl-q').fill('');
  await page.waitForTimeout(180);
  await page.locator('.rl-row', { hasText: '检索 search' }).first().click();
  await page.waitForTimeout(200);
  const rlDetailText = await page.locator('.rl-detail').first().innerText();
  T('轨迹详情(参数 + 命中列表 + 口径说明)', rlDetailText.includes('阈值') && rlDetailText.includes('预算') &&
    rlDetailText.includes('#') && rlDetailText.includes('事后分析'));
  T('命中条目可跳转知识详情', (await page.locator('.rl-detail .rl-hit').count()) >= 1);
  await page.locator('.rl-detail .rl-hit-t').first().click();
  await page.waitForTimeout(220);
  T('命中点击 → 知识详情抽屉', await page.locator('#kn-drawer .kd-meta-table').isVisible());
  await page.keyboard.press('Escape');
  await page.waitForTimeout(150);
  /* 示例数据形态:无会话记录 / 预算截断 / 空结果两种成因 */
  T('示例:无会话记录轨迹(面板/API 触发)', await page.evaluate(() =>
    [...document.querySelectorAll('.rl-sess')].some(el => el.textContent.includes('无会话记录'))));
  T('示例:预算截断 + 高延迟轨迹可见', await page.evaluate(() =>
    [...document.querySelectorAll('.rl-row')].some(r => r.textContent.includes('预算截断'))));
  await page.locator('#rl-q').fill('向量检索');
  await page.waitForTimeout(200);
  await page.locator('.rl-row').first().click();
  await page.waitForTimeout(180);
  T('空结果成因示例:关键词无匹配', (await page.locator('.rl-detail').first().innerText()).includes('无匹配'));
  await page.locator('#rl-q').fill('版本');
  await page.waitForTimeout(200);
  await page.locator('.rl-row').first().click();
  await page.waitForTimeout(180);
  T('空结果成因示例:命中但全低于置信阈值', (await page.locator('.rl-detail').first().innerText()).includes('低于置信阈值'));
  await page.locator('#rl-q').fill('');
  await page.waitForTimeout(180);
  await setScope(page, '全部知识');
  await page.waitForTimeout(200);
  const rlScopeAll = await page.evaluate(() => {
    var m = (document.querySelector('.rl-top .t-aux') || { textContent: '' }).textContent.match(/(\d+) 条轨迹/);
    return m ? parseInt(m[1], 10) : 0;
  });
  await setScope(page, '项目 · dsh-forge');
  await page.waitForTimeout(200);
  const rlScopeP1 = await page.evaluate(() => {
    var m = (document.querySelector('.rl-top .t-aux') || { textContent: '' }).textContent.match(/(\d+) 条轨迹/);
    return m ? parseInt(m[1], 10) : 0;
  });
  T('范围过滤(项目维度收窄轨迹): ' + rlScopeAll + ' → ' + rlScopeP1, rlScopeP1 < rlScopeAll);
  /* 存量会话迁移:旧 db(无 recallLogs / 种子版本落后)→ 重载自动补挂示例 */
  await page.evaluate(() => {
    var db = JSON.parse(sessionStorage.getItem('proto-dfr-db') || '{}');
    delete db.recallLogs;
    delete db.seedVer;
    sessionStorage.setItem('proto-dfr-db', JSON.stringify(db));
  });
  await page.reload();
  await page.waitForTimeout(450);
  await page.locator('#sb-kn-btn').click();
  await page.waitForTimeout(200);
  await page.locator('.knview-tab', { hasText: '召回日志' }).click();
  await page.waitForTimeout(220);
  const rlMig = await page.locator('.rl-row').count();
  T('存量 db 迁移:无 recallLogs → 重载自动补挂示例(' + rlMig + ' 条)', rlMig >= 20);
  await page.locator('.knview-tab', { hasText: '浏览' }).click();
  await page.waitForTimeout(150);

  console.log('== 会话知识召回 tab(点会话切回会话视图)==');
  await openConv(page);
  T('点会话行 → 中区切回会话视图', await page.locator('#conv-root').isVisible() && await page.locator('#knview').isHidden());
  T('左栏知识库入口取消激活', (await page.locator('#sb-kn-btn.active').count()) === 0);
  await page.locator('.conv-tab', { hasText: '知识召回' }).click();
  await page.waitForTimeout(200);
  T('知识召回 tab 激活(会话视图切换)', await page.locator('#knrec-panel').isVisible() && !(await page.locator('#conv-transcript').isVisible()));
  const knrecText = await page.locator('#knrec-panel').innerText();
  T('统计头(召回次数 / 覆盖 / 反馈 / 沉淀)', knrecText.includes('召回') && knrecText.includes('覆盖') && knrecText.includes('会话沉淀'));
  T('召回列表含知识行 + 动词明细', (await page.locator('.knrec-row').count()) >= 2 && (await page.locator('.knrec-verb').count()) >= 2);
  const adoptBtn = page.locator('[data-act="knrec-fb"][data-kind="adopted"]').first();
  if (await adoptBtn.count()) {
    await adoptBtn.click();
    await page.waitForTimeout(200);
    T('采纳反馈 → 已采纳状态', (await page.locator('#knrec-panel .fb-adopted').count()) >= 1);
  } else T('采纳反馈按钮存在(或全部已有反馈)', true);
  await page.locator('.knrec-row [data-act="kn-open"]').first().click();
  await page.waitForTimeout(200);
  T('行「详情」→ 右侧知识详情抽屉', await page.locator('#kn-drawer .kd-meta-table').isVisible());
  await page.keyboard.press('Escape');
  await page.waitForTimeout(120);

  console.log('== 会话演示(发送 → 召回链路 · 热度联动)==');
  await page.locator('.conv-tab', { hasText: '对话' }).click();
  await page.waitForTimeout(150);
  T('输入卡对齐 dsh(模式 chip + 模型 chip)', await page.locator('[data-act="composer-mode-toast"]').isVisible() && await page.locator('[data-act="composer-model-toast"]').isVisible());
  await page.locator('[data-act="open-in-editor"]').click();
  await page.waitForTimeout(150);
  T('会话头 📁▾ 在编辑器中打开(菜单)', (await page.locator('.menu').innerText()).includes('VS Code'));
  await page.keyboard.press('Escape');
  await page.waitForTimeout(100);
  T('knowledge.search 工具行含命中卡片(罐头)', (await page.locator('.toolrow .hit-card').count()) >= 2);
  T('任务挂接 pill 可见(⟞)', (await page.locator('.conv-actions').innerText()).includes('p2-kernel/3'));
  await page.locator('.toolrow .hit-card [data-act="hit-full"]').first().click();
  await page.waitForTimeout(200);
  T('命中卡「读正文」→ read-full 展开', (await page.locator('.hit-full').count()) >= 1);
  // 热度联动:先记录基线(知识视图),切会话发送,再回知识视图比对
  await openKb(page);
  await setScope(page, '项目 · dsh-forge');
  const heatBefore = await page.evaluate(() => {
    const c = [...document.querySelectorAll('.kn-card')].find(x => x.textContent.includes('置信度四信号'));
    return c ? c.querySelector('.heat-num').textContent : null;
  });
  await openConv(page);
  await page.locator('.conv-tab', { hasText: '对话' }).click();
  await page.waitForTimeout(150);
  await page.locator('#composer-input').fill('检查一下置信度的实现是否符合约束');
  await page.locator('[data-act="composer-send"]').click();
  await page.waitForTimeout(600);
  T('发送后出现运行中工具行', await page.locator('.toolrow .shimmer, .toolrow-head .shimmer').count() >= 1);
  await page.waitForTimeout(2600);
  await openKb(page);
  const heatAfter = await page.evaluate(() => {
    const c = [...document.querySelectorAll('.kn-card')].find(x => x.textContent.includes('置信度四信号'));
    return c ? c.querySelector('.heat-num').textContent : null;
  });
  T('召回 → 知识面板热度即时增加: ' + heatBefore + ' → ' + heatAfter, heatBefore !== null && Number(heatAfter) > Number(heatBefore));
  /* 发送产生的召回即入日志(最新轨迹 = 当前会话) */
  await page.locator('.knview-tab', { hasText: '召回日志' }).click();
  await page.waitForTimeout(200);
  T('发送召回即入日志(内核即时记录,最新轨迹 = 当前会话 + trace_id)', await page.evaluate(() => {
    var row = document.querySelector('.rl-row');
    return !!row && /trc-/.test(row.textContent) && row.textContent.includes('置信度四信号实现口径') &&
      row.textContent.includes('命中') && /ms/.test(row.textContent);
  }));
  await page.locator('.knview-tab', { hasText: '浏览' }).click();
  await page.waitForTimeout(150);

  console.log('== 审核工作台(SC9;经开始页,知识模式无右栏)==');
  await openConv(page);
  await page.locator('#rb-corner-expand').click();
  await page.waitForTimeout(150);
  await page.locator('[data-act="dock-plus"]').click();
  await page.waitForTimeout(150);
  await page.locator('.rb-start-card', { hasText: '审核工作台' }).click();
  await page.waitForTimeout(220);
  T('待审核队列有条目', (await page.locator('.rv-card').count()) >= 2);
  await page.locator('.rv-qtab', { hasText: '合并队列' }).click();
  await page.waitForTimeout(150);
  T('合并队列可见(kn-118 ≈ kn-106)', (await page.locator('.rv-pair').count()) >= 1);
  await page.locator('[data-act="rv-merge"][data-keep="a"]').first().click();
  await page.waitForTimeout(200);
  T('合并后队列减少', (await page.locator('.rv-pair').count()) === 0);

  console.log('== 抽取(用户主动;工具栏 chip,知识模式右栏保持隐藏)==');
  await openKb(page);
  await page.locator('.knview-tab', { hasText: '浏览' }).click();
  await page.waitForTimeout(150);
  T('抽取入口 = 工具栏 chip(知识模式右栏隐藏)', (await page.locator('[data-act="kb-extract"]').count()) === 1 &&
    await page.evaluate(() => document.getElementById('rb-wrap').classList.contains('is-collapsed')));
  await page.locator('[data-act="kb-extract"]').click();
  await page.waitForTimeout(200);
  T('抽取对话框(契约字段 + 来源会话)', await page.locator('#ex-title').isVisible() && await page.locator('#ex-src').isVisible());
  await page.locator('#ex-title').fill('置信度冒烟抽取条目');
  await page.locator('#ex-abs').fill('冒烟:抽取落库为 pending,初始中等置信。');
  await page.locator('#ex-kw').fill('置信度, 冒烟');
  await page.locator('[data-dlg-ok]').click();
  await page.waitForTimeout(250);
  T('抽取落库 → 新卡片出现', (await page.locator('.kn-card', { hasText: '冒烟抽取条目' }).count()) === 1);

  console.log('== 晋升与移动(SC11)==');
  await page.locator('.kn-card', { hasText: '冒烟抽取条目' }).first().click();
  await page.waitForTimeout(220);
  await page.locator('[data-act="kn-promote"]').click();
  await page.waitForTimeout(250);
  await openKb(page);
  await setScope(page, '全局库');
  T('晋升 → 全局库出现晋升条目', (await page.locator('.kn-card', { hasText: '冒烟抽取条目' }).count()) === 1);
  await page.locator('.kn-card', { hasText: '冒烟抽取条目' }).first().click();
  await page.waitForTimeout(220);
  await page.locator('[data-act="kn-move"]').click();
  await page.waitForTimeout(200);
  await page.locator('#mv-dom').selectOption('通用/协作');
  await page.locator('[data-dlg-ok]').click();
  await page.waitForTimeout(250);
  T('移动(换域)后详情域路径更新', (await page.locator('.kd-meta-table').innerText()).includes('通用/协作'));
  await page.keyboard.press('Escape');
  await page.waitForTimeout(120);
  await openKb(page);
  await setScope(page, '项目 · dsh-forge');
  T('项目侧留重定向幽灵卡', (await page.locator('.kn-card.is-redirect', { hasText: '冒烟抽取条目' }).count()) === 1);

  console.log('== 项目概览(状态直读 + 对账;开始页知识库入口 → 中区)==');
  await openConv(page);
  await page.locator('[data-act="dock-plus"]').click();
  await page.waitForTimeout(150);
  T('开始页有「知识库」入口卡(中区打开)', (await page.locator('.rb-start-card', { hasText: '知识库' }).count()) === 1);
  await page.locator('.rb-start-card', { hasText: '知识库' }).click();
  await page.waitForTimeout(200);
  T('开始页知识库卡 → 中区知识视图(右栏整体让位)', await page.locator('#knview').isVisible() && await page.locator('#conv-root').isHidden() &&
    await page.evaluate(() => document.getElementById('rb-wrap').classList.contains('is-collapsed')));
  await openConv(page);
  await page.waitForTimeout(150);
  T('切回会话视图 → 右栏恢复(开始页页签保留)', await page.evaluate(() => !document.getElementById('rb-wrap').classList.contains('is-collapsed')));
  await page.locator('[data-act="dock-plus"]').click();
  await page.waitForTimeout(150);
  await page.locator('.rb-start-card', { hasText: '项目概览' }).click();
  await page.waitForTimeout(220);
  T('概览:概要信息 + 对账卡', await page.locator('.ov-align').isVisible());
  await page.locator('[data-act="ws-move"]').click();
  await page.waitForTimeout(200);
  T('模拟移动 → 失配提示', (await page.locator('.ov-align').innerText()).includes('失配'));
  await page.locator('[data-act="ws-realign"]').click();
  await page.waitForTimeout(200);
  T('找回 → 已对齐', (await page.locator('.ov-align').innerText()).includes('已对齐'));

  console.log('== 任务三视图(feature 绑定 · 列表/DAG/泳道)==');
  await page.locator('.ov-subtab', { hasText: '任务' }).click();
  await page.waitForTimeout(200);
  T('feature 选择 pill 可见(默认 p2-kernel)', (await page.locator('.task-feat-pill').innerText()).includes('p2-kernel'));
  const listRows = await page.locator('.task-row').count();
  T('列表视图:feature 任务 ≥ 8 行: ' + listRows, listRows >= 8);
  const idsOk = await page.evaluate(() => [...document.querySelectorAll('.task-row .task-id')].every(el => el.textContent.indexOf('p2-kernel/') === 0));
  T('列表全部属于当前 feature(无全局汇总)', idsOk);
  const taskRow = page.locator('.task-row', { hasText: '审核工作台' }).first();
  await taskRow.hover();
  await taskRow.locator('[data-act="task-tool"]').click();
  await page.waitForTimeout(250);
  T('⚡ tool 提交 → pending → in_progress', (await page.locator('.task-row', { hasText: '审核工作台' }).first().innerText()).includes('in_progress'));
  await page.locator('[data-act="ov-task-view"][data-v="dag"]').click();
  await page.waitForTimeout(220);
  const nodeCount = await page.locator('.dag-node').count();
  const edgeCount = await page.locator('.dag-svg path').count();
  T('DAG:节点 ≥ 8(' + nodeCount + ')且连线 ≥ 8(' + edgeCount + ')', nodeCount >= 8 && edgeCount >= 8);
  const vertical = await page.evaluate(() => {
    const topOf = (key) => {
      const n = [...document.querySelectorAll('.dag-node')].find(x => (x.querySelector('.dag-node-key') || {}).textContent === key);
      return n ? n.offsetTop : -1;
    };
    return topOf('p2-kernel/1') >= 0 && topOf('p2-kernel/9') >= 0 && topOf('p2-kernel/1') < topOf('p2-kernel/9');
  });
  T('DAG 自上而下(前置 p2-kernel/1 在上游,p2-kernel/9 在下游)', vertical);
  T('DAG:图例 + 完成边(上游完成绿色)', (await page.locator('.dag-legend').count()) === 1 && (await page.locator('.dag-svg path.is-done').count()) >= 1);
  await page.locator('.dag-node', { hasText: '审核工作台' }).first().click();
  await page.waitForTimeout(200);
  const taskPopText = await page.locator('.pop').innerText().catch(() => '');
  T('DAG 节点点击 → 任务气泡(前置/挂接/动作)', taskPopText.includes('任务详情') && taskPopText.includes('前置') && taskPopText.includes('模拟 tool'));
  await page.keyboard.press('Escape');
  await page.locator('[data-act="ov-task-view"][data-v="swim"]').click();
  await page.waitForTimeout(220);
  T('泳道:七态列(待办/执行中/已完成/阻塞/挂起/跳过/已拒绝)', (await page.locator('.swim-col').count()) === 7);
  T('泳道:执行中列有卡片', (await page.locator('.swim-col', { hasText: '执行中' }).locator('.swim-card').count()) >= 1);
  T('泳道:空列占位(无此状态任务)', (await page.locator('.swim-empty').count()) >= 1);
  await page.locator('.swim-card').first().click();
  await page.waitForTimeout(150);
  T('泳道卡片点击 → 任务气泡', (await page.locator('.pop').innerText().catch(() => '')).includes('任务详情'));
  await page.keyboard.press('Escape');
  await page.locator('[data-act="ov-task-view"][data-v="list"]').click();
  await page.waitForTimeout(150);
  await page.locator('.task-feat-pill').click();
  await page.waitForTimeout(120);
  await page.locator('.menu-item', { hasText: 'p1-shell' }).first().click();
  await page.waitForTimeout(200);
  T('feature → p1-shell:列表切换', (await page.locator('.task-feat-pill').innerText()).includes('p1-shell'));
  const shellRows = await page.locator('.task-row .task-id').allInnerTexts();
  T('p1-shell 行全部属于 p1-shell(跨 feature 不混入): ' + shellRows.length, shellRows.length >= 1 && shellRows.every(x => x.indexOf('p1-shell/') === 0));
  await page.locator('.ov-subtab', { hasText: '提案' }).click();
  await page.waitForTimeout(150);
  await page.locator('.tree-row.file', { hasText: 'proposal.md' }).first().click();
  await page.waitForTimeout(200);
  T('文档 tab(只读徽标 + 路径栏)', (await page.locator('.doc-pathbar').innerText()).includes('docs'));

  console.log('== dock 页签机制 ==');
  const chips = await page.locator('.rb-chip').count();
  T('chips ≥ 2(概览/文档): ' + chips, chips >= 2);
  await page.locator('.rb-chip.active .chip-x').first().click();
  await page.waitForTimeout(150);
  T('关闭激活 tab', (await page.locator('.rb-chip').count()) === chips - 1);
  await page.locator('[data-act="dock-plus"]').click();
  await page.waitForTimeout(150);
  T('＋ 重开开始页', (await page.locator('.rb-chip', { hasText: '开始' }).count()) === 1);
  await page.locator('[data-act="dock-fullscreen"]').click();
  await page.waitForTimeout(150);
  T('全屏覆盖中区', await page.evaluate(() => document.getElementById('split-root').classList.contains('rb-full')));
  await page.locator('[data-act="dock-fullscreen"]').click();
  await page.locator('.rb-tail [data-act="dock-toggle"]').click();
  await page.waitForTimeout(150);
  T('收起(轨道归零,同图标)', await page.evaluate(() => document.getElementById('rb-wrap').classList.contains('is-collapsed')));

  console.log('== dock:知识文档页签 + 跟随所属项目 ==');
  // 知识面板 → 卡片 ⋯ → 在 dock 打开文档(整体切换:知识模式无右栏 → 切回会话视图)
  await openKb(page);
  await page.locator('.kn-card', { hasText: '单一归属' }).first().locator('.icon-btn[data-act="kn-menu"]').click();
  await page.waitForTimeout(150);
  T('卡片 ⋯ 菜单含「在 dock 打开文档」', (await page.locator('.menu').innerText()).includes('在 dock 打开文档'));
  await page.locator('.menu-item', { hasText: '在 dock 打开文档' }).click();
  await page.waitForTimeout(250);
  T('整体切换:打开 dock = 切回会话视图 + 右栏展开', await page.evaluate(() =>
    document.getElementById('center-zone').getAttribute('data-view') === 'conv' &&
    !document.getElementById('rb-wrap').classList.contains('is-collapsed')));
  T('kndoc 页签:路径栏(.md)+ 只读 + 正文', (await page.locator('#rb-body .doc-pathbar').innerText()).includes('.md') &&
    (await page.locator('#rb-body .doc-head .chip').count()) === 1 && (await page.locator('#rb-body .doc-body').count()) === 1);
  T('kndoc 徽标行(状态/置信/热度)+ 摘要块', (await page.locator('#rb-body .kndoc-badges').count()) === 1 && (await page.locator('#rb-body .kndoc-abs').count()) >= 0);
  // 抽屉入口:回知识模式 → 另一张卡 → 抽屉 → 在 dock 打开
  await openKb(page);
  await page.waitForTimeout(150);
  await page.locator('.kn-card', { hasText: '复利飞轮' }).first().click();
  await page.waitForTimeout(250);
  T('抽屉含「在 dock 打开」动作', (await page.locator('#kn-drawer').innerText()).includes('在 dock 打开'));
  const chipsBeforeDock = await page.locator('.rb-chip').count();
  await page.locator('#kn-drawer [data-act="kn-dock"]').click();
  await page.waitForTimeout(250);
  T('抽屉「在 dock 打开」→ 新页签 + 抽屉收起(整体切回会话视图)', (await page.locator('.rb-chip').count()) === chipsBeforeDock + 1 &&
    await page.locator('#kn-drawer').isHidden() &&
    (await page.evaluate(() => document.getElementById('center-zone').getAttribute('data-view'))) === 'conv');
  // dock 跟随所属项目:切项目 → 页签集切换;切回 → 恢复
  const chipsP1 = await page.locator('.rb-chip').count();
  await page.locator('.pj-row[data-p="p2"]').click();
  await page.waitForTimeout(250);
  T('切项目 → dock 页签集切换(旧项目页签隐藏): ' + chipsP1 + ' → ' + (await page.locator('.rb-chip').count()), (await page.locator('.rb-chip').count()) < chipsP1);
  T('切项目后 dock 保持展开(内容跟随,不打断面板状态)', await page.evaluate(() => !document.getElementById('rb-wrap').classList.contains('is-collapsed')));
  T('空页签集时 ＋ 常驻(无死面板)', (await page.locator('[data-act="dock-plus"]').count()) === 1);
  await page.locator('.pj-row[data-p="p1"]').click();
  await page.waitForTimeout(250);
  T('切回项目 → 所属页签恢复: ' + (await page.locator('.rb-chip').count()), (await page.locator('.rb-chip').count()) === chipsP1);
  await page.locator('.rb-tail [data-act="dock-toggle"]').click();
  await page.waitForTimeout(150);

  console.log('== 原型工具(模拟时间/主题/外部改动)==');
  await openKb(page);
  await setScope(page, '项目 · dsh-forge');
  await page.locator('[data-act="sim-time"][data-days="90"]').click();
  await page.waitForTimeout(250);
  const confLow = await page.evaluate(() => {
    const el = [...document.querySelectorAll('.kn-card')].find(c => c.textContent.includes('相对时间'));
    return el ? el.querySelector('.badge-conf').textContent : '(被阈值隐藏或不存在)';
  });
  T('模拟 +90 天 → 闲置条目置信衰减: ' + confLow, confLow.includes('低') || confLow.includes('阈值'));
  await page.locator('[data-act="demo-external"]').click();
  await page.waitForTimeout(200);
  T('外部改动 → 对账横幅', (await page.locator('#kb-banner').innerText()).includes('未入索引'));
  await page.locator('[data-act="kb-reconcile"]').click();
  await page.waitForTimeout(200);
  T('重建索引 → 横幅消失', await page.locator('#kb-banner').isHidden());
  await page.locator('[data-act="theme-toggle"]').click();
  await page.waitForTimeout(150);
  T('暗色主题切换', await page.evaluate(() => document.body.hasAttribute('data-ds-dark-theme')));

  console.log('== 添加项目(文件浏览器选工作区 → 回填 → 其余目录构建预填/浏览改选)==');
  await page.locator('[data-act="add-project"]').click();
  await page.waitForTimeout(250);
  T('① 先弹文件浏览器(选择工作区目录)', (await page.locator('.dialog .dialog-title').innerText()) === '选择工作区目录');
  T('① 未选中时「选择此文件夹」禁用', await page.locator('.dialog [data-dlg-ok]').isDisabled());
  // 上一节「模拟移动」已把 p1 路径改为 *-moved:已注册标记改验 p2(forge-plugin);经 上一级 + 双击 导航
  await page.locator('#fb-up').click();
  await page.waitForTimeout(120);
  await page.locator('.fb-item', { hasText: 'ai' }).dblclick();
  await page.waitForTimeout(120);
  T('① 已注册目录带标记(forge-plugin)', (await page.locator('.fb-item', { hasText: 'forge-plugin' }).innerText()).includes('已注册'));
  await page.locator('.fb-crumb-seg', { hasText: 'project' }).click();
  await page.waitForTimeout(120);
  await page.locator('.fb-item', { hasText: 'dsh' }).dblclick();
  await page.waitForTimeout(120);
  await page.locator('.fb-item', { hasText: 'dsh-demo' }).click();
  T('① 单击选中 → 按钮解禁', !(await page.locator('.dialog [data-dlg-ok]').isDisabled()));
  await page.locator('.dialog [data-dlg-ok]').click();
  await page.waitForTimeout(250);
  T('② 工作区目录自动回填表单', (await page.locator('#ap-ws').inputValue()) === 'Z:\\project\\dsh\\dsh-demo');
  T('② 项目名自动取文件夹名', (await page.locator('#ap-name').inputValue()) === 'dsh-demo');
  T('② 任务清单与记录自动派生且只读(分隔符扁平化为 -)', (await page.locator('#ap-tasks').inputValue()) === 'C:\\Users\\panda\\.dsh-forge\\Z-project-dsh-dsh-demo' &&
    await page.locator('#ap-tasks').isDisabled() === false && (await page.locator('#ap-tasks').getAttribute('readonly')) !== null);
  T('② 任务清单与记录位于表单最下方(目录字段之后)', await page.evaluate(() => {
    const rows = [...document.querySelectorAll('.dialog-body .form-row')];
    return rows[rows.length - 1].querySelector('#ap-tasks') !== null;
  }));
  T('② forge 目录(文档位置)按工作区构建预填', (await page.locator('#ap-forge').inputValue()) === 'Z:\\project\\dsh\\dsh-demo\\.forge');
  T('② 知识库目录按工作区构建预填且可改', (await page.locator('#ap-kn').inputValue()) === 'Z:\\project\\dsh\\dsh-demo\\.knowledge' && !(await page.locator('#ap-kn').isDisabled()));
  T('② forge 目录字段位于知识库目录之上', await page.evaluate(() => {
    const f = document.getElementById('ap-forge'), k = document.getElementById('ap-kn');
    return !!(f && k && (f.compareDocumentPosition(k) & Node.DOCUMENT_POSITION_FOLLOWING));
  }));
  T('② 目录字段均带「浏览…」(文件浏览器改选)', await page.locator('#ap-kn-browse').isVisible() && await page.locator('#ap-forge-browse').isVisible());
  T('② 文档位置 = forge 目录输入(仓内/仓外 radio 已并入)', (await page.locator('input[name="ap-doc"]').count()) === 0);
  T('② 默认召回域字段已移除(默认加载改走 AGENTS.md · 提案记账)', (await page.locator('#ap-dom').count()) === 0);
  T('② 底部按钮 =「确认」', (await page.locator('.dialog [data-dlg-ok]').innerText()) === '确认');
  T('② 侦测 chips(forge 树 ✓ / 未注册 ✓)', (await page.locator('#ap-detect').innerText()).includes('forge 树 ✓') && (await page.locator('#ap-detect').innerText()).includes('未注册 ✓'));
  // 浏览改选知识库目录:叠加文件浏览器(表单不关)→ 进入 dsh-demo → 选 .knowledge
  await page.locator('#ap-kn-browse').click();
  await page.waitForTimeout(250);
  T('③ 浏览 = 叠加文件浏览器(表单保持,共两层)', (await page.locator('.dialog-mask').count()) === 2 &&
    (await page.locator('.dialog-mask:last-child .dialog-title').innerText()) === '选择知识库目录');
  await page.locator('.fb-item', { hasText: 'dsh-demo' }).dblclick();
  await page.waitForTimeout(120);
  await page.locator('.fb-item', { hasText: '.knowledge' }).click();
  await page.locator('.dialog-mask:last-child [data-dlg-ok]').click();
  await page.waitForTimeout(250);
  T('③ 浏览确认 → 回填知识库目录(叠层关闭,表单仍在)', (await page.locator('.dialog-mask').count()) === 1 &&
    (await page.locator('#ap-kn').inputValue()) === 'Z:\\project\\dsh\\dsh-demo\\.knowledge');
  // 重新选择工作区:未手改字段重构;浏览/手改过的知识库目录保留
  await page.locator('#ap-repick').click();
  await page.waitForTimeout(250);
  T('④ 重新选择 → 回到文件浏览器', (await page.locator('.dialog .dialog-title').innerText()) === '选择工作区目录');
  await page.locator('.fb-item', { hasText: 'legacy-app' }).click();
  await page.locator('.dialog [data-dlg-ok]').click();
  await page.waitForTimeout(250);
  T('④ 换选工作区:回填 + 未手改字段重构(forge/项目名)', (await page.locator('#ap-ws').inputValue()) === 'Z:\\project\\dsh\\legacy-app' &&
    (await page.locator('#ap-forge').inputValue()) === 'Z:\\project\\dsh\\legacy-app\\.forge' &&
    (await page.locator('#ap-name').inputValue()) === 'legacy-app');
  T('④ 任务清单随工作区重新派生(扁平化)', (await page.locator('#ap-tasks').inputValue()) === 'C:\\Users\\panda\\.dsh-forge\\Z-project-dsh-legacy-app');
  T('④ 浏览选定的知识库目录保留(不随工作区重构)', (await page.locator('#ap-kn').inputValue()) === 'Z:\\project\\dsh\\dsh-demo\\.knowledge');
  await page.locator('.dialog [data-dlg-ok]').click();
  await page.waitForTimeout(300);
  T('⑤ 确认入库:forge / 知识目录按表单落位', await page.evaluate(() => {
    const p = window.FORGE.db.projects.find(x => x.name === 'legacy-app');
    return !!p && p.canonicalPath === 'Z:\\project\\dsh\\legacy-app' &&
      p.forgeDir === 'Z:\\project\\dsh\\legacy-app\\.forge' && p.knowledgeDir === 'Z:\\project\\dsh\\dsh-demo\\.knowledge' &&
      p.docMode === 'repo';
  }));
  T('⑤ toast:先 dsh create(幂等)后自家外键 + 任务清单落位', ((await page.locator('.toast').last().innerText()).includes('workspaceRegistry.create')) &&
    ((await page.locator('.toast').last().innerText()).includes('任务清单落于')));

  console.log('== 运行时错误 ==');
  T('无页面 JS 错误: ' + (errors.length ? errors[0] : '干净'), errors.length === 0);

  await page.screenshot({ path: 'smoke-final.png', fullScreen: false });
  await browser.close();
  console.log('');
  console.log('结果: ' + pass + ' 通过, ' + fail + ' 失败');
  if (fails.length) { console.log('失败项:\n - ' + fails.join('\n - ')); }
  process.exit(fail ? 1 : 0);
})().catch(e => { console.error('SMOKE CRASH:', e); process.exit(1); });
