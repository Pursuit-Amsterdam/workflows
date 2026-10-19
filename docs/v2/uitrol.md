<a id="v2"></a>

# Uitrol: een branch `v2`

Een input hernoemen op `main` breekt elke repo die hem meegeeft. Daarom komt v2 op een eigen branch, en stapt elke repo over wanneer het hem uitkomt.

- **`v2`**: het nieuwe ontwerp. Eerst gebruikt alleen een handvol testrepo's hem; zij vangen de breuken op. Zodra hij bewezen werkt, stappen de andere repo's over.
- **`main`**: end of life. Er verandert niets meer; repo's stappen over naar v2.

## Volgorde

1. CI en CD bouwen op `v2`, na een inventarisatie van de repo's die alleen Python zijn.
2. De testrepo's gebruiken `v2` en deployen ermee naar elke environment.
3. v2 is klaar: dat is een afspraak, geen merge.
4. De rest stapt over: één PR per repo, in eigen tempo.

De vijf repo's die nu door `framework` niet starten, kunnen die input zelf uit hun aanroep halen. Dat is één regel in de repo en vraagt niets van `main`. De bron zit wel op `main`: de README noemt `framework` verplicht, en tien voorbeelden geven hem mee. Die tekst corrigeren voordat `main` bevriest, voorkomt nieuwe gevallen.

Voorbeelden per soort repo, de volledige stappen, de mechaniek en het beleid na de overstap staan in de naslag: [migratievoorbeelden](naslag/migratievoorbeelden.md#migration) en [uitrol in detail](naslag/uitrol-in-detail.md#rollout).

---

[← Het ontwerp in acht principes](principes.md) · [Overzicht](README.md) · [Beslissingen →](beslissingen.md)
