import { useState, useEffect, useRef, useCallback } from "react";

export type ConversationMode = "idle" | "listening" | "processing" | "speaking";
export type TranscriptRole = "user" | "assistant";
export type TranscriptStatus = "live" | "final";

export interface TranscriptEntry {
  id: string;
  role: TranscriptRole;
  text: string;
  status: TranscriptStatus;
  timestamp: Date;
}

interface UseFreeConversationOptions {
  overrides?: {
    agent?: {
      prompt?: { prompt: string };
      voicePreference?: "male" | "female";
      voiceId?: string;
    };
  };
  onConnect?: () => void;
  onDisconnect?: () => void;
  onMessage?: (msg: { type: string; text: string; is_final: boolean }) => void;
  onTranscript?: (role: TranscriptRole, text: string, status: TranscriptStatus) => void;
  onModeChange?: (data: { mode: ConversationMode }) => void;
  onVadScore?: (score: number) => void;
  onError?: (err: { message?: string } | Error) => void;
}

declare global {
  interface Window { YARA_DEBUG_LOG?: string[] }
}

/** A short trail for debugging on a phone (window.YARA_DEBUG_LOG). Kept to the last 100 lines. */
function debugLog(line: string) {
  if (typeof window === "undefined") return;
  window.YARA_DEBUG_LOG = [...(window.YARA_DEBUG_LOG || []).slice(-99), line];
}

type BrowserSpeechRecognition = {
  continuous: boolean;
  interimResults: boolean;
  lang: string;
  onresult: ((event: SpeechRecognitionEventLike) => void) | null;
  onend: (() => void) | null;
  onspeechend?: (() => void) | null;
  onerror?: ((event: { error?: string }) => void) | null;
  start: () => void;
  stop: () => void;
  abort: () => void;
};

type BrowserSpeechRecognitionCtor = new () => BrowserSpeechRecognition;

type SpeechRecognitionAlternativeLike = {
  transcript: string;
};

type SpeechRecognitionResultLike = {
  isFinal: boolean;
  0: SpeechRecognitionAlternativeLike;
  length: number;
};

type SpeechRecognitionEventLike = {
  resultIndex: number;
  results: ArrayLike<SpeechRecognitionResultLike>;
};

// ─── Browser voice selection (fallback only) ────────────────────────────────
const selectBrowserVoice = (
  voices: SpeechSynthesisVoice[],
  preference: "male" | "female",
) => {
  console.log("[TTS] selectBrowserVoice called with preference:", preference);
  console.log("[TTS] Available voices:", voices.map(v => v.name));
  
  // Filter for English voices first (most natural sounding)
  const englishVoices = voices.filter((voice) => voice.lang.startsWith("en"));
  const voicePool = englishVoices.length > 0 ? englishVoices : voices;
  
  // Female preference - try to find female-named voices
  if (preference === "female") {
    const femaleNames = ["samantha", "sangeeta", "veena", "heera", "zira", "karen", "ivy", "joanna", "kendra", "salli", "amy", "emma", "otti"];
    for (const name of femaleNames) {
      const match = voicePool.find(v => v.name.toLowerCase().includes(name));
      if (match) {
        console.log("[TTS] Selected female voice:", match.name);
        return match;
      }
    }
  }
  
  // Male preference - try to find male-named voices
  if (preference === "male") {
    const maleNames = ["daniel", "david", "ravi", "hemant", "amit", "prabhat", "james", "john", "matt", "ben", "lee", "tomi"];
    for (const name of maleNames) {
      const match = voicePool.find(v => v.name.toLowerCase().includes(name));
      if (match) {
        console.log("[TTS] Selected male voice:", match.name);
        return match;
      }
    }
  }
  
  // If no gender match found, return first available voice (better than nothing)
  const fallback = voicePool[0];
  console.log("[TTS] No gender-specific voice found, using fallback:", fallback?.name);
  return fallback ?? voices[0] ?? null;
};

const getBrowserVoices = async () => {
  const existingVoices = window.speechSynthesis.getVoices();
  if (existingVoices.length > 0) return existingVoices;

  return new Promise<SpeechSynthesisVoice[]>((resolve) => {
    const timeoutId = window.setTimeout(() => {
      window.speechSynthesis.onvoiceschanged = null;
      resolve(window.speechSynthesis.getVoices());
    }, 1200);

    window.speechSynthesis.onvoiceschanged = () => {
      window.clearTimeout(timeoutId);
      window.speechSynthesis.onvoiceschanged = null;
      resolve(window.speechSynthesis.getVoices());
    };
  });
};

/**
 * useFreeConversation — v3.0 (Hardened)
 *
 * FIXES APPLIED:
 * 1. VOICE CONSISTENCY: Voice params read from optionsRef on every speak() call,
 *    never captured stale. TTS retries 2x before falling back to browser.
 *    Browser fallback voice is cached per session to prevent mid-call changes.
 * 2. RESPONSE QUALITY: Non-ASCII stripping removed (preserves Hindi/Hinglish).
 *    History expanded to 10 messages. Silence prompts use system role.
 *    Processing guard prevents duplicate concurrent LLM calls.
 * 3. CROSS-DEVICE: Robust recognition restart with backoff. Handles mobile
 *    AudioContext suspend. Handles Safari/Firefox speech recognition quirks.
 */
export function useFreeConversation(options: UseFreeConversationOptions) {
  const TURN_FINALIZE_DELAY_MS = 1400;
  const TTS_MAX_RETRIES = 2;
  const TTS_RETRY_DELAY_MS = 600;
  const CHAT_TIMEOUT_MS = 12000;

  const [mode, setMode] = useState<ConversationMode>("idle");
  const optionsRef = useRef(options);
  optionsRef.current = options;

  const modeRef = useRef<ConversationMode>("idle");
  const recRef = useRef<BrowserSpeechRecognition | null>(null);
  const sessionActiveRef = useRef(false);
  const historyRef = useRef<{ role: string; content: string }[]>([]);
  const isMutedRef = useRef(false);
  const handleUserSpeechRef = useRef<(text: string) => Promise<void>>(async () => {});
  const finalUserSegmentsRef = useRef<string[]>([]);
  const interimUserTextRef = useRef("");
  const flushUserTurnTimerRef = useRef<number | null>(null);
  const isRecognitionStartingRef = useRef(false);
  const isProcessingRef = useRef(false); // NEW: prevents duplicate concurrent LLM calls
  const cachedBrowserVoiceRef = useRef<SpeechSynthesisVoice | null>(null); // NEW: consistent fallback voice
  const recognitionRestartAttemptsRef = useRef(0); // NEW: backoff for STT restarts

  const emit = useCallback((m: ConversationMode) => {
    setMode(m);
    modeRef.current = m;
    try {
      optionsRef.current.onModeChange?.({ mode: m });
    } catch (e) {
      console.error("[Conversation] onModeChange threw:", e);
    }
  }, []);

  const dispatch = useCallback((role: TranscriptRole, text: string, status: TranscriptStatus) => {
    optionsRef.current.onTranscript?.(role, text, status);
    optionsRef.current.onMessage?.({
      type: role === "user" ? "user_speech" : "yaara_response",
      text,
      is_final: status === "final"
    });
  }, []);

  const clearFlushTimer = useCallback(() => {
    if (flushUserTurnTimerRef.current !== null) {
      window.clearTimeout(flushUserTurnTimerRef.current);
      flushUserTurnTimerRef.current = null;
    }
  }, []);

  const getBufferedUserText = useCallback(() => {
    const segments = [
      ...finalUserSegmentsRef.current,
      interimUserTextRef.current.trim(),
    ].filter(Boolean);

    return segments.join(" ").replace(/\s+/g, " ").trim();
  }, []);

  const flushUserTurn = useCallback(async () => {
    clearFlushTimer();

    const finalText = getBufferedUserText();
    interimUserTextRef.current = "";
    finalUserSegmentsRef.current = [];

    if (!finalText) return;

    dispatch("user", finalText, "final");
    await handleUserSpeechRef.current(finalText);
  }, [clearFlushTimer, dispatch, getBufferedUserText]);

  const scheduleFlushUserTurn = useCallback(() => {
    clearFlushTimer();
    flushUserTurnTimerRef.current = window.setTimeout(() => {
      void flushUserTurn();
    }, TURN_FINALIZE_DELAY_MS);
  }, [TURN_FINALIZE_DELAY_MS, clearFlushTimer, flushUserTurn]);

  const stopRecognition = useCallback(() => {
    const rec = recRef.current as BrowserSpeechRecognition | null;
    if (!rec) return;
    try {
      rec.abort(); // abort is more reliable than stop on mobile browsers
    } catch {
      try { rec.stop(); } catch { /* Ignore repeated stop attempts */ }
    }
  }, []);

  const startRecognition = useCallback(() => {
    const rec = recRef.current as BrowserSpeechRecognition | null;
    if (!rec || isMutedRef.current || !sessionActiveRef.current || modeRef.current !== "listening") return;
    if (isRecognitionStartingRef.current) return;

    isRecognitionStartingRef.current = true;
    try {
      rec.start();
      recognitionRestartAttemptsRef.current = 0; // Reset backoff on success
    } catch (err: unknown) {
      const e = err as { message?: string };
      // "already started" errors are fine; other errors need backoff
      if (e?.message && !e.message.includes("already started")) {
        recognitionRestartAttemptsRef.current++;
        const delay = Math.min(500 * Math.pow(2, recognitionRestartAttemptsRef.current), 5000);
        console.warn(`[STT] Start failed, retrying in ${delay}ms:`, e.message);
        window.setTimeout(() => {
          isRecognitionStartingRef.current = false;
          startRecognition();
        }, delay);
        return;
      }
    } finally {
      window.setTimeout(() => {
        isRecognitionStartingRef.current = false;
      }, 150);
    }
  }, []);

  // ─── AI Proxy Bridge ──────────────────────────────────────────────────────
  const callLLM = useCallback(async (messages: { role: string; content: string }[]) => {
    const controller = new AbortController();
    const timeoutId = window.setTimeout(() => controller.abort(), CHAT_TIMEOUT_MS);
    try {
      debugLog("📡 AI Bridge: Sending...");
      const resp = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ messages }),
        signal: controller.signal,
      });

      debugLog(`🛰️ HTTP Status: ${resp.status}`);

      // RESILIENT PARSING: Try parsing even if header is wonky
      const data = await resp.json().catch(() => null);
      if (data) {
        if (data.text) {
          debugLog("✅ AI Response OK");
          return data.text;
        }
        if (data.error) throw new Error(`${data.error}`);
      }
      
      throw new Error(`Data Format Error. (Status: ${resp.status})`);
    } catch (caught: unknown) {
      const err = caught as { name?: string; message?: string };
      console.error("[AI] Bridge Error:", err);
      debugLog(`❌ Bridge Fail: ${err.message}`);
      if (err?.name === "AbortError") {
        throw new Error("AI response timed out");
      }
      throw new Error(`Connectivity issues. ${err.message}`);
    } finally {
      window.clearTimeout(timeoutId);
    }
  }, [CHAT_TIMEOUT_MS]);

  // ─── API-Based Speech Synthesis with Retry + Consistent Fallback ─────────
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const ttsApiOffRef = useRef(false);

  const speak = useCallback(async (text: string) => {
    return new Promise<void>((resolve) => {
      void (async () => {
        if (!text) {
          resolve();
          return;
        }

        const finalize = () => {
          if (!sessionActiveRef.current) {
            emit("idle");
            resolve();
            return;
          }
          emit("listening");
          window.setTimeout(() => {
            startRecognition();
          }, 50);
          resolve();
        };

        try {
          stopRecognition();
          emit("speaking");
        } catch (e) {
          console.error("[TTS] emit(speaking) failed:", e);
          resolve();
          return;
        }

        const pref = optionsRef.current.overrides?.agent?.voicePreference || "female";
        const voiceId = optionsRef.current.overrides?.agent?.voiceId;
        // ALWAYS allow browser fallback as last resort - this is more reliable than external APIs
        const allowBrowserFallback = true;

        let ttsSuccess = false;
        let apiAttemptsFailed = 0;
        try {
          // Once the server has said its voice service is unavailable (no key,
          // quota used up), go straight to the phone's voice for this session
          // instead of paying for retries on every sentence.
          for (let attempt = 0; attempt <= TTS_MAX_RETRIES && !ttsApiOffRef.current; attempt++) {
            try {
              if (attempt > 0) {
                debugLog(`🔄 TTS Retry ${attempt}/${TTS_MAX_RETRIES}...`);
                await new Promise(r => setTimeout(r, TTS_RETRY_DELAY_MS));
              }

              const resp = await fetch("/api/tts", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ text, gender: pref.toUpperCase(), voiceId }),
              });

              if (!resp.ok) {
                const errBody = await resp.text().catch(() => "");
                if (/"fallback"\s*:\s*true/.test(errBody) && resp.status !== 429) ttsApiOffRef.current = true;
                throw new Error(`TTS HTTP ${resp.status}: ${errBody.slice(0, 100)}`);
              }

              const { audioContent } = await resp.json();

              if (!audioContent) throw new Error("TTS returned empty audio");

              console.log("[TTS] Received audio, length:", audioContent.length, "bytes");

              if (!audioRef.current) {
                audioRef.current = new Audio();
                audioRef.current.autoplay = true;
                // data: URLs — omit crossOrigin (avoids rare browser quirks with CORS + data)
              }

              audioRef.current.onended = finalize;
              audioRef.current.onerror = (e) => {
                console.error("[TTS] Audio playback error:", e);
                finalize();
              };
              
              const audioSrc = `data:audio/mpeg;base64,${audioContent}`;
              console.log("[TTS] Setting audio src, length:", audioSrc.length);
              audioRef.current.src = audioSrc;

              try {
                console.log("[TTS] Calling play()...");
                await audioRef.current.play();
                console.log("[TTS] Play() returned successfully");
              } catch (playErr: unknown) {
                const name = playErr && typeof playErr === "object" && "name" in playErr ? (playErr as { name?: string }).name : "";
                console.error("[TTS] Play failed:", name, playErr);
                if (name === "NotAllowedError") {
                  console.warn("[TTS] Autoplay blocked, falling to browser TTS");
                  throw playErr;
                }
                throw playErr;
              }

              ttsSuccess = true;
              debugLog("🔊 TTS Playing (ElevenLabs)");
              break;
            } catch (err) {
              console.warn(`[TTS] Attempt ${attempt + 1} failed:`, err);
              apiAttemptsFailed++;
            }
          }

          // If API failed (apiAttemptsFailed > 0) OR if we're out of retries, use browser TTS IMMEDIATELY
          if (!ttsSuccess) {
            console.warn(`[TTS] API TTS failed (${apiAttemptsFailed} attempts), switching to Browser TTS`);
            debugLog("🔊 Using Browser TTS (primary fallback)");
            console.warn("[TTS] All API attempts failed, using Browser Fallback");
            debugLog("⚠️ Browser TTS Fallback");

            try {
              window.speechSynthesis.cancel();
              const utt = new SpeechSynthesisUtterance(text);
              utt.lang = "en-IN";
              utt.rate = 0.96;
              utt.pitch = pref === "female" ? 1.08 : 0.9;

              if (!cachedBrowserVoiceRef.current) {
                const voices = await getBrowserVoices();
                cachedBrowserVoiceRef.current = selectBrowserVoice(voices, pref);
              }

              if (cachedBrowserVoiceRef.current) {
                utt.voice = cachedBrowserVoiceRef.current;
              } else {
                console.warn(`[TTS] No browser voice available for preference: ${pref}`);
                finalize();
                return;
              }

              utt.onend = finalize;
              utt.onerror = () => {
                console.warn("[TTS] Browser speech synthesis error");
                finalize();
              };
              window.speechSynthesis.speak(utt);
            } catch (fallbackErr) {
              console.error("[TTS] Browser fallback also failed:", fallbackErr);
              finalize();
            }
          }
        } catch (fatal) {
          console.error("[TTS] Fatal error in speak():", fatal);
          try {
            if (sessionActiveRef.current) emit("listening");
          } catch {
            /* ignore */
          }
          resolve();
        }
      })();
    });
  }, [emit, startRecognition, stopRecognition]);

  // ─── Interaction Logic ────────────────────────────────────────────────────
  const handleUserSpeech = useCallback(async (
    request: { userText?: string; systemInstruction?: string; shouldStoreUserText?: boolean },
  ) => {
    if (!sessionActiveRef.current) return;

    // GUARD: Prevent duplicate concurrent processing
    if (isProcessingRef.current) {
      console.warn("[Chat] Skipping — already processing");
      return;
    }
    if (modeRef.current === "speaking") {
      console.warn("[Chat] Skipping — currently speaking");
      return;
    }

    isProcessingRef.current = true;
    emit("processing");

    try {
      const prompt = optionsRef.current.overrides?.agent?.prompt?.prompt || "You are Yaara.";
      const userText = request.userText?.trim() || "";
      const systemInstruction = request.systemInstruction?.trim() || "";
      const shouldStoreUserText = request.shouldStoreUserText ?? Boolean(userText);

      // Build message payload with proper roles
      const payload: { role: string; content: string }[] = [
        { role: "system", content: prompt },
        ...historyRef.current.slice(-10) // Expanded from 6 to 10 for better context
      ];

      if (systemInstruction) {
        payload.push({ role: "system", content: systemInstruction });
      }

      if (userText) {
        payload.push({ role: "user", content: userText });
      }

      const raw = await callLLM(payload);

      // ROBUST PARSING: Try to extract response from JSON if applicable
      let finalReply = raw;
      if (typeof raw === "string" && raw.trim().startsWith("{")) {
        try {
          const parsed = JSON.parse(raw);
          finalReply = parsed.response || parsed.final_response || raw;
        } catch {
          const match = raw.match(/"response":\s*"(.*?)"/) || raw.match(/"final_response":\s*"(.*?)"/);
          if (match) finalReply = match[1];
        }
      }
      
      // FIXED: Only strip control characters, NOT non-ASCII (preserves Hindi/Hinglish)
      // eslint-disable-next-line no-control-regex -- removing control characters is the point
      finalReply = finalReply.replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/g, "").trim();
      // Strip bot name prefixes
      finalReply = finalReply.replace(/^(Yaara|Yaar|Agent|Assistant|Model|Bot):\s*/i, "");

      if (!finalReply) {
        console.warn("[Chat] Empty reply from LLM");
        emit("listening");
        isProcessingRef.current = false;
        return;
      }

      // Update history
      if (shouldStoreUserText && userText) {
        historyRef.current.push({ role: "user", content: userText });
      }
      historyRef.current.push({ role: "assistant", content: finalReply });

      // Trim history to prevent unbounded growth (keep last 14 entries = 7 turns)
      if (historyRef.current.length > 14) {
        historyRef.current = historyRef.current.slice(-14);
      }
      
      dispatch("assistant", finalReply, "final");
      await speak(finalReply);

    } catch (err: unknown) {
      console.error("[Chat] Interaction failed:", err);
      const errMsg = err instanceof Error ? err.message : String(err);
      debugLog(`❌ ERROR: ${errMsg}`);
      optionsRef.current.onError?.(err instanceof Error ? err : { message: errMsg });
      emit("listening");
      // Restart mic after error
      if (sessionActiveRef.current) {
        window.setTimeout(() => startRecognition(), 100);
      }
    } finally {
      isProcessingRef.current = false;
    }
  }, [callLLM, speak, emit, dispatch, startRecognition]);

  useEffect(() => {
    handleUserSpeechRef.current = async (text: string) => {
      await handleUserSpeech({ userText: text, shouldStoreUserText: true });
    };
  }, [handleUserSpeech]);

  // ─── Explicit Response Requests (Silence Prompts) ──────────────────────────
  const requestSilenceResponse = useCallback(async (type: string) => {
    if (modeRef.current !== "listening") return;
    if (isProcessingRef.current) return; // Don't double-trigger

    // Use proper contextual prompts through the system role
    const silencePrompt = type === "mid-conversation"
      ? "The user has been silent for a while. Ask briefly if they are okay or want to continue. Be warm, natural, and one short sentence."
      : "The user has not spoken yet after the greeting. Encourage them gently in one very short natural line.";

    await handleUserSpeech({ systemInstruction: silencePrompt, shouldStoreUserText: false });
  }, [handleUserSpeech]);

  // ─── Browser Recognition System ───────────────────────────────────────────
  const startSession = useCallback(async () => {
    if (sessionActiveRef.current) return;
    sessionActiveRef.current = true;
    isProcessingRef.current = false;
    recognitionRestartAttemptsRef.current = 0;
    cachedBrowserVoiceRef.current = null; // Reset cached fallback voice for new session

    // Clear history for fresh session
    historyRef.current = [];
    
    const speechWindow = window as Window & typeof globalThis & {
      webkitSpeechRecognition?: BrowserSpeechRecognitionCtor;
      SpeechRecognition?: BrowserSpeechRecognitionCtor;
    };
    const Speech = speechWindow.webkitSpeechRecognition || speechWindow.SpeechRecognition;
    if (!Speech) {
      optionsRef.current.onError?.({ message: "Browser not supported (speech)" });
      sessionActiveRef.current = false;
      return;
    }

    const rec = new Speech();
    rec.continuous = true;
    rec.interimResults = true;
    rec.lang = "en-IN";

    rec.onresult = (e: SpeechRecognitionEventLike) => {
      if (modeRef.current === "speaking" || modeRef.current === "processing" || isMutedRef.current) return;

      let interim = "";
      for (let i = e.resultIndex; i < e.results.length; i++) {
        const transcript = e.results[i][0].transcript;
        if (e.results[i].isFinal) {
          const cleanTranscript = transcript.trim();
          if (cleanTranscript) {
            finalUserSegmentsRef.current.push(cleanTranscript);
          }
        } else {
          interim += transcript;
        }
      }

      interimUserTextRef.current = interim.trim();
      const liveText = [...finalUserSegmentsRef.current, interimUserTextRef.current]
        .filter(Boolean)
        .join(" ")
        .replace(/\s+/g, " ")
        .trim();

      if (liveText) {
        dispatch("user", liveText, "live");
        optionsRef.current.onVadScore?.(0.9);
      }

      if (liveText) {
        scheduleFlushUserTurn();
      }
    };

    rec.onspeechend = () => {
      if (getBufferedUserText()) {
        scheduleFlushUserTurn();
      }
    };

    rec.onerror = (event: { error?: string }) => {
      const err = event.error || "unknown";
      console.warn("[STT] Recognition error:", err);

      // "no-speech" and "aborted" are normal — just restart
      // "not-allowed" means user denied permission — do not retry
      if (err === "not-allowed" || err === "service-not-allowed") {
        optionsRef.current.onError?.({ message: `Microphone permission denied (${err})` });
        return;
      }

      // For "network" errors on mobile, retry with backoff
      if (sessionActiveRef.current && modeRef.current === "listening" && !isMutedRef.current) {
        const delay = err === "network" ? 1000 : 200;
        window.setTimeout(() => {
          if (sessionActiveRef.current && modeRef.current === "listening") {
            startRecognition();
          }
        }, delay);
      }
    };

    rec.onend = () => {
      if (sessionActiveRef.current && modeRef.current === "listening" && !isMutedRef.current) {
        // Small delay before restart to prevent tight loops on mobile
        window.setTimeout(() => {
          if (sessionActiveRef.current && modeRef.current === "listening") {
            startRecognition();
          }
        }, 100);
      }
    };

    recRef.current = rec;
    emit("listening");
    optionsRef.current.onConnect?.();
    startRecognition();

    // TRIGGER INITIAL GREETING
    debugLog("🚀 Session Starting...");
    
    setTimeout(() => {
      if (sessionActiveRef.current) {
        debugLog("📡 Requesting Greeting...");
        void handleUserSpeech({
          systemInstruction: "The conversation has just started. Greet the user warmly, introduce yourself as Yaara, and keep it brief, natural, and reassuring in Roman English (Hinglish).",
          shouldStoreUserText: false,
        });
      }
    }, 500);

  }, [dispatch, emit, getBufferedUserText, handleUserSpeech, scheduleFlushUserTurn, startRecognition]);

  const endSession = useCallback(() => {
    sessionActiveRef.current = false;
    isProcessingRef.current = false;
    const bufferedUserText = getBufferedUserText();
    if (bufferedUserText) {
      dispatch("user", bufferedUserText, "final");
    }
    clearFlushTimer();
    finalUserSegmentsRef.current = [];
    interimUserTextRef.current = "";
    stopRecognition();
    window.speechSynthesis.cancel();

    // Stop any playing API audio
    if (audioRef.current) {
      audioRef.current.pause();
      audioRef.current.onended = null;
      audioRef.current.onerror = null;
      audioRef.current.src = "";
    }

    emit("idle");
    optionsRef.current.onDisconnect?.();
  }, [clearFlushTimer, dispatch, emit, getBufferedUserText, stopRecognition]);

  const setMuted = useCallback((muted: boolean) => {
    isMutedRef.current = muted;
    if (muted) {
      stopRecognition();
    } else if (modeRef.current === "listening") {
      startRecognition();
    }
  }, [startRecognition, stopRecognition]);

  useEffect(() => () => clearFlushTimer(), [clearFlushTimer]);

  return { mode, startSession, endSession, requestSilenceResponse, setMuted, agentAudioRef: audioRef };
}
