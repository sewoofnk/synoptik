"""Zoznam staníc SYNOP pre mapu (súradnice k indexom WMO), R-014.

Zdroj: NOAA NCEI ISD history (verejná doména), https://www.ncei.noaa.gov/pub/data/noaa/isd-history.csv
USAF kód = index WMO × 10. Berú sa stanice vo výreze Európy, aktívne od roku 2024.

Spustenie (z koreňa repozitára):
    python pipeline/stations/build_synop_stations.py
Výstup: web/public/data/synop-stations.json  {"11968": ["Košice", 48.667, 21.217, 231], ...}
"""

import csv
import io
import json
import urllib.request
from pathlib import Path

ISD_URL = "https://www.ncei.noaa.gov/pub/data/noaa/isd-history.csv"
# rovnaký výrez ako OBS_BBOX v shared/obs.ts
LAT_MIN, LON_MIN, LAT_MAX, LON_MAX = 30.0, -30.0, 72.0, 45.0
ACTIVE_SINCE = "20240101"
OUT = Path(__file__).resolve().parents[2] / "web" / "public" / "data" / "synop-stations.json"


def nice_name(name: str) -> str:
    """„POPRAD TATRY“ → „Poprad Tatry“ (ISD má mená veľkými písmenami bez diakritiky)."""
    return " ".join(w.capitalize() if len(w) > 2 else w for w in name.split())


def main() -> None:
    with urllib.request.urlopen(ISD_URL, timeout=60) as r:
        text = r.read().decode("utf-8", errors="replace")
    stations: dict[str, list] = {}
    for row in csv.DictReader(io.StringIO(text)):
        usaf = row["USAF"]
        if not (usaf.isdigit() and len(usaf) == 6 and usaf.endswith("0")) or not row["LAT"]:
            continue
        if row["END"] < ACTIVE_SINCE:
            continue
        lat, lon = float(row["LAT"]), float(row["LON"])
        if not (LAT_MIN <= lat <= LAT_MAX and LON_MIN <= lon <= LON_MAX):
            continue
        elev = row["ELEV(M)"].replace("+", "")
        stations[usaf[:5]] = [
            nice_name(row["STATION NAME"]),
            round(lat, 3),
            round(lon, 3),
            round(float(elev)) if elev and float(elev) > -999 else None,
        ]
    OUT.parent.mkdir(parents=True, exist_ok=True)
    OUT.write_text(json.dumps(dict(sorted(stations.items())), ensure_ascii=False, separators=(",", ":")), encoding="utf-8")
    print(f"{len(stations)} staníc -> {OUT}")


if __name__ == "__main__":
    main()
