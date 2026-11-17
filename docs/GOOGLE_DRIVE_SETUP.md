# Google Drive sync: one-time setup

The app talks to Google Drive directly from your browser. Google requires every app that does this to have an **OAuth client ID**, created once in Google Cloud (free). The app only asks for the `drive.file` permission, so it can see **only the files it creates** (the "Bar & Track" folder), nothing else in your Drive.

## 1. Create a Google Cloud project
1. Go to https://console.cloud.google.com/ and sign in with the Google account whose Drive you want to use.
2. Top bar → project picker → **New project** → name it `Bar and Track` → **Create**, then select it.

## 2. Enable the Drive API
1. Menu → **APIs & Services → Library**.
2. Search **Google Drive API** → **Enable**.

## 3. Configure the consent screen
1. **APIs & Services → OAuth consent screen** (on newer consoles: **Google Auth Platform → Branding**). Click **Get started**.
2. App name `Bar & Track`, user support email = your email → **Next**.
3. Audience: **External** → **Next**. Contact email → **Next** → agree → **Create**.
4. **Data access → Add or remove scopes** → filter `drive.file` → tick `.../auth/drive.file` → **Update** → **Save**.
5. **Audience → Test users → Add users** → add your own Gmail address → **Save**.
6. Optional but recommended: **Audience → Publish app**. `drive.file` is a non-sensitive scope, so no Google review is needed, and published apps don't make you re-approve access every 7 days.

## 4. Create the client ID
1. **Clients** (or **Credentials → Create credentials → OAuth client ID**).
2. Application type: **Web application**. Name: `Bar & Track web`.
3. **Authorized JavaScript origins → Add URI**:
   - `https://abdelrahmansherifmedhat1134.github.io`
   - `http://localhost:8080` (for local development)
   Leave *Authorized redirect URIs* empty.
4. **Create**, then copy the **Client ID** (ends in `.apps.googleusercontent.com`). It is not a secret.

## 5. Put it in the app
Either:
- **In the app** (fastest): Plan → Google Drive → OAuth client ID → paste → **Save client ID** → **Connect Google Drive**. Do this once on each device.
- **In the code** (every device gets it): set `GOOGLE_CLIENT_ID` in `js/config.js`, run `npm run bump`, commit and push.

Then tap **Connect Google Drive** and approve. The first sync creates the "Bar & Track" folder.

## How syncing behaves
- Everything is saved on the device first, so the app works offline.
- With a valid Google session (about 1 hour after you tap Sync), changes sync automatically a few seconds after you save.
- When the session has expired the header shows **Sync**; one tap renews it (Google may flash a small window).
- Each record (workout, weigh-in, routine tick) is merged by its last-edit time, so edits on phone and laptop don't overwrite each other.

## Troubleshooting
| Message | Fix |
|---|---|
| `redirect_uri_mismatch` / `origin_mismatch` | The JavaScript origin in step 4 must exactly match the site address (no trailing slash, no path). |
| `access_denied` / "app not verified" | Add yourself as a test user (step 3.5) or publish the app (3.6). On the warning screen choose *Continue*. |
| Sign-in window doesn't open | Allow pop-ups for the site. |
| "Google Drive API has not been used" | Enable the API (step 2) and wait a minute. |
