# Deploying to Cloudflare Pages

Cloudflare Pages hosts the static frontend for free with generous bandwidth limits. No Git repository required.

Prerequisites: Supabase backend is set up ([SUPABASE_SETUP.md](SUPABASE_SETUP.md)) and `config.js` exists in this folder with your credentials.

## Option 1: Direct upload (easiest)

1. Sign in to the [Cloudflare dashboard](https://dash.cloudflare.com). Create a free account if you don't have one.
2. Left sidebar: **Workers & Pages**.
3. Click **Create** → **Pages** → **Upload assets**.
4. Name the project, e.g. `devops-colouring`. The name becomes part of the URL: `devops-colouring.pages.dev`.
5. Drag the entire project folder (or a zip of it) onto the upload area. Make sure `config.js` (not `config.example.js`) is included.
6. Click **Deploy site**.

Deployment takes under a minute. You get a URL like `https://devops-colouring.pages.dev`.

## Option 2: Wrangler CLI

If you prefer the command line:

```bash
npm install -g wrangler
wrangler login
wrangler pages deploy ./ --project-name=devops-colouring
```

Run from the project folder. Subsequent deploys overwrite the previous.

## Option 3: Git integration

Push this folder to a GitHub repository. In Cloudflare Pages, choose **Connect to Git**, select the repository, and configure:

- **Build command**: leave empty
- **Build output directory**: `/`
- **Environment variables**: none required

**Important if you use Git**: add `config.js` to `.gitignore` so your Supabase credentials are not public. Use Cloudflare Pages **Environment Variables** or a build-time substitution instead. For a classroom session with throwaway credentials, it is simpler to skip Git and use direct upload.

## Post-deploy smoke test

1. Open `https://your-project.pages.dev` in a browser.
2. You should see the login screen. If you see a "Configuration required" page, `config.js` is missing or still has placeholder values.
3. Go to `https://your-project.pages.dev/admin.html`.
4. Log in with the default facilitator token `FACIL1`.
5. Create one Developer token. Note it.
6. Open `https://your-project.pages.dev` in a private/incognito window. Log in with the Developer token.
7. In the admin window, create an issue (switch to the Users tab to make a Business token first if needed, or just create an issue manually via SQL).
8. Verify the issue appears in the participant window within 3 seconds.

If all of that works, you are ready to run the session.

## Custom domain (optional)

Cloudflare Pages projects can be mapped to a custom domain you own. In the Pages project settings, **Custom domains** → **Set up a custom domain**. You need the domain to be managed by Cloudflare DNS.

## Updating the app

Direct upload: re-upload the folder. Each deploy is a new version; Cloudflare keeps history.

Wrangler: re-run `wrangler pages deploy ./`.

Git: push to the branch connected to Pages.

## Changing Supabase credentials

Edit `config.js` and redeploy. The new credentials are picked up on the next page load.
