import { useEffect, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { api, ConnectedAccount, Platform, PlatformSpec } from '../api'

const DESCRIPTIONS: Record<Platform, string> = {
  Facebook: 'Publish to your Facebook Pages.',
  Instagram: 'Publish photos, reels and carousels to professional accounts.',
  TikTok: 'Direct-post videos to TikTok creators.',
  Pinterest: 'Create pins with product links on your boards.',
  WhatsApp: 'Broadcast template messages to opted-in customer lists.',
  GoogleAds: 'Manage campaigns, budgets and performance.',
}

export default function Connections() {
  const [specs, setSpecs] = useState<PlatformSpec[]>([])
  const [accounts, setAccounts] = useState<ConnectedAccount[]>([])
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const [params, setParams] = useSearchParams()

  useEffect(() => {
    api<PlatformSpec[]>('/api/platforms').then(setSpecs).catch(() => {})
    api<ConnectedAccount[]>('/api/connections').then(setAccounts).catch(() => {})

    // Feedback from the OAuth redirect: ?connected=Platform&accounts=N or ?error=...
    const connected = params.get('connected')
    const oauthError = params.get('error')
    if (connected) {
      const count = params.get('accounts')
      setNotice(`${connected} connected${count ? ` (${count} account${count === '1' ? '' : 's'})` : ''} ✓`)
    }
    if (oauthError) setError(oauthError)
    if (connected || oauthError) setParams({}, { replace: true })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  async function connect(platform: Platform) {
    setError('')
    try {
      const result = await api<{ authorizationUrl: string }>(
        `/api/connections/connect/${platform}`,
      )
      window.location.href = result.authorizationUrl
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not start the connection')
    }
  }

  return (
    <>
      <h1>Connections</h1>
      <p className="subtitle">
        Connect the accounts you post to. Tokens are encrypted and never leave the server.
      </p>
      {error && <div className="issue blocking">{error}</div>}
      {notice && <div className="issue" style={{ background: 'rgba(76,195,138,.12)', color: '#8fd8b4' }}>{notice}</div>}

      <div className="grid">
        {specs.map((spec) => {
          const connected = accounts.filter((a) => a.platform === spec.platform)
          return (
            <div className="card" key={spec.platform}>
              <div className="row between">
                <h2 style={{ margin: 0 }}>{spec.name}</h2>
                {connected.length > 0 ? (
                  <span className="status ok">{connected.length} connected</span>
                ) : (
                  <span className="status warn">not connected</span>
                )}
              </div>
              <p className="muted" style={{ margin: '10px 0 14px' }}>
                {DESCRIPTIONS[spec.platform]}
              </p>
              {connected.map((account) => (
                <p key={account.id} className="muted">
                  ✓ {account.displayName}
                </p>
              ))}
              <button onClick={() => connect(spec.platform)} style={{ marginTop: 8 }}>
                Connect {spec.name}
              </button>
            </div>
          )
        })}
      </div>
    </>
  )
}
