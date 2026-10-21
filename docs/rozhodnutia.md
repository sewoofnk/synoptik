# Záznam technických rozhodnutí

Formát: dátum – rozhodnutie – dôvod – ako sa overilo. Najnovšie hore.

---

## R-012 · 2026-10-21 · Fáza 4: konvekcia a ensemble

**Konvekčné vrstvy – dostupnosť** (overené v `data_spatial` a Forecast API):

| Vrstva | ICON-EU | ECMWF IFS | GFS | ALADIN |
|---|---|---|---|---|
| CAPE | ✓ | ✓ | ✓ | ✓ |
| CIN (`convective_inhibition`, kladná veľkosť J/kg) | ✓ | – | ✓ | – |
| Lifted Index | – | – | ✓ | – |
| Nulová izoterma (`freezing_level_height`) | ✓ | – | ✓ | – |
| Strih vetra 0–6 km (odvodený) | ✓ | ✓ | ✓ | ✓ |

- Vrstva, ktorú model nemá, je v menu sivá (rovnako ako nárazy pri ECMWF). Odvodzovanie LI a nulovej izotermy z hladín zatiaľ nerobíme: chýba tlak pri zemi v `data_spatial` a výpočet by znamenal ~16 polí na krok.
- **Strih vetra 0–6 km** je aproximovaný ako |V(500 hPa) − V(10 m)|. 500 hPa je približne 5,5 km n. m., na horách menej nad terénom. Štítok to uvádza („500 hPa − 10 m“).
- Odvodené polia z rôznych mriežok (GFS: 10 m v 0,117°, hladiny v 0,25°) sa zarovnajú na hrubšiu mriežku bilineárne (`align` vo `fieldLoader.ts`).
- Nové veličiny v `units.ts`: `energy` (J/kg, bez prevodu) a `tempDiff` (Lifted Index: °C = K, °F = ×1,8 bez posunu nuly).
- Overenie v prehliadači (zajtra 12 UTC): GFS CAPE 0/0, GFS LI 6,6/6,6 °C, ICON-EU CIN 0/0. ICON-EU nulová izoterma 2555 m v aplikácii a 2610 m v API, čo je interpolácia v horách (susedné bunky 2610, 2480, 2120 m).

**Ensemble** (`data/ensemble.ts`, záložka Ensemble v bodovom paneli):
- Open-Meteo Ensemble API `ensemble-api.open-meteo.com/v1/ensemble` (CORS *). Kontrolný beh je premenná bez prípony, členy majú príponu `_memberNN`.
- Modely: ECMWF ENS 0,25° (`ecmwf_ifs025`, 50 + kontrolný, 15 dní), ICON EPS (`icon_seamless`, 39 + 1, EU 5 dní a potom global), GEFS 0,25° (`gfs025`, 30 + 1), ECMWF AIFS ENS (`ecmwf_aifs025`). Zobrazuje sa 10 dní.
- **Beh** z `ensemble-api.open-meteo.com/data/<id>/static/meta.json`: `ecmwf_ifs025_ensemble`, `ncep_gefs025`, `ecmwf_aifs025_ensemble`. Pre ICON **`dwd_icon_eu_eps_native`** (`dwd_icon_eps` má zastaraný meta.json zo 6.10.).
- Veličiny: T 2 m, zrážky, nárazy, vietor 10 m, T 850 hPa, MSLP, CAPE a oblačnosť (iba tie, ktoré model má).
- Graf: členy ako tenké sivé čiary, medián, 10. a 90. percentil s pásmom, kontrolný beh. Pod tým pravdepodobnosť (%) prekročenia alebo nedosiahnutia prahu v aktuálnych jednotkách. Kvantily sa počítajú lineárnou interpoláciou (ako numpy), testy sú so známymi hodnotami.

---

## R-011 · 2026-10-21 · ALADIN CE 2 km (ČHMÚ) – detail pre Slovensko

**Dôvod:** záujmová oblasť vlastníka je Slovensko, najmä východ. ICON-D2 končí na 20,34° E (R-009), ALADIN CE pokrýva celé Slovensko.

**Overené:**
- `data_spatial/chmi_aladin_central_europe_2km`: behy každých 6 h, 73 krokov po 1 h (+72 h), hladiny 1000–100 hPa (bez 975/900), 6 premenných v hladinách. Pri zemi T, Td a RH 2 m, MSLP, vietor 10 m **iba ako rýchlosť a smer**, nárazy, zrážky, oblačnosť, CAPE a viditeľnosť.
- **Mriežka je Lambertova kužeľová (LCC)**, nie lat/lon. V metadátach je iba WKT bez začiatku a kroku. Parametre sú zo zdrojov Open-Meteo (`ChmiDomain.swift`): 1053 × 837 bodov, krok 2325 m, prvý bod 38,599° N 1,334° E, dotyková rovnobežka 46,244°, stredný poludník 17°, guľa R = 6 371 229 m. Riadok 0 je juh.
- Test v Node (S3 vs. Forecast API `models=chmi_aladin_central_europe_2km`, najbližšia bunka) v 5 bodoch od Košíc po Barcelonu: teplota 2 m aj vietor sedia na desatinu.
- **Vietor u/v v hladinách je zemepisný** (smer sedí s API aj pri Δλ = ±13°, kde by otočenie mriežky robilo ±9°). Netreba ho otáčať.

**Riešenie:**
- `lib/lcc.ts`: projekcia a prevzorkovanie LCC → pravidelná lat/lon mriežka 0,02° × 0,03° (~2,2 km pri 48° N) bilineárne, mimo oblasti NaN. Goniometria sa počíta raz na riadok a stĺpec, ~1 M buniek trvá desiatky ms. Ostatné vrstvy, izočiary, častice a popisok pod kurzorom tak pracujú bez zmeny.
- Vietor 10 m: zložky u/v pre častice sa dopočítajú z rýchlosti a smeru (virtuálne premenné `wind_u/v_component_10m`). Farba vrstvy vetra berie rýchlosť priamo z modelu.
- Bodové nástroje: ALADIN je v meteograme, Skew-T aj v porovnaní modelov (predvolene).
- Overenie v prehliadači: teplota 2 m 12,1/12,1 °C, teplota 500 hPa −13,5/−13,5 °C. Pri vetre popisok interpoluje medzi bunkami a API vracia najbližšiu bunku, preto pri slabom premenlivom vetre 5 vs. 3,6 km/h (susedné bunky 6,8 a 7,9 km/h).

---

## R-010 · 2026-10-21 · História na časovej osi (7 dní dozadu) a hranice štátov

**Požiadavka vlastníka:** história ako vo Windy, napr. 7 dní dozadu a 10 dní dopredu.

**Riešenie (`data/timeline.ts`, testy):**
- Open-Meteo uchováva behy v `data_spatial` 7 dní (R-001). Zoznam behov sa číta z výpisu S3 za 8 dní.
- **Minulosť sa skladá z minulých behov.** Pre čas *t* sa použije beh s najneskorším init time **pred** *t* (predstih +1 krok až po init time nasledujúceho behu: ICON-EU +1…+3 h, GFS +1…+6 h, ECMWF +3/+6 h). Krok +0 h sa v histórii nepoužije, lebo nemá zrážky ani nárazy (R-004). Chýbajúci beh pokryje predchádzajúci dlhším predstihom.
- Je to **krátkodobá predpoveď, nie analýza ani pozorovanie.** Štítok vľavo hore preto pri každom kroku ukazuje beh, z ktorého krok pochádza, jeho vek a značku „história“. Predstih v štítku je počítaný od toho behu.
- Krok osi v histórii: ICON-EU a GFS 1 h, ECMWF 3 h (`historyStepHours` v `models.ts`).
- Metadáta minulého behu sa načítajú až pri prvom použití a cachujú sa v pamäti. Polia idú cez rovnakú cache blokov ako predpoveď.
- **Dopredu** os siaha po koniec aktuálneho behu: GFS 16 dní, ECMWF 00/12Z 15 dní (06/18Z iba 6 dní), ICON-EU 5 dní. Behy rôznych modelov ani starších behov sa v budúcnosti nemiešajú.
- Pri otvorení stránky je nastavený čas najbližší k „teraz“ (predtým prvý krok behu). Na osi je šrafovaná história, červená značka „teraz“ a tlačidlo **Teraz**. Pri dlhej osi sa popisky dní riedia.
- Overené v prehliadači pre ICON-EU, ECMWF a GFS: skok na začiatok osi (14.10.) načíta pole z behu 14.10., bez chýb.

**Hranice štátov (požiadavka vlastníka):** v menu sa dá zvoliť farba hraníc (podľa mapy, čierna, biela, červená, žltá, purpurová, tyrkysová), hrúbka (tenké/stredné/hrubé) a voliteľne aj hranice krajov/regiónov. Mení sa iba vzhľad vrstiev podkladu OpenFreeMap (`boundary_2`/`boundary_country_*`, regióny `boundary_3`/`boundary_state`), pôvodné hodnoty sa po zmene štýlu znova zapamätajú. Nastavenie je v localStorage.

---

## R-009 · 2026-10-21 · Fáza 3: tlakové hladiny, ECMWF a GFS na mape

**Overené** v `data_spatial/<model>/latest.json` a malým testom v Node (čítanie výrezu a porovnanie s Forecast API v 3 bodoch, rozdiely ≤ 0,05):

| Model (mapa) | Priečinky | Mriežka | Krok | Hladiny (hPa) | Chýba |
|---|---|---|---|---|---|
| ICON-EU | `dwd_icon_eu` | 0,0625°, Európa | 1 h (+78 h), potom 3 h | 1000–50 (17) | – |
| ECMWF IFS 0,25° | `ecmwf_ifs025` | 0,25° globálna 721×1440 | 3 h | 1000–10 (14, bez 800/900/950) | nárazy vetra |
| GFS 0,25° | `ncep_gfs025` + `ncep_gfs013` | 0,25° globálna + 0,117° (Gauss, 1536×3072) | 1 h, neskôr 3 h, 16 dní | 1000–10 (44) | – |

- **GFS je v Open-Meteo rozdelený.** `ncep_gfs025` má hladiny, MSLP, nárazy, CAPE, CIN a LI. `ncep_gfs013` má prízemné polia (T 2 m, RH 2 m, vietor 10 m, zrážky, oblačnosť). Model GFS preto číta z oboch priečinkov **toho istého behu** (`combineRuns`, `partFor`). Doplnok z iného behu sa nepoužije, jeho vrstvy sa zablokujú.
- `ncep_gfs013` má Gaussovu mriežku (šírky nie sú presne rovnomerné). Ako pravidelnú ju čítame s odchýlkou zanedbateľnou pre Európu, hodnoty sedia s API.
- **Globálne modely sa čítajú iba vo výreze** 25–75° N, 35° W – 65° E (`EUROPE_CROP`, `cropRanges`). Pri 0,25° je to 201×401 buniek a vďaka chunkom 32×32 sa prenesie iba potrebná časť.
- Riadok 0 je juh vo všetkých modeloch (overené hodnotami).

**Vrstvy a hladiny:**
- Hladina sa volí v spodnej lište (Povrch / 850 / 700 / 500 / 300 / 250 hPa s orientačnou FL) alebo klávesmi `[` `]`. Hladina je v URL (`lv=`).
- Jedna vrstva (teplota, rosný bod, vietor, vlhkosť) má variant pri povrchu aj v hladine (`resolveLayer`). Vrstva iba pri povrchu (zrážky, oblačnosť, nárazy, MSLP) sa pri zvolenej hladine kreslí pri povrchu a štítok to uvádza („Zrážky (povrch)“). Geopotenciál existuje iba v hladinách.
- Odvodené polia: rosný bod z T a RH (Bolton, `lib/thermo`), relatívna topografia = Z500 − Z1000.
- Škály: 850 a 700 hPa používajú prízemnú teplotu a vietor. Od 500 hPa vyššie sú škály výškové (teplota −70…+20 °C, vietor 0–90 m/s). Geopotenciál má škálu pre každú hladinu.
- **Izočiary:** pri povrchu izobary (4 hPa), v hladine izohypsy (4 dam do 500 hPa, 8 dam vyššie, popisky v dam). Pri relatívnej topografii sú to jej vlastné izočiary (4 dam, zvýraznené 528 a 552 dam). **Izotermy** idú po 5 K, pod nulou modré, nad nulou červené a 0 °C hrubá. Zriedenie mriežky pre výpočet sa riadi rozlíšením (cieľ ~0,125°).
- Častice vetra idú v zvolenej hladine, vo výške pomalšie (0,05 namiesto 0,12 px na m/s).

**Overenie v prehliadači:** hodnota pod kurzorom sa zhoduje s API (ICON-EU T500 −13,1/−13,1 °C, ECMWF vietor 300 hPa 69/69,4 km/h, GFS T2m 6,5/6,6 °C).

**Modely s vysokým rozlíšením pre Slovensko** (záujmová oblasť vlastníka, ďalší krok):
- `chmi_aladin_central_europe_2km`: BBOX 38,6–56,2° N, 1,3–34,3° E, celé Slovensko, hladiny 1000–100 hPa, 72 h. **Projektovaná mriežka** (nie lat/lon), potrebuje prepočet súradníc vo vrstvách.
- `dwd_icon_d2`: končí na 20,34° E, **východné Slovensko nepokrýva**.
- `geosphere_arome_austria`: po 22,1° E, lat/lon, bez hladín.

---

## R-008 · 2026-10-21 · Rozloženie UI podľa Windy, mobil ako plnohodnotný cieľ

**Rozhodnutie (na žiadosť vlastníka, podľa screenshotov Windy):** stránka sa používa na PC aj na iPhone. Rozloženie:
- **Mapa cez celú obrazovku**, ovládanie pláva nad ňou (polopriehľadné panely, svetlá aj tmavá téma).
- **Vľavo hore** štítok: vrstva, model, beh (init time, vek) a čas platnosti s predstihom. Zadanie (sekcia 1) vyžaduje, aby boli vždy viditeľné. Klik otvorí menu.
- **Vpravo hore:** Prihlásiť sa, Menu, rýchle vrstvy (okrúhle ikony s farbami škály a popisom; `quick: true` v `layers.config.ts`), „Viac vrstiev…“.
- **Menu:** model a beh, vrstvy v dlaždiciach podľa kategórií, prekrytia (prepínače), jednotky, rýchlosť prehrávania, informácie a atribúcia. Desktop: panel vpravo, mobil: celá obrazovka.
- **Dole:** prepínače izobár a častíc, zoom (iba desktop) a moja poloha, rad modelov s rozlíšením, legenda (klik na jednotku ju prepne, ako vo Windy), časová os s dňami (posúvanie prstom, pozícia podľa času, nie indexu), pätička s upozornením.
- **Bodový panel:** desktop vľavo pod štítkom, mobil list zdola (78 % výšky, potiahnutie úchytu nadol ho zavrie).
- Mobil: dotykové plochy ≥ 40 px, `env(safe-area-inset-*)` (notch, home indicator), `dvh`, bez horizontálneho pretečenia. Overené v Playwright na iPhone 13 a iPhone SE (svetlá aj tmavá téma) a na desktope 1400×860.
- Popisok pod kurzorom sa ukazuje iba na zariadeniach s myšou (`hover: hover`).
- **Doplnenie (Fáza 4, pripomienka vlastníka „aby UI vyzeralo ako Windy aj rozloženie“):** ovládacie prvky nad mapou (štítok, pravý stĺpec, spodná časť) sú **vždy tmavé, polopriehľadné, s bielym textom a oranžovým zvýraznením** ako vo Windy. Menu je červený kruh. Prepisujú sa iba farebné premenné na kontajneroch, menu a bodový panel ostávajú podľa témy systému. Výber hladiny je ako **„Výška“** v pravom stĺpci, otvorí zoznam hladín zhora nadol s FL. Riadok hladín v spodnej lište bol odstránený.

## R-007 · 2026-10-21 · Verejná stránka, Cloudflare Access iba na prihlásenie

**Rozhodnutie (na žiadosť vlastníka):** aplikácia sa otvorí bez prihlasovacej obrazovky. V hornej lište vpravo je tlačidlo **Prihlásiť**. Toto mení sekciu 3.4 zadania.

- Adresa je `https://synoptik-ezo.pages.dev`. Názov `synoptik.pages.dev` bol obsadený, Cloudflare pridal príponu.
- Access aplikácia „Synoptik“ chráni iba `synoptik-ezo.pages.dev/prihlasenie` a celé preview deploymenty `*.synoptik-ezo.pages.dev`. Policy: iba e-mail vlastníka, One-time PIN, relácia 7 dní.
- Tok: tlačidlo → `/prihlasenie/` → prihlásenie Access → statická stránka presmeruje na `/`. Pohľad sa obnoví z localStorage. Stav prihlásenia číta `/cdn-cgi/access/get-identity`, odhlásenie ide cez `/cdn-cgi/access/logout`.
- **Dôsledok:** aplikáciu môže používať ktokoľvek, kto pozná adresu. `noindex` a `robots.txt` ostávajú. Dáta sú aj tak verejné (Open-Meteo). Prihlásenie zatiaľ nič neodomyká.
- **Neskôr:** Pages Functions, ktoré míňajú bezplatné limity alebo čítajú súkromné dáta (`/data/*` z R2, `/api/obs`), treba pridať ako ďalšie cesty do tej istej Access aplikácie, prípadne v nich overovať JWT z hlavičky `Cf-Access-Jwt-Assertion`.

## R-006 · 2026-10-21 · Fáza 2: Open-Meteo Forecast API pre bodové nástroje

Overené požiadavkami na `api.open-meteo.com/v1/forecast` (bod Bratislava):

- **CORS:** `Access-Control-Allow-Origin: *`. Volá sa priamo z prehliadača, cache v pamäti je 15 min.
- **Parametre:** `wind_speed_unit=ms`, `timeformat=unixtime`, `timezone=GMT`. Teplota a rosný bod prichádzajú v °C, tlak v hPa, výška geopotenciálu v m. Pri načítaní sa prevedú na SI.
- **Viac modelov naraz:** pri `models=a,b` majú premenné príponu `_a`, `_b`. Pri jednom modeli prípona nie je. Model mimo svojej oblasti (napr. AROME France pre Bratislavu) **sa v odpovedi ticho vynechá**. Keď je zadaný sám, API vráti chybu „No data is available for this location“.
- **Modely** (názvy pre `models=`): `icon_eu`, `icon_d2`, `icon_global`, `ecmwf_ifs025`, `gfs025`, `meteofrance_arpege_europe`, `ukmo_global_deterministic_10km`. Ďalšie fungujú tiež (`knmi_harmonie_arome_europe`, `ecmwf_aifs025_single`, `metno_seamless`), zatiaľ ich nepoužívame.
  - `gfs025` **nemá** `cloud_cover_low/mid/high` ani `precipitation` (samé null).
  - `ecmwf_ifs` (9 km) nemá tlakové hladiny. Pre Skew-T sa preto používa `ecmwf_ifs025`.
  - `dmi_harmonie_arome_europe` nemá 500 hPa.
- **Tlakové hladiny (teplota):**

  | Model | Hladiny hPa |
  |---|---|
  | icon_eu | 1000 975 950 925 900 850 800 700 600 500 400 300 250 200 150 100 70 50 |
  | icon_d2 | 1000 … 200 (bez 150 a vyšších) |
  | ecmwf_ifs025 | 1000 925 850 700 600 500 400 300 250 200 150 100 50 |
  | gfs, ukmo | 1000 … 30 |
  | arpege_europe | 1000 950 925 900 850 800 700 600 500 400 300 250 200 150 100 |

  Na každej hladine sú `temperature`, `dew_point`, `relative_humidity`, `wind_speed`, `wind_direction`, `geopotential_height`. Chýbajúce hladiny sú `null` a Skew-T ich preskočí.
- **Beh modelu (init time)** API v odpovedi nevracia. Dá sa zistiť z `api.open-meteo.com/data/<model>/static/meta.json` (`last_run_initialisation_time`, UNIX s; CORS `*`). Priečinky: `dwd_icon_eu`, `dwd_icon_d2`, `dwd_icon`, `ecmwf_ifs025`, `ncep_gfs025`, `meteofrance_arpege_europe`, `ukmo_global_deterministic_10km`. **Obmedzenie:** udáva *posledný* beh. Forecast API môže krátko po novom behu ešte vracať predchádzajúci beh. Pri bodových nástrojoch sa preto zobrazuje „posledný beh podľa meta.json“.
- **Iné premenné:** `lifted_index` je iba v GFS. `convective_inhibition` a `freezing_level_height` ECMWF nemá. `total_column_integrated_water_vapour` ICON-EU nemá. Indexy v Skew-T sa preto **počítajú sami** zo sondáže (`lib/thermo.ts`).
- **Limity** (podľa open-meteo.com/en/terms, nekomerčné použitie): 10 000 volaní za deň, 5 000 za hodinu, 600 za minútu. Požiadavka s viac ako 10 premennými sa počíta ako viac volaní (podiel z počtu premenných / 10). Skew-T má ~85 premenných, teda ~8,5 volania za jeden klik. Pre jedného používateľa s 15-minútovou cache je to dostatočné.

---

## R-005 · 2026-10-21 · Fáza 1: overenie hodnôt a výkonu

**Hodnota pod kurzorom vs. Open-Meteo API** (beh 2026-10-21 09Z, platnosť 15 UTC, náhodné stredy buniek, API s `cell_selection=nearest&elevation=nan`):

| Bod | Teplota 2 m (app / API) | MSLP hPa (app / API) | Vietor 10 m m/s (app / API) |
|---|---|---|---|
| 55,7500 N 14,3125 E | 11,0 / 11,1 | 1011,9 / 1011,9 | 3,6 / 3,61 |
| 47,6250 N 23,2500 E | 18,1 / 18,1 | 1016,9 / 1016,9 | 3,4 / 3,38 |
| 42,0000 N 23,8125 E | 13,8 / 13,9 | 1020,6 / 1020,6 | 2,2 / 2,24 |

Rozdiely ≤ 0,1 vznikajú zaokrúhlením a tým, že popisok interpoluje bilineárne a kurzor nie je presne v strede bunky.
**Pozor:** API bez `elevation=nan` prepočítava teplotu 2 m na nadmorskú výšku bodu (±0,2 °C), preto sa porovnáva s týmto parametrom.

**Výkon** (Playwright + Chrome so softvérovým WebGL, domáca sieť SK → S3 us-west-2):
- Prepnutie na prednačítaný krok: **17–35 ms** (limit 300 ms ✓).
- Prvé prehranie (dáta ešte nie sú v cache): **~1,5 kroku/s** pre jedno pole. Brzdí to latencia S3 (medián requestu 377 ms, ~8 requestov na súbor kroku). Pri poli + izobarách je to približne polovica. Opakované prehranie ide z cache.
- 60 fps pri časticiach sa tu nedá overiť: softvérové WebGL dalo 23 fps. **Overiť v bežnom prehliadači s GPU.**

## R-004 · 2026-10-21 · Fáza 1: vykresľovanie a dátové detaily

- **Farebné pole a častice sa kreslia v súradniciach obrazovky.** Shader prevádza pixel → Web Mercator → lat/lon → bunka mriežky; výrez mapy berie z `map.unproject`. Je to jednoduché a presné, ale predpokladá mapu bez rotácie a náklonu. Tie sú preto vypnuté (pri synoptických mapách je to bežné). **Pri glóbuse (Fáza 6+) treba prejsť na projekčnú maticu MapLibre.**
- Pole ide do GPU ako R16F textúra, už normalizovaná do pozície v škále (0–1), s lineárnym filtrovaním. Farba sa berie z LUT s 256 farbami. Škály sú v `config/colorscales.ts`, zarážky sú v SI.
- Vietor ide do GPU ako RG16F (u, v v m/s). Častice: RGBA8 textúra pozícií (16 bitov na súradnicu), technika mapbox/webgl-wind.
- Izobary počíta Web Worker cez `d3-contour` z poľa zriedeného 2× (0,125°), každé 4 hPa, 1000 a 1020 hPa sú zvýraznené. Body na okraji mriežky sa vyhadzujú, aby sa kontúry neuzatvárali po okraji.
- **Zrážky** v `data_spatial` sú súčet za interval od predchádzajúceho kroku: 1 h do +78 h, potom 3 h. Overené: 3-hodinová hodnota = súčet troch hodín z API (napr. 10,6 vs 10,5 mm). Legenda ukazuje dĺžku intervalu.
- **Krok +0 h** neobsahuje premenné za interval (`precipitation`, `rain`, `showers`, `snowfall_water_equivalent`, `wind_gusts_10m`): 116 premenných namiesto 126. Aplikácia zobrazí poznámku a pole nekreslí.
- Pri akejkoľvek chybe načítania sa pole, izobary aj častice vyčistia. Nikdy sa nezobrazí staré pole pod novým časom.
- Cache: bloky súborov idú do perzistentného Cache API (400 MB, súbory behu sú nemenné). Ak Cache API zlyhá (súkromné okno), použije sa pamäťová LRU. Hotové polia sú v pamäti, LRU 48 polí (~170 MB).
- Zoznam behov sa číta z výpisu S3 (ListObjectsV2 s `delimiter=/`, CORS povolený) za posledné 3 dni. Metadáta behu sú v `<beh>/meta.json`.

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
