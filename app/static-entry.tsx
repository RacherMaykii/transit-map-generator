import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import ProjectPortal from "./ProjectPortal";
import "./globals.css";

const root = document.getElementById("root");
if (!root) throw new Error("Static application root is missing");

createRoot(root).render(
  <StrictMode>
    <ProjectPortal />
  </StrictMode>,
);
