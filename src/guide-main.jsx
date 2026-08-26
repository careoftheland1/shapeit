import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import Guide from "./Guide.jsx";
import "./guide.css";

createRoot(document.getElementById("root")).render(
  <StrictMode>
    <Guide />
  </StrictMode>,
);
