<a id="rollout"></a>

# Uitrol in detail

Door twee regels van GitHub Actions kun je op `main` niets veranderen zonder alle repo's tegelijk aan te passen. Een versiebranch omzeilt allebei. Zolang alleen de testrepo's hem gebruiken, is diezelfde branch ook de werkbranch; een aparte ontwikkelbranch is niet nodig.

- **Onbekende inputs zijn fataal.** Een aanroeper die een input meegeeft die de workflow niet meer declareert, krijgt `startup_failure`. Het `framework`-incident is precies dit. Een input hernoemen op `main` breekt dus elke aanroeper tegelijk.
- **Doorverwijzen verandert de naam van de check.** Laat je web-ci.yml alleen ci.yml aanroepen, dan heet de job `run-ci / pipeline / pipeline`. gp-map-webapp vereist `run-ci / pipeline` op main en develop.

## Twee refs

| Ref | Wie hem gebruikt | Wat hij belooft |
| --- | --- | --- |
| `v2` | Eerst alleen de testrepo's: template-nextjs-vercel, tms-test, gp-map-webapp, gp-groot-automations, gp-container-tracking-webapp, een repo met Supabase edge functions en translations-management. Zo gekozen dat alles aan bod komt: Vercel, het vertalingen-CMS, Swarm met Postgres en images, een CI die nu niets doet, een Swarm-stack zonder eigen images, het token van het Supabase-machine-account, en een pakket publiceren. Daarna alle anderen, wanneer ze zelf willen. | Tijdens de bouw niets: hij kan elk moment veranderen, en een rode run hoort erbij. Na de afspraak "v2 is klaar": geen breaking changes meer. De volgende breaking change wordt `v3`. |
| `main` | Repo's die nog niet zijn overgestapt. | End of life: geen wijzigingen meer, ook geen hotfixes. De README krijgt een banner die naar v2 wijst. |

## Volgorde

1. CI op v2

   De workflows-repo krijgt eerst zijn eigen CI en de bescherming van `v2` (principe 8, hieronder). Daarna inventariseren welke repo's alleen Python zijn; welke turbo gebruiken, is bekend. Dan ci.yml, setup-services, setup-supabase, run-image-smoke en ci-images. Interne refs op `@v2`, vervangen CI-bestanden weg, check-pr kent `v*`.
2. CD op v2

   Eerst cd-gate alleen, getest met het [testplan hieronder](#gate-tests) tegen de voorbeeldrepo. Daarna cd-vercel, cd-supabase, cd-swarm, cd-pages, cd-packages en run-translations, met de controles die bij CD horen. Vervangen CD-bestanden en codegen.yml weg, README herschreven. Het Supabase-machine-account en zijn secret aanmaken.
3. Testrepo's op @v2

   template-nextjs-vercel (basis voor nieuwe sites), tms-test (CMS), gp-map-webapp (Postgres, ci-images, gate, Swarm), gp-groot-automations (Python zonder checks), gp-container-tracking-webapp (stack zonder images), een repo met Supabase edge functions, en translations-management (pakket publiceren).
4. v2 is klaar

   Als elke testrepo via `v2` naar al zijn environments heeft gedeployd. Er verandert niets in de repo: het is een afspraak dat de andere repo's mogen overstappen, en dat `v2` vanaf dan niet meer breekt.
5. De rest op @v2

   Een migratiescript herschrijft de workflowbestanden (inputs, ref, en de CD-trigger van `push` naar `workflow_run`) en opent de PR; `setup-consumer.sh` past de standaardinrichting toe, inclusief de branchregels per environment en het verplaatsen van deploy-secrets die nog op de repo staan. `main` verandert niet meer.

## Bescherming van `v2`

Wat op `v2` staat, draait met de environment-secrets van elke repo die hem aanroept. Een push naar `v2` is daarmee een push naar elke productie-deploy. De branch krijgt daarom vanaf dag één:

- Een ruleset voor `v*`: PR verplicht, één review, review van de code owners, geen force push, geen verwijderen. De eigen CI (principe 8) als verplichte check.
- **Senior developers mogen hun eigen PR mergen** ([besloten](../beslissingen.md#decided)): de ruleset met de review laat repo-admins (het team `senior-developers`) die review overslaan, alleen op PR's; de check `pipeline` staat in een tweede ruleset zonder bypass en blijft dus voor iedereen verplicht. Iedereen anders heeft de review van een senior nodig. Dat is dezelfde regel als in de consumer-repo's. PR's die de gate of secrets raken (Task 11, 19, 24) laat een senior bij voorkeur toch door een tweede senior reviewen.
- `CODEOWNERS` voor `.github/` en `scripts/`.
- Dependabot met `target-branch: v2` voor `github-actions`, zodat de vastgepinde externe actions bijgewerkt blijven. Zonder die regel kijkt Dependabot alleen naar `main`, en die bevriest.
- Geen secrets in deze repo behalve wat de voorbeeldrepo en de audit nodig hebben, en die staan op een environment met `v2` als enige toegestane branch.

<a id="gate-tests"></a>

## Testplan voor de gate

De gate is het stuk waar alle events samenkomen, en de voorbeeldrepo (principe 8) heeft een `deploy`-job die alleen `echo` doet. Elke regel is een scenario dat precies één keer het verwachte resultaat moet geven; pas daarna komt er een echte cd-\* achter.

| Scenario | Verwacht |
| --- | --- |
| Merge naar `develop`, CI groen | één CD-run, gate groen, één deploy naar staging op de merge-commit |
| Merge naar `develop`, CI rood; daarna CI re-run groen | eerst een grijze (overgeslagen) CD-run; na de re-run een deploy |
| Pull request geopend | CI draait, geen CD-run |
| Merge naar `main` | CI draait, geen deploy |
| Release gepubliceerd nadat CI op `main` groen is | deploy naar productie op de commit van de tag |
| Release gepubliceerd vóór CI op `main` klaar is; daarna re-run van de CD-run | eerst rood met "CI not finished"; de re-run deployt |
| Dispatch vanaf de tag van de nieuwste release | deploy naar productie |
| Dispatch vanaf een oudere tag | rood: "not the latest release" |
| Dispatch vanaf `develop` | deploy naar staging op de head van `develop` |
| Dispatch vanaf `feature/x` | rood: geen environment voor die branch; en zelfs mét `branch-targets` zou het environment de job weigeren |
| Twee CI-workflowbestanden (afwijkende repo), beide groen | twee CD-runs, precies één deploy; de andere "duplicate trigger" |
| Twee CI-workflowbestanden, één rood | geen deploy; één grijze run, één met een waarschuwing |
| `required-workflows` met een naam die niet bestaat | rood: "no push run of …" |
| `repository_dispatch: tms-deploy` met `environment: staging` | deploy naar staging op de head van `develop` |
| `repository_dispatch: tms-deploy` met `environment: production` | rood: het CMS deployt alleen naar staging |
| `repository_dispatch: tms-validate` | overgeslagen |
| Een gate op een `push`-event (verkeerd gemigreerde aanroeper) | rood: "CD starts on workflow_run" |

## Mechaniek

- Maak `v2` aan vanaf `main`. Elke interne `uses: Pursuit-Amsterdam/workflows/...@main` wordt `@v2`. Dat is eerder gedaan: commit `929f3c3` zette alle refs op `@main`. Een v2-workflow die per ongeluk een `@main`-action gebruikt, draait ongemerkt v1-logica.
- **Interne refs zijn volledig.** Een herbruikbare workflow roept zijn actions aan als `…/setup-services@v2`. Lokale `./.github/actions/...`-paden wijzen in een herbruikbare workflow naar de repo van de aanroeper, dus die werken niet. Daarom gebruikt deze repo nu al volledige refs.
- Testrepo's stappen over door de ref op `@v2` te zetten en hun inputs te herschrijven volgens de tabellen in de naslag. Hun PR's worden gewoon gemerged; gaat er iets stuk in `v2`, dan zie je dat eerst in hun CI. Alle andere repo's wachten op de afspraak "v2 is klaar" en doen dan hetzelfde: één PR per repo, in willekeurige volgorde en in eigen tempo. Een repo mag zijn CI overzetten en zijn CD op `@main` laten. Andersom, CD op `@v2` met CI nog op `@main`, werkt alleen als de v1-CI al één bestand met de naam `Continuous Integration` is; anders vult de aanroeper `required-workflows` met de oude namen, en vuurt `workflow_run` op elk van die bestanden.
- <a id="job-ids"></a>**Job-id's en verplichte checks.** CI houdt `pipeline`, dus `run-ci / pipeline` blijft bestaan. De job van elke CD-workflow heet `deploy` (cd-swarm houdt `build` en `deploy`). Verandert een migratie-PR een job-id, bij de aanroeper of in een vereiste CD-check, dan verandert de naam van de check. Dat geldt ook voor CI: tellr-webapp gaat van `frontend-ci` en `backend-ci` naar `run-ci`. Zo'n PR rapporteert alleen de nieuwe naam en blijft op de oude naam "Expected" wachten. Pas de verplichte checks daarom aan vlak vóór de merge van die PR. Andere open PR's rapporteren daarna pas de nieuwe naam als ze bijgewerkt zijn met de base; met verplicht up-to-date gebeurt dat toch al.
- **Rechtstreeks aangeroepen actions** (`setup-node-pnpm`, `run-docker-build-push`, `setup-version`) houden in v2 hun naam en inputs. Die zes repo's kunnen onbeperkt op `@main` blijven of overstappen door alleen de ref te wijzigen.

## Beleid na de overstap

- **Elke PR naar `v2` gaat langs een senior developer.** `@Pursuit-Amsterdam/senior-developers` is code owner van `.github/`, `scripts/` en `check-pr.sh`; een senior mag zijn eigen PR mergen, iedereen anders heeft de review van een senior nodig, en `pipeline` moet groen zijn. Een merge naar `v2` draait in elke repo die hem aanroept.
- **Lokaal nodig:** `pnpm`, `actionlint`, `shellcheck` en `gh` (`brew install actionlint shellcheck gh`); `pnpm lint` en `pnpm test` zijn precies wat CI draait.
- **Wijzigingen na "v2 is klaar":** een PR op `v2`, zoals in elke andere repo. Zo'n wijziging test je eerst door een testrepo de featurebranch te laten aanroepen (`@feature/x`): voor CI in een PR van die testrepo, voor CD via een merge naar zijn `develop` en een handmatige start vanaf `develop` naar staging ([waarom](bouwstenen.md#gate-outcomes)). Verandert er een action, zet dan in die featurebranch de interne refs tijdelijk op `@feature/x`, anders draait de oude action; vóór de merge gaan ze terug naar `@v2`. `check-pr.sh` kan dat afdwingen.
- **Een breaking change wordt `v3`**, op dezelfde manier: een nieuwe branch die eerst alleen de testrepo's gebruiken.
- `main` is end of life: geen wijzigingen meer, ook geen hotfixes.
- **check-pr** kent het patroon: `v[0-9]+` is toegestaan als base. `feature/*` en `hotfix/*` mergen naar `v*`. `check-pr.sh` en `check-pr.yml` veranderen samen, zoals altijd. In v2 leest check-pr head en base uit `github.event.pull_request`: geen inputs meer en geen checkout. Aanroepers laten `head-ref` en `base-ref` weg in dezelfde PR waarin ze naar `@v2` gaan.

---

[← Migratievoorbeelden](migratievoorbeelden.md) · [Overzicht](../README.md) · [Detailbeslissingen →](detailbeslissingen.md)
