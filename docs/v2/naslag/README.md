# Naslag: voor wie bouwt of migreert

De auditbevindingen, alle inputs, bouwstenen, de standaardinrichting van een repo, migratievoorbeelden, de uitrol in detail en de conceptbestanden. Het [betoog](../README.md) wordt hier niet herhaald.


<a id="filemap"></a>

## Bestandsindeling in v2

**`.github/workflows`**

- Nieuw: `ci.yml`, `ci-images.yml`, `cd-gate.yml`, `cd-packages.yml`
- Vervangt: `cd-vercel.yml` ← web-cd · `cd-supabase.yml` ← backend-cd · `cd-swarm.yml` ← vm-cd · `cd-pages.yml` ← storybook-cd
- Gewijzigd: `check-pr.yml` (+ `v*`-regels; leest head en base uit het event)
- Weg op `v2`: web-ci, backend-ci, fullstack-ci, web-cd, backend-cd, vm-cd, storybook-cd, codegen
- Eigen onderhoud: `ci.yml` van deze repo zelf (actionlint, shellcheck, check-pr.sh, voorbeeldrepo) en `audit-consumers.yml`

**`.github/actions`**

- Nieuw: `setup-services` (postgres · supabase · redis · 1password) · `setup-supabase` ← het service-deel van run-supabase-test · `run-translations` ← de losse stappen uit feature/tms-prototype · `run-image-smoke` ← start/poll/smoke uit gp-map, gedeeld door ci-images en cd-swarm · `run-codegen` (codegen, typecheck en vergelijking met de gecommitte spec; vervangt de oude action met dezelfde naam)
- Weg op `v2`: run-supabase-test (het testdeel wordt een script in de repo), run-python-checks, run-pnpm-build-test (checks zijn scripts in de repo), deploy-supabase
- Blijven, met kleine uitbreidingen: `setup-node-pnpm` · `setup-python` · `setup-onepassword` · `setup-version` · `run-docker-build-push` · `deploy-vercel` · `deploy-swarm`

## Inhoud

- [Auditbevindingen](auditbevindingen.md)
- [De CI-workflows](ci.md)
- [De CD-workflows](cd.md)
- [Gedeelde bouwstenen](bouwstenen.md)
- [Standaardinrichting van een repo](standaardinrichting.md)
- [Migratievoorbeelden](migratievoorbeelden.md)
- [Uitrol in detail](uitrol-in-detail.md)
- [Detailbeslissingen](detailbeslissingen.md)
- [Concept-YAML](concept-yaml.md)

---

[← Beslissingen](../beslissingen.md) · [Overzicht](../README.md) · [Auditbevindingen →](auditbevindingen.md)
