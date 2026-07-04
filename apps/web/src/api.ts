export type Platform =
  | 'Facebook'
  | 'Instagram'
  | 'TikTok'
  | 'Pinterest'
  | 'WhatsApp'
  | 'GoogleAds'

export interface PlatformSpec {
  platform: Platform
  name: string
  maxCaptionLength: number
  requiresMedia: boolean
  dailyPublishLimit: number | null
  maxMediaPerPost: number
}

export interface ConnectedAccount {
  id: string
  platform: Platform
  externalId: string
  displayName: string
  avatarUrl: string | null
  health: string
  connectedAt: string
}

export interface DraftIssue {
  code: string
  message: string
  isBlocking: boolean
}

export interface PostTarget {
  id: string
  connectedAccountId: string
  platform: Platform
  accountName: string
  status: string
  externalPostUrl: string | null
  errorMessage: string | null
  impressions: number
  likes: number
  comments: number
  shares: number
  clicks: number
}

export interface Post {
  id: string
  caption: string
  mediaAssetIds: string[]
  status: string
  scheduledAt: string | null
  createdAt: string
  targets: PostTarget[]
}

export interface MediaAsset {
  id: string
  fileName: string
  contentType: string
  sizeBytes: number
  url: string
  createdAt: string
}

const TOKEN_KEY = 'sm.token'

/** In production the dashboard and API live on different origins (Vercel + Railway). */
const BASE = import.meta.env.VITE_API_URL ?? ''

export const auth = {
  get token() {
    return localStorage.getItem(TOKEN_KEY)
  },
  set token(value: string | null) {
    if (value) localStorage.setItem(TOKEN_KEY, value)
    else localStorage.removeItem(TOKEN_KEY)
  },
  get isLoggedIn() {
    return Boolean(localStorage.getItem(TOKEN_KEY))
  },
}

export async function api<T>(path: string, options: RequestInit = {}): Promise<T> {
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    ...(options.headers as Record<string, string>),
  }
  if (auth.token) headers.Authorization = `Bearer ${auth.token}`

  const response = await fetch(BASE + path, { ...options, headers })
  if (response.status === 401) {
    auth.token = null
    window.location.href = '/login'
    throw new Error('Not signed in')
  }
  if (!response.ok) {
    const body = await response.json().catch(() => null)
    throw new Error(body?.error ?? `Request failed (${response.status})`)
  }
  if (response.status === 204) return undefined as T
  return response.json()
}

/** Multipart upload — no JSON content type, browser sets the boundary. */
export async function apiUpload<T>(path: string, file: File): Promise<T> {
  const body = new FormData()
  body.append('file', file)
  const headers: Record<string, string> = {}
  if (auth.token) headers.Authorization = `Bearer ${auth.token}`

  const response = await fetch(BASE + path, { method: 'POST', body, headers })
  if (!response.ok) {
    const data = await response.json().catch(() => null)
    throw new Error(data?.error ?? `Upload failed (${response.status})`)
  }
  return response.json()
}
