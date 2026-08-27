import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import SeeIt from "./SeeIt.jsx";
import "./see-it.css";

createRoot(document.getElementById("root")).render(
  <StrictMode>
    <SeeIt />
  </StrictMode>,
);
