import type { StorageAdapter } from './adapter'
import { LocalStorageAdapter } from './local-storage-adapter'
import { CloudAdapter } from './cloud-adapter'

/**
 * Pick the storage backend. Set VITE_STORAGE=cloud and VITE_API_URL at build
 * time to switch to the cloud adapter; everything else stays the same.
 */
export function createAdapter(): StorageAdapter {
  const mode = import.meta.env.VITE_STORAGE ?? 'local'
  if (mode === 'cloud') {
    const base = import.meta.env.VITE_API_URL ?? ''
    return new CloudAdapter(base, async () => sessionStorage.getItem('vatroom.token'))
  }
  return new LocalStorageAdapter()
}

export type { StorageAdapter } from './adapter'
