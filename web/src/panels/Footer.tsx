import { menuOpen } from "../state/store";

// Nenápadná pätička: upozornenie (nie je certifikovaný letecký zdroj) a skrátená atribúcia.
// Úplná atribúcia je v menu (O aplikácii) a v rohu mapy.
export function Footer() {
  return (
    <footer class="footer">
      <span>Nie je certifikovaný zdroj leteckých informácií – na let používajte oficiálny brífing.</span>
      <button class="link" onClick={() => (menuOpen.value = true)}>
        © Open-Meteo (CC BY 4.0) · DWD · ECMWF · NOAA · ČHMÚ · SHMÚ · RainViewer · OpenFreeMap · OSM
      </button>
    </footer>
  );
}
