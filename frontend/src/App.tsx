import SmoothScroll from "./components/SmoothScroll";
import TriageDashboard from "./components/TriageDashboard";

export default function App() {
  return (
    <SmoothScroll>
      <main className="min-h-screen bg-gradient-to-b from-slate-50 via-white to-slate-50">
        <TriageDashboard />
      </main>
    </SmoothScroll>
  );
}
