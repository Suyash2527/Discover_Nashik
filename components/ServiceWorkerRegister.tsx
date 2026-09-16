"use client";

import { useEffect } from "react";

export default function ServiceWorkerRegister() {
  useEffect(() => {
    if ("serviceWorker" in navigator) {
      navigator.serviceWorker
        .register("/sw.js")
        .then((reg) => console.log("[PWA] Service Worker registered with scope:", reg.scope))
        .catch((err) => console.warn("[PWA] Service Worker registration failed:", err));
    }
  }, []);

  return null;
}
