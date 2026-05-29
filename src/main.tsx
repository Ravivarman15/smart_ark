import { createRoot } from "react-dom/client";
import App from "./App.tsx";
import "./index.css";
import { installChunkErrorRecovery } from "./lib/lazyWithRetry";

// Recover from stale code-split chunks after a new deploy (see lazyWithRetry).
installChunkErrorRecovery();

createRoot(document.getElementById("root")!).render(<App />);
