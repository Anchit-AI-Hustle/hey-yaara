import { useRef, useState } from "react";
import { hasNativeSpeech } from "@/lib/native-speech";

export function useAudioRecorder() {
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const [isRecording, setIsRecording] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // 🎙 START RECORDING
  const startRecording = async () => {
    try {
      setError(null);
      
      // In the apps the phone's recognizer has the microphone; a second
      // capture would cut it off, so calls there keep only the transcript.
      if (hasNativeSpeech()) return;

      // Prevent double start
      if (isRecording) {
        console.warn("Already recording");
        return;
      }
      
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: true
      });
      streamRef.current = stream;
      
      // ⚠️ Safari fallback
      const mimeType = MediaRecorder.isTypeSupported("audio/webm")
        ? "audio/webm"
        : "audio/mp4";
      
      const mediaRecorder = new MediaRecorder(stream, {
        mimeType
      });
      mediaRecorderRef.current = mediaRecorder;
      chunksRef.current = [];
      
      mediaRecorder.ondataavailable = (event) => {
        if (event.data && event.data.size > 0) {
          chunksRef.current.push(event.data);
          console.log("[Recorder] Chunk received:", event.data.size, "bytes");
        }
      };
      
      mediaRecorder.onerror = (e) => {
        console.error("Recorder error:", e);
        setError("Recording failed");
      };
      
      mediaRecorder.start(1000); // collect chunks every 1s
      setIsRecording(true);
      console.log("🎙 Recording started");
    } catch (err) {
      console.error("Mic access error:", err);
      setError("Microphone permission denied");
    }
  };

  // 🛑 STOP RECORDING
  const stopRecording = async (): Promise<Blob | null> => {
    return new Promise((resolve) => {
      try {
        const mediaRecorder = mediaRecorderRef.current;
        if (!mediaRecorder) {
          console.warn("No recorder found");
          resolve(null);
          return;
        }
        
        // Prevent stop without start
        if (!isRecording) {
          console.warn("Not currently recording");
          resolve(null);
          return;
        }
        
        mediaRecorder.onstop = () => {
          try {
            const blob = new Blob(chunksRef.current, {
              type: mediaRecorder.mimeType
            });
            console.log("🧩 Blob created:", blob);
            console.log("📦 Blob size:", blob.size);
            
            // ❗ Critical guard
            if (blob.size === 0) {
              console.error("Empty recording");
              resolve(null);
              return;
            }
            
            // cleanup mic
            streamRef.current?.getTracks().forEach(track => track.stop());
            setIsRecording(false);
            resolve(blob);
          } catch (err) {
            console.error("Blob creation failed:", err);
            resolve(null);
          }
        };
        
        mediaRecorder.stop();
      } catch (err) {
        console.error("Stop recording error:", err);
        resolve(null);
      }
    });
  };

  // Cleanup on unmount
  // Note: useEffect cleanup would go here if needed for component lifecycle

  return {
    startRecording,
    stopRecording,
    isRecording,
    error
  };
}