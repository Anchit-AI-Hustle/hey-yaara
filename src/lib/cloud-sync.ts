/**
 * cloud-sync.ts - calls, transcripts and recordings, through /api/calls.
 *
 * Everything is stored on the server under the signed-in person's own account;
 * the server checks the session on every request, so one person can never see
 * or change another's calls.
 */

import { api, apiFetch, ApiError } from "@/lib/api";
import type { CallRecord, TranscriptLine } from "@/lib/call-storage";

/** Recordings above this are not uploaded (the server's limit is the same). */
export const MAX_AUDIO_BYTES = 4 * 1024 * 1024;

type ServerCall = {
  id: string;
  startTime: string;
  endTime: string | null;
  duration: number;
  status: string;
  transcript: TranscriptLine[];
  hasAudio: boolean;
  updatedAt: string;
};

const toRecord = (c: ServerCall): CallRecord => ({
  id: c.id,
  startTime: c.startTime,
  endTime: c.endTime || c.startTime,
  duration: c.duration,
  status: c.status,
  transcript: c.transcript || [],
  audioBlob: null,
  // The players fetch the recording by call id.
  audioPath: c.hasAudio ? c.id : null,
  updatedAt: c.updatedAt,
});

/** This person's calls, newest first. Throws when the server cannot be reached. */
export const fetchUserCalls = async (): Promise<CallRecord[]> => {
  const r = await api<{ calls: ServerCall[] }>("/api/calls");
  return r.calls.map(toRecord);
};

export const deleteCall = async (callId: string): Promise<boolean> => {
  const r = await api<{ deleted: boolean }>(`/api/calls?id=${encodeURIComponent(callId)}`, { method: "DELETE" });
  return r.deleted;
};

/** A playable URL for a call's recording (an object URL; revoke it when done). */
export const getAudioUrl = async (callId: string): Promise<string | null> => {
  if (!callId) return null;
  try {
    const res = await apiFetch(`/api/calls?id=${encodeURIComponent(callId)}&audio=1`);
    if (!res.ok) return null;
    return URL.createObjectURL(await res.blob());
  } catch {
    return null;
  }
};

// Emoji and control characters are dropped; Hindi and every other script stay.
// (This used to strip everything that was not ASCII, which deleted whole Hindi
// sentences from transcripts.)
const cleanText = (text: string) =>
  text.replace(/\p{Extended_Pictographic}|\u200d|\ufe0f/gu, "").replace(/[\p{Cc}]/gu, " ").replace(/\s+/g, " ").trim();

/** One line said during a call, saved as it happens. Never throws. */
export const saveMessage = async (callId: string, role: "user" | "yaara", text: string): Promise<void> => {
  const clean = cleanText(text || "");
  if (!callId || !clean) return;
  try {
    await api("/api/calls?action=message", { body: { callId, role, text: clean } });
  } catch (err) {
    console.warn("[CloudSync] saveMessage failed:", (err as Error).message);
  }
};

export type EndCallResult = { saved: boolean; audioSaved: boolean; audioTooLarge: boolean; error?: string };

/**
 * At the end of a call: save it (with the transcript shown on screen, or the
 * lines saved live when that is empty), then upload the recording.
 */
export const endCallPipeline = async ({
  callId, audioBlob, duration, startTime, endTime, transcript = [], status = "completed",
}: {
  callId: string;
  audioBlob?: Blob | null;
  duration: number;
  startTime: string;
  endTime: string;
  transcript?: TranscriptLine[];
  status?: "completed" | "failed";
}): Promise<EndCallResult> => {
  const result: EndCallResult = { saved: false, audioSaved: false, audioTooLarge: false };
  try {
    await api("/api/calls?action=save", {
      body: {
        id: callId, startTime, endTime, duration, status,
        transcript: transcript.map((l) => ({ ...l, text: cleanText(l.text) })).filter((l) => l.text),
      },
    });
    result.saved = true;
  } catch (err) {
    result.error = err instanceof ApiError ? err.message : "Call save nahi hui.";
    return result;
  }
  if (!audioBlob || audioBlob.size === 0) return result;
  if (audioBlob.size > MAX_AUDIO_BYTES) {
    result.audioTooLarge = true;
    return result;
  }
  try {
    const res = await apiFetch(`/api/calls?id=${encodeURIComponent(callId)}`, {
      method: "PUT",
      headers: { "Content-Type": audioBlob.type || "audio/webm" },
      body: audioBlob,
    });
    result.audioSaved = res.ok;
    if (res.status === 413) result.audioTooLarge = true;
  } catch (err) {
    console.warn("[CloudSync] recording upload failed:", (err as Error).message);
  }
  return result;
};
