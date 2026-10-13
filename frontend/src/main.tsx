import React from "react";
import ReactDOM from "react-dom/client";
import { BrowserRouter } from "react-router-dom";
import App from "@/app/App";
import { applyInitialTheme } from "@/components/layout/theme-provider";
import "@/styles/globals.css";

applyInitialTheme();

// Browsers open the native date / time picker only from its small calendar icon. Open it on any click in
// such a box, app-wide (form fields, list filters' custom ranges, report filters, raw <input type="date">).
// showPicker() throws if the picker is already open or the browser lacks it — typing still works then.
const PICKER_TYPES = new Set(["date", "datetime-local", "month", "week", "time"]);
document.addEventListener("click", (e) => {
  const el = e.target;
  if (!(el instanceof HTMLInputElement) || !PICKER_TYPES.has(el.type) || el.disabled || el.readOnly) return;
  try {
    (el as HTMLInputElement & { showPicker?: () => void }).showPicker?.();
  } catch {
    /* typing remains available */
  }
});

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <BrowserRouter basename="/sugar">
      <App />
    </BrowserRouter>
  </React.StrictMode>,
);
