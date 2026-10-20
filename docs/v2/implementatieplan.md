<a id="plan"></a>

# Implementatieplan workflows v2

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Doel:** de workflows uit het v2-ontwerp bouwen op de branch `v2`, bewijzen op een voorbeeldrepo en zeven testrepo's, en daarna elke repo laten overstappen.

**Aanpak:** in zeven plakken. Elke plak eindigt met iets dat in een echte repo draait, en pas daarna begint de volgende. De concept-YAML in de naslag is het uitgangspunt van elke taak; een taak kopieert het blok, past het aan wat de review heeft bijgesteld, en bewijst het op de voorbeeldrepo. Taken die werk buiten deze repo vragen (environments, secrets, een Supabase-account) staan apart gemarkeerd met **handwerk**, omdat een agent ze niet kan uitvoeren.

**Techniek:** GitHub Actions (reusable workflows, composite actions, `actions/github-script`), bash, `actionlint`, `shellcheck`, `gh`.

**Spec:** [docs/v2](README.md), vooral [beslissingen](beslissingen.md#decided), [ci](naslag/ci.md), [cd](naslag/cd.md), [bouwstenen](naslag/bouwstenen.md), [standaardinrichting](naslag/standaardinrichting.md), [uitrol in detail](naslag/uitrol-in-detail.md) en de [concept-YAML](naslag/concept-yaml.md).

## Stand van zaken (20 oktober 2026)

- **Plak 0 en 1 zijn af** (Task 1–10). `v2` is beschermd en test zichzelf; `ci.yml` en `ci-images.yml` draaien in de voorbeeldrepo, en template-nextjs-vercel draait CI op `ci.yml@v2` met `lint typecheck test build`.
- **Plak 2 is af** (Task 11–12): de gate staat op `v2` en is met 21 scenario's getest.
- **Volgende:** Plak 3, CD naar Vercel (Task 13–15).
- **Bijgesteld onderweg** (zie de taken en [beslissingen](beslissingen.md#decided)): seniors mogen hun eigen PR mergen, een junior laat reviewen door een senior; per beschermde branch twee rulesets (checks zonder bypass, review met bypass voor admins); `ci.yml` telt bij turbo alleen workspace-pakketten en geeft turbo de remote base voor `--affected`; `use-custom-token` zonder secret faalt met een melding.
- **Buiten het plan opgelost:** `@pursuit-amsterdam/jest-config` 1.0.1 (Pursuit-Amsterdam/jest-config#4): `setup.js` laadt weer, peers `@testing-library/jest-dom` en jest 30.
- **Buiten het plan, nog open:**
  - TypeScript 6 laadt `@types/*` niet meer vanzelf; projecten met tests hebben `"types": ["jest", "@testing-library/jest-dom"]` nodig. Kandidaat voor `@pursuit-amsterdam/typescript-config`.
  - `@pursuit-amsterdam/jest-config` declareert `identity-obj-proxy` en `jest-transform-stub` niet, terwijl de `react`-preset ze gebruikt; `ts-jest` 29 wil `typescript <6`.
  - Pursuit-Amsterdam/jest-config heeft 34 Dependabot-meldingen op `main`.

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

1. **Een release op een tag die niet op `main` staat** (per ongeluk getagd op `develop`): de gate vindt een groene push-run op die commit en deployt develop-code naar productie. Verwacht: rood, "tag is not on main". Test in Task 11.
2. **Een prerelease** vuurt ook `release: published`: cd-vercel zou een prerelease naar productie deployen. Verwacht: de gate slaat een prerelease over, tenzij `allow-prerelease: true` (cd-packages, voor de `next`-tag). Test in Task 11.
3. **Een releasetag zonder `v`** (`1.4.0`): de branchregel `v*` van `production` weigert de job met een onduidelijke melding. Verwacht: de gate faalt eerst, met "tag must match v*". Test in Task 11.
4. **Een deploy naar een environment dat nog niet bestaat** (eerste push naar `acceptance`): GitHub maakt het environment aan zonder regels, en de deploy gaat door. Verwacht: het auditscript meldt een environment zonder branchregels, en `setup-consumer.sh` maakt de environments met regels aan vóór de eerste run. Test in Task 24 en 25.
5. **Een CMS-verzoek voor een branch die niet bestaat** (`environment: acceptance` zonder `acceptance`-branch): `getBranch` geeft 404 en de gate valt om met een stacktrace. Verwacht: rood met "branch acceptance does not exist". Test in Task 11.

---

## Plak 0: fundament van `v2`

Na deze plak is `v2` beschermd, test hij zichzelf, en bestaat de voorbeeldrepo.

### Task 1: check-pr kent `v*` en leest het event

**Bestanden:**
- Wijzig: `.github/workflows/check-pr.yml`
- Wijzig: `check-pr.sh`

**Interface:** `check-pr.yml` houdt `workflow_call` en de job-id `pipeline`, maar zonder inputs: `HEAD` en `BASE` komen uit `github.event.pull_request.head.ref` en `.base.ref`. Geen checkout. `head-ref` en `base-ref` blijven tijdelijk gedeclareerd als optioneel en ongebruikt, zodat v1-aanroepers op `@v2` niet met `startup_failure` breken; ze verdwijnen in Task 28.

- [x] Stap 1: voeg in `check-pr.sh` de regels toe: `v[0-9]+` is een geldige head en base; `feature/*`, `hotfix/*` en `revert-<n>-(feature|hotfix)/*` mogen naar `v*`; `v*` zelf mag nergens heen. Zet bovenaan een reeks testgevallen als commentaar: `feature/x → v2 ✅`, `develop → v2 ❌`, `v2 → main ❌`, `v2 → develop ❌`.
- [x] Stap 2: draai `./check-pr.sh` met elk van die vier combinaties in `HEAD`/`BASE` en controleer de exitcode (0, 1, 1, 1).
- [x] Stap 3: zet dezelfde regels in `check-pr.yml`, vervang de inputs door de event-velden, verwijder de checkout.
- [x] Stap 4: `actionlint .github/workflows/check-pr.yml` en `shellcheck check-pr.sh`.
- [x] Stap 5: commit `feat(check-pr): allow v* as base and read head/base from the event`.

### Task 2: eigen CI van deze repo

**Bestanden:**
- Maak: `package.json` (deze repo volgt zijn eigen besluit: de scripts zijn de namen van wat CI en mensen draaien), met `packageManager: pnpm@<huidig>`, `private: true`, en scripts:
  - `lint`: `actionlint && shellcheck check-pr.sh scripts/*.sh`
  - `test`: `scripts/check-pr-cases.sh`
  - `audit:consumers`: `scripts/audit-consumers.sh` (Task 24; argumenten via `pnpm audit:consumers -- gp-map-webapp`; niet `audit`, dat is een ingebouwd pnpm-commando)
  - `audit:consumers:remote`: `gh workflow run audit-consumers.yml --ref v2` (Task 24)
  - `setup-consumer`: `scripts/setup-consumer.sh` (Task 25)
  - `migrate-consumer`: `scripts/migrate-consumer.sh` (Task 26)
  Plus een lege `pnpm-lock.yaml` en `.nvmrc` met `22`. De scripts voor Task 24–26 mogen er nu al in staan; ze falen met "no such file" tot die taak klaar is.
- Maak: `.github/workflows/self-ci.yml` met `name: Continuous Integration`, trigger `pull_request` en `push` op `v2`, één job `pipeline`.
- Maak: `scripts/check-pr-cases.sh`: draait `check-pr.sh` voor een tabel van `HEAD BASE verwacht` en faalt bij één afwijking.

**Interface:** de check heet `pipeline` (job-id), dus de verplichte check in Task 3 is `pipeline`. Lokaal en in CI is het commando hetzelfde: `pnpm lint` en `pnpm test`.

- [x] Stap 1: schrijf `scripts/check-pr-cases.sh` met minstens de vier gevallen van Task 1 plus de bestaande regels (`feature/x → develop ✅`, `hotfix/x → main ✅`, `feature/x → main ❌`, `develop → acceptance ✅`). Het script zet `HEAD`/`BASE` via `sed` in een kopie van `check-pr.sh` in `$RUNNER_TEMP` en vergelijkt de exitcode.
- [x] Stap 2: draai het lokaal; verwacht `8 cases, 0 failures`.
- [x] Stap 3: `self-ci.yml`: checkout, `pnpm/action-setup` op vaste commit, actionlint installeren via het downloadscript van rhysd op een vaste commit (`shellcheck` staat op de runner), dan `pnpm lint` en `pnpm test`. Een `.github/actionlint.yaml` met het Blacksmith-label onder `self-hosted-runner.labels`, zodat `pnpm lint` schoon is.
- [x] Stap 4: open de PR naar `v2`; verwacht één groene check `pipeline`.
- [x] Stap 5: commit `ci: lint workflows and test check-pr on every PR`.

### Task 3: bescherming van `v2` (**handwerk**)

**Bron:** [uitrol in detail, Bescherming van v2](naslag/uitrol-in-detail.md#rollout).

- [x] Stap 1: `CODEOWNERS` in `.github/` met `/.github/ @Pursuit-Amsterdam/platform` en `/scripts/ @Pursuit-Amsterdam/platform` (team naar keuze; één regel per pad).
- [x] Stap 2: `.github/dependabot.yml` met `package-ecosystem: github-actions`, `target-branch: v2`, wekelijks.
- [x] Stap 3: ruleset in de repo-instellingen voor `refs/heads/v*`: PR verplicht, 1 review, code-owner-review, verplichte check `pipeline` (bron: GitHub Actions), geen force push, geen delete.
- [x] Stap 4: test: een push rechtstreeks naar `v2` wordt geweigerd; een PR zonder groene `pipeline` is niet te mergen.
- [x] Stap 5: commit `chore: add CODEOWNERS and Dependabot for v2`.

### Task 4: de voorbeeldrepo `workflows-example` (**handwerk** voor het aanmaken)

**Repo:** `Pursuit-Amsterdam/workflows-example`, privé, branches `main` en `develop`, default `main`.

**Inhoud (Task 4 maakt de basis; latere taken voegen toe):**
- `package.json` met `packageManager: pnpm@<huidig>`, scripts `lint`, `typecheck`, `test`, `build` die elk `node -e "console.log('<naam> ok')"` doen; `pnpm-lock.yaml`; `.nvmrc` met `22`.
- `backend/pyproject.toml` (naam `example-backend`, geen dependencies), `backend/uv.lock`, `backend/.python-version` met `3.12`, `backend/package.json` met `"lint": "uv run python -c 'print(1)'"`.
- `.github/workflows/check-pr.yml` dat `check-pr.yml@v2` aanroept vanuit job `run-check-pr`, op `pull_request` met `types: [opened, synchronize, reopened, edited]`.
- `README.md`: "Dit is de testrepo van Pursuit-Amsterdam/workflows; elke workflow op v2 wordt hier eerst bewezen."

- [x] Stap 1: maak de repo en de bestanden; branchprotectie op `main` en `develop` volgens de [standaardinrichting](naslag/standaardinrichting.md#consumer-config), nog zonder verplichte CI-check (die komt in Task 9).
- [x] Stap 2: open een PR `feature/hello → develop`; verwacht `run-check-pr / pipeline` groen.
- [x] Stap 3: open een PR `feature/hello → main`; verwacht rood.

---

## Plak 1: CI

Na deze plak draait `ci.yml@v2` in de voorbeeldrepo en in template-nextjs-vercel.

### Task 5: bestaande actions op orde

**Bestanden:**
- Wijzig: `.github/actions/setup-node-pnpm/action.yml`
- Wijzig: `.github/actions/setup-python/action.yml`
- Wijzig: `.github/actions/setup-onepassword/action.yml`, `setup-version`, `run-docker-build-push`, `deploy-vercel`, `deploy-swarm`, `run-supabase-test` (alleen pinnen)

**Interface:** `setup-node-pnpm` krijgt input `working-directory` (default `.`); de install wordt `pnpm install --frozen-lockfile` in die map; `.npmrc` wordt in die map geschreven. `setup-python` draait `uv sync --frozen`. Bestaande inputnamen en outputs blijven.

- [x] Stap 1: pin elke `uses:` in alle bestaande actions op een commit met versiecommentaar (`pnpm/action-setup`, `actions/setup-node`, `astral-sh/setup-uv`, `1password/*`, `supabase/setup-cli`, `docker/*`).
- [x] Stap 2: voeg `working-directory` toe aan `setup-node-pnpm` en zet `--frozen-lockfile`; `uv sync --frozen` in `setup-python`.
- [x] Stap 3: `actionlint`; verwacht alleen de runnerlabel-waarschuwing.
- [x] Stap 4: test in de voorbeeldrepo met een tijdelijke workflow die `setup-node-pnpm@feature/<taak>` aanroept met `working-directory: backend`; verwacht een install zonder fout en een `.npmrc` in `backend/`. Verwijder de tijdelijke workflow weer.
- [x] Stap 5: commit `feat(actions): pin external actions, frozen installs, working-directory for pnpm`.

### Task 6: `setup-services` en `setup-supabase`

**Bestanden:**
- Maak: `.github/actions/setup-services/action.yml` uit het [concept](naslag/concept-yaml.md) (blok `setup-services`).
- Maak: `.github/actions/setup-supabase/action.yml`: de stappen `Check for Supabase directory changes` tot en met `Start Supabase local services` uit `run-supabase-test/action.yml`, plus outputs `started`, `db-url`, `api-url`, `anon-key`, `service-role-key`, en een stap die `DATABASE_URL`, `SUPABASE_URL`, `SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY` naar `$GITHUB_ENV` schrijft. CLI-versie: `supabase/setup-cli` zonder `version`, met een voorafgaande stap die faalt als `supabase` geen devDependency in `package.json` is.

**Interface (gebruikt door Task 7, 8, 15, 18, 20):** inputs `database`, `redis`, `supabase-seed`, `supabase-skip-unchanged`, `postgres-*`, `onepassword-vault`, `onepassword-item`, `onepassword-token`, `onepassword-export-for-vercel`, `onepassword-export-build-args`; outputs `database-url`, `supabase-started`, `build-args`.

- [x] Stap 1: schrijf beide actions; `actionlint` + `shellcheck` op de scripts erin.
- [x] Stap 2: test in de voorbeeldrepo met een tijdelijke workflow: `database: postgres` → `psql "$DATABASE_URL" -c 'select 1'` slaagt; `redis: true` → `redis-cli -u "$REDIS_URL" ping` geeft `PONG`; `database: banana` → de validatiestap faalt met de melding; `onepassword-item: x` zonder vault → faalt vóór er iets gestart is.
- [x] Stap 3: commit `feat(actions): add setup-services and split setup-supabase from run-supabase-test`.

### Task 7: `ci.yml`

**Bestanden:**
- Maak: `.github/workflows/ci.yml` uit het concept-blok `ci.yml`, met `working-directory` doorgegeven aan `setup-node-pnpm`.

**Interface:** inputs volgens [ci.md](naslag/ci.md#ci); job-id `pipeline`; secrets `OP_SERVICE_ACCOUNT_TOKEN`, `CUSTOM_GITHUB_TOKEN`, `TMS_URL`, `TMS_API_KEY` optioneel. De `tms-sync`-stap komt in Task 21; laat de input gedeclareerd en de stap weg.

- [x] Stap 1: schrijf `ci.yml`; `actionlint`.
- [x] Stap 2: voorbeeldrepo: `.github/workflows/ci.yml` met `name: Continuous Integration`, trigger `push` op `main`/`develop` en `pull_request`, job `run-ci` → `ci.yml@feature/<taak>` met `checks: lint typecheck test`. Verwacht groen, met in de log de drie `ok`-regels en `Setup Python (uv)` uitgevoerd (de `backend/pyproject.toml`).
- [x] Stap 3: negatieve tests, elk één commit op een PR-branch van de voorbeeldrepo: `checks: ""` → rood "checks is empty"; `checks: lint nonexistent` → rood met `nonexistent` in de melding; `working-directory: nope` → rood "no package.json".
- [x] Stap 4: turbo-test: voeg in de voorbeeldrepo `turbo.json` en `pnpm-workspace.yaml` met `packages: [backend]` toe op een PR-branch; verwacht `pnpm turbo run … --affected` in de log en alleen het gewijzigde pakket. Houd dit in de repo (de voorbeeldrepo is vanaf nu een monorepo, met pakketten `web/` en `backend/` en root-scripts die naar turbo doorgeven). "Alleen het gewijzigde pakket" toets je met een PR die alleen `web/` wijzigt, ná de merge van de turbo-opzet: een PR die de root wijzigt, maakt alle pakketten affected. Gevonden en gerepareerd tijdens deze stap: een check die alleen als root-doorgeefscript bestaat, draaide nul taken en werd groen; nu telt `ci.yml` alleen workspace-pakketten plus `//#<taak>` uit `turbo.json`. En: `--affected` filterde in eerste instantie niet, omdat turbo in Actions `GITHUB_BASE_REF` als lokale branch zoekt; `ci.yml` zet nu `TURBO_SCM_BASE=origin/<base>`.
- [x] Stap 5: zet de ref in de voorbeeldrepo op `@v2` zodra de PR gemerged is; commit in deze repo `feat: add ci.yml, the one CI workflow for every repo`.

### Task 8: `run-image-smoke` en `ci-images.yml`

**Bestanden:**
- Maak: `.github/actions/run-image-smoke/action.yml` (concept-blok).
- Maak: `.github/workflows/ci-images.yml` (concept-blok, met `build-env` en de merge-base-vergelijking).

**Interface:** inputs volgens [ci.md](naslag/ci.md#ci-images); jobs `stack`, `images`, `pipeline`.

- [x] Stap 1: voorbeeldrepo krijgt `docker-stack.base.yml` (één service `web`, image `${WEB_IMAGE:?}`), `web/Dockerfile` (`FROM python:3.12-alpine@sha256:…`, `CMD python -m http.server 8080`), en in `ci.yml` een tweede job `run-ci-images` → `ci-images.yml@feature/<taak>` met `stack-file`, `stack-env: WEB_IMAGE=example`, en één image met `port: 8080`, `health-path: /`, `paths: [web/**]`.
- [x] Stap 2: verwacht: `stack` groen, `images` groen met "healthy: /", `pipeline` groen; twee checks `run-ci / pipeline` en `run-ci-images / pipeline`.
- [x] Stap 3: negatieve tests: PR die alleen `README.md` wijzigt → images-job meldt "No changes under: web/**" en slaagt; `stack-file` en `images` allebei leeg → rood "Neither stack-file nor images"; `${MISSING:?}` in het stackbestand zonder `stack-env` → `stack` rood.
- [x] Stap 4: commit `feat: add ci-images.yml and run-image-smoke`.

### Task 9: verplichte checks in de voorbeeldrepo (**handwerk**)

- [x] Stap 1: maak `run-check-pr / pipeline`, `run-ci / pipeline` en `run-ci-images / pipeline` verplicht op `main` en `develop`, bron GitHub Actions, up-to-date verplicht.
- [x] Stap 2: test: een PR met een rode `lint` is niet te mergen, ook niet met `--admin`. Daarvoor staan de checks in een eigen ruleset zonder bypass; de review staat in een tweede ruleset waarin admins (seniors) hem mogen overslaan.

### Task 10: eerste echte repo: template-nextjs-vercel op `ci.yml@v2`

**Bron:** [migratievoorbeelden](naslag/migratievoorbeelden.md#migration). **Handwerk:** branchprotectie van de template volgens de standaard (nu: geen verplichte checks, force push toegestaan).

- [x] Stap 1: PR in template-nextjs-vercel: `web-ci.yml@main` → `ci.yml@v2` met `checks: lint typecheck test build` (eerst zonder `test`, zie hieronder), `use-custom-token: true`; `check-pr` naar `@v2` zonder `head-ref`/`base-ref`; `name: Continuous Integration`.
- [x] Stap 2: verwacht groen; controleer dat de scripts echt draaien (log). Er was geen v1-run om de duur mee te vergelijken: de v1-CI was sinds februari rood bij de install.
- [x] Stap 3: verplichte checks en bescherming zetten; merge.

Gevonden in de template:

- PR #24: `CUSTOM_GITHUB_TOKEN` ontbrak, waardoor de install al sinds februari met een 403 faalde; daarna een echte lintfout (importvolgorde). `test` bleef eerst buiten `checks`: de template had geen tests, en `@pursuit-amsterdam/jest-config` 1.0.0 kon zijn eigen `setup.js` (ESM in `node_modules`) niet laden.
- Pursuit-Amsterdam/jest-config#4, gepubliceerd als 1.0.1: `setup.js` in CommonJS, `@testing-library/jest-dom` als peer, jest 30 toegestaan.
- PR #25: jest-config 1.0.1, `@testing-library/{react,dom,jest-dom}`, `@types/jest`, een starttest voor `page.tsx`, en `"types": ["jest", "@testing-library/jest-dom"]` in `tsconfig.json` (TypeScript 6 laadt `@types` niet meer vanzelf). `test` staat weer in `checks`; de push-run op `main` is groen met 2 tests.


---

## Plak 2: de gate

Na deze plak slaagt het [testplan](naslag/uitrol-in-detail.md#gate-tests) in de voorbeeldrepo.

### Task 11: `cd-gate.yml`

**Bestanden:**
- Maak: `.github/workflows/cd-gate.yml` uit het concept-blok, plus de vier aanvullingen uit de Review Focus.

**Interface (gebruikt door elke cd-aanroeper):** inputs `required-workflows` (default `Continuous Integration`), `branch-targets` (default `develop=staging acceptance=acceptance`), `allow-prerelease` (boolean, default `false`); outputs `proceed`, `target`, `sha`; job-id `gate`; permissions `actions: read`, `contents: read`.

- [x] Stap 1: schrijf de workflow; het script uit het concept, aangevuld met:
  - `release`: `if (p.release.prerelease && !ALLOW_PRERELEASE) return skip('prerelease …')`; tag moet `/^v\d/` matchen, anders `fail('tag must match v*: production only allows those tags')`; `compareCommits({basehead: 'main...' + sha}).status` moet `identical` of `behind` zijn, anders `fail('tag … is not on main')`.
  - `repository_dispatch`: `getBranch` in `try/catch` → `fail('branch … does not exist in this repo')`.
- [x] Stap 2: haal het script uit de YAML (`python3 -c 'import yaml…'`) en draai `node --check`; `actionlint`.
- [x] Stap 3: voorbeeldrepo: `.github/workflows/cd.yml` volgens het [voorbeeld in bouwstenen](naslag/bouwstenen.md#gate), met een job `deploy` die geen reusable workflow aanroept maar `runs-on` + `environment: ${{ needs.gate.outputs.target }}` + `run: echo "deploy ${{ needs.gate.outputs.sha }} to ${{ needs.gate.outputs.target }}"`. Environments `staging` (branch `develop`), `production` (tags `v*`) en `acceptance` (branch `acceptance`) aanmaken, plus de branch `acceptance` en de tag-ruleset op `v*` (alleen admins). Gedaan op 20 oktober; verplichte reviewers kunnen niet op het Team-plan.
- [x] Stap 4: loop 21 scenario's af en noteer per scenario de run-id: de 17 uit het [testplan](naslag/uitrol-in-detail.md#gate-tests) (S1–S17) plus vier nieuwe (S18–S21, Task 12 zet ze in het testplan): tag op `develop` → rood "not on main"; prerelease → overgeslagen; tag `1.0.0` → rood "must match v*"; `tms-deploy` met `environment: acceptance` vóór de branch bestaat → rood "does not exist".
- [x] Stap 5: commit `feat: add cd-gate.yml`. (PR #45, gemerged; de voorbeeldrepo gebruikt nu `cd-gate.yml@v2`, run 39400403750.)

Voortgang stap 4 (scenario's in workflows-example, run-id's):

- [x] S1 merge naar `develop` → `workflow_run` → staging op de merge-commit — 39395523841
- [x] S2 CI afgebroken → CD overgeslagen (grijs); CI re-run groen → staging — 39397368935, 39397533319
- [x] S3 PR geopend → geen CD-run
- [x] S4 merge naar `main` → CI groen, geen CD-run
- [x] S5 release `v0.1.0` op groene `main` → productie — 39395710059
- [x] S6 release vóór CI klaar → rood "CI not finished"; re-run na groene CI → productie — 39396424750
- [x] S7 handmatig vanaf de tag van de nieuwste release → productie — 39395784079
- [x] S8 handmatig vanaf een oudere tag → rood "not the latest release" — 39396611026
- [x] S9 handmatig vanaf `develop` → staging — 39393426886; vanaf `main` → rood — 39393838510
- [x] S10 handmatig vanaf `feature/x` → rood "no environment for branch" — 39393504131
- [x] S11 twee CI-workflowbestanden, beide groen → precies één deploy; de eerst klare slaat over ("still running … its completion starts its own gate") — 39398626512, 39398676195
- [x] S12 twee CI-workflowbestanden, één rood → geen deploy: één run grijs, één met waarschuwing "CI Second did not succeed" — 39398963648, 39399020028
- [x] S13 `required-workflows` met een naam die niet bestaat → rood "no push run of 'Does Not Exist'" — 39397860099
- [x] S14 `tms-deploy` staging → staging op de head van `develop` — 39393768869
- [x] S15 `tms-deploy` production → rood — 39393605452
- [x] S16 `tms-validate` → overgeslagen — 39393655791
- [x] S17 gate op een `push`-event → rood "unsupported event 'push'" — 39397820238
- [x] S18 release-tag op een `develop`-commit → rood "not on main" — 39396952585
- [x] S19 prerelease → overgeslagen — 39397004378
- [x] S20 tag `1.0.0` zonder `v` → rood "must match v*" — 39397052697
- [x] S21 `tms-deploy` acceptance zonder branch → rood "does not exist" — 39397147338

Gevonden tijdens stap 3 en 4:

- Verplichte reviewers op een environment bestaan voor privé-repo's alleen in Enterprise; productie is daarom senior-only via een tag-ruleset op `v*` ([besloten](beslissingen.md#decided)).
- De branchregel van een environment toetst de ref van de run. Bij `workflow_run` en `repository_dispatch` is dat altijd de default branch (`main`), dus "staging: alleen `develop`" blokkeerde de gewone deploy na een merge en het CMS (eerste S14-poging: "Branch main is not allowed to deploy to staging"). `staging` en `acceptance` laten daarom ook `main` toe: die runs draaien de beschermde `cd.yml` van `main`, en welke commit live gaat bepaalt de gate.


### Task 12: gate-documentatie bijwerken

- [x] Stap 1: zet de concept-YAML van cd-gate gelijk aan het bestand (`allow-prerelease`, de drie extra controles) en neem de vier scenario's op in het testplan.
- [x] Stap 2: commit `docs: sync cd-gate reference with the implementation`.

---

## Plak 3: CD naar Vercel

Na deze plak deployt template-nextjs-vercel staging en productie via `v2`.

### Task 13: `run-codegen` en `deploy-vercel`

Twee aparte PR's: beide zitten in CD, maar ze hebben verder niets met elkaar te maken.

#### Task 13a: `run-codegen`

**Bestanden:** vervang `.github/actions/run-codegen/action.yml` door het concept-blok.

**Interface:** inputs `codegen`, `generated-elsewhere`, `codegen-check`, `codegen-baseline`, `working-directory`; exporteert `CODEGEN_BASELINE`.

- [x] Stap 1: schrijf de action (commit `feat(actions): new run-codegen: repo script, typecheck, compare with the committed spec`).
- [x] Stap 2: test in de voorbeeldrepo (tijdelijke PR workflows-example#32) met scripts `codegen` (schrijft `openapi.json` en `generated.ts`), `typecheck` en `codegen-check` (vergelijkt `$CODEGEN_BASELINE/openapi.json` met `openapi.json` via `cmp`). Eerst met de oude action: alle vier rood. Met de nieuwe, run 39401169158:
  - [x] `codegen-check` zonder `codegen-baseline` → geweigerd;
  - [x] baseline-bestand niet gecommit → geweigerd;
  - [x] gewijzigde spec → `cmp` faalt;
  - [x] gelijke spec → groen.
- [x] Stap 3: PR naar `v2` (#47), gemerged op groene `pipeline`; workflows-example#32 gesloten, branch verwijderd.

#### Task 13b: `deploy-vercel`

**Bestanden:** wijzig `.github/actions/deploy-vercel/action.yml`.

**Interface:** bestaande inputs; `environment != production` → `vercel pull --environment=preview` en `vercel deploy` zonder `--target`; `vercel@<vaste versie>`; nieuwe output `url` (uit de laatste regel van `vercel deploy`); een eerste stap die faalt als `build-mode` niet `github` of `vercel` is. De project-env-sync blijft `preview` voor alles behalve productie.

- [x] Stap 1: pas deploy-vercel aan; `actionlint` + `shellcheck`. Getest met `scripts/deploy-vercel-cases.sh` (in `pnpm test`): de `run:`-scripts van de action draaien tegen een nep-`vercel` op `PATH`. Tegen de oude action 19 rood, tegen de nieuwe 32 groen.
  - Bijgesteld: alle `${{ inputs.* }}` in de scripts staan nu in `env:`, zodat de test ze kan draaien.
  - Bijgesteld: nieuwe input `working-directory` (standaard `.`). cd-vercel (Task 14) heeft hem nodig: de `defaults.run.working-directory` van een job bereikt de stappen van een composite action niet.
  - CLI vast op `vercel@62.5.0` (6 oktober 2026, de nieuwste van minstens twee weken oud).
- [x] Stap 3 (bijgesteld 20 oktober 2026): alleen `staging` (preview) en `production` (`--prod`); elke andere `environment`, ook `acceptance` of een typfout, faalt in de eerste stap. Eerst "alles behalve production wordt preview", maar besloten is alleen develop → preview. Test: 3 nieuwe gevallen rood, daarna alles groen.
- [x] Stap 2: commit `feat(actions): preview deploys, pinned CLI and url output in deploy-vercel`; PR naar `v2` (#48), gemerged op groene `pipeline`.

### Task 14: `cd-vercel.yml`

**Bestanden:**
- Maak: `.github/workflows/cd-vercel.yml` uit het concept-blok, zonder de drie `run-translations`-stappen (Task 21); laat de `tms*`-inputs gedeclareerd.

- [x] Stap 1: schrijf en lint.
  - Bijgesteld: de validatie staat in een eigen job `validate` vóór `deploy`, en weigert naast een onbekende `build-mode` ook een `environment` anders dan `staging` of `production`. Een job die een niet-bestaand environment noemt, maakt het aan, zonder branchregels of secrets; een check in die job zelf komt dus te laat.
  - Bijgesteld: het concept heeft vier `run-translations`-stappen (ack, pull, mark-deployed, mark-failed), niet drie; alle vier eruit. `tms: true` faalt in `validate` tot Task 21: zonder die stappen zou de deploy zonder gepubliceerde vertalingen gaan en het CMS niets horen.
- [x] Stap 2: getest op pursuit-website-2025 (de template heeft geen Vercel-project), met een tijdelijke aanroeper op een feature-branch: `environment: staging`, de bestaande 1Password-vault, `health-path: /`. Run 39406268739: groen; `vercel pull --environment=preview`, secrets in `.vercel/.env.preview.local`, preview-deploy, output `url`, health-check 200. Branch daarna verwijderd.
  - Bevinding: de v1-deploy van die site gaf `--target=staging` mee en dat werkte, dus het Vercel-project heeft een custom environment `staging`. Besloten (20 oktober 2026): staging op Vercel ís dat custom environment, met een eigen URL voor `develop`; Vercel-projecten veranderen niet.
- [x] Stap 4: deploy-vercel terug naar `--environment=staging` en `--target=staging` voor staging; docs bijgewerkt (#51). Test eerst: 5 staging-gevallen rood, daarna alles groen. Opnieuw getest op pursuit-website-2025 via `cd-vercel@v2`, op de head van `develop`: run 39410478488 groen, secrets in `.vercel/.env.staging.local`, health-check 200. Tijdelijke branch verwijderd.
- [x] Stap 3: commit `feat: add cd-vercel.yml`.

### Task 15: pursuit-website-2025 op `v2` (eerste echte Vercel-migratie)

**Bron:** [migratievoorbeeld Next.js](naslag/migratievoorbeelden.md#migration) en de [standaardinrichting](naslag/standaardinrichting.md#consumer-config). Eerst bedoeld voor template-nextjs-vercel, maar die heeft geen Vercel-project (20 oktober 2026). pursuit-website-2025 hangt niet aan het vertalingen-CMS, dus de ontbrekende `tms`-stappen spelen geen rol. `setup-consumer.sh` bestaat nog niet (Task 25): de inrichting gaat met `gh`.

Een nieuw CD-bestand werkt pas als het op `main` staat: `workflow_run` en `release` lezen de workflow van de default branch. `develop` loopt niet voor op `main`, dus de PR `develop` → `main` bevat alleen de migratie; een merge naar `main` deployt niets.

- [x] Stap 1: inrichting (v1 blijft ermee werken): `Staging` mag vanaf `develop` en `main`, `Production` alleen vanaf tags `v*`; `OP_VAULT`/`OP_ITEM` op beide; tag-ruleset op `v*` (alleen admins).
- [x] Stap 2: PR naar `develop` (pursuit-website-2025#106): CI op `ci.yml@v2` (`checks: lint typecheck test build`, `use-custom-token`, triggers volgens de standaard), check-pr op `@v2`, CD met gate + `cd-vercel@v2` (`branch-targets: develop=staging`, `health-path: /`), `CODEOWNERS`. CI groen: lint, typecheck, test (de site heeft geen tests: `--passWithNoTests`) en build, zonder de staging-secrets die v1-CI laadde; gemerged.
- [x] Stap 3: PR `develop` → `main` (#107); gemerged. De Storybook-deploy (v1) op die commit is rood, maar faalt al sinds 6 augustus: los van de migratie.
- [x] Stap 4: CD handmatig starten vanaf `develop`; run 39415892050: gate `workflow_dispatch -> staging @ d81cdf9`, deploy naar het custom environment `staging`, health-check 200.
- [x] Stap 5: branchbescherming: per branch (`main`, `develop`) twee rulesets met `run-check-pr / pipeline` en `run-ci / pipeline`; klassieke protectie weg. Voorheen: geen verplichte checks, force push toegestaan op `develop`, geen code-owner-review.
  - Bijgesteld: up-to-date uit op `main` (ook in de voorbeeldrepo en de standaard). De eerste PR `develop` → `main` (#109) stond op "out-of-date", en "Update branch" werd geweigerd: dat zet een merge-commit rechtstreeks op de beschermde `develop`. Met merge-commits loopt `develop` na elke release achter op `main`; de gate eist toch al groene CI op de releasecommit.
- [x] Storybook-deploy verwijderd (pursuit-website-2025#108): Storybook wordt in deze repo niet gebruikt, de deploy faalde sinds 6 augustus. Die merge gaf de eerste automatische staging-deploy via `workflow_run`: run 39418492212, gate `workflow_run -> staging @ b38c0ba`, health-check 200.
- [x] Stap 6: release v2026.10.20 door een senior. De eerste CD-run faalde: de release was 17 seconden vóór CI op `main` klaar gepubliceerd, en de gate wachtte niet. Na een re-run: run 39419766766, gate `release -> production @ bbe519c`, `--prod`-deploy, health-check 200.
  - Bijgesteld: de gate wacht bij een release of een handmatige start op CI die nog loopt (elke 30 seconden, hooguit `ci-wait-minutes`, standaard 20; een run die nog niet bestaat krijgt 2 minuten; een gefaalde run faalt meteen). Na `workflow_run` verandert niets.
  - [ ] Test in de voorbeeldrepo: release v0.3.0 direct na de merge naar `main`; verwacht "Waiting for CI" en daarna een deploy.
- Nog open, buiten deze stappen:
  - `VERCEL_TOKEN` en `VERCEL_ORG_ID` staan op org-niveau; de standaard wil `VERCEL_TOKEN` als environment-secret op `Staging` en `Production` (handwerk: de waarde).
  - Environmentnamen met hoofdletters (`Staging`, `Production`); GitHub negeert hoofdletters, hernoemen kan niet zonder de secrets opnieuw te zetten.
  - Het lege environment `Preview` kan weg.
  - Geen `dependabot.yml`.

---

## Plak 4: CD naar Swarm

Na deze plak deployen gp-container-tracking-webapp en gp-map-webapp via `v2`.

### Task 16: `deploy-swarm` met `pre-deploy`

**Bestanden:** wijzig `.github/actions/deploy-swarm/action.yml`: inputs `pre-deploy`, `environment`, `version`; de stap uit [cd.md](naslag/cd.md#cd-swarm) tussen GHCR-login en migraties.

- [ ] Stap 1: schrijf en lint; `shellcheck` op het script met `printf %q`.
- [ ] Stap 2: test komt in Task 18 op een echte VM; hier alleen een droogtest met `ssh` naar `localhost` op de runner: een script dat `exit 3` doet stopt de stap met exitcode 3 vóór `docker stack deploy`.
- [ ] Stap 3: commit `feat(deploy-swarm): add pre-deploy checks on the manager`.

### Task 17: `cd-swarm.yml`

**Bestanden:** maak `.github/workflows/cd-swarm.yml` uit het concept-blok (met de `migrate-image`-tag en `working-directory` in de concurrency-groep).

- [ ] Stap 1: schrijf en lint.
- [ ] Stap 2: validatietests in de voorbeeldrepo, zonder VM: `images: []` met `deploy-enabled: false` → rood in `validate`; `images` met één image en `deploy-enabled: false` → build-job bouwt, smoketest draait, push naar GHCR slaagt, deploy overgeslagen.
- [ ] Stap 3: commit `feat: add cd-swarm.yml`.

### Task 18: gp-container-tracking-webapp en gp-map-webapp op `v2` (**handwerk** voor vars en environments)

**Bron:** [migratievoorbeelden Swarm](naslag/migratievoorbeelden.md#migration). Volgorde: eerst container-tracking (alleen stack), dan gp-map (Postgres, images, migraties).

- [ ] Stap 1: container-tracking: `ci.yml` → één bestand met `run-ci` (ci-images, alleen stack); `cd.yml` met gate + cd-swarm; `VM_SSH_HOST`/`VM_SSH_USER`/`OP_*` op `staging`; `pre-deploy` met de map-controles. Merge naar `develop`; verwacht een deploy op de staging-VM, `health-url` groen.
- [ ] Stap 2: gp-map: `ci.yml` met `run-ci` (turbo, Postgres) en `run-ci-images`; `cd.yml` met gate + cd-swarm met `migrate-image` zonder tag; verplichte checks aanpassen vlak vóór de merge ([job-id's](naslag/uitrol-in-detail.md#job-ids)). Merge naar `develop`; verwacht: build met smoketest, migratie op `:<versie>`, deploy, health groen.
- [ ] Stap 3: release op gp-map door een senior; verwacht build, smoketest, push en een productiedeploy.

---

## Plak 5: Supabase, CMS, pakketten, Pages

### Task 19: `cd-supabase.yml` (**handwerk** voor het machine-account)

**Bestanden:** maak `.github/workflows/cd-supabase.yml` uit het concept-blok.

- [ ] Stap 1: machine-account in de Supabase-org (Administrator, 2FA, één eigenaar), PAT aangemaakt, als environment-secret `SUPABASE_ACCESS_TOKEN` op `staging` en `production` van de testrepo met edge functions; `SUPABASE_PROJECT_REF` als variabele per environment.
- [ ] Stap 2: schrijf en lint; validatietests: `migrations: false` + `functions: none` → rood; `function-env-keys: SUPABASE_URL` → rood "provided by the platform"; een naam zonder waarde in het 1Password-item → rood vóór `secrets set`.
- [ ] Stap 3: testrepo: `cd.yml` met gate → `deploy-supabase` (cd-supabase) → `deploy` (cd-vercel) met `needs`. Merge naar `develop`; verwacht: secrets gezet, `db push` zonder wijzigingen, alle functions gedeployd, daarna de app; de waarschuwing voor niet-beheerde secrets in de samenvatting.
- [ ] Stap 4: CI van dezelfde testrepo op `database: supabase` met `checks: dbtest` (het script `"dbtest": "supabase test db"`): verwacht groen met de pgTAP-uitvoer; een PR die niets onder `supabase/` wijzigt → de stack start niet en de job slaagt met "No changes under supabase/"; `checks: dbtest` in een repo zonder `supabase/tests` → rood met `NOTESTS`.
- [ ] Stap 4: commit `feat: add cd-supabase.yml`.

### Task 20: edge functions typechecken in CI

**Bestanden:** wijzig `ci.yml`: installeer Deno (vaste commit van `denoland/setup-deno`) als `supabase/functions` bestaat, zoals uv bij `pyproject.toml`.

- [ ] Stap 1: schrijf; test in de testrepo met `"typecheck:functions": "deno check supabase/functions"` in `checks`; een opzettelijke typefout → rood.
- [ ] Stap 2: commit `feat(ci): set up Deno when the repo has edge functions`.

### Task 21: `run-translations` en de CMS-stappen

**Bestanden:**
- Maak: `.github/actions/run-translations/action.yml` (concept-blok).
- Wijzig: `ci.yml` (stap `sync` op `tms-sync-branch`), `cd-vercel.yml` (`ack`, `pull`, `generated-elsewhere: ${{ inputs.tms }}`, `mark-deployed`, `mark-failed`).

**Bron:** `feature/tms-prototype` in deze repo, voor de exacte CLI-aanroepen.

- [ ] Stap 1: schrijf en lint.
- [ ] Stap 2: tms-test op `v2`: CI met `tms-sync-branch: develop`; CD met `tms: true` en `repository_dispatch: [tms-deploy]`. Merge naar `develop`; verwacht `sync` in CI, en in CD `ack` → `pull` → typecheck → deploy → `mark-deployed`. Een `tms-deploy` met `environment: production` vanuit het CMS → rood met de staging-melding.
- [ ] Stap 3: commit `feat: add run-translations and wire the CMS into ci and cd-vercel`.

### Task 22: `cd-packages.yml`

**Bestanden:** maak `.github/workflows/cd-packages.yml` uit het concept-blok (met de `.npmrc`-overschrijving vóór `publish`).

- [ ] Stap 1: schrijf en lint.
- [ ] Stap 2: voorbeeldrepo: een workspace-pakket `@pursuit-amsterdam/example-lib` met versie `0.1.0`; `cd-packages.yml` met gate (`allow-prerelease: true`) + cd-packages. Release `v0.1.0`: verwacht publicatie onder `latest`; nogmaals dezelfde release → rood "already published"; prerelease `v0.2.0-rc.1` na een versiebump → onder `next`.
- [ ] Stap 3: translations-management op `v2` (**handwerk** voor `packages: write`); eerste echte publicatie.
- [ ] Stap 4: commit `feat: add cd-packages.yml`.

### Task 23: `cd-pages.yml`

**Bestanden:** maak `.github/workflows/cd-pages.yml`: `storybook-cd.yml` als basis, met `build-command` (default `build-storybook`), `output-directory` (default `storybook-static`), `codegen*`, Node uit `.nvmrc`, job `deploy` in environment `github-pages`, `run-codegen` vóór de build.

- [ ] Stap 1: schrijf en lint.
- [ ] Stap 2: voorbeeldrepo: `pages.yml` met `build-command: build` en `output-directory: dist` (het `build`-script schrijft `dist/index.html`); verwacht een gepubliceerde Pages-site.
- [ ] Stap 3: één storybook-repo op `@v2` zonder extra inputs; verwacht gelijk gedrag aan v1.
- [ ] Stap 4: commit `feat: add cd-pages.yml`.

---

## Plak 6: toetsen, inrichten, migreren

### Task 24: `scripts/audit-consumers.sh` en `audit-consumers.yml`

**Bestanden:**
- Maak: `scripts/audit-consumers.sh` uit het concept-blok, plus: per environment de branchregels (`deployment_branch_policy`) en of de deploy-secrets op het environment staan en niet ook op de repo; een environment dat bestaat zonder regels is een bevinding (Review Focus 4); repo's die alleen losse actions of alleen cd-pages aanroepen, krijgen alleen de check-pr-, protectie- en Dependabot-controles.
- Maak: `.github/workflows/audit-consumers.yml`: wekelijks en `workflow_dispatch`, environment `audit` (alleen `v2`), GitHub App-token via `actions/create-github-app-token` op vaste commit, draait het script en werkt één issue bij. Let op: `schedule` werkt alleen vanaf de default branch, en dat is tot Task 28 nog `main`. Tot die tijd start je de audit met `pnpm audit:consumers:remote` (`gh workflow run audit-consumers.yml --ref v2`); `pull_request` en `push` hebben dat probleem niet, dus `self-ci.yml` (Task 2) draait wél gewoon vanaf `v2`.

- [ ] Stap 1: `pnpm lint`; draai `pnpm audit:consumers -- workflows-example gp-map-webapp template-nextjs-vercel`; verwacht 0 bevindingen voor de eerste twee na Plak 1–4, en een lijst voor de template vóór Task 15.
- [ ] Stap 2: test Review Focus 4: maak in de voorbeeldrepo een environment `acceptance` zonder regels; verwacht de bevinding "environment acceptance has no deployment branch policy".
- [ ] Stap 3: GitHub App aanmaken met alleen-lezen `administration`, `environments`, `secrets`, `contents`, `metadata`; installeren op de org (**handwerk**); app-id en private key als secrets op environment `audit`.
- [ ] Stap 4: eerste run via `pnpm audit:consumers:remote`; verwacht een issue "Consumer audit" met de tabel. Werkt de dispatch niet omdat het bestand niet op de default branch staat, dan is dat de reden om Task 28 stap 4 naar voren te halen.
- [ ] Stap 5: commit `feat: add audit-consumers script and weekly workflow`.

### Task 25: `scripts/setup-consumer.sh`

**Bestanden:** maak `scripts/setup-consumer.sh <repo> [--vercel|--swarm|--supabase]`: maakt environments `integration`, `staging`, `production` (en `acceptance` als de branch bestaat) met de branchregels uit de standaard, zet lege variabelen (`OP_VAULT`, `OP_ITEM`, en per target `VM_SSH_*` of `SUPABASE_PROJECT_REF`), per beschermde branch (`main`, en `develop` en `acceptance` als ze bestaan) twee rulesets: checks zonder bypass, en review (code owners, geen force push of verwijderen) met bypass voor admins alleen op PR's; daarna haalt het de klassieke branchprotectie weg, pas als de rulesets staan. Het zet ook de tag-ruleset op `v*` (aanmaken, wijzigen, verwijderen alleen voor admins). Het zet `.github/CODEOWNERS` niet (dat doet Task 26) en meldt welke secrets de beheerder nog moet zetten, ook `CUSTOM_GITHUB_TOKEN` als de CI `use-custom-token` gebruikt. Idempotent: een tweede run verandert niets.

- [ ] Stap 1: `pnpm lint`; `pnpm setup-consumer -- <verse testrepo>`; daarna `pnpm audit:consumers -- <die repo>`: verwacht alleen bevindingen over secrets en variabelen zonder waarde.
- [ ] Stap 2: tweede run; verwacht geen wijzigingen (vergelijk `gh api` vóór en na).
- [ ] Stap 3: commit `feat: add setup-consumer script`.

### Task 26: migratiescript

**Bestanden:** maak `scripts/migrate-consumer.sh <repo>`: kloont de repo, zet `.github/CODEOWNERS` op `* @Pursuit-Amsterdam/senior-developers` als die regel ontbreekt, herschrijft `.github/workflows/*.yml` volgens de tabellen in [ci.md](naslag/ci.md), [cd.md](naslag/cd.md) en de [migratievoorbeelden](naslag/migratievoorbeelden.md) (`@main` → `@v2`, `run-*` → `checks`, `onepassword_*` weg, twee deploy-jobs → gate + deploy, trigger `push` → `workflow_run`, `head-ref`/`base-ref` weg), draait `setup-consumer.sh`, en opent een PR naar `main` met een checklist van wat handmatig blijft (secrets verplaatsen, `package.json`-scripts, verplichte checks vlak vóór de merge). Lessen uit de template, als controles in het script of als punten op die checklist: `CUSTOM_GITHUB_TOKEN` moet de repo kunnen zien als de aanroep `use-custom-token` zet; een CI die lang rood was, laat na de install verborgen fouten zien (reken op een lint- of testfix in dezelfde PR); repo's met tests en de `react`/`next`-preset hebben `@pursuit-amsterdam/jest-config` ≥ 1.0.1 en `@testing-library/jest-dom` nodig; op TypeScript 6 horen de testtypes in `types` van `tsconfig.json`.

- [ ] Stap 1: draai op een kopie van een Vercel-repo met twee deploy-jobs; vergelijk het resultaat met het migratievoorbeeld; `actionlint` op de output.
- [ ] Stap 2: draai op een kopie van gp-groot-automations (Python zonder hoofdschakelaar); verwacht een `backend/package.json` met `lint` en `format` en een waarschuwing in de PR-tekst dat CI rood zal zijn.
- [ ] Stap 3: commit `feat: add migrate-consumer script`.

### Task 27: README op `v2`

- [ ] Stap 1: herschrijf `README.md` op `v2`: per workflow en action de inputs uit de naslag, de standaardinrichting, en de drie scripts. Verwijder `framework` uit elk voorbeeld.
- [ ] Stap 2: commit `docs: rewrite README for v2`. (Geen banner of tekstcorrectie op `main`: `main` van deze repo blijft onaangeroerd.)

### Task 28: v1 weg op `v2`

- [ ] Stap 1: verwijder op `v2`: `web-ci.yml`, `backend-ci.yml`, `fullstack-ci.yml`, `web-cd.yml`, `backend-cd.yml`, `vm-cd.yml`, `storybook-cd.yml`, `codegen.yml`, `run-pnpm-build-test`, `run-python-checks`, `run-supabase-test`, `deploy-supabase`; verwijder `head-ref`/`base-ref` uit `check-pr.yml`.
- [ ] Stap 2: `pnpm audit:consumers -- workflows-example gp-map-webapp gp-container-tracking-webapp template-nextjs-vercel tms-test gp-groot-automations translations-management` → 0 bevindingen.
- [ ] Stap 3: commit `chore: remove v1 workflows and actions from v2`.
- [ ] Stap 4 (**handwerk**): zet de default branch van deze repo op `v2`. Consumers merken niets (hun refs zijn expliciet), maar vanaf nu draaien `schedule` en `workflow_dispatch` vanaf `v2`, en toont de Actions-tab de v2-workflows. Verwacht: de eerstvolgende wekelijkse audit draait vanzelf.

---

## "v2 is klaar"

De afspraak geldt als dit allemaal waar is:

- De zeven testrepo's draaien CI en CD op `@v2` en hebben elk via `v2` naar al hun environments gedeployd, met minstens één herdeploy via dispatch vanaf de tag.
- Het gate-testplan (21 scenario's) is in de voorbeeldrepo groen gedraaid en de run-URL's staan in de PR van Task 11.
- `audit-consumers.sh` geeft 0 bevindingen op de testrepo's.
- De README op `v2` beschrijft elke input.
- Dependabot heeft minstens één PR op `v2` geopend en die is via de eigen CI gemerged.
- `v2` is de default branch, en de wekelijkse audit heeft minstens één keer vanzelf gedraaid.

Daarna: Task 26 per repo, in eigen tempo, en de audit als wekelijkse thermometer.

---

[← Overzicht](README.md) · [Uitrol in detail](naslag/uitrol-in-detail.md)
