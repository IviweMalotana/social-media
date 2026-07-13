import { FormEvent, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { api, auth } from '../api'
import { Brand } from '../App'

interface AuthResponse {
  token: string
  displayName: string
}

export default function Login() {
  const navigate = useNavigate()
  const [mode, setMode] = useState<'login' | 'register'>('login')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [displayName, setDisplayName] = useState('')
  const [businessName, setBusinessName] = useState('')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)

  async function submit(event: FormEvent) {
    event.preventDefault()
    setError('')
    setBusy(true)
    try {
      const body =
        mode === 'login'
          ? { email, password }
          : { email, password, displayName, businessName: businessName || null }
      const result = await api<AuthResponse>(`/api/auth/${mode}`, {
        method: 'POST',
        body: JSON.stringify(body),
      })
      auth.token = result.token
      navigate('/')
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Something went wrong')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="auth-wrap">
      <form className="auth-card" onSubmit={submit}>
        <div style={{ marginBottom: 12 }}>
          <Brand />
        </div>
        <h1>{mode === 'login' ? 'Sign in' : 'Create your account'}</h1>
        {mode === 'register' && (
          <>
            <label>Your name</label>
            <input value={displayName} onChange={(e) => setDisplayName(e.target.value)} required />
            <label>Business name (optional)</label>
            <input value={businessName} onChange={(e) => setBusinessName(e.target.value)} />
          </>
        )}
        <label>Email</label>
        <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} required />
        <label>Password</label>
        <input
          type="password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          minLength={8}
          required
        />
        <div style={{ marginTop: 20 }}>
          <button disabled={busy} style={{ width: '100%' }}>
            {mode === 'login' ? 'Sign in' : 'Create account'}
          </button>
        </div>
        {error && <div className="error">{error}</div>}
        <p className="muted" style={{ marginTop: 16 }}>
          {mode === 'login' ? (
            <>
              New here?{' '}
              <a href="#" onClick={() => setMode('register')}>
                Create an account
              </a>
            </>
          ) : (
            <>
              Already registered?{' '}
              <a href="#" onClick={() => setMode('login')}>
                Sign in
              </a>
            </>
          )}
        </p>
      </form>
    </div>
  )
}
