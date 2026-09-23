/**
 * The per-card migration entry mount (task 1.7): the 1.6 entry-guard hook is
 * per-project (useMigrationGuard reads + subscribes for ONE projectId), so
 * the card's action row hosts this small wrapper — one hook instance per
 * migratable card — around the 1.6 {@link MigrationEntryButton}. The card
 * stays presentational (status in, entry out); the guard's disabled+tooltip
 * state (在跑编排守卫, ≤5s event-driven recovery) rides entirely in here.
 */
import type { MigrationFace } from '../../../contract'
import type { WorkbenchKey } from '../../../locale/en'
import { useMigrationGuard } from './MigrateGuard'
import { MigrationEntryButton } from './MigrationPill'

/** Inputs of {@link MigrationCardEntry}. */
export interface MigrationCardEntryProps {
  /** The locale seat (the shell's `t`). */
  readonly t: (key: WorkbenchKey) => string
  /** The guarded project (the guard's read + event filter). */
  readonly projectId: string
  /** The migration family's face (loadGuard + subscribeEvents legs). */
  readonly face: MigrationFace
  /** False renders nothing (the entry retires on the migrated card). */
  readonly migratable: boolean
  /** Open the confirm dialog (the explicit-migration Hard Rule's single door). */
  readonly onOpen: () => void
}

/**
 * The guarded 「迁移」 entry. `data-dsh-forge-migration-entry` (on the button
 * inside) is the observation hook; this wrapper carries no markup of its own.
 */
export function MigrationCardEntry(props: MigrationCardEntryProps) {
  const guard = useMigrationGuard({
    t: props.t,
    projectId: props.projectId,
    face: props.face,
    enabled: props.migratable,
  })
  return (
    <MigrationEntryButton
      t={props.t}
      migratable={props.migratable}
      blocked={guard.blocked}
      tooltip={guard.tooltip}
      onOpen={props.onOpen}
    />
  )
}
