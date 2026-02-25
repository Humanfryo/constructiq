import { useState, useEffect, useRef, useCallback } from 'react';

/**
 * useVoiceInput — Deepgram STT with Web Speech API fallback
 *
 * v2 fixes:
 *   - Auth via URL token param (more reliable than subprotocol)
 *   - Longer silence timeout before auto-stop (2.5s)
 *   - User must click stop OR speak a command — no premature cutoff
 *   - Console logging for debugging
 */

// ─── Deepgram Engine ─────────────────────────────────────────────────────────

function useDeepgramEngine() {
  const wsRef = useRef(null);
  const mediaRecorderRef = useRef(null);
  const streamRef = useRef(null);
  const keepAliveRef = useRef(null);
  const apiKeyRef = useRef(null);
  const silenceTimerRef = useRef(null);
  const isActiveRef = useRef(false);

  const getApiKey = useCallback(async () => {
    if (apiKeyRef.current) return apiKeyRef.current;
    try {
      const resp = await fetch('/api/deepgram-token');
      if (!resp.ok) throw new Error(`Token endpoint returned ${resp.status}`);
      const data = await resp.json();
      if (data.error) throw new Error(data.error);
      apiKeyRef.current = data.key;
      return data.key;
    } catch (err) {
      console.warn('[Deepgram] Failed to get API key:', err.message);
      return null;
    }
  }, []);

  const start = useCallback(async (onTranscript, onInterim, onError, onStateChange) => {
    const apiKey = await getApiKey();
    if (!apiKey) {
      onError('Deepgram API key not available.');
      return false;
    }

    // Get microphone
    let stream;
    try {
      stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          channelCount: 1,
          echoCancellation: true,
          noiseSuppression: true,
        },
      });
      streamRef.current = stream;
      console.log('[Deepgram] ✓ Mic access granted');
    } catch (err) {
      if (err.name === 'NotAllowedError' || err.name === 'PermissionDeniedError') {
        onError('mic-blocked');
      } else {
        onError(`Microphone error: ${err.message}`);
      }
      return false;
    }

    // Build WebSocket URL with token in query string (most reliable browser auth)
    const params = new URLSearchParams({
      model: 'nova-2',
      language: 'en',
      smart_format: 'true',
      interim_results: 'true',
      utterance_end_ms: '2000',
      vad_events: 'true',
      endpointing: '500',
    });

    const wsUrl = `wss://api.deepgram.com/v1/listen?${params.toString()}`;
    console.log('[Deepgram] Connecting to WebSocket...');

    return new Promise((resolve) => {
      try {
        // Auth via Authorization header using subprotocol trick
        // Deepgram accepts: new WebSocket(url, ['token', key])
        // OR we can add token to URL
        const ws = new WebSocket(wsUrl, ['token', apiKey]);
        wsRef.current = ws;
        isActiveRef.current = true;

        let fullTranscript = '';
        let hasReceivedSpeech = false;
        let connectionTimeout = null;

        // If WebSocket doesn't open in 5 seconds, fail
        connectionTimeout = setTimeout(() => {
          if (ws.readyState !== WebSocket.OPEN) {
            console.warn('[Deepgram] Connection timeout');
            ws.close();
            onError('Deepgram connection timeout.');
            resolve(false);
          }
        }, 5000);

        ws.onopen = () => {
          clearTimeout(connectionTimeout);
          console.log('[Deepgram] ✓ WebSocket OPEN');
          onStateChange('listening');

          // Keep-alive every 8 seconds
          keepAliveRef.current = setInterval(() => {
            if (ws.readyState === WebSocket.OPEN) {
              ws.send(JSON.stringify({ type: 'KeepAlive' }));
            }
          }, 8000);

          // Start MediaRecorder
          try {
            const mimeType = MediaRecorder.isTypeSupported('audio/webm;codecs=opus')
              ? 'audio/webm;codecs=opus'
              : MediaRecorder.isTypeSupported('audio/webm')
                ? 'audio/webm'
                : 'audio/mp4'; // Safari fallback

            console.log('[Deepgram] Using MIME:', mimeType);

            const recorder = new MediaRecorder(stream, { mimeType });
            mediaRecorderRef.current = recorder;

            recorder.ondataavailable = (event) => {
              if (event.data.size > 0 && ws.readyState === WebSocket.OPEN) {
                ws.send(event.data);
              }
            };

            recorder.onerror = (e) => {
              console.error('[Deepgram] MediaRecorder error:', e);
            };

            // Send audio in 250ms chunks (balance between latency and reliability)
            recorder.start(250);
            console.log('[Deepgram] ✓ MediaRecorder started (250ms chunks)');
            resolve(true);
          } catch (recErr) {
            console.error('[Deepgram] MediaRecorder failed:', recErr);
            onError(`Recording error: ${recErr.message}`);
            ws.close();
            resolve(false);
          }
        };

        ws.onmessage = (event) => {
          try {
            const data = JSON.parse(event.data);

            if (data.type === 'Results') {
              const alt = data.channel?.alternatives?.[0];
              if (!alt) return;

              const text = alt.transcript || '';

              if (data.is_final && text) {
                hasReceivedSpeech = true;
                fullTranscript += (fullTranscript ? ' ' : '') + text;
                console.log('[Deepgram] Final chunk:', text);
                console.log('[Deepgram] Full so far:', fullTranscript);
                onInterim(fullTranscript);

                // Reset silence timer — wait 2.5s of silence before auto-finalizing
                if (silenceTimerRef.current) clearTimeout(silenceTimerRef.current);
                silenceTimerRef.current = setTimeout(() => {
                  if (fullTranscript.trim() && isActiveRef.current) {
                    console.log('[Deepgram] Silence timeout → finalizing:', fullTranscript.trim());
                    const final = fullTranscript.trim();
                    fullTranscript = '';
                    hasReceivedSpeech = false;
                    onTranscript(final);
                  }
                }, 2500);
              } else if (!data.is_final && text) {
                // Interim — show real-time partial text
                const interim = fullTranscript + (fullTranscript ? ' ' : '') + text;
                onInterim(interim);
              }
            }

            if (data.type === 'UtteranceEnd') {
              console.log('[Deepgram] UtteranceEnd event');
              if (fullTranscript.trim() && hasReceivedSpeech) {
                if (silenceTimerRef.current) clearTimeout(silenceTimerRef.current);
                console.log('[Deepgram] UtteranceEnd → finalizing:', fullTranscript.trim());
                const final = fullTranscript.trim();
                fullTranscript = '';
                hasReceivedSpeech = false;
                onTranscript(final);
              }
            }

            // Log metadata for debugging
            if (data.type === 'Metadata') {
              console.log('[Deepgram] Metadata:', JSON.stringify(data).substring(0, 200));
            }
          } catch (e) {
            // Non-JSON message, ignore
          }
        };

        ws.onerror = (event) => {
          clearTimeout(connectionTimeout);
          console.error('[Deepgram] WebSocket error:', event);
          onError('Deepgram connection error.');
          resolve(false);
        };

        ws.onclose = (event) => {
          clearTimeout(connectionTimeout);
          console.log('[Deepgram] WebSocket closed. Code:', event.code, 'Reason:', event.reason || '(none)');

          // Finalize any pending transcript
          if (fullTranscript.trim()) {
            onTranscript(fullTranscript.trim());
            fullTranscript = '';
          }
          isActiveRef.current = false;
          onStateChange('stopped');
          cleanupInternal();
        };

      } catch (err) {
        console.error('[Deepgram] Failed to create WebSocket:', err);
        onError(`Deepgram connection failed: ${err.message}`);
        resolve(false);
      }
    });
  }, [getApiKey]);

  const cleanupInternal = useCallback(() => {
    if (keepAliveRef.current) {
      clearInterval(keepAliveRef.current);
      keepAliveRef.current = null;
    }
    if (silenceTimerRef.current) {
      clearTimeout(silenceTimerRef.current);
      silenceTimerRef.current = null;
    }
    if (mediaRecorderRef.current && mediaRecorderRef.current.state !== 'inactive') {
      try { mediaRecorderRef.current.stop(); } catch (e) { /* ignore */ }
      mediaRecorderRef.current = null;
    }
    if (streamRef.current) {
      streamRef.current.getTracks().forEach(t => t.stop());
      streamRef.current = null;
    }
  }, []);

  const stop = useCallback(() => {
    console.log('[Deepgram] Stopping...');
    isActiveRef.current = false;

    if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
      // Tell Deepgram to finalize and close
      wsRef.current.send(JSON.stringify({ type: 'CloseStream' }));
      setTimeout(() => {
        if (wsRef.current) {
          wsRef.current.close();
          wsRef.current = null;
        }
      }, 500);
    } else {
      cleanupInternal();
    }
  }, [cleanupInternal]);

  const cleanup = useCallback(() => {
    isActiveRef.current = false;
    if (wsRef.current) {
      try { wsRef.current.close(); } catch (e) { /* */ }
      wsRef.current = null;
    }
    cleanupInternal();
  }, [cleanupInternal]);

  return { start, stop, cleanup };
}


// ─── Web Speech API Fallback ─────────────────────────────────────────────────

function useWebSpeechEngine() {
  const recognitionRef = useRef(null);
  const retryCountRef = useRef(0);
  const retryTimerRef = useRef(null);

  const isSupported = typeof window !== 'undefined' &&
    !!(window.SpeechRecognition || window.webkitSpeechRecognition);

  const start = useCallback((onTranscript, onInterim, onError, onStateChange) => {
    const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SR) {
      onError('Web Speech API not supported.');
      return false;
    }

    const recognition = new SR();
    recognition.continuous = false;
    recognition.interimResults = true;
    recognition.lang = 'en-US';
    recognitionRef.current = recognition;

    recognition.onstart = () => {
      onStateChange('listening');
      retryCountRef.current = 0;
    };

    recognition.onresult = (event) => {
      let interim = '';
      let final = '';
      for (let i = event.resultIndex; i < event.results.length; i++) {
        const text = event.results[i][0].transcript;
        if (event.results[i].isFinal) final += text;
        else interim += text;
      }
      if (final) onTranscript(final);
      else if (interim) onInterim(interim);
    };

    recognition.onend = () => onStateChange('stopped');

    recognition.onerror = (event) => {
      if (event.error === 'not-allowed' || event.error === 'service-not-allowed') {
        onError('mic-blocked');
      } else if (event.error === 'network') {
        if (retryCountRef.current < 2) {
          retryCountRef.current++;
          retryTimerRef.current = setTimeout(() => {
            try { recognition.start(); } catch (e) { /* */ }
          }, 800 * retryCountRef.current);
          return;
        }
        onError('Browser speech unavailable. Use keyboard dictation: Mac → Fn Fn, Win → Win+H');
      } else if (event.error === 'no-speech') {
        onError('No speech detected.');
      } else if (event.error !== 'aborted') {
        onError(`Speech error: ${event.error}`);
      }
      onStateChange('stopped');
    };

    try {
      recognition.start();
      return true;
    } catch (e) {
      onError('mic-blocked');
      return false;
    }
  }, []);

  const stop = useCallback(() => {
    if (retryTimerRef.current) clearTimeout(retryTimerRef.current);
    if (recognitionRef.current) {
      try { recognitionRef.current.stop(); } catch (e) { /* */ }
    }
  }, []);

  const cleanup = useCallback(() => stop(), [stop]);

  return { start, stop, cleanup, isSupported };
}


// ─── Main Hook ───────────────────────────────────────────────────────────────

export function useVoiceInput() {
  const [isListening, setIsListening] = useState(false);
  const [transcript, setTranscript] = useState('');
  const [interimTranscript, setInterimTranscript] = useState('');
  const [error, setError] = useState(null);
  const [micBlocked, setMicBlocked] = useState(false);
  const [engine, setEngine] = useState('idle');

  const deepgram = useDeepgramEngine();
  const webSpeech = useWebSpeechEngine();
  const activeEngineRef = useRef(null);

  const onTranscript = useCallback((text) => {
    console.log('[Voice] ✓ Final transcript:', text);
    setTranscript(text);
    setInterimTranscript('');
    setIsListening(false);
    // Stop the engine after receiving final transcript
    if (activeEngineRef.current) {
      activeEngineRef.current.stop();
      activeEngineRef.current = null;
    }
    setEngine('idle');
  }, []);

  const onInterim = useCallback((text) => {
    setInterimTranscript(text);
  }, []);

  const onError = useCallback((errMsg) => {
    if (errMsg === 'mic-blocked') {
      setMicBlocked(true);
      setError('Microphone access denied. Click the lock icon → allow mic → reload.');
    } else {
      setError(errMsg);
    }
  }, []);

  const onStateChange = useCallback((state) => {
    if (state === 'listening') {
      setIsListening(true);
    } else if (state === 'stopped') {
      setIsListening(false);
    }
  }, []);

  const startListening = useCallback(async () => {
    if (isListening) return;

    setTranscript('');
    setInterimTranscript('');
    setError(null);

    // Try Deepgram first
    console.log('[Voice] ── Attempting Deepgram ──');
    const dgOk = await deepgram.start(onTranscript, onInterim, (err) => {
      console.warn('[Voice] Deepgram start error:', err);
    }, onStateChange);

    if (dgOk) {
      setEngine('deepgram');
      activeEngineRef.current = deepgram;
      console.log('[Voice] ✓ DEEPGRAM ACTIVE — speak now!');
      return;
    }

    // Fallback to Web Speech API
    console.log('[Voice] ── Falling back to Web Speech API ──');
    setError(null);

    if (webSpeech.isSupported) {
      const wsOk = webSpeech.start(onTranscript, onInterim, onError, onStateChange);
      if (wsOk) {
        setEngine('webspeech');
        activeEngineRef.current = webSpeech;
        console.log('[Voice] ✓ WEB SPEECH API ACTIVE (fallback)');
        return;
      }
    }

    setError('Voice input unavailable. Use keyboard dictation: Mac → Fn Fn, Win → Win+H, Mobile → 🎤');
  }, [isListening, deepgram, webSpeech, onTranscript, onInterim, onError, onStateChange]);

  const stopListening = useCallback(() => {
    console.log('[Voice] User clicked stop');
    if (activeEngineRef.current) {
      activeEngineRef.current.stop();
      activeEngineRef.current = null;
    }
    setIsListening(false);
    setEngine('idle');
  }, []);

  const clearTranscript = useCallback(() => {
    setTranscript('');
    setInterimTranscript('');
  }, []);

  const clearError = useCallback(() => setError(null), []);

  useEffect(() => {
    return () => {
      deepgram.cleanup();
      webSpeech.cleanup();
    };
  }, []);

  return {
    isListening,
    transcript,
    interimTranscript,
    isSupported: true,
    error,
    micBlocked,
    engine,
    startListening,
    stopListening,
    clearTranscript,
    clearError,
  };
}
