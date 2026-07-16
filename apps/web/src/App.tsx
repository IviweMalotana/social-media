import { useEffect, useState } from 'react'
import { NavLink, Outlet, useNavigate } from 'react-router-dom'
import { auth } from './api'

/**
 * Brand block: shows /logo.png (drop the Be Different Packaging logo into
 * apps/web/public/logo.png) and falls back to the text mark until it exists.
 */
export function Brand() {
  const [hasLogo, setHasLogo] = useState(true)
  return hasLogo ? (
    <img
      src="/logo.png"
      alt="Be Different Packaging"
      className="brand-logo"
      onError={() => setHasLogo(false)}
    />
  ) : (
    <div className="brand">
      social<span>/</span>scheduler
    </div>
  )
}

export default function App() {
  const navigate = useNavigate()

  useEffect(() => {
    if (!auth.isLoggedIn) navigate('/login')
  }, [navigate])

  return (
    <div className="layout">
      <nav className="sidebar">
        <Brand />
        <NavLink to="/" end>
          Dashboard
        </NavLink>
        <NavLink to="/composer">Composer</NavLink>
        <NavLink to="/quick-design">Quick Design</NavLink>
        <a
          href={import.meta.env.VITE_STUDIO_URL || 'http://localhost:5174'}
          target="_blank"
          rel="noreferrer"
          className="nav-external"
          title="Full canvas editor: layers, background removal, mockups, image-to-video"
        >
          Studio <span aria-hidden="true">↗</span>
        </a>
        <NavLink to="/targets">Targets</NavLink>
        <NavLink to="/outreach">Outreach</NavLink>
        <NavLink to="/campaigns">Campaigns</NavLink>
        <NavLink to="/calendar">Calendar</NavLink>
        <NavLink to="/connections">Connections</NavLink>
        <div className="spacer" />
        <a
          href="/login"
          onClick={() => {
            auth.token = null
          }}
        >
          Sign out
        </a>
      </nav>
      <main className="main">
        <Outlet />
      </main>
    </div>
  )
}
