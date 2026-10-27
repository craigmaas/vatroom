import type { WorkspaceSnapshot } from '@/domain/types'

/**
 * Storage shim.
 *
 * The app talks to one `StorageAdapter`. Today that is `LocalStorageAdapter`
 * (browser-only, per device). For the cloud launch, implement `CloudAdapter`
 * against the API and flip `createAdapter()` — nothing in the UI changes.
 *
 * The contract is deliberately coarse (whole-workspace snapshot) for the local
 * phase; `patch()` exists so a cloud implementation can send deltas instead of
 * full snapshots as the product grows.
 */
export interface StorageAdapter {
  readonly kind: 'local' | 'cloud' | 'memory'
  /** Load the full workspace. Returns null when nothing has been saved yet. */
  load(): Promise<WorkspaceSnapshot | null>
  /** Persist the full workspace. */
  save(snapshot: WorkspaceSnapshot): Promise<void>
  /** Optional delta hook — a cloud adapter can implement this to avoid full saves. */
  patch?(orgId: string, collection: string, upsert: unknown[], removeIds: string[]): Promise<void>
  /** Wipe everything (used by "Reset demo data"). */
  clear(): Promise<void>
  /** Subscribe to external changes (another tab, another user). Returns an unsubscribe. */
  subscribe?(onChange: (snapshot: WorkspaceSnapshot) => void): () => void
}

export const SNAPSHOT_VERSION = 1
