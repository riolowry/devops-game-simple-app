# Deploying to Cloudflare Pages

Cloudflare Pages hosts the static frontend for free with generous bandwidth limits. No Git repository required.

Prerequisites: Supabase backend is set up (see [SETUP_SUPABASE_DB.md](SETUP_SUPABASE_DB.md)) and `public/config.js` exists in your local copy of this project with your real credentials.

## Option 1: Direct upload (easiest)

1. Sign in to the [Cloudflare dashboard](https://dash.cloudflare.com). Create a free account if you don't have one.
2. Left sidebar: **Workers & Pages**.
3. Click **Create** → **Pages** → **Upload assets**.
4. Name the project, e.g. `devops-learning-game`. The name becomes part of the URL: `devops-learning-game.pages.dev`.
5. Confirm you have already copied `setup_resources/config.example.js` to `public/config.js` and updated it with your Supabase credentials (see steps 4 and 5 in [SETUP_SUPABASE_DB.md](SETUP_SUPABASE_DB.md)).
6. In the Cloudflare upload area: select or drag the entire `public/` folder (or a zip of it) from your computer. Do not upload the project root; the `setup_resources/`, `README.md`, and `LICENSE` files do not belong on the public site.
7. Click **Deploy site**.

Deployment takes under a minute. You get a URL like `https://devops-learning-game.pages.dev`.

To redeploy after local changes: go to **Workers & Pages** → your project (e.g. `devops-learning-game`) → **Deployments** tab → **Create deployment** in the top right, then drag the `public/` folder again.

## Option 2: Wrangler CLI

If you prefer the command line, run from the project root so the path resolves correctly:

```bash
npm install -g wrangler
wrangler login
wrangler pages deploy ./public --project-name=devops-learning-game
```

Subsequent deploys overwrite the previous.

## Option 3: Git integration

Push the repository to GitHub. In Cloudflare Pages, choose **Connect to Git**, select the repository, and configure:

- **Build command**: leave empty
- **Build output directory**: `public`
- **Environment variables**: none required

**Important if you use Git**: keep `public/config.js` in `.gitignore` so your Supabase credentials are not public. For long-lived deployments use Cloudflare Pages **Environment Variables** or a build-time substitution to inject the credentials. For a classroom session with throwaway credentials, it is simpler to skip Git and use direct upload.

## Post-deploy smoke test

1. Open `https://your-project.pages.dev` in a browser.
2. You should see the login screen. If you see a "Configuration required" page, `public/config.js` is missing or still has placeholder values.
3. Open DevTools (Cmd+Opt+J on Mac, Ctrl+Shift+J on Windows). The Console tab should show the line `[devsec] app.js loaded (drop-zone uploader build)`. If it does not, you are looking at a cached older build. Hard-refresh (Cmd+Shift+R / Ctrl+Shift+R) to fix.
4. Go to `https://your-project.pages.dev/admin.html`.
5. Log in with the default facilitator token `FACIL1`.
6. Create one Developer token in **Users**. Note it.
7. Open `https://your-project.pages.dev` in a private/incognito window. Log in with the Developer token.
8. In the admin window, create an issue (switch to the Users tab to make a Business token first if needed, or create an issue manually via SQL).
9. Verify the issue appears in the participant window within 3 seconds.
10. Open a card as the Developer, claim it for a team, add a Task, and either drag any local image onto the dashed upload area, or click that area to pick one. Confirm the thumbnail preview and file name show up. Click **Upload &amp; mark complete**. The button should briefly read **Uploading...**, the task should flip to `complete`, and a Supabase Storage URL should appear inline as a link.

If all of that works, you are ready to run the session.

## About the `_headers` file

The `public/` folder ships with a `_headers` file that Cloudflare Pages reads automatically. It sets `Cache-Control: no-cache` on every asset, which forces the browser to revalidate with the server before serving any cached file. This is what guarantees that when you redeploy mid-cycle, every participant gets the new build on their next page load instead of staring at a stale cached UI. The transferred bytes are tiny (304 Not Modified responses), so the bandwidth cost is negligible. Do not delete this file unless you are intentionally taking responsibility for cache headers yourself.

## Custom domain (optional)

Cloudflare Pages projects can be mapped to a custom domain you own. In the Pages project settings, **Custom domains** → **Set up a custom domain**. The domain must be managed by Cloudflare DNS.

## Updating the app

- **Direct upload**: re-upload the `public/` folder. Each deploy is a new version; Cloudflare keeps history.
- **Wrangler**: re-run `wrangler pages deploy ./public --project-name=devops-learning-game`.
- **Git**: push to the branch connected to Pages.

## Changing Supabase credentials

Edit `public/config.js` and redeploy. The new credentials are picked up on the next page load.
