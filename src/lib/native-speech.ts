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
  if (c.includes("NO_MATCH") || c.includes("SPEECH_TIMEOUT") || c.includes("TIMEOUT")) return "no-speech";
  if (c.includes("NETWORK") || c.includes("SERVER")) return "network";
  return code.toLowerCase();
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

  private active = false;
  private aborted = false;
  private pendingStart = false;
  private lastText = "";
  private listeners: Promise<PluginListenerHandle[]> | null = null;
  private permission: Promise<boolean> | null = null;

  private attach() {
    if (!this.listeners) {
      this.listeners = Promise.all([
        SpeechRecognition.addListener("partialResults", (e) => {
          if (!this.active || this.aborted) return;
          const text = (e.accumulatedText || e.matches?.[0] || "").trim();
          if (!text || text === this.lastText) return;
          this.lastText = text;
          this.onresult?.(resultEvent(text, false));
        }),
        SpeechRecognition.addListener("error", (e) => {
          if (!this.active || this.aborted) return;
          this.onerror?.({ error: webErrorName(e.code || "") });
        }),
        SpeechRecognition.addListener("listeningState", (e) => {
          if (e.status === "stopped" || e.state === "stopped") this.finish();
        }),
      ]);
    }
    return this.listeners;
  }

  private ensurePermission(): Promise<boolean> {
    if (!this.permission) {
      this.permission = (async () => {
        const now = await SpeechRecognition.checkPermissions();
        if (now.speechRecognition === "granted") return true;
        const asked = await SpeechRecognition.requestPermissions();
        return asked.speechRecognition === "granted";
      })().catch(() => false);
      // A refusal is asked again on the next call, not remembered forever.
      void this.permission.then((ok) => { if (!ok) this.permission = null; });
    }
    return this.permission;
  }

  // The session ended (silence, results, stop or an error): the last words
  // become final unless it was aborted, then onend lets the caller restart.
  private finish() {
    if (!this.active) {
      if (this.pendingStart) { this.pendingStart = false; this.start(); }
      return;
    }
    this.active = false;
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
      // Still tearing down the last session: start again once it has stopped.
      if (this.aborted) { this.pendingStart = true; return; }
      throw new Error("recognition already started");
    }
    this.active = true;
    this.aborted = false;
    this.lastText = "";
    void (async () => {
      await this.attach();
      if (!(await this.ensurePermission())) {
        this.active = false;
        this.onerror?.({ error: "not-allowed" });
        return;
      }
      if (!this.active || this.aborted) return;
      try {
        await SpeechRecognition.start({ language: this.lang, partialResults: true, popup: false, maxResults: 1 });
      } catch (e) {
        if (!this.active) return;
        this.active = false;
        const message = (e as Error)?.message || "";
        this.onerror?.({ error: /permission/i.test(message) ? "not-allowed" : "network" });
        this.onend?.();
      }
    })();
  }

  stop() {
    if (!this.active) return;
    void SpeechRecognition.stop().catch(() => this.finish());
  }

  abort() {
    if (!this.active) return;
    this.aborted = true;
    void SpeechRecognition.stop().catch(() => this.finish());
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
