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

const TOKEN_KEY = 'sm.token'

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

  const response = await fetch(path, { ...options, headers })
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
