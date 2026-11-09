import { useEffect, useState } from 'react'
import { supabase, isConfigured } from './supabase.js'

export default function App() {
  const [session, setSession] = useState(null)
  const [ready, setReady] = useState(!isConfigured)

  useEffect(() => {
    if (!isConfigured) return
    supabase.auth.getSession().then(({ data }) => {
      setSession(data.session)
      setReady(true)
    })
    const { data: sub } = supabase.auth.onAuthStateChange((_e, s) => setSession(s))
    return () => sub.subscription.unsubscribe()
  }, [])

  const signIn = () =>
    supabase.auth.signInWithOAuth({
      provider: 'azure',
      options: { scopes: 'email', redirectTo: window.location.origin },
    })

  const signOut = () => supabase.auth.signOut()

  return (
    <>
      <header className="top">
        <span className="brand">J. VAIR ANDERSON</span>
        <span className="title">Watch Service</span>
        {session && (
          <button className="btn" onClick={signOut}>Sign out</button>
        )}
      </header>
      <main className="panel">
        {!isConfigured && <p>Not connected to the database yet.</p>}
        {isConfigured && !ready && <p>Loading…</p>}
        {isConfigured && ready && !session && (
          <button className="btn solid" onClick={signIn}>Sign in with Microsoft</button>
        )}
        {session && (
          <p>Signed in as {session.user.email}.</p>
        )}
      </main>
    </>
  )
}
