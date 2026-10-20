<a id="usecases"></a>

# Use cases

Wat de workflows moeten kunnen, afgeleid uit de huidige repo's. De laatste kolom toont welke principes het geval dekken.

| # | Use case | Voorbeeld | Principes |
| --- | --- | --- | --- |
| CI: code controleren |  |  |  |
| 1 | Next.js-site: lint, format, typecheck, test, build | 34 repo's | [1](principes.md#vocab) [2](principes.md#p-green) [7](principes.md#p-scripts) |
| 2 | Python-backend, eventueel tegen Postgres | gp-map, gp-groot | [1](principes.md#vocab) [2](principes.md#p-green) [7](principes.md#p-scripts) |
| 3 | Database tests (pgTAP) tegen een lokale Supabase-stack | basko, tellr | [1](principes.md#vocab) [2](principes.md#p-green) [7](principes.md#p-scripts) |
| 4 | Frontend en backend in één repo: node én python | gp-map, tellr | [7](principes.md#p-scripts) |
| 5 | Codegen vóór de checks | 2 repo's | [7](principes.md#p-scripts) |
| 6 | Swarm-project: stackbestanden en eigen images controleren | gp-map | [1](principes.md#vocab) [2](principes.md#p-green) |
| 7 | Swarm-stack van kant-en-klare images: alleen de stackbestanden controleren | gp-container-tracking | [2](principes.md#p-green) |
| 8 | Vertaalsleutels naar het CMS, alleen op de integratiebranch | tms-test | [6](principes.md#p-manual) |
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
| `repository_dispatch` | verzoek van het vertalingen-CMS | alleen staging of acceptance ([besloten](beslissingen.md#decided)); de head van de branch van die environment |

Zonder principe: 22 en 23 regelt de [standaardinrichting](naslag/standaardinrichting.md#consumer-config) of het stabiel houden van de actions; 24 is het [auditscript](naslag/standaardinrichting.md#consumer-config). Genoemd maar nog niet uitgewerkt: `tms-validate`, vertalingen voor Swarm-projecten, en een typecheck van Deno edge functions ([detailbeslissingen](naslag/detailbeslissingen.md#decisions-detail)).

<a id="future"></a>

## Toekomstige use cases

Nog niet uitgewerkt. De laatste kolom toont welke principes van toepassing zouden zijn.

| # | Use case | Voorbeeld | Principes |
| --- | --- | --- | --- |
| 25 | ~~Preview-deploy per pull request~~ Vervalt: staging is de enige preview ([besloten](beslissingen.md#decided)). | — | — |
| 26 | Geplande runs: controle op drift, dependency-audit, het wekelijkse auditscript | nieuw | [2](principes.md#p-green) [5](principes.md#p-cd) |
| 27 | Melding bij een mislukte deploy naar productie | nieuw | [5](principes.md#p-cd) |
| 28 | Infra as code: plan in CI, precies dat plan toepassen in CD (uitwerking hieronder) | Azure, Swarm-VM's, DNS | [1](principes.md#vocab) [3](principes.md#p-env) [4](principes.md#p-gate) [5](principes.md#p-cd) [7](principes.md#p-scripts) |
| 29 | Gedeelde turbo-cache: een remote cache voor CI én ontwikkelaars, zodat een taak die al ergens met dezelfde invoer draaide nergens opnieuw draait. Nu bewaart ci.yml de cache alleen per branch in GitHub. | de tien turbo-repo's | [7](principes.md#p-scripts) |

<a id="iac"></a>

### Uitwerking: infra as code

Nog geen workflow, wel een toets: het ontwerp mag infra as code (Terraform of OpenTofu voor Azure, de Swarm-VM's, DNS bij Cloudflare, Vercel- en Supabase-projecten) niet blokkeren.

- **CI:** format, validate, een linter en een plan, als commentaar op de PR. Past bij principe 1 (toolchain-versie uit de repo) en 7 (de repo bepaalt het commando).
- **CD:** precies het plan van deze commit toepassen, gestart vanaf een release-tag die alleen een senior kan maken. Dat is principe 4: alleen wat op deze commit gecontroleerd en goedgekeurd is.
- **Drift:** een gepland plan dat afwijkingen meldt; de vorm die principe 5 voor infra aanneemt.
- **Inloggen bij de cloud** gaat via OIDC, met kortlevende tokens in plaats van opgeslagen sleutels. Principe 3 blijft gelden: wat per environment verschilt, staat in de environment.
- **Wat root vraagt op een VM** (basismappen en hun eigenaar, `sysctl`, sudoers, Docker zelf) gaat naar de inrichting: Terraform of OpenTofu maakt de VM, cloud-init of Ansible richt hem in. Dat draait met eigen credentials en eigen reviewers, los van de deploy. Tot dan zijn dit handmatige runbookstappen. `pre-deploy` houdt alleen wat zonder sudo kan.

---

[← Overzicht](README.md) · [Het ontwerp in acht principes →](principes.md)
