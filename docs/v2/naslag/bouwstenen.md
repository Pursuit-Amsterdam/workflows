<a id="shared"></a>

# Gedeelde bouwstenen

De onderdelen die CI en CD delen: één hulpworkflow, vijf nieuwe composite actions, en de bestaande actions. Die houden hun naam en inputs, zodat de zes repo's die ze rechtstreeks aanroepen niets hoeven aan te passen.

<a id="gate"></a>

## `cd-gate.yml` hulpworkflow · nieuw · uit gp-map-webapp

Een kleine workflow die vóór elke deploy draait. Hij deployt zelf niets, maar beantwoordt drie vragen en geeft de antwoorden door aan de echte deploy-job.

1. **Mag deze run deployen?** → `proceed`: `true` of `false`
2. **Naar welke environment?** → `target`, bijv. `staging` of `production`
3. **Welke commit precies?** → `sha`

### Waarom dat nodig is

Zonder gate moet elke repo dit zelf regelen, en dat gaat op vier manieren mis:

- **Deployen zonder geslaagde CI.** De 31 repo's die CD op `push` starten, laten CI en CD tegelijk lopen; de deploy weet niet of CI groen wordt. Daarom draait web-cd nu zelf lint en tests opnieuw.
- **Dubbele deploys.** Een repo met twee CI-workflows krijgt na één push twee "CI is klaar"-signalen, dus twee deploys tegelijk op dezelfde stack.
- **De verkeerde commit.** Een deploy die start na CI of op verzoek van het CMS, draait in GitHub op de default branch. Zonder correctie rolt tms-test de code van `main` uit als staging.
- **Twee jobs per repo.** Elke repo schrijft zelf "develop → staging, release → productie", vaak als twee bijna gelijke deploy-jobs. Dat zijn de 25 repo's met een staging- en een productiejob.

### Hoe hij beslist

Eerst: welk environment en welke commit? Dan: is CI daarop geslaagd? Het event bepaalt het eerste; de Actions-API het tweede.

| Event | Environment | Commit |
| --- | --- | --- |
| `workflow_run`: CI klaar na een push op `develop` of `acceptance` | uit `branch-targets`, op de head-branch van die CI-run | de `head_sha` van die CI-run |
| `release: published` | production | de commit van de tag |
| `workflow_dispatch` | uit de ref waarvan je start: een branch uit `branch-targets`, of een tag → production | de commit van die ref |
| `repository_dispatch: tms-deploy` | uit het CMS-verzoek; alleen staging of acceptance ([besloten](../beslissingen.md#decided)) | de head van de branch die bij dat environment hoort |
| `push` | — | geen trigger voor CD ([besloten](../beslissingen.md#decided)); de gate faalt met de melding dat CD op `workflow_run` start |

Daarna zoekt de gate per naam in `required-workflows` de nieuwste **push-run** op die commit (`event: push`; een `pull_request`-run test een andere merge en telt niet; re-runs winnen). Elke run moet `success` zijn. Dat werkt voor elk event hetzelfde: bij een release is het de CI-run van de push naar `main`, bij een dispatch vanaf de tag ook.

- **`required-workflows`** staat standaard op `Continuous Integration`: de ene CI-workflow die elke repo heeft ([standaardinrichting](standaardinrichting.md#consumer-config)). Eén naam per regel voor wie afwijkt. Leeg wordt geweigerd: een gate die niets eist, laat alles door.
- **`branch-targets`** staat standaard op `develop=staging acceptance=acceptance`. `main` staat er bewust niet in: een merge naar `main` deployt niets, productie gaat alleen bij een release live ([besloten](../beslissingen.md#decided)). Een repo die wél bij elke merge live wil, zet `main=production` erbij.
- **Handmatig starten:** het doel komt uit de ref waarvan je start, niet uit een keuzelijst. "Use workflow from" → `develop` deployt staging; → tag `v1.4.0` deployt productie, mits dat de nieuwste release is. Een oudere tag is rood ([geen rollbacks](../beslissingen.md#decided)); een branch zonder environment ook. Zo kan het gedeployde environment nooit afwijken van wat je koos, en sluit het aan bij de branchregels van de environments: `production` laat alleen tags toe. Dit is de manier om de nieuwste release opnieuw te deployen, bijvoorbeeld na een wijziging in 1Password; *Re-run all jobs* op de laatste CD-run doet hetzelfde.
- **Het CMS deployt alleen naar staging.** Een `repository_dispatch` draait op de default branch, en `production` laat alleen tags toe; een CMS-deploy naar productie zou GitHub dus weigeren. Vertalingen gaan live met de volgende release. Andere CMS-acties, zoals `tms-validate`, slaat de gate over.
- **De gate wacht nooit.** Hij leest één keer af en is in seconden klaar. Hoe het dan toch altijd na groene CI komt: [hieronder](#gate-outcomes).

<a id="gate-outcomes"></a>

### Rood, groen of overgeslagen

Overslaan is iets anders dan falen. De gate is rood bij een configuratiefout of een handeling die niets anders nog een keer probeert; hij slaat over als een andere run het werk doet of CI zelf al rood is.

| Situatie | Uitkomst |
| --- | --- |
| De CI-run die CD startte, is niet geslaagd | De hele CD-run wordt **overgeslagen** (grijs): de aanroeper zet `if: github.event_name != 'workflow_run' \|\| github.event.workflow_run.conclusion == 'success'` op de gate-job, zoals gp-container-tracking. `workflow_run` vuurt op "completed", niet op "succeeded". |
| Een andere vereiste CI-workflow loopt nog | `proceed: false`, **groen**: niet mijn beurt. De gate die díe run straks start, deployt. |
| Een andere vereiste CI-workflow is gefaald | `proceed: false` met een **waarschuwing** (geel). CI zelf is al rood; een tweede rode run voegt niets toe. |
| Twee CI-workflows allebei groen | Precies één gate deployt: beide rekenen uit welke CI-run het laatst klaar was (`updated_at`, tie-break op id), en alleen de gate die door die run gestart is, gaat door. Deterministisch, zonder gate-runs te vergelijken; overgenomen van gp-map. |
| Geen push-run van een vereiste workflow op deze commit | **Rood**: verkeerde naam in `required-workflows`, of een `paths:`-filter op die workflow. |
| Release of dispatch, en CI is niet klaar of niet geslaagd op die commit | **Rood**: niets anders probeert het opnieuw. Bij "te vroeg een release gepubliceerd": wacht op groen en *Re-run all jobs*. |
| Lege `required-workflows`; dispatch vanaf een branch zonder environment of een tag die niet de nieuwste release is; CMS vraagt productie | **Rood**, met de melding wat er mis is. |

- **Een release telt alleen de CI op `main`.** De gate eist een geslaagde run op de commit van de tag, en dat is de merge-commit op `main`. De groene PR-run `develop → main` telt niet: die draaide op een andere commit. Publiceer de release dus pas als het vinkje op `main` er staat.
- **CI rood, dan gefixt of opnieuw gedraaid:** een re-run vuurt opnieuw `workflow_run`, dus CD volgt vanzelf. De gate neemt altijd de nieuwste run per workflow.
- **Dubbele deploy van dezelfde commit** (bijvoorbeeld door een CI-re-run na een groene run) is onschuldig: de concurrency-groep van de deploy-job zet hem in de rij en hij deployt hetzelfde nog een keer.

### Hoe het eruitziet in een repo

```
on:
  workflow_run:
    workflows: [Continuous Integration]
    types: [completed]
    branches: [develop, acceptance]      # head-branch van de CI-run; een PR-run vuurt zo nooit
  release:
    types: [published]
  workflow_dispatch:                     # geen inputs: het doel komt uit de gekozen branch of tag
  repository_dispatch:                   # alleen repo's met het vertalingen-CMS
    types: [tms-deploy]

permissions: { contents: read, actions: read }

jobs:
  gate:
    if: github.event_name != 'workflow_run' || github.event.workflow_run.conclusion == 'success'
    uses: …/cd-gate.yml@v2             # required-workflows en branch-targets hebben een standaard
  deploy:
    needs: gate
    if: needs.gate.outputs.proceed == 'true'
    uses: …/cd-vercel.yml@v2           # of cd-swarm, cd-supabase, cd-packages
    with:
      environment: ${{ needs.gate.outputs.target }}
      ref: ${{ needs.gate.outputs.sha }}
    secrets: inherit
```

Eén deploy-job voor alle environments; de gate vult in waarheen en wat.

### Wat de gate níet doet

- Hij controleert geen code. Dat doet CI; de gate controleert alleen dát CI op deze commit geslaagd is.
- Hij weet niets van Vercel, Swarm of Supabase, en werkt daardoor vóór elke cd-workflow.
- Hij bepaalt niet wie mag deployen. Dat doen de branchregels van de environment en, voor productie, de tag-ruleset op `v*`: alleen een senior maakt een release-tag.
- Hij dwingt zelf niets af. De gate staat in de YAML van de repo, en een branch kan die YAML veranderen of de gate weglaten. Wat de deploy echt tegenhoudt, zijn de branchregels van de environment ([standaardinrichting](standaardinrichting.md#consumer-config)): GitHub weigert een job in `production` vanaf een ref die er niet in mag, en de secrets blijven dicht. Let op: GitHub toetst de ref van de run, en dat is bij `workflow_run` en `repository_dispatch` altijd de default branch; daarom laten `staging` en `acceptance` ook `main` toe. De gate zorgt dat een toegestane ref ook nog gecontroleerd is.

### Twee dingen om te weten

- **Welk `cd.yml` draait, hangt van het event af.** `workflow_run`- en `release`-runs gebruiken het workflowbestand van de **default branch**; een `workflow_dispatch` gebruikt het bestand van de **gekozen branch of tag**. Een aangepaste `cd.yml` test je dus door hem naar `develop` te mergen en handmatig vanaf `develop` te starten: dat deployt staging met het nieuwe bestand. Voor de automatische develop-deploys en voor releases geldt de wijziging pas na merge naar `main`. Vanaf een featurebranch testen kan niet: het environment weigert die branch.
- **De gate is de eerste bouwsteen die getest wordt**, met de voorbeeldrepo uit principe 8, vóór er een cd-\* omheen komt. Het testplan staat bij de [uitrol](uitrol-in-detail.md#gate-tests).

gp-map-webapp heeft zo'n gate al, als ongeveer 70 regels eigen script in vm-cd.yml, en die is de basis van cd-gate: dezelfde opzoeking op `head_sha` en `event: push`, dezelfde ontdubbeling, hetzelfde doel-uit-de-ref bij een handmatige start. v2 maakt er een gedeelde, instelbare versie van en voegt toe wat gp-map niet doet: CI controleren bij een release en een handmatige start, alleen de nieuwste release toelaten, `acceptance`, en de CMS-trigger. Het is een herbruikbare workflow en geen composite action, zodat de deploy-job er `needs:` op kan zetten.

<a id="services"></a>

## `setup-services` composite action · nieuw · postgres, supabase, redis, 1password

Eén composite action voor alle diensten die een job nodig heeft. Aan zodra je een waarde invult. Hij voert nooit een check uit. CI en elke CD-workflow gebruiken hem.

| Input | Effect |
| --- | --- |
| `database: postgres` | De `docker run` met wachten op de TCP-poort uit backend-ci, ongewijzigd. Exporteert `DATABASE_URL`. |
| `database: supabase` | Het service-deel van run-supabase-test, via het nieuwe `setup-supabase`: CLI, `supabase start`, seed en sleutels. Exporteert `DATABASE_URL`, `SUPABASE_URL`, `SUPABASE_ANON_KEY` en `SUPABASE_SERVICE_ROLE_KEY`. `supabase-skip-unchanged` slaat de stack over als er niets onder supabase/ veranderd is; ci.yml zet dat alleen aan als `dbtest` de enige check is. |
| `redis: true` | Redis op 6379, exporteert `REDIS_URL`. ci-images heeft hem nodig voor backends die zonder Redis niet opstarten. |
| ingevulde `onepassword-item` | Roept `setup-onepassword` aan. Maskeren en het onderscheid tussen publieke en verborgen velden blijven werken, omdat die action hergebruikt wordt in plaats van gekopieerd. De build-args komen er als één regel met spaties uit; setup-services zet ze om naar één per regel, zoals run-docker-build-push dat nu doet. `onepassword-export-for-vercel` en `onepassword-export-build-args` worden doorgegeven voor cd-vercel en cd-swarm. |
| outputs | `database-url`, `supabase-started`, `build-args`. |

### Waarom postgres en supabase twee waarden van één input zijn

Het zijn verschillende dingen. Postgres is een lege server waar je tests mee praten. Supabase is je databaseproject: de lokale stack voert `supabase/migrations` uit, en pgTAP test ze. De huidige run-supabase-test combineert service en check, en daarom had backend-ci er een tweede hoofdschakelaar voor nodig.

- **Eén vraag, één antwoord:** "tegen welke database draait deze job?" Twee booleans maken `postgres-enabled: true` naast `database: supabase` mogelijk, en dat betekent niets.
- **De check is een script:** `"dbtest": "supabase test db"`, in de `checks`-lijst. De service start de stack; het script test hem.
- **Wat dit mogelijk maakt:** een Node- of Python-testsuite die tegen een lokale Supabase-stack draait met de geëxporteerde sleutels. Dat kan nu niemand.

<a id="run-translations"></a>

## `run-translations` composite action · nieuw · vertalingen-CMS, uit feature/tms-prototype

De branch `feature/tms-prototype` koppelt `@pursuit-amsterdam/translations-management` aan web-ci en web-cd via zeven losse stappen. v2 houdt hetzelfde gedrag en dezelfde volgorde, maar zet de logica in één composite action.

### Composite action `run-translations`

| Input | Betekenis |
| --- | --- |
| `command` | `sync` · `ack` · `pull` · `mark-deployed` · `mark-failed`. Draait `pnpm exec translations …`; de CLI moet een dependency van het project zijn, en dat vraagt om `use-custom-token` omdat het pakket privé is. |
| `release-id` `reason` | Voor `ack` en `mark-*`. Een leeg release-id betekent de nieuwste openstaande release, zoals de CLI die bepaalt. |
| `working-directory` | Het pakket met de app en zijn woordenboeken. De CLI bepaalt het project aan de hand van de map waarin hij draait; in de root van een monorepo vindt hij geen woordenboeken en meldt hij toch succes. |
| `tms-url` `tms-api-key` | Reservewaarden. Een waarde uit het 1Password-item gaat altijd voor; de action faalt meteen als URL of sleutel uit geen van beide bronnen komt. |

### Waar hij draait

| Workflow | Stap | Positie | Waarom daar |
| --- | --- | --- | --- |
| `ci.yml` | `sync` | na de checks, alleen op `tms-sync-branch` | Code die niet compileert is geen betrouwbare bron om te bepalen welke sleutels weg mogen. Synchroniseren vanaf een featurebranch registreert sleutels die misschien nooit gemerged worden. |
| `cd-vercel.yml` | `ack` | direct na de setup en de secrets | Een release waar het CMS op wacht verloopt na 3 minuten, tenzij hij bevestigd wordt; dan wordt dat 30 minuten. Alles wat ervoor gebeurt, gaat van die tijd af. Er zijn geen verplichte reviewers (Team-plan) en het CMS deployt alleen naar staging, dus niets wacht vóór `ack`. |
| `pull` | vóór de build | Herschrijft de woordenboeken en genereert `settings.ts` / `types.ts` opnieuw, zodat de deploy de gepubliceerde versie meeneemt. |  |
| `mark-deployed` / `mark-failed` | na de deploy, op `success()` / `failure()` | Het CMS ziet de deploy zelf niet. Zonder dit wordt een release die live staat, na afloop als mislukt gemarkeerd. `mark-deployed` scant ook de broncode op het sleutelmanifest dat de controle vóór publicatie naar productie gebruikt. |  |

### Wat er ten opzichte van de branch veranderd is

- **`tms_sync` + `tms_sync_branch` worden `tms-sync-branch`.** Leeg betekent niet synchroniseren. De waarde is de branch, en de branch ís de hele configuratie.
- **`tms_enabled` wordt `tms`, nog steeds een boolean.** Een waarde kan de keuze hier niet dragen: het release-id is bij `workflow_run`- en release-runs terecht leeg, en de CLI kiest dan de nieuwste openstaande release. De beschrijving van de input legt dat uit.
- **`release_id` wordt `tms-release-id`.** Aanroepers geven `github.event.client_payload.release_id` mee. Het CMS stuurt hem bij `repository_dispatch`; bij elk ander event is hij leeg en kiest de CLI de nieuwste openstaande release.
- **De logica voor credentials staat één keer in de action,** in plaats van twee keer per workflow. De reservesleutel wordt gemaskeerd.
- **De gate handelt de CMS-trigger af, en alleen naar staging.** De huidige tms-test-aanroeper stuurt `repository_dispatch` naar de juiste job, maar bouwt de code van de default branch. cd-gate bepaalt `sha` aan de hand van de branch van de environment. Productie kan het CMS niet vragen ([besloten](../beslissingen.md#decided)): zo'n run draait op `main`, en `production` laat alleen tags toe. Vertalingen voor productie gaan mee met de volgende release.
- **cd-swarm kan dezelfde vier stappen krijgen**, met `pull` vóór de image-build en `mark-*` in de deploy-job. Niet uitgewerkt; nog geen Swarm-project gebruikt het CMS.

De branch wordt niet zelf gemerged. De functionaliteit wordt in v2 opnieuw gebouwd via de action; de README-tekst verhuist naar de v2-README. De branch blijft als referentie staan tot v2 klaar is, en kan daarna weg.

<a id="setup-supabase"></a>

## `setup-supabase` composite action · afgesplitst van run-supabase-test

Het service-deel van het huidige `run-supabase-test`, met hetzelfde gedrag: wijzigingen detecteren ten opzichte van de basiscommit, de CLI installeren op de versie uit de lockfile van de repo (`supabase` als devDependency; zonder lockfile-versie faalt de stap, in plaats van stil `latest` te nemen), `supabase start`, de seed, en de URL's en sleutels als outputs. `setup-services` roept hem aan voor `database: supabase`. Het testdeel wordt een script in de repo: `"dbtest": "supabase test db"`. Let op: dat commando faalt op een lege testsuite (`NOTESTS`), waar run-supabase-test het nu stil overslaat. Een repo zonder pgTAP-tests zet `dbtest` dus niet in `checks`; `supabase start` voert de migraties dan nog steeds uit, als `database: supabase` bij een andere check staat. `run-supabase-test` zelf verdwijnt in v2.

<a id="run-image-smoke"></a>

## `run-image-smoke` composite action · nieuw · uit gp-map-webapp

Krijgt een lokaal geladen image en één object uit de `images`-JSON. Start de container met de dummy-`env` op `port`, wacht tot `health-path` reageert, loopt de `smoke`-lijst af (`path status`), voert de `exec`-commando's uit, toont de logs bij een fout en ruimt altijd op. Doet niets als het object geen `health-path`, `smoke` of `exec` heeft. ci-images gebruikt hem op de build van de PR; cd-swarm op de build die hij gaat pushen. Eén implementatie, zodat "het image start" in CI en CD hetzelfde betekent.

<a id="run-codegen"></a>

## `run-codegen` composite action · nieuw · gedeeld door elke cd-\* die bouwt

Draait het `codegen`-script van de repo, daarna het script `typecheck`, en met `codegen-check` ook een vergelijking met de gecommitte versie van de externe bron. Vóór de codegen kopieert hij de bestanden uit `codegen-baseline` (bijv. `openapi.json`) naar `$CODEGEN_BASELINE`; daarna haalt het codegen-script de bron opnieuw op, en vergelijkt het script van de repo, bijv. `oasdiff breaking "$CODEGEN_BASELINE/openapi.json" openapi.json`. Doet niets als `codegen` leeg is en er niets anders gegenereerd is. cd-vercel, cd-swarm, cd-pages en cd-packages gebruiken hem; cd-supabase niet, want daar speelt codegen niet. Eén implementatie, zodat "gegenereerde code is gecontroleerd" overal hetzelfde betekent.

- **De basis zit in de commit.** CI keurde de commit goed mét die spec; er is geen artefact nodig.
- **Een opgehaalde spec wordt gecommit.** Zonder gecommit bestand is er niets om mee te vergelijken; `codegen-check` zonder `codegen-baseline`, of met een bestand dat niet in de repo staat, wordt geweigerd.
- **Optioneel in CI:** controleren of de gecommitte spec nog gelijk is aan de live spec, als waarschuwing en niet als fout. Anders breekt elke wijziging bij de andere service alle open PR's. Niet uitgewerkt.

## Bestaande actions namen blijven; wat er per action verandert

Voor alle bestaande actions geldt principe 8: de externe actions erin (`pnpm/action-setup@v4`, `actions/setup-node@v4`, `astral-sh/setup-uv`, de 1Password-actions, `supabase/setup-cli@v1`) gaan van een tag naar een vaste commit. Dat verandert hun interface niet.

| Action | Gebruikt door | Wijziging in v2 |
| --- | --- | --- |
| `setup-node-pnpm` | ci, cd-vercel, cd-pages, cd-packages; en 5 library-repo's rechtstreeks | krijgt `--frozen-lockfile` en een optionele input `working-directory` (standaard `.`). Nu draait een kale `pnpm install` altijd in de root van de repo, en leest `pnpm/action-setup` het `packageManager`-veld uit de root-`package.json`; een Python-repo met alleen `backend/package.json` faalt dan. ci.yml en de cd-\*'s geven hun `working-directory` door. Bestaande aanroepers merken niets. |
| `setup-python` | ci | `uv sync --frozen` in plaats van een kale `uv sync`. ci.yml geeft de map met de `pyproject.toml` mee als `working-directory`, ook als die in een submap staat. |
| `setup-onepassword` | alleen setup-services | geen in v2 zelf; geen enkele workflow roept hem nog rechtstreeks aan. `hotfix/mask-concealed-fields-only` wijzigt wel het maskeren (zie [openstaande branches](auditbevindingen.md#audit-branches)). |
| `setup-version` | cd-vercel, cd-swarm; sluyter-logistics-automations rechtstreeks | geen aan de action. Wel aan de aanroep: web-cd geeft `framework: "nextjs"` mee, maar de action test op `next`, dus `NEXT_PUBLIC_VERSION` is nooit gezet. cd-vercel geeft `next` mee. |
| `run-pnpm-build-test` `run-python-checks` | — | niet meer gebruikt in v2: checks zijn scripts in de repo. Blijven op `main` voor v1. |
| `run-codegen` | elke cd-\* die bouwt | de oude action (codegen-commando als input) wordt op `v2` vervangen door de [nieuwe](#run-codegen) met dezelfde naam (script uit de repo, typecheck, vergelijking). Zelfde naam, andere inputs; niemand roept de oude rechtstreeks aan. |
| `run-docker-build-push` | sluyter-logistics-automations rechtstreeks | geen. cd-swarm en ci-images gebruiken hem niet: ze laden en testen een image eerst en pushen pas daarna, en deze action bouwt en pusht in één stap. |
| `deploy-vercel` | cd-vercel | wijzigingen: `staging` blijft het custom environment `staging` (`vercel pull --environment=staging`, `--target=staging`), zoals in v1 ([besloten](../beslissingen.md#decided)); `production` is `--prod`. De sync van `vercel-project-env-keys` schrijft voor staging naar `preview`, zoals v1; Vercel draait crons alleen op productie, dus `CRON_SECRET` doet buiten productie niets. Uitbreidingen: output `url` (de deployment-URL), voor de health-check; de Vercel-CLI op een vaste versie in plaats van `vercel@latest`; en een validatie van `build-mode`: een andere waarde dan `github` of `vercel` faalt, net als een `environment` anders dan `staging` of `production` (acceptance op Vercel is niet besloten; een typfout mag nergens heen deployen), in plaats van beide deploy-stappen over te slaan en groen te worden; en een input `working-directory` (standaard `.`), want de `defaults.run.working-directory` van de job bereikt de stappen van een composite action niet. Getest met `scripts/deploy-vercel-cases.sh` (onderdeel van `pnpm test`). |
| `deploy-supabase` | — | niet meer gebruikt: cd-supabase draait `db push` zelf. De action doet een eigen checkout zonder `ref`, en migreert dus mogelijk een andere commit. Hij installeert de CLI opnieuw en negeert `working-directory`. Blijft op `main` voor v1. |
| `deploy-swarm` | cd-swarm | uitbreiding: `pre-deploy`, plus `environment` en `version`, die het script als variabelen krijgt. De bestaande inputs, zoals het verplichte `github-token`, blijven gelijk. |

---

[← De CD-workflows](cd.md) · [Overzicht](../README.md) · [Standaardinrichting →](standaardinrichting.md)
