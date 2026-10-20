/**
 * call-storage.ts - the shape of a call, and saving or deleting one.
 *
 * Calls live on the server under the signed-in account (see cloud-sync.ts).
 * Nothing is kept in the browser any more: the old IndexedDB copy held the one
 * shared profile's calls for everybody who opened the app on that device, so it
 * is deleted the first time this file loads.
 */

import { deleteCall, endCallPipeline } from "@/lib/cloud-sync";

export interface TranscriptLine {
  id: string;
  role: "user" | "yaara" | "system";
  text: string;
  timestamp: string;
  status: "live" | "final";
}

export interface CallRecord {
  id: string;
  userMobile?: string;
  startTime: string;
  endTime: string;
  duration: number;
  status: "completed" | "failed" | string;
  transcript: string | TranscriptLine[];
  audioBlob: string | null;
  /** The call id when the call has a recording on the server, else null. */
  audioPath?: string | null;
  updatedAt?: string;
}

try {
  indexedDB.deleteDatabase("yaara_db");
  localStorage.removeItem("yaara_calls");
} catch { /* storage off */ }

export const callStorage = {
  /** Save a call that has no recording. */
  async saveCall(call: CallRecord): Promise<void> {
    const r = await endCallPipeline({
      callId: call.id,
      duration: call.duration,
      startTime: call.startTime,
      endTime: call.endTime,
      status: call.status === "failed" ? "failed" : "completed",
      transcript: Array.isArray(call.transcript) ? call.transcript : [],
    });
    if (!r.saved) throw new Error(r.error || "Call save nahi hui.");
  },

  async deleteCall(id: string): Promise<void> {
    await deleteCall(id);
  },
};
