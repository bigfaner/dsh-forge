// @vitest-environment jsdom
// Task 1.6 — the UF3 migration component family BUILD units (mocked verbs;
// 1.7 wires the ProjectCard/wizard integration). AC map:
//   AC1 pill 两态 + 对话框族态机(migratable/confirming/migrating/done/
//      failed-rolled-back;向导路径态由 1.7 复用,本件不测)
//   AC2 close-guard:执行中 Esc/✕/mask 全部无效;done/failed 可关
//   AC3 步骤行 = 校验/迁移/对拍(备份并入校验行内呈现路径);成功态对拍结论;
//      失败态回滚说明 + [重试]
//   AC4 守卫态:在跑编排 → 入口 disabled + tooltip;事件回流自动恢复
//   AC5 两条主链:确认→进度→完成、确认→进度→失败→重试
import { act, cleanup, fireEvent, render, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { en, type WorkbenchKey } from '../src/client/locale/en.ts'
import { zh } from '../src/client/locale/zh.ts'
import type { WorkbenchEvent } from '../src/client/ipc-types.ts'
import type { MigrationFace, MigrationGuardSnapshot } from '../src/client/contract.ts'
import { createMockMigrationFace, MOCK_MIGRATION_BACKUP_PATH } from '../src/client/mocks/workbench.ts'
import {
  MIGRATION_STEPS, applyMigrationProgressEvent, initialMigrationRunState, runningMigrationRunState,
  stepOfPhase,
} from '../src/client/views/overview/migration/MigrateProgressDialog.tsx'
import { MigrationDialogs } from '../src/client/views/overview/migration/MigrateProgressDialog.tsx'
import { MigrationEntryButton, MigrationPill } from '../src/client/views/overview/migration/MigrationPill.tsx'
import { useMigrationGuard } from '../src/client/views/overview/migration/MigrateGuard.ts'

type Dict = Record<WorkbenchKey, string>
const bind = (dict: Dict) => (key: WorkbenchKey): string => dict[key]
const t = { en: bind(en), zh: bind(zh) }

const PROJECT_ID = 'proj-mig-1'

/** Deferred promise helper: the manual face's startMigration legs resolve on demand. */
function deferred<T>(): { promise: Promise<T>; resolve: (value: T) => void; reject: (error: unknown) => void } {
  let resolve: (value: T) => void = () => {}
  let reject: (error: unknown) => void = () => {}
  const promise = new Promise<T>((res, rej) => {
    resolve = res
    reject = rej
  })
  return { promise, resolve, reject }
}

/**
 * The MANUAL twin: startMigration parks on a deferred (tests push
 * migration_progress batches and settle the verb step-wise — the precise
 * close-guard observation the auto-advancing mock twin cannot give).
 */
function makeManualFace() {
  const listeners = new Set<(events: readonly WorkbenchEvent[]) => void>()
  let guard: MigrationGuardSnapshot = { blocked: false, runningCount: 0 }
  const starts: Array<{ resolve: (value: { started: true }) => void; reject: (error: unknown) => void }> = []
  return {
    face: {
      getMigrationStatus: async () => ({
        authority: 'files' as const,
        deviated: false,
        migratedAt: null,
        lastEvent: {
          id: 'ev-backup',
          projectId: PROJECT_ID,
          phase: 'backup' as const,
          result: 'ok' as const,
          detailJson: JSON.stringify({ backupPath: MOCK_MIGRATION_BACKUP_PATH }),
          at: '2026-09-24T08:00:00.000Z',
        },
      }),
      startMigration: () => {
        const d = deferred<{ started: true }>()
        starts.push(d)
        return d.promise
      },
      subscribeEvents: (listener: (events: readonly WorkbenchEvent[]) => void) => {
        listeners.add(listener)
        return () => { listeners.delete(listener) }
      },
      loadGuard: async () => guard,
    } satisfies MigrationFace,
    emit: (events: readonly WorkbenchEvent[]) => {
      for (const listener of [...listeners]) listener(events)
    },
    setGuard: (snapshot: MigrationGuardSnapshot) => { guard = snapshot },
    starts,
  }
}

/** migration_progress event literal helper. */
function mig(
  phase: 'backup' | 'ingest' | 'verify' | 'switch' | 'archive' | 'rollback' | 'reingest',
  result: 'ok' | 'fail',
  projectId: string = PROJECT_ID,
): WorkbenchEvent {
  return { type: 'migration_progress', projectId, phase, result }
}

afterEach(cleanup)

// ---------------------------------------------------------------------------
// AC1 · MigrationPill 两态(可迁移 warn / 已迁移 success)
// ---------------------------------------------------------------------------

describe('MigrationPill (AC1)', () => {
  it('renders the migratable warn pill and the migrated success pill in both locales', () => {
    for (const seat of [t.en, t.zh]) {
      const { unmount, getByText } = render(<MigrationPill t={seat} status="migratable" />)
      expect(getByText(seat('migration.pill.migratable'))).toBeTruthy()
      const pill = document.querySelector('[data-dsh-forge-migration-pill="migratable"]')
      expect(pill).not.toBeNull()
      unmount()

      const { getByText: getByText2 } = render(<MigrationPill t={seat} status="migrated" />)
      expect(getByText2(seat('migration.pill.migrated'))).toBeTruthy()
      expect(document.querySelector('[data-dsh-forge-migration-pill="migrated"]')).not.toBeNull()
    }
  })

  it('renders the migration entry (hidden when not migratable; disabled + tooltip under guard)', () => {
    const { getByRole, queryByRole, rerender } = render(
      <MigrationEntryButton t={t.zh} migratable blocked={false} onOpen={() => {}} />,
    )
    const entry = getByRole('button', { name: t.zh('migration.entry.migrate') })
    expect((entry as HTMLButtonElement).disabled).toBe(false)

    rerender(<MigrationEntryButton t={t.zh} migratable blocked tooltip={t.zh('migration.entry.guardTooltip')} onOpen={() => {}} />)
    expect((entry as HTMLButtonElement).disabled).toBe(true)
    expect(entry.getAttribute('title')).toBe(t.zh('migration.entry.guardTooltip'))

    rerender(<MigrationEntryButton t={t.zh} migratable={false} blocked={false} onOpen={() => {}} />)
    expect(queryByRole('button', { name: t.zh('migration.entry.migrate') })).toBeNull()
  })
})

// ---------------------------------------------------------------------------
// AC1/AC3 · pure run view-model(步骤行枚举 + 相位映射)
// ---------------------------------------------------------------------------

describe('migration run view-model (AC1/AC3)', () => {
  it('enumerates exactly the three step rows 校验/迁移/对拍', () => {
    expect([...MIGRATION_STEPS]).toEqual(['verify', 'migrate', 'parity'])
    expect(stepOfPhase('backup')).toBe('verify')
    expect(stepOfPhase('ingest')).toBe('migrate')
    expect(stepOfPhase('verify')).toBe('parity')
    expect(stepOfPhase('switch')).toBe('parity')
    expect(stepOfPhase('archive')).toBe('parity')
    // 非步骤行事件:rollback/reingest 不占步骤行(终态/回收归呈现层)。
    expect(stepOfPhase('rollback')).toBeNull()
    expect(stepOfPhase('reingest')).toBeNull()
  })

  it('starts with 校验 active and advances rows with phase completions', () => {
    let state = initialMigrationRunState()
    expect(state.status).toBe('idle')
    state = runningMigrationRunState()
    expect(state.status).toBe('running')
    expect(state.steps.verify).toBe('active')
    expect(state.steps.migrate).toBe('todo')
    expect(state.steps.parity).toBe('todo')

    state = applyMigrationProgressEvent(state, mig('backup', 'ok'))
    expect(state.steps.verify).toBe('done')
    expect(state.steps.migrate).toBe('active')

    state = applyMigrationProgressEvent(state, mig('ingest', 'ok'))
    expect(state.steps.migrate).toBe('done')
    expect(state.steps.parity).toBe('active')

    state = applyMigrationProgressEvent(state, mig('verify', 'ok'))
    expect(state.steps.parity).toBe('active') // switch/archive 未全 → 对拍未完
    state = applyMigrationProgressEvent(state, mig('switch', 'ok'))
    expect(state.steps.parity).toBe('active')
    state = applyMigrationProgressEvent(state, mig('archive', 'ok'))
    expect(state.steps.parity).toBe('done')
  })

  it('marks the failed step error (backup/ingest/verify fail edges) and ignores rollback/reingest rows', () => {
    let state = runningMigrationRunState()
    state = applyMigrationProgressEvent(state, mig('backup', 'fail'))
    expect(state.steps.verify).toBe('error')
    expect(state.steps.migrate).toBe('todo')
    expect(state.failedPhase).toBe('backup')

    state = runningMigrationRunState()
    state = applyMigrationProgressEvent(state, mig('backup', 'ok'))
    state = applyMigrationProgressEvent(state, mig('ingest', 'fail'))
    expect(state.steps.verify).toBe('done')
    expect(state.steps.migrate).toBe('error')
    expect(state.steps.parity).toBe('todo')

    state = applyMigrationProgressEvent(state, mig('rollback', 'ok'))
    expect(state.failedPhase).toBe('ingest') // rollback 不改步骤行(终态归动词拒绝)
    state = applyMigrationProgressEvent(state, mig('reingest', 'ok'))
    expect(state.steps.migrate).toBe('error') // 回收相位与一次性迁移呈现无关

    state = runningMigrationRunState()
    for (const phase of ['backup', 'ingest'] as const) state = applyMigrationProgressEvent(state, mig(phase, 'ok'))
    state = applyMigrationProgressEvent(state, mig('switch', 'fail'))
    expect(state.steps.parity).toBe('error') // switch/archive 归对拍行(Interface 4 顺序尾)
  })
})

// ---------------------------------------------------------------------------
// AC1/AC2/AC3/AC5 · the dialog family flow(两条主链 + close-guard)
// ---------------------------------------------------------------------------

function renderDialogs(face: MigrationFace, seat: (key: WorkbenchKey) => string = t.zh) {
  const onSettled = vi.fn()
  const onClose = vi.fn()
  const utils = render(
    <MigrationDialogs
      t={seat}
      projectId={PROJECT_ID}
      face={face}
      backupPath={MOCK_MIGRATION_BACKUP_PATH}
      open
      onSettled={onSettled}
      onClose={onClose}
    />,
  )
  return { ...utils, onSettled, onClose }
}

describe('MigrationDialogs (AC1/AC2/AC3/AC5)', () => {
  it('chain 1: 确认 → 进度 → 完成(auto mock 动词全相位推进)', async () => {
    const face = createMockMigrationFace()
    const { getByText, onSettled, onClose } = renderDialogs(face.face)

    // confirming:确认对话框(备份路径 mono + 步骤说明)
    const confirmDialog = document.querySelector('[data-dsh-forge-dialog="migrate-confirm"]')
    expect(confirmDialog).not.toBeNull()
    expect(getByText(t.zh('migration.confirm.title'))).toBeTruthy()
    const backup = document.querySelector('[data-dsh-forge-migrate-backup-path]')
    expect(backup?.textContent).toBe(MOCK_MIGRATION_BACKUP_PATH)

    await act(async () => {
      fireEvent.click(getByText(t.zh('migration.confirm.migrate')))
    })

    // migrating → done:同对话框演进,步骤全 ✓ + 对拍结论 + [完成]
    await waitFor(() => {
      expect(document.querySelector('[data-dsh-forge-migration-run]')?.getAttribute('data-dsh-forge-migration-run')).toBe('done')
    })
    for (const step of MIGRATION_STEPS) {
      expect(document.querySelector(`[data-dsh-forge-migration-step="${step}"]`)?.getAttribute('data-state')).toBe('done')
    }
    expect(document.querySelector('[data-dsh-forge-migration-parity-ok]')?.textContent).toContain(t.zh('migration.result.parityOk'))
    expect(onSettled).toHaveBeenCalledWith('migrated')

    // done 态可关:✕ 存在,点击完成 → onClose
    expect(document.querySelector('[data-dsh-forge-dialog-close]')).not.toBeNull()
    await act(async () => {
      fireEvent.click(getByText(t.zh('migration.result.done')))
    })
    expect(onClose).toHaveBeenCalledTimes(1)
  })

  it('chain 2: 确认 → 进度 → 失败(回滚说明 + [重试])→ 重试成功', async () => {
    const face = createMockMigrationFace({ failAtPhase: 'verify' })
    const { getByText, onSettled } = renderDialogs(face.face)

    await act(async () => {
      fireEvent.click(getByText(t.zh('migration.confirm.migrate')))
    })
    await waitFor(() => {
      expect(document.querySelector('[data-dsh-forge-migration-run]')?.getAttribute('data-dsh-forge-migration-run')).toBe('failed')
    })
    expect(getByText(t.zh('migration.failed.title'))).toBeTruthy()
    expect(document.querySelector('[data-dsh-forge-migration-rollback-note]')?.textContent).toContain(t.zh('migration.failed.rollbackNote'))
    expect(onSettled).toHaveBeenCalledWith('failed')
    // 失败相标记在对拍行
    expect(document.querySelector('[data-dsh-forge-migration-step="parity"]')?.getAttribute('data-state')).toBe('error')

    // 重试走同流程(动词再发):换到成功结局 — 重置 mock 后重试
    face.settleNextAsSuccess()
    await act(async () => {
      fireEvent.click(getByText(t.zh('migration.failed.retry')))
    })
    await waitFor(() => {
      expect(document.querySelector('[data-dsh-forge-migration-run]')?.getAttribute('data-dsh-forge-migration-run')).toBe('done')
    })
    expect(face.startCalls).toBe(2)
  })

  it('close-guard:执行中 Esc/✕/mask 全部无效;done 态 Esc 可关 (AC2)', async () => {
    const manual = makeManualFace()
    const { getByText, onClose } = renderDialogs(manual.face)

    await act(async () => {
      fireEvent.click(getByText(t.zh('migration.confirm.migrate')))
    })
    // running:对话框打开,✕ 未渲染(不可取消的形态不装可取消的样子)
    const runDialog = document.querySelector('[data-dsh-forge-dialog="migrate-progress"]') as HTMLElement
    expect(runDialog).not.toBeNull()
    expect(document.querySelector('[data-dsh-forge-dialog-close]')).toBeNull()

    manual.emit([mig('backup', 'ok')])
    await waitFor(() => {
      expect(document.querySelector('[data-dsh-forge-migration-backup-path]')?.textContent).toBe(MOCK_MIGRATION_BACKUP_PATH)
    })

    // Esc 不注册关闭
    fireEvent.keyDown(runDialog, { key: 'Escape' })
    expect(onClose).not.toHaveBeenCalled()
    expect(document.querySelector('[data-dsh-forge-dialog="migrate-progress"]')).not.toBeNull()
    // mask 点击无效
    fireEvent.pointerDown(document.querySelector('[data-dsh-forge-dialog-mask]') ?? runDialog, {})
    expect(onClose).not.toHaveBeenCalled()

    // 失败终态:可关(✕ + Esc)
    manual.emit([mig('ingest', 'fail'), mig('rollback', 'ok')])
    await act(async () => {
      await manual.starts[0]?.reject({ code: 'ERR_WORKBENCH_DB', message: 'injected' })
    })
    await waitFor(() => {
      expect(document.querySelector('[data-dsh-forge-migration-run]')?.getAttribute('data-dsh-forge-migration-run')).toBe('failed')
    })
    expect(document.querySelector('[data-dsh-forge-dialog-close]')).not.toBeNull()
    fireEvent.keyDown(runDialog, { key: 'Escape' })
    await waitFor(() => {
      expect(onClose).toHaveBeenCalledTimes(1)
    })
  })

  it('ignores migration_progress events of other projects', async () => {
    const manual = makeManualFace()
    const { getByText } = renderDialogs(manual.face)
    await act(async () => {
      fireEvent.click(getByText(t.zh('migration.confirm.migrate')))
    })
    manual.emit([mig('backup', 'ok', 'proj-other')])
    await act(async () => {
      await manual.starts[0]?.resolve({ started: true })
    })
    // 其它项目的事件不驱动本机(步骤行仍是首行 active 终局补齐)
    await waitFor(() => {
      expect(document.querySelector('[data-dsh-forge-migration-run]')?.getAttribute('data-dsh-forge-migration-run')).toBe('done')
    })
  })

  it('startMigration 守卫拒绝 → 回确认态并内联呈现守卫说明(不进失败回滚态)', async () => {
    const manual = makeManualFace()
    const { getByText } = renderDialogs(manual.face)
    await act(async () => {
      fireEvent.click(getByText(t.zh('migration.confirm.migrate')))
    })
    await act(async () => {
      await manual.starts[0]?.reject({ code: 'ERR_MIGRATION_GUARD', message: '2 running dispatch(es)' })
    })
    await waitFor(() => {
      expect(document.querySelector('[data-dsh-forge-dialog="migrate-confirm"]')).not.toBeNull()
    })
    expect(document.querySelector('[data-dsh-forge-migrate-guard-note]')?.textContent).toContain(t.zh('migration.err.guard'))
    expect(document.querySelector('[data-dsh-forge-dialog="migrate-progress"]')).toBeNull()
  })

  it('取消确认 → onClose(显式确认前零动词)', async () => {
    const face = createMockMigrationFace()
    const { getByText, onClose } = renderDialogs(face.face)
    await act(async () => {
      fireEvent.click(getByText(t.zh('migration.confirm.cancel')))
    })
    expect(onClose).toHaveBeenCalledTimes(1)
    expect(face.startCalls).toBe(0)
  })
})

// ---------------------------------------------------------------------------
// AC4 · 在跑编排守卫(disabled + tooltip + 事件回流自动恢复)
// ---------------------------------------------------------------------------

/** The guard harness: the hook + the entry button it drives (the 1.7 card shape). */
function GuardHarness(props: { face: MigrationFace; enabled?: boolean }) {
  const guard = useMigrationGuard({ t: t.zh, projectId: PROJECT_ID, face: props.face, enabled: props.enabled ?? true })
  return (
    <MigrationEntryButton
      t={t.zh}
      migratable
      blocked={guard.blocked}
      tooltip={guard.tooltip}
      onOpen={() => {}}
    />
  )
}

describe('useMigrationGuard (AC4)', () => {
  it('blocks the entry with the tooltip while orchestrations run and auto-recovers on events', async () => {
    const face = createMockMigrationFace({ guard: { blocked: true, runningCount: 2 } })
    render(<GuardHarness face={face.face} />)
    const entry = document.querySelector('[data-dsh-forge-migration-entry]') as HTMLButtonElement
    await waitFor(() => {
      expect(entry.disabled).toBe(true)
    })
    expect(entry.getAttribute('title')).toBe(t.zh('migration.entry.guardTooltip'))

    // 编排结束(同项目事件回流)→ 守卫重读 → ≤5s 自动恢复(事件批 ≤500ms + 即时重读)
    face.setGuard({ blocked: false, runningCount: 0 })
    face.emit([{ type: 'task_updated', projectId: PROJECT_ID, taskKey: 'f/1.1', source: null, changeKind: 'attribute' }])
    await waitFor(() => {
      expect(entry.disabled).toBe(false)
    })
    expect(entry.getAttribute('title')).toBeNull()

    // 其它项目的事件不触发重读
    face.setGuard({ blocked: true, runningCount: 1 })
    face.emit([{ type: 'feature_updated', projectId: 'proj-other', featureSlug: 'x' }])
    await act(async () => {
      await Promise.resolve()
    })
    expect(entry.disabled).toBe(false)
  })

  it('never blocks when disabled (向导路径不设守卫 — ui-design 裁决)', async () => {
    const face = createMockMigrationFace({ guard: { blocked: true, runningCount: 1 } })
    render(<GuardHarness face={face.face} enabled={false} />)
    const entry = document.querySelector('[data-dsh-forge-migration-entry]') as HTMLButtonElement
    await act(async () => {
      await Promise.resolve()
    })
    expect(entry.disabled).toBe(false)
    expect(face.guardReads).toBe(0)
  })
})
