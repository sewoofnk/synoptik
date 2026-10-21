// Lambertova kužeľová konformná projekcia (LCC) na guli a prevzorkovanie poľa z LCC mriežky
// na pravidelnú lat/lon mriežku. Používa ALADIN CE 2 km (R-011): vrstvy, izočiary a popisok
// pod kurzorom potom pracujú s bežnou lat/lon mriežkou.

export interface LccGrid {
  nx: number;
  ny: number;
  /** Prvý bod mriežky (juhozápadný roh, riadok 0 = juh) */
  firstLat: number;
  firstLon: number;
  /** Krok mriežky v metroch */
  dx: number;
  dy: number;
  /** Štandardná rovnobežka (dotyková – obe rovnobežky rovnaké) a stredný poludník, stupne */
  lat0: number;
  lon0: number;
  /** Polomer gule, m */
  radius: number;
}

/** Cieľová pravidelná lat/lon mriežka (stredy krajných buniek) */
export interface LatLonTarget {
  latMin: number;
  lonMin: number;
  latMax: number;
  lonMax: number;
  dlat: number;
  dlon: number;
}

const RAD = Math.PI / 180;

export class Lcc {
  readonly n: number;
  private readonly rf: number;
  private readonly rho0: number;
  private readonly x0: number;
  private readonly y0: number;

  constructor(readonly g: LccGrid) {
    const phi0 = g.lat0 * RAD;
    this.n = Math.sin(phi0);
    const f = (Math.cos(phi0) * Math.pow(Math.tan(Math.PI / 4 + phi0 / 2), this.n)) / this.n;
    this.rf = g.radius * f;
    this.rho0 = this.rho(g.lat0);
    [this.x0, this.y0] = this.forward(g.firstLat, g.firstLon);
  }

  /** Vzdialenosť od vrcholu kužeľa pre zemepisnú šírku */
  rho(lat: number): number {
    return this.rf / Math.pow(Math.tan(Math.PI / 4 + (lat * RAD) / 2), this.n);
  }

  /** Uhol v rovine projekcie pre zemepisnú dĺžku (rad) */
  theta(lon: number): number {
    return this.n * (lon - this.g.lon0) * RAD;
  }

  /** lat/lon → x, y [m] */
  forward(lat: number, lon: number): [number, number] {
    const r = this.rho(lat);
    const t = this.theta(lon);
    return [r * Math.sin(t), this.rho0 - r * Math.cos(t)];
  }

  /** lat/lon → (spojitý) index mriežky [i (stĺpec), j (riadok)] */
  index(lat: number, lon: number): [number, number] {
    const [x, y] = this.forward(lat, lon);
    return [(x - this.x0) / this.g.dx, (y - this.y0) / this.g.dy];
  }
}

/**
 * Prevzorkovanie poľa z LCC mriežky (riadky od juhu, dĺžka nx·ny) na lat/lon mriežku
 * bilineárnou interpoláciou. Mimo oblasti modelu NaN. ρ závisí iba od šírky a uhol iba od dĺžky,
 * preto sa goniometria počíta raz na riadok a stĺpec.
 */
export function reprojectLcc(src: Float32Array, lcc: Lcc, t: LatLonTarget): { data: Float32Array; ny: number; nx: number } {
  const { nx: snx, ny: sny, dx, dy } = lcc.g;
  if (src.length !== snx * sny) throw new Error(`LCC: očakávaných ${snx}×${sny} bodov, prišlo ${src.length}`);
  const ny = Math.round((t.latMax - t.latMin) / t.dlat) + 1;
  const nx = Math.round((t.lonMax - t.lonMin) / t.dlon) + 1;
  const [x0, y0] = lcc.forward(lcc.g.firstLat, lcc.g.firstLon);
  const rho0 = lcc.rho(lcc.g.lat0);

  const sinT = new Float64Array(nx);
  const cosT = new Float64Array(nx);
  for (let c = 0; c < nx; c++) {
    const th = lcc.theta(t.lonMin + c * t.dlon);
    sinT[c] = Math.sin(th);
    cosT[c] = Math.cos(th);
  }

  const out = new Float32Array(nx * ny);
  for (let r = 0; r < ny; r++) {
    const rho = lcc.rho(t.latMin + r * t.dlat);
    const row = r * nx;
    for (let c = 0; c < nx; c++) {
      const fi = (rho * sinT[c]! - x0) / dx;
      const fj = (rho0 - rho * cosT[c]! - y0) / dy;
      if (fi < 0 || fj < 0 || fi > snx - 1 || fj > sny - 1) {
        out[row + c] = NaN;
        continue;
      }
      const i0 = Math.min(Math.floor(fi), snx - 2);
      const j0 = Math.min(Math.floor(fj), sny - 2);
      const ti = fi - i0;
      const tj = fj - j0;
      const k = j0 * snx + i0;
      const a = src[k]!, b = src[k + 1]!, cc = src[k + snx]!, d = src[k + snx + 1]!;
      out[row + c] = (a * (1 - ti) + b * ti) * (1 - tj) + (cc * (1 - ti) + d * ti) * tj;
    }
  }
  return { data: out, ny, nx };
}
