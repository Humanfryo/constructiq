import { useState, useEffect, useRef, useCallback } from 'react';
export function useVoiceInput() {
  const [isListening, setIsListening] = useState(false);
  const [transcript, setTranscript] = useState('');
  const [interimTranscript, setInterimTranscript] = useState('');
  const [isSupported, setIsSupported] = useState(false);
  const [error, setError] = useState(null);
  const [micBlocked, setMicBlocked] = useState(false);
  const recognitionRef = useRef(null);
  useEffect(() => {
    const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SR) return;
    setIsSupported(true);
    const r = new SR(); r.continuous = false; r.interimResults = true; r.lang = 'en-US';
    r.onresult = (e) => { let interim='',final=''; for(let i=e.resultIndex;i<e.results.length;i++){const t=e.results[i][0].transcript;if(e.results[i].isFinal)final+=t;else interim+=t;} if(final){setTranscript(final);setInterimTranscript('');}else setInterimTranscript(interim); };
    r.onend = () => setIsListening(false);
    r.onerror = (e) => { setIsListening(false); if(e.error==='not-allowed'||e.error==='service-not-allowed'){setMicBlocked(true);setError('Microphone access denied. Check browser permissions.');}else if(e.error==='no-speech'){setError('No speech detected.');}else if(e.error!=='aborted'){setError(`Speech error: ${e.error}`);} };
    recognitionRef.current = r;
  }, []);
  const startListening = useCallback(() => { if(!recognitionRef.current||isListening)return; setTranscript('');setInterimTranscript('');setError(null); try{recognitionRef.current.start();setIsListening(true);}catch(e){setMicBlocked(true);setError('Mic access blocked.');setIsListening(false);} }, [isListening]);
  const stopListening = useCallback(() => { if(recognitionRef.current&&isListening){recognitionRef.current.stop();setIsListening(false);} }, [isListening]);
  const clearTranscript = useCallback(() => { setTranscript('');setInterimTranscript(''); }, []);
  const clearError = useCallback(() => setError(null), []);
  return { isListening, transcript, interimTranscript, isSupported, error, micBlocked, startListening, stopListening, clearTranscript, clearError };
}
