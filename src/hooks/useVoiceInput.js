// ============================================================
// useVoiceInput.js — Dictation Mode (no auto-submit)
// ============================================================
// BEHAVIOR:
//   1. User clicks mic → starts Deepgram WebSocket STT
//   2. Speech transcribed live into accumulated buffer
//   3. Interim (partial) words shown in real-time
//   4. Each "is_final" Deepgram result appends to buffer
//   5. NO silence timeout — mic stays on until user clicks stop
//   6. User clicks SEND (or Enter) to execute the command
//
// FALLBACK: Web Speech API if Deepgram unavailable
// ============================================================

import { useState, useRef, useCallback, useEffect } from "react";

// Deepgram WebSocket STT configuration
const DEEPGRAM_WS_URL = "wss://api.deepgram.com/v1/listen";
const DEEPGRAM_PARAMS = [
  "model=nova-2",
  "language=en",
  "smart_format=true",
  "interim_results=true",
  "utterance_end_ms=1500",
  "vad_events=true",
  "punctuate=true",
  "encoding=linear16",
  "sample_rate=16000",
  "channels=1",
].join("&");

export function useVoiceInput() {
  const [isListening, setIsListening] = useState(false);
  const [isSupported, setIsSupported] = useState(true);
  const [micBlocked, setMicBlocked] = useState(false);
  const [error, setError] = useState(null);
  const [accumulatedText, setAccumulatedText] = useState("");
  const [currentInterim, setCurrentInterim] = useState("");

  const wsRef = useRef(null);
  const mediaStreamRef = useRef(null);
  const audioContextRef = useRef(null);
  const processorRef = useRef(null);
  const keepAliveRef = useRef(null);
  const recognitionRef = useRef(null);
  const engineRef = useRef("none");

  useEffect(() => {
    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
      const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
      if (!SpeechRecognition) {
        setIsSupported(false);
      }
    }
  }, []);

  const getDeepgramToken = useCallback(async () => {
    try {
      const res = await fetch("/api/deepgram-token");
      if (!res.ok) throw new Error(`Token fetch failed: ${res.status}`);
      const data = await res.json();
      return data.key || data.token || data;
    } catch (err) {
      console.warn("Deepgram token fetch failed:", err);
      return null;
    }
  }, []);

  const stopListening = useCallback(() => {
    if (keepAliveRef.current) {
      clearInterval(keepAliveRef.current);
      keepAliveRef.current = null;
    }
    if (wsRef.current) {
      try {
        if (wsRef.current.readyState === WebSocket.OPEN) {
          wsRef.current.send(JSON.stringify({ type: "CloseStream" }));
        }
        wsRef.current.close();
      } catch (e) { /* ignore */ }
      wsRef.current = null;
    }
    if (processorRef.current) {
      try { processorRef.current.disconnect(); } catch (e) { /* ignore */ }
      processorRef.current = null;
    }
    if (audioContextRef.current) {
      try { audioContextRef.current.close(); } catch (e) { /* ignore */ }
      audioContextRef.current = null;
    }
    if (mediaStreamRef.current) {
      mediaStreamRef.current.getTracks().forEach(t => t.stop());
      mediaStreamRef.current = null;
    }
    if (recognitionRef.current) {
      try { recognitionRef.current.stop(); } catch (e) { /* ignore */ }
      recognitionRef.current = null;
    }
    setIsListening(false);
    setCurrentInterim("");
    engineRef.current = "none";
  }, []);

  const startDeepgram = useCallback(async () => {
    const token = await getDeepgramToken();
    if (!token) return false;

    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          channelCount: 1,
          sampleRate: 16000,
          echoCancellation: true,
          noiseSuppression: true,
        },
      });
      mediaStreamRef.current = stream;

      const audioContext = new (window.AudioContext || window.webkitAudioContext)({
        sampleRate: 16000,
      });
      audioContextRef.current = audioContext;

      const source = audioContext.createMediaStreamSource(stream);
      const processor = audioContext.createScriptProcessor(4096, 1, 1);
      processorRef.current = processor;

      const wsUrl = `${DEEPGRAM_WS_URL}?${DEEPGRAM_PARAMS}`;
      const ws = new WebSocket(wsUrl, ["token", token]);
      wsRef.current = ws;

      ws.onopen = () => {
        console.log("[Deepgram] WebSocket connected");
        engineRef.current = "deepgram";
        setIsListening(true);

        processor.onaudioprocess = (e) => {
          if (ws.readyState !== WebSocket.OPEN) return;
          const inputData = e.inputBuffer.getChannelData(0);
          const pcm16 = new Int16Array(inputData.length);
          for (let i = 0; i < inputData.length; i++) {
            pcm16[i] = Math.max(-32768, Math.min(32767, Math.round(inputData[i] * 32767)));
          }
          ws.send(pcm16.buffer);
        };

        source.connect(processor);
        processor.connect(audioContext.destination);

        keepAliveRef.current = setInterval(() => {
          if (ws.readyState === WebSocket.OPEN) {
            ws.send(JSON.stringify({ type: "KeepAlive" }));
          }
        }, 8000);
      };

      ws.onmessage = (event) => {
        try {
          const msg = JSON.parse(event.data);
          if (msg.type === "Results" && msg.channel?.alternatives?.[0]) {
            const alt = msg.channel.alternatives[0];
            const text = (alt.transcript || "").trim();
            if (!text) return;

            if (msg.is_final) {
              setAccumulatedText((prev) => {
                const separator = prev && !prev.endsWith(" ") ? " " : "";
                return prev + separator + text;
              });
              setCurrentInterim("");
            } else {
              setCurrentInterim(text);
            }
          }
        } catch (e) {
          console.warn("[Deepgram] Parse error:", e);
        }
      };

      ws.onerror = (e) => {
        console.warn("[Deepgram] WebSocket error:", e);
      };

      ws.onclose = (e) => {
        console.log("[Deepgram] WebSocket closed:", e.code, e.reason);
      };

      return true;
    } catch (err) {
      console.warn("[Deepgram] Failed to start:", err);
      if (err.name === "NotAllowedError" || err.name === "PermissionDeniedError") {
        if (window.self !== window.top) {
          setMicBlocked(true);
          setError("Microphone access blocked in this iframe. Use keyboard dictation instead.");
        } else {
          setError("Microphone permission denied. Please allow microphone access and try again.");
        }
      }
      return false;
    }
  }, [getDeepgramToken]);

  const startWebSpeech = useCallback(() => {
    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SpeechRecognition) return false;

    try {
      const recognition = new SpeechRecognition();
      recognitionRef.current = recognition;

      recognition.continuous = true;
      recognition.interimResults = true;
      recognition.lang = "en-US";

      recognition.onstart = () => {
        engineRef.current = "webspeech";
        setIsListening(true);
      };

      recognition.onresult = (event) => {
        let finalText = "";
        let interimText = "";

        for (let i = event.resultIndex; i < event.results.length; i++) {
          const result = event.results[i];
          if (result.isFinal) {
            finalText += result[0].transcript;
          } else {
            interimText += result[0].transcript;
          }
        }

        if (finalText) {
          setAccumulatedText((prev) => {
            const separator = prev && !prev.endsWith(" ") ? " " : "";
            return prev + separator + finalText.trim();
          });
        }
        setCurrentInterim(interimText.trim());
      };

      recognition.onerror = (event) => {
        console.warn("[WebSpeech] Error:", event.error);
        if (event.error === "not-allowed") {
          if (window.self !== window.top) {
            setMicBlocked(true);
            setError("Microphone blocked in iframe. Use keyboard dictation instead.");
          } else {
            setError("Microphone permission denied.");
          }
          stopListening();
        }
      };

      recognition.onend = () => {
        if (engineRef.current === "webspeech" && recognitionRef.current) {
          try {
            recognition.start();
          } catch (e) { /* ignore */ }
        }
      };

      recognition.start();
      return true;
    } catch (err) {
      console.warn("[WebSpeech] Failed to start:", err);
      return false;
    }
  }, [stopListening]);

  const startListening = useCallback(async () => {
    setError(null);
    setAccumulatedText("");
    setCurrentInterim("");

    const dgOk = await startDeepgram();
    if (dgOk) return;

    const wsOk = startWebSpeech();
    if (wsOk) return;

    setError("Voice input unavailable. Use keyboard dictation: Mac → Fn Fn, Windows → Win+H");
    setIsSupported(false);
  }, [startDeepgram, startWebSpeech]);

  const clearError = useCallback(() => setError(null), []);

  const clearTranscript = useCallback(() => {
    setAccumulatedText("");
    setCurrentInterim("");
  }, []);

  useEffect(() => {
    return () => stopListening();
  }, [stopListening]);

  const liveTranscript = accumulatedText + (currentInterim ? (accumulatedText ? " " : "") + currentInterim : "");

  return {
    isListening,
    isSupported,
    micBlocked,
    error,
    liveTranscript,
    interimTranscript: currentInterim,
    accumulatedText,
    startListening,
    stopListening,
    clearTranscript,
    clearError,
  };
}
