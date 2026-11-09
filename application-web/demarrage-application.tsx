import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { demarrerPwa } from "./outils/pwa";
import { RacineApplication } from "./racine-application";
import "./styles-globaux.css";

demarrerPwa();

const root = document.getElementById("root");
if (!root) throw new Error("#root introuvable");
createRoot(root).render(
  <StrictMode>
    <RacineApplication />
  </StrictMode>,
);
