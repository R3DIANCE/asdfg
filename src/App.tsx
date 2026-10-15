import { DebugPanel } from "./components/Debug";
import { APITester } from "./APITester";
import "./index.css";

export function App() {
  return (
    <div className="app">
      <div className="debug-panel-overlay">
        <DebugPanel />
      </div>
      <div className="logo-container">
        <h1>Maple Wayfarer</h1>
      </div>
      <APITester />
    </div>
  );
}

export default App;
