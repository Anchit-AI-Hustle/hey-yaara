/**
 * install-prompt.ts - the browser's "install this app" offer on computers
 * (Chrome and Edge on Mac and Windows) and Android Chrome.
 *
 * Browsers fire `beforeinstallprompt` once, early, often before /get has
 * mounted, so main.tsx starts listening at load and keeps the event here for
 * whichever page asks for it.
 */

export type InstallPromptEvent = Event & {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed"; platform: string }>;
};

let deferred: InstallPromptEvent | null = null;
let installed = false;
const listeners = new Set<() => void>();
const notify = () => listeners.forEach((fn) => fn());

export function listenForInstallPrompt(target: Window = window) {
  target.addEventListener("beforeinstallprompt", (event) => {
    event.preventDefault(); // offer it from our own button instead of the mini-infobar
    deferred = event as InstallPromptEvent;
    notify();
  });
  target.addEventListener("appinstalled", () => {
    installed = true;
    deferred = null;
    notify();
  });
}

export const canPromptInstall = () => deferred !== null;
export const wasInstalledNow = () => installed;

export function onInstallPromptChange(fn: () => void) {
  listeners.add(fn);
  return () => void listeners.delete(fn);
}

/** Shows the browser's install dialog. True when the person installed. */
export async function promptInstall(): Promise<boolean> {
  const event = deferred;
  if (!event) return false;
  deferred = null; // a prompt can be shown only once
  notify();
  await event.prompt();
  const choice = await event.userChoice.catch(() => null);
  return choice?.outcome === "accepted";
}

/** Opened from the Home Screen, Dock or Start menu rather than a browser tab. */
export const isInstalledApp = () =>
  typeof window !== "undefined" &&
  (window.matchMedia?.("(display-mode: standalone)").matches ||
    (window.navigator as Navigator & { standalone?: boolean }).standalone === true);
