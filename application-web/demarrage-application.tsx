import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { RacineApplication } from "./racine-application";
import "./styles-globaux.css";

const root = document.getElementById("root");
if (!root) throw new Error("#root introuvable");
createRoot(root).render(
  <StrictMode>
    <RacineApplication />
  </StrictMode>,
);
