Voorstel · Pursuit-Amsterdam/workflows · v2 · 16 sep 2026 · geverifieerd en bijgewerkt 15 okt 2026

# Workflows v2

De gedeelde workflows zijn gegroeid door telkens een oplossing toe te voegen als een project iets nieuws nodig had. Consistentie, logica en daarmee onderhoudbaarheid hebben daaronder geleden. Dit document beschrijft het nieuwe ontwerp, gebouwd op acht principes, en de besluiten die erbij horen.

<a id="summary"></a>

## In het kort

Wat de audit van alle workflows en hun 156 aanroepen opleverde:

| Probleem | Gevolg |
| --- | --- |
| `web-ci` declareert `framework` niet, maar 9 aanroepers geven hem mee. | Bij 5 repo's start de CI niet. |
| Python-checks hangen aan een hoofdschakelaar die standaard uit staat. | 3 repo's staan groen zonder één check. |
| Drie soorten schakelaars door elkaar, tegenstrijdige standaardwaarden, ongebruikte inputs. | Aan een aanroep zie je niet wat hij doet. |
| CD draait lint en tests opnieuw, maar controleert gegenereerde code en de draaiende app niet. | Dubbel werk, en een blinde vlek precies waar CD afwijkt. |
| 25 repo's hebben een staging- én een productiejob die alleen in namen verschillen. | Dubbele YAML die uit de pas gaat lopen. |
| Edge functions, function-secrets en het voorbereiden van de server gaan met de hand; het vertalingen-CMS staat op een branch die nooit gemerged is. | Niemand weet wat live staat; secrets kan alleen een org-admin zetten. |
| Commando's per taal staan in de workflow (web-ci, backend-ci, `run-python-checks`), niet in de repo. | Lokaal draai je iets anders dan CI, en elke nieuwe taal vraagt een nieuw pad in de workflow. |
| Branchprotectie, environments en variabelen verschillen per repo. | Gaten die in geen enkele PR zichtbaar zijn. |
| Deploy-secrets staan al per environment, maar geen environment beperkt welke branch erin mag deployen. | Elke branch kan via een handmatige start met de secrets van staging aan de slag; de gate in de YAML houdt dat niet tegen. |

Bewijs en details per bevinding: [auditbevindingen](naslag/auditbevindingen.md#audit) in de naslag.

**Geverifieerd op 15 oktober 2026** tegen `main` (cbd43a1), alle workflowbestanden in de organisatie en de conceptbestanden.

### Status

De [acht principes](principes.md#design) staan, en alle [open punten zijn besloten](beslissingen.md#decided) op 15 oktober 2026. Volgende stap: de [uitrol](uitrol.md), te beginnen met de eigen CI en de bescherming van `v2`.

## Inhoud

Het voorstel bestaat uit twee delen. Het betoog is voor wie beslist; de naslag is voor wie bouwt of migreert.

**Betoog**

1. [Use cases](use-cases.md): wat de workflows moeten kunnen, nu en later.
2. [Het ontwerp in acht principes](principes.md): de regels, en welk probleem elke regel oplost.
3. [Uitrol](uitrol.md): een branch `v2`, en de volgorde van overstappen.
4. [Beslissingen](beslissingen.md): wat besloten is, en waarom.

**Naslag**

- [Voor wie bouwt of migreert](naslag/README.md), met de bestandsindeling in v2
- [Auditbevindingen](naslag/auditbevindingen.md)
- [De CI-workflows](naslag/ci.md): `ci.yml`, `ci-images.yml`
- [De CD-workflows](naslag/cd.md): cd-vercel, cd-supabase, cd-swarm, cd-pages, cd-packages
- [Gedeelde bouwstenen](naslag/bouwstenen.md): cd-gate en de composite actions
- [Standaardinrichting van een repo](naslag/standaardinrichting.md)
- [Migratievoorbeelden](naslag/migratievoorbeelden.md)
- [Uitrol in detail](naslag/uitrol-in-detail.md)
- [Detailbeslissingen](naslag/detailbeslissingen.md)
- [Concept-YAML](naslag/concept-yaml.md)

---

[Use cases →](use-cases.md)
