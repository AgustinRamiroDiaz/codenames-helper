"use client";

import { useEffect, useState } from "react";

type InstallChoiceOutcome = "accepted" | "dismissed";

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: InstallChoiceOutcome; platform: string }>;
}

function isStandaloneDisplayMode(): boolean {
  // iOS Safari uses navigator.standalone; others use matchMedia
  if (typeof window === "undefined") return false;
  // @ts-expect-error - navigator.standalone is iOS specific
  const iosStandalone = typeof navigator !== "undefined" && !!navigator.standalone;
  const pwaMedia = window.matchMedia && window.matchMedia("(display-mode: standalone)").matches;
  return iosStandalone || pwaMedia;
}

export default function PwaInstallPrompt() {
  const [deferredPrompt, setDeferredPrompt] = useState<BeforeInstallPromptEvent | null>(null);
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    if (typeof window === "undefined") return;

    function onBeforeInstallPrompt(e: Event) {
      e.preventDefault();
      setDeferredPrompt(e as BeforeInstallPromptEvent);
      setVisible(true);
    }

    function onAppInstalled() {
      setDeferredPrompt(null);
      setVisible(false);
    }

    window.addEventListener("beforeinstallprompt", onBeforeInstallPrompt);
    window.addEventListener("appinstalled", onAppInstalled);

    // Hide if already installed
    if (isStandaloneDisplayMode()) {
      setVisible(false);
    }

    return () => {
      window.removeEventListener("beforeinstallprompt", onBeforeInstallPrompt);
      window.removeEventListener("appinstalled", onAppInstalled);
    };
  }, []);

  async function handleInstall() {
    try {
      if (!deferredPrompt) return;
      await deferredPrompt.prompt();
      const choice = await deferredPrompt.userChoice;
      if (choice.outcome === "accepted") {
        setVisible(false);
        setDeferredPrompt(null);
      } else {
        // Dismissed by user; keep the banner hidden for now
        setVisible(false);
      }
    } catch {
      setVisible(false);
    }
  }

  if (!visible || !deferredPrompt) return null;

  return (
    <div className="fixed inset-x-0 bottom-4 flex justify-center px-4 z-50">
      <div className="w-full max-w-md bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/80 border border-black/[.08] dark:border-white/[.145] rounded shadow p-3 sm:p-4 flex items-center gap-3">
        <div className="flex-1">
          <div className="text-sm font-medium">Install Codenames Helper?</div>
          <div className="text-xs opacity-80">Add to your device for a faster, app-like experience.</div>
        </div>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => setVisible(false)}
            className="h-9 px-3 rounded border border-black/[.08] dark:border-white/[.145] text-sm hover:bg-black/[.04] dark:hover:bg-white/[.06]"
          >
            Not now
          </button>
          <button
            type="button"
            onClick={handleInstall}
            className="h-9 px-3 rounded bg-foreground text-background text-sm font-medium hover:opacity-90"
          >
            Install
          </button>
        </div>
      </div>
    </div>
  );
} 