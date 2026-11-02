# Voorstel: Python-pakketten via Azure Artifacts

> Status: **voorstel, om te bespreken** (2 november 2026). Hoort bij [Task 22e](implementatieplan.md#task-22e-web-essentials-py-op-v2-python-pakket), optie C.

Dit voorstel werkt optie C uit: een private Python-index op Azure Artifacts, voor web-essentials-py en elk volgend Python-pakket. Het zegt wat we inrichten, wat er in v2 verandert, wat een afnemer doet, en wat het kost.

## Waarom

We willen dat een afnemer een Python-pakket installeert zoals elk ander pakket: een kant-en-klare wheel, met een versiebereik, en met Dependabot die ophoogt. GitHub kan dat niet (zie Task 22e):

- GitHub Packages heeft geen registry voor Python ("not planned" sinds juni 2023).
- Een wheel bij een private release of op een branch is wel te installeren, maar Dependabot leest alleen een echte simple-index (`<index>/<pakket>/`).

Van alle opties geeft alleen een echte index alle drie: wheel, versiebereik en Dependabot.

| | A: git-tag | B: GHCR | C: Azure Artifacts | D: flat index op een branch |
|---|---|---|---|---|
| Kant-en-klare wheel | nee | ja | **ja** | ja |
| Versiebereik | nee | nee | **ja** | ja |
| Dependabot | nee ([#16151](https://github.com/dependabot/dependabot-core/pull/16151) open) | nee | **ja** | nee |
| Extra dienst | nee | nee | ja | nee |

## Waarom Azure Artifacts

- **Azure gebruiken we al.** Er is een Entra-tenant; de blueprint-familie draait op Azure-VM's met Key Vault.
- **Gratis voor ons gebruik.** 2 GiB opslag per organisatie is gratis. Een pure-Python-wheel is tientallen kB. Boven 2 GiB stopt alleen het publiceren; lezen blijft werken.
- **Inloggen zonder vast wachtwoord kan.** GitHub Actions logt in via OIDC (workload identity federation). Dependabot ondersteunt OIDC voor Azure Artifacts.
- **uv kent het.** De uv-docs hebben een eigen handleiding voor Azure Artifacts, voor installeren en voor `uv publish`.

Afgevallen: Gemfury (nog een leverancier, geen OIDC), AWS CodeArtifact en Google Artifact Registry (tokens verlopen na uren, lastig voor lokaal werk), zelf hosten (een host beheren hoort niet bij v2).

## Wat we inrichten (eenmalig, handwerk)

1. **Een Azure DevOps-organisatie** gekoppeld aan onze Entra-tenant, met één project (bijvoorbeeld `packages`). Gratis.
2. **Eén feed** `python` in dat project:
   - project-scoped (de aanbevolen soort);
   - **zonder upstream naar PyPI**: de feed bevat alleen onze eigen pakketten. Alles anders komt rechtstreeks van PyPI.
   - Een versie in een feed is onveranderlijk: dezelfde versie opnieuw publiceren kan niet, ook niet na verwijderen.
3. **Een identiteit om te publiceren:** een Entra-app (of user-assigned managed identity) met een federated credential voor `repo:Pursuit-Amsterdam/web-essentials-py:environment:production`. In Azure DevOps lid van het project, met de rol **Contributor** op de feed.
4. **Een leestoken voor afnemers:** een PAT met alleen **Packaging (Read)**, gescoped op deze organisatie (geen "global" PAT: die stoppen op 1 december 2026). In 1Password, zoals het package-token voor npm.
   - Een PAT verloopt na hooguit een jaar. Zet een herinnering.
   - Later kan lezen ook via OIDC (zie [Later](#later)).

## De afnemer

Elke afnemer zet de index in `pyproject.toml`, met `explicit = true`: dan haalt uv alleen de gekoppelde pakketten uit onze feed, en al het andere van PyPI. Dat beschermt ook tegen iemand die `web-essentials` op PyPI claimt (de naam is daar nog vrij).

```toml
[[tool.uv.index]]
name = "pursuit"
url = "https://pkgs.dev.azure.com/<organisatie>/packages/_packaging/python/pypi/simple/"
explicit = true

[tool.uv.sources]
web-essentials = { index = "pursuit" }

[project]
dependencies = ["web-essentials>=1.1,<2"]
```

Inloggen gaat met twee env-vars; de naam van de index (`pursuit`) zit erin. De gebruikersnaam mag alles zijn.

| Waar | Hoe |
|---|---|
| Lokaal | `UV_INDEX_PURSUIT_USERNAME=pursuit` en `UV_INDEX_PURSUIT_PASSWORD=<leestoken>`, bijvoorbeeld via `op run` of `.envrc`. Of `artifacts-keyring` met `az login` (geen token nodig). |
| CI (`ci.yml`) | `setup-python` zet beide env-vars uit een nieuw secret (zie hieronder). |
| Docker-build | Het token als BuildKit-secret: `RUN --mount=type=secret,id=UV_INDEX_PURSUIT_PASSWORD,env=UV_INDEX_PURSUIT_PASSWORD uv sync --frozen`. Komt niet in een laag van de image. |
| Dependabot | Een `python-index` in `registries` van `dependabot.yml` (zie hieronder). |

`uv.lock` bevat de URL van de index, maar nooit het token.

## Wat er in v2 verandert

**1. Publiceren: een nieuwe workflow `cd-python.yml`**, het Python-broertje van `cd-packages`. Na de gate, in de environment `production`:

1. Checkout van de commit die de gate doorgeeft.
2. Plan: de versie uit `pyproject.toml`; de release-tag moet erbij passen (zoals bij `cd-packages`); staat die versie al in de feed, dan faalt de run (niets gedaan is nooit groen).
3. `uv build`.
4. Inloggen via OIDC (`azure/login`, `permissions: id-token: write`), dan een token voor Azure DevOps: `az account get-access-token --resource 499b84ac-1321-427f-aa17-267ca6975798`.
5. `uv publish --index pursuit` met dat token. Geen opgeslagen schrijfgeheim.

Nodig op de environment `production` van het pakket: de variabelen `AZURE_CLIENT_ID` en `AZURE_TENANT_ID` (geen geheimen).

`cd-packages` uitbreiden met een Python-pad kan ook, maar die workflow is helemaal pnpm en `.npmrc`. Een eigen workflow houdt beide klein.

**2. `release-draft.yml` leest `pyproject.toml`.** De input `version-file` uit Task 22e. Daarmee loopt een Python-pakket door dezelfde flow als npm: versiebump → draft → een senior publiceert → gate → `cd-python`.

**3. Installeren in CI: `setup-python` en `ci.yml` krijgen het leestoken.**

- `ci.yml`: een optioneel secret `PYTHON_INDEX_TOKEN`, op de environment `integration` (zoals het package-token).
- `setup-python`: zet bij een token `UV_INDEX_PURSUIT_USERNAME` en `UV_INDEX_PURSUIT_PASSWORD` (gemaskeerd) vóór `uv sync --frozen`.
- De naam `pursuit` wordt daarmee een vaste afspraak voor de index, in elke afnemer.

**4. Docker-builds: `run-docker-build-push` geeft het leestoken mee als secret**, naast `NODE_AUTH_TOKEN`. Geldt voor `ci-images` en `cd-swarm`.

**5. Dependabot in elke afnemer:**

```yaml
registries:
  pursuit-python:
    type: python-index
    url: https://pkgs.dev.azure.com/<organisatie>/packages/_packaging/python/pypi/simple/
    username: pursuit
    password: ${{ secrets.PYTHON_INDEX_TOKEN }}
updates:
  - package-ecosystem: uv
    directory: /
    schedule:
      interval: weekly
    registries:
      - pursuit-python
```

Geen `replaces-base`: de rest blijft van PyPI komen. Het token staat dan ook als Dependabot-secret in de repo.

**6. `setup-consumer` en de audit** kennen het nieuwe secret: op `integration` en als Dependabot-secret zodra een repo de index in `pyproject.toml` heeft. Zoals het package-token voor npm.

## Wat er in web-essentials-py verandert

- Alles uit Task 22e stap 4 (CI, check-pr, `release-draft` met `version-file: pyproject.toml`, `release-package.yml` weg).
- `pyproject.toml`: de index met `publish-url` (`.../pypi/upload/`).
- `cd.yml`: gate → `cd-python`.
- Eerste release via de draft: v1.1.0 staat nog niet in de feed, dus die kan als eerste (of meteen een nieuwe versie).

## Wat het kost

| | Kosten |
|---|---|
| Azure DevOps-organisatie | gratis |
| Opslag tot 2 GiB | gratis; daarboven vanaf $2 per GiB per maand |
| Identiteit voor publiceren | gratis (Entra-app of managed identity) |
| Werk in v2 | `cd-python.yml`, `release-draft` (`version-file`), `setup-python`, `ci.yml`, `run-docker-build-push`, `setup-consumer` en audit, met tests en een bewijs in de voorbeeldrepo |
| Onderhoud | het leestoken jaarlijks vernieuwen, in 1Password en de repo's (`setup-consumer` meldt waar het mist) |

## Risico's en hoe we ze afvangen

- **Het leestoken verloopt** → alle Python-installs in CI en Dependabot falen tegelijk. Afvangen: herinnering vóór de vervaldatum; later lezen via OIDC.
- **Een afnemer vergeet `explicit = true`** → uv zoekt `web-essentials` ook op PyPI. Afvangen: de audit controleert het.
- **De feed loopt vol** → alleen publiceren stopt. Afvangen: geen upstream (alleen eigen pakketten), oude prereleases opruimen.
- **Azure DevOps zelf** is een tweede plek met toegangsbeheer. Afvangen: één project, één feed, alleen identiteiten en het leestoken.

## Later

- **Lezen via OIDC in CI**, zonder leestoken: per afnemende repo een federated credential (een Entra-app heeft er hooguit 20), of een "flexible federated credential" met een patroon op repo-naam. Dan `azure/login` in `setup-python` en de Docker-build.
- **Dependabot via OIDC:** `tenant-id` en `client-id` in plaats van `password` in `dependabot.yml`.
- **Andere Python-pakketten:** zelfde feed, zelfde afspraak (`pursuit`), alleen een nieuwe federated credential voor de publicerende repo.

## Te beslissen

1. Optie C (dit voorstel) of A, B of D uit Task 22e?
2. Bestaat er al een Azure DevOps-organisatie, en wie wordt eigenaar (Bas of Sam)?
3. Publiceren via een Entra-app of een user-assigned managed identity? (De managed identity vraagt een Azure-subscription; de app niet.)
4. Akkoord met een leestoken (PAT, jaarlijks vernieuwen) als start, met OIDC voor lezen als vervolg?

## Stappen na een besluit

1. **Handwerk:** organisatie, project, feed, identiteit voor publiceren, leestoken in 1Password.
2. `release-draft`: `version-file` (Task 22e stap 1–3).
3. `cd-python.yml` met tests (nep-`uv` en nep-`az`), bewezen in de voorbeeldrepo met een testpakket.
4. `setup-python`, `ci.yml`, `run-docker-build-push`: het leestoken; `setup-consumer` en de audit.
5. web-essentials-py naar `v2`; eerste release via de draft; de versie staat in de feed.
6. sluyter (met Sam): de index in `pyproject.toml`, het leestoken in CI, de Docker-build en Dependabot; de git-source, de PAT en `insteadOf` weg.

## Bronnen

- [uv: Azure Artifacts](https://docs.astral.sh/uv/guides/integration/azure/): index-URL, inloggen, `uv publish`
- [GitHub: private registries voor Dependabot](https://docs.github.com/en/code-security/how-tos/secure-your-supply-chain/manage-your-dependency-security/configure-access-to-private-registries): `python-index`, Azure DevOps met OIDC
- [Microsoft: GitHub Actions naar Azure Artifacts](https://learn.microsoft.com/en-us/azure/devops/artifacts/quickstarts/github-actions?view=azure-devops): managed identity, federated credential, token via `az`
- [Microsoft: opslag en kosten van Azure Artifacts](https://learn.microsoft.com/en-us/azure/devops/artifacts/artifact-storage)
- [Microsoft: global PAT's stoppen op 1 december 2026](https://devblogs.microsoft.com/devops/retirement-of-global-personal-access-tokens-in-azure-devops)
- [github/roadmap#94](https://github.com/github/roadmap/issues/94): PyPI in GitHub Packages, "not planned"
- [dependabot-core: hoe Dependabot een Python-index leest](https://github.com/dependabot/dependabot-core/blob/main/python/lib/dependabot/python/package/package_details_fetcher.rb)

---

[← Implementatieplan](implementatieplan.md) · [Voortgang](voortgang.md)
