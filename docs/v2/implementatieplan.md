<a id="plan"></a>

# Implementatieplan workflows v2

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Doel:** de workflows uit het v2-ontwerp bouwen op de branch `v2`, bewijzen op een voorbeeldrepo en zeven testrepo's, en daarna elke repo laten overstappen.

**Aanpak:** in zeven plakken. Elke plak eindigt met iets dat in een echte repo draait, en pas daarna begint de volgende. De concept-YAML in de naslag is het uitgangspunt van elke taak; een taak kopieert het blok, past het aan wat de review heeft bijgesteld, en bewijst het op de voorbeeldrepo. Taken die werk buiten deze repo vragen (environments, secrets, een Supabase-account) staan apart gemarkeerd met **handwerk**, omdat een agent ze niet kan uitvoeren.

**Techniek:** GitHub Actions (reusable workflows, composite actions, `actions/github-script`), bash, `actionlint`, `shellcheck`, `gh`.

**Spec:** [docs/v2](README.md), vooral [beslissingen](beslissingen.md#decided), [ci](naslag/ci.md), [cd](naslag/cd.md), [bouwstenen](naslag/bouwstenen.md), [standaardinrichting](naslag/standaardinrichting.md), [uitrol in detail](naslag/uitrol-in-detail.md) en de [concept-YAML](naslag/concept-yaml.md).

## Stand van zaken (20 oktober 2026, einde dag)

**Af:**

- **Plak 0–2** (Task 1–12): `v2` is beschermd en test zichzelf; `ci.yml`, `ci-images.yml` en de gate staan erop; de gate is met 21 scenario's getest.
- **Plak 3, CD naar Vercel** (Task 13–15): `run-codegen`, `deploy-vercel`, `cd-vercel`; pursuit-website-2025 draait op `v2`, ook in productie (release v2026.10.20).
- **Vertalingen-CMS** (Task 21): `run-translations`, de job `tms-sync` in CI, de CMS-stappen in cd-vercel, de CMS-dispatch in de gate (productie opt-in met `cms-production`). Op `v2`: integrators-website-2025, tms-test en het CLI-pakket translations-management-js.
- **GitHub Pages** (Task 23): `cd-pages`; tellr-website draait helemaal op `v2` (CI, CD naar Vercel, Storybook).
- **Template** (Task 15b): template-nextjs-vercel helemaal op `v2`, met `develop`; deployt zelf nooit.
- **Pakketten** (Task 22, 22b): `cd-packages`; op `v2`: jest-config, eslint-config, prettier-config, typescript-config, web-essentials-cli, web-essentials-js, text-extract, translations-management-js.

**Open:**

- **Plak 4, CD naar Swarm** (Task 16–18): `deploy-swarm` met `pre-deploy`, `cd-swarm`, gp-container-tracking-webapp en gp-map-webapp.
- **Plak 5, de rest** (Task 19, 20): `cd-supabase` (machine-account is handwerk), Deno-typecheck in CI.
- **Plak 6** (Task 24–28): het audit-, inricht- en migratiescript, de README op `v2`, v1 weg van `v2`, de default branch op `v2`.
- **Wacht op de volgende release** (geen werk, alleen controleren): de eerste productiedeploy via `v2` van integrators-website-2025 en tms-test, en de eerste publicatie via `cd-packages` van elk pakket.
- **Nog op v1:** translations-management-dashboard en de andere Vercel-sites, web-essentials-py (Python-pakket; cd-packages is alleen npm).

**Bijgesteld onderweg** (zie de taken en [beslissingen](beslissingen.md#decided)):

- seniors mogen hun eigen PR mergen, een junior laat reviewen door een senior; per beschermde branch twee rulesets (checks zonder bypass, review met bypass voor admins); up-to-date verplicht op `develop`, niet op `main` (anders blokkeert elke `develop` → `main`);
- staging op Vercel is het custom environment `staging` (`--target=staging`); deploy-vercel weigert alles behalve `staging` en `production`;
- de gate wacht bij een release of handmatige start op CI die nog loopt (hooguit 20 minuten);
- het CMS start deploys met `workflow_dispatch` (`environment`, `release_id`) op het CD-bestand uit zijn projectinstelling; de standaardnamen zijn `ci.yml` en `cd.yml`;
- check-pr laat in een repo zonder `develop` `feature/*` en `dependabot/*` naar `main`; cd-packages negeert `+N` in de tag;
- `ci.yml` telt bij turbo alleen workspace-pakketten en geeft turbo de remote base voor `--affected`; `use-custom-token` zonder secret faalt met een melding.

**Buiten het plan opgelost:** `@pursuit-amsterdam/jest-config` 1.0.1 (Pursuit-Amsterdam/jest-config#4); `lint` in web-essentials-cli (eslint ontbrak als dependency); verlopen `CUSTOM_GITHUB_TOKEN`s in web-essentials-js en tms-test vervangen.

**Buiten het plan, nog open:**

- TypeScript 6 laadt `@types/*` niet meer vanzelf; projecten met tests hebben `"types": ["jest", "@testing-library/jest-dom"]` nodig. Kandidaat voor `@pursuit-amsterdam/typescript-config`.
- `@pursuit-amsterdam/jest-config` declareert `identity-obj-proxy` en `jest-transform-stub` niet, terwijl de `react`-preset ze gebruikt; `ts-jest` 29 wil `typescript <6`.
- Pursuit-Amsterdam/jest-config heeft 34 Dependabot-meldingen op `main`.
- `CUSTOM_GITHUB_TOKEN` is een PAT per repo die verloopt; leestoegang per pakket met de eigen `GITHUB_TOKEN` (zoals web-essentials-cli) zou hem overbodig maken ([detailbeslissing](naslag/detailbeslissingen.md#decisions-detail)).

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
  - `setup-consumer`: `scripts/setup-consumer.ts` (Task 25)
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

**Bron:** [migratievoorbeeld Next.js](naslag/migratievoorbeelden.md#migration) en de [standaardinrichting](naslag/standaardinrichting.md#consumer-config). Eerst bedoeld voor template-nextjs-vercel, maar die heeft geen Vercel-project (20 oktober 2026). pursuit-website-2025 hangt niet aan het vertalingen-CMS, dus de ontbrekende `tms`-stappen spelen geen rol. `setup-consumer` bestond toen nog niet (Task 25): de inrichting gaat met `gh`.

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
  - [x] Test in de voorbeeldrepo: release v0.3.0 direct na de merge naar `main`. Run 39421035554: drie keer "Waiting for CI on 329aa1c", na 90 seconden CI groen, daarna de deploy.
- Nog open, buiten deze stappen:
  - `VERCEL_TOKEN` en `VERCEL_ORG_ID` staan op org-niveau; de standaard wil `VERCEL_TOKEN` als environment-secret op `Staging` en `Production` (handwerk: de waarde).
  - Environmentnamen met hoofdletters (`Staging`, `Production`); GitHub negeert hoofdletters, hernoemen kan niet zonder de secrets opnieuw te zetten.
  - Het lege environment `Preview` kan weg.
  - Geen `dependabot.yml`.

### Task 15b: template-nextjs-vercel helemaal op `v2`

De template heeft geen Vercel-project en deployt niet: elk project uit de template richt zijn eigen deploy in.

- [x] Stap 1: PR naar `main` (template-nextjs-vercel#28): `web-ci.yml` → `ci.yml`, `web-cd.yml` → `cd.yml` met gate + `cd-vercel@v2` (1Password uit `OP_VAULT`/`OP_ITEM` van het environment, niet uit de YAML), Storybook op `cd-pages@v2`. De gate en de Storybook-job slaan de template zelf over (`github.repository != 'Pursuit-Amsterdam/template-nextjs-vercel'`); in een nieuwe repo is die voorwaarde altijd waar. README: sectie "Set up deployment" (Vercel-project met custom environment `staging`, 1Password-items, `setup-consumer`, variabelen en secrets, Pages) en "Include all branches" bij het aanmaken.
- [x] Stap 2: `develop` aangemaakt vanaf `main`, zodat een nieuwe repo met beide branches start. Eerste runs: CI op `develop` groen, CD na die CI en Storybook overgeslagen.
- [x] Stap 3: inrichting met `setup-consumer --apply`: rulesets op `develop`, up-to-date uit op `main`, tag-ruleset, `staging` (develop + main), `Production` ook vanaf tags `v*`. De bestaande rulesets heetten `main: checks (no bypass)`; eerst hernoemd naar de standaardnamen, anders had het script er een tweede set naast gezet. Tweede run: `no changes`. De audit meldt nog de lege variabelen en secrets (bewust: de template deployt niet), `Production` met hoofdletter, het lege `Preview` en de Dependabot-secret.

---

## Plak 4: CD naar Swarm

Na deze plak deployen gp-container-tracking-webapp en gp-map-webapp via `v2`.

### Task 16: `deploy-swarm` met `pre-deploy`

**Bestanden:** wijzig `.github/actions/deploy-swarm/action.yml`: inputs `pre-deploy`, `environment`, `version`; de stap uit [cd.md](naslag/cd.md#cd-swarm) tussen GHCR-login en migraties.

- [x] Stap 1: schrijf en lint; `shellcheck` op het script met `printf %q`. Meegenomen: de twee `${{ … }}` die nog inline in `run:` stonden (`ssh-user`, `github.actor`), staan nu in `env:`.
- [x] Stap 2: in plaats van `ssh` naar `localhost` op de runner: `scripts/deploy-swarm-cases.sh` (in `pnpm test`) draait de echte stap tegen een nep-`ssh` die het script uitvoert zoals de manager: `bash -s` op stdin, in een lege omgeving. 10 gevallen: `exit 3` stopt de stap met exitcode 3; de drie variabelen komen aan en geen secrets; `set -u` staat aan; een vijandige `VERSION` (`v1; touch …`) voert niets uit; `BatchMode` en `deploy@swarm-manager`; de stap staat na de GHCR-login en vóór migraties en deploy. Eerst rood (stap bestond niet), daarna groen. Controle op de test zelf: met `%s` in plaats van `%q` vallen de twee injectiegevallen om.
- [x] Stap 3: commit `feat(deploy-swarm): add pre-deploy checks on the manager`.

### Task 17: `cd-swarm.yml`

**Bestanden:** maak `.github/workflows/cd-swarm.yml` uit het concept-blok (met de `migrate-image`-tag en `working-directory` in de concurrency-groep).

- [x] Stap 1: schrijf en lint. Naast het concept: `timeout-minutes` per job, `working-directory` voor `run-codegen`. Pariteit met vm-cd nagelopen voor gp-map en container-tracking: buildsecrets `NODE_AUTH_TOKEN` (gp-map frontend) en `GITHUB_TOKEN` (gp-map backend), tags `:<versie>` en `:sha-…`, `migrate-image` met de versietag, `${VERSION}` in de stackbestanden.
- [x] Stap 2: validatietests in de voorbeeldrepo, zonder VM (tijdelijke branch, environment `integration`), run 39567151055:
  - [x] `images: []` met `deploy-enabled: false` → rood in `validate`: "this run would do nothing".
  - [x] één image met `deploy-enabled: false` → build, smoketest ("healthy: /"), push naar GHCR (`v0.6.0-1`, `sha-5314f4dca62c`), deploy overgeslagen.
  - Bijgesteld: de eerste poging faalde op `invalid tag …:v0.6.0+1`. Een tag als `v1.2.0+1` (een her-release) is geen geldige Docker-referentie; v1 had hetzelfde probleem. Beide jobs maken de versie nu Docker-veilig (tekens buiten `[A-Za-z0-9_.-]` worden `-`) en gebruiken die voor tags, smoketest, migratie-image en `VERSION` in de stack.
- [x] Stap 3: commit `feat: add cd-swarm.yml`.

### Task 18: gp-container-tracking-webapp en gp-map-webapp op `v2` (**handwerk** voor vars en environments)

**Bron:** [migratievoorbeelden Swarm](naslag/migratievoorbeelden.md#migration). Volgorde: eerst container-tracking (alleen stack), dan gp-map (Postgres, images, migraties).

- [x] Stap 1: container-tracking (21 oktober 2026). Staging is daar de omgeving waarin gebruikers werken; er is geen productie.
  - `ci.yml`: `run-ci` → `ci.yml@v2` met `checks: lint` (hun `pnpm lint` valideert de stack al, inclusief verplichte variabelen); hun `backup-image`-job met de tests op de backup-container bleef ongewijzigd en niet verplicht. Dus geen ci-images: de bestaande validatie is strenger.
  - `cd.yml`: gate (`branch-targets: develop=staging`) + `cd-swarm@v2`, zelfde image, stackbestanden en stacknaam als vm-cd; `pre-deploy` controleert de vier mappen uit hun runbook, `acme` mode 700, `backup-state` van uid 70 en een actieve swarm; `health-url: https://${APP_HOST}/` (daarvoor kreeg cd-swarm `${VAR}` uit de job-omgeving, #75).
  - `VM_SSH_HOST`/`VM_SSH_USER`/`OP_VAULT`/`OP_ITEM` op `staging`; staging alleen vanaf `develop` en `main`. PR's #13 (naar `develop`) en #14 (`develop` → `main`). **Fout van mij:** #14 nam 17 eerdere `develop`-commits mee naar `main` (alles al live op staging, niets gedeployd); in overleg zo gelaten. Voortaan staat in elke `develop` → `main`-PR wat `develop` meer heeft.
  - Eerste deploy, handmatig vanaf `develop` op een afgesproken moment (run 39568958014): gate, build + smoketest + push van het backup-image, `pre-deploy` OK, stack geconvergeerd, health-check 200 op het dashboard.
  - Rulesets op `develop` en `main` met `run-check-pr / pipeline` en `run-ci / pipeline` (was `run-ci`); klassieke protectie weg.
  - Audit: de bevindingen gaan vooral over het lege, ongebruikte environment `production`; echte gaten zijn `FROM postgres:18-alpine` zonder digest, `OP_SERVICE_ACCOUNT_TOKEN` op `integration` en geen `dependabot.yml`. De audit eiste `VM_SSH_KNOWN_HOSTS` op repo-niveau; per environment mag nu ook.
- [ ] Stap 2: gp-map: `ci.yml` met `run-ci` (turbo, Postgres) en `run-ci-images`; `cd.yml` met gate + cd-swarm met `migrate-image` zonder tag; verplichte checks aanpassen vlak vóór de merge ([job-id's](naslag/uitrol-in-detail.md#job-ids)). Merge naar `develop`; verwacht: build met smoketest, migratie op `:<versie>`, deploy, health groen. **Beperking (21 oktober 2026):** `develop` loopt 193 commits voor en mag niet naar `main`; de workflows gaan daarom via een `hotfix/`-PR met alleen `.github/` naar `main`, en via een eigen PR naar `develop`.
  - [x] Vooraf getest: `workflow_run` vuurt ook voor een workflow die alleen op `develop` bestaat (voorbeeldrepo #49/#50). Daardoor kan `main` zijn oude CI houden en alleen `cd.yml` krijgen.
  - [x] PR naar `develop` (#199): één `ci.yml` met `run-ci` (turbo: lint, format:check, typecheck, test; Postgres `gp_map`) en `run-ci-images` (stack base + productie; frontend met `/api/live` en de smoketests van image-ci, frontend-productie alleen bouwen, backend met Postgres + Redis, de `/health`-JSON, `alembic current`, `arq --help`, gebruiker `app`); `cd.yml` met gate en een deploy-job per environment (ander frontend-Dockerfile en andere stackbestanden), smoketests vóór de push, migraties, `pre-deploy` en `health-url: https://${APP_HOST}/backend/health`; check-pr `@v2`; `CODEOWNERS`. Buiten `.github/`: `backend/tests/conftest.py` zet een `postgres://`-`DATABASE_URL` om naar `postgresql+asyncpg://` (v1 exporteerde geen `DATABASE_URL`, v2 wel).
    - Gevonden in v2: `ci.yml` las `turbo.json` met `jq`, en gp-map's `turbo.json` heeft commentaar (JSONC). Opgelost in #77. Een re-run gebruikt de oude versie van een herbruikbare workflow; pas een nieuwe run (PR dicht en weer open) pakte de fix op.
    - CI op de PR groen; de eerste volledige run op `develop` (39572023475) groen: 8 van 8 turbo-taken, alle drie images.
  - [x] `hotfix/`-PR naar `main` (#200): alleen `cd.yml` (gelijk aan `develop`), `vm-cd.yml` weg, `CODEOWNERS`. `main`'s eigen CI ongewijzigd. Environments: `VM_SSH_HOST`/`VM_SSH_USER`/`OP_VAULT`/`OP_ITEM` op staging en production, staging alleen `develop` + `main`, production alleen tags `v*`, tag-ruleset.
  - [x] Eerste staging-deploy via v2: run 39573140260 (21 oktober 2026, 08:56, handmatig vanaf `develop` @ d59d390): gate `workflow_dispatch -> staging`, drie images gebouwd met smoketests, pre-deploy, migraties, stack `gp-map-staging` geüpdatet, health-check 200. (Gestart vlak vóór de hold; eerder ten onrechte als "niet gedeployd" gemeld.)
  - [x] Brug op `main` (gp-map-webapp#201, 22 oktober 2026): `main` draait de v1-CI nog als twee workflows ("Continuous Integration (Web)" en "(Backend)"), want de v2-CI hangt aan turbo, `backend/package.json` en de test-fix die alleen op `develop` staan, en `develop` mag nog niet naar `main`. `required-workflows` van de gate kiest daarom op de ref: een tag (release, productie vanaf `main`) wacht op die twee, al het andere (staging vanaf `develop`) op "Continuous Integration". `workflow_run` leest `cd.yml` van `main`, dus het kan niet per bestand. Getest op een branch en een tag in de voorbeeldrepo. Weg zodra `develop` naar `main` gaat.
  - Gevonden: `test_console_shows_the_documents_behind_the_judged_text` (backend) is instabiel: rood op #201, groen bij een herhaling (765/765).
  - [ ] `setup-consumer --apply`: rulesets met per branch de checks van die branch (#89): `develop` `run-check-pr`, `run-ci`, `run-ci-images`; `main` `run-check-pr`, `run-ci`. Na de merge van `develop` naar `main` opnieuw, voor `run-ci-images` op `main`.
  - [ ] Rulesets op `develop` en `main` met `run-check-pr / pipeline`, `run-ci / pipeline` en `run-ci-images / pipeline` in plaats van de klassieke protectie.
- [ ] Stap 3: release op gp-map door een senior; verwacht build, smoketest, push en een productiedeploy. Kan nu al vanaf `main` (app-code gelijk aan v2026.09.14, alleen workflowbestanden erbij); `develop` naar `main` pas als die vrijgegeven is.

---

## Plak 5: Supabase, CMS, pakketten, Pages

### Task 19: `cd-supabase.yml` (**handwerk** voor het machine-account)

**Bestanden:** maak `.github/workflows/cd-supabase.yml` uit het concept-blok.

- [ ] Stap 1: machine-account in de Supabase-org (Administrator, 2FA, één eigenaar), PAT aangemaakt, als environment-secret `SUPABASE_ACCESS_TOKEN` op `staging` en `production` van de testrepo met edge functions; `SUPABASE_PROJECT_REF` als variabele per environment.
  - Aanvraag voor de owner van de Supabase-org (21 oktober 2026): machine-account met Administrator, token als `SUPABASE_ACCESS_TOKEN` op `Staging` en `Production` van basko-healthcare-website.
- [x] Stap 2: schrijf en lint; validatietests: `migrations: false` + `functions: none` → rood; `function-env-keys: SUPABASE_URL` → rood "provided by the platform"; een naam zonder waarde in het 1Password-item → rood vóór `secrets set`.
  - `scripts/cd-supabase-cases.sh` (in `pnpm test`) draait de stappen tegen een nep-`supabase`: de drie gevallen hierboven, plus geen project-ref of token → rood, migraties (`link` + `db push`, wachtwoord uit de 1Password-variabele en nooit op de commandoregel), functions (alles of per naam) en de waarschuwing voor niet-beheerde secrets. Tegen een kapotte kopie: 4 van de 33 rood.
  - Geen databasewachtwoord nodig (21 oktober 2026): zonder `SUPABASE_DB_PASSWORD` maakt de CLI (ook 2.114.0) met het access token een tijdelijke login-rol aan. `db-password-variable` is daarom standaard leeg; een naam erin blijft mogelijk.
  - De CLI-versie komt uit de lockfile (`setup-cli` v3.0.1). CI (`setup-supabase`) eist een exacte versie in `package.json`; zo draaien CI en CD dezelfde CLI.
- Bijgesteld: eerste project is basko-healthcare-website, alleen migraties (geen edge functions, geen pgTAP). Stap 3 en 4 gelden voor een later project met functions en tests. Daar zette de **Supabase GitHub-integratie** de migraties live bij een push, buiten CI om; besloten: per project, zie hieronder.
- [x] basko-healthcare-website op `v2`, tot en met staging (productie bij de volgende gewone release): draft-PR naar `develop` (basko-healthcare-website#436): CI met `database: supabase` (elke migratie moet op een lokale stack lukken), CD met gate → `cd-supabase` (`functions: none`) → `cd-vercel`. Variabelen `SUPABASE_PROJECT_REF`, `OP_VAULT`, `OP_ITEM` staan op `Staging` en `Production`. Dezelfde bestanden als draft-hotfix naar `main` (basko-healthcare-website#437), CI groen. Token (22 oktober 2026): scoped op het productieproject, door de owner; op `Staging` en `Production` gezet. Check met een tijdelijke workflow: productie `GET /v1/projects/{ref}` 200; de staging-branch 404 en `link` "does not have the necessary privileges", en de branch staat niet in de projectkeuze van een token. Daarna eerst `deploy-supabase` alleen voor productie (getest met lege jobs in de voorbeeldrepo), maar "Deploy to production" uitzetten kan alleen met de hele integratie, en dan stopt ook staging. Besluit: per project ([beslissingen](beslissingen.md#decided)); basko laat de migraties bij de integratie, `cd.yml` is gate → `cd-vercel`. Het token en `SUPABASE_PROJECT_REF` op de environments zijn daarmee niet nodig. `cd-supabase` krijgt zijn eerste project bij web-essentials-dashboard (edge functions), met een organization-token.
  - [x] #437 (`main`) en #436 (`develop`) gemerged op 22 oktober 2026 (vooraf bijgewerkt: basko eiste up-to-date). Eerste staging-deploy via v2, run 39757083583: gate `workflow_run -> staging @ 73cdeee`, Vercel `staging`, health-check 200.
  - [x] `setup-consumer --apply`: `Staging` alleen `develop` en `main`, `Production` alleen tags `v*`, twee rulesets op `main` en `develop`, tag-ruleset; klassieke protectie weg. Tweede run: `no changes`. Audit daarna: alleen hoofdletters in environmentnamen, `copilot`/`Preview`, `VERCEL_TOKEN`/`VERCEL_ORG_ID` (org-niveau), `OP_SERVICE_ACCOUNT_TOKEN` op `integration` terwijl CI geen 1Password meer laadt, een directe admin buiten senior-developers, en de Dependabot-secret.
  - `SUPABASE_ACCESS_TOKEN` en `SUPABASE_PROJECT_REF` weer weg (niet meer nodig); de owner trekt het token in.
  - [ ] Eerste productiedeploy via v2: bij de volgende release, door een senior. De integratie migreert bij de merge naar `main`. Daarna: #437 mergen, dan #436 (die merge start de eerste staging-deploy via `workflow_run`, na overleg), dan `setup-consumer`. Staging is een persistent branch van het productieproject (`develop` → `yneuhrjwhynwmwiggtcn`; productie `fdmdymfjfwqljhwwrjem`).
- [ ] Stap 3: testrepo: `cd.yml` met gate → `deploy-supabase` (cd-supabase) → `deploy` (cd-vercel) met `needs`. Merge naar `develop`; verwacht: secrets gezet, `db push` zonder wijzigingen, alle functions gedeployd, daarna de app; de waarschuwing voor niet-beheerde secrets in de samenvatting.
- [ ] Stap 4: CI van dezelfde testrepo op `database: supabase` met `checks: dbtest` (het script `"dbtest": "supabase test db"`): verwacht groen met de pgTAP-uitvoer; een PR die niets onder `supabase/` wijzigt → de stack start niet en de job slaagt met "No changes under supabase/"; `checks: dbtest` in een repo zonder `supabase/tests` → rood met `NOTESTS`.
- [ ] Stap 4: commit `feat: add cd-supabase.yml`.

### Task 20: edge functions typechecken in CI

**Bestanden:** wijzig `ci.yml`: installeer Deno (vaste commit van `denoland/setup-deno`) als `supabase/functions` bestaat, zoals uv bij `pyproject.toml`.

- [ ] Stap 1: schrijf; test in de testrepo met `"typecheck:functions": "deno check supabase/functions"` in `checks`; een opzettelijke typefout → rood.
- [ ] Stap 2: commit `feat(ci): set up Deno when the repo has edge functions`.

### Task 21: `run-translations` en de CMS-stappen

**Bestanden:** `.github/actions/run-translations/action.yml` (concept-blok); `ci.yml` (job `tms-sync`), `cd-vercel.yml` (`ack`, `pull`, `mark-deployed`, `mark-failed`), `cd-gate.yml` (de `workflow_dispatch` van het CMS, `cms-production`).

**Bron:** `feature/tms-prototype` en de v1-opzet van integrators-website-2025. Bijgesteld op 20 oktober 2026 ([beslissingen](beslissingen.md#decided)):
- het CMS start een deploy met `workflow_dispatch` (`environment`, `release_id`), niet met `repository_dispatch: tms-deploy`; dat blijft zo;
- de bewaking zit in het dashboard (`GITHUB_DISPATCH_ENVIRONMENTS`, standaard alleen staging); v2 laat productie toe als opt-in (`cms-production`), en dan de nieuwste release, nooit de head van `main`;
- `sync` draait als eigen job in `staging`, niet in `integration`, met `continue-on-error`.

- [x] Stap 1: schrijf en lint (commits op `feature/run-translations`).
- [x] Stap 2: gate-scenario's voor de CMS-dispatch in de voorbeeldrepo:
  - [x] `develop` + `staging` → staging op de head van `develop` — 39433689340
  - [x] `main` + `production` zonder `cms-production` → rood "does not let the CMS deploy production" — 39433935075
  - [x] `develop` + `production` zonder `cms-production` → rood, zelfde melding — 39433996221
  - [x] `main` + `production` mét `cms-production` → productie op d10c219, de commit van de nieuwste release `v0.6.0+1` (ook een tag met `+` werkt) — 39434052152. `production` stond daarvoor tijdelijk ook `main` toe.
  - [x] `develop` + `production` mét `cms-production` → rood "starts from main, not develop" — 39434166919
- [x] Stap 3: integrators-website-2025, staging, via een tijdelijke branch: CI met `tms-sync-branch` op die branch, daarna `cd-vercel` met `tms: true`. Run 39434349950, groen:
  - `tms-sync` (in `staging`): "Synced, 0 values uploaded, 280 skipped";
  - deploy: `ack` ("No pending release to acknowledge"), `pull` (staging release #23, 20 bestanden), build, deploy naar het custom environment `staging`, health-check 200, `mark-deployed` ("recorded the deployed code against release …").
  - Eerst rood: (1) `run-translations@v2` bestond nog niet op `v2`; voor de test tijdelijk naar deze branch gewezen en daarna teruggedraaid. (2) De action eiste `TMS_URL`, maar het 1Password-item levert `NEXT_PUBLIC_TMS_URL`, dat de CLI ook accepteert. De action controleert nu niets meer zelf; de CLI meldt wat ontbreekt.
- [x] Stap 4: PR naar `v2` (#63), gemerged op groene `pipeline`.

**integrators-website-2025 op `v2`** (20 oktober 2026), van `feature/tms-prototype` (v1):

- [x] Inrichting: `staging` alleen vanaf `develop` en `main`; `Production` alleen tags `v*`; `OP_VAULT`/`OP_ITEM` op beide; tag-ruleset op `v*`.
- [x] PR naar `develop` (#97): CI op `ci.yml@v2` met `tms-sync-branch: develop`; check-pr `@v2`; CD (eerst `web-cd.yml`, de naam die het CMS toen aanriep) met gate (`branch-targets: develop=staging`) + `cd-vercel@v2` met `tms: true`, `tms-release-id` uit de dispatch-input en `health-path: /`; de inputs `environment` en `release_id` blijven gedeclareerd; `CODEOWNERS`. CI groen zonder de staging-secrets die v1-CI laadde.
- [x] PR `develop` → `main` (#98); gemerged. De eerste `tms-sync` op `develop` (run 39437453177): groen, 0 wijzigingen.
- [x] Staging zoals het CMS hem start (`workflow_dispatch` vanaf `develop`, `environment: staging`), run 39437902354: gate `workflow_dispatch -> staging`, `ack`, `pull` (release #23), deploy, health-check 200, `mark-deployed`.
- [x] Branchbescherming: rulesets op `develop` (up-to-date aan) en `main` (uit); de klassieke protectie met `ci / pipeline` is weg.
- [x] Bestandsnamen gelijkgetrokken (#100, #101): `web-ci.yml` → `ci.yml`, `web-cd.yml` → `cd.yml`. Het CMS roept het CD-bestand aan met de naam uit zijn projectinstelling (kolom `github_workflow_file`; leeg = de standaard van het dashboard, `cd.yml` op `main` en `web-cd.yml` op `develop`). Die instelling staat nu op `cd.yml`. Daarna, run 39440036657: CMS-route vanaf `develop` groen (de gate wachtte op CI, `ack`, `pull`, deploy, health 200, `mark-deployed`). pursuit-website-2025 kreeg dezelfde namen (#110, #111).
- [ ] Eerste productiedeploy via v2: bij de volgende release, door een senior.

**tms-test op `v2`** (20 oktober 2026), van plain v1 (`@main`, met `repository_dispatch: tms-deploy`/`tms-validate`, zonder CMS-stappen in de deploy):

- [x] Inrichting: `staging` alleen vanaf `develop` en `main`; `Production` alleen tags `v*`; `OP_VAULT`/`OP_ITEM` op beide; tag-ruleset. Het CMS stond al op `cd.yml`.
- [x] PR naar `develop` (#21):
  - CLI `^0.1.58` → `^0.4.0`, want `translations release ack` kwam pas in 0.2. 0.4.0 is alleen ESM, en Next laadt `next.config.ts` via `require`, dus `next.config.mjs`, zoals integrators.
  - `ci.yml` met `lint typecheck build` (geen `test`: er zijn geen tests, jest faalt op "No tests found") en `tms-sync-branch: develop`; `cd.yml` met gate + `cd-vercel` + `tms`; check-pr `@v2`; `CODEOWNERS`; de `repository_dispatch`-triggers weg.
  - CI faalde eerst met een 401: de `CUSTOM_GITHUB_TOKEN` van de repo (3 juni) was verlopen; na een nieuwe PAT groen.
- [x] `develop` → `main` (#22). Eerste `tms-sync` op `develop` groen. Staging zoals het CMS hem start (run 39443905683): `ack`, `pull` (release #2), deploy, health 200, `mark-deployed`. Tegelijk liep de automatische deploy na de merge (`workflow_run`), op dezelfde commit; cd-vercel zet die achter elkaar.
- [x] Rulesets op `develop` (up-to-date aan) en `main` (uit); er was geen bescherming.
- [x] `withTranslations(nextConfig, { pull: false })`, zoals integrators (#23): sinds 0.4.0 doet de plugin zonder opties niets en waarschuwt hij daarover; CD pullt vóór de build.

### Task 22: `cd-packages.yml`

**Bestanden:** maak `.github/workflows/cd-packages.yml` uit het concept-blok (met de `.npmrc`-overschrijving vóór `publish`).

- [x] Stap 1: schrijf en lint.
  - Bijgesteld: "al gepubliceerd?" maakt onderscheid tussen gevonden (overslaan), E404 (publiceren) en elke andere fout (rood). In het concept telde een auth- of registryfout als "nog niet gepubliceerd".
  - Bijgesteld: `timeout-minutes: 30`; zonder stopt GitHub een vastgelopen publish pas na 6 uur, en de concurrency-groep houdt de volgende zolang vast.
- [x] Stap 2: voorbeeldrepo: een workspace-pakket `@pursuit-amsterdam/example-lib` met versie `0.1.0`; `cd-packages.yml` met gate (`allow-prerelease: true`) + cd-packages. Release `v0.1.0`: verwacht publicatie onder `latest`; nogmaals dezelfde release → rood "already published"; prerelease `v0.2.0-rc.1` na een versiebump → onder `next`. Gedaan met 0.4.0 en 0.5.0-rc.1 (de voorbeeldrepo had al tags tot v0.3.0):
  - release v0.4.0, run 39422480657: de gate wachtte op CI, daarna `+ @pursuit-amsterdam/example-lib@0.4.0` onder `latest`;
  - dezelfde run opnieuw: rood, "Every version is already published: was the version bumped?";
  - prerelease v0.5.0-rc.1, run 39423049361: gepubliceerd onder `next`.
- [x] Stap 3: translations-management-js op `v2` (#92 naar `develop`, #93 naar `main`): CI met dezelfde zes controles als voorheen, nu als `package.json`-scripts (`lint typecheck test build check-exports typecheck:fixtures`; de twee inline-stappen zijn het script `check-exports`); publiceren via gate + `cd-packages`; `production` alleen tags `v*`, tag-ruleset; rulesets op `develop` (up-to-date aan) en `main` (uit), waar eerst geen bescherming was. `packages: write` zat al in de aanroeper, geen handwerk nodig.
  - [ ] Eerste echte publicatie: bij de volgende release.
- [x] Stap 4: commit `feat: add cd-packages.yml`.

### Task 22b: de configpakketten op `v2`

jest-config, eslint-config, prettier-config en typescript-config (20 oktober 2026). Alle vier hebben alleen `main`, publiceerden met `npm publish` op `release: created` zonder CI, en hadden geen scripts behalve de test van typescript-config.

- [x] check-pr: een repo zonder `develop` mag `feature/*` en `dependabot/*` naar `main` mergen (#58); check-pr kijkt via de API of `develop` bestaat.
- [x] Inrichting: environment `production` met alleen tags `v*`; tag-ruleset op `v*` (alleen admins).
- [x] PR per repo: CI op `ci.yml@v2` met `check-pack` (elk item in `files` bestaat, dan `pnpm pack --dry-run`), typescript-config ook `test` en zijn matrix als niet-verplichte job `compat`; check-pr `@v2`; CD met gate (`allow-prerelease: true`) + `cd-packages@v2` (`build: none`); `packageManager`; `CODEOWNERS`; `release-package.yml` weg. eslint-config negeerde `pnpm-lock.yaml` in `.gitignore`; de lockfile staat er nu in. PR's: jest-config#5, eslint-config#19, prettier-config#2, typescript-config#2, gemerged; CI op `main` daarna groen in alle vier. check-pr gaf op alle vier `feature/workflows-v2 → main` groen: de echte test van de regel zonder `develop`. In typescript-config faalde `compat` eerst: `pnpm/action-setup` weigert een `version` naast `packageManager`.
- [x] Branchbescherming op `main`: twee rulesets (checks met up-to-date, want er is geen `develop`; review met bypass voor admins); klassieke protectie weg.
- [ ] Eerste publicatie via cd-packages: bij de volgende release van elk pakket.

De andere pakketrepo's (20 oktober 2026):

- [x] cd-packages negeert build-metadata in de tag (#60): `v3.5.0+2` past bij `3.5.0`, zoals de oude release-workflows deden. Getest met release `v0.6.0+1` in de voorbeeldrepo (run 39426416014, `example-lib@0.6.0`).
- [x] web-essentials-cli (#5): zoals de configpakketten, met `lint typecheck build` en `build: build`. Privépakketten met de eigen `GITHUB_TOKEN` (CI krijgt `packages: read`), zoals de oude release. `pnpm lint` faalde ook lokaal ("eslint: command not found"): `eslint` en `eslint-plugin-simple-import-sort` toegevoegd als devDependency.
- [x] web-essentials-js (#8, pnpm 11): `lint typecheck test build` via turbo; een release publiceert `@pursuit-amsterdam/web-essentials`. CI faalde eerst met een 401 op de privépakketten: de `CUSTOM_GITHUB_TOKEN` van de repo (gezet op 7 mei) was verlopen. Lokaal installeerde pnpm 11 met dezelfde `.npmrc` en een geldige token zonder problemen. Met een nieuwe PAT groen; gemerged, CI op `main` groen, rulesets op `main`. pnpm 11 werkt dus met v2.
- [x] text-extract (#8 naar `develop`, #9 naar `main`): `lint typecheck test build` via turbo; een release publiceert `@pursuit-amsterdam/text-extract`. De deploy van de demo-app is weg: die draaide nooit (geen Vercel-project). De default branch is nu `main` (was `develop`). `main` had "include administrators" aan, waardoor ook een admin niet zonder review kon mergen; vervangen door de rulesets (up-to-date uit op `main`, aan op `develop`).
- Later: web-essentials-py (Python, wheel bij de release; cd-packages is alleen npm). translations-management-js staat bij Task 22 stap 3.

### Task 23: `cd-pages.yml`

**Bestanden:** maak `.github/workflows/cd-pages.yml`: `storybook-cd.yml` als basis, met `build-command` (default `build-storybook`), `output-directory` (default `storybook-static`), `codegen*`, Node uit `.nvmrc`, job `deploy` in environment `github-pages`, `run-codegen` vóór de build.

- [x] Stap 1: schrijf en lint. De Pages-actions op hun huidige versie, vastgezet op een commit: `configure-pages` v6.0.0, `upload-pages-artifact` v5.0.0, `deploy-pages` v5.0.1 (v1 gebruikte v5, v3 en v4). De build faalt met een duidelijke melding als `output-directory` geen `index.html` bevat.
- [x] Stap 2: voorbeeldrepo: `pages.yml` met `build-command: build` en `output-directory: dist` (het `build`-script schrijft `dist/index.html`); verwacht een gepubliceerde Pages-site. Pages eerst aangezet (bron: GitHub Actions); `pages.yml` met `working-directory: web`. Run 39446208947 groen, `pursuit-amsterdam.github.io/workflows-example/` geeft 200.
- [x] Stap 3: tellr-website op `@v2` zonder extra inputs (alleen `use-custom-token`, zoals in v1); Storybook nog steeds bij elke push op `develop`. Run 39447002016 groen, de Pages-site geeft 200.
- [x] Toegevoegd (21 oktober 2026): input `ref`, zodat `cd-pages` ook achter de gate kan, bijvoorbeeld voor documentatie bij een pakketrelease. Getest in de voorbeeldrepo: release v0.7.0, run 39561995763; gate, `publish` (`example-lib@0.7.0`) en `docs` bouwden allemaal cef29ed, Pages 200. `github-pages` laat daar nu `main` en `v*` toe.

**tellr-website helemaal op `v2`** (20 oktober 2026; geen Supabase, geen Swarm, geen CMS):

- [x] Inrichting: `staging` alleen vanaf `develop` en `main`; `Production` alleen tags `v*`; `OP_VAULT`/`OP_ITEM` op beide; tag-ruleset. `github-pages` liet al alleen `develop` toe.
- [x] PR naar `develop` (#41): `ci.yml` (`lint typecheck test build`), `cd.yml` (gate + `cd-vercel`, `health-path: /`), Storybook via `cd-pages@v2`, check-pr `@v2`, `CODEOWNERS`. De `.nvmrc` met `24` stond er al. De verplichte checks hielden hun naam.
- [x] `develop` → `main` (#42). Staging via een handmatige start vanaf `develop` (run 39447222444): gate, deploy naar het custom environment `staging`, health-check 200.
- [x] Rulesets op `develop` (up-to-date aan) en `main` (uit); de klassieke protectie is weg.
- [ ] Eerste productiedeploy via `v2`: bij de volgende release. `VERCEL_TOKEN` staat nog op de repo in plaats van op de environments (handwerk: de waarde).
- [x] Stap 4: commit `feat: add cd-pages.yml`.

---

## Plak 6: toetsen, inrichten, migreren

### Task 24: `scripts/audit-consumers.sh` en `audit-consumers.yml`

**Bestanden:**
- Maak: `scripts/audit-consumers.sh` uit het concept-blok, plus: per environment de branchregels (`deployment_branch_policy`) en of de deploy-secrets op het environment staan en niet ook op de repo; een environment dat bestaat zonder regels is een bevinding (Review Focus 4); repo's die alleen losse actions of alleen cd-pages aanroepen, krijgen alleen de check-pr-, protectie- en Dependabot-controles.
- Maak: `.github/workflows/audit-consumers.yml`: wekelijks en `workflow_dispatch`, environment `audit` (alleen `v2`), GitHub App-token via `actions/create-github-app-token` op vaste commit, draait het script en werkt één issue bij. Let op: `schedule` werkt alleen vanaf de default branch, en dat is tot Task 28 nog `main`. Tot die tijd start je de audit met `pnpm audit:consumers:remote` (`gh workflow run audit-consumers.yml --ref v2`); `pull_request` en `push` hebben dat probleem niet, dus `self-ci.yml` (Task 2) draait wél gewoon vanaf `v2`.

- [x] Stap 1: `pnpm lint`; `pnpm audit:consumers -- …` op tellr-website, workflows-example, template-nextjs-vercel, pursuit-website-2025, integrators-website-2025 en jest-config: 37 bevindingen, elk nagelopen tegen de standaard; geen valse meldingen. gp-map-webapp staat nog op v1 (Plak 4) en is daarom niet de nulmeting.
  - Bijgesteld: **TypeScript in plaats van bash** (`scripts/audit-consumers.ts`, met `scripts/lib/`). De bash-versie liep tegen drie fouten aan die pas op echte repo's bleken: YAML lezen met `awk` begreep alleen 2 spaties inspringen, `gh api` zet zijn foutmelding op stdout, en `--jq` geeft niets voor `null`. Met de `yaml`-parser en Octokit zijn die weg, en `migrate-consumer` (Task 26) moet YAML herschrijven met behoud van commentaar. De bash-versie diende als referentie: de TypeScript-versie gaf op dezelfde zes repo's dezelfde 37 bevindingen, regel voor regel.
  - Bijgesteld: deze repo draait op Node 26 (`.nvmrc`) en pnpm 11.28.5; `lint` typecheckt de scripts, en self-CI installeert Node uit `.nvmrc` en de dependencies.
  - Uitgebreid ten opzichte van het concept: per environment de branchregels (staging `develop` + `main`, production tags `v*`), de tag-ruleset, klassieke protectie gemeld (de standaard is twee rulesets), een ruleset met checks én bypass, deploy-secrets op de repo of op `integration`, `packageManager`, lockfile en `.nvmrc`, de CI-push op `develop`/`acceptance`, en de CMS-inputs bij `tms: true`. Wat een repo moet hebben, hangt af van wat hij aanroept (deploy of publiceer: alles; anders alleen check-pr, protectie, CODEOWNERS en Dependabot).
- [x] Stap 2: test Review Focus 4: in de voorbeeldrepo de regels van `acceptance` tijdelijk weggehaald → "environment 'acceptance' has no deployment branch policy: any branch may deploy to it"; regels teruggezet, melding weg. (De eerste poging miste hem: `gh --jq` geeft niets voor `null`.)
- [ ] Stap 3: GitHub App aanmaken met alleen-lezen `administration`, `environments`, `secrets`, `contents`, `metadata`; installeren op de org (**handwerk**); app-id en private key als secrets op environment `audit`.
- [ ] Stap 4: eerste run via `pnpm audit:consumers:remote`; verwacht een issue "Consumer audit" met de tabel. Werkt de dispatch niet omdat het bestand niet op de default branch staat, dan is dat de reden om Task 28 stap 4 naar voren te halen.
- [ ] Stap 5: commit `feat: add audit-consumers script and weekly workflow`.

### Task 25: `scripts/setup-consumer.ts`

**Bestanden:** maak `scripts/setup-consumer.ts <repo> [--vercel|--swarm|--supabase]`: maakt environments `integration`, `staging`, `production` (en `acceptance` als de branch bestaat) met de branchregels uit de standaard, zet lege variabelen (`OP_VAULT`, `OP_ITEM`, en per target `VM_SSH_*` of `SUPABASE_PROJECT_REF`), per beschermde branch (`main`, en `develop` en `acceptance` als ze bestaan) twee rulesets: checks zonder bypass, en review (code owners, geen force push of verwijderen) met bypass voor admins alleen op PR's; daarna haalt het de klassieke branchprotectie weg, pas als de rulesets staan. Het zet ook de tag-ruleset op `v*` (aanmaken, wijzigen, verwijderen alleen voor admins). Het zet `.github/CODEOWNERS` niet (dat doet Task 26) en meldt welke secrets de beheerder nog moet zetten, ook `CUSTOM_GITHUB_TOKEN` als de CI `use-custom-token` gebruikt. Idempotent: een tweede run verandert niets.

- Bijgesteld (21 oktober 2026):
  - TypeScript, zoals de audit; de gedeelde code (welke workflows een repo aanroept) staat in `scripts/lib/consumer.ts`, en de audit gebruikt die nu ook (uitvoer identiek).
  - Standaard een dry run; `--apply` voert uit. Elke regel is `create`, `update`, `remove`, `todo` of `note`.
  - Geen `--vercel|--swarm|--supabase`: het profiel komt uit de workflows van de repo, net als in de audit. De verplichte checks ook: `<job van de aanroeper> / pipeline` voor elke aanroep van check-pr of CI.
  - Geen lege variabelen: GitHub weigert een variabele zonder waarde. Ontbrekende variabelen en secrets zijn `todo`'s.
  - Laat staan en meldt (`note`): environmentnamen met hoofdletters (hernoemen gooit de secrets weg), extra branchregels, environments buiten de standaard, andere rulesets op dezelfde branch. Bestaande wachttijd en reviewers van een environment blijven.
  - Een bestaande ruleset met dezelfde naam wordt bijgewerkt; zo zijn de rulesets van de eerdere migraties meteen goed.
- [x] Stap 1: `pnpm lint`; dry run op acht ingerichte repo's (workflows-example, tellr, pursuit-website, integrators, tms-test, gp-container-tracking, text-extract, eslint-config): geen wijzigingen behalve de rulesets op `acceptance` in de voorbeeldrepo en `production` + tag-ruleset in gp-container-tracking (niet uitgevoerd: daar is staging de productie). Daarna in de voorbeeldrepo de tag-ruleset verwijderd en up-to-date op `develop` uitgezet; `--apply` zet beide terug plus de rulesets op `acceptance`. `pnpm audit:consumers -- workflows-example` meldt daarna alleen de workflowbestanden (geen CI-push op `acceptance`, geen `dependabot.yml`), niets van de inrichting.
- [x] Stap 2: tweede run: `no changes`.
- [x] Stap 3: commit `feat: add setup-consumer script`.

### Task 26: migratiescript

**Bestanden:** maak `scripts/migrate-consumer.ts <repo>`: kloont de repo, zet `.github/CODEOWNERS` op `* @Pursuit-Amsterdam/senior-developers` als die regel ontbreekt, herschrijft `.github/workflows/*.yml` volgens de tabellen in [ci.md](naslag/ci.md), [cd.md](naslag/cd.md) en de [migratievoorbeelden](naslag/migratievoorbeelden.md) (`@main` → `@v2`, `run-*` → `checks`, `onepassword_*` weg, twee deploy-jobs → gate + deploy, trigger `push` → `workflow_run`, `head-ref`/`base-ref` weg), draait `setup-consumer.sh`, en opent een PR naar `main` met een checklist van wat handmatig blijft (secrets verplaatsen, `package.json`-scripts, verplichte checks vlak vóór de merge). Lessen uit de template, als controles in het script of als punten op die checklist: `CUSTOM_GITHUB_TOKEN` moet de repo kunnen zien als de aanroep `use-custom-token` zet; een CI die lang rood was, laat na de install verborgen fouten zien (reken op een lint- of testfix in dezelfde PR); repo's met tests en de `react`/`next`-preset hebben `@pursuit-amsterdam/jest-config` ≥ 1.0.1 en `@testing-library/jest-dom` nodig; op TypeScript 6 horen de testtypes in `types` van `tsconfig.json`.

- Bijgesteld (22 oktober 2026):
  - TypeScript, zoals audit en setup-consumer. De omzetting zelf is een pure functie in `scripts/lib/migrate.ts` (geen netwerk, geen git), getest met `node --test scripts/lib/` (12 tests, in `pnpm test`; drie mutaties maken elk een test rood). `scripts/migrate-consumer.ts` kloont, toont de diff, en pusht pas met `--apply`.
  - PR's: met `develop` een draft-PR `feature/workflows-v2` → `develop` én `hotfix/workflows-v2` → `main` met dezelfde bestanden (`workflow_run` en `release` lezen `cd.yml` van `main`; geen app-wijzigingen naar `main`). Zonder `develop` één PR naar `main`.
  - `setup-consumer` draait niet in het script maar na de merge, als checklistpunt: rulesets met `run-ci / pipeline` zouden open PR's blokkeren. Het script zet alleen `OP_VAULT`/`OP_ITEM` op bestaande environments, uit de 1Password-namen in de v1-YAML, en overschrijft nooit een waarde.
  - Wat het herkent: `web-ci` (één aanroep) → `ci.yml` met `checks` uit de `run-*`-vlaggen, alleen voor scripts die in `package.json` staan; `web-cd` voor staging en productie → gate + `cd-vercel` (`codegen_command` → scriptnaam, `prepare-package`, `build-mode`); alleen productie → geen `workflow_run`, lege `branch-targets`; geen `develop` → ook alleen productie (zo deployen die repo's in de praktijk: zonder `develop` draaide staging nooit, en er is geen staging-environment in GitHub of Vercel); `check-pr` → de standaardaanroeper; `storybook-cd` → `cd-pages@v2` met dezelfde triggers. Verder `.nvmrc` uit `node-version`, `CODEOWNERS` met de seniors, de Dependabot-token. Het zet nooit een half bestand om: wat het niet herkent (acceptance, `backend-ci`, `vm-cd`, eigen jobs) blijft staan en komt op de checklist, met de lessen uit de template als controles.
  - Bijgesteld (22 oktober 2026, #91): een repo zonder `develop` krijgt geen staging; ook `setup-consumer` en de audit verwachten `staging` alleen als `develop` bestaat. Eerst was het `main=staging`, maar intersekse, provincie-utrecht, github-wrapped, copy-mvp en stage-presentation hebben nooit naar staging gedeployd.
- [x] Stap 1: dry run op klonen van qpido-website (twee deploy-jobs), copy-mvp (geen `develop`), web-essentials-dashboard (alleen productie) en foodcabinet-website (acceptance): uitvoer zoals het migratievoorbeeld, `actionlint` schoon; foodcabinet houdt zijn CD (acceptance) met een checklistpunt.
- [x] Stap 2: gp-groot-automations. Ruling: `backend-ci` (Python via turbo en `backend/package.json`) en `vm-cd` (Swarm) zet het script niet om; die repo's (groep C: gp-groot, automations-blueprint, integrators-automations, sluyter) blijven handwerk, zoals gp-map en container-tracking. Uitvoer: alleen check-pr, `.nvmrc`, Dependabot, met checklistpunten voor CI, CD en de ontbrekende `package.json`; `actionlint` schoon.
- [x] Stap 3: commit `feat: add migrate-consumer script`.
- [x] Eerste echte migratie (22 oktober 2026): qpido-website, `--apply` → draft-PR's #87 (`develop`) en #88 (`main`), `OP_VAULT`/`OP_ITEM` op `staging` en `production`. Drie keer rood, drie lessen in het script:
  - 403 op `@pursuit-amsterdam/web-essentials`: v1 CI zette geen `use-custom-token`, v1 CD wel. Het script geeft CI nu het custom token zodra de repo private pakketten gebruikt (#93).
  - `jest` faalt zonder tests: v1 draaide `test --passWithNoTests`. qpido heeft geen tests, dus `test` uit `checks`; het script waarschuwt ervoor (#94).
  - `build` faalt zonder `REVALIDATE_SECRET_KEY`: v1 CI laadde 1Password. `build` uit `checks`, CD bouwt met de waarden; het script waarschuwt ervoor (#94).
  - Daarna groen (`lint typecheck`). #88 en #87 gemerged; staging via v2 (gate `workflow_run -> staging @ 9faa543`, Vercel `staging`). `setup-consumer --apply`, tweede run `no changes`; `OP_SERVICE_ACCOUNT_TOKEN` van `integration` weg. Productie bij de volgende release.

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
