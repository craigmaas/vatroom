import type { WorkspaceSnapshot } from '@/domain/types'
import type { StorageAdapter } from './adapter'

/**
 * Cloud adapter — scaffold for the production launch.
 *
 * Expected API surface (REST, bearer token):
 *   GET    /v1/workspace                      → WorkspaceSnapshot for the signed-in user's orgs
 *   PUT    /v1/workspace                      → full save (used rarely; migrations, imports)
 *   PATCH  /v1/orgs/:orgId/:collection        → { upsert: [...], remove: [...] }
 *   WS     /v1/orgs/:orgId/stream             → change feed for live multi-user sync
 *
 * Multi-tenancy: the server scopes every row by orgId and enforces role
 * permissions (see `Role` in domain/types.ts). The client never trusts itself.
 */
export class CloudAdapter implements StorageAdapter {
  readonly kind = 'cloud' as const
  private baseUrl: string
  private getToken: () => Promise<string | null>
  constructor(baseUrl: string, getToken: () => Promise<string | null>) {
    this.baseUrl = baseUrl
    this.getToken = getToken
  }

  private async headers() {
    const token = await this.getToken()
    return { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) }
  }

  async load(): Promise<WorkspaceSnapshot | null> {
    const res = await fetch(`${this.baseUrl}/v1/workspace`, { headers: await this.headers() })
    if (res.status === 404) return null
    if (!res.ok) throw new Error(`workspace load failed: ${res.status}`)
    return (await res.json()) as WorkspaceSnapshot
  }

  async save(snapshot: WorkspaceSnapshot): Promise<void> {
    const res = await fetch(`${this.baseUrl}/v1/workspace`, { method: 'PUT', headers: await this.headers(), body: JSON.stringify(snapshot) })
    if (!res.ok) throw new Error(`workspace save failed: ${res.status}`)
  }

  async patch(orgId: string, collection: string, upsert: unknown[], removeIds: string[]): Promise<void> {
    const res = await fetch(`${this.baseUrl}/v1/orgs/${orgId}/${collection}`, {
      method: 'PATCH',
      headers: await this.headers(),
      body: JSON.stringify({ upsert, remove: removeIds }),
    })
    if (!res.ok) throw new Error(`patch ${collection} failed: ${res.status}`)
  }

  async clear(): Promise<void> {
    // Intentionally a no-op in the cloud: destructive resets are an admin action server-side.
  }
}
