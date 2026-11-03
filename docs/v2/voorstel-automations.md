# Voorstel: de automations-familie op workflows v2

> Status: **voorstel, om te bespreken met Sam** (3 november 2026). Hoort bij [Task 29](implementatieplan.md#task-29-de-blueprint-familie-en-sluyter-op-v2-groep-c-handwerk-met-sam).

De automations-repo's zijn geen gewone afnemers. Hun workflows komen uit een template, en twee repo's installeren code uit een andere private repo. Dit voorstel beschrijft hoe dat werkt, wat er nu misgaat, en hoe de familie op v2 komt zonder het template-model te breken.

## Hoe de familie werkt

automations-blueprint is geen package maar een volledige applicatie, die een instantie als broncode overneemt.

- **De template** is de hele blueprint-repo: FastAPI en Celery (`apps/backend`), een Next.js-dashboard (`apps/web`), Terraform (`infra/`), compose- en stackbestanden, `.github/**`, `docs/**`.
- **Een instantie** kopieert die broncode. `python template/sync.py sync --to <tag>` clonet de blueprint op een tag en overschrijft elk pad dat [`template/MANIFEST`](https://github.com/Pursuit-Amsterdam/automations-blueprint/blob/main/template/MANIFEST) als `sync` markeert. Een merge vindt niet plaats. `template/VERSION` legt de tag vast.
- **Eigen code** staat in de `instance/`-mappen; de sync raakt die niet aan. `review`-bestanden (`pyproject.toml`, `package.json`, `docker-stack.yml`, `.env.example`) blijven van de instantie; de sync toont alleen de diff.
- **`.github/**` valt onder `sync`.** De workflows van een instantie zijn dus van de blueprint.
- **Twee eigen workflows** bewaken het model:
  - `template-drift.yml`: `sync.py check` bij elke PR. Rood als een `sync`-bestand lokaal is aangepast, verwijderd of toegevoegd.
  - `spec-check.yml`: `automations check-specs`. Controleert de `credential_fields` en `param_fields` van elke ingestor, processor, LLM-provider en storage-backend (dubbele keys, een credential met een `default`, een key die zowel credential als param is).

| Repo | Rol | `template/VERSION` | Stand |
| --- | --- | --- | --- |
| automations-blueprint | template | `v0.1.0` (bewust: de blueprint volgt zichzelf niet) | laatste tag `v0.5.0` |
| bnext-automations | instantie | `v0.4.0` | sync-commits per tag (v0.2.1 → v0.4.0); één versie achter |
| integrators-automations | instantie | `v0.6.2` | eigen releases in `VERSION`; deelt de git-geschiedenis met de blueprint |
| gp-groot-automations | voorloper | geen | branch `port-to-blueprint`, nog niet gemerged |
| sluyter-logistics-automations | los, geen template | geen | installeert web-essentials-py via een uv git-source |

## Wat er nu misgaat

De runs van 16 tot en met 28 oktober 2026 in integrators en bnext laten vijf problemen zien.

1. **De drift-check heeft nog nooit gecontroleerd.** Elke run faalt op de clone, niet op drift:
   ```
   git clone of https://github.com/Pursuit-Amsterdam/automations-blueprint.git at v0.4.0 failed:
   fatal: could not read Username for 'https://github.com'
   ```
   De blueprint is privé, en `sync.py` clonet zonder token. De `GITHUB_TOKEN` van een instantie kan geen andere repo lezen.
2. **integrators gebruikt `template/VERSION` voor de eigen releases.** `v0.6.1` en `v0.6.2` zijn releases van integrators; de blueprint heeft geen tag boven `v0.5.0` (`v0.6.0` is op 30 september 2026 verwijderd). Ook met een token faalt de check dus. "template v0.6.2" in Task 29 klopt daarom niet.
3. **bnext heeft geen spec-check.** Die kwam in `v0.5.0`, en bnext staat op `v0.4.0`.
4. **Er is geen token dat een private repo mag lezen.** Op drie plekken is dat nodig:

   | Waar | Wat | Nu |
   | --- | --- | --- |
   | `sync.py check` in CI | de blueprint clonen | geen token, dus rood |
   | `uv sync` in CI | web-essentials-py als git-source | sluyter: een eigen repo-secret `CUSTOM_GITHUB_TOKEN` |
   | Docker-build | idem, via BuildKit-secret `GITHUB_TOKEN` en `git config url.insteadOf` | idem |

   Het v2-`CUSTOM_GITHUB_TOKEN` helpt niet: dat is een klassieke PAT met alleen `packages:read` ([besluit van 2 november 2026](beslissingen.md#decided)), en daarmee clone je geen repo. Lokaal speelt het niet: daar gebruikt git de login van de developer.
5. **Rood blokkeert niets.** v2 verplicht alleen `run-ci / pipeline` (en `run-ci-images / pipeline`). Drift- en spec-check staan erbuiten, dus een rode drift-check valt niemand op.

Verder: `cd.yml` op `main` van de blueprint gebruikt al `VM_SSH_*` (commit d22bba5), maar geeft nog `keyvault-name` en `AZURE_CREDENTIALS` mee. `vm-cd@main` en `cd-swarm@v2` kennen die niet. Key Vault blijft [buiten v2](implementatieplan.md#task-29-de-blueprint-familie-en-sluyter-op-v2-groep-c-handwerk-met-sam).

## Voorstel

Het voorstel bestaat uit vijf delen. Deel 1 raakt ook andere repo's; deel 2 tot en met 5 gaan alleen over de familie.

### 1. Eén leestoken voor private repo's

Nodig is een token met alleen **Contents: read** op de repo's waarvan code wordt opgehaald: nu automations-blueprint en web-essentials-py.

| | Klassieke PAT + `repo` | Fine-grained PAT | GitHub App | Azure Artifacts |
| --- | --- | --- | --- | --- |
| Alleen lezen, alleen gekozen repo's | nee: schrijven op elke repo van het account | ja | ja | n.v.t. |
| Verloopt | ja | ja (hooguit een jaar) | nee: een token per run, 1 uur geldig | ja (PAT) |
| Hangt aan een persoon of account | ja | ja | nee | ja |
| Dekt de blueprint-clone | ja | ja | ja | **nee** |
| Wie maakt hem aan | team-account | team-account | een org-owner | zie [voorstel](voorstel-azure-artifacts.md) |

`CUSTOM_GITHUB_TOKEN` uitbreiden kan niet: fine-grained PAT's werken niet met GitHub Packages, en `repo` op de klassieke PAT is te ruim. Het wordt dus een tweede token, naast het package-token.

**Aanbeveling:** een GitHub App, bijvoorbeeld `pursuit-repo-read`, met alleen Contents en Metadata (lezen), geïnstalleerd op de gekozen repo's. Niet de audit-app (Task 24): die leest instellingen en secrets op alle repo's, en zijn sleutel hoort niet op `integration`, waar de CI van een PR draait. Een fine-grained PAT dient als tussenstap tot de App er is; die gebruikt dezelfde plekken.

Wat v2 erbij krijgt:

- `ci.yml`, `ci-images.yml` en `cd-swarm.yml`: een leestoken naast `use-custom-token`.
  - `setup-python` (`github-token`) en de BuildKit-secret `GITHUB_TOKEN` krijgen het leestoken. `NODE_AUTH_TOKEN` blijft `CUSTOM_GITHUB_TOKEN`.
  - Bij de App wordt het token in de job aangemaakt met `actions/create-github-app-token`; app-id en sleutel staan als secrets op de environments. Bij de PAT is het één secret.
  - De Dockerfile van sluyter leest al `id=GITHUB_TOKEN`, dus die past zonder wijziging.
- `setup-consumer` en de audit kennen het nieuwe secret: op `integration` en de deploy-environments zodra een repo een private git-source of een template-sync heeft.

### 2. De drift-check in de blueprint laten werken

Dit is werk voor Sam, in de blueprint.

- `sync.py` gebruikt een token uit de env als dat er is (bijvoorbeeld `GH_TOKEN` in de clone-URL, of `url.insteadOf` vóór de clone). Zonder token blijft het de git-login van de developer.
- `template-drift.yml` maakt het token aan (zie deel 1) en geeft het mee.
- integrators: `template/VERSION` terugzetten naar de blueprint-tag waar de template-bestanden echt op staan. Daarna levert `sync.py check` voor het eerst een echte lijst met drift.

### 3. CI en CD in de template: dunne aanroepen van `@v2`

`.github/**` blijft `sync`, maar bevat alleen aanroepen. De logica zit in deze workflows-repo.

- `ci.yml` met `run-ci` en `run-ci-images` (`image-ci.yml`, `backend-ci.yml` en `web-ci.yml` verdwijnen), `cd.yml` met cd-gate en cd-swarm bij `release: published`, `check-pr.yml`. Zoals het [Swarm-migratievoorbeeld](naslag/migratievoorbeelden.md#migration).
- Gevolg: een fix in v2 bereikt elke instantie zonder sync, omdat `@v2` meebeweegt. Een sync is alleen nodig als de aanroep zelf verandert.
- **`CODEOWNERS` uit de sync.** Eigenaar en profiel (standaard of licht, [Task 30](implementatieplan.md#task-30-lichte-bescherming-uit-codeowners)) verschillen per repo. In het MANIFEST, onder de `sync .github/**`-regel (de laatste match wint):
  ```
  review  .github/CODEOWNERS
  ```
  Zo levert de template het bestand bij een nieuwe instantie, maar overschrijft hij het daarna nooit, net als `theme.css`.

### 4. Spec- en drift-check in de verplichte pipeline

Een check die niet verplicht is, gaat ongemerkt rood. Daarom gaan beide checks in de verplichte pipeline.

- **Spec-check** wordt een script in `apps/backend/package.json` (bijvoorbeeld `check:specs`, met de twee nepwaarden voor `ENCRYPTION_KEY1` en `JWT_SECRET_KEY` erin). `ci.yml` draait het via turbo, dus het valt onder `run-ci / pipeline`. `spec-check.yml` verdwijnt.
- **Drift-check** heeft het leestoken nodig en draait daarom op `integration`. Twee mogelijkheden:
  - ook een script (`check:template`), als `ci.yml` het leestoken aan de checks doorgeeft;
  - of `template-drift.yml` blijft, en `setup-consumer` zet hem als tweede verplichte check in de rulesets van instanties.

  Voorkeur: het script. Dan blijft er één verplichte check, zoals in elke andere repo.

### 5. `template/VERSION` alleen voor de template

`VERSION` betekent één ding: de blueprint-tag waarop de instantie staat. Zo bedoelt de blueprint het ook.

- Een release van een instantie loopt via v2: `release-draft` stelt de tag voor, een senior publiceert, daarna cd-gate en cd-swarm. Die tag staat in de instantie, niet in `VERSION`.
- Een instantie die zelf `VERSION` ophoogt, breekt de drift-check (zie probleem 2).

## Volgorde

De volgorde volgt uit de afhankelijkheden: eerst het token, dan v2, dan de blueprint, dan de instanties.

1. **Handwerk:** het leestoken. De App via een org-owner (samen met het verzoek voor de audit-app), of eerst een fine-grained PAT. Waarde of sleutel in 1Password.
2. **v2:** het leestoken in `ci.yml`, `ci-images.yml` en `cd-swarm.yml`, plus `setup-consumer` en de audit. Met tests, en bewezen in een voorbeeldrepo met een private git-source.
3. **Blueprint (Sam):** `sync.py` met token, dunne `.github/**`, `review .github/CODEOWNERS`, `check:specs` en `check:template` als scripts, Key Vault-inputs uit `cd.yml`. Daarna een nieuwe tag.
4. **bnext:** sync naar de nieuwe tag (vanaf `v0.4.0`, dus ook alles uit `v0.5.0`), `setup-consumer --apply`, eerste release door een senior.
5. **integrators:** eerst `VERSION` rechtzetten (deel 2), dan dezelfde stappen als bnext.
6. **gp-groot:** pas na de merge van `port-to-blueprint`; v2 komt dan mee met de eerste sync.
7. **sluyter:** het leestoken in plaats van de eigen PAT, `release.yml` op `@v2`, plus `check-pr.yml`, `CODEOWNERS` en `ci.yml`. Of via Azure Artifacts, als dat [voorstel](voorstel-azure-artifacts.md) wordt gekozen; de blueprint-clone heeft het leestoken dan nog steeds nodig.

Reken op rode CI bij de eerste run van elke instantie: in v2 draaien `ruff` en `pytest` echt.

## Te beslissen

1. Het leestoken: een GitHub App (aanbevolen) of een fine-grained PAT? Wie maakt hem aan?
2. De naam van het secret, of van de twee App-secrets.
3. `CODEOWNERS` als `review` in het MANIFEST?
4. Spec- en drift-check als scripts onder `run-ci / pipeline`, of drift als tweede verplichte check?
5. integrators: op welke blueprint-tag staan de template-bestanden echt?
6. web-essentials-py: git-source met het leestoken (optie A van [Task 22e](implementatieplan.md#task-22e-web-essentials-py-op-v2-python-pakket)) of Azure Artifacts (optie C)?

## Bronnen

- [automations-blueprint: `docs/template.md`](https://github.com/Pursuit-Amsterdam/automations-blueprint/blob/main/docs/template.md): template tegenover instantie, sync, drift, codemods
- [automations-blueprint: `template/MANIFEST`](https://github.com/Pursuit-Amsterdam/automations-blueprint/blob/main/template/MANIFEST)
- [automations-blueprint: `template-drift.yml`](https://github.com/Pursuit-Amsterdam/automations-blueprint/blob/main/.github/workflows/template-drift.yml) en [`spec-check.yml`](https://github.com/Pursuit-Amsterdam/automations-blueprint/blob/main/.github/workflows/spec-check.yml)
- [GitHub: Packages werkt alleen met een klassieke PAT](https://docs.github.com/en/packages/learn-github-packages/about-permissions-for-github-packages#about-scopes-and-permissions-for-package-registries)
- [`actions/create-github-app-token`](https://github.com/actions/create-github-app-token)

---

[← Implementatieplan](implementatieplan.md) · [Voortgang](voortgang.md)
