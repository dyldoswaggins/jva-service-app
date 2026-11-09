# Microsoft sign-in for JVA Watch Service — setup for IT

**What this is:** an internal web app for the Rolex service workshop (https://watchservicejva.netlify.app). Staff sign in with their JVA Microsoft 365 accounts. Sign-in is handled by Supabase (our database/auth provider), so it needs an app registration in our Entra ID tenant.

**Time needed:** about 10 minutes. Needs Application Administrator (or Global Administrator) rights.

## 1. Register the app
entra.microsoft.com → **Identity › Applications › App registrations › New registration**
- **Name:** `JVA Watch Service`
- **Supported account types:** *Accounts in this organizational directory only* (single tenant)
- **Redirect URI:** platform **Web**, value:
  `https://lexvtfypmutjirluuwwn.supabase.co/auth/v1/callback`
- Click **Register**.

## 2. Client secret
In the new app → **Certificates & secrets › Client secrets › New client secret**
- Description: `Supabase`, Expires: **24 months**
- Copy the secret **Value** (shown once only).

## 3. Permissions
**API permissions** → make sure these Microsoft Graph **delegated** permissions are present: `openid`, `email`, `profile`, `User.Read`.
Click **Grant admin consent for J. Vair Anderson Jewellers**.

## 4. Email claim
**Token configuration › Add optional claim** → token type **ID** → tick `email` and `xms_edov` → Add (accept the Graph permission prompt if shown).

## 5. Limit who can sign in (recommended)
**Enterprise applications › JVA Watch Service › Properties** → **Assignment required? Yes** → Save.
**Users and groups › Add user/group** → add the staff who should use the app (Dylan, watchmakers, service sales).

## 6. Send back to Dylan
- **Application (client) ID** (Overview page)
- **Directory (tenant) ID** (Overview page)
- **Client secret Value** (from step 2). Please send it **separately and securely** (e.g. by phone, or a password-manager share), not in the same email as the IDs.

Please also add a calendar reminder to renew the secret before it expires.

Questions: contact Dylan.
