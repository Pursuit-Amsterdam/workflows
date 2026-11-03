<a id="usecases"></a>

# Use cases

Wat de workflows moeten kunnen, afgeleid uit de huidige repo's. De laatste kolom toont welke principes het geval dekken.

| # | Use case | Voorbeeld | Principes |
| --- | --- | --- | --- |
| CI: code controleren |  |  |  |
| 1 | Next.js-site: lint, format, typecheck, test, build | 34 repo's | [1](principes.md#vocab) [2](principes.md#p-green) [7](principes.md#p-scripts) |
| 2 | Python-backend, eventueel tegen Postgres of Redis | gp-map, gp-groot, den-haag-casusregie (Redis) | [1](principes.md#vocab) [2](principes.md#p-green) [7](principes.md#p-scripts) |
| 3 | Database tests (pgTAP) tegen een lokale Supabase-stack | basko, tellr | [1](principes.md#vocab) [2](principes.md#p-green) [7](principes.md#p-scripts) |
| 4 | Frontend en backend in één repo: node én python | gp-map, tellr | [7](principes.md#p-scripts) |
| 5 | Codegen vóór de checks | 2 repo's | [7](principes.md#p-scripts) |
| 6 | Swarm-project: stackbestanden en eigen images controleren | gp-map | [1](principes.md#vocab) [2](principes.md#p-green) |
| 7 | Swarm-stack van kant-en-klare images: alleen de stackbestanden controleren | gp-container-tracking | [2](principes.md#p-green) |
| 8 | Vertaalsleutels naar het CMS, alleen op de integratiebranch | tms-test | [6](principes.md#p-manual) |
| 31 | Tests in een echte browser (Playwright), zoals Storybook-verhalen als Vitest-tests: de browser hoort bij de Playwright-versie van de repo en wordt per versie bewaard | den-haag-casusregie | [1](principes.md#vocab) [7](principes.md#p-scripts) |
| CD: uitrollen |  |  |  |
| 9 | Next.js naar Vercel: staging bij een push op `develop`, productie bij een release; bouwen op GitHub of op Vercel | 29 repo's | [3](principes.md#p-env) [4](principes.md#p-gate) [5](principes.md#p-cd) |
| 10 | Statische site (storybook) naar GitHub Pages | 11 repo's | [4](principes.md#p-gate) |
| 11 | Docker Swarm op een eigen VM: bouwen, migreren, deployen | gp-map, gp-groot | [3](principes.md#p-env) [4](principes.md#p-gate) [5](principes.md#p-cd) |
| 12 | Docker-image per app in een monorepo: eigen Dockerfile, eventueel met `turbo prune` | gp-map | [1](principes.md#vocab) |
| 13 | Meerdere doelen in één repo: één gate, en meerdere cd-\*-jobs na elkaar met `needs` (bijv. Supabase, dan Vercel of Swarm); of twee Vercel-apps in één monorepo, elk met een eigen project-id | gp-map | [4](principes.md#p-gate) [6](principes.md#p-manual) |
| 14 | Swarm-stack van kant-en-klare images uitrollen, zonder buildjob | gp-container-tracking | [2](principes.md#p-green) [3](principes.md#p-env) |
| 15 | Pre-deploy controle op de VM: is de server klaar voor deze stack, anders geen deploy | gp-map | [6](principes.md#p-manual) |
| 16 | Supabase: secrets, migraties en edge functions, vóór de app | nieuw | [4](principes.md#p-gate) [6](principes.md#p-manual) |
| 17 | Vertalingen ophalen en de release melden bij een deploy | tms-test | [5](principes.md#p-cd) [6](principes.md#p-manual) |
| 18 | Images bouwen en pushen terwijl de VM nog niet bestaat | bestaat al in vm-cd (`deploy-enabled`) | [2](principes.md#p-green) |
| 19 | Pakketten publiceren naar GitHub Packages bij een release, zoals de private `@pursuit-amsterdam`-pakketten | translations-management, library-repo's | [2](principes.md#p-green) [4](principes.md#p-gate) [7](principes.md#p-scripts) |
| 20 | Codegen uit een externe bron, zoals een API-client uit de Swagger/OpenAPI-spec van een andere service: CD haalt de bron bij de deploy opnieuw op, controleert de gegenereerde code en stopt bij een breaking change ten opzichte van de gecommitte spec | nieuw | [4](principes.md#p-gate) [5](principes.md#p-cd) [7](principes.md#p-scripts) |
| Triggers |  |  |  |
| 21 | Het GitHub-event dat CD start, bepaalt waarheen er gedeployd wordt; cd-gate rekent dat uit (tabel hieronder). Een `acceptance`-branch mag, maar hoeft niet. Bestaat hij, dan gaat een push daarop naar acceptance. | gp-map, tms-test | [3](principes.md#p-env) [4](principes.md#p-gate) |
| Beheer en randgevallen |  |  |  |
| 22 | CI op PR's van Dependabot, met Dependabot-secrets en toegang tot private pakketten | nieuw | — |
| 23 | Library-repo's die losse actions aanroepen (voor publiceren: cd-packages) | 6 repo's | — |
| 24 | Alle repo's toetsen aan de standaardinrichting | nieuw | — |

Use case 21, het event en waar het heen gaat:

| Event | Wanneer | Environment en commit |
| --- | --- | --- |
| `workflow_run` | CI is klaar na een push op `develop` (of `acceptance`) | staging (acceptance), de commit van die CI-run. De enige manier waarop een push tot een deploy leidt: CD start nooit rechtstreeks op `push` ([besloten](beslissingen.md#decided)). |
| `release` | release gepubliceerd | production, de commit van de tag |
| `workflow_dispatch` | handmatig gestart vanaf een branch of tag | volgt uit die keuze: `develop` → staging, `acceptance` → acceptance, de tag van de nieuwste release → production. Zo deploy je een release opnieuw, bijvoorbeeld na een wijziging in 1Password. Een oudere tag is rood: [geen rollbacks](beslissingen.md#decided). |
| `workflow_dispatch` met `environment` | verzoek van het vertalingen-CMS | staging, de head van `develop`; productie alleen met `cms-production`, en dan de nieuwste release ([besloten](beslissingen.md#decided)) |

Zonder principe: 22 en 23 regelt de [standaardinrichting](naslag/standaardinrichting.md#consumer-config) of het stabiel houden van de actions; 24 is het [auditscript](naslag/standaardinrichting.md#consumer-config). Genoemd maar nog niet uitgewerkt: `tms-validate`, vertalingen voor Swarm-projecten, en een typecheck van Deno edge functions ([detailbeslissingen](naslag/detailbeslissingen.md#decisions-detail)).

<a id="future"></a>

## Toekomstige use cases

Nog niet uitgewerkt. De laatste kolom toont welke principes van toepassing zouden zijn.

| # | Use case | Voorbeeld | Principes |
| --- | --- | --- | --- |
| 25 | ~~Preview-deploy per pull request~~ Vervalt: geen deploy per pull request; staging is de enige omgeving naast productie ([besloten](beslissingen.md#decided)). | — | — |
| 26 | Geplande runs: controle op drift, dependency-audit, het wekelijkse auditscript | nieuw | [2](principes.md#p-green) [5](principes.md#p-cd) |
| 27 | Melding bij een mislukte deploy naar productie | nieuw | [5](principes.md#p-cd) |
| 28 | Infra as code: plan in CI, precies dat plan toepassen in CD (uitwerking hieronder) | Azure, Swarm-VM's, DNS | [1](principes.md#vocab) [3](principes.md#p-env) [4](principes.md#p-gate) [5](principes.md#p-cd) [7](principes.md#p-scripts) |
| 29 | Gedeelde turbo-cache: een remote cache voor CI én ontwikkelaars, zodat een taak die al ergens met dezelfde invoer draaide nergens opnieuw draait. Nu bewaart ci.yml de cache alleen per branch in GitHub. | de tien turbo-repo's | [7](principes.md#p-scripts) |
| 30 | Lichte bescherming voor het eigen project van een medewerker: geen review en releasen zonder senior, voor iedereen met schrijfrechten; de checks blijven (uitwerking hieronder) | big-chef-webapp | — |

<a id="iac"></a>

### Uitwerking: infra as code

Nog geen workflow, wel een toets: het ontwerp mag infra as code (Terraform of OpenTofu voor Azure, de Swarm-VM's, DNS bij Cloudflare, Vercel- en Supabase-projecten) niet blokkeren.

- **CI:** format, validate, een linter en een plan, als commentaar op de PR. Past bij principe 1 (toolchain-versie uit de repo) en 7 (de repo bepaalt het commando).
- **CD:** precies het plan van deze commit toepassen, gestart vanaf een release-tag die alleen een senior kan maken. Dat is principe 4: alleen wat op deze commit gecontroleerd en goedgekeurd is.
- **Drift:** een gepland plan dat afwijkingen meldt; de vorm die principe 5 voor infra aanneemt.
- **Inloggen bij de cloud** gaat via OIDC, met kortlevende tokens in plaats van opgeslagen sleutels. Principe 3 blijft gelden: wat per environment verschilt, staat in de environment.
- **Wat root vraagt op een VM** (basismappen en hun eigenaar, `sysctl`, sudoers, Docker zelf) gaat naar de inrichting: Terraform of OpenTofu maakt de VM, cloud-init of Ansible richt hem in. Dat draait met eigen credentials en eigen reviewers, los van de deploy. Tot dan zijn dit handmatige runbookstappen. `pre-deploy` houdt alleen wat zonder sudo kan.

<a id="light"></a>

### Uitwerking: lichte bescherming

**Het model in één zin:** in een lichte repo hoeft geen PR een review, en mag een release zonder senior, voor iedereen met schrijfrechten. CODEOWNERS noemt wie het project draagt: die krijgt de reviewverzoeken en is aanspreekbaar.

Een medewerker die geen senior is, heeft soms een eigen project dat geen klantproject is. Dan hoeft niet elke PR langs een senior, en ook de release niet. Voorbeeld: big-chef-webapp (39 van de 39 commits van matthijs-pursuit, nooit gedeployd). Gepland in [Task 30](implementatieplan.md#task-30-lichte-bescherming-uit-codeowners). Het is een uitzondering op twee [besluiten](beslissingen.md#decided): "iedereen anders heeft een review nodig" en "alleen seniors deployen naar productie". Voor lichte repo's gelden die niet (besloten, Bas, 3 november 2026). De uitzondering staat bij beide besluiten.

**Het gaat om het soort project, niet om wie er commit.** In veel klantprojecten schrijven vooral niet-seniors (tms-test, translations-management-dashboard, intersekse-website). Die blijven standaard. Licht is voor een eigen of intern project, ook als het een productieomgeving heeft.

**Wat GitHub wel en niet kan:**

- CODEOWNERS bepaalt **wie** reviewt, niet **of** er een review nodig is. Dat laatste regelt de review-ruleset (`required_approving_review_count`, `require_code_owner_review`).
- Een auteur kan de eigen PR nooit goedkeuren. Een medewerker als code owner loopt met de standaard-ruleset dus vast.
- Een ruleset geldt voor iedereen met schrijfrechten. Een bypass kan een rol, een team of een app zijn, maar geen losse user. "Alleen de eigenaar mag" bestaat dus niet. Bij licht mogen alle `developers` (push) en `project-managers` (maintain) zonder review mergen en releasen. Bewust zo gekozen (Bas, 3 november 2026): dan zijn er geen rechten per repo nodig.

**Het signaal: de `*`-regel in CODEOWNERS.** Die bepaalt het profiel van een repo. `setup-consumer` zet daarna de passende rulesets, en de audit toetst ertegen. Om van standaard naar licht te gaan, moet CODEOWNERS op de default branch (meestal `main`) en op `develop` veranderen. Beide wijzigingen lopen via een PR onder de standaard-CODEOWNERS van de base branch. Er is dus altijd een senior die goedkeurt, en `setup-consumer` vraagt een admin nog om bevestiging.

GitHub leest de eerste CODEOWNERS die het vindt: `.github/`, dan de root, dan `docs/`. Daarin wint de laatste regel die past. De scripts lezen het bestand op dezelfde manier.

| De `*`-regel (de laatste die past), op de default branch en `develop` | Profiel | Audit |
| --- | --- | --- |
| alleen `@Pursuit-Amsterdam/senior-developers` (hoofdletters tellen niet) | standaard | — |
| alleen users (een of meer `@login`), ook als dat een senior is | licht | ter info: "licht, eigenaren X" |
| seniors plus anderen | standaard | bevinding: een andere eigenaar op de regel mag de PR van een junior goedkeuren, en dat is al een versoepeling |
| een ander team, een e-mailadres, of iets onbekends | standaard | bevinding |
| een `*`-regel zonder eigenaren, geen `*`-regel, of geen CODEOWNERS | standaard | bevinding (zoals nu) |
| de default branch en `develop` verschillen | standaard | bevinding |
| GitHub meldt een fout voor die branch (`GET /repos/{owner}/{repo}/codeowners/errors?ref=<branch>`), of de API geeft geen antwoord | standaard | bevinding |

Bij twijfel geldt standaard. Ook `**` en `/**` raken de hele repo en tellen als de `*`-regel. Een padregel zoals `/src/ @junior` versoepelt een standaardrepo ook, maar valt buiten deze taak.

**Wat bij licht verandert, en wat blijft.** Dit geldt op elke beschermde branch: de default branch, `develop` en `acceptance`.

| Ruleset of regel | Standaard | Licht |
| --- | --- | --- |
| checks (geen bypass) | verplicht | blijft verplicht, maar is een vangnet en geen controle (zie hieronder) |
| review | 1 review, van code owners | 0 reviews en geen review van code owners; een PR blijft verplicht |
| force push, verwijderen | verboden | blijft verboden |
| check-pr (branchregels) | geldt | blijft gelden |
| tag-ruleset (`v*`) | aanmaken, wijzigen en verwijderen alleen door seniors | aanmaken mag iedereen met schrijfrechten, dus ook releasen en deployen; wijzigen en verwijderen blijven bij de seniors |
| `production`-environment | alleen tags `v*` | blijft gelijk |

**Het risico dat erbij hoort, geaccepteerd (Bas, 3 november 2026):** bij standaard heeft een PR die de eigen CI aanpast de review van een senior nodig. Bij licht niet. Een PR kan `ci.yml` dus vervangen door een check die altijd groen is. Wie daarna een `v*`-tag maakt, zet code live die niemand heeft gereviewd, met de productie-secrets. Bij licht draagt de eigenaar dat zelf. Een repo die een klantproject wordt, gaat terug naar standaard.

**De scripts:**

- `migrate-consumer` vraagt bij het schrijven van CODEOWNERS: standaard of licht, en bij licht wie de eigenaren zijn. Zonder terminal leest het `--owner <login>`. Zonder die vlag kiest het standaard.
  - Bij standaard vervangt het een bestaande `*`-regel. Het zet de seniors niet meer bovenaan, want dan wint een `*`-regel verderop.
  - Bij licht laat het een bestaande lichte `*`-regel staan.
- `setup-consumer` leest de `*`-regel op de default branch en op `develop`:
  - van standaard naar licht, of een nieuwe lichte ruleset → pas na een ja in de terminal, met `--apply`: één vraag per repo, die alle rulesets noemt, met ja als standaard (`[Y/n]`; de CODEOWNERS-PR had al de review van een senior);
  - zegt de admin nee, dan blijven de review- en de tag-ruleset standaard, en gaan de andere wijzigingen gewoon door;
  - van licht naar standaard → zonder vraag;
  - al in orde → geen vraag, en een tweede run blijft stil;
  - een dry run, geen terminal, of geen CODEOWNERS → een `todo` zonder wijziging; de rulesets blijven zoals ze zijn, of worden standaard;
  - `setup-consumer` schrijft geen CODEOWNERS: de branches zijn beschermd, en de PR is het werk van `migrate-consumer`.
- **Terug naar standaard,** of CODEOWNERS weg: daarna `pnpm setup-consumer -- <repo> --apply`. Tot dan blijven de rulesets licht. De wekelijkse audit meldt het verschil.
- Bij licht kan iedereen met schrijfrechten CODEOWNERS zonder review aanpassen. De audit noemt daarom de eigenaren, zodat een wissel opvalt.

**CODEOWNERS bij licht**, bijvoorbeeld in big-chef-webapp:

```
# Light protection: the project of the developer below, not a client project.
# Anyone with write access merges without a review and may create a release
# tag; the checks still apply. Back to standard: make the line
# `* @Pursuit-Amsterdam/senior-developers` again, then run
# `pnpm setup-consumer -- <repo> --apply`.
* @matthijs-pursuit
```

- Eén user of meer (`* @matthijs-pursuit @jipharthoorn-pursuit`). Geen team per project.
- Zet geen seniors op de regel: dan is het een mengvorm.
- GitHub blokkeert niets op deze regel. Wel vraagt GitHub de eigenaar om een review bij een PR van iemand anders, bijvoorbeeld van Dependabot (niet bij een draft).

**Kandidaten** (scan van 63 actieve repo's, 3 november 2026; elke bestaande CODEOWNERS is nu standaard):

- big-chef-webapp: duidelijk licht.
- pursuit-projects-dashboard: misschien. Een intern hulpmiddel, 82 van de 98 commits van jipharthoorn-pursuit, met productie.
- pursuit-n8n, van-aalsburg-n8n, hb-kvs-clients-admin: elk één niet-senior, maar ze gebruiken de workflows niet en vallen buiten `setup-consumer`.

---

[← Overzicht](README.md) · [Het ontwerp in acht principes →](principes.md)
