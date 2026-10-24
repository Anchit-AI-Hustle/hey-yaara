/**
 * native-speech.ts - speech in the Android and iOS apps.
 *
 * The app's call screen listens with the browser's SpeechRecognition and, when
 * the server voice is unavailable, speaks with speechSynthesis. Android's
 * WebView has neither, so in the native apps these use the phone's own
 * recognizer and voice through Capacitor plugins instead. NativeRecognition
 * has the same shape as the browser object, so the conversation code drives
 * both the same way.
 */

import { Capacitor, type PluginListenerHandle } from "@capacitor/core";
import { SpeechRecognition } from "@capgo/capacitor-speech-recognition";
import { TextToSpeech } from "@capacitor-community/text-to-speech";

const isNative = (() => {
  try { return Capacitor.isNativePlatform(); } catch { return false; }
})();
const isAndroid = (() => {
  try { return Capacitor.getPlatform() === "android"; } catch { return false; }
})();

export const hasNativeSpeech = () => isNative;

type ResultEvent = {
  resultIndex: number;
  results: ArrayLike<{ isFinal: boolean; length: number; 0: { transcript: string } }>;
};

const resultEvent = (transcript: string, isFinal: boolean): ResultEvent => ({
  resultIndex: 0,
  results: [{ isFinal, length: 1, 0: { transcript } }],
});

// Native error codes, mapped to the names the browser API uses.
function webErrorName(code: string): string {
  const c = code.toUpperCase();
  if (c.includes("PERMISSION")) return "not-allowed";
  // Before TIMEOUT: NETWORK_TIMEOUT is a network error, not silence.
  if (c.includes("NETWORK") || c.includes("SERVER")) return "network";
  if (c.includes("NO_MATCH") || c.includes("TIMEOUT")) return "no-speech";
  return code.toLowerCase();
}

// One set of plugin listeners for the whole app, routed to the session that
// is listening now (each call makes a new NativeRecognition).
let current: NativeRecognition | null = null;
let listeners: Promise<PluginListenerHandle[]> | null = null;
let permission: Promise<boolean> | null = null;

function attachOnce() {
  if (!listeners) {
    listeners = Promise.all([
      SpeechRecognition.addListener("partialResults", (e) => current?.heard((e.accumulatedText || e.matches?.[0] || "").trim())),
      SpeechRecognition.addListener("error", (e) => current?.failed(e.code || "", e.sessionId)),
      SpeechRecognition.addListener("listeningState", (e) => {
        if (e.state === "startingListening" || e.state === "started") current?.began(e.sessionId);
        if (e.status === "stopped" || e.state === "stopped") current?.stopped(e.sessionId);
      }),
    ]);
  }
  return listeners;
}

function ensurePermission(): Promise<boolean> {
  if (!permission) {
    permission = (async () => {
      const now = await SpeechRecognition.checkPermissions();
      if (now.speechRecognition === "granted") return true;
      const asked = await SpeechRecognition.requestPermissions();
      return asked.speechRecognition === "granted";
    })().catch(() => false);
    // A refusal is asked again on the next call, not remembered forever.
    void permission.then((ok) => { if (!ok) permission = null; });
  }
  return permission;
}

// When the phone never reports that a stopped session ended, end it anyway.
const STOP_TIMEOUT_MS = 2500;
// A start the phone keeps refusing is given up after this many tries in a row.
const MAX_START_FAILURES = 3;
let startFailures = 0;

// Refusals that no retry will change: shown to the person, like the browser's.
function finalStartError(message: string): string | null {
  if (/permission|denied/i.test(message)) return "not-allowed";
  if (/unsupported locale|unavailable|not available|not supported/i.test(message)) return "service-not-allowed";
  return null;
}

/** One recognition session at a time, like the browser object. */
export class NativeRecognition {
  continuous = true;
  interimResults = true;
  lang = "en-IN";
  onresult: ((event: ResultEvent) => void) | null = null;
  onerror: ((event: { error?: string }) => void) | null = null;
  onend: (() => void) | null = null;
  onspeechend: (() => void) | null = null;

  private active = false; // from start() until onend
  private running = false; // the phone's recognizer was started for this session
  private stopRequested = false;
  private aborted = false;
  private pendingStart = false;
  private lastText = "";
  private nativeSession: number | undefined; // the phone's id for this session
  private stopTimer: ReturnType<typeof setTimeout> | null = null;

  // Events from an earlier phone session (one ended here by the stop timeout)
  // must not end or disturb this one.
  private mine(sessionId?: number) {
    return sessionId === undefined || this.nativeSession === undefined || sessionId === this.nativeSession;
  }

  began(sessionId?: number) {
    if (this.running && this.nativeSession === undefined) this.nativeSession = sessionId;
  }

  heard(text: string) {
    if (!this.running || this.aborted || !text || text === this.lastText) return;
    this.lastText = text;
    this.onresult?.(resultEvent(text, false));
  }

  failed(code: string, sessionId?: number) {
    if (!this.running || this.aborted || !this.mine(sessionId)) return;
    this.onerror?.({ error: webErrorName(code) });
  }

  stopped(sessionId?: number) {
    if (this.running && this.mine(sessionId)) this.finish();
  }

  // The session ended (silence, results, stop or an error): the last words
  // become final unless it was aborted, then onend lets the caller restart.
  private finish() {
    if (this.stopTimer) { clearTimeout(this.stopTimer); this.stopTimer = null; }
    if (!this.active) return;
    this.active = false;
    this.running = false;
    this.nativeSession = undefined;
    const text = this.lastText;
    this.lastText = "";
    if (text && !this.aborted) {
      this.onresult?.(resultEvent(text, true));
      this.onspeechend?.();
    }
    this.onend?.();
    if (this.pendingStart) { this.pendingStart = false; this.start(); }
  }

  start() {
    if (this.active) {
      // Still tearing down the last session: start again once it has ended.
      if (this.stopRequested) { this.pendingStart = true; return; }
      throw new Error("recognition already started");
    }
    // eslint-disable-next-line @typescript-eslint/no-this-alias -- the app-wide listeners follow the call listening now
    current = this;
    this.active = true;
    this.running = false;
    this.stopRequested = false;
    this.aborted = false;
    this.lastText = "";
    this.nativeSession = undefined;
    void (async () => {
      await attachOnce();
      const ok = await ensurePermission();
      // Android: is there a recognizer at all. (iOS checks the phone's own
      // language, not ours; there start() reports a real problem itself.)
      const { available } = ok && isAndroid ? await SpeechRecognition.available().catch(() => ({ available: false })) : { available: ok };
      if (!ok || !available) {
        // Like the browser: an error and no restart, so the call shows it.
        this.active = false;
        this.onerror?.({ error: ok ? "service-not-allowed" : "not-allowed" });
        return;
      }
      // Stopped while the permission prompt was open: nothing ever ran.
      if (this.stopRequested) { this.finish(); return; }
      this.running = true;
      try {
        // Android restarts listening after every pause; without muting, each
        // restart beeps.
        await SpeechRecognition.start({ language: this.lang, partialResults: true, popup: false, maxResults: 1, muteRecognizerBeep: true });
        startFailures = 0; // only a start that succeeded resets the count
      } catch (e) {
        if (!this.running) return;
        const message = (e as Error)?.message || "";
        const final = finalStartError(message) || (++startFailures >= MAX_START_FAILURES ? "service-not-allowed" : null);
        if (final) {
          // No onend: the call shows the error instead of trying again.
          startFailures = 0;
          this.active = false;
          this.running = false;
          this.nativeSession = undefined;
          this.onerror?.({ error: final });
          return;
        }
        this.onerror?.({ error: "network" });
        this.finish();
      }
    })();
  }

  stop() {
    this.pendingStart = false;
    if (!this.active || this.stopRequested) return;
    this.stopRequested = true;
    // Before the recognizer runs, start() ends the session itself.
    if (!this.running) return;
    void SpeechRecognition.stop().catch(() => this.finish());
    this.stopTimer = setTimeout(() => this.finish(), STOP_TIMEOUT_MS);
  }

  abort() {
    if (this.active) this.aborted = true;
    this.stop();
  }
}

/** Speaks with the phone's own voice; resolves when it has finished. */
export async function speakNative(text: string, opts: { lang: string; rate: number; pitch: number }) {
  await TextToSpeech.speak({ text, lang: opts.lang, rate: opts.rate, pitch: opts.pitch, volume: 1, category: "playback" });
}

export function stopNativeSpeech() {
  if (!isNative) return;
  void TextToSpeech.stop().catch(() => { /* nothing playing */ });
}
