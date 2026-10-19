<a id="design"></a>

# Het ontwerp in acht principes

Acht regels. Elke regel lost een probleem uit de audit op. De uitwerking per workflow staat in de naslag.

<a id="vocab"></a>

## 1 Elke input hoort bij één van drie groepen

Aan een aanroep zie je meteen wat er gebeurt: wat er geïnstalleerd wordt, wat er gecontroleerd wordt, en waartegen. Een input in de ene groep zet nooit iets in een andere groep aan of uit.

**Toolchain: wat installeren we?** Wat nodig is om de scripts van de repo te draaien: node en pnpm altijd, Python als de repo dat vraagt (principe 7). `working-directory` zegt waar het project staat, `use-custom-token` geeft toegang tot private packages.

**Checks / Build: wat doen we met de code?** In CI kies je in de verplichte lijst `checks` welke scripts draaien, bijvoorbeeld `lint typecheck test`. Wat elk script doet, staat in de repo (principe 7). In CD gaat het om bouwen en deployen (`build-mode`, `images`, `stack-file`), plus de controles die alleen CD kan doen: typecheck na gegenereerde code en een health-check na de deploy.

**Services / Target: waarmee en waarheen?** De diensten waar een job mee werkt: een database (postgres of supabase), Redis en secrets uit 1Password. In CD komt daar het doel bij: `environment` (verplicht) en `ref`, de commit die uitgerold wordt. Een lege vault of item valt terug op de variabelen van die environment. De inputs voor het vertalingen-CMS horen ook in deze groep.

Geen hoofdschakelaars: een vlag zet nooit een andere input of een hele groep aan of uit. Waar een waarde de keuze kan dragen, vervangt die de vlag: `database`, `onepassword-item`, `health-path`, `tms-sync-branch`. De booleans die overblijven (`use-custom-token`, `supabase-seed`, `redis`, `prepare-package`, `migrations`, `deploy-enabled`, `tms`) bepalen alleen hoe hun eigen stap werkt. Inputnamen zijn kebab-case (`onepassword-vault`), nooit snake_case.

**Lost op:** drie soorten schakelaars door elkaar, tegenstrijdige standaardwaarden, ongebruikte inputs.

<a id="p-green"></a>

## 2 Een run die niets controleert, faalt

Een configuratiefout mag nooit tot een groene run leiden. Doet een workflow door zijn instellingen niets, dan faalt hij met een melding die zegt wat er mis is.

- Voorbeelden: een lege `checks`-lijst, ci-images zonder stack en zonder images, een CD-run zonder iets om te deployen.
- Vraag je een check die de repo niet kent, dan faalt de run ook. Met turbo geldt dat ook voor een taak die in geen enkel pakket een script heeft.
- Overslaan omdat er niets veranderd is, is iets anders: dat mag, en de log zegt waarom. Voorbeelden: een image waarvan de paden niet veranderd zijn, of `dbtest` als enige check terwijl er onder `supabase/` niets veranderd is.

**Lost op:** drie Python-repo's die groen staan zonder één check.

<a id="p-env"></a>

## 3 Eén deploy-job voor alle environments

Wat per environment verschilt, zoals vault, item, host en Supabase-project, staat als variabele in de GitHub-environment. De aanroeper geeft alleen mee naar welke environment er gedeployd wordt. Drie repo's werken al zo.

**Lost op:** 25 repo's met een staging- en een productiejob die alleen in namen verschillen.

<a id="p-gate"></a>

## 4 Alleen een commit die CI goedkeurde, wordt gedeployd

`cd-gate` staat vóór elke deploy en beantwoordt drie vragen: mag deze run deployen, naar welke environment, en welke commit precies?

- Hij deployt alleen als de verplichte CI-workflows op precies die commit geslaagd zijn.
- Per commit start hij één deploy, ook als er meerdere CI-workflows zijn.
- Per app en environment draait één deploy tegelijk. Een volgende wacht; een lopende deploy wordt nooit afgebroken.
- Handmatig starten doe je vanaf een branch of een tag, en dat bepaalt het doel: `develop` → staging, de tag van de nieuwste release → productie. Terugzetten naar een oudere versie wordt niet ondersteund ([besloten](beslissingen.md#decided)); herstellen gaat vooruit, met een nieuwe commit.
- De gate staat in de YAML van de repo, en een branch kan die YAML wijzigen. Afgedwongen wordt het daarom door de environment: alleen de branch die bij een environment hoort, mag erin deployen en bij zijn secrets ([standaardinrichting](naslag/standaardinrichting.md#consumer-config)).

**Lost op:** deploys zonder geslaagde CI, dubbele of gelijktijdige deploys, en de code van `main` die als staging live gaat. Details: [cd-gate](naslag/bouwstenen.md#gate).

<a id="p-cd"></a>

## 5 CD controleert alleen wat CI niet kon zien

Lint en tests hangen alleen van de broncode af, en die heeft CI al gecontroleerd. CD doet ze niet opnieuw. Het controleert wat er bij een deploy anders is:

- **Gegenereerde code** (codegen, vertalingen): typecheck vóór de build. Komt de bron van buiten, zoals een OpenAPI-spec, dan ook een vergelijking met de gecommitte versie.
- **Het gebouwde image:** starten en testen vóór de push.
- **De draaiende app:** health-check na de deploy.

**Lost op:** dubbel werk bij 56 deploy-aanroepen, en geen controle op precies dat wat CD toevoegt. Details: [wat CD controleert](naslag/cd.md#cd-checks).

<a id="p-manual"></a>

## 6 Wat nu met de hand gaat, doet CD

Alles wat bij een deploy hoort, gebeurt in dezelfde run en op dezelfde commit.

- **Supabase:** secrets, migraties en edge functions, vóór de app.
- **Swarm:** vóór de deploy controleren dat de server klaar is, met een script dat als deploy-gebruiker draait en de deploy stopt als er iets ontbreekt.
- **Vertalingen-CMS:** sleutels synchroniseren in CI, vertalingen ophalen en de release melden in CD.

**Lost op:** functions die achterlopen op de app, secrets die alleen een org-admin kan zetten, een vergeten runbookstap die pas na de deploy opvalt, en een CMS-koppeling die alleen op een losse branch bestaat. Details: [cd-supabase](naslag/cd.md#cd-supabase), [cd-swarm](naslag/cd.md#cd-swarm), [run-translations](naslag/bouwstenen.md#run-translations).

<a id="p-scripts"></a>

## 7 De repo bepaalt het commando

De workflow bepaalt wanneer en welke checks draaien. Wat een check doet, staat in de repo. Lokaal en in CI draai je zo hetzelfde commando. De huidige invulling is `package.json`-scripts met pnpm; een andere taakrunner, bijvoorbeeld voor infra, past in hetzelfde principe.

- Elke repo heeft een `package.json`, ook een Python-project: `"lint": "uv run ruff check ."`. De scripts zijn de namen waarmee CI de checks aanroept ([besloten](beslissingen.md#decided)).
- Meer dan één workspace betekent turbo: één job voor frontend én backend, en bij een PR alleen de pakketten die veranderd zijn ([besloten](beslissingen.md#decided)).
- Ook in CD: codegen en de typecheck zijn scripts, en de Node-versie komt uit `.nvmrc`.
- Runtimes en versies komen uit de repo: een `pyproject.toml` betekent uv, `.nvmrc` en `.python-version` geven de versie.

Voorbeeld: frontend en backend in één repo

```
# turbo.json
{ "tasks": { "lint": {}, "typecheck": {}, "test": {}, "build": {} } }

# .github/workflows/ci.yml
jobs:
  run-ci:
    uses: …/ci.yml@v2
    with:
      checks: lint typecheck test build
      database: postgres
    secrets: inherit
# frontend/ en backend/ hebben elk hun eigen scripts;
# backend/pyproject.toml zorgt dat uv erbij komt.
```

**Lost op:** commando's per taal in de workflow, aparte paden voor node en python, verschil tussen lokaal en CI, en twee CI-jobs voor één repo. Details: [ci.yml](naslag/ci.md#ci).

<a id="p-self"></a>

## 8 De workflows zelf worden getest en vastgepind

De workflows-repo houdt zich aan dezelfde regels als de repo's die hem gebruiken.

- Eigen CI bij elke PR: actionlint, shellcheck, `check-pr.sh`, en een voorbeeldrepo die de workflows aanroept zoals een echte repo dat doet.
- Externe actions staan op een vaste commit in plaats van een tag, en Dependabot houdt ze bij. Dat geldt ook voor de bestaande actions, niet alleen voor de nieuwe.
- De branch `v2` is beschermd zoals `main` van een productrepo: review van code owners, geen force push, eigen CI verplicht. Hij draait met de secrets van elke repo die hem aanroept.

**Lost op:** fouten die pas bij een afnemer opvallen, zoals de `framework`-input die vijf repo's liet falen, externe actions die ongemerkt veranderen, en één push die code in elke afnemer laat draaien.

---

[← Use cases](use-cases.md) · [Overzicht](README.md) · [Uitrol →](uitrol.md)
