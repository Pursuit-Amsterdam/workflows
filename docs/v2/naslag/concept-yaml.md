<a id="drafts"></a>

# Concept-YAML

De workflowbestanden komen door `actionlint` en `shellcheck`, op één waarschuwing na die de bestaande workflows ook geven (actionlint kent het Blacksmith-runnerlabel niet). Het auditscript komt schoon door `shellcheck`. Op 15 oktober zijn de bestanden ook gecontroleerd tegen de interfaces van de bestaande actions op `main`, en de fouten daaruit zijn verwerkt. Wat nog niet bestaat, kon niet gecontroleerd worden: `setup-supabase`, de output `url` van deploy-vercel, en de inputs `pre-deploy`, `environment` en `version` van deploy-swarm. Externe actions staan op een vaste commit, met de versie als commentaar. Elke interne verwijzing gebruikt `@v2`. Niets hiervan is gecommit. De YAML is in het Engels, zoals alle code in de repo.

Op 15 oktober zijn na een review verwerkt: geen `dispatch-ref` en geen `dispatch-target` meer in de gate (het doel komt uit de ref waarvan je start), `main` uit de standaard-branchmapping, en de gate-logica volledig uitgeschreven op basis van gp-map ([besloten](../beslissingen.md#decided)); `working-directory` in elke concurrency-groep en in elke aanroep van `setup-node-pnpm`; `migrate-image` krijgt in cd-swarm weer de versietag; `framework: next` in cd-vercel; validatie van `build-mode`; de wijzigingsdetectie in ci-images vergelijkt met de merge-base; `build-env` per image in ci-images; cd-packages publiceert met `GITHUB_TOKEN` door de `.npmrc` van de install te overschrijven. De wijzigingen aan de bestaande actions (`working-directory` en `--frozen-lockfile` in setup-node-pnpm, `--target=staging` en de vaste CLI-versie in deploy-vercel, vastgepinde externe actions) staan in [bouwstenen](bouwstenen.md#shared) en zijn hier niet als YAML uitgeschreven.

.github/workflows/ci.yml workflow_call · 1 job · draait de scripts van de repo

```yaml
name: "CI"

# One CI workflow for every repo. The repo's package.json scripts are the contract:
# this workflow decides when and which checks run; the repo decides what a check does.
#   runtimes  - node + pnpm always; uv + python when the repo has a pyproject.toml.
#               Versions come from the repo (.nvmrc, .python-version), else 22.x / 3.12.
#   checks    - required list of script names. With a turbo.json they run through turbo
#               (only affected packages on pull requests); otherwise `pnpm run`, in order.
#   services  - database, 1Password, translations CMS.
# A requested check the repo does not define fails the job: nothing checked is never green.
# Supersedes web-ci.yml, backend-ci.yml and fullstack-ci.yml. Developed on the v2 branch; every internal ref pins @v2.

on:
  workflow_call:
    inputs:
      # ── checks ───────────────────────────────────────────────────────────
      checks:
        description: "Space-separated script names to run, e.g. `lint typecheck test`. Required, never empty. Codegen is a script too (a turbo dependsOn, or first in the list)."
        required: true
        type: string
      working-directory:
        description: "Directory holding the root package.json"
        required: false
        type: string
        default: "."
      use-custom-token:
        description: "Use CUSTOM_GITHUB_TOKEN (PAT) instead of GITHUB_TOKEN for private npm packages / private git deps"
        required: false
        type: boolean
        default: false

      # ── services ────────────────────────────────────────────────────────
      database:
        description: >
          none | postgres | supabase. Which database to boot before the checks. Both
          export DATABASE_URL (and supabase also SUPABASE_URL / SUPABASE_ANON_KEY /
          SUPABASE_SERVICE_ROLE_KEY). When `dbtest` is the only check, supabase is
          skipped entirely if nothing under supabase/ changed.
        required: false
        type: string
        default: "none"
      postgres-image:
        required: false
        type: string
        default: "postgres:18-alpine"
      postgres-user:
        required: false
        type: string
        default: "postgres"
      postgres-password:
        required: false
        type: string
        default: "postgres"
      postgres-db:
        required: false
        type: string
        default: "postgres"
      supabase-seed:
        required: false
        type: boolean
        default: false
      onepassword-vault:
        required: false
        type: string
        default: ""
      onepassword-item:
        description: "Non-empty enables 1Password secret loading"
        required: false
        type: string
        default: ""

      # ── translations CMS ─────────────────────────────────────────────────
      tms-sync-branch:
        description: "Branch whose pushes sync translation keys to the CMS (e.g. develop). Empty = no sync."
        required: false
        type: string
        default: ""
      tms-working-directory:
        description: "Directory the translations CLI runs in. Empty = working-directory."
        required: false
        type: string
        default: ""

    secrets:
      OP_SERVICE_ACCOUNT_TOKEN:
        required: false
      CUSTOM_GITHUB_TOKEN:
        required: false
      TMS_URL:
        required: false
      TMS_API_KEY:
        required: false

jobs:
  # Job id stays `pipeline` so a caller job `run-ci` keeps the status check name
  # `run-ci / pipeline` that branch protection already requires.
  pipeline:
    runs-on: blacksmith-4vcpu-ubuntu-2404
    timeout-minutes: 60
    environment: "integration"
    defaults:
      run:
        working-directory: ${{ inputs.working-directory }}

    steps:
      - name: Checkout
        uses: actions/checkout@3d3c42e5aac5ba805825da76410c181273ba90b1 # v7.0.1
        with:
          fetch-depth: 0   # turbo --affected compares against the base branch

      - name: Validate inputs and read the repo
        id: repo
        env:
          DATABASE: ${{ inputs.database }}
          CHECKS: ${{ inputs.checks }}
        run: |
          set -euo pipefail
          case "$DATABASE" in none|postgres|supabase) ;; *)
            echo "::error::database must be none, postgres or supabase (got '$DATABASE')"; exit 1;; esac
          # One line, single spaces: `checks: |` over several lines must not drop
          # every check after the first, and `dbtest` alone must still match.
          checks=$(tr -s '[:space:]' ' ' <<<"$CHECKS" | sed 's/^ //; s/ $//')
          [ -n "$checks" ] || { echo "::error::checks is empty: this job would pass without running anything."; exit 1; }
          [ -f package.json ] || { echo "::error::no package.json in working-directory: the repo's scripts are the CI contract."; exit 1; }
          {
            echo "checks=$checks"
            echo "only-dbtest=$([ "$checks" = dbtest ] && echo true || echo false)"
            echo "turbo=$([ -f turbo.json ] && echo true || echo false)"
            echo "node-version=$(cat .nvmrc 2>/dev/null || echo 22.x)"
          } >> "$GITHUB_OUTPUT"
          # A monorepo keeps its Python project in a subdirectory (backend/). uv is
          # set up there; `uv run` in the other packages' scripts syncs those itself.
          pyproject=$(find . -name pyproject.toml -not -path '*/node_modules/*' -not -path '*/.venv/*' | sort | head -n1)
          if [ -n "$pyproject" ]; then
            pydir=$(dirname "$pyproject")
            {
              echo "python=true"
              echo "python-dir=$pydir"
              echo "python-version=$(cat "$pydir/.python-version" 2>/dev/null || echo 3.12)"
            } >> "$GITHUB_OUTPUT"
          else
            echo "python=false" >> "$GITHUB_OUTPUT"
          fi

      - name: Services (database, secrets)
        id: services
        uses: Pursuit-Amsterdam/workflows/.github/actions/setup-services@v2
        with:
          database: ${{ inputs.database }}
          supabase-seed: ${{ inputs.supabase-seed }}
          # When dbtest is the only check, the stack only serves it: skip it when supabase/ is untouched.
          supabase-skip-unchanged: ${{ steps.repo.outputs.only-dbtest }}
          postgres-image: ${{ inputs.postgres-image }}
          postgres-user: ${{ inputs.postgres-user }}
          postgres-password: ${{ inputs.postgres-password }}
          postgres-db: ${{ inputs.postgres-db }}
          onepassword-vault: ${{ inputs.onepassword-vault }}
          onepassword-item: ${{ inputs.onepassword-item }}
          onepassword-token: ${{ secrets.OP_SERVICE_ACCOUNT_TOKEN }}

      # working-directory: pnpm reads packageManager from the package.json it runs
      # next to, so a Python repo with only backend/package.json needs it.
      - name: Setup Node.js and pnpm
        uses: Pursuit-Amsterdam/workflows/.github/actions/setup-node-pnpm@v2
        with:
          node-version: ${{ steps.repo.outputs.node-version }}
          node-auth-token: ${{ inputs.use-custom-token && secrets.CUSTOM_GITHUB_TOKEN || secrets.GITHUB_TOKEN }}
          working-directory: ${{ inputs.working-directory }}

      - name: Setup Python (uv)
        if: steps.repo.outputs.python == 'true'
        uses: Pursuit-Amsterdam/workflows/.github/actions/setup-python@v2
        with:
          python-version: ${{ steps.repo.outputs.python-version }}
          working-directory: ${{ inputs.working-directory }}/${{ steps.repo.outputs.python-dir }}
          github-token: ${{ inputs.use-custom-token && secrets.CUSTOM_GITHUB_TOKEN || secrets.GITHUB_TOKEN }}

      - name: Turbo cache
        if: steps.repo.outputs.turbo == 'true'
        uses: actions/cache@55cc8345863c7cc4c66a329aec7e433d2d1c52a9 # v6.1.0
        with:
          path: ${{ inputs.working-directory }}/.turbo
          key: turbo-${{ runner.os }}-${{ github.ref_name }}-${{ github.sha }}
          restore-keys: |
            turbo-${{ runner.os }}-${{ github.ref_name }}-
            turbo-${{ runner.os }}-

      # One step for every repo shape. A check the repo does not define fails
      # with its name: nothing checked is never green.
      - name: Run checks
        if: ${{ !(inputs.database == 'supabase' && steps.repo.outputs.only-dbtest == 'true' && steps.services.outputs.supabase-started != 'true') }}
        env:
          CHECKS: ${{ steps.repo.outputs.checks }}
          TURBO: ${{ steps.repo.outputs.turbo }}
          EVENT: ${{ github.event_name }}
        run: |
          set -euo pipefail
          read -ra checks <<<"$CHECKS"
          if [ "$TURBO" = true ]; then
            # turbo runs a task that no package defines as zero tasks, and passes.
            defined=$(find . -name package.json -not -path '*/node_modules/*' -print0 \
              | xargs -0 jq -r '.scripts // {} | keys[]' | sort -u)
            for c in "${checks[@]}"; do
              grep -qxF -- "$c" <<<"$defined" || { echo "::error::no package defines a '$c' script"; exit 1; }
            done
            args=(--cache-dir=.turbo)
            if [ "$EVENT" = pull_request ]; then args+=(--affected); fi
            pnpm turbo run "${checks[@]}" "${args[@]}"
          else
            for c in "${checks[@]}"; do
              echo "::group::pnpm run $c"
              pnpm run "$c"
              echo "::endgroup::"
            done
          fi

      # After the checks on purpose: a codebase that does not compile is not a
      # trustworthy source of truth for what keys to delete.
      - name: Sync translation keys to the CMS
        if: inputs.tms-sync-branch != '' && github.ref == format('refs/heads/{0}', inputs.tms-sync-branch)
        uses: Pursuit-Amsterdam/workflows/.github/actions/run-translations@v2
        with:
          command: sync
          working-directory: ${{ inputs.tms-working-directory || inputs.working-directory }}
          tms-url: ${{ secrets.TMS_URL }}
          tms-api-key: ${{ secrets.TMS_API_KEY }}
```

.github/actions/setup-services/action.yml composite · 7 stappen · 3 outputs

```yaml
name: "Services"
description: >
  Side services a CI job may need before any check runs: a database (plain
  Postgres container or the Supabase local stack) and secrets from 1Password.
  Opt-in by value, not by flag: `database: postgres|supabase` boots that
  database and exports DATABASE_URL, a non-empty `onepassword-item` loads the
  vault item. Never runs a check. Shared by ci.yml, ci-images.yml and every cd-*.yml (1Password half).
inputs:
  database:
    description: "none | postgres | supabase"
    required: false
    default: "none"
  redis:
    description: "Start a Redis container on localhost:6379 (image-ci backend boots need it)"
    required: false
    default: "false"
  redis-image:
    required: false
    default: "redis:8-alpine"
  supabase-seed:
    description: "Keep supabase/seed.sql when starting the stack"
    required: false
    default: "false"
  supabase-skip-unchanged:
    description: "Skip starting the Supabase stack when nothing under supabase/ changed since the base commit"
    required: false
    default: "false"
  postgres-image:
    required: false
    default: "postgres:18-alpine"
  postgres-user:
    required: false
    default: "postgres"
  postgres-password:
    required: false
    default: "postgres"
  postgres-db:
    required: false
    default: "postgres"
  onepassword-vault:
    description: "1Password vault. Required when onepassword-item is set."
    required: false
    default: ""
  onepassword-item:
    description: "1Password item. Non-empty enables secret loading."
    required: false
    default: ""
  onepassword-token:
    description: "OP_SERVICE_ACCOUNT_TOKEN. Required when onepassword-item is set."
    required: false
    default: ""
  onepassword-export-for-vercel:
    description: "Also write the Vercel --env args file (cd-vercel)"
    required: false
    default: "false"
  onepassword-export-build-args:
    description: "Also emit non-concealed fields as Docker build args (cd-swarm)"
    required: false
    default: "false"

outputs:
  database-url:
    description: "Connection URL of whichever database was started; also exported as DATABASE_URL"
    value: ${{ steps.postgres.outputs.database-url || steps.supabase.outputs.db-url }}
  build-args:
    description: "Non-concealed 1Password fields as KEY=value, one per line, when onepassword-export-build-args is true"
    value: ${{ steps.build-args.outputs.value }}
  supabase-started:
    description: "'true' when the Supabase stack is up (false when skipped as unchanged or not requested)"
    value: ${{ steps.supabase.outputs.started || 'false' }}

runs:
  using: "composite"
  steps:
    - name: Validate service inputs
      shell: bash
      env:
        DATABASE: ${{ inputs.database }}
        OP_VAULT: ${{ inputs.onepassword-vault }}
        OP_ITEM: ${{ inputs.onepassword-item }}
        OP_TOKEN: ${{ inputs.onepassword-token }}
      run: |
        set -euo pipefail
        case "$DATABASE" in none|postgres|supabase) ;; *)
          echo "::error::database must be none, postgres or supabase (got '$DATABASE')"; exit 1;; esac
        if [ -n "$OP_ITEM" ] && { [ -z "$OP_VAULT" ] || [ -z "$OP_TOKEN" ]; }; then
          echo "::error::onepassword-item is set but onepassword-vault or OP_SERVICE_ACCOUNT_TOKEN is missing"; exit 1
        fi

    - name: Start Postgres
      id: postgres
      if: inputs.database == 'postgres'
      shell: bash
      env:
        POSTGRES_IMAGE: ${{ inputs.postgres-image }}
        POSTGRES_USER: ${{ inputs.postgres-user }}
        POSTGRES_PASSWORD: ${{ inputs.postgres-password }}
        POSTGRES_DB: ${{ inputs.postgres-db }}
      # Body lifted verbatim from backend-ci.yml (-e VAR forwarding, TCP readiness probe).
      run: |
        set -euo pipefail
        docker run -d --name ci-postgres \
          -e POSTGRES_USER -e POSTGRES_PASSWORD -e POSTGRES_DB \
          -p 5432:5432 "$POSTGRES_IMAGE"
        for _ in $(seq 1 30); do
          if docker exec ci-postgres pg_isready -h 127.0.0.1 -U "$POSTGRES_USER" -d "$POSTGRES_DB" >/dev/null 2>&1; then
            url="postgres://${POSTGRES_USER}:${POSTGRES_PASSWORD}@localhost:5432/${POSTGRES_DB}"
            echo "database-url=$url" >> "$GITHUB_OUTPUT"
            echo "DATABASE_URL=$url" >> "$GITHUB_ENV"
            exit 0
          fi
          sleep 1
        done
        echo "::error::Postgres failed to become ready"; docker logs ci-postgres >&2 || true; exit 1

    - name: Start Redis
      if: inputs.redis == 'true'
      shell: bash
      env:
        REDIS_IMAGE: ${{ inputs.redis-image }}
      run: |
        set -euo pipefail
        docker run -d --name ci-redis -p 6379:6379 "$REDIS_IMAGE"
        for _ in $(seq 1 30); do
          docker exec ci-redis redis-cli ping 2>/dev/null | grep -q PONG && { echo "REDIS_URL=redis://localhost:6379" >> "$GITHUB_ENV"; exit 0; }
          sleep 1
        done
        echo "::error::Redis failed to become ready"; exit 1

    # Supabase = the service half of today's run-supabase-test: change detection,
    # CLI install, `supabase start`, seed handling, and the URL/key outputs. The
    # pgTAP run moves to ci.yml as the `dbtest` check.
    - name: Start Supabase local stack
      id: supabase
      if: inputs.database == 'supabase'
      uses: Pursuit-Amsterdam/workflows/.github/actions/setup-supabase@v2
      with:
        seed: ${{ inputs.supabase-seed }}
        skip-if-no-changes: ${{ inputs.supabase-skip-unchanged }}

    - name: Load 1Password secrets
      id: onepassword
      if: inputs.onepassword-item != ''
      uses: Pursuit-Amsterdam/workflows/.github/actions/setup-onepassword@v2
      with:
        service-account-token: ${{ inputs.onepassword-token }}
        vault-name: ${{ inputs.onepassword-vault }}
        item-name: ${{ inputs.onepassword-item }}
        export-for-vercel: ${{ inputs.onepassword-export-for-vercel }}
        export-build-args: ${{ inputs.onepassword-export-build-args }}

    # setup-onepassword joins the pairs with spaces; build-push-action reads one
    # per line. Same conversion as run-docker-build-push does in v1.
    - name: Build args, one per line
      id: build-args
      if: inputs.onepassword-item != '' && inputs.onepassword-export-build-args == 'true'
      shell: bash
      env:
        ARGS: ${{ steps.onepassword.outputs.build_args }}
      run: |
        set -euo pipefail
        { echo "value<<BUILD_ARGS_EOF"; tr ' ' '\n' <<<"$ARGS"; echo "BUILD_ARGS_EOF"; } >> "$GITHUB_OUTPUT"
```

.github/workflows/cd-vercel.yml workflow_call · 1 job · typecheck na codegen/pull · health na deploy

```yaml
name: "CD Vercel"

# Deploys a Node project to Vercel. Source checks (lint, format, test) are not
# repeated: CI proves the SHA, cd-gate proves CI succeeded on it. What CD adds
# itself is checked here: code generated after CI (codegen, translations pull)
# is typechecked before the build, and the deployed URL must answer.
# Per-environment values come from the GitHub
# environment: an empty onepassword-vault/-item falls back to the environment
# variables OP_VAULT / OP_ITEM, so one caller job serves staging and production.

on:
  workflow_call:
    inputs:
      environment:
        description: "GitHub environment to deploy: staging or production; anything else fails. Drives the Vercel target: production => --prod, staging => --target=staging (the Vercel custom environment of develop, with its own URL; decided)."
        required: true
        type: string
      ref:
        description: "Commit to deploy. Empty = github.sha. workflow_run callers must pass cd-gate's `sha` output."
        required: false
        type: string
        default: ""
      working-directory:
        description: "Directory holding package.json. The Node version comes from its .nvmrc (else 22.x)."
        required: false
        type: string
        default: "."
      use-custom-token:
        description: "Use CUSTOM_GITHUB_TOKEN for private @pursuit-amsterdam packages"
        required: false
        type: boolean
        default: false

      # ── build ───────────────────────────────────────────────────────────
      codegen:
        description: "Name of the package script that generates code before the build (e.g. `codegen`). Empty = none."
        required: false
        type: string
        default: ""
      build-mode:
        description: "github (build here, deploy --prebuilt) | vercel (build on Vercel)"
        required: false
        type: string
        default: "github"
      vercel-build-command:
        required: false
        type: string
        default: ""
      prepare-package:
        description: "Strip \"type\": \"module\" from package.json for the Vercel runtime"
        required: false
        type: boolean
        default: false
      vercel-project-env-keys:
        description: "Env var names also written to Vercel's project-level env store"
        required: false
        type: string
        default: "CRON_SECRET"

      # ── checks on what CD adds (never a repeat of CI) ───────────────────
      # The `typecheck` script runs automatically after codegen / translations pull.
      health-path:
        description: "Path that must answer 2xx on the deployment URL after the deploy (e.g. /api/health). Empty = no check."
        required: false
        type: string
        default: ""

      # ── translations CMS ────────────────────────────────────────────────
      tms:
        description: >
          Pull published translations before the build and report this deploy to
          the translations CMS (release ack / mark-deployed / mark-failed). A
          boolean by necessity: the release id is empty on workflow_run and
          release runs and the CLI then picks the newest pending release.
        required: false
        type: boolean
        default: false
      codegen-check:
        description: "Name of the package script that compares the external input codegen fetched just now with the committed version (in $CODEGEN_BASELINE), e.g. an oasdiff breaking-change check. Empty = none. Needs codegen and codegen-baseline."
        required: false
        type: string
        default: ""
      codegen-baseline:
        description: "Space-separated committed files the codegen script overwrites with a fresh fetch (e.g. openapi.json); copied to $CODEGEN_BASELINE first"
        required: false
        type: string
        default: ""
      tms-release-id:
        description: "Release the CMS asked to deploy. Pass github.event.client_payload.release_id; empty on every other event."
        required: false
        type: string
        default: ""
      tms-working-directory:
        description: "Directory the translations CLI runs in. Empty = working-directory."
        required: false
        type: string
        default: ""

      # ── services ────────────────────────────────────────────────────────
      onepassword-vault:
        description: "Empty = vars.OP_VAULT of the environment"
        required: false
        type: string
        default: ""
      onepassword-item:
        description: "Empty = vars.OP_ITEM of the environment. Empty after fallback = no secrets."
        required: false
        type: string
        default: ""

    secrets:
      CUSTOM_GITHUB_TOKEN:
        required: false
      OP_SERVICE_ACCOUNT_TOKEN:
        required: false
      VERCEL_TOKEN:
        required: true
      VERCEL_ORG_ID:
        required: true
      VERCEL_PROJECT_ID:
        required: true
      TMS_URL:
        required: false
      TMS_API_KEY:
        required: false
      VERCEL_AUTOMATION_BYPASS_SECRET:
        description: "Only for health-path on a staging deployment behind Vercel Deployment Protection"
        required: false

permissions:
  contents: read

jobs:
  deploy:
    runs-on: blacksmith-4vcpu-ubuntu-2404
    environment: ${{ inputs.environment }}
    # One deploy per app and environment at a time; never cancel one that runs.
    # working-directory in the group: two apps in one monorepo must not queue
    # behind (and cancel) each other.
    concurrency:
      group: cd-vercel-${{ inputs.environment }}-${{ inputs.working-directory }}
      cancel-in-progress: false
    defaults:
      run:
        working-directory: ${{ inputs.working-directory }}
    steps:
      - name: Checkout
        uses: actions/checkout@3d3c42e5aac5ba805825da76410c181273ba90b1 # v7.0.1
        with:
          ref: ${{ inputs.ref }}
          fetch-depth: 0

      # An unknown build-mode would skip both deploy steps in deploy-vercel and
      # turn the run green: the `platform: azure-asp` mistake, again.
      - name: Validate inputs
        env:
          BUILD_MODE: ${{ inputs.build-mode }}
        run: |
          set -euo pipefail
          case "$BUILD_MODE" in github|vercel) ;; *)
            echo "::error::build-mode must be github or vercel (got '$BUILD_MODE')"; exit 1;; esac

      - name: Read the Node version from the repo
        id: node
        run: echo "version=$(cat .nvmrc 2>/dev/null || echo 22.x)" >> "$GITHUB_OUTPUT"

      - name: Setup Node.js and pnpm
        uses: Pursuit-Amsterdam/workflows/.github/actions/setup-node-pnpm@v2
        with:
          node-version: ${{ steps.node.outputs.version }}
          node-auth-token: ${{ inputs.use-custom-token && secrets.CUSTOM_GITHUB_TOKEN || secrets.GITHUB_TOKEN }}
          working-directory: ${{ inputs.working-directory }}

      - name: Services (secrets)
        uses: Pursuit-Amsterdam/workflows/.github/actions/setup-services@v2
        with:
          onepassword-vault: ${{ inputs.onepassword-vault || vars.OP_VAULT }}
          onepassword-item: ${{ inputs.onepassword-item || vars.OP_ITEM }}
          onepassword-token: ${{ secrets.OP_SERVICE_ACCOUNT_TOKEN }}
          onepassword-export-for-vercel: "true"

      # A release the CMS is waiting on expires after 3 minutes unless a deploy
      # acknowledges it, which buys 30. Everything above counts against that
      # window, so this goes as early as the CLI is usable.
      - name: Tell the translations CMS a deploy is running
        if: inputs.tms
        uses: Pursuit-Amsterdam/workflows/.github/actions/run-translations@v2
        with:
          command: ack
          release-id: ${{ inputs.tms-release-id }}
          working-directory: ${{ inputs.tms-working-directory || inputs.working-directory }}
          tms-url: ${{ secrets.TMS_URL }}
          tms-api-key: ${{ secrets.TMS_API_KEY }}

      # `next`, not `nextjs`: setup-version only prefixes NEXT_PUBLIC_ for the
      # value `next`, so web-cd never actually set NEXT_PUBLIC_VERSION.
      - name: Version
        uses: Pursuit-Amsterdam/workflows/.github/actions/setup-version@v2
        with:
          version: $(git describe --tags --abbrev=0 --always)
          framework: "next"
          environment: ${{ inputs.environment }}

      # Before codegen and the typecheck: pull rewrites the dictionaries and
      # regenerates settings.ts / types.ts, so the deploy ships the copy the CMS
      # published, and the typecheck sees it.
      - name: Pull published translations
        if: inputs.tms
        uses: Pursuit-Amsterdam/workflows/.github/actions/run-translations@v2
        with:
          command: pull
          working-directory: ${{ inputs.tms-working-directory || inputs.working-directory }}

      # The only checks CD runs on source: code generated after CI never went
      # through CI's typecheck, and an external input (an OpenAPI spec of another
      # service) may have changed since this commit.
      - name: Code generation and its checks
        uses: Pursuit-Amsterdam/workflows/.github/actions/run-codegen@v2
        with:
          codegen: ${{ inputs.codegen }}
          generated-elsewhere: ${{ inputs.tms }}
          codegen-check: ${{ inputs.codegen-check }}
          codegen-baseline: ${{ inputs.codegen-baseline }}
          working-directory: ${{ inputs.working-directory }}

      # staging is the Vercel custom environment `staging` (develop, its own
      # URL), production --prod (decided). deploy-vercel@v2 refuses anything else.
      - name: Deploy to Vercel
        id: vercel
        uses: Pursuit-Amsterdam/workflows/.github/actions/deploy-vercel@v2
        with:
          vercel-token: ${{ secrets.VERCEL_TOKEN }}
          vercel-org-id: ${{ secrets.VERCEL_ORG_ID }}
          vercel-project-id: ${{ secrets.VERCEL_PROJECT_ID }}
          environment: ${{ inputs.environment }}
          build-mode: ${{ inputs.build-mode }}
          prepare-package: ${{ inputs.prepare-package }}
          build-command: ${{ inputs.vercel-build-command }}
          vercel-project-env-keys: ${{ inputs.vercel-project-env-keys }}
          working-directory: ${{ inputs.working-directory }}

      # An upload that succeeded says nothing about an app that answers. Before
      # mark-deployed, so a dead deploy is reported to the CMS as failed.
      - name: Health check
        if: inputs.health-path != ''
        env:
          URL: ${{ steps.vercel.outputs.url }}
          HEALTH_PATH: ${{ inputs.health-path }}
          BYPASS: ${{ secrets.VERCEL_AUTOMATION_BYPASS_SECRET }}
        run: |
          set -euo pipefail
          [ -n "$URL" ] || { echo "::error::deploy-vercel returned no url"; exit 1; }
          hdr=(); [ -z "$BYPASS" ] || hdr=(-H "x-vercel-protection-bypass: $BYPASS")
          for i in $(seq 1 10); do
            code=$(curl -s -o /dev/null -w '%{http_code}' "${hdr[@]}" "${URL%/}${HEALTH_PATH}" || true)
            case "$code" in 2??) echo "healthy ($code)"; exit 0 ;; esac
            echo "attempt $i: $code"; sleep 6
          done
          echo "::error::${URL%/}${HEALTH_PATH} did not answer 2xx"; exit 1

      # The CMS cannot observe this deploy, so it has to be told. Without these
      # a release that went live is expired as failed. mark-deployed also scans
      # the source for the key manifest the production publish gate checks.
      - name: Mark the release deployed
        if: inputs.tms && success()
        uses: Pursuit-Amsterdam/workflows/.github/actions/run-translations@v2
        with:
          command: mark-deployed
          release-id: ${{ inputs.tms-release-id }}
          working-directory: ${{ inputs.tms-working-directory || inputs.working-directory }}

      - name: Mark the release failed
        if: inputs.tms && failure()
        uses: Pursuit-Amsterdam/workflows/.github/actions/run-translations@v2
        with:
          command: mark-failed
          release-id: ${{ inputs.tms-release-id }}
          reason: "${{ inputs.environment }} deploy failed"
          working-directory: ${{ inputs.tms-working-directory || inputs.working-directory }}
```

.github/workflows/cd-supabase.yml workflow_call · 1 job · secrets, migraties, functions

```yaml
name: "CD Supabase"

# Deploys the Supabase half of a project at one commit: function secrets,
# migrations, edge functions, in that order. No quality checks here: CI proves
# the SHA, cd-gate proves CI ran.
#
# Two credentials, deliberately kept apart:
#   SUPABASE_ACCESS_TOKEN - a machine-account PAT, GitHub environment secret on
#     staging and production. A Supabase PAT is unscoped and account-wide, and
#     developers can read 1Password by design, so it lives on the GitHub side
#     next to OP_SERVICE_ACCOUNT_TOKEN, behind the environment's branch rules.
#     It exists so that `supabase secrets set`, which needs Owner/Administrator
#     on the organisation, never needs a person.
#   the secret values - the environment's 1Password item, as everywhere else.

on:
  workflow_call:
    inputs:
      environment:
        description: "GitHub environment. Selects vars.SUPABASE_PROJECT_REF / OP_VAULT / OP_ITEM and the environment's protection rules."
        required: true
        type: string
      ref:
        description: "Commit to deploy. Empty = github.sha. Pass cd-gate's `sha`."
        required: false
        type: string
        default: ""
      project-ref:
        description: "Supabase project ref. Empty = vars.SUPABASE_PROJECT_REF of the environment (staging and production are different projects)."
        required: false
        type: string
        default: ""
      migrations:
        description: "Run `supabase db push`. false means functions-only; false together with `functions: none` is refused."
        required: false
        type: boolean
        default: true
      functions:
        description: "Empty = every function declared in supabase/config.toml (the source of truth). Space-separated names to deviate; `none` = deploy no functions."
        required: false
        type: string
        default: ""
      function-env-keys:
        description: >
          Names of variables to push to the project's function secret store,
          taken from the env the 1Password item populated. Empty = leave the
          secret store untouched. Set and update only: a name dropped from this
          list is reported, never deleted.
        required: false
        type: string
        default: ""
      working-directory:
        description: "Directory that holds supabase/"
        required: false
        type: string
        default: "."
      db-password-variable:
        description: "Variable from the 1Password item that holds the database password. Migrations link to project-ref, so no database URL is needed."
        required: false
        type: string
        default: "SUPABASE_DB_PASSWORD"
      onepassword-vault:
        description: "Empty = vars.OP_VAULT of the environment"
        required: false
        type: string
        default: ""
      onepassword-item:
        description: "Empty = vars.OP_ITEM of the environment"
        required: false
        type: string
        default: ""

    secrets:
      SUPABASE_ACCESS_TOKEN:
        description: "Machine-account PAT with Administrator on the Supabase organisation"
        required: true
      OP_SERVICE_ACCOUNT_TOKEN:
        required: false

permissions:
  contents: read

jobs:
  deploy:
    runs-on: blacksmith-4vcpu-ubuntu-2404
    environment: ${{ inputs.environment }}
    # One deploy per repo and environment at a time; never cancel one that runs.
    concurrency:
      group: cd-supabase-${{ inputs.environment }}-${{ inputs.working-directory }}
      cancel-in-progress: false
    defaults:
      run:
        working-directory: ${{ inputs.working-directory }}
    env:
      SUPABASE_ACCESS_TOKEN: ${{ secrets.SUPABASE_ACCESS_TOKEN }}
      PROJECT_REF: ${{ inputs.project-ref || vars.SUPABASE_PROJECT_REF }}
    steps:
      - name: Checkout
        uses: actions/checkout@3d3c42e5aac5ba805825da76410c181273ba90b1 # v7.0.1
        with:
          ref: ${{ inputs.ref }}

      - name: Validate inputs
        env:
          ENVIRONMENT: ${{ inputs.environment }}
          MIGRATIONS: ${{ inputs.migrations }}
          FUNCTIONS: ${{ inputs.functions }}
          ENV_KEYS: ${{ inputs.function-env-keys }}
        run: |
          set -euo pipefail
          if [ "$MIGRATIONS" != true ] && [ "$FUNCTIONS" = none ]; then
            echo "::error::Nothing to deploy: migrations are off and functions is none."; exit 1
          fi
          if [ -z "${PROJECT_REF:-}" ]; then
            echo "::error::project-ref is empty and vars.SUPABASE_PROJECT_REF is not set on environment '$ENVIRONMENT'"; exit 1
          fi
          # `secrets: inherit` skips the required-secret check, so check it here,
          # before anything is written.
          if [ -z "${SUPABASE_ACCESS_TOKEN:-}" ]; then
            echo "::error::SUPABASE_ACCESS_TOKEN is not available to this repo"; exit 1
          fi
          # SUPABASE_* names are injected by the platform; `secrets set` rejects
          # them, but only after writing everything that came before.
          for k in $ENV_KEYS; do
            case "$k" in SUPABASE_*)
              echo "::error::$k is provided by the platform and cannot be set as a function secret"; exit 1 ;;
            esac
          done

      # No version input: setup-cli takes the CLI version from the repo's
      # lockfile, so CD runs the CLI the repo pins.
      - name: Supabase CLI
        uses: supabase/setup-cli@45a513f8c64c0bc8e0e3dfe572b5c95be85f6359 # v3.0.1

      - name: Services (secrets)
        uses: Pursuit-Amsterdam/workflows/.github/actions/setup-services@v2
        with:
          onepassword-vault: ${{ inputs.onepassword-vault || vars.OP_VAULT }}
          onepassword-item: ${{ inputs.onepassword-item || vars.OP_ITEM }}
          onepassword-token: ${{ secrets.OP_SERVICE_ACCOUNT_TOKEN }}

      # First, so a function's first cold start already sees its environment.
      # Values come from the job env and go into a 0600 file, never into argv:
      # a command line is readable by every process on the runner.
      - name: Set function secrets
        if: inputs.function-env-keys != ''
        env:
          ENV_KEYS: ${{ inputs.function-env-keys }}
        run: |
          set -euo pipefail
          umask 077
          file=$(mktemp)
          trap 'rm -f "$file"' EXIT
          missing=()
          for k in $ENV_KEYS; do
            v=${!k-}
            if [ -z "$v" ]; then missing+=("$k"); continue; fi
            printf '%s=%s\n' "$k" "$v" >> "$file"
          done
          # An absent value would set the live secret to the empty string and
          # break the function at its next cold start. Write nothing instead.
          if [ ${#missing[@]} -gt 0 ]; then
            echo "::error::not present in the environment's 1Password item: ${missing[*]}"; exit 1
          fi
          supabase secrets set --project-ref "$PROJECT_REF" --env-file "$file"
          echo "Set on $PROJECT_REF: $ENV_KEYS"

      # Not the deploy-supabase action: it checks out the default ref itself
      # (migrating a different commit than `ref`), reinstalls the CLI and ignores
      # working-directory. Linking keeps the database URL off the command line;
      # the CLI reads the password from SUPABASE_DB_PASSWORD.
      - name: Run migrations
        if: inputs.migrations
        env:
          DB_PASSWORD_VARIABLE: ${{ inputs.db-password-variable }}
        run: |
          set -euo pipefail
          SUPABASE_DB_PASSWORD=${!DB_PASSWORD_VARIABLE-}
          [ -n "$SUPABASE_DB_PASSWORD" ] || { echo "::error::$DB_PASSWORD_VARIABLE is not in the environment's 1Password item"; exit 1; }
          export SUPABASE_DB_PASSWORD
          supabase link --project-ref "$PROJECT_REF"
          supabase db push

      # Every function, every deploy, changed or not: CD ships a commit, it does
      # not diff.
      # --use-api bundles server-side: no Docker on the runner. verify_jwt,
      # import map and entrypoint come from supabase/config.toml.
      - name: Deploy edge functions
        if: inputs.functions != 'none'
        env:
          FUNCTIONS: ${{ inputs.functions }}
        run: |
          set -euo pipefail
          if [ -z "${FUNCTIONS// /}" ]; then
            supabase functions deploy --project-ref "$PROJECT_REF" --use-api
          else
            for fn in $FUNCTIONS; do
              echo "::group::deploy $fn"
              supabase functions deploy "$fn" --project-ref "$PROJECT_REF" --use-api
              echo "::endgroup::"
            done
          fi

      # Names and digests only; `secrets list` never prints a value. A key that
      # is live but no longer listed is drift worth seeing - and not something a
      # deploy should ever delete on its own.
      - name: Report unmanaged secrets
        if: always() && inputs.function-env-keys != ''
        env:
          ENV_KEYS: ${{ inputs.function-env-keys }}
        run: |
          set -euo pipefail
          for k in $(supabase secrets list --project-ref "$PROJECT_REF" --output json | jq -r '.[].name'); do
            case "$k" in SUPABASE_*) continue ;; esac
            case " $ENV_KEYS " in *" $k "*) continue ;; esac
            echo "::warning::$k is live on $PROJECT_REF but not listed in function-env-keys"
          done
```

.github/workflows/cd-gate.yml workflow_call · 1 job · gelijk aan het bestand op `v2` (Task 11)

```yaml
name: "CD gate"

# Decides whether a deploy may run, which GitHub environment it targets and
# which commit. Target-agnostic: put it in front of cd-vercel, cd-supabase,
# cd-swarm or cd-packages. Based on gp-map-webapp's gate job.
#
#   workflow_run (CI done after a push)  -> branch-targets[head_branch]; sha = head_sha
#   release published                    -> production; sha = the tag's commit, which must be on the
#                                           default branch; tag must match v*; prerelease skipped
#                                           unless allow-prerelease
#   workflow_dispatch                    -> from the ref it was started from: a branch in
#                                           branch-targets, or a tag, which must be the
#                                           latest release (no rollbacks) -> production
#   repository_dispatch (tms-deploy)     -> client_payload.environment, staging/acceptance
#                                           only; sha = head of that environment's branch
#   push                                 -> fails: CD starts on workflow_run, never on push
#
# Then every workflow in `required-workflows` must have a PUSH run on that sha
# that concluded success (pull_request runs test another merge and do not
# count; the newest run per workflow wins, so re-runs count). The gate never
# waits or polls.
#
# Outcomes: proceed=false with a green run means "not this run" (another CI
# workflow still running, a duplicate trigger, a CMS action that is not a
# deploy); a warning when another required workflow failed; setFailed for
# configuration errors and for a release/dispatch whose CI is not green, because
# nothing else will retry those. The caller skips the whole run when the CI run
# that triggered it did not succeed (see the example in bouwstenen.md).

on:
  workflow_call:
    inputs:
      required-workflows:
        description: "CI workflow names that must have a successful push run on the commit, one per line. Default: the one CI workflow every repo has. Empty fails the gate."
        required: false
        type: string
        default: "Continuous Integration"
      branch-targets:
        description: "Space-separated branch=environment pairs. main is deliberately absent: production ships on a release."
        required: false
        type: string
        default: "develop=staging acceptance=acceptance"
      allow-prerelease:
        description: "Let a published prerelease deploy to production (cd-packages publishes it under the `next` dist-tag). Default: a prerelease is skipped."
        required: false
        type: boolean
        default: false
    outputs:
      proceed:
        description: "'true' when exactly this run should deploy"
        value: ${{ jobs.gate.outputs.proceed }}
      target:
        description: "GitHub environment to deploy to"
        value: ${{ jobs.gate.outputs.target }}
      sha:
        description: "Commit to deploy; pass to cd-*.yml as `ref`"
        value: ${{ jobs.gate.outputs.sha }}

permissions:
  actions: read
  contents: read

jobs:
  gate:
    runs-on: blacksmith-4vcpu-ubuntu-2404
    timeout-minutes: 5
    outputs:
      proceed: ${{ steps.decide.outputs.proceed }}
      target: ${{ steps.decide.outputs.target }}
      sha: ${{ steps.decide.outputs.sha }}
    steps:
      - id: decide
        uses: actions/github-script@3a2844b7e9c422d3c10d287c895573f7108da1b3 # v9.0.0
        env:
          REQUIRED: ${{ inputs.required-workflows }}
          BRANCH_TARGETS: ${{ inputs.branch-targets }}
          ALLOW_PRERELEASE: ${{ inputs.allow-prerelease }}
        with:
          script: |
            const required = process.env.REQUIRED.split('\n').map(s => s.trim()).filter(Boolean);
            const map = Object.fromEntries(process.env.BRANCH_TARGETS.split(/\s+/).filter(Boolean).map(p => p.split('=')));
            const short = (sha) => sha.slice(0, 7);
            core.setOutput('proceed', 'false');
            const skip = async (why) => { core.info(`Gate: skipped - ${why}`); await core.summary.addRaw(`Gate: skipped - ${why}`).write(); };
            const warn = async (why) => { core.warning(`Gate: not deploying - ${why}`); await core.summary.addRaw(`Gate: not deploying - ${why}`).write(); };
            const fail = (why) => core.setFailed(`Gate: ${why}`);

            if (required.length === 0) return fail('required-workflows is empty: a gate that requires nothing lets every commit deploy.');

            // 1. Which environment, which commit?
            const ev = context.eventName, p = context.payload;
            let target, sha;
            if (ev === 'workflow_run') {
              const run = p.workflow_run;
              if (run.event !== 'push') return skip(`CI run ${run.id} was a ${run.event} run, not a push`);
              target = map[run.head_branch];
              if (!target) return skip(`no environment for branch ${run.head_branch} in branch-targets`);
              sha = run.head_sha;
            } else if (ev === 'release') {
              const tag = p.release.tag_name;
              if (p.release.prerelease && process.env.ALLOW_PRERELEASE !== 'true') return skip(`release ${tag} is a prerelease`);
              // production only accepts v* tags; say so here rather than let the
              // environment refuse the deploy job with a less obvious message.
              if (!/^v\d/.test(tag)) return fail(`tag ${tag} must match v*: production only allows those tags`);
              sha = context.sha; // the tag's commit
              // A release tagged on develop (or any branch) would ship code that
              // never went through main. The tag's commit must be on the default branch.
              const base = p.repository.default_branch;
              const { status } = (await github.rest.repos.compareCommitsWithBasehead({ ...context.repo, basehead: `${base}...${sha}` })).data;
              if (status !== 'identical' && status !== 'behind') return fail(`tag ${tag} (${short(sha)}) is not on ${base}: release from ${base} only`);
              target = 'production';
            } else if (ev === 'workflow_dispatch') {
              if (context.ref.startsWith('refs/tags/')) {
                const tag = context.ref.slice('refs/tags/'.length);
                const latest = await github.rest.repos.getLatestRelease(context.repo).then(r => r.data.tag_name).catch(() => null);
                if (tag !== latest) return fail(`tag ${tag} is not the latest release (${latest ?? 'none'}): rollbacks are not supported, start from ${latest ?? 'a release tag'}`);
                target = 'production';
              } else if (context.ref.startsWith('refs/heads/')) {
                const branch = context.ref.slice('refs/heads/'.length);
                target = map[branch];
                if (!target) return fail(`no environment for branch ${branch}: start this workflow from ${Object.keys(map).join(' or ')}, or from the tag of the latest release for production`);
              } else return fail(`unexpected ref ${context.ref}`);
              sha = context.sha;
            } else if (ev === 'repository_dispatch') {
              if (p.action !== 'tms-deploy') return skip(`repository_dispatch '${p.action}' is not a deploy`);
              const env = p.client_payload?.environment;
              const branch = Object.entries(map).find(([, e]) => e === env)?.[0];
              if (!branch) return fail(`the CMS asked for environment '${env}', which has no branch: the CMS deploys to ${Object.values(map).join('/')} only; production ships on a release`);
              target = env;
              try {
                sha = (await github.rest.repos.getBranch({ ...context.repo, branch })).data.commit.sha;
              } catch (e) {
                if (e.status === 404) return fail(`the CMS asked for ${env}, but branch ${branch} does not exist in this repo`);
                throw e;
              }
            } else {
              return fail(`unsupported event '${ev}': CD starts on workflow_run, release or workflow_dispatch, never on push`);
            }
            core.info(`Gate: ${ev} -> ${target} @ ${short(sha)}; required: ${required.join(', ')}`);

            // 2. Did every required CI workflow succeed on that commit? Push runs only.
            const runs = await github.paginate(github.rest.actions.listWorkflowRunsForRepo,
              { ...context.repo, head_sha: sha, event: 'push', per_page: 100 });
            const latest = Object.fromEntries(required.map(name => [name,
              runs.filter(r => r.name === name).sort((a, b) => new Date(b.created_at) - new Date(a.created_at))[0] ?? null]));
            core.info(required.map(n => `  ${n}: ${latest[n] ? `${latest[n].status}/${latest[n].conclusion ?? '-'} (run ${latest[n].id})` : 'missing'}`).join('\n'));

            const missing = required.filter(n => !latest[n]);
            if (missing.length) return fail(`no push run of '${missing.join("', '")}' on ${short(sha)}: wrong name in required-workflows, or a paths: filter on that workflow`);
            const pending = required.filter(n => latest[n].status !== 'completed');
            const failed = required.filter(n => latest[n].status === 'completed' && latest[n].conclusion !== 'success');

            if (ev === 'workflow_run') {
              if (pending.length) return skip(`still running on ${short(sha)}: ${pending.join(', ')}; its completion starts its own gate`);
              if (failed.length) return warn(`${failed.join(', ')} did not succeed on ${short(sha)}`);
              // 3. Both green => both completion events started a gate. Only the one
              //    started by the last-completing CI run deploys; the other sees the
              //    same winner and skips. Deterministic, no gate-vs-gate race.
              const decider = required.map(n => latest[n]).sort((a, b) => b.updated_at.localeCompare(a.updated_at) || b.id - a.id)[0];
              if (decider.id !== p.workflow_run.id) return skip(`duplicate trigger: run ${decider.id} (${decider.name}) completed last and owns the deploy`);
            } else {
              // Nothing retries a release or a manual run on its own: fail loudly.
              if (pending.length) return fail(`CI not finished on ${short(sha)}: ${pending.join(', ')}. Wait for green, then re-run this workflow.`);
              if (failed.length) return fail(`CI did not succeed on ${short(sha)}: ${failed.join(', ')}`);
            }

            core.setOutput('proceed', 'true');
            core.setOutput('target', target);
            core.setOutput('sha', sha);
            await core.summary.addRaw(`Gate: deploying ${short(sha)} to ${target}`).write();
```

.github/workflows/cd-swarm.yml workflow_call · validate, build (matrix), deploy · bestaande deploy-swarm-inputs plus drie nieuwe

```yaml
name: "CD Swarm"

# Builds a project's own images (if any) and deploys a Docker Swarm stack on a VM.
# Supersedes vm-cd.yml and keeps its images schema, so existing Dockerfiles and
# callers keep working. No source checks here: CI proves the commit, cd-gate proves
# CI succeeded on it. What CD adds itself is checked: every image is started and
# smoke-tested before it is pushed, and the stack must answer after it converges.
# Per-environment values come from the GitHub environment: empty ssh-* and
# onepassword-* inputs fall back to vars.VM_SSH_* and vars.OP_*.
#   validate - refuses a run that would do nothing (no images and no deploy)
#   build    - one matrix job per image; skipped entirely when `images` is empty
#   deploy   - runs after build, or after a skipped build; never after a failed one
# The caller grants packages: write, also for a stack without images: GitHub checks
# every job's permissions when the workflow starts, including a job it then skips.

on:
  workflow_call:
    inputs:
      environment:
        description: "GitHub environment to deploy (staging, production, ...)"
        required: true
        type: string
      ref:
        description: "Commit to deploy. Empty = github.sha. Pass cd-gate's `sha`."
        required: false
        type: string
        default: ""
      images:
        description: >
          JSON array of images this project builds, the vm-cd schema: name (the
          full image name, e.g. ghcr.io/org/app-backend), dockerfile, context,
          build-args ("public" passes the non-concealed 1Password fields), and
          optionally port, health-path, env, smoke, exec for the smoke test before
          push. [] = a stack of ready-made images; the build job is skipped.
        required: false
        type: string
        default: "[]"
      stack-file:
        description: "Space-separated stack files: base + overlay"
        required: false
        type: string
        default: "docker-stack.yml"
      stack-name:
        description: "Empty = <repo>-<environment>"
        required: false
        type: string
        default: ""
      codegen:
        description: "Name of the package script that generates code before the image build (runs on the runner; the Dockerfile only copies the result). Empty = none."
        required: false
        type: string
        default: ""
      codegen-check:
        description: "Script that compares external input codegen fetched with the committed version ($CODEGEN_BASELINE). Empty = none. Needs codegen and codegen-baseline."
        required: false
        type: string
        default: ""
      codegen-baseline:
        description: "Space-separated committed files the codegen script overwrites with a fresh fetch (e.g. openapi.json); copied to $CODEGEN_BASELINE first"
        required: false
        type: string
        default: ""
      deploy-enabled:
        description: "false = build and push only (the VM does not exist yet). Refused when there is nothing to build."
        required: false
        type: boolean
        default: true
      pre-deploy:
        description: "Shell script run on the manager as ssh-user, before migrations and stack deploy. Checks only (directories, networks, labels); a non-zero exit stops the deploy. Sees ENVIRONMENT, STACK_NAME, VERSION."
        required: false
        type: string
        default: ""
      migrate-image:
        description: "Image (without tag) whose migrate-command runs before the stack deploy; this build's version tag is appended, as in vm-cd. Empty = no migrations."
        required: false
        type: string
        default: ""
      migrate-entrypoint:
        description: "Override the migration container's ENTRYPOINT. Empty = image default."
        required: false
        type: string
        default: ""
      migrate-command:
        required: false
        type: string
        default: ""
      migrate-env:
        description: "Space-separated env var names forwarded to the migration container"
        required: false
        type: string
        default: "DATABASE_URL"
      converge-timeout:
        description: "Seconds to wait until every service runs"
        required: false
        type: string
        default: "180"
      health-url:
        description: "URL that must answer 2xx after the stack converged. May contain ${ENVIRONMENT}. Empty = no check."
        required: false
        type: string
        default: ""
      working-directory:
        description: "Directory the deploy job runs in, as in vm-cd. Paths in `images` are relative to the repo root."
        required: false
        type: string
        default: "."
      database:
        description: "none | postgres | supabase, for images that need one to start in the smoke test"
        required: false
        type: string
        default: "none"
      redis:
        description: "Start Redis for images that need it to start in the smoke test"
        required: false
        type: boolean
        default: false
      ssh-host:
        description: "Empty = vars.VM_SSH_HOST"
        required: false
        type: string
        default: ""
      ssh-user:
        description: "Empty = vars.VM_SSH_USER"
        required: false
        type: string
        default: ""
      ssh-port:
        description: "Empty = vars.VM_SSH_PORT, else 22"
        required: false
        type: string
        default: ""
      onepassword-vault:
        description: "Empty = vars.OP_VAULT"
        required: false
        type: string
        default: ""
      onepassword-item:
        description: "Empty = vars.OP_ITEM. Non-concealed fields become build args for images with build-args: public; all fields reach the stack."
        required: false
        type: string
        default: ""
      use-custom-token:
        description: "Use CUSTOM_GITHUB_TOKEN as the NODE_AUTH_TOKEN / GITHUB_TOKEN build secrets for private dependencies"
        required: false
        type: boolean
        default: false

    secrets:
      VM_SSH_PRIVATE_KEY:
        required: false
      VM_SSH_KNOWN_HOSTS:
        required: false
      OP_SERVICE_ACCOUNT_TOKEN:
        required: false
      CUSTOM_GITHUB_TOKEN:
        required: false

permissions:
  contents: read

jobs:
  validate:
    runs-on: blacksmith-4vcpu-ubuntu-2404
    outputs:
      images-count: ${{ steps.count.outputs.n }}
    steps:
      # Counted with jq, not compared as a string: "[ ]" or a multi-line [] is
      # empty too, and an empty matrix is a hard error instead of a skip.
      - name: Refuse a run that does nothing
        id: count
        env:
          IMAGES: ${{ inputs.images }}
          DEPLOY: ${{ inputs.deploy-enabled }}
        run: |
          set -euo pipefail
          n=$(jq 'if type == "array" then length else error("not an array") end' <<<"$IMAGES") \
            || { echo "::error::images is not a JSON array"; exit 1; }
          if [ "$n" -eq 0 ] && [ "$DEPLOY" != true ]; then
            echo "::error::Nothing to build and deploy-enabled is false: this run would do nothing."; exit 1
          fi
          echo "n=$n" >> "$GITHUB_OUTPUT"

  build:
    needs: validate
    if: needs.validate.outputs.images-count != '0'
    runs-on: blacksmith-4vcpu-ubuntu-2404
    permissions:
      contents: read
      packages: write
    # Build args come from the environment's 1Password item, so the build runs in
    # the environment too.
    environment: ${{ inputs.environment }}
    strategy:
      fail-fast: true
      matrix:
        image: ${{ fromJSON(inputs.images) }}
    steps:
      - name: Checkout
        uses: actions/checkout@3d3c42e5aac5ba805825da76410c181273ba90b1 # v7.0.1
        with:
          ref: ${{ inputs.ref }}
          fetch-depth: 0

      # The smoke test needs the same services as in ci-images, or an image that
      # passed there fails here.
      - name: Services (database, redis, 1Password build args)
        id: services
        uses: Pursuit-Amsterdam/workflows/.github/actions/setup-services@v2
        with:
          database: ${{ inputs.database }}
          redis: ${{ inputs.redis }}
          onepassword-vault: ${{ inputs.onepassword-vault || vars.OP_VAULT }}
          onepassword-item: ${{ inputs.onepassword-item || vars.OP_ITEM }}
          onepassword-token: ${{ secrets.OP_SERVICE_ACCOUNT_TOKEN }}
          onepassword-export-build-args: "true"

      - name: Version
        id: version
        uses: Pursuit-Amsterdam/workflows/.github/actions/setup-version@v2
        with:
          version: $(git describe --tags --abbrev=0 --always)
          environment: ${{ inputs.environment }}

      # From the checked-out commit, not github.sha: for workflow_run callers
      # github.sha is the default branch, not the commit being built.
      - name: SHA tag
        id: sha
        run: echo "tag=sha-$(git rev-parse HEAD | cut -c1-12)" >> "$GITHUB_OUTPUT"

      # Codegen on the runner, so it is checked like in every cd-*; the Dockerfile
      # only copies the generated files.
      - name: Read the Node version from the repo
        id: node
        if: inputs.codegen != ''
        run: echo "version=$(cat .nvmrc 2>/dev/null || echo 22.x)" >> "$GITHUB_OUTPUT"

      - name: Setup Node.js and pnpm
        if: inputs.codegen != ''
        uses: Pursuit-Amsterdam/workflows/.github/actions/setup-node-pnpm@v2
        with:
          node-version: ${{ steps.node.outputs.version }}
          node-auth-token: ${{ inputs.use-custom-token && secrets.CUSTOM_GITHUB_TOKEN || secrets.GITHUB_TOKEN }}
          working-directory: ${{ inputs.working-directory }}

      - name: Code generation and its checks
        if: inputs.codegen != '' || inputs.codegen-check != ''
        uses: Pursuit-Amsterdam/workflows/.github/actions/run-codegen@v2
        with:
          codegen: ${{ inputs.codegen }}
          codegen-check: ${{ inputs.codegen-check }}
          codegen-baseline: ${{ inputs.codegen-baseline }}

      # The gha cache exporter needs a buildx builder; the default docker
      # driver cannot write it.
      - name: Set up Docker Buildx
        uses: docker/setup-buildx-action@f87e5991a6d7451dcb8d9637bfbc97413f497069 # v4.4.1

      - name: Log in to GHCR
        uses: docker/login-action@dbcb813823bdd20940b903addbd779551569679f # v4.6.0
        with:
          registry: ghcr.io
          username: ${{ github.actor }}
          password: ${{ secrets.GITHUB_TOKEN }}

      # Version and sha tags only, as in vm-cd. A per-environment tag would be
      # pushed outside the deploy's concurrency group, so two runs could
      # overwrite it out of order.
      - name: Build (load, do not push yet)
        uses: docker/build-push-action@c3c9e263c25d99ce0380d002d59b67737d91b0dc # v7.4.0
        with:
          context: ${{ matrix.image.context || '.' }}
          file: ${{ matrix.image.dockerfile || './Dockerfile' }}
          build-args: ${{ matrix.image.build-args == 'public' && steps.services.outputs.build-args || '' }}
          # Same secret ids as vm-cd, so `--mount=type=secret,id=NODE_AUTH_TOKEN` keeps working.
          secrets: |
            NODE_AUTH_TOKEN=${{ inputs.use-custom-token && secrets.CUSTOM_GITHUB_TOKEN || '' }}
            GITHUB_TOKEN=${{ inputs.use-custom-token && secrets.CUSTOM_GITHUB_TOKEN || '' }}
          load: true
          push: false
          tags: |
            ${{ matrix.image.name }}:${{ steps.version.outputs.version }}
            ${{ matrix.image.name }}:${{ steps.sha.outputs.tag }}
          cache-from: type=gha,scope=${{ matrix.image.name }}
          cache-to: type=gha,mode=max,scope=${{ matrix.image.name }}

      # Same start / health / smoke as ci-images, on the exact image that is
      # about to be pushed. Does nothing when the entry has no health-path,
      # smoke or exec.
      - name: Smoke test before push
        uses: Pursuit-Amsterdam/workflows/.github/actions/run-image-smoke@v2
        with:
          image: ${{ matrix.image.name }}:${{ steps.version.outputs.version }}
          config: ${{ toJSON(matrix.image) }}

      - name: Push
        env:
          IMAGE: ${{ matrix.image.name }}
          VERSION: ${{ steps.version.outputs.version }}
          SHA_TAG: ${{ steps.sha.outputs.tag }}
        run: |
          set -euo pipefail
          docker push "$IMAGE:$VERSION"
          docker push "$IMAGE:$SHA_TAG"

  deploy:
    needs: [validate, build]
    # A skipped build (no images) lets the deploy through; a failed or cancelled
    # one stops it. Without this condition a skipped `needs` skips the deploy too.
    if: ${{ !cancelled() && needs.validate.result == 'success' && needs.build.result != 'failure' && inputs.deploy-enabled }}
    runs-on: blacksmith-4vcpu-ubuntu-2404
    permissions:
      contents: read
      packages: read
    environment: ${{ inputs.environment }}
    # One deploy per repo and environment at a time; never cancel one that runs.
    concurrency:
      group: cd-swarm-${{ inputs.environment }}-${{ inputs.working-directory }}
      cancel-in-progress: false
    defaults:
      run:
        working-directory: ${{ inputs.working-directory }}
    env:
      SSH_HOST: ${{ inputs.ssh-host || vars.VM_SSH_HOST }}
      SSH_USER: ${{ inputs.ssh-user || vars.VM_SSH_USER }}
      SSH_PORT: ${{ inputs.ssh-port || vars.VM_SSH_PORT || '22' }}
    steps:
      - name: Checkout
        uses: actions/checkout@3d3c42e5aac5ba805825da76410c181273ba90b1 # v7.0.1
        with:
          ref: ${{ inputs.ref }}
          fetch-depth: 0

      - name: Validate deploy inputs
        id: plan
        env:
          ENVIRONMENT: ${{ inputs.environment }}
          STACK_NAME: ${{ inputs.stack-name }}
          SSH_KEY: ${{ secrets.VM_SSH_PRIVATE_KEY }}
        run: |
          set -euo pipefail
          [ -n "$SSH_HOST" ] || { echo "::error::ssh-host is empty and vars.VM_SSH_HOST is not set on environment '$ENVIRONMENT'"; exit 1; }
          [ -n "$SSH_USER" ] || { echo "::error::ssh-user is empty and vars.VM_SSH_USER is not set on environment '$ENVIRONMENT'"; exit 1; }
          [ -n "$SSH_KEY" ] || { echo "::error::VM_SSH_PRIVATE_KEY is not available"; exit 1; }
          echo "stack-name=${STACK_NAME:-${GITHUB_REPOSITORY#*/}-$ENVIRONMENT}" >> "$GITHUB_OUTPUT"

      - name: Services (secrets for the stack)
        uses: Pursuit-Amsterdam/workflows/.github/actions/setup-services@v2
        with:
          onepassword-vault: ${{ inputs.onepassword-vault || vars.OP_VAULT }}
          onepassword-item: ${{ inputs.onepassword-item || vars.OP_ITEM }}
          onepassword-token: ${{ secrets.OP_SERVICE_ACCOUNT_TOKEN }}

      - name: Version
        id: version
        uses: Pursuit-Amsterdam/workflows/.github/actions/setup-version@v2
        with:
          version: $(git describe --tags --abbrev=0 --always)
          environment: ${{ inputs.environment }}

      # SSH config → GHCR login → pre-deploy → migrations → stack deploy → converge.
      # Each step fails the job before the next one starts. Existing deploy-swarm
      # inputs keep their names; pre-deploy, environment and version are new.
      - name: Deploy the stack
        uses: Pursuit-Amsterdam/workflows/.github/actions/deploy-swarm@v2
        with:
          ssh-host: ${{ env.SSH_HOST }}
          ssh-user: ${{ env.SSH_USER }}
          ssh-port: ${{ env.SSH_PORT }}
          ssh-private-key: ${{ secrets.VM_SSH_PRIVATE_KEY }}
          ssh-known-hosts: ${{ secrets.VM_SSH_KNOWN_HOSTS }}
          github-token: ${{ secrets.GITHUB_TOKEN }}
          stack-file: ${{ inputs.stack-file }}
          stack-name: ${{ steps.plan.outputs.stack-name }}
          pre-deploy: ${{ inputs.pre-deploy }}
          environment: ${{ inputs.environment }}
          version: ${{ steps.version.outputs.version }}
          # The version tag of this build, as vm-cd does; without it the
          # migration would run :latest or fail to pull.
          migrate-image: ${{ inputs.migrate-image != '' && format('{0}:{1}', inputs.migrate-image, steps.version.outputs.version) || '' }}
          migrate-entrypoint: ${{ inputs.migrate-entrypoint }}
          migrate-command: ${{ inputs.migrate-command }}
          migrate-env: ${{ inputs.migrate-env }}
          converge-timeout: ${{ inputs.converge-timeout }}

      # Converged means the tasks run; this checks that proxy and app answer.
      - name: Health check
        if: inputs.health-url != ''
        env:
          HEALTH_URL: ${{ inputs.health-url }}
          ENVIRONMENT: ${{ inputs.environment }}
        run: |
          set -euo pipefail
          url=${HEALTH_URL//\$\{ENVIRONMENT\}/$ENVIRONMENT}
          for i in $(seq 1 12); do
            code=$(curl -s -o /dev/null -w '%{http_code}' "$url" || true)
            case "$code" in 2??) echo "healthy ($code)"; exit 0 ;; esac
            echo "attempt $i: $code"; sleep 10
          done
          echo "::error::$url did not answer 2xx"; exit 1
```

.github/workflows/ci-images.yml workflow_call · stack, images (matrix), pipeline

```yaml
name: "CI images"

# Checks a Swarm project on a pull request: that the stack files are valid together,
# and that every image the project builds itself builds and starts. Each part runs
# only when its input is set; setting neither is refused (nothing checked is never
# green). A closing job `pipeline` covers both, so a caller job `run-ci` gives one
# required check: `run-ci / pipeline`.
# No 1Password here: this runs on pull_request and must not need real secrets.

on:
  workflow_call:
    inputs:
      stack-file:
        description: "Space-separated stack files (base + overlay), as for cd-swarm. Empty = no stack check."
        required: false
        type: string
        default: ""
      stack-env:
        description: "Space-separated KEY=value placeholders so ${VAR:?} references resolve"
        required: false
        type: string
        default: ""
      images:
        description: >
          JSON array, same schema as cd-swarm (name = full image name), plus per
          image: paths (only build when these changed), port, health-path, env,
          build-env (object of placeholder build args, so a build that validates
          its env still builds here), smoke, exec. [] = no images. build-args is
          ignored: it selects 1Password fields, and this workflow loads no secrets.
        required: false
        type: string
        default: "[]"
      codegen:
        description: "Name of the package script that generates code before the image build, on the runner as in cd-swarm. Empty = none."
        required: false
        type: string
        default: ""
      database:
        description: "none | postgres | supabase, for backends that need one to boot"
        required: false
        type: string
        default: "none"
      redis:
        description: "Start Redis for backends that need it to boot"
        required: false
        type: boolean
        default: false
      use-custom-token:
        description: "Use CUSTOM_GITHUB_TOKEN as a build secret for private dependencies"
        required: false
        type: boolean
        default: false
    secrets:
      CUSTOM_GITHUB_TOKEN:
        required: false

permissions:
  contents: read

jobs:
  stack:
    runs-on: blacksmith-4vcpu-ubuntu-2404
    outputs:
      images-count: ${{ steps.count.outputs.n }}
    steps:
      - name: Checkout
        uses: actions/checkout@3d3c42e5aac5ba805825da76410c181273ba90b1 # v7.0.1

      # Counted with jq, not compared as a string: "[ ]" or a multi-line [] is
      # empty too, and an empty matrix is a hard error instead of a skip.
      - name: Refuse a run that checks nothing
        id: count
        env:
          STACK_FILE: ${{ inputs.stack-file }}
          IMAGES: ${{ inputs.images }}
        run: |
          set -euo pipefail
          n=$(jq 'if type == "array" then length else error("not an array") end' <<<"$IMAGES") \
            || { echo "::error::images is not a JSON array"; exit 1; }
          if [ -z "${STACK_FILE//[[:space:]]/}" ] && [ "$n" -eq 0 ]; then
            echo "::error::Neither stack-file nor images is set: this job would pass without checking anything."; exit 1
          fi
          echo "n=$n" >> "$GITHUB_OUTPUT"

      # Parses and merges base + overlay, rejects unknown fields and unresolvable
      # ${VAR} references. Same command as `pnpm lint` in gp-container-tracking.
      - name: Validate stack files
        if: inputs.stack-file != ''
        env:
          STACK_FILE: ${{ inputs.stack-file }}
          STACK_ENV: ${{ inputs.stack-env }}
        run: |
          set -euo pipefail
          read -ra files <<<"$(tr -s '[:space:]' ' ' <<<"$STACK_FILE")"
          read -ra vars <<<"$(tr -s '[:space:]' ' ' <<<"$STACK_ENV")"
          args=()
          for f in "${files[@]}"; do args+=(-f "$f"); done
          env "${vars[@]}" docker compose "${args[@]}" config --quiet
          echo "Stack files valid: $STACK_FILE"

  images:
    needs: stack
    # An empty matrix is a hard error at workflow start, not a skip.
    if: needs.stack.outputs.images-count != '0'
    runs-on: blacksmith-4vcpu-ubuntu-2404
    strategy:
      fail-fast: false
      matrix:
        image: ${{ fromJSON(inputs.images) }}
    steps:
      - name: Checkout
        uses: actions/checkout@3d3c42e5aac5ba805825da76410c181273ba90b1 # v7.0.1
        with:
          fetch-depth: 0

      # Images whose paths did not change are skipped, not failed. No paths, or a
      # push event, means always build. Compare against the merge base with the
      # base branch: the checkout above has full history, the base branch is
      # fetched in full too, so `base...HEAD` has a merge base to work with (a
      # depth-1 fetch has none, and the diff would fail or report everything).
      # Paths are matched as literal prefixes, never as a regex.
      - name: Changed?
        id: changed
        env:
          PATHS: ${{ join(matrix.image.paths, ' ') }}
          BASE: ${{ github.base_ref }}
          IMAGE: ${{ matrix.image.name }}
        run: |
          set -euo pipefail
          if [ -z "$PATHS" ] || [ -z "$BASE" ]; then echo "build=true" >> "$GITHUB_OUTPUT"; exit 0; fi
          git fetch --no-tags origin "+refs/heads/$BASE:refs/remotes/origin/$BASE"
          changed=$(git diff --name-only "origin/$BASE...HEAD")
          for p in $PATHS; do
            prefix=${p%%\**}
            while IFS= read -r f; do
              case "$f" in "$prefix"*) echo "build=true" >> "$GITHUB_OUTPUT"; exit 0 ;; esac
            done <<<"$changed"
          done
          echo "build=false" >> "$GITHUB_OUTPUT"
          echo "No changes under: $PATHS — skipping $IMAGE"

      - name: Services (database, redis)
        if: steps.changed.outputs.build == 'true'
        uses: Pursuit-Amsterdam/workflows/.github/actions/setup-services@v2
        with:
          database: ${{ inputs.database }}
          redis: ${{ inputs.redis }}

      # Same as cd-swarm: codegen on the runner, the Dockerfile copies the result.
      - name: Read the Node version from the repo
        id: node
        if: steps.changed.outputs.build == 'true' && inputs.codegen != ''
        run: echo "version=$(cat .nvmrc 2>/dev/null || echo 22.x)" >> "$GITHUB_OUTPUT"

      - name: Setup Node.js and pnpm
        if: steps.changed.outputs.build == 'true' && inputs.codegen != ''
        uses: Pursuit-Amsterdam/workflows/.github/actions/setup-node-pnpm@v2
        with:
          node-version: ${{ steps.node.outputs.version }}
          node-auth-token: ${{ inputs.use-custom-token && secrets.CUSTOM_GITHUB_TOKEN || secrets.GITHUB_TOKEN }}

      - name: Code generation
        if: steps.changed.outputs.build == 'true' && inputs.codegen != ''
        env:
          SCRIPT: ${{ inputs.codegen }}
        run: pnpm run "$SCRIPT"

      # Placeholder build args from the JSON (build-env), one KEY=value per line,
      # so a Dockerfile that validates NEXT_PUBLIC_* at build time still builds.
      - name: Build args
        id: build-args
        if: steps.changed.outputs.build == 'true'
        env:
          CONFIG: ${{ toJSON(matrix.image) }}
        run: |
          set -euo pipefail
          { echo "value<<BUILD_ARGS_EOF"; jq -r '(.["build-env"] // {}) | to_entries[] | "\(.key)=\(.value)"' <<<"$CONFIG"; echo "BUILD_ARGS_EOF"; } >> "$GITHUB_OUTPUT"

      # The gha cache exporter needs a buildx builder; the default docker
      # driver cannot write it.
      - name: Set up Docker Buildx
        if: steps.changed.outputs.build == 'true'
        uses: docker/setup-buildx-action@f87e5991a6d7451dcb8d9637bfbc97413f497069 # v4.4.1

      - name: Build (load only)
        if: steps.changed.outputs.build == 'true'
        uses: docker/build-push-action@c3c9e263c25d99ce0380d002d59b67737d91b0dc # v7.4.0
        with:
          context: ${{ matrix.image.context || '.' }}
          file: ${{ matrix.image.dockerfile || './Dockerfile' }}
          build-args: ${{ steps.build-args.outputs.value }}
          # Same secret ids as vm-cd and cd-swarm.
          secrets: |
            NODE_AUTH_TOKEN=${{ inputs.use-custom-token && secrets.CUSTOM_GITHUB_TOKEN || '' }}
            GITHUB_TOKEN=${{ inputs.use-custom-token && secrets.CUSTOM_GITHUB_TOKEN || '' }}
          load: true
          push: false
          tags: ${{ matrix.image.name }}:ci
          cache-from: type=gha,scope=${{ matrix.image.name }}
          cache-to: type=gha,mode=max,scope=${{ matrix.image.name }}

      - name: Smoke test
        if: steps.changed.outputs.build == 'true'
        uses: Pursuit-Amsterdam/workflows/.github/actions/run-image-smoke@v2
        with:
          image: ${{ matrix.image.name }}:ci
          config: ${{ toJSON(matrix.image) }}

  # One required check for everything above. A skipped images job (no images)
  # counts as fine; a failed or cancelled one does not.
  pipeline:
    needs: [stack, images]
    if: ${{ always() }}
    runs-on: blacksmith-4vcpu-ubuntu-2404
    steps:
      - name: Result
        env:
          STACK: ${{ needs.stack.result }}
          IMAGES: ${{ needs.images.result }}
        run: |
          echo "stack: $STACK, images: $IMAGES"
          [ "$STACK" = success ] || exit 1
          case "$IMAGES" in success|skipped) ;; *) exit 1 ;; esac
```

.github/workflows/cd-packages.yml workflow_call · 1 job · alleen nieuwe versies

```yaml
name: "CD Packages"

# Publishes a repo's npm packages to GitHub Packages on a release. No source checks
# here: CI proves the commit, cd-gate proves CI succeeded on it. The repo decides
# how a package is built (its `build` script); this workflow decides when and what
# is published. A run that would publish nothing fails: nothing done is never green.
#   - every workspace package that is not "private": true and whose version is not
#     in the registry yet is published; already published versions are skipped
#   - a single-package repo's release tag must match its package.json version
#   - a prerelease publishes under the `next` dist-tag, a release under `latest`

on:
  workflow_call:
    inputs:
      environment:
        description: "GitHub environment for approvals (cd-gate's target, usually production)"
        required: true
        type: string
      ref:
        description: "Commit to publish. Empty = github.sha. Pass cd-gate's `sha`."
        required: false
        type: string
        default: ""
      packages:
        description: "Space-separated package names to limit publishing to. Empty = every non-private workspace package."
        required: false
        type: string
        default: ""
      build:
        description: "Name of the package script that builds before publishing. `none` = no build step."
        required: false
        type: string
        default: "build"
      codegen:
        description: "Name of the package script that generates code before the build, e.g. an SDK from an OpenAPI spec. Empty = none."
        required: false
        type: string
        default: ""
      codegen-check:
        description: "Script that compares external input codegen fetched with the committed version ($CODEGEN_BASELINE). Empty = none. Needs codegen and codegen-baseline."
        required: false
        type: string
        default: ""
      codegen-baseline:
        description: "Space-separated committed files the codegen script overwrites with a fresh fetch (e.g. openapi.json); copied to $CODEGEN_BASELINE first"
        required: false
        type: string
        default: ""
      working-directory:
        description: "Directory holding the root package.json. The Node version comes from its .nvmrc (else 22.x)."
        required: false
        type: string
        default: "."
      use-custom-token:
        description: "Use CUSTOM_GITHUB_TOKEN to install private dependencies from other repos"
        required: false
        type: boolean
        default: false
    secrets:
      CUSTOM_GITHUB_TOKEN:
        required: false

permissions:
  contents: read
  packages: write

jobs:
  deploy:
    runs-on: blacksmith-4vcpu-ubuntu-2404
    environment: ${{ inputs.environment }}
    # One publish per workspace at a time; never cancel one that runs.
    concurrency:
      group: cd-packages-${{ inputs.environment }}-${{ inputs.working-directory }}
      cancel-in-progress: false
    defaults:
      run:
        working-directory: ${{ inputs.working-directory }}
    steps:
      - name: Checkout
        uses: actions/checkout@3d3c42e5aac5ba805825da76410c181273ba90b1 # v7.0.1
        with:
          ref: ${{ inputs.ref }}

      - name: Read the Node version from the repo
        id: node
        run: echo "version=$(cat .nvmrc 2>/dev/null || echo 22.x)" >> "$GITHUB_OUTPUT"

      - name: Setup Node.js and pnpm
        uses: Pursuit-Amsterdam/workflows/.github/actions/setup-node-pnpm@v2
        with:
          node-version: ${{ steps.node.outputs.version }}
          node-auth-token: ${{ inputs.use-custom-token && secrets.CUSTOM_GITHUB_TOKEN || secrets.GITHUB_TOKEN }}
          working-directory: ${{ inputs.working-directory }}

      - name: Code generation and its checks
        uses: Pursuit-Amsterdam/workflows/.github/actions/run-codegen@v2
        with:
          codegen: ${{ inputs.codegen }}
          codegen-check: ${{ inputs.codegen-check }}
          codegen-baseline: ${{ inputs.codegen-baseline }}
          working-directory: ${{ inputs.working-directory }}

      - name: Build
        if: inputs.build != 'none'
        env:
          SCRIPT: ${{ inputs.build }}
        run: |
          set -euo pipefail
          if [ -f turbo.json ]; then pnpm turbo run "$SCRIPT"; else pnpm run "$SCRIPT"; fi

      # Which packages have a version the registry does not know yet?
      - name: Plan
        id: plan
        env:
          ONLY: ${{ inputs.packages }}
          TAG_NAME: ${{ github.event.release.tag_name }}
          PRERELEASE: ${{ github.event.release.prerelease }}
        run: |
          set -euo pipefail
          all=$(pnpm -r ls --depth -1 --json | jq -c '[.[] | select(.private != true) | {name, version}]')
          if [ -n "${ONLY// /}" ]; then
            all=$(jq -c --arg only "$ONLY" '($only | split(" ") | map(select(. != ""))) as $o | [.[] | select(.name as $n | $o | index($n))]' <<<"$all")
          fi
          [ "$(jq length <<<"$all")" -gt 0 ] || { echo "::error::No publishable packages (all private, or none match 'packages')."; exit 1; }

          # A single-package release tag must match the version it publishes.
          if [ "$(jq length <<<"$all")" -eq 1 ] && [ -n "$TAG_NAME" ]; then
            v=$(jq -r '.[0].version' <<<"$all")
            [ "${TAG_NAME#v}" = "$v" ] || { echo "::error::Release tag $TAG_NAME does not match package.json version $v"; exit 1; }
          fi

          todo=()
          while read -r name version; do
            if npm view "$name@$version" version >/dev/null 2>&1; then
              echo "skip $name@$version (already published)"
            else
              todo+=("$name")
              echo "publish $name@$version"
            fi
          done < <(jq -r '.[] | "\(.name) \(.version)"' <<<"$all")
          [ ${#todo[@]} -gt 0 ] || { echo "::error::Every version is already published: was the version bumped?"; exit 1; }

          echo "filters=${todo[*]}" >> "$GITHUB_OUTPUT"
          echo "dist-tag=$([ "$PRERELEASE" = true ] && echo next || echo latest)" >> "$GITHUB_OUTPUT"

      # Publishing always uses this repo's GITHUB_TOKEN: a package belongs to the
      # repo that publishes it. setup-node-pnpm wrote a project .npmrc with the
      # install token (the PAT, with use-custom-token), and a project .npmrc wins
      # over NPM_CONFIG_USERCONFIG, so that file is rewritten here, after the
      # install and right before publish.
      - name: Publish
        env:
          FILTERS: ${{ steps.plan.outputs.filters }}
          DIST_TAG: ${{ steps.plan.outputs.dist-tag }}
          OWNER: ${{ github.repository_owner }}
          TOKEN: ${{ secrets.GITHUB_TOKEN }}
        run: |
          set -euo pipefail
          {
            echo "@${OWNER,,}:registry=https://npm.pkg.github.com"
            echo "//npm.pkg.github.com/:_authToken=${TOKEN}"
          } > .npmrc
          read -ra names <<<"$FILTERS"
          for name in "${names[@]}"; do
            echo "::group::publish $name"
            pnpm --filter "$name" publish --no-git-checks --tag "$DIST_TAG"
            echo "::endgroup::"
          done
```

.github/actions/run-codegen/action.yml composite · codegen, typecheck, vergelijking met de gecommitte spec · elke cd-\* die bouwt

```yaml
name: "Code generation"
description: >
  Runs the repo's codegen script, typechecks the result and, with codegen-check,
  compares the external input codegen fetched just now (e.g. an OpenAPI spec of
  another service) with the version committed in this commit. One
  implementation for every cd-* that builds, so "generated code is checked"
  means the same everywhere. Does nothing when codegen is empty and nothing
  else was generated.
inputs:
  codegen:
    description: "Name of the package script that generates code. Empty = none."
    required: false
    default: ""
  generated-elsewhere:
    description: "'true' when an earlier step generated code too (translations pull): typecheck even without codegen"
    required: false
    default: "false"
  codegen-check:
    description: "Name of the package script that compares against $CODEGEN_BASELINE. Empty = none. Needs codegen and codegen-baseline."
    required: false
    default: ""
  codegen-baseline:
    description: "Space-separated committed files (relative to working-directory) that codegen overwrites with a fresh fetch, e.g. openapi.json"
    required: false
    default: ""
  working-directory:
    required: false
    default: "."

runs:
  using: "composite"
  steps:
    # The baseline is the commit itself: CI approved it with these files. Copied
    # before codegen overwrites them; a file that is not committed is refused.
    - name: Keep the committed baseline
      if: inputs.codegen-check != ''
      shell: bash
      working-directory: ${{ inputs.working-directory }}
      env:
        CODEGEN: ${{ inputs.codegen }}
        FILES: ${{ inputs.codegen-baseline }}
        BASELINE: ${{ runner.temp }}/codegen-baseline
      run: |
        set -euo pipefail
        [ -n "$CODEGEN" ] || { echo "::error::codegen-check needs codegen: nothing is fetched to compare"; exit 1; }
        read -ra files <<<"$(tr -s '[:space:]' ' ' <<<"$FILES")"
        [ ${#files[@]} -gt 0 ] || { echo "::error::codegen-check needs codegen-baseline: the committed files to compare with"; exit 1; }
        for f in "${files[@]}"; do
          git ls-files --error-unmatch -- "$f" >/dev/null 2>&1 \
            || { echo "::error::$f is not committed: commit the fetched spec, it is the baseline"; exit 1; }
          mkdir -p "$BASELINE/$(dirname "$f")"
          cp -- "$f" "$BASELINE/$f"
        done
        echo "CODEGEN_BASELINE=$BASELINE" >> "$GITHUB_ENV"

    - name: Code generation
      if: inputs.codegen != ''
      shell: bash
      working-directory: ${{ inputs.working-directory }}
      env:
        SCRIPT: ${{ inputs.codegen }}
      run: pnpm run "$SCRIPT"

    # Code generated after CI never went through CI's typecheck. No --if-present:
    # a repo without a typecheck script fails here instead of shipping unchecked code.
    - name: Typecheck generated code
      if: inputs.codegen != '' || inputs.generated-elsewhere == 'true'
      shell: bash
      working-directory: ${{ inputs.working-directory }}
      run: pnpm run typecheck

    # The typecheck only catches what the code touches; the repo's script compares
    # the input fetched just now with the committed one (e.g. oasdiff breaking).
    - name: Compare with the committed version
      if: inputs.codegen-check != ''
      shell: bash
      working-directory: ${{ inputs.working-directory }}
      env:
        SCRIPT: ${{ inputs.codegen-check }}
      run: pnpm run "$SCRIPT"
```

.github/actions/run-image-smoke/action.yml composite · 1 stap · gedeeld door ci-images en cd-swarm

```yaml
name: "Image smoke test"
description: >
  Starts a locally loaded image and checks that it works: waits for health-path,
  walks the smoke list, runs the exec commands, prints the logs on failure and
  always cleans up. Takes one entry of the `images` JSON that ci-images and
  cd-swarm share. Does nothing when the entry has no health-path, smoke or exec.
  The container runs on the host network, so services started by setup-services
  (Postgres, Redis) are reachable on localhost.
inputs:
  image:
    description: "Local image reference (already built with load: true)"
    required: true
  config:
    description: "One entry of the images JSON: port, health-path, env (object), smoke (list of 'path status'), exec (list of commands)"
    required: true
  timeout:
    description: "Seconds to wait for health-path"
    required: false
    default: "60"

runs:
  using: "composite"
  steps:
    - name: Smoke test ${{ inputs.image }}
      shell: bash
      env:
        IMAGE: ${{ inputs.image }}
        CONFIG: ${{ inputs.config }}
        TIMEOUT: ${{ inputs.timeout }}
      run: |
        set -euo pipefail
        port=$(jq -r '.port // empty' <<<"$CONFIG")
        health=$(jq -r '.["health-path"] // empty' <<<"$CONFIG")
        nsmoke=$(jq '(.smoke // []) | length' <<<"$CONFIG")
        nexec=$(jq '(.exec // []) | length' <<<"$CONFIG")
        if [ -z "$health" ] && [ "$nsmoke" -eq 0 ] && [ "$nexec" -eq 0 ]; then
          echo "No health-path, smoke or exec for $IMAGE; nothing to test."; exit 0
        fi
        if { [ -n "$health" ] || [ "$nsmoke" -gt 0 ]; } && [ -z "$port" ]; then
          echo "::error::health-path or smoke needs a port"; exit 1
        fi

        # Placeholder env from the JSON, written to a 0600 file, never to argv.
        umask 077
        envfile=$(mktemp)
        jq -r '(.env // {}) | to_entries[] | "\(.key)=\(.value)"' <<<"$CONFIG" > "$envfile"

        name="smoke-$RANDOM"
        cleanup() { docker rm -f "$name" >/dev/null 2>&1 || true; rm -f "$envfile"; }
        fail() { echo "::error::$1"; echo "::group::container logs"; docker logs "$name" 2>&1 | tail -n 200 || true; echo "::endgroup::"; exit 1; }
        trap cleanup EXIT

        docker run -d --name "$name" --network host --env-file "$envfile" "$IMAGE" >/dev/null
        base="http://localhost:${port}"

        if [ -n "$health" ]; then
          deadline=$((SECONDS + TIMEOUT))
          until curl -fsS -o /dev/null "$base$health"; do
            [ "$(docker inspect -f '{{.State.Running}}' "$name")" = true ] || fail "container exited before $health answered"
            [ "$SECONDS" -lt "$deadline" ] || fail "$health did not answer within ${TIMEOUT}s"
            sleep 2
          done
          echo "healthy: $health"
        fi

        while read -r path want; do
          [ -n "$path" ] || continue
          got=$(curl -s -o /dev/null -w '%{http_code}' "$base$path" || true)
          [ "$got" = "$want" ] || fail "smoke $path: expected $want, got $got"
          echo "smoke ok: $path $got"
        done < <(jq -r '(.smoke // [])[]' <<<"$CONFIG")

        while IFS= read -r cmd; do
          [ -n "$cmd" ] || continue
          docker exec "$name" sh -c "$cmd" || fail "exec failed: $cmd"
          echo "exec ok: $cmd"
        done < <(jq -r '(.exec // [])[]' <<<"$CONFIG")
```

.github/actions/run-translations/action.yml composite · 5 commando's · credentials op één plek

```yaml
name: "Translations CMS"
description: >
  Runs one @pursuit-amsterdam/translations-management CLI command in the
  directory that holds the app's dictionaries. Credentials come from the job
  env when a 1Password item exported TMS_URL / TMS_API_KEY; the tms-url and
  tms-api-key inputs only fill gaps and never overwrite an exported value.
  One action, five commands, so ci.yml and every cd-*.yml share the same
  credential and working-directory handling. Lifted from feature/tms-prototype.
inputs:
  command:
    description: "sync | ack | pull | mark-deployed | mark-failed"
    required: true
  release-id:
    description: "Release the CMS asked to deploy (ack, mark-*). Empty = newest pending release."
    required: false
    default: ""
  reason:
    description: "Failure reason for mark-failed"
    required: false
    default: "deploy failed"
  working-directory:
    description: "Directory the CLI runs in: the package holding the app and its dictionaries."
    required: false
    default: "."
  tms-url:
    description: "Fallback for TMS_URL when the 1Password item did not export it"
    required: false
    default: ""
  tms-api-key:
    description: "Fallback for TMS_API_KEY when the 1Password item did not export it"
    required: false
    default: ""

runs:
  using: "composite"
  steps:
    - name: Provide credentials
      shell: bash
      env:
        FALLBACK_URL: ${{ inputs.tms-url }}
        FALLBACK_KEY: ${{ inputs.tms-api-key }}
      run: |
        set -euo pipefail
        if [ -z "${TMS_URL:-}" ] && [ -n "$FALLBACK_URL" ]; then echo "TMS_URL=$FALLBACK_URL" >> "$GITHUB_ENV"; fi
        if [ -z "${TMS_API_KEY:-}" ] && [ -n "$FALLBACK_KEY" ]; then echo "::add-mask::$FALLBACK_KEY"; echo "TMS_API_KEY=$FALLBACK_KEY" >> "$GITHUB_ENV"; fi
        if [ -z "${TMS_URL:-}${FALLBACK_URL}" ] || [ -z "${TMS_API_KEY:-}${FALLBACK_KEY}" ]; then
          echo "::error::TMS_URL / TMS_API_KEY missing: put them in the 1Password item or pass the TMS_URL / TMS_API_KEY secrets"; exit 1
        fi

    - name: translations ${{ inputs.command }}
      shell: bash
      working-directory: ${{ inputs.working-directory }}
      env:
        COMMAND: ${{ inputs.command }}
        RELEASE_ID: ${{ inputs.release-id }}
        REASON: ${{ inputs.reason }}
      # The command comes from the environment, never interpolated into the script.
      # `ack` exits 0 even when the CMS is unreachable: losing the long window is a
      # far better outcome than failing a deploy over bookkeeping (CLI behaviour).
      run: |
        set -euo pipefail
        case "$COMMAND" in
          sync)          pnpm exec translations sync ;;
          pull)          pnpm exec translations pull ;;
          ack)           pnpm exec translations release ack --release-id "$RELEASE_ID" ;;
          mark-deployed) pnpm exec translations release mark-deployed --release-id "$RELEASE_ID" ;;
          mark-failed)   pnpm exec translations release mark-failed --release-id "$RELEASE_ID" --reason "$REASON" ;;
          *) echo "::error::unknown command '$COMMAND'"; exit 1 ;;
        esac
```

scripts/audit-consumers.sh bash + gh · alleen-lezen · exit 1 bij elke bevinding

```bash
#!/usr/bin/env bash
# Audit every repo that consumes Pursuit-Amsterdam/workflows against the v2 baseline.
# Read-only. Needs `gh` authenticated with repo admin on the org's repos.
#
#   scripts/audit-consumers.sh            # every non-archived repo that uses this repo
#   scripts/audit-consumers.sh gp-map-webapp tms-test
#
# One line per finding: <repo>  <area>  <finding>. Exit 1 when anything is off.
# Deploy secrets live on the environments; org-level Dependabot secrets are only
# visible to an org admin and are checked only when visible.
# Companion: scripts/setup-consumer.sh <repo> applies the baseline (protection,
# environments, variables) so a new project starts compliant.
set -euo pipefail
ORG=Pursuit-Amsterdam
REQUIRED_CHECKS=("run-check-pr / pipeline")
ACTIONS_APP_ID=15368   # GitHub Actions; required checks are pinned to it
ENVIRONMENTS=(integration staging production)
findings=0
say() { printf '%-34s %-12s %s\n' "$1" "$2" "$3"; findings=$((findings+1)); }
# Org-level Dependabot secrets; empty when this token is not an org admin.
org_dep_secrets=$(gh api "orgs/$ORG/dependabot/secrets" --jq '.secrets[].name' 2>/dev/null || true)
# The people who may review a junior's PR.
seniors=$(gh api "orgs/$ORG/teams/senior-developers/members" --jq '.[].login' 2>/dev/null || true)
raw() { gh api -H "Accept: application/vnd.github.raw" "repos/$1/contents/$2" 2>/dev/null; }

# Every repo, not code search: search results are capped and miss files.
repos=("$@")
if [ ${#repos[@]} -eq 0 ]; then
  mapfile -t repos < <(gh repo list "$ORG" --no-archived --limit 1000 --json name --jq '.[].name' \
    | sort | grep -vx workflows)
fi

audited=0
for repo in "${repos[@]}"; do
  full="$ORG/$repo"
  # One unreadable repo is a finding, not the end of the audit.
  default=$(gh api "repos/$full" --jq .default_branch 2>/dev/null) || { say "$repo" access "cannot read repo"; continue; }

  # --- workflow files; repos that never reference this repo are not consumers
  files=$(gh api "repos/$full/contents/.github/workflows" --jq '.[].name' 2>/dev/null || true)
  declare -A body=()
  all=""
  for f in $files; do
    body[$f]=$(raw "$full" ".github/workflows/$f") || { say "$repo" access "cannot read $f"; continue; }
    all+="${body[$f]}"$'\n'
  done
  if ! grep -q "$ORG/workflows/" <<<"$all"; then unset body; continue; fi
  audited=$((audited+1))

  grep -qx 'check-pr.yml' <<<"$files" || say "$repo" workflows "no check-pr.yml caller"
  for f in "${!body[@]}"; do
    b=${body[$f]}
    # Workflows and composite actions alike.
    grep -qE "$ORG/workflows/\.github/(workflows|actions)/[^@[:space:]]*@main" <<<"$b" && say "$repo" version "$f still on @main"
    grep -qE 'run-(test|lint|typecheck|format):' <<<"$b" && grep -qE 'cd[^/]*\.yml@|web-cd' <<<"$b" \
      && say "$repo" cd "$f repeats source checks at deploy time"
    if grep -q 'cd-gate\.yml@' <<<"$b"; then
      grep -q 'actions: read' <<<"$b" || say "$repo" permissions "$f calls cd-gate without actions: read"
      # CD starts on workflow_run, never on push; and a failed CI run must skip the whole run.
      awk '/^on:/{o=1;next} /^[^[:space:]#]/{o=0} o&&/^  push:/{f=1} END{exit !f}' <<<"$b" \
        && say "$repo" cd "$f starts CD on push; use workflow_run of Continuous Integration"
      grep -q 'workflow_run' <<<"$b" && ! grep -q "workflow_run.conclusion == 'success'" <<<"$b" \
        && say "$repo" cd "$f: gate job has no if: on workflow_run.conclusion; a failed CI run would start a red gate instead of a skipped run"
    fi
    # check-pr must also run when the PR's base changes, and on every base.
    if grep -q 'check-pr\.yml@' <<<"$b"; then
      grep -qw edited <<<"$b" || say "$repo" checks "$f: check-pr does not run on 'edited': changing the PR's base skips it"
      awk '/^on:/{o=1;next} /^[^[:space:]#]/{o=0} o&&/^  pull_request:/{p=1;next} o&&/^  [^ ]/{p=0} o&&p&&/^    branches(-ignore)?:/{f=1} END{exit !f}' <<<"$b" \
        && say "$repo" checks "$f: check-pr filtered by branches: stacked PRs get no check"
    fi
    # A required workflow that does not start leaves its check 'Expected' forever.
    if grep -qE "$ORG/workflows/\.github/workflows/(ci|ci-images|web-ci|backend-ci)\.yml@" <<<"$b"; then
      awk '/^on:/{o=1;next} /^[^[:space:]#]/{o=0} o&&/^    paths(-ignore)?:/{f=1} END{exit !f}' <<<"$b" \
        && say "$repo" checks "$f: paths filter on a required CI workflow; detect changes inside it instead"
    fi
    # A called workflow never gets more than its caller grants.
    if grep -q 'cd-pages\.yml@' <<<"$b" && ! { grep -q 'pages: write' <<<"$b" && grep -q 'id-token: write' <<<"$b"; }; then
      say "$repo" permissions "$f calls cd-pages without pages: write and id-token: write"
    fi
    if grep -qE '(cd-swarm|cd-packages)\.yml@' <<<"$b"; then
      grep -q 'packages: write' <<<"$b" || say "$repo" permissions "$f calls cd-swarm/cd-packages without packages: write"
    fi
  done

  # Two files calling CI with the same job id give two checks with one name;
  # branch protection cannot tell them apart.
  callers=""
  for f in "${!body[@]}"; do
    callers+=$(awk '/^jobs:/{j=1;next} /^[^[:space:]#]/{j=0} j&&/^  [A-Za-z0-9_-]+:[[:space:]]*$/{id=$1; sub(/:$/,"",id)} j&&id!=""&&/uses:.*\/workflows\/\.github\/workflows\/(ci|ci-images|web-ci|backend-ci|fullstack-ci|check-pr)\.yml@/{print id}' <<<"${body[$f]}")$'\n'
  done
  mapfile -t dups < <(sed '/^$/d' <<<"$callers" | sort | uniq -d)
  for d in "${dups[@]}"; do say "$repo" checks "job id '$d' calls CI in two files: two checks named '$d / pipeline'"; done
  # One CI workflow file per repo, named "Continuous Integration": one workflow_run event per commit.
  ci_files=(); for f in "${!body[@]}"; do grep -qE "/workflows/\.github/workflows/(ci|ci-images|web-ci|backend-ci|fullstack-ci)\.yml@" <<<"${body[$f]}" && ci_files+=("$f"); done
  [ ${#ci_files[@]} -le 1 ] || say "$repo" ci "${#ci_files[@]} CI workflow files (${ci_files[*]}): put the jobs in one file, or the gate sees two workflow_run events per commit"
  for f in "${ci_files[@]}"; do
    grep -qE '^name:[[:space:]]*"?Continuous Integration"?[[:space:]]*$' <<<"${body[$f]}" \
      || say "$repo" ci "$f: name is not 'Continuous Integration'; cd-gate and the workflow_run trigger look for that name"
  done

  # --- Dockerfiles: base images pinned by digest, so CD builds on what CI tested
  while read -r df; do
    [ -n "$df" ] || continue
    content=$(raw "$full" "$df") || continue
    # FROM <stage> refers to an earlier build stage, not to an image.
    stages=$(awk 'toupper($1)=="FROM" { for (i = 2; i < NF; i++) if (toupper($i)=="AS") print tolower($(i+1)) }' <<<"$content")
    while read -r img; do
      [ -n "$img" ] || continue
      [ "$img" = scratch ] && continue
      grep -qxF "$(tr '[:upper:]' '[:lower:]' <<<"$img")" <<<"$stages" && continue
      case "$img" in *@sha256:*) ;; *) say "$repo" docker "$df: FROM $img without @sha256 digest"; break ;; esac
    done < <(awk 'toupper($1)=="FROM" { i = 2; if ($2 ~ /^--platform=/) i = 3; print $i }' <<<"$content")
  done < <(gh api "repos/$full/git/trees/$default?recursive=1" --jq '.tree[].path | select(test("(^|/)Dockerfile[^/]*$"))' 2>/dev/null || true)

  # --- branch protection: classic protection and rulesets together; the default
  # branch, and develop when it exists
  has_develop=false
  gh api "repos/$full/branches/develop" >/dev/null 2>&1 && has_develop=true
  for branch in "$default" develop; do
    gh api "repos/$full/branches/$branch" >/dev/null 2>&1 || continue
    classic=$(gh api "repos/$full/branches/$branch/protection" 2>/dev/null || echo '{}')
    rules=$(gh api "repos/$full/rules/branches/$branch" 2>/dev/null || echo '[]')
    # One view of both sources: required checks with their app, strict, force push, reviews.
    eff=$(jq -n --argjson c "$classic" --argjson r "$rules" '{
      protected: (($c | length) > 0 or ($r | length) > 0),
      checks: ([($c.required_status_checks.checks // [])[] | {context, app: .app_id}]
        + [$r[] | select(.type == "required_status_checks") | .parameters.required_status_checks[] | {context, app: .integration_id}]),
      strict: (($c.required_status_checks.strict // false)
        or any($r[]; .type == "required_status_checks" and (.parameters.strict_required_status_checks_policy // false))),
      force_push: ((((($c | length) > 0) and (($c.allow_force_pushes.enabled // false) | not))
        or any($r[]; .type == "non_fast_forward")) | not),
      reviews: ([($c.required_pull_request_reviews.required_approving_review_count // 0)]
        + [$r[] | select(.type == "pull_request") | .parameters.required_approving_review_count] | max),
      code_owners: (($c.required_pull_request_reviews.require_code_owner_reviews // false)
        or any($r[]; .type == "pull_request" and (.parameters.require_code_owner_review // false)))
    }')
    [ "$(jq -r .protected <<<"$eff")" = true ] || { say "$repo" protection "$branch is not protected (no branch protection, no ruleset)"; continue; }
    for c in "${REQUIRED_CHECKS[@]}"; do
      jq -e --arg c "$c" 'any(.checks[]; .context == $c)' <<<"$eff" >/dev/null \
        || say "$repo" protection "$branch: required check '$c' missing"
    done
    # run-ci / pipeline, plus run-ci-images / pipeline in a Swarm project
    jq -e 'any(.checks[]; .context | test("^run-ci(-[a-z]+)? / pipeline$"))' <<<"$eff" >/dev/null \
      || say "$repo" protection "$branch: no required run-ci* / pipeline check"
    # Source pinned to GitHub Actions: with "any source" a status from any token counts.
    mapfile -t unpinned < <(jq -r --argjson app "$ACTIONS_APP_ID" '.checks[] | select(.app != $app) | .context' <<<"$eff")
    for c in "${unpinned[@]}"; do say "$repo" protection "$branch: required check '$c' not pinned to GitHub Actions"; done
    # Up-to-date on develop, not on the default branch when develop exists:
    # develop is always behind main after a release (merge commits), and
    # "Update branch" would push straight onto the protected develop.
    if [ "$branch" = "$default" ] && [ "$has_develop" = true ]; then
      [ "$(jq -r .strict <<<"$eff")" = false ] || say "$repo" protection "$branch: requires up-to-date branches, which blocks every develop -> $branch PR"
    else
      [ "$(jq -r .strict <<<"$eff")" = true ] || say "$repo" protection "$branch: not requiring up-to-date branches"
    fi
    [ "$(jq -r .force_push <<<"$eff")" = false ] || say "$repo" protection "$branch: force push allowed"
    [ "$(jq -r .reviews <<<"$eff")" -ge 1 ] || say "$repo" protection "$branch: no review required"
    [ "$(jq -r .code_owners <<<"$eff")" = true ] || say "$repo" protection "$branch: review from code owners not required"
  done

  # --- environments (names are case-insensitive to GitHub, but keep them lowercase)
  envs=$(gh api "repos/$full/environments" --jq '.environments[].name' 2>/dev/null || true)
  expected=("${ENVIRONMENTS[@]}")
  gh api "repos/$full/branches/acceptance" >/dev/null 2>&1 && expected+=(acceptance)
  for e in "${expected[@]}"; do
    grep -qix "$e" <<<"$envs" || say "$repo" environments "missing environment '$e'"
    grep -qx "$e" <<<"$envs" || ! grep -qix "$e" <<<"$envs" || say "$repo" environments "environment '$e' is not lowercase"
  done

  # --- per-environment variables the v2 CD workflows fall back to
  for e in staging production; do
    grep -qix "$e" <<<"$envs" || continue
    vars=$(gh api "repos/$full/environments/$e/variables" --jq '.variables[].name' 2>/dev/null || true)
    for v in OP_VAULT OP_ITEM; do grep -qx "$v" <<<"$vars" || say "$repo" vars "$e: $v not set (cd-* will need it passed explicitly)"; done
    if grep -qE 'cd-swarm|vm-cd' <<<"$all"; then
      for v in VM_SSH_HOST VM_SSH_USER; do grep -qx "$v" <<<"$vars" || say "$repo" vars "$e: $v not set"; done
    fi
  done
  repovars=$(gh api "repos/$full/actions/variables" --jq '.variables[].name' 2>/dev/null || true)
  grep -qE 'OP_VAULT|VM_SSH_HOST' <<<"$repovars" && say "$repo" vars "OP_*/VM_SSH_* set at repo level; should live on the environment"

  # --- repo secrets (names only)
  secrets=$(gh api "repos/$full/actions/secrets" --jq '.secrets[].name' 2>/dev/null || true)
  if grep -qE 'cd-vercel|web-cd' <<<"$all"; then
    for s in VERCEL_ORG_ID VERCEL_PROJECT_ID; do grep -qx "$s" <<<"$secrets" || say "$repo" secrets "$s missing"; done
  fi
  if grep -qE 'cd-swarm|vm-cd' <<<"$all"; then
    grep -qx VM_SSH_KNOWN_HOSTS <<<"$secrets" || say "$repo" secrets "VM_SSH_KNOWN_HOSTS missing"
  fi
  grep -q 'use-custom-token: true' <<<"$all" && ! grep -qx CUSTOM_GITHUB_TOKEN <<<"$secrets" \
    && say "$repo" secrets "use-custom-token without CUSTOM_GITHUB_TOKEN"

  # --- Supabase: edge functions must ship from CI, not from a laptop
  if gh api "repos/$full/contents/supabase/functions" >/dev/null 2>&1; then
    grep -q 'cd-supabase' <<<"$all" || say "$repo" supabase "has supabase/functions but no cd-supabase caller (deployed by hand)"
    for e in staging production; do
      grep -qix "$e" <<<"$envs" || continue
      gh api "repos/$full/environments/$e/variables" --jq '.variables[].name' 2>/dev/null \
        | grep -qx SUPABASE_PROJECT_REF || say "$repo" supabase "$e: SUPABASE_PROJECT_REF not set"
    done
  fi

  # --- CODEOWNERS: the senior developers own the whole repo, so a junior's PR
  # needs a senior's review (with code-owner review required), never a junior's
  co=$(raw "$full" .github/CODEOWNERS || raw "$full" CODEOWNERS || raw "$full" docs/CODEOWNERS || true)
  grep -qE "^\*[[:space:]].*@$ORG/senior-developers" <<<"$co" \
    || say "$repo" codeowners "no '* @$ORG/senior-developers' line in CODEOWNERS: any reviewer would do"
  # Direct admins outside the senior team can merge their own PRs without review.
  while read -r u; do
    [ -n "$u" ] || continue
    grep -qx "$u" <<<"$seniors" || say "$repo" access "$u is a direct admin but not in senior-developers"
  done < <(gh api "repos/$full/collaborators?affiliation=direct&permission=admin" --jq '.[].login' 2>/dev/null || true)

  # --- scripts are the CI contract
  gh api "repos/$full/contents/package.json" >/dev/null 2>&1 || say "$repo" scripts "no package.json: CI runs the repo's scripts"

  # --- Dependabot: runs it starts get only Dependabot secrets (pull_request and push
  # alike), and it needs a registry entry to update private @pursuit-amsterdam packages
  if dep=$(raw "$full" .github/dependabot.yml); then
    if grep -q 'use-custom-token: true' <<<"$all"; then
      grep -q 'npm.pkg.github.com' <<<"$dep" \
        || say "$repo" dependabot "no npm-registry for npm.pkg.github.com: private packages are not updated"
      if ! grep -qx CUSTOM_GITHUB_TOKEN <<<"$org_dep_secrets"; then
        gh api "repos/$full/dependabot/secrets" --jq '.secrets[].name' 2>/dev/null | grep -qx CUSTOM_GITHUB_TOKEN \
          || say "$repo" dependabot "Dependabot secret CUSTOM_GITHUB_TOKEN not found (repo level; org level not set or not visible)"
      fi
    fi
  else
    say "$repo" dependabot "no dependabot.yml"
  fi
  grep -qF 'dependabot/*' <<<"$all" \
    && say "$repo" dependabot "CI triggers on push to dependabot/*: same secrets as the PR run, only a duplicate run"
  unset body
done

echo; echo "$findings finding(s) across $audited consumer repo(s)."
[ "$findings" -eq 0 ]
```

---

[← Detailbeslissingen](detailbeslissingen.md) · [Overzicht](../README.md)
