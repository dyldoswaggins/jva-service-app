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

---

# Part 2: Parts inbox mailbox (invoices and packing lists)

Scanned packing lists and Rolex invoices will be emailed to a dedicated mailbox. The app checks it every few minutes, reads the attachments, and puts them in its Inbox for review. It only reads that one mailbox and marks messages as read; it never sends or deletes mail.

## 7. Mailbox
Create a **shared mailbox** (no licence needed), e.g. `parts@<our domain>`. Add Dylan as a member so he can see what arrived.

## 8. App registration for reading it
Separate from the sign-in app, so its secret only lives on the server:
entra.microsoft.com → App registrations → **New registration**
- Name: `JVA Watch Service – Parts Inbox`, single tenant, **no** redirect URI.
- **Do not** add a tenant-wide Graph `Mail.*` permission here (that would cover every mailbox). Mail access is granted in step 9, scoped to the parts mailbox only.
- **Certificates & secrets → New client secret** (24 months). Copy the Value.

## 9. Grant mail access to that one mailbox only (Exchange RBAC for Applications)
In Exchange Online PowerShell:
```
New-ServicePrincipal -AppId <Application (client) ID> -ObjectId <Enterprise app Object ID> -DisplayName "JVA Parts Inbox"
New-ManagementScope -Name "JVA Parts Inbox" -RecipientRestrictionFilter "PrimarySmtpAddress -eq 'parts@<our domain>'"
New-ManagementRoleAssignment -App <Enterprise app Object ID> -Role "Application Mail.ReadWrite" -CustomResourceScope "JVA Parts Inbox"
Test-ServicePrincipalAuthorization -Identity <Enterprise app Object ID> -Resource parts@<our domain>
```
The test should show access to the parts mailbox and nothing else.

## 10. Send back to Dylan
- Mailbox address
- Application (client) ID and Directory (tenant) ID of the Parts Inbox app
- Its client secret Value: **separately and securely**, as before.

Questions: contact Dylan.
