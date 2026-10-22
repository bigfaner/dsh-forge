#!/usr/bin/env node
// `pnpm dev` —— 并行：apps/web `vite build --watch`（壳非独立应用——母本裁决：bare vite serve
// 无 __DSH_BOOT__ 注入；宿主载 build dist，1.5 起 watch 迭代）+ `tsc -b --watch`（全拓扑）
// + electron（指 dev profile：DSH_FORGE_DEV_PROFILE=dev，开发 profile 直链
// workspace 构建产物，免整包组装——1.4 接线消费该环境变量）。
// electron 面守卫：apps/host/dist/main.js 就绪后才拉起（1.4 落地宿主前仅跑前两者）；
// 起跑前 ensure-host-dist 新鲜度自检（2026-10-15 事故：tsbuildinfo 与输出脱节后
// tsc -b/--watch 永判 up-to-date 零 emit——半新半旧 dist 令 electron ESM 崩）。
import { spawn, spawnSync } from 'node:child_process';
import { copyFileSync, existsSync, mkdirSync, readFileSync, statSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const procs = [];
let shuttingDown = false; // 主动收尾标记:级联终止触发的子退出不算异常

/**
 * 级联终止一棵 watcher 树。spawn({ shell: true }) 的直接子进程是 cmd.exe 壳——
 * p.kill() 只杀壳，真正的 node 孙进程（vite/tsc/electron）全部孤儿化（Windows 内核
 * 无父子生命周期绑定；2026-10-06 内存事故根因：跨天孤儿 watcher 各滚至 GB 级提交
 * 内存）。治本 = Windows taskkill /T 整树强杀；POSIX 同进程组信号可达，退回 p.kill()。
 */
function killTree(child) {
	if (child.pid === undefined) return;
	if (process.platform === 'win32') {
		try {
			spawnSync('taskkill', ['/T', '/F', '/PID', String(child.pid)], {
				stdio: 'ignore'
			});
			return;
		} catch {
			/* taskkill 不可用（极端精简环境）——退回单点杀 */
		}
	}
	try {
		child.kill();
	} catch {
		/* 已退出 */
	}
}

function start(name, cmd, env = {}) {
	const p = spawn(cmd, {
		shell: true,
		stdio: 'inherit',
		cwd: ROOT,
		env: { ...process.env, ...env }
	});
	procs.push([name, p]);
	p.on('exit', code => {
		if (shuttingDown) return; // 主动收尾的级联终止，不算异常退出
		if (code) console.error(`[dev] ${name} exited (${code})`);
	});
	console.log(`[dev] ${name}: ${cmd}`);
	return p;
}

// host dist 新鲜度自检须先于两 watch：tsc watch 初始 pass 信 tsbuildinfo，脱节状态零
// emit 不自愈；后置则与其 emit 竞写同一 dist。失败不拦 dev（fail-soft 沿 vite+tsc 继续，
// electron 由下方 existsSync 守卫兜底不拉起）。
const ensureHostDist = spawnSync(
	process.execPath,
	[join(ROOT, 'scripts', 'ensure-host-dist.mjs')],
	{
		stdio: 'inherit'
	}
);
if (ensureHostDist.status !== 0) {
	console.error(
		'[dev] host dist 新鲜度自检/重建失败——electron 将不启动（仅 vite + tsc watch）'
	);
}

// input-history client bundle 打包步（Root cause: 根 tsc -b 只产 tsc 输出 dist/client/，
// exports["./client"] 指向的 dist/client.js 由包内 bundle-client.mjs esbuild 产出——
// 管线不跑它则 vite watch 初始构建 req.resolve 失败。run-once 增量，幂等便宜）。
const ensurePluginClientBundle = spawnSync(
	'pnpm',
	['-C', 'packages/plugins/input-history', 'build'],
	{ stdio: 'inherit', shell: true, cwd: ROOT }
);
if (ensurePluginClientBundle.status !== 0) {
	console.error(
		'[dev] input-history client bundle 打包失败——vite 构建将在 emit 阶段报 bundle 缺席'
	);
}

// vite 初始构建收口（Root cause: electron 旧序仅等 HOST_MAIN（tsc 产物）就绪即拉起，
// vite 初始构建（数十秒）未完成时壳加载旧 web bundle，inject 缝缺席呈空态——bug 0459d067）。
// 两段式：先 run-once 全量 build（复用 ensure-host-dist 同型缝，stdio inherit 提供进度
// 可见性）→ 再起 watch（--no-emptyOutDir 不抹 run-once 产物）→ electron 拉起时壳 dist
// 必为本次源码产物。构建失败 fail-soft 不拦 dev（electron 沿旧 dist 呈旧态 + 显性告警）。
const ensureViteBuild = spawnSync('pnpm', ['-C', 'apps/web', 'run', 'build:vite'], {
	stdio: 'inherit',
	shell: true,
	cwd: ROOT
});
if (ensureViteBuild.status !== 0) {
	console.error(
		'[dev] vite 初始构建失败——electron 将沿旧壳 dist 拉起（旧态呈现，非本次源码）；请排查上方 vite 报错'
	);
}

// mobile dist 初始构建（run-once）+ 受管 watch（2026-10-22 判例：手机静态面 = host 服务
// apps/mobile/dist 单文件产物，vite/tsc watch 不覆盖 apps/mobile——不接线则手机端迭代恒吃
// 旧 bundle）。与 vite 同款两段式：run-once 全量 → watch 增量；子进程入 procs 由 bye() 杀树。
const ensureMobileBuild = spawnSync('pnpm', ['-C', 'apps/mobile', 'run', 'build'], {
	stdio: 'inherit',
	shell: true,
	cwd: ROOT
});
if (ensureMobileBuild.status !== 0) {
	console.error(
		'[dev] mobile dist 初始构建失败——手机端将沿旧 dist（旧态呈现，非本次源码）；请排查上方 esbuild 报错'
	);
}

start('vite', 'pnpm -C apps/web watch');
start('mobile-esbuild', 'pnpm -C apps/mobile exec node esbuild.mjs --watch');
start('tsc', 'pnpm exec tsc -b --watch');

const HOST_DIR = join(ROOT, 'apps/host');
const HOST_MAIN = join(HOST_DIR, 'dist/main.js');
// 直连 electron 二进制而非 `pnpm -C apps/host exec electron .`：DSH 桌面端给 PATH 上的
// node/pnpm 垫片注入 ELECTRON_RUN_AS_NODE=1（Electron 二进制当纯 Node 跑），该变量经
// pnpm → electron shim → cli.js 一路继承，electron.exe 会以 Node 模式而非主进程模式启动
// ——ESM main 的 `import { BrowserWindow } from 'electron'` 链接到未初始化的空模块，
// 报 "does not provide an export named 'BrowserWindow'" 退出（实测复现/修复）。
// 垫片的 @set 在子进程内部重新注入该变量，故必须绕开垫片链 + 显式 delete。
// electron 二进制解析（方案 A，bug 5c830524 预防面）：electron exe 位置与应用加载无关
// （app 目录经首参传入），worktree 可不装 250MB dist、复用主仓二进制——从源头避开
// 「沙箱令牌装入 → 桌面令牌执行」的 ACL 毒化窗口。解析顺序：
// ① 本 worktree dist 在场 → 用（配合启动期 ACL 自愈缝兜底）
// ② 主仓（.forge/worktrees/<slug> 布局反推 ../../..）dist 在场且版本与本仓
//    apps/host devDep electron 精确 pin 一致 → 复用（版本漂移即拒绝，绝不混版）
// ③ 都缺 → 返回本地路径（走下方「未安装」守卫的补装指引）
function resolveElectronExe() {
	const exeName = process.platform === 'win32' ? 'electron.exe' : 'electron';
	const local = join(HOST_DIR, 'node_modules', 'electron', 'dist', exeName);
	if (existsSync(local)) return local;
	const mainRoot = resolve(ROOT, '..', '..', '..');
	const mainPkgJson = join(mainRoot, 'apps', 'host', 'node_modules', 'electron', 'package.json');
	if (!existsSync(mainPkgJson)) return local;
	let want = '';
	let got = '';
	try {
		want = JSON.parse(readFileSync(join(HOST_DIR, 'package.json'), 'utf8')).devDependencies?.electron ?? '';
		got = JSON.parse(readFileSync(mainPkgJson, 'utf8')).version ?? '';
	} catch {
		return local;
	}
	if (!want || !got) return local;
	if (want !== got) {
		console.warn(`[dev] 主仓 electron ${got} 与本仓 pin ${want} 不一致——不复用，走本地/补装`);
		return local;
	}
	const shared = join(dirname(mainPkgJson), 'dist', exeName);
	if (existsSync(shared)) {
		console.warn(`[dev] worktree 未装 electron——复用主仓二进制（版本 ${got} 一致）：${shared}`);
		return shared;
	}
	return local;
}
const ELECTRON_EXE = resolveElectronExe();
setTimeout(() => {
	if (!existsSync(HOST_MAIN)) {
		console.warn(
			'[dev] apps/host/dist/main.js 未就绪——electron 未启动（1.4 落地宿主装配后自动拉起；当前仅 vite + tsc watch）。'
		);
		return;
	}
	if (!existsSync(ELECTRON_EXE)) {
		// S1/memory 实测：pnpm 11 不执行 electron 安装脚本——二进制须手动补齐（1.4 前执行一次）
		console.warn(
			'[dev] electron 二进制未安装——先执行：ELECTRON_MIRROR=https://npmmirror.com/mirrors/electron/ node apps/host/node_modules/electron/install.js（spike S1 记录；当前仅 vite + tsc watch）。'
		);
		return;
	}
	// electron dist ACL 解毒（bug 5c830524）：沙箱令牌下的 pnpm install 会给 dist 烙显式
	// Everyone:(DENY)(DC) 与 Low 完整性标签（区别于全树无害的继承态根保护 ACE），桌面令牌
	// 启动该 electron 时 chromium 早期初始化即崩 0x80000003（早于一切日志）。dev 启动自检：
	// 检出非继承（无 (I) 标）毒化条目即摘除；失败 fail-soft 仅告警（本会话令牌可读可执行时不受影响）。
	if (process.platform === 'win32') {
		try {
			const distDir = dirname(ELECTRON_EXE);
			for (const target of [ELECTRON_EXE, distDir]) {
				const acl = spawnSync('icacls', [target], { encoding: 'utf8' });
				const text = acl.stdout ?? '';
				const poisoned = /(Everyone|Mandatory Label\\Low Mandatory Level):(?!\(I\))(?=[^:]*\(DENY\))|Mandatory Label\\Low Mandatory Level:(?!\(I\))/i.test(
					text
				);
				if (poisoned) {
					spawnSync('icacls', [target, '/remove:d', 'Everyone', 'Mandatory Label'], { stdio: 'inherit' });
					if (target === ELECTRON_EXE) {
						spawnSync('icacls', [target, '/setintegritylevel', 'M'], { stdio: 'inherit' });
					}
					console.warn(`[dev] electron ACL 解毒：${target}（摘除安装期显式 deny/低标签烙印，bug 5c830524）`);
				}
			}
		} catch {
			console.warn('[dev] electron ACL 自检失败（fail-soft）——若桌面令牌启动崩 0x80000003，手动执行：icacls <electron dist> /remove:d Everyone "Mandatory Label" 并对 electron.exe /setintegritylevel M');
		}
	}
	// 预设底稿刷新（根治 src→dist 遮蔽）：copy-preset-assets.mjs 只挂 pnpm build，tsc watch
	// 不拷非 TS 资产——dist 旧副本（历次 build 残留）在 presets.ts 双锚解析里优先于 src，
	// 改底稿后仅重启 dev 会被旧副本遮蔽。electron 拉起前同步刷新一次，保证本次启动读到
	// 最新底稿（底稿仅 boot 读一次：改底稿后仍须重启 dev 才进 boot overlay）。
	const copyPresets = spawnSync(
		process.execPath,
		[join(ROOT, 'scripts', 'copy-preset-assets.mjs')],
		{
			stdio: 'inherit'
		}
	);
	if (copyPresets.status !== 0) {
		console.error(
			'[dev] copy-preset-assets 失败——electron 将沿 dist 旧副本（若在场）或 src 回退读底稿'
		);
	}
	// dev 专用 userData（apps/host/userdata.dev）：与打包版缺省 userData（%APPDATA%/dsh-forge）
	// 各持单实例锁——dev 与已安装的 dsh-forge.exe 可并行，互踢单实例锁（2026-10-19 用户裁决迁移）。
	// 注意 fix-26 凭据桥门：USER_DATA 在场 = 不读真 home 凭据，凭据以一次性复制
	// （~/.dsh/.credentials.yaml → {userData}/dsh-home/.credentials.yaml）补齐。
	const electronEnv = {
		...process.env,
		DSH_FORGE_DEV_PROFILE: 'dev',
		DSH_FORGE_USER_DATA: join(HOST_DIR, 'userdata.dev')
	};
	delete electronEnv.ELECTRON_RUN_AS_NODE;
	// DSH 派生终端内 %TEMP% 写拒（EPERM dsh-spill mkdtemp，fix-9 未覆盖 dev 路径的已知族）：
	// 派生环境（DSH_SHELL）时把 TMP/TEMP/TMPDIR 重定向到项目内可写目录——与 e2e
	// global-setup 的 .e2e-tmp 重定向同语义。
	if (process.env.DSH_SHELL === '1') {
		const devTmp = join(ROOT, '.dev-tmp');
		try {
			mkdirSync(devTmp, { recursive: true });
			electronEnv.TMP = devTmp;
			electronEnv.TEMP = devTmp;
			electronEnv.TMPDIR = devTmp;
		} catch {
			console.warn('[dev] .dev-tmp 创建失败——沿原 TEMP 启动（派生环境可能写拒）');
		}
		// 派生终端继承的 DSH_HOME 指向 GUI 实例 live home——其凭据锁对派生进程写拒
		// （EPERM .credentials.yaml.lock，0x80000003 族同根）。剥离继承后走 fix-26 缺省
		// 隔离（DSH_FORGE_USER_DATA 派生 home + 一次性凭据复制）。有意用特殊 DSH_HOME
		// 调试时请在非派生终端跑 dev 或显式设 DSH_HOME 指向可写目录。
		if (electronEnv.DSH_HOME) {
			delete electronEnv.DSH_HOME;
			console.warn('[dev] 派生环境：剥离继承 DSH_HOME——dev 走 userdata.dev 隔离 home（fix-26 桥）');
		}
	}
	// dev 进程名区分（2026-10-19 用户裁决）：进程名 = exe 文件名，electron.exe 改不了名——
	// 在 electron dist 内复制一份 dsh-forge-dev.exe（同目录：DLL/资源邻接解析全部有效），
	// spawn 该副本 → 任务管理器进程名 dsh-forge-dev，与打包版 dsh-forge.exe 一眼区分。
	// 副本缺失或字节数漂移（electron 版本更新）时重新复制；复制失败 fail-soft 回退原 exe。
	let electronSpawnExe = ELECTRON_EXE;
	if (process.platform === 'win32') {
		const DEV_EXE = join(dirname(ELECTRON_EXE), 'dsh-forge-dev.exe');
		try {
			if (!existsSync(DEV_EXE) || statSync(DEV_EXE).size !== statSync(ELECTRON_EXE).size) {
				copyFileSync(ELECTRON_EXE, DEV_EXE);
			}
			electronSpawnExe = DEV_EXE;
		} catch {
			console.warn('[dev] dsh-forge-dev.exe 复制失败（文件占用？）——沿 electron.exe 启动（进程名区分降级）');
		}
	}
	// 透传附加参数（dev:debug 调试面：--remote-debugging-port=9222 → CDP 外接诊断）
	const extraArgs = process.argv.slice(2);
	// DSH 派生终端进程树内 chromium sandbox 初始化即崩（0x80000003，e2e/support/launch.ts
	// 同款实证）。dev 场景令牌形态不可枚举（派生标记 DSH_SHELL 并不总在场——实测存在
	// DSH_SHELL 缺席但令牌同样受限的终端），故 dev 开关默认无条件启用 --no-sandbox 等
	// （仅本地开发面，非打包产物）；显式设 E2E_ELECTRON_SWITCHES=0 可禁用。
	const devSwitchesOn = (process.env.E2E_ELECTRON_SWITCHES ?? '1') === '1';
	const healSwitches = devSwitchesOn ? ['--no-sandbox', '--disable-gpu', '--no-proxy-server'] : [];
	const p = spawn(electronSpawnExe, [HOST_DIR, ...healSwitches, ...extraArgs], {
		stdio: 'inherit',
		cwd: ROOT,
		env: electronEnv
	});
	procs.push(['electron', p]);
	p.on('exit', code => {
		if (shuttingDown) return;
		if (code) console.error(`[dev] electron exited (${code})`);
	});
	console.log(`[dev] electron: ${electronSpawnExe} ${HOST_DIR}`);
}, 2500);

function bye() {
	if (shuttingDown) return;
	shuttingDown = true;
	for (const [, p] of procs) killTree(p);
	process.exit(0);
}
process.on('SIGINT', bye);
process.on('SIGTERM', bye);
process.on('SIGBREAK', bye);
