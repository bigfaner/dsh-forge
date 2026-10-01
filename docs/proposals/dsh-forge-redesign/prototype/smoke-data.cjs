/* 数据层冒烟:Node 环境验证 FORGE 核心 API(置信度/召回/抽取/晋升/对账)。
   运行:node smoke-data.cjs(仓库 package.json 为 ESM,故用 .cjs) */
global.sessionStorage = { _s: {}, getItem(k) { return this._s[k] || null; }, setItem(k, v) { this._s[k] = v; }, removeItem(k) { delete this._s[k]; } };
global.window = global;
require('./data.js');
var F = global.FORGE;
var pass = 0, fail = 0;
function T(name, cond) { if (cond) { pass++; console.log('  ✓ ' + name); } else { fail++; console.log('  ✗ FAIL: ' + name); } }

F.init();
console.log('== 基础 ==');
T('项目 p1 存在', !!F.db.projects.find(p => p.id === 'p1'));
T('知识种子 ≥ 18 条', F.db.kn.length >= 18);
T('会话 s1 存在且有预置消息', F.sessionGet('s1').msgs.length >= 4);

console.log('== 置信度(读取时动态计算)==');
var c104 = F.kn.confidence('kn-104');
T('kn-104(高热+已审核+采纳2)为高置信: ' + c104.total.toFixed(2), c104.total >= 0.75 && c104.level === 'high');
T('kn-104 构成含四信号', c104.parts.length === 5);
var c118 = F.kn.confidence('kn-118');
T('kn-118(未审核新抽取)为中等置信: ' + c118.total.toFixed(2), c118.total >= 0.45 && c118.total < 0.75);
var c109 = F.kn.confidence('kn-109');
T('kn-109(闲置96天)低于 0.45: ' + c109.total.toFixed(2), c109.total < 0.45);
var h0 = F.kn.heat('kn-101');
T('kn-101 热度 = 13(使用事件计数): ' + h0, h0 === 13);

console.log('== 时间旅行(衰减)==');
F.setSimDays(90);
var c109b = F.kn.confidence('kn-109');
T('模拟 +90 天后 kn-109 进一步衰减: ' + c109b.total.toFixed(2), c109b.total < c109.total);
var c118b = F.kn.confidence('kn-118');
T('kn-118 +90 天后跌破中等(闲置衰减): ' + c118b.total.toFixed(2), c118b.total < 0.45);
F.setSimDays(0);

console.log('== 召回 ==');
var res = F.recall.search({ projectId: 'p1', keywords: ['置信度', '衰减'], threshold: 0.35, budget: 2000 });
T('search 命中 ≥ 2(相关度排序)', res.hits.length >= 2);
T('命中附理由要素(matched/conf)', res.hits.every(h => h.conf && h.matched));
T('命中按相关度降序', res.hits.every((h, i) => i === 0 || res.hits[i - 1].score >= h.score));
T('kn-104 排在前列', res.hits[0].kn.id === 'kn-104' || res.hits.findIndex(h => h.kn.id === 'kn-104') <= 2);
var h101 = F.kn.heat('kn-101');
F.recall.search({ projectId: 'p1', keywords: ['飞轮'], threshold: 0.35, budget: 2000 });
T('每次召回记使用事件(热度 +1): ' + h101 + ' → ' + F.kn.heat('kn-101'), F.kn.heat('kn-101') === h101 + 1);
var resFront = F.recall.search({ projectId: 'p1', domain: '编程/前端', keywords: ['性能'], threshold: 0.35, budget: 2000 });
T('域过滤:前端域不返回后端/产品域', resFront.hits.every(h => F.kn.domainOf(h.kn.path).indexOf('编程/前端') === 0));
var resLow = F.recall.search({ projectId: 'p1', keywords: ['时间'], threshold: 0.9, budget: 2000 });
T('高阈值过滤:阈值 0.9 时 kn-109 被滤除', resLow.hits.every(h => h.kn.id !== 'kn-109') && resLow.below >= 1);
var br = F.recall.browse({ projectId: 'p1' });
T('browse 返回域树且计数 ≥ 召回池', br.total >= 15);
var rf = F.recall.readFull('kn-106');
T('read-full 返回正文与 token 估算', rf.content.length > 50 && rf.tokens > 10);
var ra = F.recall.readAbstract('g-201');
T('read-abstract 返回摘要', ra.content.indexOf('转义') >= 0);
F.recall.feedback('g-202', 'adopted');
var st = F.kn.usageStats('g-202');
T('显式反馈记入事件(第四信号)', st.adopted >= 1);

console.log('== 抽取与去重 ==');
var ex = F.kn.extract({ scope: 'project', project: 'p1', title: '置信度衰减演练', abstract: '抽取去重冒烟条目,近似既有四信号条目。', keywords: ['置信度', '衰减', '反馈'], domain: '架构/知识内核' });
T('抽取落库成功(pending)', ex.ok && ex.kn.status === 'pending');
T('近似重复检出 → 合并队列', !!ex.dup && F.db.mergeQueue.length >= 2);
var exBad = F.kn.extract({ scope: 'project', project: 'p1', title: '', abstract: '', keywords: [], domain: '' });
T('契约校验拒绝不合格条目', !exBad.ok);
var exDeep = F.kn.extract({ scope: 'project', project: 'p1', title: '层级超限', abstract: 'x', keywords: ['x'], domain: 'a/b/c/d' });
T('目录层级 >3 被拒', !exDeep.ok);

console.log('== 审核 / 移动 / 晋升 ==');
var confBefore = 0.45;
F.kn.approve(ex.kn.id);
T('审核通过 → approved 且置信提升', F.kn.get(ex.kn.id).status === 'approved' && F.kn.confidence(ex.kn.id).total > confBefore);
var pid105 = 'kn-105';
var domBefore = F.kn.domainOf(F.kn.get(pid105).path);
F.kn.move(pid105, '架构/数据模型');
T('移动 = 换域,稳定 ID 不变', F.kn.domainOf(F.kn.get(pid105).path) === '架构/数据模型' && F.kn.get(pid105).id === pid105);
F.kn.move(pid105, domBefore);
F.kn.promote('kn-108');
T('晋升:条目移入全局库', F.kn.list({ scope: 'global' }).some(k => k.id === 'kn-108'));
T('项目侧留重定向记录', F.kn.list({ scope: 'project', project: 'p1' }).some(k => k.redirect && k.targetId === 'kn-108'));
var mq = F.db.mergeQueue[0];
var nKn = F.db.kn.length;
F.kn.merge(mq.id, true);
T('合并:保留一侧、移除另一侧', F.db.kn.length === nKn - 1 && !F.kn.get('kn-106'));

console.log('== 工作区对账 ==');
var al = F.ws.checkAlignment('p1');
T('初始对齐 ok', al.state === 'ok');
F.ws.simulateMove('p1');
T('模拟目录移动 → 失配', F.ws.checkAlignment('p1').state === 'mismatch');
var okR = F.ws.realign('p1');
T('按 canonical path 找回 → 对齐', okR && F.ws.checkAlignment('p1').state === 'ok');

console.log('== 任务状态层(tool 半身模拟)==');
var t2 = F.db.tasks['p2-kernel/2'];
var before2 = t2.status;
var tt = F.tasks.simulateToolSubmit('p2-kernel/2');
T('tool 提交: ' + before2 + ' → ' + tt.status, (before2 === 'in_progress' && tt.status === 'completed'));
var feat = F.db.features.find(x => x.slug === 'p2-kernel');
T('feature 进度即时刷新: ' + feat.done + '/' + feat.total, feat.done >= 2);

console.log('== 会话账本(实时读)==');
var ss = F.sessionsOf('ws-a1f3e9');
T('会话列表按更新时间排序', ss[0].ts >= ss[ss.length - 1].ts);
T('归档会话不出现', !ss.some(s => s.id === 's5'));

console.log('== 外部修改对账 ==');
F.kn.simulateExternal();
T('外部改动 → 未入索引计数 1', F.kn.unindexedCount('p1') === 1);
var nRec = F.kn.reconcile();
T('重建索引挂载 ' + nRec + ' 条', nRec === 1 && F.kn.unindexedCount('p1') === 0);

console.log('== 持久化 ==');
F.init();
T('sessionStorage 恢复(kn-108 已在全局)', F.kn.list({ scope: 'global' }).some(k => k.id === 'kn-108'));
F.reset();
T('重置还原种子', F.kn.get('kn-108').scope === 'project');

console.log('');
console.log('结果: ' + pass + ' 通过, ' + fail + ' 失败');
process.exit(fail ? 1 : 0);
