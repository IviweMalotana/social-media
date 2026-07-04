import { useEffect } from 'react'
import { NavLink, Outlet, useNavigate } from 'react-router-dom'
import { auth } from './api'

export default function App() {
  const navigate = useNavigate()

  useEffect(() => {
    if (!auth.isLoggedIn) navigate('/login')
  }, [navigate])

  return (
    <div className="layout">
      <nav className="sidebar">
        <div className="brand">
          social<span>/</span>scheduler
        </div>
        <NavLink to="/" end>
          Dashboard
        </NavLink>
        <NavLink to="/composer">Composer</NavLink>
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
