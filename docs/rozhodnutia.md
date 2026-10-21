# Záznam technických rozhodnutí

Formát: dátum – rozhodnutie – dôvod – ako sa overilo. Najnovšie hore.

---

## R-003 · 2026-10-21 · MapLibre GL JS 6.x namiesto 5.x

**Rozhodnutie:** používame `maplibre-gl@6.15.0` (zadanie uvádzalo verziu 5).

**Dôvod:**
- Všetky verzie ≤ 6.4.0 majú kritickú zraniteľnosť **GHSA-jrc7-96c5-q579** (XSS v `DOM.sanitize()`, CVSS 10.0). Týka sa atribúcie, ktorú preberáme z cudzieho štýlu (OpenFreeMap). Pre vetvu 5.x oprava neexistuje, opravená je až 6.4.1.
- Zadanie chcelo verziu 5 kvôli glóbusu. Glóbus je aj vo verzii 6, takže dôvod ostáva splnený.

**Dôsledky pre kód:**
- v6 nemá default export, používať pomenované importy (`import { Map } from "maplibre-gl"`).
- Worker je samostatný ES modul. Vite ho musí vydať ako asset: `import workerUrl from "maplibre-gl/dist/maplibre-gl-worker.mjs?url"` + `setWorkerUrl(workerUrl)`. Bez toho sa mapa nevykreslí (chyba „Worker failed to load“).

**Overenie:** `npm audit` → 0 zraniteľností; v headless Chrome sa vykreslila mapa Európy (štýl positron).

---

## R-002 · 2026-10-21 · Bodové dáta: Open-Meteo Forecast API

Zostáva podľa zadania. Porovnanie hodnoty `temperature_2m` (ICON-EU) z mapového súboru a z API v troch bodoch:

| Bod | S3 `data_spatial` (beh 00Z, 12 UTC) | API `models=icon_eu` (najnovší beh) |
|---|---|---|
| Bratislava 48,125 / 17,125 | 21,3 °C | 21,5 °C |
| Paríž 48,875 / 2,3125 | 14,25 °C | 13,5 °C |
| Madrid 40,4375 / −3,6875 | 17,15 °C | 17,1 °C |

Rozdiely zodpovedajú rôznym behom (S3 00Z, API už novší beh). Pri overovaní vo Fáze 1 treba porovnávať **ten istý beh**.
Presné názvy modelov a premenných v API (`models=`, tlakové hladiny, Ensemble API) a limity požiadaviek sa overia na začiatku Fázy 2.

---

## R-001 · 2026-10-21 · Mapové polia: cesta A (Open-Meteo S3 priamo v prehliadači)

**Rozhodnutie:** mapové polia čítame **priamo z prehliadača** z verejného bucketu Open-Meteo (`s3://openmeteo`, us-west-2) knižnicou `@openmeteo/file-reader` (WASM). Vlastný pipeline (cesta B) **sa zatiaľ nerobí**. Necháva sa ako záloha alebo doplnok pre veci, ktoré Open-Meteo nemá (napr. tropopauza, prípadne vlastné odvodené polia).

### Čo sa overilo (malým testom, nie iba z dokumentácie)

**Štruktúra dát** ([open-meteo/open-data](https://github.com/open-meteo/open-data)):
- `data_spatial/<model>/latest.json`: posledný dokončený beh (`reference_time`, `valid_times[]`, `variables[]`, `completed`).
- `data_spatial/<model>/<YYYY>/<MM>/<DD>/<hhmm>Z/<YYYY-MM-DDThhmm>.om`: jeden súbor = jeden časový krok, **všetky premenné** (pre ICON-EU ~33,5 MB). Polia majú tvar `[ny, nx]` a sú rozdelené na chunky 32×32.
- Ďalej `in-progress.json` (rozpracovaný beh) a `latest_model-level.json` (oneskorené premenné).
- Uchovávanie: **7 dní**.

**CORS:** `Access-Control-Allow-Origin: *`, metódy GET/HEAD, hlavička `Range` je povolená v preflight. Overené cez curl aj v reálnom prehliadači (aplikácia načíta `latest.json` z S3).

**Knižnica:** `@openmeteo/file-reader@0.0.20` (TypeScript + WASM, oficiálna od Open-Meteo). `OmHttpBackend` + `asCachedReader(LruBlockCache)` + `getChildByName("temperature_2m")` + `read()`.
- Bez blokového cache robí vyhľadanie premennej podľa mena ~116 sekvenčných mini-requestov (desiatky sekúnd). **S blokovým cache (64 kB) je to v poriadku.** Cache je povinná.

**Výkon** (Node, z domácej siete na Slovensku → us-west-2, jedno pole celej Európy 1377×657):

| Pole | Čas | Requesty | Prenos |
|---|---|---|---|
| temperature_2m (studený štart) | 2,5 s | 10 | 576 kB |
| temperature_2m (ďalší krok) | 1,1 s | 10 | 576 kB |
| pressure_msl | 0,55 s | 6 | 320 kB |
| wind_u_component_10m | 1,5 s | 8 | 448 kB |
| wind_v_component_10m | 1,1 s | 8 | 448 kB |

Prepnutie kroku < 300 ms sa dosiahne prednačítaním susedných krokov (pamäť ~3,6 MB na pole a krok ako Float32).

**Dostupné modely v `data_spatial` (stav 2026-10-21):**

| Priečinok | Krokov v poslednom behu | Premenných |
|---|---|---|
| `dwd_icon_eu` | 93 pri 00/12Z (+120 h), 31 pri medzibehoch | 121 |
| `dwd_icon_d2` | 49 | 93 |
| `ecmwf_ifs025` | 49 (06Z beh) | 120 |
| `ecmwf_ifs` | 109 | 35 |
| `ncep_gfs025` | 209 | 316 |
| `meteofrance_arome_france_hd` | 52 | 16 |

GFS a ECMWF sú globálne mriežky. Kvôli chunkom 32×32 sa dá čítať iba výrez Európy.

**ICON-EU premenné** pokrývajú takmer celý katalóg vrstiev zo zadania: `pressure_msl`, `temperature_2m`, `relative_humidity_2m`, `wind_u/v_component_10m`, `wind_gusts_10m`, `cloud_cover(_low/_mid/_high)`, `precipitation`, `rain`, `showers`, `snowfall_water_equivalent`, `snow_depth`, `cape`, `convective_inhibition`, `freezing_level_height`, tlakové hladiny 1000–50 hPa (`temperature_*`, `geopotential_height_*`, `relative_humidity_*`, `wind_u/v_component_*`).
- **Chýba:** rosný bod 2 m (dopočítame z T a RH), Lifted Index, strih 0–6 km (dopočítame z hladín), tropopauza.

**Časový krok ICON-EU:** hodinovo do +78 h, potom po 3 h do +120 h (natívne vlastnosti modelu). Požiadavka Fázy 1 „5 dní s hodinovým krokom“ sa preto splní tak, že po +78 h bude krok 3 h. Časová os musí zvládať nepravidelné kroky.

### Licencie
- Dáta Open-Meteo: **CC BY 4.0** (atribúcia v pätičke). Zdrojové modely: DWD, ECMWF, NOAA.
- `@openmeteo/file-reader` aj `@openmeteo/file-format-wasm`: **GPL-2.0**. Pre súkromnú aplikáciu s jedným používateľom je to v poriadku (bezplatné, bez obmedzení použitia). **Pozor:** ak by sa aplikácia niekedy distribuovala verejne, náš kód musí byť kompatibilný s GPL-2.0.
- `@openmeteo/weather-map-layer` (hotová MapLibre vrstva od Open-Meteo, tiež GPL-2.0) sa **nepoužije**. Je označená ako „not production-ready“ a zadanie chce vlastné WebGL vrstvy. Môže slúžiť ako referencia.

### Dôsledky pre architektúru
- `/data/*` Pages Function a R2 bucket **zatiaľ netreba**. Odpadá aj spotreba GitHub Actions minút a R2 úložiska.
- Dáta z S3 nie sú za Cloudflare Access. To nevadí, sú verejné. Za Access je iba aplikácia.
- Riziko: závislosť od tretej strany (dostupnosť S3, zmena formátu, verzia knižnice 0.0.x). Zmiernenie: verziu knižnice pripnúť, čítanie zapuzdriť do jedného modulu (`web/src/data/`), aby sa dal neskôr prepnúť na cestu B bez zmeny vrstiev.
- Konverzia jednotiek: Open-Meteo už ukladá °C, hPa, mm. Pri čítaní prevedieme na SI, ako chce zadanie (sekcia 7).
