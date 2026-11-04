import SmoothScroll from "./components/SmoothScroll";
import TriageDashboard from "./components/TriageDashboard";
import GlassGridBackdrop from "./components/GlassGridBackdrop";

export default function App() {
  return (
    <>
      <GlassGridBackdrop />
      <SmoothScroll>
        <TriageDashboard />
      </SmoothScroll>
    </>
  );
}
