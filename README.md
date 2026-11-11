# Eva for Android (APK)

The app is a thin Android shell that opens **your Eva server** (for example the Render address) full-screen and adds the phone's own
**speech recognition and text-to-speech**, so the voice assistant works inside the app. (Browser voice APIs do not exist in Android WebViews, which is why the plugins are needed.)

## Build it without installing anything (GitHub Actions)

1. Upload the whole project folder to a GitHub repository.
2. Open the repository → **Actions** → **Build Android APK** → **Run workflow**.
3. Type your Eva address (it must start with `https://`, e.g. `https://eva-ai.onrender.com`) and run.
4. After about 6 to 10 minutes open the finished run → **Artifacts** → download `eva-debug-apk` → unzip → `app-debug.apk`.
5. Copy it to the phone and open it. Android asks to allow "install unknown apps" once. Allow the microphone when Eva asks.

## Build on your own computer (optional)

Needs Node 18+, Java 21 and Android Studio (SDK). Then:

```
cd android-app
npm install
npx cap add android
npx cap sync android
npx cap open android     # build / run from Android Studio
```

Edit `server.url` in `capacitor.config.json` first.

## Notes

- This is a *debug* APK: fine for your own phone. A Play Store release needs your own signing key.
- The app shows whatever your server shows. Update the website on Render and the app updates by itself, no new APK needed.
- Voice: tap the wave button. Say things like "YouTube-la lofi songs poodu" or "Chennai maps-la kaattu". Eva shows an action card; say "yes / ஆமா" or tap **Do it**. Calls and messages always need that confirmation.
- Not included yet: setting alarms, opening any installed app by name, reading notifications or controlling the screen. Those need Android Accessibility permission and a native service, which is a separate, bigger piece of work.

## If the GitHub build fails

Open the failed run, copy the red error lines and send them to Claude. Most failures are version mismatches between Capacitor and its plugins, which are quick to pin.
