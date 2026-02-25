import { useState, useEffect, useRef, useCallback } from 'react';

/**
 * useVoiceInput — Web Speech API hook with network error retry
 *
 * The Web Speech API (webkitSpeechRecognition) depends on Google's servers.
 * "network" errors happen when Chrome can't reach those servers — common on
 * preview deployments, certain networks, or when the browser throttles
 * inactive tabs. This hook auto-retries up to 3 times with backoff.
 */
export function useVoiceInput() {
  const [isListening, setIsListening] = useState(false);
  const [transcript, setTranscript] = useState('');
  const [interimTranscript, setInterimTranscript] = useState('');
  const [isSupported, setIsSupported] = useState(false);
  const [error, setError] = useState(null);
  const [micBlocked, setMicBlocked] = useState(false);

  const recognitionRef = useRef(null);
  const retryCountRef = useRef(0);
  const retryTimerRef = useRef(null);
  const intentionalStopRef = useRef(false);
  const MAX_RETRIES = 3;

  // Initialize speech recognition
  useEffect(() => {
    const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SR) {
      setIsSupported(false);
      return;
    }

    setIsSupported(true);

    const recognition = new SR();
    recognition.continuous = false;
    recognition.interimResults = true;
    recognition.lang = 'en-US';
    recognition.maxAlternatives = 1;

    recognition.onstart = () => {
      setIsListening(true);
      setError(null);
      // Reset retry counter on successful start
      retryCountRef.current = 0;
    };

    recognition.onresult = (event) => {
      let interim = '';
      let final = '';

      for (let i = event.resultIndex; i < event.results.length; i++) {
        const text = event.results[i][0].transcript;
        if (event.results[i].isFinal) {
          final += text;
        } else {
          interim += text;
        }
      }

      if (final) {
        setTranscript(final);
        setInterimTranscript('');
        // Success — reset retries
        retryCountRef.current = 0;
      } else {
        setInterimTranscript(interim);
      }
    };

    recognition.onend = () => {
      setIsListening(false);
      // If we didn't stop intentionally and have no transcript, it may have
      // been a silent timeout — that's fine, not an error.
    };

    recognition.onerror = (event) => {
      setIsListening(false);

      switch (event.error) {
        case 'not-allowed':
        case 'service-not-allowed':
          setMicBlocked(true);
          setError(
            'Microphone access denied. Click the lock icon in your address bar → allow microphone → reload the page.'
          );
          break;

        case 'network':
          // Auto-retry with backoff
          if (retryCountRef.current < MAX_RETRIES) {
            retryCountRef.current++;
            const delay = retryCountRef.current * 800; // 800ms, 1600ms, 2400ms
            setError(
              `Speech service connection failed — retrying (${retryCountRef.current}/${MAX_RETRIES})...`
            );
            retryTimerRef.current = setTimeout(() => {
              try {
                recognition.start();
                setIsListening(true);
              } catch (e) {
                // Recognition might already be running or blocked
                setError(
                  'Speech service unavailable. Use keyboard dictation instead (Mac: Fn Fn, Win: Win+H).'
                );
              }
            }, delay);
          } else {
            // All retries exhausted
            retryCountRef.current = 0;
            setError(
              'Speech service unreachable after 3 attempts. This usually means your browser can\'t connect to Google\'s speech servers. Try: (1) check your internet connection, (2) disable ad blockers/VPN, (3) reload the page, or (4) use keyboard dictation (Mac: Fn Fn, Win: Win+H, Mobile: 🎤 on keyboard).'
            );
          }
          break;

        case 'no-speech':
          setError('No speech detected. Click the mic and speak clearly.');
          break;

        case 'audio-capture':
          setError(
            'No microphone found. Check that a mic is connected and not in use by another app.'
          );
          break;

        case 'aborted':
          // User or system aborted — not really an error
          if (!intentionalStopRef.current) {
            // Unexpected abort — might be a browser quirk, try once
            if (retryCountRef.current < 1) {
              retryCountRef.current++;
              retryTimerRef.current = setTimeout(() => {
                try {
                  recognition.start();
                  setIsListening(true);
                } catch (e) {
                  // Silently fail
                }
              }, 500);
            }
          }
          intentionalStopRef.current = false;
          break;

        default:
          setError(`Speech error: ${event.error}. Try reloading the page.`);
      }
    };

    recognitionRef.current = recognition;

    // Cleanup on unmount
    return () => {
      if (retryTimerRef.current) {
        clearTimeout(retryTimerRef.current);
      }
      try {
        recognition.abort();
      } catch (e) {
        // Ignore
      }
    };
  }, []);

  const startListening = useCallback(() => {
    if (!recognitionRef.current || isListening) return;

    // Clear previous state
    setTranscript('');
    setInterimTranscript('');
    setError(null);
    retryCountRef.current = 0;
    intentionalStopRef.current = false;

    // Cancel any pending retry
    if (retryTimerRef.current) {
      clearTimeout(retryTimerRef.current);
      retryTimerRef.current = null;
    }

    try {
      recognitionRef.current.start();
      setIsListening(true);
    } catch (e) {
      // "already started" or permission issue
      if (e.message?.includes('already started')) {
        // Stop and restart
        try {
          recognitionRef.current.stop();
          setTimeout(() => {
            try {
              recognitionRef.current.start();
              setIsListening(true);
            } catch (e2) {
              setError('Could not start microphone. Try reloading the page.');
              setIsListening(false);
            }
          }, 200);
        } catch (e2) {
          setError('Could not start microphone. Try reloading the page.');
          setIsListening(false);
        }
      } else {
        setMicBlocked(true);
        setError('Microphone access blocked by browser.');
        setIsListening(false);
      }
    }
  }, [isListening]);

  const stopListening = useCallback(() => {
    // Cancel any pending retry
    if (retryTimerRef.current) {
      clearTimeout(retryTimerRef.current);
      retryTimerRef.current = null;
    }

    intentionalStopRef.current = true;
    retryCountRef.current = 0;

    if (recognitionRef.current && isListening) {
      try {
        recognitionRef.current.stop();
      } catch (e) {
        // Ignore
      }
      setIsListening(false);
    }
  }, [isListening]);

  const clearTranscript = useCallback(() => {
    setTranscript('');
    setInterimTranscript('');
  }, []);

  const clearError = useCallback(() => setError(null), []);

  return {
    isListening,
    transcript,
    interimTranscript,
    isSupported,
    error,
    micBlocked,
    startListening,
    stopListening,
    clearTranscript,
    clearError,
  };
}
