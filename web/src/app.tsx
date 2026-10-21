import { MapView } from "./map/MapView";
import { Footer } from "./panels/Footer";
import { TopBar } from "./panels/TopBar";

export function App() {
  return (
    <div class="layout">
      <TopBar />
      <main class="main">
        <MapView />
      </main>
      <Footer />
    </div>
  );
}
