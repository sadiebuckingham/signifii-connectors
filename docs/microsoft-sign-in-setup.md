# Microsoft sign-in: one-time setup (Sadie)

This lets the Media Plan connector read and write a **OneDrive** "Media Plans" folder after someone signs in with Microsoft. Sign-in is optional: the demo folders keep working with no login.

Do this once, signed in as **sadie@signifii.com** (Microsoft 365). About 10 minutes. You'll end up with three values; where each one goes is listed at the end.

## 1. Open the app registrations page

1. Go to https://entra.microsoft.com and sign in as `sadie@signifii.com`.
2. In the left menu: **Entra ID** (or **Identity**) → **App registrations** → **New registration**.

If you can't see "New registration", your account isn't allowed to register apps. Ask whoever manages Signifii's Microsoft 365 to do steps 1–5, or to give you the "Application Developer" role.

## 2. Register the app

| Field | What to enter |
|---|---|
| Name | `Signifii Connectors (demo)` |
| Supported account types | **Accounts in any organizational directory (Any Microsoft Entra ID tenant – Multitenant) and personal Microsoft accounts** |
| Redirect URI | Platform **Web**, URL `https://signifii-demos.onrender.com/auth/microsoft/callback` |

Click **Register**.

Why "any organisation and personal accounts": the person you send the demo to can then sign in with whatever Microsoft account their OneDrive is on.

## 3. Copy the IDs

On the app's **Overview** page, copy:

- **Application (client) ID** → this is `MS_CLIENT_ID`. It isn't a secret; you can paste it to me in chat.
- **Directory (tenant) ID** → keep it in your password manager. The connector doesn't need it (it uses "common" so any account can sign in).

## 4. Create the secret

1. Left menu: **Certificates & secrets** → **Client secrets** → **New client secret**.
2. Description `signifii-demos`, expiry **180 days**. Click **Add**.
3. Copy the **Value** column straight away (it's only shown once). This is `MS_CLIENT_SECRET`.

**Don't paste the secret into chat.** Put it straight into Render (step 6) and your password manager.

## 5. Permissions

1. Left menu: **API permissions** → **Add a permission** → **Microsoft Graph** → **Delegated permissions**.
2. Tick: `Files.ReadWrite`, `offline_access`, `openid`, `profile`, `email` (`User.Read` is usually there already).
3. Click **Add permissions**.
4. If you see **Grant admin consent for Signifii**, click it. This only covers people in Signifii's own organisation. Everyone else sees a normal "allow this app" screen when they sign in.

## 6. Put the values into Render

Render → **signifii-demos** → **Environment** → add:

| Key | Value |
|---|---|
| `MS_CLIENT_ID` | the Application (client) ID |
| `MS_CLIENT_SECRET` | the secret Value |

Save. Render restarts the service. Then tell me it's done.

## What the other person may see

- A Microsoft screen asking them to allow "Signifii Connectors (demo)" to read and write their files. That's expected.
- If their organisation blocks staff from approving apps, they'll see **"Need admin approval"**. Nothing is broken: the demo still works on our folders without signing in, and their IT admin can approve the app later.

## Renewing the secret

The secret expires after 180 days. Before then: repeat step 4, update `MS_CLIENT_SECRET` in Render, and delete the old secret.
