import { useState, useEffect, useRef, useCallback } from 'react';

export function useVoiceAssistant() {
    const [isListening, setIsListening] = useState(false);
    const [isSpeaking, setIsSpeaking] = useState(false);
    const recognitionRef = useRef<unknown>(null);
    const synthRef = useRef<SpeechSynthesis | null>(null);

    // Initialize Speech Synthesis
    useEffect(() => {
        if (typeof window !== 'undefined') {
            synthRef.current = window.speechSynthesis;
        }
    }, []);

    const speakIntro = useCallback(() => {
        if (!synthRef.current) return;

        setIsSpeaking(true);
        synthRef.current.cancel(); // Stop any current speech

        const text = "Namaste. Mai Yoga AI hu. Mai aap ki kai tariko se help kar sakti hu. " +
            "Mere paas Heart Rate Sensor, Yoga Detector Sensor, Mudra AI, Energy Box, aur kai advanced technologies hain. " +
            "Please use me to check your Yoga. Bye Bye!";

        const utterance = new SpeechSynthesisUtterance(text);

        // Voice Selection Strategy: Hindi Female -> Hindi -> Female -> Default
        const voices = synthRef.current.getVoices();
        const voice = voices.find(v =>
            (v.name.includes("India") || v.name.includes("Hindi") || v.name.includes("Heera")) &&
            v.name.includes("Female")
        ) || voices.find(v => v.name.includes("Google हिन्दी")) || voices.find(v => v.name.includes("Female"));

        if (voice) {
            utterance.voice = voice;
        }

        utterance.rate = 1.15; // Teez (Fast/Energetic)
        utterance.pitch = 1.1; // Saaf (Clear/Natural)
        utterance.volume = 1.0; // Loud (Max Volume)

        utterance.onend = () => {
            setIsSpeaking(false);
        };

        synthRef.current.speak(utterance);
    }, []);

    // Initialize Speech Recognition
    useEffect(() => {
        if (typeof window !== 'undefined' && 'webkitSpeechRecognition' in window) {
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            const SpeechRecognition = (window as any).webkitSpeechRecognition;
            const recognition = new SpeechRecognition();
            recognition.continuous = true;
            recognition.interimResults = false;
            recognition.lang = 'en-US'; // Listen for English wake word "Yoga AI"

            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            recognition.onresult = (event: any) => {
                const lastResult = event.results[event.results.length - 1];
                const transcript = lastResult[0].transcript.trim().toLowerCase();
                console.log("Voice heard:", transcript);

                if (transcript.includes("yoga ai") || transcript.includes("yoga aii") || transcript.includes("yoga i")) {
                    speakIntro();
                }
            };

            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            recognition.onerror = (event: any) => {
                console.error("Speech recognition error", event.error);
                if (event.error === 'not-allowed') {
                    setIsListening(false);
                }
            };

            recognition.onend = () => {
                // Auto-restart if it was supposed to be listening
                if (isListening) {
                    try {
                        recognition.start();
                    } catch {
                        // Ignore if already started
                    }
                }
            };

            recognitionRef.current = recognition;
        }
    }, [isListening, speakIntro]);

    const toggleListening = useCallback(() => {
        const recognition = recognitionRef.current;
        if (!recognition) return;

        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const rec = recognition as any;

        if (isListening) {
            rec.stop();
            setIsListening(false);
        } else {
            try {
                rec.start();
                setIsListening(true);
            } catch (e) {
                console.error("Error starting recognition:", e);
            }
        }
    }, [isListening]);

    return {
        isListening,
        isSpeaking,
        toggleListening,
        speakIntro // Exposed for manual testing if needed
    };
}
