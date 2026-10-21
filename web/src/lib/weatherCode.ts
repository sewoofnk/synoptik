// Kód počasia WMO (Open-Meteo `weather_code`) → ikona a slovenský popis.
// https://open-meteo.com/en/docs – tabuľka „WMO Weather interpretation codes“.

export interface WeatherSymbol {
  icon: string;
  label: string;
}

const T: Record<number, [day: string, night: string, label: string]> = {
  0: ["☀️", "🌙", "Jasno"],
  1: ["🌤️", "🌙", "Prevažne jasno"],
  2: ["⛅", "☁️", "Polojasno"],
  3: ["☁️", "☁️", "Zamračené"],
  45: ["🌫️", "🌫️", "Hmla"],
  48: ["🌫️", "🌫️", "Hmla s námrazou"],
  51: ["🌦️", "🌧️", "Slabé mrholenie"],
  53: ["🌦️", "🌧️", "Mrholenie"],
  55: ["🌧️", "🌧️", "Silné mrholenie"],
  56: ["🌧️", "🌧️", "Mrznúce mrholenie"],
  57: ["🌧️", "🌧️", "Silné mrznúce mrholenie"],
  61: ["🌦️", "🌧️", "Slabý dážď"],
  63: ["🌧️", "🌧️", "Dážď"],
  65: ["🌧️", "🌧️", "Silný dážď"],
  66: ["🌨️", "🌨️", "Mrznúci dážď"],
  67: ["🌨️", "🌨️", "Silný mrznúci dážď"],
  71: ["🌨️", "🌨️", "Slabé sneženie"],
  73: ["🌨️", "🌨️", "Sneženie"],
  75: ["❄️", "❄️", "Silné sneženie"],
  77: ["🌨️", "🌨️", "Snehové zrná"],
  80: ["🌦️", "🌧️", "Slabé prehánky"],
  81: ["🌧️", "🌧️", "Prehánky"],
  82: ["🌧️", "🌧️", "Silné prehánky"],
  85: ["🌨️", "🌨️", "Snehové prehánky"],
  86: ["❄️", "❄️", "Silné snehové prehánky"],
  95: ["⛈️", "⛈️", "Búrka"],
  96: ["⛈️", "⛈️", "Búrka s krúpami"],
  99: ["⛈️", "⛈️", "Silná búrka s krúpami"],
};

export function weatherSymbol(code: number | null | undefined, isDay = true): WeatherSymbol | null {
  if (code === null || code === undefined) return null;
  const e = T[code];
  if (!e) return { icon: "·", label: `Kód ${code}` };
  return { icon: isDay ? e[0] : e[1], label: e[2] };
}

/** Pri zlučovaní hodín do 3 h stĺpca: najvýznamnejší jav (vyšší kód = výraznejšie počasie) */
export function dominantCode(codes: (number | null | undefined)[]): number | null {
  let best: number | null = null;
  for (const c of codes) if (c !== null && c !== undefined && (best === null || c > best)) best = c;
  return best;
}
