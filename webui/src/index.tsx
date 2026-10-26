import React from "react";
import { createRoot } from "react-dom/client";

import App from "./App";
import { loadUIConfig } from "./providers/ui-config";

const container = document.getElementById("root") as HTMLElement;
const root = createRoot(container);

// The UI config (mono vs multi company) must be known before first render.
void loadUIConfig().then(() =>
  root.render(
    <React.StrictMode>
      <App />
    </React.StrictMode>
  )
);
