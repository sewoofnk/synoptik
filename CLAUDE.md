# Synoptik – zadanie projektu

Profesionálna meteorologická webová aplikácia pre Európu, inšpirovaná funkciami Windy.com (vrátane Premium). Používa ju iba jeden používateľ (vlastník). Tento súbor je hlavné zadanie a pravidlá práce pre Claude Code.

- **Adresa:** `https://cloudy8.pages.dev` (projekt Cloudflare Pages `cloudy8`; `cloudy` aj `synoptik` boli obsadené, staršie adresy zrušené – R-015)
- **Hosting:** Cloudflare Pages + Pages Functions + R2 + Workers
- **Repozitár:** GitHub, **súkromný**
- **Rozpočet:** 0 €. Všetko musí bežať v bezplatných limitoch. Žiadne platené API ani služby.

---

## 1. Ciele a priority

1. **Meteorologická časť (priorita):** nástroj pre meteorológov – modelové polia na zemi aj v tlakových hladinách, porovnanie modelov, sondáže Skew-T, meteogramy, ensemble, pozorovania.
2. **Letecká časť (neskôr):** pre pilotov UL, všeobecného aj dopravného letectva – METAR/TAF/SIGMET, letové hladiny, námraza, turbulencia, plánovač trasy s vertikálnym rezom.
3. **Bežné sledovanie počasia (najneskôr):** zjednodušený režim pre bežné použitie.

Oblasť: **celá Európa**.

### Pevné požiadavky
- Pri každej vrstve musí byť viditeľný **model, beh (init time) a čas platnosti**. Profesionál musí vždy vedieť, z čoho dáta pochádzajú a aké sú staré.
- **Prepínanie jednotiek** jednoducho a kdekoľvek (pozri sekciu 7).
- V pätičke nenápadné upozornenie: aplikácia nie je certifikovaný zdroj leteckých informácií; na let používať oficiálny brífing.
- Atribúcia zdrojov dát (DWD, ECMWF, NOAA, Open-Meteo, OpenStreetMap/OpenFreeMap) podľa ich licencií.

---

## 2. Technológie

| Oblasť | Voľba |
|---|---|
| Build | Vite + TypeScript (strict) |
| UI | Preact (malé, rýchle) + CSS moduly alebo čisté CSS s premennými |
| Mapa | MapLibre GL JS (verzia 5, kvôli glóbusu neskôr) |
| Podkladová mapa | OpenFreeMap (vektorové dlaždice zadarmo, bez kľúča). Záloha: Protomaps PMTiles výrez Európy v R2 |
| Dátové vrstvy | Vlastné WebGL custom layers v MapLibre |
| Častice vetra | Technika podľa `mapbox/webgl-wind` (MIT): u/v v textúre, pozície častíc v textúre, simulácia na GPU |
| Izočiary | Výpočet v Web Workeri (marching squares, napr. `d3-contour`), vykreslenie ako GeoJSON čiary s popiskami |
| Grafy (meteogram, ensemble) | uPlot |
| Skew-T | Vlastný canvas/SVG komponent (d3-scale) |
| Testy | Vitest (jednotky, dekódovanie dát, výpočty); Playwright smoke test voliteľne |
| Pipeline | Python 3.12 (xarray, cfgrib/eccodes, numpy, Pillow) v GitHub Actions |

Nepoužívať ťažké frameworky ani knižnice s platenou licenciou (napr. weatherlayers-gl má komerčnú licenciu – nepoužiť).

---

## 3. Architektúra

```
┌────────────────────────── GitHub (súkromný repo) ──────────────────────────┐
│  /web        frontend (Vite)          → Cloudflare Pages (auto deploy)     │
│  /functions  Pages Functions (API, proxy, R2)                              │
│  /pipeline   Python spracovanie GRIB  → GitHub Actions cron → R2           │
└────────────────────────────────────────────────────────────────────────────┘

Prehliadač ──► cloudy8.pages.dev (verejná; Access iba na /prihlasenie, pozri R-007)
                 ├─ statický frontend
                 ├─ /data/*   → Pages Function → R2 bucket (mapové polia)
                 ├─ /api/obs  → Pages Function → aviationweather.gov, OGIMET (proxy + cache)
                 └─ priamo z prehliadača → Open-Meteo API (bodové dáta)
```

### 3.1 Bodové dáta – Open-Meteo (bez vlastného spracovania)
Zadarmo na nekomerčné použitie, bez kľúča. Použiť pre:
- meteogram (všetky modely, hodinový krok)
- porovnanie modelov (parameter `models=`)
- Skew-T (premenné v tlakových hladinách 1000–100 hPa: teplota, rosný bod/vlhkosť, vietor, geopotenciál)
- ensemble (Ensemble API)

**OVERIŤ v dokumentácii:** presné názvy modelov (ICON-EU, ICON-D2, ECMWF IFS 9 km / 0,25°, GFS, AROME, ...), ich dostupné premenné a limity požiadaviek. Cachovať odpovede v prehliadači (napr. 15 min) a nenaťahovať zbytočne.

### 3.2 Mapové polia – dva spôsoby (rozhodne Fáza 0)

**A) Open-Meteo dáta na AWS S3 (preferované, ak sa dá):**
Open-Meteo publikuje celý dataset na verejnom S3 vrátane formátu určeného pre mapy. **OVERIŤ:** či existuje oficiálna JS/WASM knižnica na čítanie ich formátu priamo v prehliadači, či S3 povoľuje CORS a ako rýchlo sa dá načítať výrez Európy. Ak áno, odpadá väčšina vlastného pipeline.

**B) Vlastný pipeline (záloha a doplnok):**
GitHub Actions cron stiahne GRIB2, Python ich prevedie a nahrá do R2.

- **ICON-EU** z DWD opendata (`opendata.dwd.de/weather/nwp/icon-eu/grib/`) – pravidelná mriežka 0,0625°, celá Európa. Hlavný model.
- **GFS 0,25°** z NOAA NOMADS cez GRIB filter s výrezom Európy (stiahne sa len potrebná oblasť a premenné).
- **ECMWF open data** (0,25°) z ECMWF.
- Neskôr ICON-D2 a AROME pre vysoké rozlíšenie (pokrývajú iba časť Európy).

**Rozpočet minút GitHub Actions: 2000 min/mesiac (súkromný repo).** Preto:
- spracúvať iba behy 00 a 12 UTC (neskôr pridať 06/18, ak sa zmestíme)
- sťahovať iba potrebné premenné a hladiny
- paralelizovať sťahovanie, spracovanie robiť vektorovo (numpy)
- logovať trvanie každého behu; cieľ < 10 min na model a beh
- ak limit nestačí, pripraviť rovnaký pipeline na spustenie na Oracle Cloud Always Free (bez úprav kódu, iba iný cron)

### 3.3 Formát mapových dát v R2

Každé pole a časový krok = jeden súbor, ľahko načítateľný ako WebGL textúra:

- **Skalárne pole:** PNG, hodnota kvantovaná na 16 bitov uložená v kanáloch R+G (B, A nepoužité alebo maska).
- **Vietor:** PNG, `u` v R+G, `v` v B+A (každá 16 bitov).
- Ku každému súboru metadáta: `min`, `max` (alebo `scale`, `offset`), rozmery mriežky, bbox, jednotka.
- Mriežka: pravidelná lat/lon. Europe bbox podľa modelu (ICON-EU natívne cca 23,5° Z – 62,5° V, 29,5° – 70,5° S).

Štruktúra:
```
/{model}/{run}/manifest.json        # zoznam polí, krokov, metadáta
/{model}/{run}/{field}/{level}/{step}.png
/latest.json                        # posledný dokončený beh pre každý model
```
- `latest.json` sa prepíše **až po úspešnom nahraní celého behu** (žiadne polovičné behy).
- Uchovávať posledné 2–3 behy; staršie mazať (R2 lifecycle pravidlo alebo krok v pipeline).
- Limit R2 free: 10 GB úložiska. Sledovať veľkosť.

### 3.4 Bezpečnosť a súkromie
- **Cloudflare Access:** hlavná stránka je verejná (rozhodnutie vlastníka, `docs/rozhodnutia.md` R-007). Access chráni cestu `/prihlasenie` (tlačidlo Prihlásiť v hornej lište vpravo) a celé preview deploymenty (`*.cloudy8.pages.dev`). Povolený iba e-mail vlastníka. Nové Pages Functions, ktoré míňajú limity alebo čítajú súkromné dáta, pridať do Access.
- R2 bucket **nie je verejný**. Dáta sa čítajú cez Pages Function s R2 bindingom, takže sú tiež za Access.
- Kľúče (R2 access key pre pipeline) iba v GitHub Secrets. Nikdy v kóde ani v commitoch.
- `<meta name="robots" content="noindex, nofollow">` a `robots.txt` so zákazom.

---

## 4. Rozhranie

Rozloženie (desktop):
- **Mapa** cez celú plochu.
- **Horná lišta:** výber modelu, behu (init time) a výšky/hladiny; vpravo prepínač jednotiek a nastavenia.
- **Ľavý panel:** vrstvy zoskupené podľa kategórií (Prízemné, Tlakové hladiny, Konvekcia, Oblačnosť a zrážky, Pozorovania). Možnosť kombinovať: farebné pole + izočiary + častice vetra + pozorovania.
- **Spodná lišta:** časová os s hodinovým krokom, play/pauza, rýchlosť, zobrazenie dňa a UTC + lokálneho času.
- **Pravý panel (po kliknutí na bod):** záložky Meteogram / Skew-T / Porovnanie modelov / Ensemble.
- **Legenda** farebnej škály vždy viditeľná, v aktuálnych jednotkách.
- **Popisok pod kurzorom:** hodnota poľa v bode + súradnice.
- **Klávesové skratky:** šípky = čas, medzerník = play, `[` `]` = hladina, `M` = model.

Mobil: panely ako vysúvacie listy zdola, mapa ostáva hlavná.

Vizuálny štýl: profesionálny, čitateľný, tmavá aj svetlá téma. Farebné škály podľa meteorologických konvencií (napr. teplota s jasným rozlíšením okolo 0 °C, zrážky podľa zaužívaných škál). Škály definovať v jednom súbore, aby sa dali ladiť.

Stav (model, vrstva, čas, poloha mapy) ukladať do URL hash a do localStorage, aby sa dalo vrátiť na rovnaký pohľad.

---

## 5. Katalóg vrstiev (meteorologická časť)

| Kategória | Vrstva | Hladiny | Zobrazenie |
|---|---|---|---|
| Prízemné | Tlak MSLP | – | izobary (každé 4 hPa, zvýraznené 1000/1020) + voliteľne farba |
| Prízemné | Teplota 2 m | – | farba |
| Prízemné | Rosný bod 2 m | – | farba |
| Prízemné | Vietor 10 m + nárazy | – | častice + farba rýchlosti |
| Prízemné | Relatívna vlhkosť 2 m | – | farba |
| Oblačnosť a zrážky | Celková / nízka / stredná / vysoká oblačnosť | – | farba |
| Oblačnosť a zrážky | Zrážky (1h, 3h, akumulované) | – | farba |
| Oblačnosť a zrážky | Sneh, výška snehu | – | farba |
| Tlakové hladiny | Geopotenciál | 850, 700, 500, 300 hPa | izohypsy + voliteľne farba |
| Tlakové hladiny | Teplota | 850, 700, 500, 300 hPa | farba + izotermy |
| Tlakové hladiny | Vietor | 850, 700, 500, 300, 250 hPa | častice + farba |
| Tlakové hladiny | Relatívna vlhkosť | 850, 700, 500 hPa | farba |
| Tlakové hladiny | Relatívna topografia 500/1000 | – | farba + izočiary |
| Konvekcia | CAPE, CIN | – | farba |
| Konvekcia | Lifted Index | – | farba |
| Konvekcia | Strih vetra 0–6 km | – | farba |
| Ostatné | Nulová izoterma | – | farba |
| Ostatné | Tropopauza (výška) | – | farba |

Ktoré premenné ktorý model ponúka, zapísať do jedného konfiguračného súboru (`layers.config.ts`), z ktorého sa generuje UI aj zoznam pre pipeline.

---

## 6. Bodové nástroje

- **Meteogram:** teplota, rosný bod, tlak, vietor (šípky/vlajky), nárazy, zrážky, oblačnosť po hladinách. Hodinový krok, 10 dní.
- **Skew-T log-P:** teplota, rosný bod, vietor (vlajky vpravo), suché a vlhké adiabaty, izohygry. Výpočet LCL, LFC, EL, CAPE/CIN, výšky nulovej izotermy, zrážkovej vody. Výpočty pokryť unit testami.
- **Porovnanie modelov:** jedna veličina, viac modelov v jednom grafe.
- **Ensemble:** členy ako tenké čiary + medián a percentily (10/90), pravdepodobnosť prekročenia prahu.

---

## 7. Jednotky

Jeden prepínač s predvoľbami:
- **Metrické:** °C, km/h (alebo m/s), m, hPa, mm
- **Letecké:** °C, kt, ft / FL, hPa, mm
- **Vlastné:** zvlášť pre teplotu (°C/°F/K), vietor (m/s, km/h, kt, mph, Bft), výšku (m/ft), tlak (hPa/inHg/mmHg), zrážky (mm/in), vzdialenosť (km/NM/mi)

Pravidlá:
- Interne všetko v SI jednotkách. Konverzia iba pri zobrazení (legenda, popisky, grafy).
- Jeden modul `units.ts` s funkciami a testami.
- Nastavenie uložené v localStorage, zmena sa okamžite prejaví všade bez reloadu.

---

## 8. Pozorovania

- **METAR/TAF:** aviationweather.gov Data API (JSON, bbox Európy). Volať cez Pages Function (CORS + cache 5–10 min). Na mape staničné symboly (vietor, teplota, oblačnosť, jav), farba podľa letových kategórií (VFR/MVFR/IFR/LIFR).
- **SYNOP:** OGIMET (neoficiálny zdroj; parsovať opatrne, cache, ohľaduplná frekvencia volaní). Klasický staničný model.
- Neskôr: aerologické sondáže (University of Wyoming) na porovnanie s modelom v Skew-T.

---

## 9. Fázy práce

Každá fáza končí funkčným nasadením na `cloudy8.pages.dev`. Po každej fáze aktualizovať `README.md` (stav, ako spustiť lokálne, ako nasadiť).

### Fáza 0 – Základ a overenie (spike)
- Vite + TS + Preact projekt, MapLibre s OpenFreeMap, nasadenie na Pages, Cloudflare Access.
- **Overiť** možnosť A (Open-Meteo S3 v prehliadači). Výsledok zapísať do `docs/rozhodnutia.md` a podľa toho zvoliť cestu.
- **Hotovo keď:** stránka beží za Access, mapa Európy sa zobrazí, rozhodnutie o dátovej ceste je zapísané.

### Fáza 1 – Prvé modelové polia
- Pipeline (alebo napojenie A) pre ICON-EU: MSLP, teplota 2 m, vietor 10 m, zrážky, oblačnosť.
- WebGL vrstva farebného poľa, izobary, častice vetra.
- Časová os, výber behu, legenda, popisok hodnoty.
- Prepínač jednotiek.
- **Hotovo keď:** dá sa prehrať predpoveď ICON-EU na 5 dní s hodinovým krokom, hodnoty pod kurzorom sedia s Open-Meteo pre ten istý bod (overiť náhodne 3 body).

### Fáza 2 – Bodové nástroje
- Pravý panel: meteogram, porovnanie modelov, Skew-T (z Open-Meteo).
- **Hotovo keď:** klik na mapu otvorí všetky tri záložky, Skew-T výpočty prechádzajú testami.

### Fáza 3 – Tlakové hladiny a ďalšie modely
- 850/700/500/300 hPa polia, izohypsy, relatívna topografia.
- GFS a ECMWF do výberu modelu.
- **Hotovo keď:** prepínanie modelov a hladín funguje a pri každej vrstve je viditeľný model + beh.

### Fáza 4 – Konvekcia a ensemble
- CAPE, CIN, LI, strih vetra, nulová izoterma.
- Ensemble záložka.

### Fáza 5 – Pozorovania
- METAR/TAF a SYNOP na mape.

### Fáza 6+ – Neskôr (podrobnosti sa doplnia)
- Radar (RainViewer bezplatné API je obmedzené: zoom max 7, posledné 2 h, bez nowcastu; doplniť národnými radarmi – DWD, SHMÚ, ČHMÚ; preveriť EUMETNET OPERA), vlastná archivácia pre 12 h slučky.
- Satelit (EUMETSAT, NASA GIBS – aj archív).
- Blesky (Blitzortung).
- Letecká časť (WAFS námraza/turbulencia/CB, SIGMET, letové hladiny, plánovač trasy s vertikálnym rezom).
- ICON-D2, AROME (vysoké rozlíšenie).
- Glóbus, PWA, upozornenia (Workers cron).
- Zjednodušený režim pre bežné sledovanie počasia.

---

## 10. Štruktúra repozitára

```
/web
  /src
    /map          MapLibre, WebGL vrstvy (field, wind particles, contours)
    /panels       ľavý panel, pravý panel, časová os
    /charts       meteogram, skewt, ensemble
    /data         načítanie z R2/Open-Meteo, cache, dekódovanie PNG
    /config       layers.config.ts, colorscales.ts, models.ts
    /lib          units.ts, meteo výpočty (thermo), čas
    /workers      contour worker
  index.html
/functions
  /data/[[path]].ts   R2 proxy
  /api/obs.ts         METAR/TAF/SYNOP proxy s cache
/pipeline
  /models         icon_eu.py, gfs.py, ecmwf.py
  encode.py       kvantovanie do PNG
  upload.py       nahratie do R2, prepis latest.json
  requirements.txt
/.github/workflows
  pipeline.yml    cron 00/12 UTC behy (s oneskorením podľa dostupnosti modelu)
  ci.yml          lint + testy
/docs
  rozhodnutia.md  záznam technických rozhodnutí
README.md
CLAUDE.md
```

---

## 11. Pravidlá práce pre Claude

- Pracuj **po fázach**. Pred začatím fázy krátko zhrň plán; po dokončení zhrň, čo je hotové a čo sa overilo.
- Veci označené **OVERIŤ** najprv over (dokumentácia, malý test). Výsledok zapíš do `docs/rozhodnutia.md`. Nepredpokladaj API, ktoré si neoveril.
- Ak sa niečo nedá urobiť zadarmo alebo v limitoch, zastav sa a navrhni alternatívu. Nič platené nepridávaj.
- Vždy sleduj bezplatné limity: GitHub Actions minúty, R2 úložisko a operácie, Workers požiadavky.
- Malé, zrozumiteľné commity. Žiadne tajomstvá v repozitári.
- Výkon: mapa musí byť plynulá (60 fps pri časticiach), prepnutie časového kroku < 300 ms pri cachovaných dátach. Prednačítavať susedné kroky.
- Komentáre a dokumentácia po slovensky, kód (názvy premenných, funkcií) po anglicky.
- Meteorologické výpočty (termodynamika, konverzie, interpolácia) pokryť testami so známymi referenčnými hodnotami.
