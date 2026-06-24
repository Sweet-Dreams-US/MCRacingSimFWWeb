# Google Calendar Setup for MC Racing Sim Fort Wayne

This is a **one-time setup** that lets the booking website automatically
add every new booking to the `mcracingfortwayne@gmail.com` Google Calendar.
Once set up, Mark can see all upcoming sessions on his phone, tablet, or
any device with Google Calendar — color-coded by where the booking came
from (online bookings show in red, manually-entered ones in yellow).

**Time required:** about 15 minutes. You only do this once.

> **Heads up:** the "service account" stuff below sounds intimidating but
> it's just a few clicks in the Google Cloud Console. Take it one step
> at a time and don't skip ahead — each step builds on the previous one.

---

## Step 1: Create (or pick) a Google Cloud project

1. Go to **<https://console.cloud.google.com>** and sign in with
   `mcracingfortwayne@gmail.com` (or whichever Google account owns the
   business).
2. At the top of the page, click the **project picker** (it usually says
   something like "Select a project" or shows the current project name).
3. Click **"New Project"**.
4. Name it something memorable like `MC Racing Sim` and click **Create**.
5. Wait ~30 seconds. When it's done, make sure the project picker at the
   top now shows your new project name.

---

## Step 2: Turn on the Google Calendar API

1. In the left-hand menu, go to **APIs & Services → Library**
   (or search "Library" in the top search bar).
2. In the search box on the Library page, type **"Google Calendar API"**
   and click the result.
3. Click the big blue **Enable** button.
4. Wait ~30 seconds for it to enable.

---

## Step 3: Create a service account and download its key

A "service account" is a special Google identity that lets our website
write to the calendar without anyone having to log in each time.

1. In the left menu, go to **IAM & Admin → Service Accounts**.
2. Click **"+ Create Service Account"** at the top.
3. Fill in:
   - **Service account name:** `mc-racing-calendar`
   - **Service account ID:** Google will fill this in automatically.
     Leave it.
   - **Description:** `Writes booking events to the shop calendar` (optional)
4. Click **Create and Continue**.
5. On the "Grant this service account access to project" step, **click
   Continue** without picking any role — the calendar doesn't need
   project-level permissions, only calendar-level (which we set in Step 4).
6. On the "Grant users access" step, **click Done**.
7. You should now be back on the Service Accounts list. Click the
   service account you just created (the name `mc-racing-calendar`).
8. Click the **Keys** tab at the top.
9. Click **Add Key → Create new key**.
10. Pick **JSON** and click **Create**.
11. A `.json` file will download to your computer — **save it
    somewhere safe**, like Google Drive in a private folder. You can't
    re-download it later; if you lose it you have to make a new key.

**Open the JSON file in a text editor** (Notepad on Windows, TextEdit on
Mac). You'll need two values from it in Step 5:
- `client_email` — looks like
  `mc-racing-calendar@mc-racing-sim-xxxxx.iam.gserviceaccount.com`
- `private_key` — a long block starting with
  `-----BEGIN PRIVATE KEY-----` and ending with `-----END PRIVATE KEY-----`

Keep this file open — you'll come back to it.

---

## Step 4: Share the calendar with the service account

This is the step everyone forgets — without it, Google will reject every
request with "calendar not found."

1. Open **Google Calendar** in a browser, signed in as
   `mcracingfortwayne@gmail.com`.
2. In the left sidebar, find **"My calendars"** and hover over the
   primary calendar (it has the same name as the Gmail account).
3. Click the **three-dot menu** that appears → **Settings and sharing**.
4. Scroll down to **"Share with specific people or groups"**.
5. Click **"+ Add people and groups"**.
6. Paste the **`client_email`** from the JSON file (the long
   `...iam.gserviceaccount.com` address).
7. In the **Permissions** dropdown, choose **"Make changes to events"**
   (the second-from-top option — NOT "Make changes and manage sharing").
8. Click **Send**. You may get a warning like "this isn't a Google
   account" — that's fine, click "Send" again to confirm.

---

## Step 5: Add the env vars to Vercel

1. Go to **<https://vercel.com>** and open the `mc-racing-sim-fw` project.
2. Click **Settings → Environment Variables**.
3. Add the three variables below. For each one:
   - Click **"Add new"**.
   - Make sure **Production**, **Preview**, AND **Development** are all
     checked.
   - Paste the value and click **Save**.

### `GOOGLE_SERVICE_ACCOUNT_EMAIL`

The `client_email` value from the JSON file. Looks like:

```
mc-racing-calendar@mc-racing-sim-12345.iam.gserviceaccount.com
```

### `GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY`

The `private_key` value from the JSON file. This is the tricky one —
in the JSON file, the newlines are stored as the **literal two characters**
`\n` (backslash + n). When you copy from the JSON, you want to copy
**everything between the quotes**, including those `\n` sequences.
The app code unescapes them at runtime.

Should look like this (one giant single line in the Vercel input):

```
-----BEGIN PRIVATE KEY-----\nMIIEvQIBADANBgkqhkiG9w0BAQEFAASCBKcwggSjAgEAAoIBAQ...\n-----END PRIVATE KEY-----\n
```

> If you accidentally paste it with real newlines instead of `\n`, that
> also works — the code handles both. But the JSON-quoted form (with `\n`)
> is what you'll get if you copy directly from the file.

### `GOOGLE_CALENDAR_ID`

Set this to:

```
mcracingfortwayne@gmail.com
```

(This is optional — if you skip it, the app defaults to this same value.
Set it explicitly if you ever want to point at a different calendar.)

---

## Step 6: Redeploy and test

1. After saving all three env vars, go to **Deployments** in Vercel.
2. Click the **three dots** on the latest production deployment →
   **Redeploy**.
3. Once the redeploy finishes (~1-2 minutes), make a **test booking**
   on the live site.
4. Open Google Calendar — within a few seconds, you should see a new
   red event titled something like
   `🏁 MC-ABC1234 — Test Customer (1 racer)`.

**It worked!** From now on, every new booking lands on the calendar
automatically.

---

## Troubleshooting

**No event shows up after a test booking.**
- In Vercel, go to your project → **Logs** and look for lines starting
  with `[calendar]` or `Calendar event creation failed`. The log will
  tell you exactly what went wrong.
- Most common cause: forgetting Step 4 (sharing the calendar with the
  service account email). The error in logs will say something like
  `calendar not found` or `403`.

**Event shows up on the wrong calendar.**
- You probably shared a secondary calendar instead of the primary one in
  Step 4. Re-do Step 4 on the primary calendar (the one named the same
  as the Gmail account).

**`invalid_grant` error in the logs.**
- The private key got mangled when pasting. Re-do Step 5 for the
  `GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY` variable, copying the value
  exactly as it appears in the JSON file (including the `\n` sequences).

**I need to revoke access.**
- In Google Calendar's "Share with specific people" section, remove the
  service account email.
- In Google Cloud Console → IAM & Admin → Service Accounts, delete the
  `mc-racing-calendar` service account.
- That immediately stops all future calendar writes.
