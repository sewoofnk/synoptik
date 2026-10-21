# Synoptik

Súkromná meteorologická webová aplikácia pre Európu. Zadanie a pravidlá: [CLAUDE.md](CLAUDE.md). Technické rozhodnutia: [docs/rozhodnutia.md](docs/rozhodnutia.md).

## Stav

**Fáza 2 – bodové nástroje – hotová.** Nasadené na https://synoptik-ezo.pages.dev (hlavná stránka verejná, prihlásenie vpravo hore).

Hotové:
- Fáza 0: Vite + TS strict + Preact, MapLibre GL JS 6 + OpenFreeMap, noindex, atribúcia, rozhodnutie o dátach ([R-001](docs/rozhodnutia.md))
- Fáza 1: mapové polia ICON-EU z Open-Meteo S3 (teplota 2 m, MSLP, vietor 10 m, nárazy, RH 2 m, zrážky, oblačnosť), WebGL pole, izobary, častice vetra, časová os, legenda, jednotky, stav v URL ([R-004](docs/rozhodnutia.md), [R-005](docs/rozhodnutia.md))
- Fáza 2: klik na mapu → panel **Meteogram / Skew-T / Modely** ([R-006](docs/rozhodnutia.md))
  - Meteogram (uPlot, 10 dní, hodinový krok): teplota a rosný bod, oblačnosť po hladinách, zrážky, vietor + nárazy so smerom, tlak
  - Skew-T log-P (vlastné SVG): T, Td, parcela, suché a vlhké adiabaty, izohygry, vlajky; LCL, LFC, EL, CAPE/CIN, nulová izoterma, zrážateľná voda (`lib/thermo.ts`, testy)
  - Porovnanie 7 modelov pre zvolenú veličinu, pri každom modeli posledný beh
  - Klik do grafu posunie čas mapy; Skew-T sa riadi časom mapy
- UI podľa Windy, pre desktop aj mobil ([R-008](docs/rozhodnutia.md)): mapa cez celú obrazovku, rýchle vrstvy vpravo, menu s dlaždicami, modely, legenda s prepínaním jednotky, časová os s dňami, bodový panel ako list zdola na mobile
- Verejná stránka, prihlásenie cez Cloudflare Access na `/prihlasenie` ([R-007](docs/rozhodnutia.md))

Otvorené:
- [ ] Overiť 60 fps častíc v prehliadači s GPU (aj na iPhone)
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
   - Project name: `synoptik` (→ `synoptik-ezo.pages.dev`, názov bez prípony bol obsadený)
   - Production branch: `main`
   - Framework preset: *None*
   - Build command: `cd web && npm ci && npm run build`
   - Build output directory: `web/dist`
   - Premenná prostredia: `NODE_VERSION` = `24`
3. Ďalej sa nasadzuje automaticky pri každom pushi do `main`. Ostatné vetvy idú na preview `*.synoptik-ezo.pages.dev`.

### Cloudflare Access (prihlásenie vlastníka)

Hlavná stránka je verejná. Access chráni iba cestu `/prihlasenie` a preview deploymenty ([R-007](docs/rozhodnutia.md)).

1. **Zero Trust** (bezplatný plán) → **Access controls → Applications → Add → Self-hosted**, názov „Synoptik“.
2. Ciele: `synoptik-ezo.pages.dev/prihlasenie` a `*.synoptik-ezo.pages.dev`.
3. Policy: *Allow*, Include → *Emails* → e-mail vlastníka. Login metóda: *One-time PIN*.
4. Overenie: hlavná stránka sa otvorí bez prihlásenia. Tlačidlo **Prihlásiť** vpravo hore vedie na prihlásenie Access a potom späť. Po prihlásení je vpravo hore e-mail a **Odhlásiť**.

Nastavenie cez API (token s oprávnením *Access: Apps and Policies – Edit* v premennej `CLOUDFLARE_API_TOKEN`) je zapísané v R-007.

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
