<a id="progress"></a>

# Voortgang van de migratie naar v2

**Stand: 28 oktober 2026.** 37 van de 45 repo's die Pursuit-Amsterdam/workflows gebruiken, draaien op `v2`; 13 daarvan hebben al een productiedeploy of publicatie via `v2` gehad. De workflows-repo zelf telt niet mee: `main` blijft v1 tot Task 28. Gearchiveerde repo's tellen niet mee: foodcabinet-website en all-connect-solutions-website zijn gearchiveerd, unconsultants-website volgt (geen klant meer).

Dit document houdt bij per repo hoe ver de migratie is, en wat er in `v2` nog ontbreekt. Het [implementatieplan](implementatieplan.md#plan) houdt bij hoe het gebouwd is. De stand per repo komt uit `pnpm audit:consumers` en de laatste release-run.

## Op v2, productie via v2 bewezen (13)

Een release ná de migratie is door de gate gegaan en gedeployd of gepubliceerd.

| Repo | Soort | Release via v2 |
| --- | --- | --- |
| pursuit-website-2025 | Vercel | v2026.10.20 |
| tms-test | Vercel, vertalingen-CMS | v2026.10.20 |
| integrators-website-2025 | Vercel, vertalingen-CMS | v2026.10.21 |
| qpido-website | Vercel | v2026.10.22 |
| variantzorg-frontend | Vercel | v2026.10.26 (security-fixes); naar `develop` via #152, staging via `v2` |
| tellr-website | Vercel, Storybook | v2026.10.26 (health 200) |
| tellr-webapp | Vercel, Storybook | v2026.10.26 (v2-migratie en de Node-pin voor CVE-2026-111497) |
| basko-healthcare-website | Vercel; migraties via de Supabase-integratie | v2026.10.26 |
| multifill-planning-tool | Vercel; migraties via de Supabase-integratie | v2026.10.26 |
| gp-map-webapp | Swarm | v2026.10.26; `main` draait nog de v1-CI, met de brug in de gate, tot `develop` naar `main` mag |
| banner-kit | pakket, release via draft | v0.10.0 |
| nextjs-feature-flags | pakket, demo-app op Vercel | v0.6.0; de demo-app bouwt de workspace via `packages/demo-app/vercel.json` |
| workflows-example | testrepo | v0.9.0 |

## Op v2, wacht op de eerste release (24)

CI, check-pr en (waar het bestaat) staging werken al via `v2`. Productie of publicatie volgt bij de volgende release door een senior.

| Groep | Repo's |
| --- | --- |
| Vercel | translations-management-dashboard, blenheim-masters-landingpage, city-real-estate-website, pursuit-projects-dashboard, github-wrapped-2025, intersekse-website, asana-task-generator, developer-onboarding-project, scm-executives-website |
| Pakketten (release via draft) | jest-config, eslint-config, prettier-config, typescript-config, web-essentials-cli, web-essentials-js, text-extract, translations-management-js |
| Banner-repo's (Pages bij een release) | triodos-html-banners, novacollege-html-banners, offlimits-html-banners, warmtefonds-html-banners, snappcar-html-banners |
| Geen productie, bewust | gp-container-tracking-webapp (staging is de omgeving van de gebruikers), template-nextjs-vercel (deployt nooit), weber-ddc (geen CD: oplevering als zip) |

offlimits en warmtefonds springen van banner-kit 0.5 naar 0.10: vóór hun eerste release lokaal `pnpm build` en `pnpm dev` vergelijken met wat live staat.

## Nog v1 (8)

| Groep | Repo's | Wat het vraagt |
| --- | --- | --- |
| `migrate-consumer` kan het | provincie-utrecht-demo | routine; de checklist van het script (geen tests, een build die 1Password nodig heeft) |
| Eigen handwerk | big-chef-webapp (eigen `api-ci`) | een besluit |
| Edge functions | web-essentials-dashboard | `cd-supabase` met een organization-token (Sam) |
| Blueprint-familie ([Task 29](implementatieplan.md#plan)) | automations-blueprint, bnext-automations, gp-groot-automations, integrators-automations, sluyter-logistics-automations | Python en Swarm, met Sam |

## Wat v2 nog mist

| # | Wat | Status | Blokkade |
| --- | --- | --- | --- |
| 1 | `cd-supabase` met edge functions op een echt project (Task 19 stap 3–4) | gebouwd en getest met cases | organization-token met een machine-account dat alleen lid is van de projecten die het nodig heeft (Sam); kandidaat web-essentials-dashboard |
| 2 | Deno-typecheck in CI (Task 20) | niet gebouwd | hoort bij 1 |
| 3 | `setup-onepassword`: meerregelige velden, alleen `CONCEALED` maskeren (Task 6 stap 6) | open | eerst `pnpm review-vaults` (Task 6 stap 5, Bas) |
| 4 | Wekelijkse audit als workflow (Task 24 stap 3–5) | script klaar, ruis eruit | GitHub App: alleen een org-owner kan hem aanmaken (verzoek 27 oktober 2026); daarna de default branch op `v2` |
| 5 | banner-kit `templates/project`: `init` met de v2-bestanden en pnpm | open | geen: de bestanden van triodos zijn bewezen |
| 6 | Default branch op `v2` (Task 28 stap 4) | open | pas als alle v1-repo's over zijn; de v1-bestanden zijn al weg van `v2` |
| 7 | Python-pakketten publiceren | `cd-packages` is alleen npm | web-essentials-py |

## Handwerk dat openstaat

- **Dependabot-secret `CUSTOM_GITHUB_TOKEN` op org-niveau** (Sam). Zonder die secret faalt Dependabot in elke repo met private pakketten.
- **`CUSTOM_GITHUB_TOKEN` op repo-niveau verloopt.** Een klassieke PAT; in blenheim, city en pursuit-projects-dashboard gaf hij een 401, ongebruikt sinds hij gezet was. Wie een repo migreert: CI op de PR laat het zien. Alternatief: `GITHUB_TOKEN` met `packages: read`, mits elk privépakket de repo leestoegang geeft (Manage Actions access, alleen door een pakketbeheerder).
- **`VERCEL_TOKEN` als environment-secret** op `staging` en `production` in plaats van op org- of repo-niveau.
- **Oude PR's naar `main` van de workflows-repo:** #22 (packages: read) en #25 (Supabase edge functions) zijn achterhaald door `v2`; #23 gaat op in punt 3; #26 (Key Vault) is buiten scope (23 oktober 2026). Sluiten.
- Cosmetisch: hoofdletters in environmentnamen (`Staging`, `Production`); hernoemen kan niet zonder de secrets opnieuw te zetten. GitHub maakt geen verschil, de audit meldt het niet meer.

## Logboek

| Datum | Wat |
| --- | --- |
| 28 oktober 2026 | Stand nagelopen. multifill-planning-tool: v2026.10.26 via `v2` naar productie (run 40322590058, `cd-gate@v2` en `cd-vercel@v2`). nextjs-feature-flags: de Build Command staat nu in `packages/demo-app/vercel.json` op `develop`. Team `senior-developers`: "Only notify requested team members" staat aan, automatisch toewijzen uit. all-connect-solutions-website gearchiveerd, uit het overzicht. Ongewijzigd: geen andere repo heeft een release ná de migratie; gp-map-webapp heeft nog klassieke protectie en v1-CI op `main`; de oude PR's #22, #23, #25 en #26 staan nog open; de default branch is `main`. |
| 27 oktober 2026 | Klacht: elke PR mailt alle seniors. Oorzaak: `* @Pursuit-Amsterdam/senior-developers` in CODEOWNERS vraagt het hele team aan, en het team stuurt dat naar iedereen. Besluit: "Only notify requested team members" aan, automatisch toewijzen uit; de PR in het Asana-ticket is de trigger. In de standaardinrichting; zetten door een owner. |
| 27 oktober 2026 | Minder ruis in `pnpm audit:consumers`: een repo op v1 (aanroepen op `@main`, geen `@v2`) krijgt één regel met het `migrate-consumer`-commando in plaats van al zijn bevindingen; hoofdletters in environmentnamen worden niet meer gemeld. |
| 27 oktober 2026 | Alle tests op `node:test` (`pnpm test`): de vijf `*-cases.sh` zijn `tests/*.test.ts` geworden, de nep-CLI's losse bestanden in `tests/fakes/` (door shellcheck). check-pr draait nu één tabel door zowel het script in `check-pr.yml` als `check-pr.sh`. De deploy-vercel-check op `--prod` keek op tekst en liet `--prodx` door; nu op hele argumenten. 90 tests. |
| 27 oktober 2026 | snappcar-html-banners: `setup-consumer --apply` (rulesets op `main`, tag-ruleset, `github-pages` alleen `tag v*`); audit 0 bevindingen. Wacht nu alleen op de eerste release. |
| 27 oktober 2026 | README op `v2` herschreven (Task 27): een korte ingang in het Nederlands, de inputs staan in de YAML-bestanden zelf. `naslag/concept-yaml.md` weg: de concepten van vóór de bouw liepen achter op de echte bestanden. Open vinkjes in het implementatieplan nagelopen: gp-map productie via `v2` gedaan, de rulesets nog niet (klassieke protectie op `main` en `develop`); snappcar-html-banners mist `setup-consumer` (geen rulesets, geen tag-ruleset, `github-pages` zonder tags `v*`), de vier banner-kit-repo's alleen de Dependabot-secret. |
| 27 oktober 2026 | v1 weg van `v2` (Task 28 stap 1–3): de acht v1-workflows, de vier v1-actions en `head-ref`/`base-ref` van `check-pr`. Een scan van alle consumer-repo's (`main`, `develop`, `acceptance`, `staging`) vond geen v1-bestand op `@v2` en geen `check-pr@v2` met die inputs. v1-repo's merken niets: ze pinnen `@main`. De default branch blijft `main`. |
| 27 oktober 2026 | multifill-planning-tool af: `setup-consumer --apply` gedaan (rulesets op `main` en `develop`, tag-ruleset, geen klassieke protectie), `integration` zonder secrets. translations-management-dashboard: de Storybook-deploy naar Pages was al uitgezet (alleen `workflow_dispatch`, laatste run in juni), niet rood; `storybook-cd.yml` weg (#84), GitHub Pages uit, environment `github-pages` weg. Storybook blijft lokaal (`pnpm storybook`). foodcabinet-website en unconsultants-website uit het overzicht: geen klant meer, Bas archiveert ze; daarmee vervalt ook acceptance op Vercel. |
| 26 oktober 2026 | translations-management-dashboard naar `v2` (#82, #83); staging via `v2` (run 40352232959, `workflow_run -> staging @ 407bc21`). Storybook staat op `cd-pages@v2`, maar faalt tot GitHub Pages aan staat (30 van 30 runs rood). Een oude ruleset `main` (1 review, geen bypass) blokkeerde de merge, ook voor een admin: weggehaald, de standaard-rulesets komen van `setup-consumer`. weber-ddc naar `v2` (#31, daarna `develop` → `main` #32): alleen CI (`build`, de enige check met een script) en check-pr, geen CD. De PR naar `main` (#30) was niet nodig en kon niet: `main` liep 39 commits achter, zonder `packageManager`. `setup-consumer` pas na `develop` → `main`, anders vraagt de ruleset op `main` de v1-checknaam. |
| 26 oktober 2026 | Zes repo's naar `v2` met de herschrijving van `migrate-consumer`: blenheim-masters-landingpage, city-real-estate-website en pursuit-projects-dashboard (staging via `v2`: runs 40349393945, 40349340210, 40349505480), github-wrapped-2025, intersekse-website en asana-task-generator (alleen productie). Per repo: `test` uit `checks` zonder tests (blenheim, github-wrapped), `build` uit `checks` als de build 1Password nodig heeft (city: CMS-URL, asana: `OPENAI_API_KEY`), een `typecheck`-script waar het ontbrak (city, intersekse, asana), de nooit geslaagde Storybook-deploy weg (dashboard), `check-pr.yml` toegevoegd (asana). intersekse en asana hadden sinds augustus en december rode CI; nu groen. Pakketten: blenheim, dashboard en github-wrapped lezen met `GITHUB_TOKEN` en `packages: read` (zoals v1-CI); city met een vernieuwde `CUSTOM_GITHUB_TOKEN`, want `web-essentials` geeft city geen Actions-toegang (403). asana: de oude `develop` (al in `main`) weg, zodat het een repo zonder `develop` is. |
| 26 oktober 2026 | nextjs-feature-flags v0.6.0 via `v2`: het pakket gepubliceerd, de demo-app eerst rood. v1 bouwde in CD de hele workspace (turbo) vóór `vercel build`; v2 doet dat niet meer, dus `next build` van de demo-app vond `packages/core/dist` niet. Opgelost met de Build Command van het Vercel-project (`cd ../.. && pnpm turbo run build --filter=@pursuit-amsterdam/feature-flags-demo-app`) en een re-run (run 40323168785, poging 2); nog vastleggen in `packages/demo-app/vercel.json`. Geldt voor elke Vercel-app die een workspace-pakket met een build nodig heeft. |
| 26 oktober 2026 | Up-to-date alleen nog verplicht op `main` van een repo zonder `develop` (#130): een terug-merge `main` → `develop` na een hotfix kon niet bijgewerkt worden zonder in `main` te schrijven (multifill-planning-tool #296). `setup-consumer --apply` opnieuw op de 17 repo's met `develop`. tellr en tellr-docs gaan bewust niet naar `v2`: ze gebruiken de workflows-repo niet (eigen CI, deploy via de Vercel-integratie), liggen sinds 2025 stil en worden binnenkort deprecated. |
| 26 oktober 2026 | multifill-planning-tool naar `v2` met `migrate-consumer`: #292 (`main`) en #293 (`develop`). `build` uit `checks`, omdat `next build` de Supabase-waarden uit 1Password nodig heeft; lint, typecheck en de 191 tests draaien zonder env. Migraties blijven via de Supabase-integratie gaan. Staging via `v2` (run 40321197983, `workflow_run -> staging @ 5617a2a`). Nog doen: `setup-consumer --apply` en `OP_SERVICE_ACCOUNT_TOKEN` weg van `integration`. |
| 26 oktober 2026 | variantzorg-frontend: security-fixes (Node 24.22.1, Next.js 15.5.28) als v2026.10.26 via `v2` naar productie; naar `develop` via een feature-branch met `main` erin (#152), omdat een `main` → `develop`-PR niet up-to-date kan zonder in `main` te schrijven; staging via `v2`. tellr-website en tellr-webapp: v2026.10.26 via `v2` naar productie. `release-draft`: een tag zonder `v` (`0.6.0-beta.1`) telt nu als gereleased (#126); nextjs-feature-flags kreeg daardoor een onterechte draft `v0.6.0-beta.1`, die bij de volgende release vanzelf verdwijnt. Eerste versie van dit overzicht. |
