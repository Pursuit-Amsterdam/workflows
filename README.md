# Pursuit-Amsterdam/workflows

Gedeelde GitHub Actions-workflows en composite actions voor de repo's van Pursuit-Amsterdam. Niets hier draait op zichzelf: je repo roept een workflow aan met `@v2`, en de logica staat hier.

- **v2** is de branch `v2`. Nieuwe en gemigreerde repo's pinnen `@v2`.
- **v1** staat alleen op `main` (`web-ci`, `web-cd`, `vm-cd` en de rest). Repo's die nog op v1 draaien, pinnen `@main` en merken niets van `v2`.

Waarom v2 zo in elkaar zit, staat in [docs/v2](docs/v2/README.md). Hoe ver elke repo is, staat in [voortgang](docs/v2/voortgang.md).

## Een repo op v2

Een repo krijgt drie aanroepende workflows en een vaste inrichting van GitHub. Welke weg je neemt, hangt af van waar je begint.

| Je begint met | Doe dit |
| --- | --- |
| Een nieuw Next.js-project op Vercel | Begin vanaf [template-nextjs-vercel](https://github.com/Pursuit-Amsterdam/template-nextjs-vercel): de workflows staan er al in. |
| Een bestaande repo op v1 | `pnpm migrate-consumer -- <repo>` herschrijft de workflows en opent draft-PR's. |
| Elke repo, na de merge | `pnpm setup-consumer -- <repo> --apply` zet environments, rulesets en de tag-ruleset goed. |

Wat een repo nodig heeft, van branchregels tot secrets per environment, staat in de [standaardinrichting](docs/v2/naslag/standaardinrichting.md).

### De drie bestanden

Elke repo heeft dezelfde drie bestanden in `.github/workflows/`. De scripts in `package.json` zijn het contract: de workflow bepaalt wanneer een check draait, de repo bepaalt wat de check doet.

`ci.yml` draait de checks op elke PR en op elke push naar een deploybranch:

```yaml
name: Continuous Integration
on:
    push:
        branches: [main, develop]
    pull_request:
permissions:
    contents: read
jobs:
    run-ci:
        uses: Pursuit-Amsterdam/workflows/.github/workflows/ci.yml@v2
        with:
            checks: lint typecheck test build
            use-custom-token: true
        secrets: inherit
```

`cd.yml` start pas als CI klaar is. De gate bepaalt waarheen: groen op `develop` gaat naar staging, een gepubliceerde release naar productie.

```yaml
name: Continuous Deployment
on:
    workflow_run:
        workflows: [Continuous Integration]
        types: [completed]
        branches: [develop]
    release:
        types: [published]
    workflow_dispatch:
permissions:
    contents: read
    actions: read
jobs:
    gate:
        if: github.event_name != 'workflow_run' || github.event.workflow_run.conclusion == 'success'
        uses: Pursuit-Amsterdam/workflows/.github/workflows/cd-gate.yml@v2
        with:
            branch-targets: develop=staging
    deploy:
        needs: gate
        if: needs.gate.outputs.proceed == 'true'
        uses: Pursuit-Amsterdam/workflows/.github/workflows/cd-vercel.yml@v2
        with:
            environment: ${{ needs.gate.outputs.target }}
            ref: ${{ needs.gate.outputs.sha }}
            health-path: /
        secrets: inherit
```

`check-pr.yml` controleert of de PR van de juiste branch naar de juiste branch gaat:

```yaml
name: Check pull request validity
on:
    pull_request:
        types: [opened, synchronize, reopened, edited]
permissions:
    contents: read
jobs:
    run-check-pr:
        uses: Pursuit-Amsterdam/workflows/.github/workflows/check-pr.yml@v2
```

Meer voorbeelden, ook voor Swarm, Supabase en pakketten, staan in de [migratievoorbeelden](docs/v2/naslag/migratievoorbeelden.md).

## Workflows

Elke workflow is een `workflow_call`. Alle inputs, met hun standaardwaarde en uitleg, staan bovenin het bestand zelf; dat is de bron.

| Workflow | Wat het doet |
| --- | --- |
| [ci.yml](.github/workflows/ci.yml) | De CI van elke repo: Node en pnpm, Python als er een `pyproject.toml` is, en de scripts uit `checks`. Optioneel een database, 1Password of het vertalingen-CMS. |
| [ci-images.yml](.github/workflows/ci-images.yml) | Voor Swarm-projecten op een PR: kloppen de stackbestanden, en bouwt en start elk eigen image. |
| [check-pr.yml](.github/workflows/check-pr.yml) | De branch- en mergeregels. |
| [cd-gate.yml](.github/workflows/cd-gate.yml) | Beslist of er gedeployd wordt, naar welke environment, en welke commit. Staat voor elke `cd-*`. |
| [cd-vercel.yml](.github/workflows/cd-vercel.yml) | Deploy naar Vercel, met een typecheck van wat na CI gegenereerd is en een healthcheck na de deploy. |
| [cd-swarm.yml](.github/workflows/cd-swarm.yml) | Bouwt de eigen images, test ze, en deployt een Docker Swarm-stack op een VM. |
| [cd-supabase.yml](.github/workflows/cd-supabase.yml) | Function-secrets, migraties en edge functions naar een Supabase-project. |
| [cd-pages.yml](.github/workflows/cd-pages.yml) | Bouwt een statische site (standaard Storybook) en publiceert hem op GitHub Pages. |
| [cd-packages.yml](.github/workflows/cd-packages.yml) | Publiceert de npm-pakketten van een repo naar GitHub Packages bij een release. |
| [release-draft.yml](.github/workflows/release-draft.yml) | Zet na een merge in een pakketrepo een concept-release klaar met de versie uit `package.json`. |

[self-ci.yml](.github/workflows/self-ci.yml) is de CI van deze repo zelf.

## Composite actions

De workflows bestaan uit deze actions. Je kunt ze ook los aanroepen, met `@v2`.

| Action | Wat het doet |
| --- | --- |
| [setup-node-pnpm](.github/actions/setup-node-pnpm/action.yml) | Node en pnpm installeren, met cache. |
| [setup-python](.github/actions/setup-python/action.yml) | uv en Python installeren en de dependencies uit de lockfile synchroniseren. |
| [setup-services](.github/actions/setup-services/action.yml) | Postgres of Supabase, Redis en secrets uit 1Password, voordat een check of build start. |
| [setup-supabase](.github/actions/setup-supabase/action.yml) | De lokale Supabase-stack starten en de URL's en sleutels exporteren. |
| [setup-onepassword](.github/actions/setup-onepassword/action.yml) | Een 1Password-item ophalen, de waarden maskeren en naar de environment schrijven. |
| [setup-version](.github/actions/setup-version/action.yml) | Een versiestring berekenen en als variabele exporteren. |
| [run-codegen](.github/actions/run-codegen/action.yml) | Het codegen-script draaien en het resultaat typechecken. |
| [run-translations](.github/actions/run-translations/action.yml) | Een commando van de vertalingen-CLI draaien. |
| [run-docker-build-push](.github/actions/run-docker-build-push/action.yml) | Een Docker-image bouwen en naar GitHub Container Registry pushen. |
| [run-image-smoke](.github/actions/run-image-smoke/action.yml) | Een image starten en controleren dat het werkt. |
| [deploy-vercel](.github/actions/deploy-vercel/action.yml) | Bouwen en deployen naar Vercel. |
| [deploy-swarm](.github/actions/deploy-swarm/action.yml) | Een stack via SSH uitrollen op een Swarm-manager. |

## Branches en merges

`check-pr` dwingt het branchmodel af. Een PR met een andere combinatie faalt.

| Van | Naar |
| --- | --- |
| `feature/*`, `dependabot/*`, `module-develop/*`, `main` | `develop` |
| `hotfix/*`, `release/*`, `develop` | `main` |
| `develop` | `release/*`, `acceptance` |
| `module-feature/*` | `module-develop/*` |
| `feature/*`, `hotfix/*`, `module-feature/*` | dezelfde soort (gestapelde PR's) |

Een repo zonder `develop` merget `feature/*` en `dependabot/*` rechtstreeks naar `main`.

## Scripts

Deze scripts werken op de repo's die deze workflows gebruiken. Ze draaien met je lokale `gh`-login. Een script dat iets verandert, laat zonder `--apply` alleen zien wat het zou doen.

| Script | Wat het doet |
| --- | --- |
| `pnpm audit:consumers [-- <repo> …]` | Controleert elke repo tegen de standaardinrichting. Alleen lezen. |
| `pnpm setup-consumer -- <repo> [--apply]` | Zet environments, rulesets en de tag-ruleset volgens de standaard. |
| `pnpm migrate-consumer -- <repo> [--apply]` | Herschrijft de workflows van v1 naar v2 en opent draft-PR's. |
| `pnpm review-vaults [-- <repo> …]` | Toont welke 1Password-velden aandacht nodig hebben. Alleen lezen, nooit een waarde. |

## Aan deze repo werken

Werk aan v2 gaat via een `feature/*`-branch vanaf `v2` en een PR naar `v2`. Een merge naar `v2` draait meteen in elke repo die `@v2` gebruikt.

Je hebt nodig: Node uit `.nvmrc` (`nvm use`), pnpm, `actionlint`, `shellcheck` en `gh`. Op macOS: `brew install pnpm actionlint shellcheck gh`. Node 26 levert geen corepack meer; pnpm kiest zelf de versie uit `packageManager`.

1. Installeer de dependencies met `pnpm install`.
2. Draai `pnpm lint`: actionlint, shellcheck en de typecheck van de scripts.
3. Draai `pnpm test`: de cases van check-pr en de deploy-actions, en de tests van de scripts.

CI draait precies deze twee commando's. Een PR naar `v2` heeft een groene `pipeline` nodig en de review van een senior; een senior mag een eigen PR zonder review mergen.
