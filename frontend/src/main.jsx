// main.jsx
// Point d'entrée de l'application React (Entry point).
// Enveloppe l'App dans un BrowserRouter avec un base path dynamique
// récupéré depuis la variable d'env VITE_BASE_PATH.
// This allows the app to be served under a sub-path like /app2/ in production.

import React from "react";
import ReactDOM from "react-dom/client";
import { BrowserRouter } from "react-router-dom";
import App from "./App";

// Base path pour le router — fallback sur '/app2' si la variable n'est pas définie
const basename = import.meta.env.VITE_BASE_PATH || '/app2';

ReactDOM.createRoot(document.getElementById("root")).render(
  <BrowserRouter basename={basename}>
    <App />
  </BrowserRouter>
);
