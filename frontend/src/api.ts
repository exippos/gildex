// Typed API client over the Go backend. Base path /api.
import type {
  BatchPatch,
  Collection,
  FolderNode,
  ImportStatus,
  Item,
  ItemPage,
  ItemPatch,
  ItemQuery,
  LibraryStatus,
  Note,
  OwnerType,
  Session,
  Tag,
} from './types'

async function request<T>(method: string, path: string, body?: unknown): Promise<T> {
  const res = await fetch(`/api${path}`, {
    method,
    headers: body !== undefined ? { 'Content-Type': 'application/json' } : undefined,
    body: body !== undefined ? JSON.stringify(body) : undefined,
  })
  if (!res.ok) {
    let msg = `${res.status} ${res.statusText}`
    try {
      const data = await res.json()
      if (data && typeof data.error === 'string') msg = data.error
    } catch {
      /* ignore */
    }
    throw new Error(msg)
  }
  if (res.status === 204) return undefined as T
  return (await res.json()) as T
}

async function upload<T>(path: string, form: FormData): Promise<T> {
  const res = await fetch(`/api${path}`, { method: 'POST', body: form })
  if (!res.ok) {
    let msg = `${res.status} ${res.statusText}`
    try {
      const data = await res.json()
      if (data && typeof data.error === 'string') msg = data.error
    } catch {
      /* ignore */
    }
    throw new Error(msg)
  }
  return (await res.json()) as T
}

function qs(params: Record<string, string | number | boolean | undefined | null>): string {
  const parts: string[] = []
  for (const [k, v] of Object.entries(params)) {
    if (v === undefined || v === null || v === '') continue
    parts.push(`${encodeURIComponent(k)}=${encodeURIComponent(String(v))}`)
  }
  return parts.length ? `?${parts.join('&')}` : ''
}

export interface DroppedFile {
  file: File
  relPath: string
}

export const api = {
  status: () => request<LibraryStatus>('GET', '/status'),

  setRoot: (path: string) => request<LibraryStatus>('POST', '/library/root', { path }),

  importPaths: (paths: string[]) => request<{ started: boolean }>('POST', '/import', { paths }),
  importStatus: () => request<ImportStatus>('GET', '/import/status'),
  uploadImport: (files: DroppedFile[]) => {
    const form = new FormData()
    for (const { file, relPath } of files) form.append('files', file, relPath)
    return upload<{ started: boolean; count: number }>('/import/upload', form)
  },

  items: (q: ItemQuery) =>
    request<ItemPage>(
      'GET',
      `/items${qs({
        sessionId: q.sessionId,
        collectionId: q.collectionId,
        folder: q.folder,
        tags: q.tags?.length ? q.tags.join(',') : undefined,
        q: q.q,
        kind: q.kind,
        rating: q.rating,
        status: q.status,
        favorite: q.favorite,
        limit: q.limit,
        offset: q.offset,
        sort: q.sort,
        dir: q.dir,
      })}`,
    ),
  item: (id: string) => request<Item>('GET', `/items/${id}`),
  updateItem: (id: string, patch: ItemPatch) =>
    request<Item>('PATCH', `/items/${id}`, patch),
  batch: (patch: BatchPatch) => request<{ ok: boolean }>('PATCH', '/items/batch', patch),

  sessions: () => request<Session[]>('GET', '/sessions'),
  updateSession: (id: string, body: { label?: string; coverItemId?: string | null }) =>
    request<Session>('PATCH', `/sessions/${id}`, body),

  tags: () => request<Tag[]>('GET', '/tags'),
  createTag: (name: string) => request<Tag>('POST', '/tags', { name }),
  deleteTag: (id: string) => request<void>('DELETE', `/tags/${id}`),

  collections: () => request<Collection[]>('GET', '/collections'),
  createCollection: (body: { name: string; description?: string }) =>
    request<Collection>('POST', '/collections', body),
  updateCollection: (id: string, body: { name?: string; description?: string; order?: string[]; coverItemId?: string | null }) =>
    request<Collection>('PATCH', `/collections/${id}`, body),
  deleteCollection: (id: string) => request<void>('DELETE', `/collections/${id}`),
  addToCollection: (id: string, itemIds: string[]) =>
    request<{ ok: boolean }>('POST', `/collections/${id}/items`, { itemIds }),
  removeFromCollection: (id: string, itemId: string) =>
    request<void>('DELETE', `/collections/${id}/items/${itemId}`),

  folders: () => request<FolderNode[]>('GET', '/folders'),

  notes: (ownerType: OwnerType, ownerId: string) =>
    request<Note[]>('GET', `/notes${qs({ ownerType, ownerId })}`),
  createNote: (body: { ownerType: OwnerType; ownerId: string; body: string; typeLabel?: string }) =>
    request<Note>('POST', '/notes', body),
  updateNote: (id: string, body: { body?: string }) =>
    request<Note>('PATCH', `/notes/${id}`, body),
  deleteNote: (id: string) => request<void>('DELETE', `/notes/${id}`),
}

// URL helpers for media assets served by the Go backend.
export function thumbUrl(thumbnailPath: string): string | null {
  return thumbnailPath ? `/api/thumb/${thumbnailPath}` : null
}
export function mediaUrl(itemId: string): string {
  return `/api/media/${itemId}`
}
