import React from 'react'
import { createRoot } from 'react-dom/client'
import App from './App.jsx'
import SignPage from './repairs/SignPage.jsx'
import './styles.css'

// /sign/<token>: the client's private estimate-signing page (no sign-in)
const sign = location.pathname.match(/^\/sign\/([0-9a-f]{48})\/?$/)

createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    {sign ? <main className="wrap page"><SignPage token={sign[1]} /></main> : <App />}
  </React.StrictMode>
)
