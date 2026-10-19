<a id="plan"></a>

# Implementatieplan workflows v2

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Doel:** de workflows uit het v2-ontwerp bouwen op de branch `v2`, bewijzen op een voorbeeldrepo en zeven testrepo's, en daarna elke repo laten overstappen.

**Aanpak:** in zeven plakken. Elke plak eindigt met iets dat in een echte repo draait, en pas daarna begint de volgende. De concept-YAML in de naslag is het uitgangspunt van elke taak; een taak kopieert het blok, past het aan wat de review heeft bijgesteld, en bewijst het op de voorbeeldrepo. Taken die werk buiten deze repo vragen (environments, secrets, een Supabase-account) staan apart gemarkeerd met **handwerk**, omdat een agent ze niet kan uitvoeren.

**Techniek:** GitHub Actions (reusable workflows, composite actions, `actions/github-script`), bash, `actionlint`, `shellcheck`, `gh`.

**Spec:** [docs/v2](README.md), vooral [beslissingen](beslissingen.md#decided), [ci](naslag/ci.md), [cd](naslag/cd.md), [bouwstenen](naslag/bouwstenen.md), [standaardinrichting](naslag/standaardinrichting.md), [uitrol in detail](naslag/uitrol-in-detail.md) en de [concept-YAML](naslag/concept-yaml.md).

## Vaste regels voor elke taak

- Werk op `v2`: een branch `feature/<taak>` vanaf `v2`, PR naar `v2`. Nooit naar `main`.
- Runner: `blacksmith-4vcpu-ubuntu-2404`. Interne refs: `Pursuit-Amsterdam/workflows/.github/...@v2`, nooit `./` en nooit `@main`.
- Externe actions op een vaste commit met de versie als commentaar (`@3d3c42e… # v7.0.1`).
- Inputnamen kebab-case. YAML en commentaar in het Engels; docs in het Nederlands.
- `actionlint` en `shellcheck` schoon, op de bekende runnerlabel-waarschuwing na.
- Een workflow die door zijn instellingen niets doet, faalt met een melding (principe 2).
- Commits conventioneel (`feat:`, `fix:`, `docs:`, `ci:`), zonder attributie-trailers.
- Elke taak eindigt met een groene run in de voorbeeldrepo of een testrepo; "het lint" is niet genoeg.

## Review Focus

Vijf situaties die de spec impliceert maar geen taak vanzelf test. Elke regel heeft zijn test in de taak die de code bezit.

1. **Een release op een tag die niet op `main` staat** (per ongeluk getagd op `develop`): de gate vindt een groene push-run op die commit en deployt develop-code naar productie. Verwacht: rood, "tag is not on main". Test in Taak 11.
2. **Een prerelease** vuurt ook `release: published`: cd-vercel zou een prerelease naar productie deployen. Verwacht: de gate slaat een prerelease over, tenzij `allow-prerelease: true` (cd-packages, voor de `next`-tag). Test in Taak 11.
3. **Een releasetag zonder `v`** (`1.4.0`): de branchregel `v*` van `production` weigert de job met een onduidelijke melding. Verwacht: de gate faalt eerst, met "tag must match v*". Test in Taak 11.
4. **Een deploy naar een environment dat nog niet bestaat** (eerste push naar `acceptance`): GitHub maakt het environment aan zonder regels, en de deploy gaat door. Verwacht: het auditscript meldt een environment zonder branchregels, en `setup-consumer.sh` maakt de environments met regels aan vóór de eerste run. Test in Taak 24 en 25.
5. **Een CMS-verzoek voor een branch die niet bestaat** (`environment: acceptance` zonder `acceptance`-branch): `getBranch` geeft 404 en de gate valt om met een stacktrace. Verwacht: rood met "branch acceptance does not exist". Test in Taak 11.

---

## Plak 0: fundament van `v2`

Na deze plak is `v2` beschermd, test hij zichzelf, en bestaat de voorbeeldrepo.

### Taak 1: check-pr kent `v*` en leest het event

**Bestanden:**
- Wijzig: `.github/workflows/check-pr.yml`
- Wijzig: `check-pr.sh`

**Interface:** `check-pr.yml` houdt `workflow_call` en de job-id `pipeline`, maar zonder inputs: `HEAD` en `BASE` komen uit `github.event.pull_request.head.ref` en `.base.ref`. Geen checkout. `head-ref` en `base-ref` blijven tijdelijk gedeclareerd als optioneel en ongebruikt, zodat v1-aanroepers op `@v2` niet met `startup_failure` breken; ze verdwijnen in Taak 28.

- [ ] Stap 1: voeg in `check-pr.sh` de regels toe: `v[0-9]+` is een geldige head en base; `feature/*`, `hotfix/*` en `revert-<n>-(feature|hotfix)/*` mogen naar `v*`; `v*` zelf mag nergens heen. Zet bovenaan een reeks testgevallen als commentaar: `feature/x → v2 ✅`, `develop → v2 ❌`, `v2 → main ❌`, `v2 → develop ❌`.
- [ ] Stap 2: draai `./check-pr.sh` met elk van die vier combinaties in `HEAD`/`BASE` en controleer de exitcode (0, 1, 1, 1).
- [ ] Stap 3: zet dezelfde regels in `check-pr.yml`, vervang de inputs door de event-velden, verwijder de checkout.
- [ ] Stap 4: `actionlint .github/workflows/check-pr.yml` en `shellcheck check-pr.sh`.
- [ ] Stap 5: commit `feat(check-pr): allow v* as base and read head/base from the event`.

### Taak 2: eigen CI van deze repo

**Bestanden:**
- Maak: `package.json` (deze repo volgt zijn eigen besluit: de scripts zijn de namen van wat CI en mensen draaien), met `packageManager: pnpm@<huidig>`, `private: true`, en scripts:
  - `lint`: `actionlint && shellcheck check-pr.sh scripts/*.sh`
  - `test`: `scripts/check-pr-cases.sh`
  - `audit:consumers`: `scripts/audit-consumers.sh` (Taak 24; argumenten via `pnpm audit:consumers -- gp-map-webapp`; niet `audit`, dat is een ingebouwd pnpm-commando)
  - `audit:consumers:remote`: `gh workflow run audit-consumers.yml --ref v2` (Taak 24)
  - `setup-consumer`: `scripts/setup-consumer.sh` (Taak 25)
  - `migrate-consumer`: `scripts/migrate-consumer.sh` (Taak 26)
  Plus een lege `pnpm-lock.yaml` en `.nvmrc` met `22`. De scripts voor Taak 24–26 mogen er nu al in staan; ze falen met "no such file" tot die taak klaar is.
- Maak: `.github/workflows/self-ci.yml` met `name: Continuous Integration`, trigger `pull_request` en `push` op `v2`, één job `pipeline`.
- Maak: `scripts/check-pr-cases.sh`: draait `check-pr.sh` voor een tabel van `HEAD BASE verwacht` en faalt bij één afwijking.

**Interface:** de check heet `pipeline` (job-id), dus de verplichte check in Taak 3 is `pipeline`. Lokaal en in CI is het commando hetzelfde: `pnpm lint` en `pnpm test`.

- [ ] Stap 1: schrijf `scripts/check-pr-cases.sh` met minstens de vier gevallen van Taak 1 plus de bestaande regels (`feature/x → develop ✅`, `hotfix/x → main ✅`, `feature/x → main ❌`, `develop → acceptance ✅`). Het script zet `HEAD`/`BASE` via `sed` in een kopie van `check-pr.sh` in `$RUNNER_TEMP` en vergelijkt de exitcode.
- [ ] Stap 2: draai het lokaal; verwacht `8 cases, 0 failures`.
- [ ] Stap 3: `self-ci.yml`: checkout, `pnpm/action-setup` op vaste commit, actionlint installeren via het downloadscript van rhysd op een vaste commit (`shellcheck` staat op de runner), dan `pnpm lint` en `pnpm test`. Een `.github/actionlint.yaml` met het Blacksmith-label onder `self-hosted-runner.labels`, zodat `pnpm lint` schoon is.
- [ ] Stap 4: open de PR naar `v2`; verwacht één groene check `pipeline`.
- [ ] Stap 5: commit `ci: lint workflows and test check-pr on every PR`.

### Taak 3: bescherming van `v2` (**handwerk**)

**Bron:** [uitrol in detail, Bescherming van v2](naslag/uitrol-in-detail.md#rollout).

- [ ] Stap 1: `CODEOWNERS` in `.github/` met `/.github/ @Pursuit-Amsterdam/platform` en `/scripts/ @Pursuit-Amsterdam/platform` (team naar keuze; één regel per pad).
- [ ] Stap 2: `.github/dependabot.yml` met `package-ecosystem: github-actions`, `target-branch: v2`, wekelijks.
- [ ] Stap 3: ruleset in de repo-instellingen voor `refs/heads/v*`: PR verplicht, 1 review, code-owner-review, verplichte check `pipeline` (bron: GitHub Actions), geen force push, geen delete.
- [ ] Stap 4: test: een push rechtstreeks naar `v2` wordt geweigerd; een PR zonder groene `pipeline` is niet te mergen.
- [ ] Stap 5: commit `chore: add CODEOWNERS and Dependabot for v2`.

### Taak 4: de voorbeeldrepo `workflows-example` (**handwerk** voor het aanmaken)

**Repo:** `Pursuit-Amsterdam/workflows-example`, privé, branches `main` en `develop`, default `main`.

**Inhoud (Taak 4 maakt de basis; latere taken voegen toe):**
- `package.json` met `packageManager: pnpm@<huidig>`, scripts `lint`, `typecheck`, `test`, `build` die elk `node -e "console.log('<naam> ok')"` doen; `pnpm-lock.yaml`; `.nvmrc` met `22`.
- `backend/pyproject.toml` (naam `example-backend`, geen dependencies), `backend/uv.lock`, `backend/.python-version` met `3.12`, `backend/package.json` met `"lint": "uv run python -c 'print(1)'"`.
- `.github/workflows/check-pr.yml` dat `check-pr.yml@v2` aanroept vanuit job `run-check-pr`, op `pull_request` met `types: [opened, synchronize, reopened, edited]`.
- `README.md`: "Dit is de testrepo van Pursuit-Amsterdam/workflows; elke workflow op v2 wordt hier eerst bewezen."

- [ ] Stap 1: maak de repo en de bestanden; branchprotectie op `main` en `develop` volgens de [standaardinrichting](naslag/standaardinrichting.md#consumer-config), nog zonder verplichte CI-check (die komt in Taak 9).
- [ ] Stap 2: open een PR `feature/hello → develop`; verwacht `run-check-pr / pipeline` groen.
- [ ] Stap 3: open een PR `feature/hello → main`; verwacht rood.

---

## Plak 1: CI

Na deze plak draait `ci.yml@v2` in de voorbeeldrepo en in template-nextjs-vercel.

### Taak 5: bestaande actions op orde

**Bestanden:**
- Wijzig: `.github/actions/setup-node-pnpm/action.yml`
- Wijzig: `.github/actions/setup-python/action.yml`
- Wijzig: `.github/actions/setup-onepassword/action.yml`, `setup-version`, `run-docker-build-push`, `deploy-vercel`, `deploy-swarm`, `run-supabase-test` (alleen pinnen)

**Interface:** `setup-node-pnpm` krijgt input `working-directory` (default `.`); de install wordt `pnpm install --frozen-lockfile` in die map; `.npmrc` wordt in die map geschreven. `setup-python` draait `uv sync --frozen`. Bestaande inputnamen en outputs blijven.

- [ ] Stap 1: pin elke `uses:` in alle bestaande actions op een commit met versiecommentaar (`pnpm/action-setup`, `actions/setup-node`, `astral-sh/setup-uv`, `1password/*`, `supabase/setup-cli`, `docker/*`).
- [ ] Stap 2: voeg `working-directory` toe aan `setup-node-pnpm` en zet `--frozen-lockfile`; `uv sync --frozen` in `setup-python`.
- [ ] Stap 3: `actionlint`; verwacht alleen de runnerlabel-waarschuwing.
- [ ] Stap 4: test in de voorbeeldrepo met een tijdelijke workflow die `setup-node-pnpm@feature/<taak>` aanroept met `working-directory: backend`; verwacht een install zonder fout en een `.npmrc` in `backend/`. Verwijder de tijdelijke workflow weer.
- [ ] Stap 5: commit `feat(actions): pin external actions, frozen installs, working-directory for pnpm`.

### Taak 6: `setup-services` en `setup-supabase`

**Bestanden:**
- Maak: `.github/actions/setup-services/action.yml` uit het [concept](naslag/concept-yaml.md) (blok `setup-services`).
- Maak: `.github/actions/setup-supabase/action.yml`: de stappen `Check for Supabase directory changes` tot en met `Start Supabase local services` uit `run-supabase-test/action.yml`, plus outputs `started`, `db-url`, `api-url`, `anon-key`, `service-role-key`, en een stap die `DATABASE_URL`, `SUPABASE_URL`, `SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY` naar `$GITHUB_ENV` schrijft. CLI-versie: `supabase/setup-cli` zonder `version`, met een voorafgaande stap die faalt als `supabase` geen devDependency in `package.json` is.

**Interface (gebruikt door Taak 7, 8, 15, 18, 20):** inputs `database`, `redis`, `supabase-seed`, `supabase-skip-unchanged`, `postgres-*`, `onepassword-vault`, `onepassword-item`, `onepassword-token`, `onepassword-export-for-vercel`, `onepassword-export-build-args`; outputs `database-url`, `supabase-started`, `build-args`.

- [ ] Stap 1: schrijf beide actions; `actionlint` + `shellcheck` op de scripts erin.
- [ ] Stap 2: test in de voorbeeldrepo met een tijdelijke workflow: `database: postgres` → `psql "$DATABASE_URL" -c 'select 1'` slaagt; `redis: true` → `redis-cli -u "$REDIS_URL" ping` geeft `PONG`; `database: banana` → de validatiestap faalt met de melding; `onepassword-item: x` zonder vault → faalt vóór er iets gestart is.
- [ ] Stap 3: commit `feat(actions): add setup-services and split setup-supabase from run-supabase-test`.

### Taak 7: `ci.yml`

**Bestanden:**
- Maak: `.github/workflows/ci.yml` uit het concept-blok `ci.yml`, met `working-directory` doorgegeven aan `setup-node-pnpm`.

**Interface:** inputs volgens [ci.md](naslag/ci.md#ci); job-id `pipeline`; secrets `OP_SERVICE_ACCOUNT_TOKEN`, `CUSTOM_GITHUB_TOKEN`, `TMS_URL`, `TMS_API_KEY` optioneel. De `tms-sync`-stap komt in Taak 21; laat de input gedeclareerd en de stap weg.

- [ ] Stap 1: schrijf `ci.yml`; `actionlint`.
- [ ] Stap 2: voorbeeldrepo: `.github/workflows/ci.yml` met `name: Continuous Integration`, trigger `push` op `main`/`develop` en `pull_request`, job `run-ci` → `ci.yml@feature/<taak>` met `checks: lint typecheck test`. Verwacht groen, met in de log de drie `ok`-regels en `Setup Python (uv)` uitgevoerd (de `backend/pyproject.toml`).
- [ ] Stap 3: negatieve tests, elk één commit op een PR-branch van de voorbeeldrepo: `checks: ""` → rood "checks is empty"; `checks: lint nonexistent` → rood met `nonexistent` in de melding; `working-directory: nope` → rood "no package.json".
- [ ] Stap 4: turbo-test: voeg in de voorbeeldrepo `turbo.json` en `pnpm-workspace.yaml` met `packages: [backend]` toe op een PR-branch; verwacht `pnpm turbo run … --affected` in de log en alleen het gewijzigde pakket. Houd dit in de repo (de voorbeeldrepo is vanaf nu een monorepo).
- [ ] Stap 5: zet de ref in de voorbeeldrepo op `@v2` zodra de PR gemerged is; commit in deze repo `feat: add ci.yml, the one CI workflow for every repo`.

### Taak 8: `run-image-smoke` en `ci-images.yml`

**Bestanden:**
- Maak: `.github/actions/run-image-smoke/action.yml` (concept-blok).
- Maak: `.github/workflows/ci-images.yml` (concept-blok, met `build-env` en de merge-base-vergelijking).

**Interface:** inputs volgens [ci.md](naslag/ci.md#ci-images); jobs `stack`, `images`, `pipeline`.

- [ ] Stap 1: voorbeeldrepo krijgt `docker-stack.base.yml` (één service `web`, image `${WEB_IMAGE:?}`), `web/Dockerfile` (`FROM python:3.12-alpine@sha256:…`, `CMD python -m http.server 8080`), en in `ci.yml` een tweede job `run-ci-images` → `ci-images.yml@feature/<taak>` met `stack-file`, `stack-env: WEB_IMAGE=example`, en één image met `port: 8080`, `health-path: /`, `paths: [web/**]`.
- [ ] Stap 2: verwacht: `stack` groen, `images` groen met "healthy: /", `pipeline` groen; twee checks `run-ci / pipeline` en `run-ci-images / pipeline`.
- [ ] Stap 3: negatieve tests: PR die alleen `README.md` wijzigt → images-job meldt "No changes under: web/**" en slaagt; `stack-file` en `images` allebei leeg → rood "Neither stack-file nor images"; `${MISSING:?}` in het stackbestand zonder `stack-env` → `stack` rood.
- [ ] Stap 4: commit `feat: add ci-images.yml and run-image-smoke`.

### Taak 9: verplichte checks in de voorbeeldrepo (**handwerk**)

- [ ] Stap 1: maak `run-check-pr / pipeline`, `run-ci / pipeline` en `run-ci-images / pipeline` verplicht op `main` en `develop`, bron GitHub Actions, up-to-date verplicht.
- [ ] Stap 2: test: een PR met een rode `lint` is niet te mergen.

### Taak 10: eerste echte repo: template-nextjs-vercel op `ci.yml@v2`

**Bron:** [migratievoorbeelden](naslag/migratievoorbeelden.md#migration). **Handwerk:** branchprotectie van de template volgens de standaard (nu: geen verplichte checks, force push toegestaan).

- [ ] Stap 1: PR in template-nextjs-vercel: `web-ci.yml@main` → `ci.yml@v2` met `checks: lint typecheck test build`, `use-custom-token: true`; `check-pr` naar `@v2` zonder `head-ref`/`base-ref`; `name: Continuous Integration`.
- [ ] Stap 2: verwacht groen; controleer dat de vier scripts echt draaien (log) en dat de duur niet hoger is dan de laatste v1-run.
- [ ] Stap 3: verplichte checks en bescherming zetten; merge.

---

## Plak 2: de gate

Na deze plak slaagt het [testplan](naslag/uitrol-in-detail.md#gate-tests) in de voorbeeldrepo.

### Taak 11: `cd-gate.yml`

**Bestanden:**
- Maak: `.github/workflows/cd-gate.yml` uit het concept-blok, plus de vier aanvullingen uit de Review Focus.

**Interface (gebruikt door elke cd-aanroeper):** inputs `required-workflows` (default `Continuous Integration`), `branch-targets` (default `develop=staging acceptance=acceptance`), `allow-prerelease` (boolean, default `false`); outputs `proceed`, `target`, `sha`; job-id `gate`; permissions `actions: read`, `contents: read`.

- [ ] Stap 1: schrijf de workflow; het script uit het concept, aangevuld met:
  - `release`: `if (p.release.prerelease && !ALLOW_PRERELEASE) return skip('prerelease …')`; tag moet `/^v\d/` matchen, anders `fail('tag must match v*: production only allows those tags')`; `compareCommits({basehead: 'main...' + sha}).status` moet `identical` of `behind` zijn, anders `fail('tag … is not on main')`.
  - `repository_dispatch`: `getBranch` in `try/catch` → `fail('branch … does not exist in this repo')`.
- [ ] Stap 2: haal het script uit de YAML (`python3 -c 'import yaml…'`) en draai `node --check`; `actionlint`.
- [ ] Stap 3: voorbeeldrepo: `.github/workflows/cd.yml` volgens het [voorbeeld in bouwstenen](naslag/bouwstenen.md#gate), met een job `deploy` die geen reusable workflow aanroept maar `runs-on` + `environment: ${{ needs.gate.outputs.target }}` + `run: echo "deploy ${{ needs.gate.outputs.sha }} to ${{ needs.gate.outputs.target }}"`. Environments `staging` (branch `develop`), `production` (tags `v*`, één reviewer) en `acceptance` (branch `acceptance`) aanmaken (**handwerk**).
- [ ] Stap 4: loop de 17 scenario's van het [testplan](naslag/uitrol-in-detail.md#gate-tests) af en noteer per scenario de run-URL in de PR van deze taak. Voeg vier scenario's toe: tag op `develop` → rood "not on main"; prerelease → overgeslagen; tag `1.0.0` → rood "must match v*"; `tms-deploy` met `environment: acceptance` vóór de branch bestaat → rood "does not exist".
- [ ] Stap 5: commit `feat: add cd-gate.yml`.

### Taak 12: gate-documentatie bijwerken

- [ ] Stap 1: zet de concept-YAML van cd-gate gelijk aan het bestand (`allow-prerelease`, de drie extra controles) en neem de vier scenario's op in het testplan.
- [ ] Stap 2: commit `docs: sync cd-gate reference with the implementation`.

---

## Plak 3: CD naar Vercel

Na deze plak deployt template-nextjs-vercel staging en productie via `v2`.

### Taak 13: `deploy-vercel` en `run-codegen`

**Bestanden:**
- Wijzig: `.github/actions/deploy-vercel/action.yml`
- Vervang: `.github/actions/run-codegen/action.yml` door het concept-blok.

**Interface deploy-vercel:** bestaande inputs; `environment != production` → `vercel pull --environment=preview` en `vercel deploy` zonder `--target`; `vercel@<vaste versie>`; nieuwe output `url` (uit de laatste regel van `vercel deploy`); een eerste stap die faalt als `build-mode` niet `github` of `vercel` is. De project-env-sync blijft `preview` voor alles behalve productie.

**Interface run-codegen:** inputs `codegen`, `generated-elsewhere`, `codegen-check`, `codegen-baseline`, `working-directory`; exporteert `CODEGEN_BASELINE`.

- [ ] Stap 1: pas deploy-vercel aan; `actionlint` + `shellcheck`.
- [ ] Stap 2: run-codegen: schrijf de action; test in de voorbeeldrepo met scripts `codegen` (schrijft `generated.ts`), `typecheck`, en `codegen-check` (vergelijkt `$CODEGEN_BASELINE/openapi.json` met `openapi.json` via `cmp`); test: `codegen-check` zonder `codegen-baseline` → rood; ongecommit baseline-bestand → rood; gelijk bestand → groen.
- [ ] Stap 3: commit `feat(actions): preview deploys, pinned CLI and url output in deploy-vercel; new run-codegen`.

### Taak 14: `cd-vercel.yml`

**Bestanden:**
- Maak: `.github/workflows/cd-vercel.yml` uit het concept-blok, zonder de drie `run-translations`-stappen (Taak 21); laat de `tms*`-inputs gedeclareerd.

- [ ] Stap 1: schrijf en lint.
- [ ] Stap 2: test op template-nextjs-vercel (Taak 15), want de voorbeeldrepo heeft geen Vercel-project.
- [ ] Stap 3: commit `feat: add cd-vercel.yml`.

### Taak 15: template-nextjs-vercel op `cd-vercel@v2` (**handwerk** voor de environments)

**Bron:** [migratievoorbeeld Next.js](naslag/migratievoorbeelden.md#migration).

- [ ] Stap 1: environments: `staging` met branch `develop`, `OP_VAULT`/`OP_ITEM`, secrets `VERCEL_TOKEN` en `OP_SERVICE_ACCOUNT_TOKEN`; `production` met tags `v*`, één reviewer, dezelfde variabelen en secrets. Het environment `Preview` verwijderen als het niets meer doet.
- [ ] Stap 2: PR naar `main`: `cd.yml` volgens het voorbeeld, met `health-path: /`. Merge.
- [ ] Stap 3: merge iets naar `develop`; verwacht een groene gate en een preview-deploy met de variabelen van `staging`, health-check groen.
- [ ] Stap 4: publiceer een release; verwacht goedkeuring gevraagd, daarna een `--prod`-deploy.
- [ ] Stap 5: dispatch vanaf die tag; verwacht dezelfde deploy nog eens.

---

## Plak 4: CD naar Swarm

Na deze plak deployen gp-container-tracking-webapp en gp-map-webapp via `v2`.

### Taak 16: `deploy-swarm` met `pre-deploy`

**Bestanden:** wijzig `.github/actions/deploy-swarm/action.yml`: inputs `pre-deploy`, `environment`, `version`; de stap uit [cd.md](naslag/cd.md#cd-swarm) tussen GHCR-login en migraties.

- [ ] Stap 1: schrijf en lint; `shellcheck` op het script met `printf %q`.
- [ ] Stap 2: test komt in Taak 18 op een echte VM; hier alleen een droogtest met `ssh` naar `localhost` op de runner: een script dat `exit 3` doet stopt de stap met exitcode 3 vóór `docker stack deploy`.
- [ ] Stap 3: commit `feat(deploy-swarm): add pre-deploy checks on the manager`.

### Taak 17: `cd-swarm.yml`

**Bestanden:** maak `.github/workflows/cd-swarm.yml` uit het concept-blok (met de `migrate-image`-tag en `working-directory` in de concurrency-groep).

- [ ] Stap 1: schrijf en lint.
- [ ] Stap 2: validatietests in de voorbeeldrepo, zonder VM: `images: []` met `deploy-enabled: false` → rood in `validate`; `images` met één image en `deploy-enabled: false` → build-job bouwt, smoketest draait, push naar GHCR slaagt, deploy overgeslagen.
- [ ] Stap 3: commit `feat: add cd-swarm.yml`.

### Taak 18: gp-container-tracking-webapp en gp-map-webapp op `v2` (**handwerk** voor vars en environments)

**Bron:** [migratievoorbeelden Swarm](naslag/migratievoorbeelden.md#migration). Volgorde: eerst container-tracking (alleen stack), dan gp-map (Postgres, images, migraties).

- [ ] Stap 1: container-tracking: `ci.yml` → één bestand met `run-ci` (ci-images, alleen stack); `cd.yml` met gate + cd-swarm; `VM_SSH_HOST`/`VM_SSH_USER`/`OP_*` op `staging`; `pre-deploy` met de map-controles. Merge naar `develop`; verwacht een deploy op de staging-VM, `health-url` groen.
- [ ] Stap 2: gp-map: `ci.yml` met `run-ci` (turbo, Postgres) en `run-ci-images`; `cd.yml` met gate + cd-swarm met `migrate-image` zonder tag; verplichte checks aanpassen vlak vóór de merge ([job-id's](naslag/uitrol-in-detail.md#job-ids)). Merge naar `develop`; verwacht: build met smoketest, migratie op `:<versie>`, deploy, health groen.
- [ ] Stap 3: release op gp-map; verwacht twee goedkeuringen (build, deploy) en een productiedeploy.

---

## Plak 5: Supabase, CMS, pakketten, Pages

### Taak 19: `cd-supabase.yml` (**handwerk** voor het machine-account)

**Bestanden:** maak `.github/workflows/cd-supabase.yml` uit het concept-blok.

- [ ] Stap 1: machine-account in de Supabase-org (Administrator, 2FA, één eigenaar), PAT aangemaakt, als environment-secret `SUPABASE_ACCESS_TOKEN` op `staging` en `production` van de testrepo met edge functions; `SUPABASE_PROJECT_REF` als variabele per environment.
- [ ] Stap 2: schrijf en lint; validatietests: `migrations: false` + `functions: none` → rood; `function-env-keys: SUPABASE_URL` → rood "provided by the platform"; een naam zonder waarde in het 1Password-item → rood vóór `secrets set`.
- [ ] Stap 3: testrepo: `cd.yml` met gate → `deploy-supabase` (cd-supabase) → `deploy` (cd-vercel) met `needs`. Merge naar `develop`; verwacht: secrets gezet, `db push` zonder wijzigingen, alle functions gedeployd, daarna de app; de waarschuwing voor niet-beheerde secrets in de samenvatting.
- [ ] Stap 4: CI van dezelfde testrepo op `database: supabase` met `checks: dbtest` (het script `"dbtest": "supabase test db"`): verwacht groen met de pgTAP-uitvoer; een PR die niets onder `supabase/` wijzigt → de stack start niet en de job slaagt met "No changes under supabase/"; `checks: dbtest` in een repo zonder `supabase/tests` → rood met `NOTESTS`.
- [ ] Stap 4: commit `feat: add cd-supabase.yml`.

### Taak 20: edge functions typechecken in CI

**Bestanden:** wijzig `ci.yml`: installeer Deno (vaste commit van `denoland/setup-deno`) als `supabase/functions` bestaat, zoals uv bij `pyproject.toml`.

- [ ] Stap 1: schrijf; test in de testrepo met `"typecheck:functions": "deno check supabase/functions"` in `checks`; een opzettelijke typefout → rood.
- [ ] Stap 2: commit `feat(ci): set up Deno when the repo has edge functions`.

### Taak 21: `run-translations` en de CMS-stappen

**Bestanden:**
- Maak: `.github/actions/run-translations/action.yml` (concept-blok).
- Wijzig: `ci.yml` (stap `sync` op `tms-sync-branch`), `cd-vercel.yml` (`ack`, `pull`, `generated-elsewhere: ${{ inputs.tms }}`, `mark-deployed`, `mark-failed`).

**Bron:** `feature/tms-prototype` in deze repo, voor de exacte CLI-aanroepen.

- [ ] Stap 1: schrijf en lint.
- [ ] Stap 2: tms-test op `v2`: CI met `tms-sync-branch: develop`; CD met `tms: true` en `repository_dispatch: [tms-deploy]`. Merge naar `develop`; verwacht `sync` in CI, en in CD `ack` → `pull` → typecheck → deploy → `mark-deployed`. Een `tms-deploy` met `environment: production` vanuit het CMS → rood met de staging-melding.
- [ ] Stap 3: commit `feat: add run-translations and wire the CMS into ci and cd-vercel`.

### Taak 22: `cd-packages.yml`

**Bestanden:** maak `.github/workflows/cd-packages.yml` uit het concept-blok (met de `.npmrc`-overschrijving vóór `publish`).

- [ ] Stap 1: schrijf en lint.
- [ ] Stap 2: voorbeeldrepo: een workspace-pakket `@pursuit-amsterdam/example-lib` met versie `0.1.0`; `cd-packages.yml` met gate (`allow-prerelease: true`) + cd-packages. Release `v0.1.0`: verwacht publicatie onder `latest`; nogmaals dezelfde release → rood "already published"; prerelease `v0.2.0-rc.1` na een versiebump → onder `next`.
- [ ] Stap 3: translations-management op `v2` (**handwerk** voor `packages: write`); eerste echte publicatie.
- [ ] Stap 4: commit `feat: add cd-packages.yml`.

### Taak 23: `cd-pages.yml`

**Bestanden:** maak `.github/workflows/cd-pages.yml`: `storybook-cd.yml` als basis, met `build-command` (default `build-storybook`), `output-directory` (default `storybook-static`), `codegen*`, Node uit `.nvmrc`, job `deploy` in environment `github-pages`, `run-codegen` vóór de build.

- [ ] Stap 1: schrijf en lint.
- [ ] Stap 2: voorbeeldrepo: `pages.yml` met `build-command: build` en `output-directory: dist` (het `build`-script schrijft `dist/index.html`); verwacht een gepubliceerde Pages-site.
- [ ] Stap 3: één storybook-repo op `@v2` zonder extra inputs; verwacht gelijk gedrag aan v1.
- [ ] Stap 4: commit `feat: add cd-pages.yml`.

---

## Plak 6: toetsen, inrichten, migreren

### Taak 24: `scripts/audit-consumers.sh` en `audit-consumers.yml`

**Bestanden:**
- Maak: `scripts/audit-consumers.sh` uit het concept-blok, plus: per environment de branchregels (`deployment_branch_policy`) en of de deploy-secrets op het environment staan en niet ook op de repo; een environment dat bestaat zonder regels is een bevinding (Review Focus 4); repo's die alleen losse actions of alleen cd-pages aanroepen, krijgen alleen de check-pr-, protectie- en Dependabot-controles.
- Maak: `.github/workflows/audit-consumers.yml`: wekelijks en `workflow_dispatch`, environment `audit` (alleen `v2`), GitHub App-token via `actions/create-github-app-token` op vaste commit, draait het script en werkt één issue bij. Let op: `schedule` werkt alleen vanaf de default branch, en dat is tot Taak 28 nog `main`. Tot die tijd start je de audit met `pnpm audit:consumers:remote` (`gh workflow run audit-consumers.yml --ref v2`); `pull_request` en `push` hebben dat probleem niet, dus `self-ci.yml` (Taak 2) draait wél gewoon vanaf `v2`.

- [ ] Stap 1: `pnpm lint`; draai `pnpm audit:consumers -- workflows-example gp-map-webapp template-nextjs-vercel`; verwacht 0 bevindingen voor de eerste twee na Plak 1–4, en een lijst voor de template vóór Taak 15.
- [ ] Stap 2: test Review Focus 4: maak in de voorbeeldrepo een environment `acceptance` zonder regels; verwacht de bevinding "environment acceptance has no deployment branch policy".
- [ ] Stap 3: GitHub App aanmaken met alleen-lezen `administration`, `environments`, `secrets`, `contents`, `metadata`; installeren op de org (**handwerk**); app-id en private key als secrets op environment `audit`.
- [ ] Stap 4: eerste run via `pnpm audit:consumers:remote`; verwacht een issue "Consumer audit" met de tabel. Werkt de dispatch niet omdat het bestand niet op de default branch staat, dan is dat de reden om Taak 28 stap 4 naar voren te halen.
- [ ] Stap 5: commit `feat: add audit-consumers script and weekly workflow`.

### Taak 25: `scripts/setup-consumer.sh`

**Bestanden:** maak `scripts/setup-consumer.sh <repo> [--vercel|--swarm|--supabase]`: maakt environments `integration`, `staging`, `production` (en `acceptance` als de branch bestaat) met de branchregels uit de standaard, zet lege variabelen (`OP_VAULT`, `OP_ITEM`, en per target `VM_SSH_*` of `SUPABASE_PROJECT_REF`), branchprotectie op `main`/`develop` met de verplichte checks, en meldt welke secrets de beheerder nog moet zetten. Idempotent: een tweede run verandert niets.

- [ ] Stap 1: `pnpm lint`; `pnpm setup-consumer -- <verse testrepo>`; daarna `pnpm audit:consumers -- <die repo>`: verwacht alleen bevindingen over secrets en variabelen zonder waarde.
- [ ] Stap 2: tweede run; verwacht geen wijzigingen (vergelijk `gh api` vóór en na).
- [ ] Stap 3: commit `feat: add setup-consumer script`.

### Taak 26: migratiescript

**Bestanden:** maak `scripts/migrate-consumer.sh <repo>`: kloont de repo, herschrijft `.github/workflows/*.yml` volgens de tabellen in [ci.md](naslag/ci.md), [cd.md](naslag/cd.md) en de [migratievoorbeelden](naslag/migratievoorbeelden.md) (`@main` → `@v2`, `run-*` → `checks`, `onepassword_*` weg, twee deploy-jobs → gate + deploy, trigger `push` → `workflow_run`, `head-ref`/`base-ref` weg), draait `setup-consumer.sh`, en opent een PR naar `main` met een checklist van wat handmatig blijft (secrets verplaatsen, `package.json`-scripts, verplichte checks vlak vóór de merge).

- [ ] Stap 1: draai op een kopie van een Vercel-repo met twee deploy-jobs; vergelijk het resultaat met het migratievoorbeeld; `actionlint` op de output.
- [ ] Stap 2: draai op een kopie van gp-groot-automations (Python zonder hoofdschakelaar); verwacht een `backend/package.json` met `lint` en `format` en een waarschuwing in de PR-tekst dat CI rood zal zijn.
- [ ] Stap 3: commit `feat: add migrate-consumer script`.

### Taak 27: README op `v2`, banner op `main`

- [ ] Stap 1: herschrijf `README.md` op `v2`: per workflow en action de inputs uit de naslag, de standaardinrichting, en de drie scripts. Verwijder `framework` uit elk voorbeeld.
- [ ] Stap 2: PR naar `main` (hotfix) met alleen een banner bovenaan de README: "`main` is end of life; nieuwe repo's gebruiken `@v2`, zie docs/v2", en `framework` uit de voorbeelden.
- [ ] Stap 3: commit `docs: rewrite README for v2` en `docs: point main to v2`.

### Taak 28: v1 weg op `v2`

- [ ] Stap 1: verwijder op `v2`: `web-ci.yml`, `backend-ci.yml`, `fullstack-ci.yml`, `web-cd.yml`, `backend-cd.yml`, `vm-cd.yml`, `storybook-cd.yml`, `codegen.yml`, `run-pnpm-build-test`, `run-python-checks`, `run-supabase-test`, `deploy-supabase`; verwijder `head-ref`/`base-ref` uit `check-pr.yml`.
- [ ] Stap 2: `pnpm audit:consumers -- workflows-example gp-map-webapp gp-container-tracking-webapp template-nextjs-vercel tms-test gp-groot-automations translations-management` → 0 bevindingen.
- [ ] Stap 3: commit `chore: remove v1 workflows and actions from v2`.
- [ ] Stap 4 (**handwerk**): zet de default branch van deze repo op `v2`. Consumers merken niets (hun refs zijn expliciet), maar vanaf nu draaien `schedule` en `workflow_dispatch` vanaf `v2`, en toont de Actions-tab de v2-workflows. Verwacht: de eerstvolgende wekelijkse audit draait vanzelf.

---

## "v2 is klaar"

De afspraak geldt als dit allemaal waar is:

- De zeven testrepo's draaien CI en CD op `@v2` en hebben elk via `v2` naar al hun environments gedeployd, met minstens één herdeploy via dispatch vanaf de tag.
- Het gate-testplan (21 scenario's) is in de voorbeeldrepo groen gedraaid en de run-URL's staan in de PR van Taak 11.
- `audit-consumers.sh` geeft 0 bevindingen op de testrepo's.
- De README op `v2` beschrijft elke input; `main` wijst naar `v2`.
- Dependabot heeft minstens één PR op `v2` geopend en die is via de eigen CI gemerged.
- `v2` is de default branch, en de wekelijkse audit heeft minstens één keer vanzelf gedraaid.

Daarna: Taak 26 per repo, in eigen tempo, en de audit als wekelijkse thermometer.

---

[← Overzicht](README.md) · [Uitrol in detail](naslag/uitrol-in-detail.md)
