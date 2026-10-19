<a id="ci-workflows"></a>

# De CI-workflows

Twee bestanden. `ci.yml` controleert een codebase; `ci-images.yml` controleert de images die eruit gebouwd worden. Beide gebruiken dezelfde drie groepen inputs en dezelfde services-action.

<a id="ci"></a>

## `ci.yml` vervangt web-ci, backend-ci en fullstack-ci · 40 aanroepen

De workflow kiest wanneer en welke checks draaien; de scripts in de repo bepalen wat een check doet (principe 7). Elke input, met de v1-input die hij vervangt.

| Input | Type | Standaard | Vervangt |
| --- | --- | --- | --- |
| Toolchain |  |  |  |
| *geen input* | node + pnpm, altijd | `toolchain: node`. Versie uit `.nvmrc`, anders 22.x; vervangt `node-version`. |  |
| *geen input* | uv + Python, als er een `pyproject.toml` is | `toolchain: python`, `run-python-checks`. Versie uit `.python-version`, anders 3.12; vervangt `python-version`. |  |
| `working-directory` `use-custom-token` | ongewijzigd | idem |  |
| Checks |  |  |  |
| `checks` | string, verplicht | — | Namen van scripts, gescheiden door spaties, bijv. `lint typecheck test`. Vervangt alle `run-*`-inputs en het testdeel van `run-supabase-test`, dat het script `"dbtest": "supabase test db"` wordt. |
| Services |  |  |  |
| `database` | string | `none` | `postgres-enabled: true` → `postgres` · het `supabase start`-deel van `run-supabase-test` → `supabase`. Beide exporteren `DATABASE_URL` |
| `postgres-*` `supabase-seed` | ongewijzigd | ongewijzigd | `seed` → `supabase-seed` |
| `onepassword-vault` `onepassword-item` | string | `""` | `onepassword_vault` `onepassword_item`; `onepassword_enabled` is vervallen |
| `tms-sync-branch` | string, alleen node | `""` = niet synchroniseren | `tms_sync` + `tms_sync_branch` van de branch. De branchnaam zet het aan: de waarde is de branch die sleutels synchroniseert. |
| `tms-working-directory` | string | `""` = working-directory | `tms_working_directory`. De secrets `TMS_URL` en `TMS_API_KEY` zijn optioneel; het 1Password-item is de normale bron. |
| Vervallen |  |  |  |
| `toolchain` `toolchain-version` `*-command` `codegen` `codegen-command` `generate-*` | staan nu in de repo: als script in `package.json`, of als versie in `.nvmrc` / `.python-version` |  |  |
| `environment` `framework` | nooit gebruikt, of nooit gedeclareerd |  |  |

### Hoe de checks draaien

- **Met `turbo.json`:** `pnpm turbo run <checks>`. Bij een pull request met `--affected`, dus alleen voor pakketten die veranderd zijn. De turbo-cache wordt per branch bewaard.
- **Zonder turbo:** `pnpm run <check>` per naam, in de volgorde van de lijst, in `working-directory`.
- **Codegen** is ook een script. Met turbo zet je het als `dependsOn` bij de checks die het nodig hebben; zonder turbo als eerste naam in de lijst.
- **Docker-images** vallen hierbuiten. Die bouwt elk vanuit zijn eigen Dockerfile en context (ci-images, cd-swarm). Een Python-image heeft geen node nodig: de scripts zijn het contract voor CI, niet voor de runtime. Voor een Node-image in een monorepo kan de Dockerfile `turbo prune <app> --docker` gebruiken, zodat alleen dat pakket en zijn afhankelijkheden in de build komen.

### Wat de validatiestap weigert

- Een lege `checks`-lijst. Anders krijg je wat gp-groot nu heeft: een job die slaagt zonder iets te doen.
- Een check die de repo niet kent: turbo of pnpm faalt dan zelf, met de naam erbij.
- Geen `package.json` in `working-directory`.
- `database` met een niet-toegestane waarde; `onepassword-item` zonder vault of zonder `OP_SERVICE_ACCOUNT_TOKEN`.

### Wat je merkt bij de overstap

- **Je schrijft de lijst één keer uit.** `run-lint: true` wordt `lint` in de lijst.
- **Elke check moet een script zijn.** De meeste Next.js-repo's hebben ze al. Ontbreekt er een, voeg het toe, bijv. `"format": "prettier --check ."`.
- **Python-repo's krijgen een `package.json`** met hun scripts (`"lint": "uv run ruff check ."`) en een `packageManager`-veld, een `pnpm-lock.yaml` (mag leeg zijn, `--frozen-lockfile` eist hem) en een `.python-version`. Staat dat alles in `backend/`, dan draait pnpm daar ook: ci.yml geeft `working-directory` door aan `setup-node-pnpm`.
- **Codegen-instellingen worden een script**, bijv. `"codegen": "pnpm run generate:importmap"`.
- **In gp-groot, automations-blueprint en integrators-automations gaan lint en format echt draaien.** Reken op rood bij de eerste run.
- **`dbtest` faalt op een lege testsuite.** `supabase test db` geeft `NOTESTS`; run-supabase-test sloeg dat stil over. Een repo zonder pgTAP-tests zet `dbtest` niet in `checks`. Staat `database: supabase` bij een andere check, dan voert `supabase start` de migraties nog steeds uit.
- **Overslaan is niet falen.** Is `dbtest` de enige check en is er onder `supabase/` niets veranderd, dan start de stack niet en slaagt de job met die melding in de log. Dat is bewust en past bij principe 2: er is niets om te controleren, en de run zegt dat.

<a id="ci-images"></a>

## `ci-images.yml` nieuw · uit gp-map-webapp

gp-map-webapp heeft een workflow van 190 regels die bij een PR elk image bouwt, start, een health-URL controleert, smoketests draait en opruimt. Op de paden en URL's na is alles algemeen bruikbaar. Het wordt de CI-workflow voor elk Swarm-project, of dat nu eigen images bouwt of niet.

- **Twee jobs, elk aan zodra je een waarde invult.** `stack` draait als `stack-file` ingevuld is; `images` draait als de `images`-lijst niet leeg is. Een project met Dockerfiles geeft allebei mee. Een kant-en-klare stack geeft alleen `stack-file` mee. Geen van beide invullen wordt geweigerd, net als in ci.yml: een job die groen wordt zonder iets te controleren is een configuratiefout, geen succes.
- **Input `stack-file`** nieuw: dezelfde lijst (gescheiden door spaties) van basis + overlay als bij cd-swarm. De job draait `docker compose -f a -f b config`: dat controleert parsen, samenvoegen, onbekende velden en `${VAR}`-verwijzingen die niet op te lossen zijn. Anders merk je een kapot stackbestand pas als de deploy op de manager faalt. Variabelen krijgen dummywaarden uit de optionele `stack-env`-input, zodat verplichte `${VAR:?}`-variabelen een waarde hebben. gp-container-tracking draait precies dit al als `pnpm lint`; CI en lokaal gebruiken dus hetzelfde commando.
- **Input `images`**, standaard `[]`: het JSON-schema van vm-cd en cd-swarm (`name` als volledige imagenaam, `dockerfile`, `context`), per image uitgebreid met `paths` (filter), `port`, `health-path`, `env` (dummywaarden voor de container), `build-env` (dummywaarden als build-args), `smoke` (lijst van `path status`) en `exec` (commando's die met exitcode 0 moeten eindigen). `build-args: public` wordt hier genegeerd, want deze workflow laadt geen 1Password; `build-env` vervangt het. Dat is nodig omdat de [standaardinrichting](standaardinrichting.md#consumer-config) vraagt dat de build faalt op een ontbrekende variabele: een Next.js-image met verplichte `NEXT_PUBLIC_*`-waarden bouwt anders in CI niet, of anders dan in CD. Dezelfde JSON werkt voor CI en CD.
- **Een matrixjob** over die lijst bouwt elk image (`push: false, load: true`, GHA-cache per image) en laat `run-image-smoke` het starten, controleren, testen en opruimen, met logs bij een fout. cd-swarm gebruikt dezelfde action vóór elke push. Images waarvan niets onder `paths` gewijzigd is, worden overgeslagen, niet afgekeurd; de vergelijking is `git diff --name-only <merge-base>..HEAD`, met de basisbranch volledig opgehaald, zodat de merge-base bestaat (dezelfde valkuil die run-supabase-test al eens had). De job draait alleen als de stackjob minstens één image telt. Dat tellen gebeurt met `jq`, niet met een stringvergelijking op `'[]'`, die een lege lijst met spaties of over meerdere regels mist. Een lege matrix geeft anders een harde fout bij het starten van de workflow, in plaats van een overgeslagen job.
- **Naam van de statuscheck.** Een afsluitende job `pipeline` wacht op de stackcheck en de images, en faalt als een van beide faalt. Een repo die alleen ci-images gebruikt, roept hem aan vanuit de job `run-ci`: één verplichte check, `run-ci / pipeline`. Heeft de repo ook ci.yml (zoals gp-map), dan staan beide aanroepen als jobs `run-ci` en `run-ci-images` in **hetzelfde** bestand `Continuous Integration` ([besloten](../beslissingen.md#decided)): twee verplichte checks, één `workflow_run`-event voor de gate.
- **De services-inputs werken hier ook:** `database`, `redis` en `use-custom-token` voor het buildsecret. Geen 1Password: deze workflow draait op `pull_request` en mag geen echte secrets nodig hebben.
- **Input `codegen`** nieuw: naam van het codegen-script, dat vóór de Docker-build op de runner draait, net als in cd-swarm. Zo bouwen CI en CD een image op dezelfde manier.
- **Wat in de repo zelf blijft:** de trigger en de JSON. De trigger heeft geen `paths:`-filter: een verplichte workflow die niet start, laat zijn check op "Expected" staan ([standaardinrichting](standaardinrichting.md#consumer-config)). Wat er gebouwd wordt, bepaalt `paths` per image in de JSON; de stackcheck draait altijd.

---

[← Auditbevindingen](auditbevindingen.md) · [Overzicht](../README.md) · [De CD-workflows →](cd.md)
