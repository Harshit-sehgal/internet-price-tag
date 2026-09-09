# Branch Protection & Release Process

> Money-handling repo. Changes to payment, DB and rate-limiting code must not
> bypass CI. This doc is the checklist for whoever has admin on
> `Harshit-sehgal/internet-price-tag`. It takes ~3 minutes in the GitHub UI.

## Required settings (Settings → Branches → Add rule for `main`)

- Branch name pattern: `main`
- ☑ Require a pull request before merging — 1 approval
- ☑ Require status checks to pass before merging
  - Search for the `verify` job from `.github/workflows/ci.yml` and require it.
  - ☑ Require branches to be up to date before merging
- ☑ Require conversation resolution before merging (optional but recommended)
- ☑ Do not allow bypassing the above settings (applies to admins too, unless you add an explicit bypass list)
- ☑ Restrict who can push to matching branches — no direct pushes by default
- ☐ Allow force pushes — **OFF**
- ☐ Allow deletions — **OFF**

Verify with the CLI (needs `gh` auth):

```bash
gh api repos/Harshit-sehgal/internet-price-tag/branches/main/protection --jq .
gh api repos/Harshit-sehgal/internet-price-tag/rulesets --jq '.[].name'
```

## CI is the gate

`.github/workflows/ci.yml` (`verify` job) must stay required. It runs:

`lint` → `typecheck` → `test:market` → `test:concurrency` → `test` → `build`
→ `test:browser` → migrations smoke → analytics/health smoke → live HTTP race.

Never weaken it to unblock a release. If it's red, the release is red.

## Release lanes

- `main` — production. Vercel Production env points here only.
- Preview deployments — every PR / non-main branch. Must use **Preview** env
  vars (staging Supabase + Dodo **test** keys). Never copy Production secrets
  into Preview.
- `smoke:staging` (`scripts/staging-smoke.mjs`) is the preview gate:

  ```bash
  STAGING_URL=https://<preview>.vercel.app npm run smoke:staging
  ```

  Wire it as a required check on PRs once Vercel preview deploys are stable.

## Hotfix exception

If production is down and a direct fix is needed, an admin may temporarily
bypass protection, but must immediately open a retro PR and re-enable it.
Document the bypass in the PR description and in `CONTRIBUTING.md` if you add one.
