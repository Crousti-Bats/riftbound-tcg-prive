import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { EcranAccueil } from "./ecran-accueil";
import "./styles-globaux.css";

const root = document.getElementById("root");
if (!root) throw new Error("#root introuvable");
createRoot(root).render(
  <StrictMode>
    <EcranAccueil />
  </StrictMode>,
);
