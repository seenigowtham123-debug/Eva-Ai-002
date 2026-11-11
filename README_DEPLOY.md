# Put Eva online (Render.com) and on your phone

## 1. Render.com (free)

1. Create a GitHub repository and upload the contents of this folder (the `.env` file is git-ignored, good).
2. On https://render.com: **New → Blueprint**, pick the repository. `render.yaml` sets everything up.
3. When Render asks for values, paste your **GEMINI_API_KEY** (free: https://aistudio.google.com/apikey). `ANTHROPIC_API_KEY` can stay empty.
4. After the deploy, open the service → **Environment** and copy the generated **ACCESS_TOKEN**. Eva asks for it the first time you open the site. Keep it private.
5. Your address is `https://<name>.onrender.com`.

Things to know

- **Keep ACCESS_TOKEN set.** Without it anyone who finds the URL can use your Gemini quota.
- The free plan **sleeps** after 15 minutes idle (first open can take about a minute) and **forgets saved chats and uploaded notes on every restart or redeploy**. Put important notes in the `knowledge/` folder of the repo, or add a paid persistent disk and set `DATA_DIR` / `KNOWLEDGE_DIR` to it.
- Ollama (`localhost`) cannot be reached from Render. Use Gemini or Claude there.
- Pasting keys inside the website (Settings) only works on your own computer. On Render use the Environment tab.

## 2. Install as a phone app, no build needed (PWA)

Open your Render address in Chrome on the phone → menu (⋮) → **Add to Home screen / Install app**. It opens full-screen like an app.

## 3. Real Android APK

See `android-app/README.md`. Short version: push the project to GitHub, open the **Actions** tab, run **Build Android APK**, download `eva-debug.apk`, install it on your phone. The app opens your Render address, so set it once in `android-app/capacitor.config.json` (`server.url`) or use the workflow input.

## Other hosts

- Docker: `docker build -t eva-ai . && docker run -p 3000:3000 --env-file .env -v eva-data:/app/data eva-ai`
- Behind Nginx/Caddy: keep `TRUST_PROXY=1` and turn off response buffering for `/api/chat`.
