import { chooseRole } from './supabase.js'

// Opening screen while the app is open (no sign-in): pick how you're using it on this device.
export const ROLES = [
  { role: 'admin', title: 'Service Manager', hint: 'Everything: jobs, estimates, documents, parts, inbox, settings' },
  { role: 'watchmaker', title: 'Watchmaker', hint: 'Watchmaker dashboard: assessment, parts, timing, bench queue' },
  { role: 'sales', title: 'Sales', hint: 'Client intake on the iPad, and pickup' },
]
export const roleTitle = r => ROLES.find(x => x.role === r)?.title || 'View only'

export default function RolePicker({ onSignIn }) {
  return (
    <div className="intake client rolepicker">
      <header className="welcome">
        <img src="/jva-emblem.svg" alt="" className="emblem" />
        <div><div className="brand">J. Vair Anderson</div><h1 className="title">Watch service</h1><div className="msg">Who is using this device?</div></div>
      </header>
      <div className="cards">
        {ROLES.map(r => (
          <button key={r.role} type="button" className="card" onClick={() => chooseRole(r.role)}>
            <span className="card-title">{r.title}</span><span className="msg">{r.hint}</span>
          </button>
        ))}
      </div>
      {onSignIn && <p className="msg center"><button type="button" className="link" onClick={onSignIn}>Staff sign-in</button></p>}
    </div>
  )
}
