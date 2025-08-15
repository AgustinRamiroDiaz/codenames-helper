"use client";

import { useEffect } from "react";

export default function PwaRegister() {
  useEffect(() => {
    if (
      typeof window === "undefined" ||
      !("serviceWorker" in navigator)
    ) {
      return;
    }

    const isLocalhost = Boolean(
      window.location.hostname === "localhost" ||
        window.location.hostname === "127.0.0.1" ||
        window.location.hostname === "[::1]"
    );

    if (window.location.protocol === "https:" || isLocalhost) {
      navigator.serviceWorker
        .register("/sw.js")
        .catch(() => {
          // Ignore registration errors
        });
    }
  }, []);

  return null;
} 