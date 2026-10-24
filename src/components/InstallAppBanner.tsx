import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { Download, Smartphone, X } from "lucide-react";
import { isNativeApp } from "@/lib/api";

type BeforeInstallPromptEvent = Event & {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed"; platform: string }>;
};

const isStandaloneMode = () =>
  window.matchMedia("(display-mode: standalone)").matches || (window.navigator as Navigator & { standalone?: boolean }).standalone === true;

const isIos = () => /iphone|ipad|ipod/i.test(window.navigator.userAgent);
const isAndroid = () => /android/i.test(window.navigator.userAgent);

const InstallAppBanner = () => {
  const [deferredPrompt, setDeferredPrompt] = useState<BeforeInstallPromptEvent | null>(null);
  const [dismissed, setDismissed] = useState(false);
  const [installed, setInstalled] = useState(false);

  useEffect(() => {
    setInstalled(isStandaloneMode());

    const handleBeforeInstallPrompt = (event: Event) => {
      event.preventDefault();
      setDeferredPrompt(event as BeforeInstallPromptEvent);
    };

    const handleInstalled = () => {
      setInstalled(true);
      setDeferredPrompt(null);
    };

    window.addEventListener("beforeinstallprompt", handleBeforeInstallPrompt);
    window.addEventListener("appinstalled", handleInstalled);
    return () => {
      window.removeEventListener("beforeinstallprompt", handleBeforeInstallPrompt);
      window.removeEventListener("appinstalled", handleInstalled);
    };
  }, []);

  const content = useMemo(() => {
    if (installed || dismissed || isNativeApp()) return null;
    if (deferredPrompt) {
      return {
        title: "Install Hey Yaara",
        description: "Add the app to your home screen for one-tap access and a more app-like experience on phone, tablet, and desktop.",
        actionLabel: "Install Now",
      };
    }

    if (isIos()) {
      return {
        title: "Install on iPhone or iPad",
        description: "Open Safari share menu and choose Add to Home Screen so Hey Yaara behaves like an app.",
        actionLabel: null,
      };
    }

    if (isAndroid()) {
      return {
        title: "Android app",
        description: "Hey Yaara ka Android app download karke phone par install kijiye.",
        actionLabel: null,
      };
    }

    return null;
  }, [deferredPrompt, dismissed, installed]);

  if (!content) return null;

  const handleInstall = async () => {
    if (!deferredPrompt) return;
    await deferredPrompt.prompt();
    await deferredPrompt.userChoice.catch(() => null);
    setDeferredPrompt(null);
  };

  return (
    <div className="rounded-[28px] border border-amber-400/20 bg-gradient-to-r from-amber-500/12 via-orange-500/8 to-sky-500/8 p-5 shadow-xl shadow-black/20 backdrop-blur-xl">
      <div className="flex items-start gap-4">
        <div className="flex h-14 w-14 flex-shrink-0 items-center justify-center rounded-2xl bg-white/10 text-amber-200">
          {deferredPrompt ? <Download className="h-7 w-7" /> : <Smartphone className="h-7 w-7" />}
        </div>
        <div className="min-w-0 flex-1">
          <p className="text-lg font-black text-amber-50">{content.title}</p>
          <p className="mt-1 text-base font-medium leading-relaxed text-white/70">{content.description}</p>
          {content.actionLabel ? (
            <button
              type="button"
              onClick={() => void handleInstall()}
              className="mt-4 rounded-2xl bg-gradient-to-r from-amber-500 to-orange-500 px-5 py-3 text-base font-black text-white shadow-lg shadow-orange-500/20 transition hover:-translate-y-0.5"
            >
              {content.actionLabel}
            </button>
          ) : isIos() ? (
            <p className="mt-4 text-sm font-bold uppercase tracking-[0.22em] text-amber-200/80">
              Safari only
            </p>
          ) : null}
          <Link to="/get" className="mt-3 inline-block text-base font-bold text-amber-200 underline underline-offset-4 hover:text-amber-50">
            Android aur iPhone app download karein
          </Link>
        </div>
        <button
          type="button"
          aria-label="Dismiss install prompt"
          onClick={() => setDismissed(true)}
          className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-full bg-white/8 text-white/60 transition hover:bg-white/12 hover:text-white"
        >
          <X className="h-5 w-5" />
        </button>
      </div>
    </div>
  );
};

export default InstallAppBanner;
