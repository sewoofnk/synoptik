// Pätička: upozornenie (nie je certifikovaný letecký zdroj) a atribúcia zdrojov dát.
export function Footer() {
  return (
    <footer class="footer">
      <span>
        Nie je certifikovaný zdroj leteckých informácií. Na let používajte oficiálny brífing.
      </span>
      <span class="sources">
        Dáta: <a href="https://open-meteo.com/" target="_blank" rel="noopener">Open-Meteo</a> (CC BY 4.0) ·
        modely DWD, ECMWF, NOAA · mapa ©{" "}
        <a href="https://openfreemap.org/" target="_blank" rel="noopener">OpenFreeMap</a>,{" "}
        <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener">OpenStreetMap</a>
      </span>
    </footer>
  );
}
