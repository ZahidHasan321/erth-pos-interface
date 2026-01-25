import React from "react";
import ReactDOM from "react-dom/client";

// Import the generated route tree

import App from "./App";
import "./index.css";


ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
      <App />
  </React.StrictMode>,
);
