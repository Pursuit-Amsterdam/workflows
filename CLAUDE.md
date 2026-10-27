# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this repo is

A library of **reusable GitHub Actions composite actions and reusable workflows** for Pursuit-Amsterdam projects. Nothing here runs standalone — other repos consume it by pinning refs like `Pursuit-Amsterdam/workflows/.github/workflows/web-ci.yml@main` or `.../actions/setup-node-pnpm@main`. There is no application, no build, no package to install. The artifacts are the YAML files in `.github/`.

Consumer-facing usage (every input/output, examples) lives in `README.md` — keep it in sync when you change an action/workflow interface.

## Layout

- `.github/actions/<name>/action.yml` — composite actions, single responsibility each (setup-node-pnpm, setup-python, setup-onepassword, setup-services, setup-supabase, setup-version, run-codegen, run-translations, run-docker-build-push, run-image-smoke, deploy-vercel, deploy-swarm).
- `.github/workflows/<name>.yml` — `workflow_call` reusable workflows that compose those actions (ci, ci-images, check-pr, cd-gate, cd-vercel, cd-swarm, cd-supabase, cd-pages, cd-packages, release-draft). `self-ci.yml` is this repo's own CI.
- The v1 workflows and actions (web-ci, backend-ci, web-cd, vm-cd, storybook-cd, …) live only on `main`; v1 consumers pin `@main`.

Dependency direction: **workflows → composite actions → third-party actions**. Logic lives in the composite actions; workflows wire inputs/secrets and gate ordering (quality checks before deploy).

## Conventions that aren't obvious

- **Runner**: jobs use `blacksmith-4vcpu-ubuntu-2404` (a Blacksmith self-hosted runner), not `ubuntu-latest`. Match the surrounding file.
- **Secrets flow through 1Password**, not raw GH secrets. `setup-onepassword` pulls a vault item, masks every value (`::add-mask::`), writes them to `$GITHUB_ENV` (multiline-safe via heredoc), and can additionally emit a NUL-delimited Vercel `--env` args file. Preserve masking when editing.
- **`check-pr.sh` is a local mirror of the inline script in `check-pr.yml`.** Edit both together — `check-pr.sh` hardcodes `HEAD`/`BASE` on its first two lines so you can run it locally. `scripts/check-pr-cases.sh` runs it for a table of `HEAD BASE expected-exit` cases; add a case for every rule you touch.

## Branch & merge model (enforced by check-pr, and used in this repo)

Allowed heads: `main`, `develop`, `acceptance`, `hotfix/*`, `feature/*`, `release/*`, `dependabot/*`, `module-develop/*`, `module-feature/*`, and matching `revert-<n>-*`.

Merge rules: `feature/*` `dependabot/*` `module-develop/*` `main` → `develop`; `hotfix/*` `release/*` `develop` → `main`; `module-feature/*` → `module-develop/*`; `develop` → `release/*`; `develop` → `acceptance`. Stacked PRs (GitHub's stack feature targets the parent branch) are allowed same-prefix: `feature/*` → `feature/*`, `hotfix/*` → `hotfix/*`, `module-feature/*` → `module-feature/*`. Branch from `main` here (default), name it accordingly, and PR per these rules. A repo without `develop` (the config packages) also merges `feature/*` and `dependabot/*` into `main`; check-pr looks that up through the API, `check-pr.sh` has it as `HAS_DEVELOP`.

## Working on `v2`

- `v2` is the branch under development (see `docs/v2/`). Branch `feature/<topic>` from `v2` and open a PR to `v2`; `check-pr` allows `feature/*` and `hotfix/*` into `v*`.
- **A PR to `v2` needs a senior developer** (`@Pursuit-Amsterdam/senior-developers`, admin on the repo): a senior may merge their own PR, everyone else needs a senior's review (CODEOWNERS + the ruleset on `v*`, which lets repo admins bypass the review on pull requests only). A green `pipeline` check is required for everyone. A merge to `v2` runs in every repo that calls these workflows.
- Tools you need locally: Node from `.nvmrc` (26; `nvm use`), `pnpm` (version from `packageManager` in `package.json`; corepack picks it up), `actionlint`, `shellcheck`, and the GitHub CLI `gh` (logged in with access to the org) for the consumer scripts. On macOS: `brew install actionlint shellcheck gh`. Run `pnpm install` once: `lint` also typechecks the scripts.
- The consumer scripts (`audit-consumers`, `setup-consumer`, `migrate-consumer`) are TypeScript, run directly by Node (`node scripts/<name>.ts`, no build step); shared code lives in `scripts/lib/`. Node only strips types, so no enums or namespaces (`erasableSyntaxOnly`). They use the local `gh` login, or `GH_TOKEN`. `check-pr.sh` and the `*-cases.sh` tests stay bash; TypeScript tests use `node:test` next to the code (`scripts/lib/*.test.ts`).
- `pnpm lint` and `pnpm test` are exactly what CI runs; run them before you push.

## Testing changes

- Branch logic: `scripts/check-pr-cases.sh` (the whole table), or `./check-pr.sh` after editing the `HEAD`/`BASE` vars at the top.
- Action/workflow YAML: validate with `actionlint` if available; otherwise rely on a consumer repo's CI against your branch ref. There is no test suite to run.
