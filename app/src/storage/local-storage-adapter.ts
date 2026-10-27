import type { WorkspaceSnapshot } from '@/domain/types'
import type { StorageAdapter } from './adapter'

const KEY = 'cellarhand.workspace.v1'

/**
 * Persists the workspace to `localStorage` and keeps other open tabs in sync
 * through the `storage` event. Writes are debounced by the store, not here.
 */
export class LocalStorageAdapter implements StorageAdapter {
  readonly kind = 'local' as const

  async load(): Promise<WorkspaceSnapshot | null> {
    try {
      const raw = localStorage.getItem(KEY)
      if (!raw) return null
      return JSON.parse(raw) as WorkspaceSnapshot
    } catch (err) {
      console.warn('[cellarhand] could not read local storage', err)
      return null
    }
  }

  async save(snapshot: WorkspaceSnapshot): Promise<void> {
    try {
      localStorage.setItem(KEY, JSON.stringify(snapshot))
    } catch (err) {
      console.warn('[cellarhand] could not write local storage', err)
      throw err
    }
  }

  async clear(): Promise<void> {
    try {
      localStorage.removeItem(KEY)
    } catch {
      /* ignore */
    }
  }

  subscribe(onChange: (snapshot: WorkspaceSnapshot) => void): () => void {
    const handler = (e: StorageEvent) => {
      if (e.key !== KEY || !e.newValue) return
      try {
        onChange(JSON.parse(e.newValue))
      } catch {
        /* ignore malformed */
      }
    }
    window.addEventListener('storage', handler)
    return () => window.removeEventListener('storage', handler)
  }
}
