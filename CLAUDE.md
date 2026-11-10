# Working on hlixlabs (hlixlabs.com)

## Ship every change live, without asking

The owner wants every change they ask for put live right away, with no approval
step and no "ship it" from them. Finish each task from beginning to end:

1. Rebuild what the change touches (`python3 scripts/build_v3.py` for the main site,
   `scripts/build_v2.py` for /v2/ and planner-embed.html), and try it in a browser
   (`python3 scripts/serve.py`), with tests for anything in `api/`.
2. If it needs a database change, it goes in the admin repo (hlix-admin) as a migration,
   applied to the `hlix` Supabase project (ref `ewfyqdkctzswghkreyqa`) before this code ships.
3. Commit, push the work branch, then fast-forward `main` to it (Vercel deploys `main`
   to hlixlabs.com). If `main` moved, merge it in first; never force-push.
4. Confirm the Vercel deployment finished, and say in one line what went live.

Don't open a pull request or wait for a review unless asked.

## Commits

Author commits as `henrymosk1011 <110219347+henrymosk1011@users.noreply.github.com>`
(Vercel only deploys commits from an author it recognizes), with the Claude co-author line.
