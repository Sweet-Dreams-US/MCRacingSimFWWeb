# Releasing a reader update (build on the Windows PC)

The APK **must** be built on the machine that holds the original
`release.keystore` — currently the Windows PC. Android refuses to install an
update to `com.mcracing.pos` signed with a different key, so an APK signed with
a new keystore will fail to deploy to the reader. There is no DevKit: the only
reader is the live one in the shop, so a bad build takes the POS down during
trading hours.

## 1. Get the code

Everything needed is in git. Nothing has to be copied by hand.

```bat
cd path\to\MCRacingSimFWWeb
git pull
```

`local.properties` and `release.keystore` are **gitignored on purpose** — they
stay on that PC and are not overwritten by the pull. Confirm they're still there:

```bat
type android-pos\local.properties
dir android-pos\*.keystore
```

`local.properties` needs `BACKEND_URL`, `DEVICE_KEY`, `KEYSTORE_FILE`,
`KEY_ALIAS`, `KEYSTORE_PASSWORD`, `KEY_PASSWORD`. `DEVICE_KEY` must equal
`POS_DEVICE_KEY` in the Vercel project.

> If a `release.keystore` ever appears that you did NOT create, delete it. One
> was generated on the Mac by mistake and would be rejected by the reader.

## 2. Build

```bat
cd android-pos
gradlew.bat :app:assembleRelease
```

Output: `android-pos\app\build\outputs\apk\release\app-release.apk`

If the filename says `-unsigned`, the keystore wasn't picked up — fix
`local.properties` before going any further. An unsigned APK cannot be deployed.

## 3. Upload + deploy

Stripe Dashboard → **Terminal → Software** → the existing app → upload the APK →
submit. On approval: **Deploy groups** → new deployment → pick the version →
confirm this app stays the kiosk app → Deploy. Restart the reader to pull it.

## 4. Verify on the reader

Because this goes straight to the live device, check in this order — the first
two are the ones that would cost money:

- [ ] A booking sale charges the **correct half-hour price** (1.5h weekend,
      3 racers = **$210**, not $207.50). Web and reader disagreed until this build.
- [ ] Cash sale sends a receipt; the result screen shows where it went.
- [ ] Split-by-person charges the racer and emails the racer, not the booker.
- [ ] A completed booking can be **reopened** (this is the fix for a mis-tapped
      "Mark complete", which previously had no undo anywhere).
- [ ] Screen stays portrait; battery % shows on every screen.
- [ ] Dock and undock the reader mid-sale — the entered amount must survive.

## Backups

`release.keystore` and its password are irreplaceable. If they're lost the app
can never be updated again — only republished as a new app and redeployed.
Keep a copy somewhere off that PC.
