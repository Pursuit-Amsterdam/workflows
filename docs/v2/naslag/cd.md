<a id="cd"></a>

# De CD-workflows

Eén per target. Eerst de gedeelde inputs, dan die van het target zelf. Wat CD controleert, staat direct hieronder. Elke deploy-job heeft een `concurrency`-groep per environment én `working-directory`: één deploy per app tegelijk, een lopende wordt niet afgebroken, en van de wachtende houdt GitHub alleen de nieuwste. Zonder `working-directory` in de groep zouden twee apps in één monorepo elkaars wachtende deploy annuleren.

| Gedeelde input | Standaard | Betekenis |
| --- | --- | --- |
| `environment` | verplicht | GitHub-environment. Bepaalt welke `vars` en environment-secrets gelden, en welke branches erin mogen ([standaardinrichting](standaardinrichting.md#consumer-config)). cd-vercel maakt van `production` een `--prod`-deploy en van `staging` een deploy naar het Vercel custom environment `staging` (`--target=staging`), zoals v1: de `develop`-branch met een eigen URL ([besloten](../beslissingen.md#decided)). Elke andere waarde, ook `acceptance`, wordt geweigerd. |
| `ref` | `""` = github.sha | De commit die gedeployd wordt. Geef de `sha`-output van de gate mee. Altijd de head van een branch of een release; een oudere commit kiezen kan niet ([geen rollbacks](../beslissingen.md#decided)). |
| `working-directory` `use-custom-token` | als in CI | Dezelfde betekenis als in ci.yml. In cd-swarm geldt `working-directory` alleen voor de deploy-job, zoals in vm-cd; paden in `images` zijn relatief aan de root. |
| *geen input* | uit `.nvmrc` | Node-versie voor de build, net als in CI; zonder `.nvmrc` 22.x. Vervangt `node-version`. |
| `onepassword-vault` `onepassword-item` | `""` → `vars.OP_VAULT` / `vars.OP_ITEM` | Ook na de terugval leeg: geen secrets. Dezelfde namen als drie Swarm-repo's al gebruiken. |

<a id="cd-checks"></a>

## Wat CD controleert uitwerking van principe 5

CD bouwt niet precies wat CI testte: het genereert code, bouwt met de variabelen van de environment en maakt een nieuw artefact. Deze controles dekken dat verschil.

| Controle | Wat CI niet kon zien | Waar |
| --- | --- | --- |
| **CI geslaagd op deze commit** | — | `cd-gate`, met `required-workflows` standaard op `Continuous Integration`. Leeg wordt geweigerd: een gate die niets eist laat elke commit door, en dan controleert niemand iets. |
| **Typecheck na gegenereerde code** | Het `codegen`-script genereert code; `translations pull` herschrijft woordenboeken en genereert `settings.ts`/`types.ts` opnieuw. Allebei ná CI, vlak vóór de build. | Elke cd-\* die bouwt (cd-vercel, cd-swarm, cd-pages, cd-packages), via de gedeelde action [`run-codegen`](bouwstenen.md#run-codegen): die draait het script `typecheck`, zonder aparte input, zodra `codegen` ingevuld is (in cd-vercel ook bij `tms`); anders is de broncode gelijk aan wat CI zag en valt er niets te controleren. Heeft de repo geen script `typecheck`, dan faalt de stap. |
| **Externe bron veranderd sinds CI** | Het `codegen`-script haalt bij de deploy een externe bron opnieuw op, zoals de OpenAPI-spec van een andere service. Die kan veranderd zijn sinds de commit. De typecheck vangt alleen wat de code raakt; een nieuwe verplichte parameter of een gewijzigd antwoord valt pas in productie op. | Elke cd-\* die bouwt, via `codegen-check` in [`run-codegen`](bouwstenen.md#run-codegen). De basis is de gecommitte spec: `run-codegen` kopieert de bestanden uit `codegen-baseline` vóór de codegen naar `$CODEGEN_BASELINE`, en het script `codegen-check` vergelijkt, bijvoorbeeld met `oasdiff breaking`. Een breaking change stopt de deploy; een andere wijziging gaat door, gecontroleerd door de typecheck. |
| **De build zelf** | CD bouwt met de variabelen en secrets van de environment, CI met andere of geen. Next.js leest environment-variabelen tijdens de build. | Elke cd-\*. Geen input: de build moet falen als een variabele ontbreekt. Dat is een afspraak in de [standaardinrichting](standaardinrichting.md#consumer-config) (env-validatie in de app, `${VAR:?}` in stackbestanden). |
| **Smoketest op het image dat gepusht wordt** | ci-images testte de build van de PR. Het image dat cd-swarm pusht is een nieuwe build, met build-args uit 1Password en mogelijk een nieuwer base image. | `cd-swarm` build-job, vóór de push. Per image met `health-path` of `smoke` in de `images`-JSON: dezelfde start-, health- en smoketest als in ci-images, via de gedeelde action `run-image-smoke`. Zonder die velden wordt alleen gebouwd. |
| **Health-check ná de deploy** | Een geslaagde upload of `stack deploy` zegt niets over of de app ook reageert. | `cd-vercel`: `health-path` op de deployment-URL. `cd-swarm`: wachten tot de services draaien (bestaat al), plus optioneel `health-url`. Faalt de check, dan faalt de job en krijgt het CMS `mark-failed`. |
| **Reproduceerbare install** | Zonder vaste lockfile of base image op digest haalt CD andere dependencies binnen dan CI testte. | `setup-node-pnpm` met `--frozen-lockfile` en `setup-python` met `uv sync --frozen`; geen van beide doet dat nu. De Supabase-CLI-versie komt uit de lockfile van de repo in plaats van `latest`. `audit-consumers.sh` waarschuwt bij `FROM` zonder `@sha256:`. |

- **Geen nieuwe hoofdschakelaars.** `health-path` en `health-url` zijn waarden: leeg betekent geen check. Ook de typecheck heeft geen aan/uit-input: hij draait vanzelf zodra er code gegenereerd is.
- **Geen rollback, automatisch noch handmatig** ([besloten](../beslissingen.md#decided)). Een gefaalde health-check maakt de run rood en meldt het CMS; hij draait niets terug. Herstellen is een nieuwe commit of release. Migraties zijn daarom backward-compatible met de vorige versie van de app.

<a id="cd-vercel"></a>

## `cd-vercel.yml` ← web-cd 29 repo's, 56 aanroepen

| v1-input | v2 | Waarom |
| --- | --- | --- |
| `platform` | vervallen | Alle 56 aanroepen geven `vercel` mee. De bestandsnaam zegt het nu al. |
| `run-test` `run-lint` `run-typecheck` `run-format` + `*-command` | vervallen | CD doet de checks van CI niet opnieuw. cd-gate garandeert dat CI op deze commit geslaagd is. Alleen typecheck komt terug, en alleen na gegenereerde code. |
| `pnpm-version` `vercel-output-directory` | vervallen | Gedeclareerd, nooit gebruikt. |
| `codegen` + `codegen_command` | `codegen` | Naam van het script dat vóór de build draait; leeg is geen. 3 aanroepen gebruiken het. |
| `node-version` | vervallen | Versie uit `.nvmrc`, net als in CI. |
| `onepassword_enabled/_vault/_item` | `onepassword-vault` `onepassword-item`, met `vars`-terugval | 48 aanroepen vullen alle drie in; met variabelen op de environment hoeft dat niet meer. |
| `environment` | verplicht | Was optioneel met standaard `preview`. Elke aanroep vult hem al in. |
| `build-mode` `prepare-package` `vercel-build-command` `vercel-project-env-keys` | ongewijzigd, `build-mode` gevalideerd | Vercel-specifiek, allemaal in gebruik. Een `build-mode` die niet `github` of `vercel` is, wordt geweigerd; nu slaat deploy-vercel dan beide deploy-stappen over en wordt de run groen, dezelfde fout als `platform: azure-asp`. |
| secrets `VERCEL_ORG_ID` `VERCEL_PROJECT_ID` | ongewijzigd | Twee Vercel-apps in één repo (use case 13) zijn twee deploy-jobs die elk hun eigen project-id expliciet doorgeven: `secrets: VERCEL_PROJECT_ID: ${{ secrets.VERCEL_PROJECT_ID_ADMIN }}`, met een eigen `working-directory`. De concurrency-groep bevat die map, dus de twee lopen niet in elkaars weg. |
| — | `ref` nieuw | Voor deploys die door de gate aangestuurd worden. |
| — | typecheck nieuw, geen input | Na `codegen` en `translations pull`, vóór de build, draait het script `typecheck`; ontbreekt het, dan faalt de stap. Alleen als een van beide ingevuld is: dan bouwt CD code die CI nooit zag. |
| — | `codegen-check` `codegen-baseline` nieuw, standaard `""` | Naam van het script dat de opnieuw opgehaalde externe bron vergelijkt met de gecommitte versie, en de gecommitte bestanden die als basis dienen (bijv. `openapi.json`). Draait na de typecheck, via [`run-codegen`](bouwstenen.md#run-codegen); faalt het script, dan stopt de deploy. Zonder `codegen` of zonder `codegen-baseline` wordt het geweigerd. |
| — | `health-path` nieuw, standaard `""` | Pad op de deployment-URL dat na de deploy een 2xx moet teruggeven (bijv. `/api/health` of `/`). Tot 10 pogingen. Gecontroleerd wordt de URL van de deployment zelf; staat Deployment Protection aan op staging, dan is het optionele secret `VERCEL_AUTOMATION_BYPASS_SECRET` nodig. |
| `tms_enabled` `release_id` `tms_working_directory` (branch) | `tms` `tms-release-id` `tms-working-directory` nieuw | Uit `feature/tms-prototype`, via `run-translations`. De secrets `TMS_URL` en `TMS_API_KEY` zijn optioneel. Een deploy op verzoek van het CMS gaat alleen naar staging ([besloten](../beslissingen.md#decided)); bij een release haalt dezelfde `tms`-stap de gepubliceerde vertalingen op voor productie. |
| job `vercel-deploy` | job `deploy` | Gelijk voor alle cd-\*-workflows. |

<a id="cd-supabase"></a>

## `cd-supabase.yml` ← backend-cd nu 0 aanroepers

Het Supabase-deel van een project, op één commit: function-secrets, migraties en edge functions. Twee daarvan gaan nu met de hand, en één daarvan kan alleen een Owner of Administrator van de organisatie.

| v1-input | v2 | Waarom |
| --- | --- | --- |
| `platform` `node-version` | vervallen | Alleen Supabase; de CLI heeft geen Node nodig. |
| `run-migrations` | `migrations`, standaard `true` | De job doet nu drie dingen, dus `false` betekent "alleen functions". `migrations: false` samen met `functions: none` wordt geweigerd, net als in ci.yml en cd-swarm. |
| — | `functions` nieuw, standaard `""` | Leeg: elke function in `supabase/functions/`, met de instellingen per function uit `supabase/config.toml`. De repo is de bron, zodat een nieuwe function niet stil buiten de deploy valt omdat iemand hem in de aanroep vergat. Namen gescheiden door spaties om af te wijken; `none` om geen functions te deployen. Gebundeld met `--use-api`, dus zonder Docker op de runner. |
| — | `function-env-keys` nieuw, standaard `""` | Namen van variabelen die als function-secret naar het project gaan. De waarden komen uit het 1Password-item. Leeg: de secrets blijven ongemoeid. |
| — | `project-ref` nieuw | `""` → `vars.SUPABASE_PROJECT_REF`. Staging en productie zijn twee vaste Supabase-projecten, dus de ref hoort bij de GitHub-environment, precies zoals `OP_VAULT`. Geen Supabase-branching per PR: `develop` migreert naar het staging-project ([besloten](../beslissingen.md#decided)). |
| `db-url` `db-password` (van deploy-supabase) | `db-password-variable`, standaard `SUPABASE_DB_PASSWORD` | Naam van de variabele uit het 1Password-item met het databasewachtwoord. De migraties gaan via `supabase link` op `project-ref` en dan `db push`, dus zonder database-URL op de commandoregel. Een URL-input is niet meer nodig. |
| `onepassword_*` `environment` | zelfde naam als overal | Zoals hierboven. |
| — | `SUPABASE_ACCESS_TOKEN` nieuw secret | Verplicht. Environment-secret op `staging` en `production`, zoals de andere deploy-credentials. De enige credential in v2 die geen enkele ontwikkelaar heeft; zie hieronder. |
| job `supabase-cd` | job `deploy` | Gelijk voor alle cd-\*-workflows. |

### Eén token, en waarom het niet in 1Password staat

Een machine-account heeft Administrator op de Supabase-organisatie, en alleen CI gebruikt het token. Niemands Supabase-rol verandert, en niemand draait de CLI nog tegen een live project.

| Wat | Staat in | Gelezen door | Waarom daar |
| --- | --- | --- | --- |
| `SUPABASE_ACCESS_TOKEN` | GitHub-environment-secret op `staging` en `production` van de repo's die naar Supabase deployen, gezet door de org-admin die het token beheert ([besloten](../beslissingen.md#decided)) | alleen `cd-supabase` | Een Supabase-PAT heeft geen scope: hij geeft toegang tot het hele account, elk project en alle organisatie-acties, en onder Team/Enterprise bestaat geen beperktere variant. Ontwikkelaars kunnen bij 1Password, en dat is ook de bedoeling. Deze ene credential hoort daarom in GitHub, naast `OP_SERVICE_ACCOUNT_TOKEN` en `VM_SSH_PRIVATE_KEY`, en net als die op de environment: een org- of reposecret leest elke branch. |
| De waarden van de secrets | het 1Password-item van de environment | `setup-services` → job-variabelen → `secrets set` | Per environment, beheerd en vervangen door de eigenaar van de dienst, en al de bron voor alles wat de repo verder uitrolt. Geen reden om ze ergens anders te zetten. |
| De project-ref | `vars.SUPABASE_PROJECT_REF` op de environment | `cd-supabase` | Een variabele, geen secret: de ref is niet geheim (hij staat in elke project-URL) en verschilt per environment. Net als `OP_VAULT` en `VM_SSH_HOST`. |

Of een merge naar een productieproject mag schrijven, bepalen de beveiligingsregels van de environment, niet iemands Supabase-rol: de branchregels op de environment en de tag-ruleset op `v*` beschermen het token: alleen een senior maakt de tag die naar productie deployt. Dat werkt alleen omdat het token een environment-secret is; een org-secret staat buiten die regels.

### Wat cd-supabase weigert

- **Niets om te deployen.** `migrations: false` met `functions: none`. Dezelfde regel als in ci.yml en cd-swarm: een job die groen wordt zonder iets te doen is een configuratiefout, geen succes.
- **Geen project.** `project-ref` is ook na de terugval op `vars.SUPABASE_PROJECT_REF` leeg, of `SUPABASE_ACCESS_TOKEN` ontbreekt. Nu zie je dat pas een paar stappen later als CLI-fout, als de migraties al gedraaid hebben.
- **Een gereserveerde naam.** Elke naam die met `SUPABASE_` begint, zoals `SUPABASE_URL` en `SUPABASE_SERVICE_ROLE_KEY`, zet het platform zelf. De CLI weigert ze pas halverwege; de validatiestap weigert ze voordat er iets geschreven is.
- **Een naam zonder waarde in de environment.** Dan zou dat secret leeg worden en de function bij de volgende koude start breken. De stap verzamelt eerst alle ontbrekende namen en faalt voordat hij iets wegschrijft.

### Volgorde van de deploy-job

Checkout op `ref` → Supabase-CLI → 1Password (`setup-services`) → `secrets set` → `link` + `db push` → `functions deploy` → rapportage. De secrets gaan eerst, zodat een function bij zijn eerste koude start de juiste waarden heeft; de migraties gaan vóór de functions, omdat functiecode de nieuwe kolom nodig kan hebben, en nooit andersom. Faalt een stap, dan stopt de job vóór de volgende. Deployt een repo ook een app, dan draait deze workflow eerst ([besloten](../beslissingen.md#decided)): één gate, beide jobs op de `sha` van die gate, met `needs:` ertussen, zodat de app nooit live gaat vóór de functions die hij aanroept. `db push` is alleen vooruit: een migratie die live staat, blijft staan. Daarom zijn migraties backward-compatible met de app die nog draait ([standaardinrichting](standaardinrichting.md#consumer-config)).

- **Waarden komen nooit op de commandoregel.** De secrets-stap schrijft een env-bestand met `umask 077` en verwijdert het na afloop; een commandoregel is leesbaar voor elk proces op de runner. Namen worden getoond; waarden zijn al gemaskeerd door `setup-onepassword`.
- **Alleen zetten en bijwerken, nooit verwijderen.** `secrets set` kan niet opruimen, en de workflow doet dat ook niet. De laatste stap toont de namen van alle live secrets en waarschuwt voor namen die niet in `function-env-keys` staan. Zo zie je afwijkingen, zonder dat een deploy ooit een sleutel kan weghalen.
- **Elke function wordt elke keer gedeployd**, gewijzigd of niet. CD rolt een commit uit en vergelijkt niets. Een ongewijzigde function krijgt opnieuw dezelfde bundel, en "wat live staat ís deze commit" blijft waar, zonder dat een detectieregel zich kan vergissen. Wijzigingen detecteren hoort in CI; daar doet `ci-images` dat al.
- **Wat in de repo blijft:** `verify_jwt`, de import map en de overige instellingen per function blijven in `supabase/config.toml`, zoals het stackbestand dat voor Swarm doet. De workflow deployt wat de repo vastlegt; hij dupliceert het niet.

<a id="cd-swarm"></a>

## `cd-swarm.yml` ← vm-cd 5 repo's, 6 aanroepen

| v1-input | v2 | Waarom |
| --- | --- | --- |
| `ssh-host` `ssh-user` `ssh-port` | `""` → `vars.VM_SSH_HOST` `vars.VM_SSH_USER` `vars.VM_SSH_PORT` | gp-groot-automations geeft precies deze vars al mee. gp-map heeft in plaats daarvan twee IP-adressen hardcoded in de YAML. |
| `stack-name` | `""` → `<repo>-<environment>` | Gelijk aan `gp-map-staging` / `gp-map-production` van gp-map. Te overschrijven. |
| `onepassword_*` | zelfde naam als overal, met terugval op `vars` | Drie van de vijf repo's gebruiken `vars.*` al: automations-blueprint, gp-groot-automations en integrators-automations. |
| `images` | ongewijzigd: optioneel, standaard `[]` | Al optioneel sinds PR #24: een lege lijst slaat `build` over en de deploy draait toch. Het schema blijft dat van v1: `name` is de volledige imagenaam (`ghcr.io/…`), `build-args: public` geeft de niet-verborgen 1Password-velden mee, en de buildsecrets heten `NODE_AUTH_TOKEN` en `GITHUB_TOKEN`. Zo hoeven de Dockerfiles van de huidige aanroepers niet te veranderen. Nieuw is alleen de validatie hieronder. |
| `stack-file` `deploy-enabled` `migrate-*` `converge-timeout` `ref` `working-directory` | ongewijzigd | Allemaal in gebruik, allemaal Swarm-specifiek. `migrate-image` krijgt zoals in vm-cd automatisch de tag `:<versie>` van deze build; de aanroeper geeft de imagenaam zonder tag. |
| — | `codegen` `codegen-check` `codegen-baseline` nieuw | Zoals in cd-vercel, via [`run-codegen`](bouwstenen.md#run-codegen), in de build-job vóór de Docker-build. De Dockerfile kopieert de gegenereerde bestanden alleen; codegen in de Dockerfile zelf kan de workflow niet controleren. |
| `images[].health-path` `smoke` `exec` | nu ook in CD gelezen gewijzigd | Dezelfde velden als ci-images. De build-job start elk image dat ze heeft, controleert de health, draait de smoketests en pusht pas daarna (via `run-image-smoke`). Het image dat uitgerold wordt is een nieuwe build met build-args uit 1Password; de PR-build in ci-images zegt niets over dit image. |
| — | `database` `redis` nieuw | Zoals in ci-images: diensten voor de smoketest vóór de push. Zonder deze inputs slaagt een image dat een database of Redis nodig heeft in ci-images, en faalt hetzelfde image in CD. |
| — | `health-url` nieuw, standaard `""` | URL die een 2xx moet geven zodra alle services draaien, gecontroleerd vanaf de runner. Dat de services draaien, betekent nog niet dat proxy en app reageren; dit controleert dat. Mag `${ENVIRONMENT}` bevatten. |
| — | `pre-deploy` nieuw, standaard `""` | Shellscript dat als `ssh-user` *op de manager* draait, na SSH en de registry-login, vóór de migraties en `docker stack deploy`. Het controleert dat de server klaar is voor de stack: bestaan de mappen voor de bind mounts, is het externe netwerk er, staan de node-labels goed ([besloten](../beslissingen.md#decided)). Het maakt niets aan en wijzigt niets op de host; het draait zonder sudo, en inrichten hoort bij de VM ([infra as code](../use-cases.md#iac)). Het contract: een exitcode anders dan nul stopt de deploy voordat er iets aan de Swarm verandert, met de melding wat er ontbreekt. Het krijgt `ENVIRONMENT`, `STACK_NAME` en `VERSION` mee, niets uit 1Password. Nu merk je een vergeten runbookstap pas als de stack niet convergeert. |
| `environment` | verplicht | Was optioneel met standaard `production`. |
| tags | `:<versie>` en `:sha-<commit>`, ongewijzigd | Geen tag per environment. Die zou de buildjob pushen, buiten de concurrency-groep van de deploy, en dan kunnen twee runs elkaars tag in de verkeerde volgorde overschrijven. |
| rechten | per job in plaats van voor de hele workflow | `packages: write` op de buildjob, `packages: read` op de deploy. De aanroeper geeft altijd `packages: write`, ook zonder images: GitHub toetst de rechten van elke job bij het starten van de workflow, ook van een job die daarna wordt overgeslagen. |
| jobs `build`, `deploy` | ongewijzigd, plus een job `validate` | Sinds PR #24 wordt `build` overgeslagen zonder images, en draait `deploy` ook na een overgeslagen build, maar niet na een mislukte. v2 laat `build` afhangen van het aantal images dat `validate` telt, in plaats van een stringvergelijking met `'[]'`. `deploy` draait zelf setup-version, dus `${VERSION}` wordt nog steeds ingevuld; een kant-en-klare stack gebruikt vaste upstream-tags en heeft hem niet nodig. Beide jobs staan in de environment: de build voor de 1Password-build-args, de deploy voor de secrets van de stack. |

### Wat cd-swarm weigert

- **Niets te bouwen en niets te deployen.** `images: []` met `deploy-enabled: false` is een workflow die niets doet en toch groen wordt. Net als in ci.yml weigert een validatiestap dat. `deploy-enabled: false` is bedoeld om images te bouwen en te pushen terwijl de VM nog niet klaar is; een stack die niets bouwt heeft dan geen reden om CD te draaien, en wacht gewoon tot de VM er is.
- **Deployen zonder host.** `deploy-enabled: true` met een `ssh-host` die ook na de terugval op `vars.VM_SSH_HOST` leeg is, faalt vóór de SSH-stap, met de naam van de ontbrekende variabele. Nu zie je alleen een ssh-fout met een lege hostnaam.

### Volgorde van de deploy-job

Build-job: `run-codegen` (als `codegen` ingevuld is) → bouwen → `run-image-smoke` (als het image `health-path` of `smoke` heeft) → pushen. Deploy-job: SSH-config → GHCR-login → `pre-deploy` → migraties → `docker stack deploy` → wachten tot de services draaien → `health-url`. Faalt een stap, dan stopt de job vóór de volgende; een ontbrekende map of mislukte migratie raakt de stack dus nooit. `pre-deploy` draait bij elke deploy, als `ssh-user` en zonder sudo, en controleert alleen ([besloten](../beslissingen.md#decided)); wat ingericht moet worden, hoort bij de VM. Het script krijgt geen secrets: een certificaat of secret op de server zetten valt erbuiten.

deploy-swarm · nieuwe inputs

```
pre-deploy:      # shell, draait op de manager, alleen controles; "" = overslaan
environment:     # beschikbaar als ENVIRONMENT
version:         # beschikbaar als VERSION (STACK_NAME is al bekend)
```

deploy-swarm · de stap, tussen GHCR-login en migraties

```
- name: Run pre-deploy script on the manager
  if: inputs.pre-deploy != ''
  run: |
    # script via stdin, nooit op de commandoregel; alleen drie variabelen geëxporteerd
    printf 'set -euo pipefail\nexport ENVIRONMENT=%q STACK_NAME=%q VERSION=%q\n%s\n' \
      "$ENVIRONMENT" "$STACK_NAME" "$VERSION" "$PRE_DEPLOY" \
      | ssh -o BatchMode=yes "${SSH_USER}@swarm-manager" 'bash -s'
```

<a id="cd-pages"></a>

## `cd-pages.yml` ← storybook-cd 11 repo's

| v1-input | v2 | Waarom |
| --- | --- | --- |
| — | `build-command` nieuw, standaard `build-storybook` | Naam van het buildscript. Zo kan elke statische site naar GitHub Pages. Storybook blijft de standaard; de 11 bestaande aanroepers hoeven niets toe te voegen. |
| — | `codegen` `codegen-check` `codegen-baseline` nieuw | Zoals in cd-vercel, via [`run-codegen`](bouwstenen.md#run-codegen), vóór het buildscript. Bijvoorbeeld een storybook met een gegenereerde API-client. |
| — | `output-directory` nieuw, standaard `storybook-static` | Idem. |
| `node-version` | vervallen | Versie uit `.nvmrc`, net als in CI. |
| `use-custom-token` `working-directory` | ongewijzigd |  |
| — | `ref` nieuw, standaard `""` (de commit van de run) | Achter cd-gate: de `sha` van de gate. Storybook-aanroepers laten hem leeg. |
| job `deploy` | ongewijzigd |  |

Storybook blijft de standaard; met `build-command` en `output-directory` kan ook een andere statische site naar Pages. Pages kent één site per repo, dus een `environment`-input en 1Password hebben hier geen betekenis; de job draait wel in het environment `github-pages`, dat GitHub zelf aanmaakt en dat Pages vereist. De aanroeper moet `pages: write` en `id-token: write` declareren; het auditscript controleert dat.

**Wanneer, bepaalt de aanroeper.** Twee patronen (21 oktober 2026):

- **Bij elke push op `develop`**, voor een Storybook tijdens het ontwikkelen. Een eigen workflow zonder gate; `github-pages` laat `develop` toe. Zo deed v1 het, en zo draait tellr-website. Een rode CI op `develop` houdt de publicatie niet tegen; alleen een falende build.
- **Achter cd-gate**, bijvoorbeeld documentatie bij een pakketrelease: een job naast `publish` of `deploy` met `needs: gate`, en `ref: ${{ needs.gate.outputs.sha }}`. Alleen bij een release met groene CI, en de site hoort bij precies die commit. `github-pages` laat dan `v*`-tags toe. Getest in workflows-example: release v0.7.0 publiceerde het pakket en de docs-site vanaf dezelfde commit.

<a id="cd-packages"></a>

## `cd-packages.yml` nieuw · pakketten naar GitHub Packages

Publiceert de npm-pakketten van een repo bij een release, achter dezelfde gate als elke andere deploy. De repo bepaalt hoe een pakket gebouwd wordt (principe 7); de workflow bepaalt wanneer en wat er gepubliceerd wordt.

| Input | Standaard | Betekenis |
| --- | --- | --- |
| `environment` `ref` `working-directory` `use-custom-token` | als bij de andere cd-\* | Doorgaans `production` en de `sha` van de gate. De Node-versie komt uit `.nvmrc`. |
| `packages` | `""` | Leeg: elk pakket in de workspace dat niet `"private": true` is. Namen om te beperken. |
| `codegen` `codegen-check` `codegen-baseline` | `""` | Zoals in cd-vercel, via [`run-codegen`](bouwstenen.md#run-codegen), vóór de build. Bijvoorbeeld een SDK die uit de OpenAPI-spec van een andere service gegenereerd en gepubliceerd wordt. |
| `build` | `build` | Naam van het buildscript, via turbo als de repo dat heeft. `none` als er niets te bouwen is. |

- **Alleen nieuwe versies.** Een versie die al in de registry staat, wordt overgeslagen. In een monorepo publiceert een release dus alleen de pakketten waarvan de versie omhoog ging.
- **Release of prerelease.** Een gewone release publiceert onder `latest`, een prerelease onder `next`.
- **Publiceren met de eigen token.** Een pakket hoort bij de repo die het publiceert; de workflow gebruikt diens `GITHUB_TOKEN`. De aanroeper geeft `packages: write`. Let op de volgorde: `setup-node-pnpm` schrijft een `.npmrc` in het project met het install-token (bij `use-custom-token` de PAT), en een project-`.npmrc` gaat vóór `NPM_CONFIG_USERCONFIG`. De workflow overschrijft daarom vlak vóór `publish` de auth-regel in die `.npmrc` met `GITHUB_TOKEN`; anders publiceert hij stilletjes met de PAT van iemand anders.

### Wat cd-packages weigert

- **Niets te publiceren.** Alle pakketten privé, of elke versie staat er al. Vaak betekent dat: de versie is niet opgehoogd.
- **Een tag die niet klopt.** In een repo met één pakket moet de release-tag gelijk zijn aan de versie in `package.json` (`v1.2.3` bij `1.2.3`). Build-metadata telt niet mee: `v1.2.3+1` past ook bij `1.2.3` (zo releasten sommige pakketten dezelfde versie opnieuw; een versie die al gepubliceerd is, faalt nog steeds).

---

[← De CI-workflows](ci.md) · [Overzicht](../README.md) · [Gedeelde bouwstenen →](bouwstenen.md)
