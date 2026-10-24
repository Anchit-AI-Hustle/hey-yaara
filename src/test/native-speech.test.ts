import { beforeEach, describe, expect, it, vi } from "vitest";

// The phone's recognizer, faked: tests fire its events by hand.
const plugin = vi.hoisted(() => {
  const handlers: Record<string, (e: unknown) => void> = {};
  return {
    handlers,
    permission: "granted" as "granted" | "denied" | "prompt",
    fire: (name: string, e: unknown) => handlers[name]?.(e),
    api: {
      addListener: async (name: string, fn: (e: unknown) => void) => { handlers[name] = fn; return { remove: async () => {} }; },
      checkPermissions: vi.fn(async () => ({ speechRecognition: plugin.permission })),
      requestPermissions: vi.fn(async () => ({ speechRecognition: plugin.permission })),
      start: vi.fn(async () => ({})),
      stop: vi.fn(async () => {}),
    },
  };
});

vi.mock("@capacitor/core", () => ({ Capacitor: { isNativePlatform: () => true } }));
vi.mock("@capgo/capacitor-speech-recognition", () => ({ SpeechRecognition: plugin.api }));
vi.mock("@capacitor-community/text-to-speech", () => ({ TextToSpeech: { speak: vi.fn(async () => {}), stop: vi.fn(async () => {}) } }));

import { NativeRecognition, hasNativeSpeech } from "@/lib/native-speech";

type Result = { resultIndex: number; results: ArrayLike<{ isFinal: boolean; 0: { transcript: string } }> };
const flush = () => new Promise((r) => setTimeout(r, 0));

function listen() {
  const rec = new NativeRecognition();
  const got: { text: string; final: boolean }[] = [];
  const events: string[] = [];
  rec.onresult = (e: Result) => { const r = e.results[0]; got.push({ text: r[0].transcript, final: r.isFinal }); };
  rec.onerror = (e) => events.push(`error:${e.error}`);
  rec.onend = () => events.push("end");
  rec.onspeechend = () => events.push("speechend");
  return { rec, got, events };
}

describe("speech in the native apps", () => {
  beforeEach(() => {
    plugin.permission = "granted";
    vi.clearAllMocks();
  });

  it("is used in the apps", () => {
    expect(hasNativeSpeech()).toBe(true);
  });

  it("streams words as they come, makes the last ones final when the phone stops, then ends", async () => {
    const { rec, got, events } = listen();
    rec.lang = "en-IN";
    rec.start();
    await flush();
    expect(plugin.api.start).toHaveBeenCalledWith(expect.objectContaining({ language: "en-IN", partialResults: true, popup: false }));

    plugin.fire("partialResults", { matches: ["namaste"] });
    plugin.fire("partialResults", { matches: ["namaste yaara"] });
    plugin.fire("partialResults", { matches: ["namaste yaara"] }); // repeats are dropped
    plugin.fire("listeningState", { state: "stopped", status: "stopped", reason: "silence" });

    expect(got).toEqual([
      { text: "namaste", final: false },
      { text: "namaste yaara", final: false },
      { text: "namaste yaara", final: true },
    ]);
    expect(events).toEqual(["speechend", "end"]);
  });

  it("an abort (Yaara is about to speak) drops the half-heard words", async () => {
    const { rec, got, events } = listen();
    rec.start();
    await flush();
    plugin.fire("partialResults", { matches: ["haan"] });
    rec.abort();
    expect(plugin.api.stop).toHaveBeenCalled();
    plugin.fire("listeningState", { status: "stopped" });
    expect(got).toEqual([{ text: "haan", final: false }]);
    expect(events).toEqual(["end"]);
  });

  it("a start while the last session is still stopping waits for it, then listens again", async () => {
    const { rec } = listen();
    rec.start();
    await flush();
    rec.abort();
    rec.start(); // the conversation restarts listening right after Yaara speaks
    expect(plugin.api.start).toHaveBeenCalledTimes(1);
    plugin.fire("listeningState", { status: "stopped" });
    await flush();
    expect(plugin.api.start).toHaveBeenCalledTimes(2);
  });

  it("a second start while listening says so, as the browser does", async () => {
    const { rec } = listen();
    rec.start();
    expect(() => rec.start()).toThrow(/already started/);
  });

  it("no microphone permission is reported as not-allowed, and nothing starts", async () => {
    plugin.permission = "denied";
    const { rec, events } = listen();
    rec.start();
    await flush();
    await flush();
    expect(plugin.api.requestPermissions).toHaveBeenCalled();
    expect(plugin.api.start).not.toHaveBeenCalled();
    expect(events).toEqual(["error:not-allowed"]);
  });

  it("silence and network errors get the browser's names", async () => {
    const { rec, events } = listen();
    rec.start();
    await flush();
    plugin.fire("error", { code: "ERROR_NO_MATCH", message: "No match", sessionId: 1 });
    plugin.fire("error", { code: "ERROR_NETWORK", message: "Network", sessionId: 1 });
    plugin.fire("error", { code: "ERROR_INSUFFICIENT_PERMISSIONS", message: "Perm", sessionId: 1 });
    expect(events).toEqual(["error:no-speech", "error:network", "error:not-allowed"]);
  });
});
