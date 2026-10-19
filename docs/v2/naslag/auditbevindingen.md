<a id="audit"></a>

# Auditbevindingen

We hebben elke workflow en elke aanroep in de organisatie nagelopen. Alle 156 aanroepen (147 naar workflows, 9 naar losse actions) verwijzen naar `@main`. Gearchiveerde repo's zijn niet meegeteld.

## Nu kapot

Bij vijf repo's start de CI niet, omdat `web-ci.yml` de input `framework` nooit gedeclareerd heeft.

Negen aanroepers geven `framework: next` mee. De README noemt hem verplicht en geeft hem mee in tien voorbeelden; daar komt hij waarschijnlijk vandaan. GitHub weigert een onbekende input al voordat er ook maar één job draait.

startup_failure bij de laatste run: all-connect-solutions-website · developer-onboarding-project · intersekse-website · provincie-utrecht-demo · unconsultants-website. multifill-planning-tool slaagt op develop, waar de aanroeper `framework` weglaat. De andere vier aanroepers hebben sinds december 2025 of juni 2026 niet meer gedraaid.

Drie Python-repo's staan op groen zonder één check uit te voeren.

Ze zetten `run-lint`, `run-format-check` en `run-test`, maar nooit `run-python-checks: true`. Die hoofdschakelaar staat sinds PR #18 (18 augustus) standaard uit, dus elke stap na de checkout wordt overgeslagen en de job slaagt. PR #21 voegde typecheck toe, maar liet de schakelaar ongemoeid.

gp-groot-automations run 32495275727, automations-blueprint run 34222739996, integrators-automations run 37907490689: Setup Python, Run Python checks, Start Postgres, Load 1Password en de Supabase-stap allemaal `skipped`; job `success`.

## CD doet het verkeerde werk

CD draait lint, typecheck en test opnieuw bij elke deploy, op 56 aanroepen.

web-cd heeft alle `run-*`-inputs van CI en voert die checks uit vóór het deployen. CI heeft dezelfde checks al op dezelfde commit gedraaid. Elke deploy betaalt er dus dubbel voor, en de instellingen kunnen op twee plekken fout staan.

Tegelijk controleert web-cd juist níet wat alleen CD toevoegt. Codegen en (op de TMS-branch) `translations pull` wijzigen de broncode vlak vóór de build: dat is code die CI nooit gezien heeft. En na de deploy controleert niets of de site reageert. De herhaalde checks bevestigen dus vooral wat CI al wist; de controles die alleen CD kan doen, ontbreken.

Alle 56 aanroepen van web-cd geven `platform: vercel` en `build-mode: github` mee.

Niemand gebruikt een andere waarde. `platform` is verplicht, maar weigert niet eens alles wat het niet kent: met `platform: azure-asp` draait geen enkele job en wordt de run groen. 25 repo's hebben een stagingjob en een productiejob die alleen verschillen in `environment` en in de namen van de 1Password-vault en het item.

## Inputs zonder structuur

In CI staan drie soorten inputs door elkaar, met drie soorten schakelaars.

Hoofdschakelaars voor de toolchain (`run-python-checks`, `run-supabase-test`), schakelaars per check (`run-lint`) en servicevlaggen (`postgres-enabled`, `onepassword_enabled`, `seed`) lijken gelijkwaardig, maar zijn het niet. Ook de standaardwaarden spreken elkaar tegen: `run-typecheck` is false in backend-ci en true in web-ci; `run-format` is false in web-ci, `run-format-check` true in backend-ci.

Ongebruikte inputs, ongebruikte bestanden, en één bestand dat helemaal niet herbruikbaar is.

web-ci declareert `environment` maar gebruikt hem nooit (vijf repo's geven hem mee). web-cd declareert `pnpm-version` en `vercel-output-directory` en gebruikt geen van beide. backend-cd, fullstack-ci en codegen worden door niemand aangeroepen. codegen.yml is niet eens een `workflow_call`-workflow: hij start op `pull_request`, dus geen andere repo kan hem aanroepen.

## Handwerk buiten CD

Supabase edge functions worden met de hand gedeployd, en de meeste teamleden kunnen hun secrets niet eens instellen.

CD deployt alleen de app. De functions worden vanaf een laptop gedeployd, en een groene CD-run zegt niets over welke versie daarvan live staat. `supabase secrets set`, en ook de pagina daarvoor in het dashboard, vereist de rol Owner of Administrator op de *organisatie*. Een ontwikkelaar met alle rechten op het project krijgt `not enough privileges`. Die rol geldt voor de hele organisatie; rollen per project zijn er alleen in Team/Enterprise. Iemand die rol geven betekent dus ook toegang tot facturatie en ledenbeheer, alleen om een API-sleutel te kunnen zetten.

`feature/tms-prototype` is nooit gemerged, maar wordt al wel gebruikt.

Drie commits van 19 en 20 augustus voegen het vertalingen-CMS toe aan web-ci en web-cd, als zeven losse stappen (vijf in web-cd, twee in web-ci), met de logica voor credentials twee keer. De branch is afgesplitst vóór de Vercel-crons en de working-directory-fixes. Hij merget nog zonder conflicten, maar de nieuwe stappen houden geen rekening met die fixes; een merge vraagt dus een inhoudelijke review. integrators-website-2025 roept op develop web-ci en web-cd al aan op `@feature/tms-prototype`. tms-test luistert al naar `repository_dispatch: [tms-deploy, tms-validate]`, maar die jobs draaien op de default branch: een `tms-deploy` naar staging zou de code van `main` bouwen en als staging uitrollen. Voor `tms-validate` is niets geregeld.

commits 25e5bf2, 16b041e, 94a8b60 · merge-base 654b5c1 · gebruikt door: tms-test, integrators-website-2025 (develop, 3 aanroepen)

<a id="audit-branches"></a>

## Openstaande branches die v2 raken

Vier branches in deze repo zijn niet gemerged en overlappen met v2.

- `feature/supabase-functions-deploy-and-secrets` (22 sep): een action `deploy-supabase-functions` die functions deployt en secrets zet, aangesloten op web-cd. Dat is het werk van cd-supabase.
- `hotfix/mask-concealed-fields-only`: setup-onepassword maskeert alleen nog `CONCEALED`-velden. Raakt setup-services, dat setup-onepassword hergebruikt.
- `feature/keyvault-from-1password`: een action `sync-keyvault`, de vm-cd-inputs `keyvault-name` en `keyvault-secrets`, en het secret `AZURE_CREDENTIALS`. Staat nog niet in cd-swarm.
- `fix/cd-packages-read-permission`: `packages: read` voor web-cd, zodat `GITHUB_TOKEN` private pakketten mag ophalen. Hoort bij de [detailbeslissing](detailbeslissingen.md#decisions-detail) over leestoegang in plaats van een PAT.

Per branch beslissen: mergen op `main` voordat die bevriest, of meenemen naar `v2`.

## Branchprotectie lekt

De verplichte checks zijn op vier manieren te omzeilen of houden niets tegen.

- **check-pr na een andere base.** Aanroepers starten op `pull_request` zonder `types:`, dus niet op `edited`. Open `feature/x` → `develop`, de check wordt groen; zet de base om naar `main`, en de groene check op dezelfde commit blijft staan.
- **Twee checks met dezelfde naam.** In gp-map-webapp roepen web-ci.yml en backend-ci.yml allebei aan vanuit de job `run-ci`. Er staan twee checks `run-ci / pipeline` op elke commit; de branchprotectie ziet één naam, en een rode backend kan wegvallen achter een groene web-run.
- **Een workflow die niet start.** Met `paths:` op workflow-niveau blijft een verplichte check op "Expected" staan. Daarom is de image-check van gp-map niet verplicht, en controleert de branchprotectie geen images.
- **Een PR draait zijn eigen CI.** De workflow-YAML komt van de PR-branch. Een PR die de checks uitkleedt, wordt groen; alleen een review houdt dat tegen.

Kleiner: check-pr krijgt head en base als inputs van de aanroeper, terwijl ze in het event staan, en doet een checkout die niets doet. template-nextjs-vercel en tellr-webapp draaien check-pr alleen bij `branches: [main, develop]`, dus een PR op een andere branch krijgt geen check.

gecontroleerd in gp-map-webapp, template-nextjs-vercel, tellr-webapp en deze repo

<a id="audit-config"></a>

## Repoconfiguratie loopt uit de pas

Vier van zes onderzochte repo's missen verplichte checks of bescherming; environmentnamen verschillen in hoofdletters.

Branchprotectie, environments en variabelen komen in geen enkele PR voorbij. template-nextjs-vercel, de basis voor elke nieuwe site, vereist geen enkele check en staat force push toe.

Hoe zes repo's er nu voor staan steekproef

| Repo | Bescherming | Environments | Vars | Toelichting |
| --- | --- | --- | --- | --- |
| gp-map-webapp | ok beide checks verplicht op main en develop, strict, 1 review, geen force push | integration, staging, production, github-pages, copilot | geen | De referentie. Hosts en 1Password-namen staan hardcoded in de YAML. |
| tellr-webapp | ok `frontend-ci / pipeline`, `backend-ci / pipeline` en `run-check-pr / pipeline` verplicht op beide | integration, staging, preview, Production, github-pages | geen | Environmentnamen met hoofdletters door elkaar. Twee CI-jobs met elk een eigen id in één bestand; die namen veranderen bij de overstap. |
| template-nextjs-vercel | 1 review, geen verplichte checks, force push toegestaan | integration, Preview, Production; geen staging | geen | Elke nieuwe site kopieert deze repo, inclusief de gaten. |
| pursuit-website-2025 | geen verplichte checks (main: strict aan, maar zonder checks); develop staat force push toe | integration, Staging, Production, Preview, github-pages | geen | Geen dependabot.yml. |
| gp-groot-automations | main niet beschermd | integration, production | OP\_\*, VM_SSH\_\* op production en dubbel op repo-niveau | Gebruikt het vars-patroon al. |
| tms-test | niets beschermd | integration, staging, Production | geen | Luistert al naar de CMS-trigger. |

34 repo's roepen check-pr aan. Of die check verplicht is, is een instelling per repo, en in deze steekproef vereisen slechts twee van de zes hem.

Inventarisatie van de aanroepen 156 aanroepen, allemaal op @main

| Workflow | Repo's | Aanroepen | Toelichting |
| --- | --- | --- | --- |
| `web-ci.yml` | 34 | 34 | 9 geven het ongedeclareerde `framework` mee; 5 geven het ongebruikte `environment` mee; 2 gebruiken codegen |
| `backend-ci.yml` | 6 | 6 | 1 Python + Postgres, 3 Python zonder hoofdschakelaar, 2 alleen Supabase |
| `web-cd.yml` | 29 | 56 | 25 repo's met twee of meer jobs die alleen in environment en 1Password verschillen; 48 aanroepen gebruiken 1Password; 5 `prepare-package`; 3 codegen |
| `storybook-cd.yml` | 11 | 11 | Gebruikt alleen de inputs node-version, use-custom-token en working-directory |
| `vm-cd.yml` | 5 | 6 | gp-map-webapp (staging + productie), gp-groot-automations, automations-blueprint, integrators-automations, gp-container-tracking-webapp |
| `fullstack-ci.yml` `backend-cd.yml` `codegen.yml` | 0 | 0 | Verwijderen in v2 |
| composite actions, rechtstreeks aangeroepen | 6 | 9 | `setup-node-pnpm` (5 library-repo's, 7 aanroepen), `run-docker-build-push` + `setup-version` (sluyter-logistics-automations). Deze namen en interfaces blijven. |

---

[← Naslag](README.md) · [Overzicht](../README.md) · [De CI-workflows →](ci.md)
