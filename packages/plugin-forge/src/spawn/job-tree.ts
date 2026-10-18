// worker 进程树 Job Object 整树回收（dispatch-loop-hardening 改进 4）。
// in-process worker 与宿主同进程——worker 的孙进程（pwsh/node/git）= 宿主直接子进程，
// Node 无 Job Object 原生 API：本文件经 per-worker keeper 监督进程（PowerShell + Add-Type
// P/Invoke，pwsh 7 优先/Windows PowerShell 5.1 回退）落「CreateJobObject(KILL_ON_JOB_CLOSE)
// → 子进程逐个 AssignProcessToJobObject → 任意终态 TerminateJobObject 整树回收」。
// 归属仲裁（嵌套 Job 误归属消解）：keeper 不单方 assign——新宿主子进程上报 candidate，
// host 端（本模块 activeGuards 登记）先报者 claim、余者 exclude，单点归属零嵌套竞争；
// assign 失败（进程已退等）assign-failed fail-soft 上报，绝不影响 worker 正常路径。
// keeper 通道：host→keeper 指令 = 文件队列（<queueDir>/*.cmd，逐条读后删）；keeper 检出
// 宿主进程消亡即自终止并整树回收（比 stdin EOF 更强——宿主被杀同样可达）。report 通道
// = stdout 行协议（ready/candidate/assigned/assign-failed）。
// 交付门边界：本文件的机制断言经注入桩 launcher 单测锁定；真机端到端取证（嵌套 Job
// 语义真机验证 / --watch 整树退出 / commit charge 无孤儿）归档任务日志（AGENTS.md 2026-10-15）。
import { spawn, execFile, execFileSync } from 'node:child_process'
import { existsSync, mkdirSync, writeFileSync, renameSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { randomUUID } from 'node:crypto'
import type { ChildProcess, SpawnOptions } from 'node:child_process'
import type { Readable } from 'node:stream'

/** keeper 轮询周期（candidate 上报时延上界——毫秒） */
const KEEPER_POLL_MS = 300

/** reclaim 时 terminate 后等待 keeper 退出的宽限（超时 taskkill 兜底） */
const RECLAIM_GRACE_MS = 3000

/** 环境开关（DSH_FORGE_TREE_GUARD=off = 守卫禁用——诊断逃生口） */
const GUARD_ENV_OFF = 'off'

/** keeper 装配（原生绑定 Dll + 协议脚本——进程级缓存） */
interface KeeperAssembly {
  readonly assemblyPath: string
  readonly scriptPath: string
}

/** keeper 进程面（真 = PowerShell ChildProcess 子集；测试 = 桩） */
export interface KeeperProcess {
  readonly pid: number | undefined
  readonly stdout: Readable
  readonly exited: Promise<void>
  /** 诊断面（真启动器携带；DSH_FORGE_TREE_GUARD_DEBUG=on 时镜像） */
  readonly stderr?: Readable
}

/** keeper 启动器（真 = PowerShell；测试注入桩） */
export type KeeperLauncher = (args: {
  readonly hostPid: number
  readonly pollMs: number
  readonly exclusions: readonly number[]
  readonly assemblyPath: string
  readonly scriptPath: string
  /** 指令队列目录（host 写 *.cmd，keeper 逐条读后删） */
  readonly queueDir: string
}) => KeeperProcess

/** worker 进程树守卫（per-worker 会话一把——任意终态 reclaim 整树回收） */
export interface WorkerTreeGuard {
  /** keeper pid（就绪后置位；undefined = 守卫未生效——禁用态） */
  readonly keeperPid: number | undefined
  /** 就绪握手（禁用态也兑现——fail-soft 不挂调用方） */
  readonly whenReady: Promise<void>
  /** 动态排除（他 keeper 等本机制进程——host 端仲裁中继） */
  exclude(pid: number): void
  /** 整树回收（TerminateJobObject + keeper 退出）；幂等；true = keeper 路径生效 */
  reclaim(): Promise<boolean>
}

/** 缺省守卫注入位（单测/驱动器缺省注入点） */
export function noopWorkerTreeGuard(): WorkerTreeGuard {
  return {
    keeperPid: undefined,
    whenReady: Promise.resolve(),
    exclude: () => {},
    reclaim: async () => false,
  }
}

// ─────────────────────────── keeper 装配体（C# P/Invoke + PowerShell 协议） ───────────────────────────

/** keeper 装配版本（缓存文件名成分——绑定/协议面变更即换名重编译） */
const JOB_TREE_VERSION = 10

const KEEPER_CS = `
using System;
using System.Runtime.InteropServices;
public static class JobTreeNative
{
    [DllImport("kernel32.dll", SetLastError = true, CharSet = CharSet.Unicode)]
    public static extern IntPtr CreateJobObject(IntPtr a, string name);
    [DllImport("kernel32.dll", SetLastError = true)]
    public static extern bool SetInformationJobObject(IntPtr job, int infoClass, ref JOBOBJECT_EXTENDED_LIMIT_INFORMATION info, int len);
    [DllImport("kernel32.dll", SetLastError = true)]
    public static extern bool AssignProcessToJobObject(IntPtr job, IntPtr proc);
    [DllImport("kernel32.dll", SetLastError = true)]
    public static extern bool TerminateJobObject(IntPtr job, uint exitCode);
    [DllImport("kernel32.dll", SetLastError = true)]
    public static extern IntPtr OpenProcess(uint access, bool inherit, int pid);
    [DllImport("kernel32.dll", SetLastError = true)]
    public static extern bool CloseHandle(IntPtr h);
}
[StructLayout(LayoutKind.Sequential)]
public struct JOBOBJECT_BASIC_LIMIT_INFORMATION
{
    public long PerProcessUserTimeLimit;
    public long PerJobUserTimeLimit;
    public uint LimitFlags;
    public UIntPtr MinimumWorkingSetSize;
    public UIntPtr MaximumWorkingSetSize;
    public uint ActiveProcessLimit;
    public UIntPtr Affinity;
    public uint PriorityClass;
    public uint SchedulingClass;
}
[StructLayout(LayoutKind.Sequential)]
public struct IO_COUNTERS
{
    public ulong ReadOperationCount;
    public ulong WriteOperationCount;
    public ulong OtherOperationCount;
    public ulong ReadTransferCount;
    public ulong WriteTransferCount;
    public ulong OtherTransferCount;
}
[StructLayout(LayoutKind.Sequential)]
public struct JOBOBJECT_EXTENDED_LIMIT_INFORMATION
{
    public JOBOBJECT_BASIC_LIMIT_INFORMATION BasicLimitInformation;
    public IO_COUNTERS IoInfo;
    public UIntPtr ProcessMemoryLimit;
    public UIntPtr JobMemoryLimit;
    public UIntPtr PeakProcessMemoryUsed;
    public UIntPtr PeakJobMemoryUsed;
}
`

/**
 * keeper PowerShell 协议脚本（args: hostPid, pollMs, exclusionsCsv, assemblyPath, queueDir）。
 * 兼容 Windows PowerShell 5.1（无 runspace/stdin 依赖——指令走文件队列，宿主消亡自检回收）。
 */
const KEEPER_PS = `
$ErrorActionPreference = 'Stop'
$hostPid = [int]$args[0]
$pollMs = [int]$args[1]
$excluded = New-Object 'System.Collections.Generic.HashSet[int]'
foreach ($p in ($args[2] -split ',')) { if ($p -ne '') { [void]$excluded.Add([int]$p) } }
Add-Type -Path $args[3]
$queueDir = $args[4]
$job = [JobTreeNative]::CreateJobObject([IntPtr]::Zero, $null)
if ($job -eq [IntPtr]::Zero) { throw 'CreateJobObject failed' }
$info = New-Object JOBOBJECT_EXTENDED_LIMIT_INFORMATION
$info.BasicLimitInformation.LimitFlags = 0x2000 # JOB_OBJECT_LIMIT_KILL_ON_JOB_CLOSE
if (-not [JobTreeNative]::SetInformationJobObject($job, 9, [ref]$info, [System.Runtime.InteropServices.Marshal]::SizeOf($info))) { throw 'SetInformationJobObject failed' }
# 注意：keeper 不自归属——真机验证（嵌套 Job 语义）：keeper 自归属后再 assign 同层进程
# 必拒（err=5）；保持 Job 空、由首个子进程分配时建立嵌套层级，后续分配照常成功。
[Console]::Out.WriteLine('ready ' + $PID)
[Console]::Out.Flush()
$pending = New-Object 'System.Collections.Generic.HashSet[int]'
$stop = $false
while (-not $stop) {
    try {
        # 指令队列（host 写 *.cmd——claim/exclude/terminate，读后删；单条故障跳过不致命）
        $cmds = @(Get-ChildItem -LiteralPath $queueDir -Filter '*.cmd' -ErrorAction SilentlyContinue)
        foreach ($f in $cmds) {
            try {
                $line = (Get-Content -LiteralPath $f.FullName -Raw -ErrorAction Stop).Trim()
                if ($line -eq 'terminate') {
                    Remove-Item -LiteralPath $f.FullName -Force -ErrorAction SilentlyContinue
                    $stop = $true; break
                }
                if ($line.StartsWith('claim ')) {
                    $targetPid = [int]$line.Substring(6)
                    if ($pending.Contains($targetPid)) {
                        [void]$pending.Remove($targetPid)
                        $h = [JobTreeNative]::OpenProcess(0x0101, $false, $targetPid)
                        if ($h -ne [IntPtr]::Zero) {
                            if ([JobTreeNative]::AssignProcessToJobObject($job, $h)) { [Console]::Out.WriteLine('assigned ' + $targetPid) }
                            else { [Console]::Out.WriteLine('assign-failed ' + $targetPid + ' err=' + [System.Runtime.InteropServices.Marshal]::GetLastWin32Error()) }
                            [void][JobTreeNative]::CloseHandle($h)
                        } else { [Console]::Out.WriteLine('assign-failed ' + $targetPid) }
                    }
                } elseif ($line.StartsWith('exclude ')) {
                    [void]$pending.Remove([int]$line.Substring(8))
                }
                Remove-Item -LiteralPath $f.FullName -Force -ErrorAction SilentlyContinue # 处理成功才删——失败重试
            } catch { [Console]::Out.WriteLine('cmd-error ' + $_.Exception.Message) }
        }
        if ($stop) { break }
        # 进程枚举（CIM——避免 Toolhelp 结构体跨 PS 版本编组差异）：宿主新直接子进程上报
        # candidate；宿主消亡 = 自终止整树回收。枚举故障 = 本 tick 跳过（fail-soft 不退环）
        $hostAlive = $false
        $procs = @(Get-CimInstance -ClassName Win32_Process -Property ProcessId, ParentProcessId -ErrorAction SilentlyContinue)
        foreach ($p in $procs) {
            if ($p.ProcessId -eq $hostPid) { $hostAlive = $true }
            if ($p.ParentProcessId -eq $hostPid -and $p.ProcessId -ne $PID -and -not $excluded.Contains([int]$p.ProcessId) -and -not $pending.Contains([int]$p.ProcessId)) {
                [void]$pending.Add([int]$p.ProcessId)
                [Console]::Out.WriteLine('candidate ' + $p.ProcessId)
            }
        }
        [Console]::Out.Flush()
        if (-not $hostAlive) { $stop = $true; break }
    } catch { [Console]::Out.WriteLine('tick-error ' + $_.Exception.Message) }
    Start-Sleep -Milliseconds $pollMs
}
[void][JobTreeNative]::TerminateJobObject($job, 1) # 整树回收（宿主消亡径同此）
[Console]::Out.Flush()
`

/** PowerShell 可执行解析（pwsh 7 优先，缺席回退 Windows PowerShell 5.1——keeper 全兼容面） */
let powerShellExe: string | undefined

function resolvePowerShell(): string {
  powerShellExe ??= (() => {
    for (const exe of ['pwsh', 'powershell']) {
      try {
        execFileSync('where.exe', [exe], { stdio: 'pipe' })
        return exe
      } catch {
        // 本候选不在 PATH——尝试下一候选
      }
    }
    return 'powershell'
  })()
  return powerShellExe
}

/** Add-Type 编译缓存（进程级单飞——首个守卫装配，余者复用 Dll + 脚本） */
let assemblyPromise: Promise<KeeperAssembly> | undefined

/** 编译子进程 spawn 缝（测试注入桩——默认真 spawn）；导出（单测观察面——出生路径登记断言） */
export type CompileSpawner = typeof spawn

export function ensureKeeperAssembly(
  deps: { readonly spawnCompile?: CompileSpawner; readonly forceCompile?: boolean } = {},
): Promise<KeeperAssembly> {
  const spawnCompile = deps.spawnCompile ?? spawn
  assemblyPromise ??= (async (): Promise<KeeperAssembly> => {
    const dir = join(tmpdir(), 'dsh-forge-jobtree')
    mkdirSync(dir, { recursive: true })
    const assemblyPath = join(dir, `jobtree-native-v${JOB_TREE_VERSION}.dll`)
    const scriptPath = join(dir, `jobtree-keeper-v${JOB_TREE_VERSION}.ps1`)
    if (!existsSync(scriptPath)) writeFileSync(scriptPath, '\uFEFF' + KEEPER_PS, 'utf8') // BOM——PS 5.1 无 BOM 按 ANSI 读，中文注释乱码破坏解析
    if (!existsSync(assemblyPath) || deps.forceCompile === true) {
      const csPath = join(dir, `jobtree-native-v${JOB_TREE_VERSION}.cs`)
      writeFileSync(csPath, KEEPER_CS, 'utf8')
      await new Promise<void>((resolve, reject) => {
        const child = spawnCompile(
          resolvePowerShell(),
          [
            '-NoProfile',
            '-NonInteractive',
            '-NoLogo',
            '-Command',
            `Add-Type -TypeDefinition (Get-Content -Raw -LiteralPath '${csPath.replace(/'/g, "''")}') -Language CSharp -OutputAssembly '${assemblyPath.replace(/'/g, "''")}' -OutputType Library`,
          ],
          { windowsHide: true, stdio: 'ignore' } satisfies SpawnOptions,
        )
        // 出生即登记：编译子进程恰跑在它即将服务的在世 keeper 旁——不登记会被该 keeper
        // 当 candidate 收编（修复声称保护却未登记的出生路径缺口）
        noteHostOwnedChild(child)
        child.once('error', reject)
        child.once('exit', (code) => (code === 0 ? resolve() : reject(new Error(`keeper 原生绑定编译失败（exit ${code}）`))))
      })
    }
    return { assemblyPath, scriptPath }
  })()
  return assemblyPromise
}

// ─────────────────────────── host 端仲裁登记（多 guard 互斥单点归属） ───────────────────────────

interface GuardRecord {
  guard: WorkerTreeGuardImpl
}

/** 活跃守卫登记（模块级——同宿主进程内所有 per-worker keeper 的仲裁点） */
const activeGuards = new Set<GuardRecord>()

/** 已仲裁 pid → 归属守卫（先报者得——嵌套 Job 误归属消解） */
const claimedPids = new Map<number, GuardRecord>()

/**
 * 宿主自有 exec 子进程登记（显式 exclude——结算期 git 核验、回收 taskkill 等
 * 非 worker 树宿主子进程不被任何在世 keeper 收编；exit/error 即解除，pid 复用零误伤）。
 * Root cause: keeper 只能按「宿主直接子进程」启发式上报，宿主自有 exec 子进程与
 * in-process worker 孙进程在同一父进程下无父系可辨——归属判据必须由 host 单点补齐。
 */
const hostOwnedPids = new Set<number>()

/** 宿主自有 exec 子进程登记（spawn 后即调；进程退出自动解除） */
export function noteHostOwnedChild(child: ChildProcess): void {
  if (child.pid === undefined) return
  const pid = child.pid
  hostOwnedPids.add(pid)
  const release = (): void => {
    hostOwnedPids.delete(pid)
  }
  child.once('exit', release)
  child.once('error', release)
}

/** hostOwned 登记只读快照（单测观察面——出生路径登记/退出解除断言用） */
export function hostOwnedPidsSnapshot(): readonly number[] {
  return [...hostOwnedPids]
}

// ─────────────────────────── 守卫实现 ───────────────────────────

class WorkerTreeGuardImpl implements WorkerTreeGuard {
  keeperPid: number | undefined
  /** keeper 子进程 pid（spawn 返回即知——ready 行处理前的互认竞态窗口仲裁键） */
  keeperSpawnPid: number | undefined
  readonly whenReady: Promise<void>
  readonly record: GuardRecord = { guard: this }
  private readonly exclusions = new Set<number>()
  private readonly queueDir: string
  private keeper: KeeperProcess | undefined
  private keeperDead = false
  /** keeper 是否已 ready（未就绪先亡判据——不随 reclaim 的 keeperPid 复位清零） */
  private keeperReady = false
  private queueSeq = 0
  private done = false
  private reclaimPromise: Promise<boolean> | undefined
  private readonly launcher: KeeperLauncher
  private readonly hostPid: number
  private enabled: boolean

  constructor(deps: { readonly keeperAssembly?: Promise<KeeperAssembly> }, launcher: KeeperLauncher, hostPid: number, enabled: boolean) {
    this.launcher = launcher
    this.hostPid = hostPid
    this.enabled = enabled
    this.queueDir = join(tmpdir(), 'dsh-forge-jobtree', `queue-${randomUUID()}`)
    activeGuards.add(this.record) // 仲裁登记入构造器——spawn 即在世（工厂零后置窗口）
    this.whenReady = enabled ? this.bootstrap(deps.keeperAssembly ?? ensureKeeperAssembly()) : Promise.resolve()
  }

  private queueDirReady = false

  /** 指令队列目录就绪（懒建——send 前置条件；失败 = 守卫禁用态化） */
  private ensureQueueDir(): boolean {
    if (this.queueDirReady) return true
    try {
      mkdirSync(this.queueDir, { recursive: true })
      this.queueDirReady = true
      return true
    } catch (err) {
      console.error('[job-tree] 指令队列目录创建失败——守卫禁用', err)
      this.enabled = false
      return false
    }
  }

  private async bootstrap(assembly: Promise<KeeperAssembly>): Promise<void> {
    try {
      // 既有 keeper 互认链：新 keeper 出生即排除已登记 keeper（keeperPid 与 spawn pid 双键——
      // 对方 ready 未处理时 spawn pid 是唯一已知仲裁键）
      const initial = [...this.exclusions]
      for (const record of activeGuards) {
        if (record.guard === this) continue
        if (record.guard.keeperPid !== undefined) initial.push(record.guard.keeperPid)
        if (record.guard.keeperSpawnPid !== undefined) initial.push(record.guard.keeperSpawnPid)
      }
      const { assemblyPath, scriptPath } = await assembly
      if (this.done) return
      if (!this.ensureQueueDir()) return
      const raw = this.launcher({ hostPid: this.hostPid, pollMs: KEEPER_POLL_MS, exclusions: initial, assemblyPath, scriptPath, queueDir: this.queueDir })
      this.keeper = raw
      // spawn 即仲裁登记（互认竞态窗口消解）：keeper pid 已知即先报者定为本守卫，
      // 他守卫立即获 exclude——旧 keeper 300ms 轮询先上报也只是触发 host 侧 exclude
      if (raw.pid !== undefined) {
        this.keeperSpawnPid = raw.pid
        claimedPids.set(raw.pid, this.record)
        for (const other of activeGuards) {
          if (other.guard !== this) other.guard.exclude(raw.pid)
        }
      }
      // keeper 未就绪先亡（PowerShell 缺席/脚本异常）——守卫转禁用态（fail-soft，不再等 ready）
      void raw.exited.then(() => {
        if (process.env.DSH_FORGE_TREE_GUARD_DEBUG === 'on') console.error(`[job-tree] keeper exited before reclaim`)
        // Root cause: reclaim() 为 guard 复位先清 keeperPid——以 keeperPid===undefined 判
        // 「未就绪先亡」会把正常回收后的 keeper 退出误诊为禁用；就绪与否独立记账。
        if (!this.keeperReady) {
          this.keeperDead = true
          this.enabled = false
          this.done = true
          console.error('[job-tree] keeper 未就绪先亡——守卫禁用')
        }
      })
      const onLine = (line: string): void => this.onKeeperLine(line)
      raw.stdout.on('data', (chunk: Buffer | string) => {
        if (process.env.DSH_FORGE_TREE_GUARD_DEBUG === 'on') console.error(`[job-tree][keeper-out] ${String(chunk).trim()}`)
        for (const line of String(chunk).split('\n')) {
          const clean = line.replace(/\r$/, '').trim() // CRLF 剥离——[Console]::Out 行尾 \r 破坏锚定匹配
          if (clean !== '') onLine(clean)
        }
      })
      if (process.env.DSH_FORGE_TREE_GUARD_DEBUG === 'on') {
        console.error(`[job-tree] keeper spawned pid=${raw.pid} queue=${this.queueDir}`)
        const err = (raw as unknown as { stderr?: { on(ev: string, cb: (c: unknown) => void): void } }).stderr
        err?.on('data', (c) => console.error(`[job-tree][keeper-err] ${String(c).trim()}`))
      }
    } catch (err) {
      console.error('[job-tree] keeper 装配失败——守卫禁用', err)
      this.enabled = false // fail-soft 禁用态——worker 正常路径不受守卫装配故障牵连
      this.done = true
    }
  }

  private onKeeperLine(line: string): void {
    const ready = /^ready (\d+)$/.exec(line)
    if (ready !== null) {
      this.keeperPid = Number(ready[1])
      this.keeperReady = true
      claimedPids.set(this.keeperPid, this.record) // 与 spawn pid 不一致时兜底再登记（幂等）
      for (const record of activeGuards) {
        if (record.guard !== this) record.guard.exclude(this.keeperPid)
      }
      return
    }
    const candidate = /^candidate (\d+)$/.exec(line)
    if (candidate !== null) {
      const pid = Number(candidate[1])
      // keeper 本体（他守卫的监督进程）永不收编——双键匹配：keeperPid（ready 后）与
      // keeperSpawnPid（spawn 即知——互认竞态窗口内的唯一在世仲裁键）
      for (const record of activeGuards) {
        const guard = record.guard
        if (guard.keeperPid === pid || guard.keeperSpawnPid === pid) {
          this.send(`exclude ${pid}`)
          return
        }
      }
      // 宿主自有 exec 子进程（结算 git 核验等）——显式 exclude，永不收编
      if (hostOwnedPids.has(pid)) {
        this.send(`exclude ${pid}`)
        return
      }
      if (claimedPids.has(pid)) return // 已归属他守卫——本守卫零动作（仲裁单点）
      const record: GuardRecord = { guard: this }
      claimedPids.set(pid, record)
      this.send(`claim ${pid}`)
      for (const other of activeGuards) {
        if (other.guard !== this) other.guard.exclude(pid)
      }
      return
    }
    // assigned / assign-failed = 单知会行（fail-soft——无回写、不抛）
  }

  /** 指令投递（文件队列——写临时名后原子改名，keeper 只认 *.cmd 零部分读） */
  private send(line: string): void {
    if (this.done && line !== 'terminate') return
    if (!this.ensureQueueDir()) return
    const name = `${Date.now()}-${this.queueSeq++}`
    try {
      writeFileSync(join(this.queueDir, `${name}.part`), line + '\n', 'utf8')
      rmSync(join(this.queueDir, `${name}.cmd`), { force: true })
      renameSync(join(this.queueDir, `${name}.part`), join(this.queueDir, `${name}.cmd`))
    } catch (err) {
      // 队列写失败 = 指令不可达（禁用态化）——worker 正常路径不受牵连
      console.error('[job-tree] 指令队列写失败——指令不可达，守卫禁用', err)
      this.enabled = false
    }
  }

  exclude(pid: number): void {
    this.exclusions.add(pid)
    this.send(`exclude ${pid}`)
  }

  reclaim(): Promise<boolean> {
    if (this.reclaimPromise !== undefined) return this.reclaimPromise
    const keeper = this.keeper
    this.done = true
    this.keeperPid = undefined // guard 复位——回收即失能，后续知会行零动作
    if (keeper === undefined || this.keeperDead) {
      // keeper 从未生效（spawn 失败 / 未就绪先亡）——无回收面
      this.reclaimPromise = Promise.resolve(false)
      return this.reclaimPromise
    }
    // terminate + taskkill 兜底独立于 enabled：队列写失败禁用态也必须回收 keeper（防孤儿）
    const keeperPid = keeper.pid
    const exited = keeper.exited
    const queueDir = this.queueDir
    this.send('terminate')
    this.reclaimPromise = (async () => {
      await Promise.race([exited, new Promise<void>((resolve) => setTimeout(resolve, RECLAIM_GRACE_MS))])
      if (keeperPid !== undefined) {
        // 宽限未退兜底：taskkill 整树杀 keeper（keeper 自归属 Job——其子进程一并随树清理）
        await new Promise<void>((resolve) => {
          const taskkill = execFile('taskkill', ['/PID', String(keeperPid), '/T', '/F'], () => resolve())
          noteHostOwnedChild(taskkill) // 宿主自有子进程——在世 keeper 不得收编回收工具本身
        })
      }
      try {
        rmSync(queueDir, { recursive: true, force: true }) // 指令队列随守卫回收
      } catch {
        // 目录清理失败不碍回收结果
      }
      return true
    })()
    return this.reclaimPromise
  }
}

// ─────────────────────────── 工厂 ───────────────────────────

/** 真 keeper 启动器（PowerShell 协议进程——windowsHide 零窗口；指令通道 = 文件队列） */
const pwshKeeperLauncher: KeeperLauncher = ({ hostPid, pollMs, exclusions, assemblyPath, scriptPath, queueDir }) => {
  const child: ChildProcess = spawn(
    resolvePowerShell(),
    [
      '-NoProfile',
      '-NonInteractive',
      '-NoLogo',
      '-ExecutionPolicy',
      'Bypass',
      '-File',
      scriptPath,
      String(hostPid),
      String(pollMs),
      exclusions.join(','),
      assemblyPath,
      queueDir,
    ],
    { windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'] } satisfies SpawnOptions,
  )
  const exited = new Promise<void>((resolve) => {
    child.once('exit', (code) => {
      if (process.env.DSH_FORGE_TREE_GUARD_DEBUG === 'on') console.error(`[job-tree][keeper-exit] pid=${child.pid} code=${code}`)
      resolve()
    })
    child.once('error', () => resolve())
  })
  return {
    pid: child.pid,
    stdout: child.stdout!,
    stderr: child.stderr!,
    exited,
  }
}

/**
 * worker 进程树守卫工厂（per-worker 会话一把）。装配失败（非 win32 / PowerShell 缺席 /
 * 原生绑定编译失败）= 禁用态 fail-soft——全 no-op 不抛，worker 正常路径零牵连。
 */
export function createWorkerTreeGuard(deps: WorkerTreeGuardDeps = {}): WorkerTreeGuard {
  const platform = deps.platform ?? process.platform
  const hostPid = deps.hostPid ?? process.pid
  const launcher = deps.keeperLauncher ?? pwshKeeperLauncher
  const envOff = process.env.DSH_FORGE_TREE_GUARD === GUARD_ENV_OFF
  if (platform !== 'win32' || envOff) return noopWorkerTreeGuard()
  const guard = new WorkerTreeGuardImpl({ keeperAssembly: deps.keeperAssembly }, launcher, hostPid, true)
  const record: GuardRecord = { guard }
  activeGuards.add(record)
  const originalReclaim = guard.reclaim.bind(guard)
  guard.reclaim = (): Promise<boolean> => {
    activeGuards.delete(record)
    for (const [pid, r] of claimedPids) {
      if (r === record) claimedPids.delete(pid)
    }
    return originalReclaim()
  }
  return guard
}

/** 守卫工厂依赖（platform/launcher/装配注入——单测桩化；缺席 = 真 win32 装配） */
export interface WorkerTreeGuardDeps {
  readonly platform?: string
  readonly hostPid?: number
  readonly keeperLauncher?: KeeperLauncher
  /** keeper 装配（测试注入桩——缺省真编译缓存） */
  readonly keeperAssembly?: Promise<KeeperAssembly>
}

/** 生产装配缺省守卫工厂（环境开关 + fail-soft） */
export function defaultWorkerTreeGuard(): WorkerTreeGuard {
  return createWorkerTreeGuard()
}
