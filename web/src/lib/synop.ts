// Dekódovanie správy SYNOP (FM 12, oddiel 1 + nárazy z oddielu 3) pre staničný model na mape.
// Neoficiálny zdroj (OGIMET) – parsuje sa opatrne: neznáme alebo chybné skupiny sa preskočia.
// Výstup v SI (K, Pa, m/s, m).

export interface Synop {
  /** celková oblačnosť v osminách (9 = obloha nezistiteľná), null = chýba */
  n: number | null;
  /** smer vetra [°] (0 bezvetrie, null premenlivý/chýba) */
  dir: number | null;
  /** rýchlosť vetra [m/s] */
  ff: number | null;
  /** náraz [m/s] (oddiel 3, skupina 910ff / 911ff) */
  gust: number | null;
  /** teplota a rosný bod [K] */
  t: number | null;
  td: number | null;
  /** relatívna vlhkosť [%], ak namiesto rosného bodu (29UUU) */
  rh: number | null;
  /** tlak na stanici a na hladine mora [Pa] */
  p: number | null;
  pmsl: number | null;
  /** tendencia tlaku: charakteristika a (0–8) a zmena za 3 h [Pa] */
  tendency: { a: number; dp: number } | null;
  /** zrážky [mm] a obdobie [h] (skupina 6RRRt) */
  precip: { mm: number; hours: number } | null;
  /** súčasné počasie ww (00–99) */
  ww: number | null;
  /** dohľadnosť [m] */
  vis: number | null;
  /** výška základne najnižšej oblačnosti – kód h (0–9) */
  h: number | null;
}

const KT = 0.514444;
const TR_HOURS: Record<string, number> = { "1": 6, "2": 12, "3": 18, "4": 24, "5": 1, "6": 2, "7": 3, "8": 9, "9": 15 };

/** Dohľadnosť VV (WMO 4377) → m */
export function decodeVis(vv: number): number | null {
  if (vv <= 50) return vv * 100;
  if (vv >= 56 && vv <= 80) return (vv - 50) * 1000;
  if (vv >= 81 && vv <= 88) return (vv - 80) * 5000 + 30000;
  if (vv === 89) return 70000;
  const coarse: Record<number, number> = { 90: 0, 91: 50, 92: 200, 93: 500, 94: 1000, 95: 2000, 96: 4000, 97: 10000, 98: 20000, 99: 50000 };
  return coarse[vv] ?? null;
}

/** Teplota zo skupiny sTTT (s 0 = kladná, 1 = záporná, desatiny °C) → K */
function temp(g: string): number | null {
  if (!/^[01]\d{3}$/.test(g)) return null;
  const v = Number(g.slice(1)) / 10;
  return (g[0] === "1" ? -v : v) + 273.15;
}

/** Tlak PPPP v desatinách hPa (0xxx = 1000+) → Pa */
function pressure(g: string): number | null {
  if (!/^\d{4}$/.test(g)) return null;
  let hpa = Number(g) / 10;
  if (hpa < 100) hpa += 1000;
  return hpa * 100;
}

export function decodeSynop(msg: string): Synop | null {
  const g = msg.trim().replace(/=+$/, "").split(/\s+/);
  if (g[0] !== "AAXX" || g.length < 5) return null;
  const iw = g[1]![4]; // jednotka vetra: 0/1 m/s, 3/4 uzly
  const kt = iw === "3" || iw === "4";
  const out: Synop = { n: null, dir: null, ff: null, gust: null, t: null, td: null, rh: null, p: null, pmsl: null, tendency: null, precip: null, ww: null, vis: null, h: null };

  // g[2] = IIiii, g[3] = iRixhVV, g[4] = Nddff
  const ih = g[3]!;
  if (/^\d$/.test(ih[2] ?? "")) out.h = Number(ih[2]);
  if (/^\d{2}$/.test(ih.slice(3, 5))) out.vis = decodeVis(Number(ih.slice(3, 5)));
  const nddff = g[4]!;
  if (/^\d$/.test(nddff[0]!)) out.n = Number(nddff[0]);
  let k = 5;
  if (/^.\d{4}$/.test(nddff)) {
    const dd = Number(nddff.slice(1, 3));
    let ff = Number(nddff.slice(3, 5));
    // ff ≥ 99 → rýchlosť v nasledujúcej skupine 00fff
    if (ff === 99 && /^00\d{3}$/.test(g[5] ?? "")) {
      ff = Number(g[5]!.slice(2));
      k = 6;
    }
    out.dir = dd === 0 ? 0 : dd === 99 ? null : dd * 10;
    out.ff = ff * (kt ? KT : 1);
  }

  // oddiel 1 až po 333 / 555
  for (; k < g.length; k++) {
    const s = g[k]!;
    if (s === "333" || s === "555" || s === "444") break;
    const id = s[0];
    switch (id) {
      case "1":
        out.t = temp(s.slice(1));
        break;
      case "2":
        if (s[1] === "9") out.rh = /^\d{3}$/.test(s.slice(2)) ? Number(s.slice(2)) : null;
        else out.td = temp(s.slice(1));
        break;
      case "3":
        out.p = pressure(s.slice(1));
        break;
      case "4":
        // 4PPPP (tlak MSL, prvá číslica 0 alebo 9) alebo 4a3hhh (geopotenciál hladiny) – ten sa ignoruje
        if (s[1] === "0" || s[1] === "9") out.pmsl = pressure(s.slice(1));
        break;
      case "5":
        if (/^5[0-8]\d{3}$/.test(s)) {
          const a = Number(s[1]);
          // desatiny hPa → Pa (×10, celé číslo bez chyby zaokrúhlenia)
          const dp = Number(s.slice(2)) * 10;
          // a 0–3 vzostup, 4 bez zmeny, 5–8 pokles
          out.tendency = { a, dp: a >= 5 ? -dp : dp };
        }
        break;
      case "6":
        if (/^6\d{3}[1-9]$/.test(s)) {
          const rrr = Number(s.slice(1, 4));
          // 990 = stopy, 991–999 = desatiny mm
          const mm = rrr >= 990 ? (rrr - 990) / 10 : rrr;
          out.precip = { mm, hours: TR_HOURS[s[4]!] ?? 0 };
        }
        break;
      case "7":
        if (/^7\d{2}/.test(s)) out.ww = Number(s.slice(1, 3));
        break;
    }
  }

  // oddiel 3: nárazy 910ff (max za 10 min) / 911ff (max za obdobie)
  const s3 = g.indexOf("333");
  if (s3 >= 0) {
    for (let j = s3 + 1; j < g.length && g[j] !== "555"; j++) {
      const m = /^91[01](\d{2})$/.exec(g[j]!);
      if (m) {
        const v = Number(m[1]) * (kt ? KT : 1);
        out.gust = Math.max(out.gust ?? 0, v);
      }
    }
  }
  return out;
}
