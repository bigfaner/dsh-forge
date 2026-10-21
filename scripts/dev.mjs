#!/usr/bin/env node
// `pnpm dev` —— 并行：apps/web `vite build --watch`（壳非独立应用——母本裁决：bare vite serve
// 无 __DSH_BOOT__ 注入；宿主载 build dist，1.5 起 watch 迭代）+ `tsc -b --watch`（全拓扑）
// + electron（指 dev profile：DSH_FORGE_DEV_PROFILE=dev，开发 profile 直链
// workspace 构建产物，免整包组装——1.4 接线消费该环境变量）。
// electron 面守卫：apps/host/dist/main.js 就绪后才拉起（1.4 落地宿主前仅跑前两者）；
// 起跑前 ensure-host-dist 新鲜度自检（2026-10-15 事故：tsbuildinfo 与输出脱节后
// tsc -b/--watch 永判 up-to-date 零 emit——半新半旧 dist 令 electron ESM 崩）。
import { spawn, spawnSync } from 'node:child_process';
import { copyFileSync, existsSync, statSync } from 'node:fs';
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

start('vite', 'pnpm -C apps/web watch');
start('tsc', 'pnpm exec tsc -b --watch');

const HOST_DIR = join(ROOT, 'apps/host');
const HOST_MAIN = join(HOST_DIR, 'dist/main.js');
// 直连 electron 二进制而非 `pnpm -C apps/host exec electron .`：DSH 桌面端给 PATH 上的
// node/pnpm 垫片注入 ELECTRON_RUN_AS_NODE=1（Electron 二进制当纯 Node 跑），该变量经
// pnpm → electron shim → cli.js 一路继承，electron.exe 会以 Node 模式而非主进程模式启动
// ——ESM main 的 `import { BrowserWindow } from 'electron'` 链接到未初始化的空模块，
// 报 "does not provide an export named 'BrowserWindow'" 退出（实测复现/修复）。
// 垫片的 @set 在子进程内部重新注入该变量，故必须绕开垫片链 + 显式 delete。
const ELECTRON_EXE = join(
	HOST_DIR,
	'node_modules',
	'electron',
	'dist',
	process.platform === 'win32' ? 'electron.exe' : 'electron'
);
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
	const p = spawn(electronSpawnExe, [HOST_DIR, ...extraArgs], {
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
