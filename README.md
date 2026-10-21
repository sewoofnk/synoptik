# Synoptik

Súkromná meteorologická webová aplikácia pre Európu. Zadanie a pravidlá: [CLAUDE.md](CLAUDE.md). Technické rozhodnutia: [docs/rozhodnutia.md](docs/rozhodnutia.md).

## Stav

**Fáza 1 – prvé modelové polia (ICON-EU).** Kód je hotový a lokálne overený. Nasadené na https://synoptik-ezo.pages.dev.

Hotové:
- Fáza 0: Vite + TS strict + Preact, MapLibre GL JS 6 + OpenFreeMap, noindex, atribúcia, rozhodnutie o dátach ([R-001](docs/rozhodnutia.md))
- Mapové polia ICON-EU priamo z Open-Meteo S3: teplota 2 m, MSLP, vietor 10 m, nárazy, RH 2 m, zrážky, oblačnosť (celková/nízka/stredná/vysoká)
- WebGL farebné pole, izobary (Web Worker, d3-contour), častice vetra (GPU)
- Výber behu (posledné 3 dni), časová os s prehrávaním a prednačítaním, legenda, hodnota pod kurzorom
- Jednotky: metrické / letecké / vlastné, okamžite všade
- Stav v URL hash + localStorage, klávesy ←/→, medzerník, M
- Overené: hodnoty pod kurzorom sedia s Open-Meteo API v 3 náhodných bodoch ([R-005](docs/rozhodnutia.md))

Otvorené:
- [x] Nasadenie na `synoptik-ezo.pages.dev` + Cloudflare Access (prihlásenie v hornej lište)
- [ ] Overiť 60 fps častíc v prehliadači s GPU
- [ ] Mobil: panely ako vysúvacie listy zdola (zatiaľ iba zbaliteľný ľavý panel)

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
  src/panels    horná lišta, ľavý panel, legenda, časová os, jednotky
  src/data      Open-Meteo S3: behy, načítanie polí, mriežka
  src/config    modely, katalóg vrstiev, farebné škály
  src/lib       jednotky, čas
  src/state     stav aplikácie (signals), URL hash
  src/workers   izočiary (Web Worker)
docs/         rozhodnutia
.github/      CI (typecheck, testy, build – iba pri zmene web/)
```

`functions/` a `pipeline/` zatiaľ nie sú potrebné, pozri R-001.
