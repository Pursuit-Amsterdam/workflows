# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this repo is

A library of **reusable GitHub Actions composite actions and reusable workflows** for Pursuit-Amsterdam projects. Nothing here runs standalone — other repos consume it by pinning refs like `Pursuit-Amsterdam/workflows/.github/workflows/web-ci.yml@main` or `.../actions/setup-node-pnpm@main`. There is no application, no build, no package to install. The artifacts are the YAML files in `.github/`.

Consumer-facing usage (every input/output, examples) lives in `README.md` — keep it in sync when you change an action/workflow interface.

## Layout

- `.github/actions/<name>/action.yml` — composite actions, single responsibility each (setup-node-pnpm, setup-onepassword, setup-version, run-codegen, run-pnpm-build-test, run-supabase-test, run-docker-build-push, deploy-vercel, deploy-azure, deploy-supabase).
- `.github/workflows/<name>.yml` — `workflow_call` reusable workflows that compose those actions (web-ci, web-cd, backend-ci, backend-cd, codegen, storybook-cd, vm-cd, azure-cd, check-pr).

Dependency direction: **workflows → composite actions → third-party actions**. Logic lives in the composite actions; workflows wire inputs/secrets and gate ordering (quality checks before deploy).

## Conventions that aren't obvious

- **Runner**: jobs use `blacksmith-4vcpu-ubuntu-2404` (a Blacksmith self-hosted runner), not `ubuntu-latest`. Match the surrounding file.
- **Secrets flow through 1Password**, not raw GH secrets. `setup-onepassword` pulls a vault item, masks every value (`::add-mask::`), writes them to `$GITHUB_ENV` (multiline-safe via heredoc), and can additionally emit a NUL-delimited Vercel `--env` args file or Azure `key=value` app-settings strings. Azure has two output flavors: `azure_settings_full` and `azure_settings_public_only` (drops `CONCEALED` fields). Preserve masking and the public/concealed split when editing.
- **`check-pr.sh` is a local mirror of the inline script in `check-pr.yml`.** Edit both together — `check-pr.sh` hardcodes `HEAD`/`BASE` at the top so you can run it locally to test the branch-naming and merge-rule logic. It is the only runnable test in the repo.
- Graceful degradation: `run-pnpm-build-test` warns (doesn't fail) on missing npm scripts; command names (build/test/lint/typecheck) are overridable inputs.

## Branch & merge model (enforced by check-pr, and used in this repo)

Allowed heads: `main`, `develop`, `acceptance`, `hotfix/*`, `feature/*`, `release/*`, `dependabot/*`, `module-develop/*`, `module-feature/*`, and matching `revert-<n>-*`.

Merge rules: `feature/*` `dependabot/*` `module-develop/*` `main` → `develop`; `hotfix/*` `release/*` `develop` → `main`; `module-feature/*` → `module-develop/*`; `develop` → `release/*`; `develop` → `acceptance`. Branch from `main` here (default), name it accordingly, and PR per these rules.

## Testing changes

- Branch logic: `./check-pr.sh` after editing the `HEAD`/`BASE` vars at the top.
- Action/workflow YAML: validate with `actionlint` if available; otherwise rely on a consumer repo's CI against your branch ref. There is no test suite to run.
