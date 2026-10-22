# Synoptik

Súkromná meteorologická webová aplikácia pre Európu. Zadanie a pravidlá: [CLAUDE.md](CLAUDE.md). Technické rozhodnutia: [docs/rozhodnutia.md](docs/rozhodnutia.md).

## Stav

**Fáza 5 – pozorovania – hotová.** Nasadené na **https://cloudy8.pages.dev** (hlavná stránka verejná, prihlásenie vpravo hore). Pôvodná adresa synoptik-ezo.pages.dev je zrušená ([R-015](docs/rozhodnutia.md)).

Hotové:
- Fáza 0: Vite + TS strict + Preact, MapLibre GL JS 6 + OpenFreeMap, noindex, atribúcia, rozhodnutie o dátach ([R-001](docs/rozhodnutia.md))
- Fáza 1: mapové polia ICON-EU z Open-Meteo S3 (teplota 2 m, MSLP, vietor 10 m, nárazy, RH 2 m, zrážky, oblačnosť), WebGL pole, izobary, častice vetra, časová os, legenda, jednotky, stav v URL ([R-004](docs/rozhodnutia.md), [R-005](docs/rozhodnutia.md))
- Fáza 2: klik na mapu → panel **Meteogram / Skew-T / Modely** ([R-006](docs/rozhodnutia.md))
  - Meteogram (uPlot, 10 dní, hodinový krok): teplota a rosný bod, oblačnosť po hladinách, zrážky, vietor + nárazy so smerom, tlak
  - Skew-T log-P (vlastné SVG): T, Td, parcela, suché a vlhké adiabaty, izohygry, vlajky; LCL, LFC, EL, CAPE/CIN, nulová izoterma, zrážateľná voda (`lib/thermo.ts`, testy)
  - Porovnanie 7 modelov pre zvolenú veličinu, pri každom modeli posledný beh
  - Klik do grafu posunie čas mapy; Skew-T sa riadi časom mapy
- Fáza 3 ([R-009](docs/rozhodnutia.md)): hladiny povrch/850/700/500/300/250 hPa (klávesy `[` `]`), teplota, rosný bod, vietor, vlhkosť, geopotenciál v hladinách, relatívna topografia 500/1000; izobary/izohypsy a izotermy; častice vetra v hladine; modely **ECMWF IFS 0,25°** a **GFS 0,25°** (výrez Európy z globálnej mriežky)
- Fáza 4 ([R-012](docs/rozhodnutia.md)): vrstvy CAPE, CIN, Lifted Index, strih vetra 0–6 km a nulová izoterma (podľa dostupnosti v modeli); záložka **Ensemble** (ECMWF ENS, ICON EPS, GEFS, AIFS): členy, medián, 10./90. percentil, pravdepodobnosť prekročenia prahu
- Fáza 5 ([R-014](docs/rozhodnutia.md)): **METAR** (letové kategórie, popup s TAF) a **SYNOP** (staničný model) na mape cez Pages Function `/api/obs` s cache
- **Spodný panel predpovede ako Windy** ([R-013](docs/rozhodnutia.md)): po kliknutí na miesto tabuľky Základné, Vietor (všetky modely), Airgram, Kvalita ovzdušia + Meteogram, Skew-T, Modely, Ensemble; názov miesta z OSM
- **ALADIN 2 km (ČHMÚ)** na mape aj v bodových nástrojoch – detail celého Slovenska vrátane východu; projekcia LCC sa prevzorkuje na lat/lon ([R-011](docs/rozhodnutia.md))
- **História** na časovej osi 7 dní dozadu z minulých behov, predpoveď do konca behu (GFS 16 dní); štítok ukazuje beh každého kroku ([R-010](docs/rozhodnutia.md))
- Nastaviteľná farba a hrúbka hraníc štátov (aj krajov) v menu
- UI podľa Windy, pre desktop aj mobil ([R-008](docs/rozhodnutia.md)): mapa cez celú obrazovku, rýchle vrstvy vpravo, menu s dlaždicami, modely, legenda s prepínaním jednotky, časová os s dňami, bodový panel ako list zdola na mobile
- Verejná stránka, prihlásenie cez Cloudflare Access na `/prihlasenie` ([R-007](docs/rozhodnutia.md))

Otvorené:
- [ ] Ďalšie modely s vysokým rozlíšením: AROME Austria (po 22,1° E, bez hladín); ICON-D2 východ SK nepokrýva ([R-009](docs/rozhodnutia.md))
- [ ] Overiť 60 fps častíc v prehliadači s GPU (aj na iPhone)
- [ ] Spodný panel – doplnky: rez oblačnosťou podľa výšky v meteograme, základňa oblakov, veterná ružica modelov na mape, história v meteograme (`past_days`)
- [ ] GitHub → Cloudflare Pages webhook: push 94e0d2d nespustil build, spustený ručne cez API. Overiť pri ďalších pushoch.

## Lokálne spustenie

Požiadavky: Node.js 24+.

```bash
cd web
npm install
npm run dev        # http://localhost:5173
npm test           # Vitest
npm run build      # typecheck + produkčný build do web/dist
```

## Nasadenie (Cloudflare Pages)

Jednorazové nastavenie v Cloudflare dashboarde:

1. **Workers & Pages → Create → Pages → Connect to Git** → vybrať súkromný repozitár.
2. Nastavenie buildu:
   - Project name: `cloudy8` (→ `cloudy8.pages.dev`; `cloudy` a `synoptik` boli obsadené)
   - Production branch: `main`
   - Framework preset: *None*
   - Build command: `cd web && npm ci && npm run build`
   - Build output directory: `web/dist`
   - Premenná prostredia: `NODE_VERSION` = `24`
3. Ďalej sa nasadzuje automaticky pri každom pushi do `main`. Ostatné vetvy idú na preview `*.cloudy8.pages.dev`.

### Cloudflare Access (prihlásenie vlastníka)

Hlavná stránka je verejná. Access chráni iba cestu `/prihlasenie` a preview deploymenty ([R-007](docs/rozhodnutia.md)).

1. **Zero Trust** (bezplatný plán) → **Access controls → Applications → Add → Self-hosted**, názov „Synoptik“.
2. Ciele: `cloudy8.pages.dev/prihlasenie` a `*.cloudy8.pages.dev`.
3. Policy: *Allow*, Include → *Emails* → e-mail vlastníka. Login metóda: *One-time PIN*.
4. Overenie: hlavná stránka sa otvorí bez prihlásenia. Tlačidlo **Prihlásiť** vpravo hore vedie na prihlásenie Access a potom späť. Po prihlásení je vpravo hore e-mail a **Odhlásiť**.

Nastavenie cez API (token s oprávnením *Access: Apps and Policies – Edit* v premennej `CLOUDFLARE_API_TOKEN`) je zapísané v R-007.

## Pozorovania lokálne

`npm run dev` nespúšťa Pages Functions, takže `/api/obs` lokálne nefunguje. Na test s funkciami:

```bash
cd web && npm run build && cd ..
npx wrangler pages dev web/dist      # http://localhost:8788
```

Zoznam staníc SYNOP sa obnoví skriptom `python pipeline/stations/build_synop_stations.py` (stačí občas).

## Štruktúra

```
web/          frontend (Vite)
  src/map       MapLibre, WebGL vrstvy (pole, častice), riadenie mapy
  src/panels    štítok behu, rýchle vrstvy, menu, spodná lišta (modely, legenda, časová os), bodový panel
  src/charts    meteogram, porovnanie modelov (uPlot), Skew-T (SVG)
  src/data      Open-Meteo S3: behy, načítanie polí, mriežka; Forecast API pre bodové dáta
  src/config    modely, katalóg vrstiev, farebné škály
  src/lib       jednotky, čas, termodynamika
  src/state     stav aplikácie (signals), URL hash
  src/workers   izočiary (Web Worker)
docs/         rozhodnutia
.github/      CI (typecheck, testy, build – iba pri zmene web/)
```

`functions/` a `pipeline/` zatiaľ nie sú potrebné, pozri R-001.
