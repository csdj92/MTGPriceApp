Place the prebuilt Android snapshot here as `prebuilt/lorcana.db`.

Recommended workflow:

```powershell
.\scripts\stage-lorcana-db.ps1 C:\path\to\lorcana.db
```

`android/app/build.gradle` copies `prebuilt/lorcana.db` into `android/app/src/main/assets/www/lorcana.db` during `:app:preBuild`.

If `prebuilt/lorcana.db` is missing, the app falls back to the normal runtime API import path.
