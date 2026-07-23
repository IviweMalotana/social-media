import React from 'react'
import ReactDOM from 'react-dom/client'
import { createBrowserRouter, RouterProvider } from 'react-router-dom'
import App from './App'
import Login from './pages/Login'
import Dashboard from './pages/Dashboard'
import Composer from './pages/Composer'
import Studio from './pages/Studio'
import QuickDesign from './pages/QuickDesign'
import Targets from './pages/Targets'
import Outreach from './pages/Outreach'
import Campaigns from './pages/Campaigns'
import Templates from './pages/Templates'
import Articles from './pages/Articles'
import Emails from './pages/Emails'
import Intel from './pages/Intel'
import Calendar from './pages/Calendar'
import Connections from './pages/Connections'
import Privacy from './pages/Privacy'
import Terms from './pages/Terms'
import './styles.css'

const router = createBrowserRouter([
  { path: '/login', element: <Login /> },
  { path: '/privacy', element: <Privacy /> },
  { path: '/terms', element: <Terms /> },
  {
    path: '/',
    element: <App />,
    children: [
      { index: true, element: <Dashboard /> },
      { path: 'composer', element: <Composer /> },
      { path: 'studio', element: <Studio /> },
      { path: 'quick-design', element: <QuickDesign /> },
      { path: 'targets', element: <Targets /> },
      { path: 'outreach', element: <Outreach /> },
      { path: 'campaigns', element: <Campaigns /> },
      { path: 'templates', element: <Templates /> },
      { path: 'articles', element: <Articles /> },
      { path: 'emails', element: <Emails /> },
      { path: 'intel', element: <Intel /> },
      { path: 'calendar', element: <Calendar /> },
      { path: 'connections', element: <Connections /> },
    ],
  },
])

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <RouterProvider router={router} />
  </React.StrictMode>,
)
