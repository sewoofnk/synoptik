# Synoptik

Súkromná meteorologická webová aplikácia pre Európu. Zadanie a pravidlá: [CLAUDE.md](CLAUDE.md). Technické rozhodnutia: [docs/rozhodnutia.md](docs/rozhodnutia.md).

## Stav

**Fáza 0 – základ a overenie.** Kód je hotový, nasadenie čaká na nastavenie Cloudflare.

- [x] Vite + TypeScript (strict) + Preact, MapLibre GL JS 6 s OpenFreeMap (svetlá/tmavá téma podľa systému)
- [x] Horná lišta zobrazuje posledný beh ICON-EU načítaný priamo z Open-Meteo S3
- [x] Pätička: upozornenie (nie je letecký zdroj) a atribúcia
- [x] `noindex` (meta + `X-Robots-Tag`) a `robots.txt`
- [x] Rozhodnutie o dátovej ceste: **A – Open-Meteo S3 v prehliadači** ([R-001](docs/rozhodnutia.md))
- [ ] Nasadenie na `synoptik.pages.dev`
- [ ] Cloudflare Access

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
   - Project name: `synoptik` (→ `synoptik.pages.dev`)
   - Production branch: `main`
   - Framework preset: *None*
   - Build command: `cd web && npm ci && npm run build`
   - Build output directory: `web/dist`
   - Premenná prostredia: `NODE_VERSION` = `24`
3. Ďalej sa nasadzuje automaticky pri každom pushi do `main`. Ostatné vetvy idú na preview `*.synoptik.pages.dev`.

### Cloudflare Access (iba vlastník)

1. **Zero Trust** (bezplatný plán do 50 používateľov) → **Access → Applications → Add → Self-hosted**.
2. Domény aplikácie: `synoptik.pages.dev` **a** `*.synoptik.pages.dev` (preview).
3. Policy: *Allow*, Include → *Emails* → e-mail vlastníka.
4. Login metóda: *One-time PIN* (bez ďalšej konfigurácie).
5. Overenie: otvoriť `https://synoptik.pages.dev` v anonymnom okne. Musí sa zobraziť prihlasovacia stránka Access.

## Štruktúra

```
web/          frontend (Vite)
  src/map       MapLibre, neskôr WebGL vrstvy
  src/panels    horná lišta, pätička, neskôr panely a časová os
  src/data      prístup k Open-Meteo S3
  src/config    modely (neskôr vrstvy, farebné škály)
  src/lib       čas (neskôr jednotky, termodynamika)
docs/         rozhodnutia
.github/      CI (typecheck, testy, build – iba pri zmene web/)
```

`functions/` a `pipeline/` zatiaľ nie sú potrebné, pozri R-001.
