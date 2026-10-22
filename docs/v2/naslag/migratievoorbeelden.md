<a id="migration"></a>

# Migratievoorbeelden

Eén PR per repo: `@main` wordt `@v2`, de inputs worden herschreven, de CD-trigger wordt `workflow_run` in plaats van `push`, en de variabelen in de environments worden één keer ingesteld. Eerst per soort repo wat je doet, dan vóór en na voor zes vormen uit de praktijk.

| Soort repo | Repo's | Wat je doet |
| --- | --- | --- |
| Next.js-site op Vercel | 29 | ci.yml + cd-gate + cd-vercel. `OP_VAULT`/`OP_ITEM` per environment; `VERCEL_TOKEN` en `OP_SERVICE_ACCOUNT_TOKEN` als environment-secret, als ze nog op de repo staan. Branchregels op `staging` en `production`. Twee deploy-jobs worden er één. |
| Storybook naar Pages | 11 | `@v2`; `node-version` vervalt, de versie komt uit `.nvmrc`. Verder niets. |
| Python- of Supabase-backend | 6 | ci.yml met `checks` en `database`, plus een `package.json` met de scripts en `packageManager`, een `pnpm-lock.yaml` en `.python-version`, ook voor Python. De drie Python-repo's zonder hoofdschakelaar: reken op rood bij de eerste run. |
| Swarm | 5 | ci.yml en/of ci-images + cd-gate + cd-swarm. `VM_SSH_*` per environment; `pre-deploy` controleert dat de runbookstappen op de server gedaan zijn. |
| Supabase edge functions | — | cd-supabase vóór de app-deploy, achter dezelfde gate. `SUPABASE_PROJECT_REF` per environment. |
| Pakket-repo | — | Op een release: cd-gate + cd-packages, met `packages: write`. De versie in `package.json` ophogen vóór de release. |
| Roept actions rechtstreeks aan | 6 | Niets. Namen en inputs blijven; alleen de ref als je wilt. Publiceert de repo pakketten, dan kan hij overstappen op cd-packages. |

Vóór en na, voor zes soorten repo's uit de praktijk. Met `@v2`.

## Next.js-site op Vercel (template-nextjs-vercel, en 24 vergelijkbare repo's)

vóór · web-cd.yml, twee jobs

```
run-deploy-staging:
  if: github.ref == 'refs/heads/develop' || (dispatch && inputs.environment == 'staging')
  uses: …/web-cd.yml@main
  with:
    node-version: '22.x'
    environment: 'staging'
    build-mode: 'github'
    platform: 'vercel'
    use-custom-token: true
    run-test: true
    run-lint: true
    run-typecheck: true
    onepassword_enabled: true
    onepassword_vault: my-website-staging
    onepassword_item: my-website-staging-secrets
  secrets: inherit
run-deploy-production:
  if: github.event_name == 'release' || (dispatch && inputs.environment == 'production')
  uses: …/web-cd.yml@main
  with:   # nog een keer hetzelfde, met productienamen
  secrets: inherit
```

ná · cd-gate + cd-vercel, één job

```
on:
  workflow_run:            # niet push: CD start als CI klaar is
    workflows: [Continuous Integration]
    types: [completed]
    branches: [develop]
  release:
    types: [published]
  workflow_dispatch:       # geen inputs: vanaf develop = staging, vanaf de nieuwste tag = production

gate:
  if: github.event_name != 'workflow_run' || github.event.workflow_run.conclusion == 'success'
  uses: …/cd-gate.yml@v2   # required-workflows: standaardwaarde
  with:
    branch-targets: develop=staging   # Vercel kent geen acceptance; cd-vercel weigert die
deploy:
  needs: gate
  if: needs.gate.outputs.proceed == 'true'
  uses: …/cd-vercel.yml@v2
  with:
    environment: ${{ needs.gate.outputs.target }}
    ref: ${{ needs.gate.outputs.sha }}
    use-custom-token: true
  secrets: inherit

# eenmalig, per GitHub-environment:
#   staging:    OP_VAULT=my-website-staging    OP_ITEM=my-website-staging-secrets
#               branches: develop, main  (workflow_run-runs hebben ref main)
#   production: OP_VAULT=my-website-production OP_ITEM=my-website-production-secrets
#               branches: tags v*  (en de tag-ruleset: alleen seniors maken v*-tags)
#   secrets VERCEL_TOKEN en OP_SERVICE_ACCOUNT_TOKEN op beide environments
```

## Python-API met een echte database (gp-map-webapp)

vóór · backend-ci.yml

```
with:
  run-python-checks: true
  python-version: "3.11"
  working-directory: "./backend"
  use-custom-token: true
  run-lint: true
  lint-command: "ruff check . && pylint src/gp_map"
  run-format-check: true
  run-typecheck: true
  run-test: true
  postgres-enabled: true
  postgres-user: gp_map
  postgres-password: gp_map
  postgres-db: gp_map
```

ná · scripts in de repo, ci.yml kiest

```
# backend/package.json
"packageManager": "pnpm@10.x.y",
"scripts": {
  "lint":      "uv run ruff check . && uv run pylint src/gp_map",
  "format":    "uv run ruff format --check .",
  "typecheck": "uv run ty check",
  "test":      "uv run pytest"
}
# backend/pnpm-lock.yaml: leeg, maar aanwezig (--frozen-lockfile)
# backend/.python-version: 3.11

# ci.yml
with:
  working-directory: "./backend"
  use-custom-token: true
  checks: lint format typecheck test
  database: postgres
  postgres-user: gp_map
  postgres-password: gp_map
  postgres-db: gp_map
```

## Frontend en backend in één repo (gp-map-webapp, tellr-webapp)

Met turbo is het één job. Turbo draait elke check in elk pakket dat hem kent, en bij een PR alleen in de pakketten die veranderd zijn. Eén verplichte check voor de code, `run-ci / pipeline`; een Swarm-project heeft daarnaast `run-ci-images / pipeline`, uit hetzelfde bestand.

vóór · twee bestanden, twee workflows

```
# ci-web.yml
name: Continuous Integration (Web)
jobs:
  run-ci:
    uses: …/web-ci.yml@main
    with: { working-directory: ./frontend, … }

# ci-backend.yml
name: Continuous Integration (Backend)
jobs:
  run-ci:
    uses: …/backend-ci.yml@main
    with: { working-directory: ./backend, … }
```

ná · één bestand, turbo; de image-check als tweede job in hetzelfde bestand

```
# turbo.json (root)
{ "tasks": { "lint": {}, "typecheck": {},
             "test": {}, "build": {} } }

# ci.yml
name: Continuous Integration
jobs:
  run-ci:
    uses: …/ci.yml@v2
    with:
      checks: lint typecheck test build
      database: postgres
    secrets: inherit
  run-ci-images:                 # was image-ci.yml, een eigen bestand
    uses: …/ci-images.yml@v2
    with:
      stack-file: docker-stack.base.yml
      images: >- [ … ]
# frontend/ en backend/ hebben elk hun eigen scripts;
# backend/ heeft een pyproject.toml, dus uv komt erbij.
# verplichte checks: run-ci / pipeline en run-ci-images / pipeline
```

Turbo is bij meer dan één workspace verplicht ([besloten](../beslissingen.md#decided)): één commando lokaal en in CI, caching, en alleen draaien wat veranderd is.

De verplichte checks veranderen mee. gp-map vereist nu `run-ci / pipeline`; met één bestand blijft dat de naam, en de branchprotectie blijft gelijk. tellr-webapp vereist `frontend-ci / pipeline` en `backend-ci / pipeline`; die verdwijnen. De migratie-PR van tellr vervangt ze door `run-ci / pipeline`. Wanneer je dat doet: [job-id's en verplichte checks](uitrol-in-detail.md#job-ids).

## Alleen Supabase, en Python zonder de hoofdschakelaar

basko / tellr · vóór → ná

```
with:
  run-python-checks: false
  run-supabase-test: true

# package.json: "dbtest": "supabase test db"
with:
  checks: dbtest
  database: supabase
```

Twee dingen die tellr leerde. Met turbo telt CI alleen scripts van workspace-pakketten; een rootscript als `dbtest` hoort dan als roottask `"//#dbtest": { "cache": false }` in `turbo.json`. En CI installeert de Supabase CLI die `package.json` exact pint (v1 nam `latest`): die versie moet de `config.toml` kennen, `[local_smtp]` bijvoorbeeld sinds 2.108.0. `migrate-consumer` doet beide: het zet `dbtest` en de roottask als patch op de eigen `package.json` en `turbo.json` van elke branch, en waarschuwt voor een te oude of niet-exacte CLI.

gp-groot / automations-blueprint / integrators-automations · vóór → ná

```
with:                          # draait niets, slaagt
  python-version: "3.11"
  working-directory: "./backend"
  run-lint: true
  run-format-check: true
  run-test: false

# nieuw: backend/package.json met "lint" en "format"
with:                          # draait ruff; rood bij de eerste run
  working-directory: "./backend"
  checks: lint format
```

## Swarm-project (gp-map-webapp, gp-groot-automations, automations-blueprint, integrators-automations)

vóór · vm-cd.yml, twee jobs + een eigen gate

```
gate:            # 70 regels github-script
build-staging:
  needs: gate
  if: …target == 'staging'
  uses: …/vm-cd.yml@main
  with:
    environment: staging
    ref: ${{ github.event.workflow_run.head_sha || github.sha }}
    ssh-host: 4.245.8.183
    ssh-user: deploy
    images: >- [ … ]
    stack-file: docker-stack.base.yml
    stack-name: gp-map-staging
    use-custom-token: true
    onepassword_enabled: true
    onepassword_vault: gp-groot-map-staging
    onepassword_item: gp-groot-map-staging-secrets
    migrate-image: …
build-production:  # nog een keer hetzelfde
```

ná · cd-gate + cd-swarm, één job

```
# ci.yml heeft twee jobs: run-ci (ci.yml) en run-ci-images (ci-images.yml),
# in één bestand "Continuous Integration": één workflow_run-event, één gate-run
gate:
  if: github.event_name != 'workflow_run' || github.event.workflow_run.conclusion == 'success'
  uses: …/cd-gate.yml@v2
deploy:
  needs: gate
  if: needs.gate.outputs.proceed == 'true'
  uses: …/cd-swarm.yml@v2
  with:
    environment: ${{ needs.gate.outputs.target }}
    ref: ${{ needs.gate.outputs.sha }}
    use-custom-token: true
    images: >- [ … ]
    stack-file: ${{ needs.gate.outputs.target == 'production'
      && 'docker-stack.base.yml docker-stack.production.yml'
      || 'docker-stack.base.yml' }}
    # alleen controles, als deploy-gebruiker: zijn de runbookstappen gedaan?
    # ontbreekt er iets, dan stopt de deploy hier, vóór de migraties
    pre-deploy: |
      for d in /opt/gp-map/traefik/dynamic /opt/gp-map/certs; do
        [ -d "$d" ] || { echo "missing $d (runbook step 6)"; exit 1; }
      done
      if [ "$ENVIRONMENT" = production ]; then
        [ -d /opt/gp-map/acme ] || { echo "missing /opt/gp-map/acme (Let's Encrypt)"; exit 1; }
      fi
      docker network inspect traefik-public >/dev/null || { echo "missing network traefik-public"; exit 1; }
    migrate-image: ghcr.io/pursuit-amsterdam/gp-map-backend   # tag :<versie> komt erbij
  secrets: inherit
# per environment: VM_SSH_HOST VM_SSH_USER OP_VAULT OP_ITEM;
# secrets VM_SSH_PRIVATE_KEY en OP_SERVICE_ACCOUNT_TOKEN staan er al
```

## Swarm-stack van kant-en-klare images (gp-container-tracking-webapp: Traccar + Postgres + Traefik, niets zelf gebouwd)

Geen Dockerfile, geen unittests. Het risico van een PR is een kapot stackbestand; de deploy heeft niets met bouwen te maken. Beide workflows krijgen dezelfde `stack-file`. De staging-VM is nog niet ingericht: de CI-aanroeper kan nu al gemerged worden, de CD-aanroeper pas met de VM. Alvast toevoegen met `deploy-enabled: false` kan niet: zonder iets te bouwen doet die run niets, en dat weigert cd-swarm.

ci.yml-aanroeper · ci-images, alleen de stackcheck

```
run-ci:
  uses: …/ci-images.yml@v2
  with:
    stack-file: docker-stack.base.yml docker-stack.staging.yml
    stack-env: APP_HOST=example.test ACME_EMAIL=ci@example.test
    # images weggelaten: er valt niets te bouwen
# statuscheck: run-ci / pipeline, net als elke andere repo
```

cd.yml-aanroeper · cd-gate + cd-swarm, geen buildjob · komt erbij zodra de staging-VM bestaat

```
gate:
  if: github.event_name != 'workflow_run' || github.event.workflow_run.conclusion == 'success'
  uses: …/cd-gate.yml@v2
deploy:
  needs: gate
  if: needs.gate.outputs.proceed == 'true'
  uses: …/cd-swarm.yml@v2
  with:
    environment: ${{ needs.gate.outputs.target }}
    ref: ${{ needs.gate.outputs.sha }}
    # images weggelaten: de buildjob wordt overgeslagen, de deploy draait
    stack-file: docker-stack.base.yml docker-stack.staging.yml
    pre-deploy: |   # alleen controles; de VM-inrichting maakt de mappen
      for d in /opt/gp-ct/traefik/dynamic /opt/gp-ct/certs /opt/gp-ct/acme; do
        [ -d "$d" ] || { echo "missing $d"; exit 1; }
      done
  secrets: inherit
# per environment: VM_SSH_HOST VM_SSH_USER OP_VAULT OP_ITEM
# rechten van de aanroeper: packages: write, ook zonder images
```

---

[← Standaardinrichting](standaardinrichting.md) · [Overzicht](../README.md) · [Uitrol in detail →](uitrol-in-detail.md)
