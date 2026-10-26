<a id="progress"></a>

# Voortgang van de migratie naar v2

**Stand: 26 oktober 2026.** 29 van de 49 repo's die Pursuit-Amsterdam/workflows gebruiken, draaien op `v2`; 11 daarvan hebben al een productiedeploy of publicatie via `v2` gehad. De workflows-repo zelf telt niet mee: `main` blijft v1 tot Task 28.

Dit document houdt bij per repo hoe ver de migratie is, en wat er in `v2` nog ontbreekt. Het [implementatieplan](implementatieplan.md#plan) houdt bij hoe het gebouwd is. De stand per repo komt uit `pnpm audit:consumers` en de laatste release-run.

## Op v2, productie via v2 bewezen (11)

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
| gp-map-webapp | Swarm | v2026.10.26; `main` draait nog de v1-CI, met de brug in de gate, tot `develop` naar `main` mag |
| banner-kit | pakket, release via draft | v0.10.0 |
| workflows-example | testrepo | v0.9.0 |

## Op v2, wacht op de eerste release (18)

CI, check-pr en (waar het bestaat) staging werken al via `v2`. Productie of publicatie volgt bij de volgende release door een senior.

| Groep | Repo's |
| --- | --- |
| Vercel | developer-onboarding-project, unconsultants-website, scm-executives-website, nextjs-feature-flags (0.6.0 in voorbereiding, #9) |
| Pakketten (release via draft) | jest-config, eslint-config, prettier-config, typescript-config, web-essentials-cli, web-essentials-js, text-extract, translations-management-js |
| Banner-repo's (Pages bij een release) | triodos-html-banners, novacollege-html-banners, offlimits-html-banners, warmtefonds-html-banners, snappcar-html-banners |
| Geen productie, bewust | gp-container-tracking-webapp (staging is de omgeving van de gebruikers), template-nextjs-vercel (deployt nooit) |

offlimits en warmtefonds springen van banner-kit 0.5 naar 0.10: vóór hun eerste release lokaal `pnpm build` en `pnpm dev` vergelijken met wat live staat.

## Nog v1 (19)

| Groep | Repo's | Wat het vraagt |
| --- | --- | --- |
| `migrate-consumer` kan het | blenheim-masters-landingpage, city-real-estate-website, github-wrapped-2025, intersekse-website, asana-task-generator, provincie-utrecht-demo, pursuit-projects-dashboard, translations-management-dashboard, weber-ddc | routine; de checklist van het script (geen tests, een build die 1Password nodig heeft) |
| Wacht | multifill-planning-tool | op Bas |
| Eigen handwerk | foodcabinet-website (acceptance; `cd-vercel` kent geen acceptance), big-chef-webapp (eigen `api-ci`) | een besluit per repo |
| Edge functions | web-essentials-dashboard | `cd-supabase` met een organization-token (Sam) |
| Blueprint-familie ([Task 29](implementatieplan.md#plan)) | automations-blueprint, bnext-automations, gp-groot-automations, integrators-automations, sluyter-logistics-automations | Python en Swarm, met Sam |
| Opgezegd | all-connect-solutions-website | overslaan |

## Wat v2 nog mist

| # | Wat | Status | Blokkade |
| --- | --- | --- | --- |
| 1 | `cd-supabase` met edge functions op een echt project (Task 19 stap 3–4) | gebouwd en getest met cases | organization-token met een machine-account dat alleen lid is van de projecten die het nodig heeft (Sam); kandidaat web-essentials-dashboard |
| 2 | Deno-typecheck in CI (Task 20) | niet gebouwd | hoort bij 1 |
| 3 | `setup-onepassword`: meerregelige velden, alleen `CONCEALED` maskeren (Task 6 stap 6) | open | eerst `pnpm review-vaults` (Task 6 stap 5, Bas) |
| 4 | Acceptance op Vercel | `cd-vercel` weigert acceptance | besluit voor foodcabinet-website |
| 5 | Wekelijkse audit als workflow (Task 24 stap 3–5) | script klaar | GitHub App aanmaken (handwerk) |
| 6 | banner-kit `templates/project`: `init` met de v2-bestanden en pnpm | open | geen: de bestanden van triodos zijn bewezen |
| 7 | README op `v2` (Task 27) | open | geen |
| 8 | v1 weg van `v2` en de default branch op `v2` (Task 28) | open | pas als alle v1-repo's over zijn |
| 9 | Python-pakketten publiceren | `cd-packages` is alleen npm | web-essentials-py |

## Handwerk dat openstaat

- **Dependabot-secret `CUSTOM_GITHUB_TOKEN` op org-niveau** (Sam). Zonder die secret faalt Dependabot in elke repo met private pakketten.
- **`VERCEL_TOKEN` als environment-secret** op `staging` en `production` in plaats van op org- of repo-niveau.
- **Oude PR's naar `main` van de workflows-repo:** #22 (packages: read) en #25 (Supabase edge functions) zijn achterhaald door `v2`; #23 gaat op in punt 3; #26 (Key Vault) is buiten scope (23 oktober 2026). Sluiten.
- Cosmetisch: hoofdletters in environmentnamen (`Staging`, `Production`); hernoemen kan niet zonder de secrets opnieuw te zetten.

## Logboek

| Datum | Wat |
| --- | --- |
| 26 oktober 2026 | variantzorg-frontend: security-fixes (Node 24.22.1, Next.js 15.5.28) als v2026.10.26 via `v2` naar productie; naar `develop` via een feature-branch met `main` erin (#152), omdat een `main` → `develop`-PR niet up-to-date kan zonder in `main` te schrijven; staging via `v2`. tellr-website en tellr-webapp: v2026.10.26 via `v2` naar productie. `release-draft`: een tag zonder `v` (`0.6.0-beta.1`) telt nu als gereleased (#126); nextjs-feature-flags kreeg daardoor een onterechte draft `v0.6.0-beta.1`, die bij de volgende release vanzelf verdwijnt. Eerste versie van dit overzicht. |
