# Playbook GitHub

Dit playbook zegt hoe je bij Pursuit met GitHub werkt. Het geldt voor elk project dat de gedeelde workflows `@v2` gebruikt.

De regels in dit playbook zijn ook in GitHub ingesteld. Een PR die een regel breekt, kan niet mergen.

## Woorden

Dit playbook gebruikt deze woorden altijd met dezelfde betekenis.

| Woord | Betekenis |
| --- | --- |
| PR | Pull request. Een verzoek om je branch in een andere branch te mergen. |
| Review | Een collega leest je PR en keurt hem goed of vraagt om wijzigingen. |
| Senior | Lid van het GitHub-team `senior-developers`. |
| Check | Een automatische controle op een PR, bijvoorbeeld `run-ci / pipeline`. |
| CI | De workflow die lint, typecheck, test en build uitvoert. |
| CD | De workflow die deployt. |
| QA | De controle van het resultaat op staging, meestal door een projectmanager. |
| Release | Een versie in GitHub Releases, met een tag die begint met `v`. |

## Accounts en rollen

Je werkt met een GitHub-account van Pursuit. Een persoonlijk account mag niet. De licenties, bijvoorbeeld voor Copilot, horen bij het account van Pursuit.

Elk account zit in één team. Het team bepaalt wat je mag.

| Team | Rechten | Wat dit betekent |
| --- | --- | --- |
| `developers` | write | Je maakt branches en PR's. Je PR heeft de goedkeuring van een senior nodig. |
| `senior-developers` | admin | Je mag je eigen PR mergen zonder review. Je mag een release maken. |
| `project-managers` | maintain | Je beheert issues en PR's. |

Niemand kan een check overslaan. Ook een senior niet.

## Repo's

Elk project heeft één repo. De naam van de repo is de naam van het Asana-project, in kleine letters, met streepjes. Voorbeeld: "Food Cabinet Website" wordt `foodcabinet-website`.

Zet frontend en backend in één repo. Meerdere pakketten in één repo zijn een monorepo met `turbo.json`. Gebruik alleen aparte repo's als het niet anders kan. Aparte repo's kunnen in productie verschillende versies hebben.

Elke repo heeft:

- De broncode.
- `package.json` met een script per check: `lint`, `typecheck`, `test` en `build`.
- `.nvmrc` met de Node-versie.
- Drie workflows in `.github/workflows/`: `ci.yml`, `cd.yml` en `check-pr.yml`.
- `.github/CODEOWNERS` met de regel `* @Pursuit-Amsterdam/senior-developers`.
- `.github/dependabot.yml`.
- De gedeelde configuratiepakketten (zie [Gedeelde pakketten](#gedeelde-pakketten)).

## Branches

Elke branch heeft een vaste naam. De workflows en de checks gebruiken die naam.

| Branch | Doel | Omgeving |
| --- | --- | --- |
| `main` | Wat in productie staat of komt. | production, via een release |
| `develop` | Wat klaar is voor QA. | staging, na elke merge |
| `acceptance` | Optioneel. Voor acceptatie door de klant. | acceptance |
| `feature/<naam>` | Nieuw werk. Voorbeeld: `feature/hero-section`. | geen |
| `hotfix/<naam>` | Een dringende fix voor productie. | geen |
| `dependabot/...` | Updates van Dependabot. | geen |

Een PR mag alleen in deze richtingen:

| Van | Naar |
| --- | --- |
| `feature/*`, `dependabot/*` | `develop` |
| `develop` | `main`, `acceptance` |
| `hotfix/*` | `main` |
| `main` | `develop` (na een hotfix) |
| `feature/*` | `feature/*` (een PR op een andere PR) |

Een repo zonder `develop` (bijvoorbeeld een configuratiepakket) merget `feature/*` en `dependabot/*` direct naar `main`.

De check `run-check-pr / pipeline` controleert de naam en de richting. Een verkeerde richting maakt de check rood.

## Van taak naar productie

Deze stappen brengen een Asana-taak naar productie.

1. Maak een branch `feature/<naam>` van `develop`.
2. Maak commits (zie [Commits](#commits)).
3. Voer lokaal de scripts uit die CI uitvoert. Voorbeeld: `pnpm lint`, `pnpm typecheck` en `pnpm test`.
4. Push de branch.
5. Maak een PR naar `develop` (zie [Pull requests](#pull-requests)).
6. Zet de link van de PR in de subtaak "PR Review" in Asana. Wijs de reviewer toe.
7. Wacht tot alle checks groen zijn.
8. Wacht op de goedkeuring van de reviewer.
9. Merge de PR.
10. Wacht op de deploy naar staging. CD start automatisch als CI op `develop` groen is.
11. De projectmanager doet QA op staging. Opmerkingen komen in Asana.
12. Een senior brengt `develop` naar productie (zie [Releases](#releases)).

Een merge naar `main` deployt niets. Alleen een release deployt naar productie.

## Commits

Een commit-bericht zegt wat je verandert en waar. Schrijf het in het Engels.

| Goed | Fout |
| --- | --- |
| `Added images to home section` | `Added images` |
| `Removed unused code in catalog API endpoint` | `Updated home section` |

Commit altijd op een `feature/*`- of `hotfix/*`-branch. Commit nooit direct op `main` of `develop`. GitHub weigert dat.

## Pull requests

Een PR bevat één afgeronde feature of fix. Houd een PR klein: minder dan 500 regels, zonder lock- en buildbestanden.

De beschrijving van de PR zegt:

- Wat je veranderd hebt.
- Waarom.
- Hoe de reviewer het kan testen.
- Welke Asana-taak erbij hoort (link).

Goede commit-berichten maken de beschrijving eenvoudig. Copilot kan een eerste versie schrijven. Lees die versie altijd na.

Een PR kan pas mergen als:

- `run-check-pr / pipeline` groen is.
- `run-ci / pipeline` groen is.
- Een senior de PR heeft goedgekeurd. Een senior mag zijn eigen PR zonder review mergen.

Een nieuwe commit na de goedkeuring maakt de goedkeuring ongeldig. Vraag dan opnieuw om een review.

## Code review

Elke regel code krijgt een review. De reviewer leert van jouw werk, en jij van de reviewer. Fouten komen zo vroeg aan het licht.

### Wie doet de review

Je wijst de reviewer aan in Asana, in de subtaak "PR Review". GitHub stuurt zelf geen bericht naar het team. De subtaak in Asana is het signaal voor de reviewer.

| Soort wijziging | Reviewer |
| --- | --- |
| Alleen frontend, of maximaal 5 regels logica. | Elke developer. |
| Meer dan 5 regels logica of dataverwerking. | Een developer van hetzelfde project. Anders een senior. |
| Architectuur of infrastructuur: authenticatie, databaseschema, workflows. | Alleen een senior. |

Een PR heeft altijd de goedkeuring van een senior nodig om te mergen. Laat een andere developer eerst reviewen als dat leerzaam is. Vraag daarna een senior.

### Wat controleer je

Controleer deze punten in deze volgorde.

1. **Checks.** Alle checks zijn groen.
2. **Opbouw.** De branchnaam past bij de taak. De beschrijving zegt wat, waarom en hoe te testen. De Asana-taak is gelinkt. De PR is kleiner dan 500 regels.
3. **Leesbaarheid.** Logica staat los van weergave. Een functie is kort en doet één ding. Parameters en returnwaarden hebben types. Namen zijn duidelijk en consequent. Moeilijke code heeft een kort commentaar.
4. **Hergebruik.** Nieuwe code kopieert geen bestaande code. Bestaande helpers worden gebruikt.
5. **Fouten.** Netwerkverzoeken en invoer van buiten hebben foutafhandeling. Invoer wordt gecontroleerd voor gebruik. Een log bevat context, maar geen geheimen. De app blijft werken bij een fout.
6. **Tests.** Nieuwe en gewijzigde functies hebben tests. De tests dekken goede en foute invoer. De tests hangen niet af van een externe omgeving. De dekking gaat niet omlaag.

Zet opmerkingen in GitHub, bij de regel code. Keur de PR goed als alles in orde is.

## Releases

Een release brengt een versie naar productie. Alleen een senior kan een release maken. GitHub weigert een tag `v*` van iemand anders.

Doe deze stappen voor een release van een project.

1. Maak een PR van `develop` naar `main`.
2. Wacht tot de checks groen zijn. Merge de PR.
3. Maak in GitHub Releases een nieuwe release op `main`, met een nieuwe tag.
4. Publiceer de release. CD wacht op CI van `main` en deployt dan de commit van de tag naar productie.

Een release voor een gedeeld pakket gaat anders. Na een merge naar `main` staat er een concept-release klaar, met de versie uit `package.json`. Een senior publiceert die. CD publiceert het pakket.

### Versienummers

De meeste projecten gebruiken de datum als versie.

| Situatie | Tag | Voorbeeld |
| --- | --- | --- |
| Eerste release van de dag | `vYYYY.MM.DD` | `v2026.10.28` |
| Volgende release op dezelfde dag | `vYYYY.MM.DD.N` | `v2026.10.28.2` |
| Test in productie, bijvoorbeeld van een cron job | `vYYYY.MM.DD.pN` | `v2026.10.28.p1` |

Het getal na `p` loopt altijd op, ook op een andere dag.

Markeer een release niet als "pre-release" in GitHub. CD deployt een pre-release alleen als de repo dat apart toestaat.

Pakketten, en een API die los van zijn gebruikers deployt, gebruiken [semver](https://semver.org/): `vMAJOR.MINOR.PATCH`.

- MAJOR: een wijziging die niet compatibel is, of die een migratie nodig heeft.
- MINOR: een nieuwe feature.
- PATCH: een bugfix.

### Hotfix

Een hotfix gaat direct naar productie, buiten `develop` om.

1. Maak een branch `hotfix/<naam>` van `main`.
2. Maak een PR naar `main`.
3. Merge de PR na review en groene checks.
4. Maak een release (zie hierboven).
5. Maak een PR van `main` naar `develop`. Zo komt de fix ook op `develop`.

### Terugdraaien

CD kan niet terugdraaien naar een oudere versie. Herstel een fout met een nieuwe commit en een nieuwe release.

Een migratie van de database moet daarom altijd compatibel zijn met de versie die nog draait.

## Deploy met de hand

Je kunt een deploy opnieuw starten. Gebruik dit als een deploy faalde door een tijdelijke fout.

1. Ga in de repo naar **Actions** → **Continuous Deployment**.
2. Klik op **Run workflow**.
3. Kies `develop` voor staging. Kies de nieuwste release-tag voor productie.
4. Klik op **Run workflow**.

Een oudere tag of commit kan niet.

## Gedeelde workflows

De workflows van alle repo's staan in de repo [Pursuit-Amsterdam/workflows](https://github.com/Pursuit-Amsterdam/workflows). Een project roept ze aan met `@v2`.

Het project bepaalt wat een check doet: de scripts in `package.json`. De gedeelde workflow bepaalt wanneer de check draait. Lokaal voer je dus dezelfde scripts uit als CI.

Voorbeeld van `ci.yml` in een project:

```yaml
jobs:
    run-ci:
        uses: Pursuit-Amsterdam/workflows/.github/workflows/ci.yml@v2
        with:
            checks: lint typecheck test build
            use-custom-token: true
        secrets: inherit
```

Een senior richt een nieuwe repo in. Alle stappen staan in de README van de workflows-repo.

## Gedeelde pakketten

Pursuit heeft eigen npm-pakketten. Elk webproject met React en TypeScript gebruikt deze vier configuratiepakketten:

| Pakket | Doel |
| --- | --- |
| `eslint-config` | Dezelfde lintregels in elk project. |
| `prettier-config` | Dezelfde opmaak in elk project. |
| `typescript-config` | Dezelfde TypeScript-instellingen in elk project. |
| `jest-config` | Dezelfde instellingen voor unit tests in elk project. |

De pakketten staan in de privé-registry van GitHub. Je hebt een token nodig om ze lokaal te installeren. Doe deze stappen één keer:

1. Ga naar [github.com/settings/tokens](https://github.com/settings/tokens).
2. Klik op **Generate new token (classic)**.
3. Selecteer alleen `read:packages`.
4. Kies bij **Expiration** de optie **No expiration**. Vul een notitie in.
5. Klik op **Generate token**.
6. Sla het token op in je employee-vault in 1Password.
7. Voer `npm login --registry=https://npm.pkg.github.com` uit.
8. Vul je GitHub-gebruikersnaam in. Vul het token in als wachtwoord.

pnpm gebruikt dezelfde login.

## Notificaties

GitHub stuurt je alleen een mail als iemand jou persoonlijk iets vraagt. Het signaal voor een review is de subtaak in Asana, niet een mail van GitHub.

Doe deze instellingen in [github.com/settings/notifications](https://github.com/settings/notifications):

1. Zet **Watching** op alleen **GitHub** (geen e-mail).
2. Zet **Participating, @mentions and custom** op **GitHub** en **Email**.
3. Stel een profielfoto in. Collega's herkennen je dan sneller.

## Als iets niet werkt

Deze tabel geeft de meest voorkomende problemen.

| Probleem | Oorzaak | Oplossing |
| --- | --- | --- |
| `run-check-pr / pipeline` is rood. | De branchnaam of de richting van de PR is fout. | Kijk in [Branches](#branches). Wijzig de doelbranch van de PR, of maak een branch met een goede naam. |
| `run-ci / pipeline` is rood. | Een script faalt: lint, typecheck, test of build. | Open de check. Voer hetzelfde script lokaal uit. Herstel de fout. |
| De PR kan niet mergen, maar alle checks zijn groen. | De goedkeuring van een senior ontbreekt. | Vraag een senior om een review via Asana. |
| Na de merge naar `develop` staat niets op staging. | CI op `develop` is rood, of CD faalde. | Open **Actions**. Herstel de rode run. Start de deploy met de hand. |
| Na de merge naar `main` staat niets in productie. | Dit is juist: een merge naar `main` deployt niet. | Laat een senior een release maken. |
| `pnpm install` geeft 401 of 403 op `@pursuit-amsterdam`. | Je token ontbreekt of is fout. | Doe de stappen in [Gedeelde pakketten](#gedeelde-pakketten) opnieuw. |

Vraag een senior als je er niet uitkomt.
