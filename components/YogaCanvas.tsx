"use client";

import { useEffect, useRef, useState } from "react";
import { useVisionModels } from "@/hooks/useVisionModels";
import { useVoiceAssistant } from "@/hooks/useVoiceAssistant";
import { useArduino } from "@/hooks/useArduino";
import {
    classifyGesture,
    detectNamaste,
} from "@/utils/gesture-recognition";
import { analyzeFace } from "@/utils/face-logic";
import {
    drawUniverse,
    drawChakras,
    drawSmartTracking,
} from "@/utils/drawing";
import { generateSmartCoachMessage } from "@/utils/smart-coach";

import TopBar from "./TopBar";
import RightSidebar from "./RightSidebar";
import LeftSidebar from "./LeftSidebar";
import BottomOverlay from "./BottomOverlay";
import BioAnalyticsPanel from "./BioAnalyticsPanel";

export default function YogaCanvas() {
    const videoRef = useRef<HTMLVideoElement>(null);
    const canvasRef = useRef<HTMLCanvasElement>(null);
    const { handLandmarker, faceLandmarker, isLoading, error: aiError } = useVisionModels();
    const { isListening, isSpeaking, toggleListening } = useVoiceAssistant();
    const { arduinoData, connectArduino, arduinoError } = useArduino();

    // Ref to track isSpeaking without triggering re-renders in the animation loop
    const isSpeakingRef = useRef(isSpeaking);
    useEffect(() => {
        isSpeakingRef.current = isSpeaking;
    }, [isSpeaking]);

    const [gesture, setGesture] = useState<string | null>(null);
    const [feedback, setFeedback] = useState("Tip: Focus on breath. Root is strong...");
    const [logs, setLogs] = useState<string[]>([]);
    const [isPlaying, setIsPlaying] = useState(false);

    // Animation state
    const requestRef = useRef<number>(0);
    const startTimeRef = useRef<number>(0);

    // Refs for Animation Loop State (Fixes Stale Closure)
    const energiesRef = useRef<number[]>([0.0, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0]);
    const activeIndexRef = useRef(0);
    const gestureRef = useRef<string | null>(null);
    const auraIntensityRef = useRef(0.0); // 0.0 to 1.0
    const eyesClosedTimeRef = useRef(0);
    const eyesOpenTimeRef = useRef(0); // Track how long eyes have been open/lost
    const isMeditationRef = useRef(false);

    // Debounce Refs
    const pendingGestureRef = useRef<string | null>(null);
    const pendingGestureStartTimeRef = useRef(0);
    const lastSpeechTimeRef = useRef(0);
    const lastSpeechTextRef = useRef("");

    // React State for UI updates (Sidebar)
    const [uiEnergies, setUiEnergies] = useState<number[]>([0.0, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0]);
    const [sessionTime, setSessionTime] = useState("0.0 min");
    const [mood, setMood] = useState("Relaxed");

    const addLog = (msg: string) => setLogs(prev => [...prev.slice(-4), msg]);

    const audioRef = useRef<HTMLAudioElement | null>(null);

    const speak = (text: string) => {
        // Prevent overlapping with Intro Speech
        if (isSpeakingRef.current) return;

        if ("speechSynthesis" in window) {
            window.speechSynthesis.cancel();
            const utterance = new SpeechSynthesisUtterance(text);
            const voices = window.speechSynthesis.getVoices();
            // Try to find an Indian female voice
            const voice = voices.find(v =>
                (v.name.includes("India") || v.name.includes("Hindi") || v.name.includes("Heera")) &&
                v.name.includes("Female")
            ) || voices.find(v => v.name.includes("Google हिन्दी")) || voices.find(v => v.name.includes("Female"));

            if (voice) utterance.voice = voice;
            utterance.rate = 1.1; // Energetic (slightly faster)
            utterance.pitch = 1.2; // Sweet (higher pitch)
            window.speechSynthesis.speak(utterance);
        }
    };

    const hasLoadedRef = useRef(false);
    const hasErrorRef = useRef(false);

    useEffect(() => {
        if (isLoading && !hasLoadedRef.current) {
            // addLog("AI: Loading models...");
        }
        if (handLandmarker && faceLandmarker && !hasLoadedRef.current) {
            setTimeout(() => addLog("AI: Models loaded successfully"), 0);
            hasLoadedRef.current = true;
        }
        if (aiError && !hasErrorRef.current) {
            setTimeout(() => addLog(`AI Error: ${aiError}`), 0);
            hasErrorRef.current = true;
        }
        if (arduinoError) {
            setTimeout(() => addLog(`Sensor Error: ${arduinoError}`), 0);
        }
    }, [isLoading, handLandmarker, faceLandmarker, aiError, arduinoError]);

    useEffect(() => {
        audioRef.current = new Audio("/adiyogi.mp3");
        audioRef.current.loop = true;
        audioRef.current.volume = 0.6;
        audioRef.current.preload = "auto";

        const playAudio = async () => {
            try {
                await audioRef.current?.play();
                setIsPlaying(true);
                addLog("Audio: Auto-playing");
            } catch (e) {
                console.warn("Autoplay blocked", e);
                addLog("Audio: Autoplay blocked. Click Start.");
                setIsPlaying(false);
            }
        };
        playAudio();

        const startCamera = async () => {
            if (videoRef.current) {
                addLog("Camera: Requesting access...");
                try {
                    const stream = await navigator.mediaDevices.getUserMedia({
                        video: {
                            width: 1280,
                            height: 720,
                        },
                    });
                    addLog("Camera: Access granted");
                    videoRef.current.srcObject = stream;
                    videoRef.current.onloadeddata = () => addLog("Camera: Data loaded");
                    videoRef.current.play();
                    addLog("Camera: Playing stream");
                } catch (err: unknown) {
                    console.error("Error accessing webcam:", err);
                    const errorMessage = err instanceof Error ? err.message : String(err);
                    addLog(`Camera Error: ${errorMessage}`);
                    setFeedback("Camera access denied.");
                }
            }
        };

        startCamera();

        return () => {
            audioRef.current?.pause();
            audioRef.current = null;
        };
    }, []);

    const toggleAudio = () => {
        if (!audioRef.current) return;
        if (isPlaying) {
            audioRef.current.pause();
            setIsPlaying(false);
            addLog("Audio: Paused");
        } else {
            audioRef.current.play().then(() => {
                setIsPlaying(true);
                addLog("Audio: Playing");
            }).catch(e => addLog(`Audio Error: ${e.message}`));
        }
    };

    useEffect(() => {
        if (
            !handLandmarker ||
            !faceLandmarker ||
            !videoRef.current ||
            !canvasRef.current
        ) return;

        startTimeRef.current = Date.now();

        const animate = () => {
            if (
                !canvasRef.current ||
                !videoRef.current ||
                videoRef.current.readyState < 2
            ) {
                requestRef.current = requestAnimationFrame(animate);
                return;
            }

            const canvas = canvasRef.current;
            const ctx = canvas.getContext("2d");
            const video = videoRef.current;

            if (!ctx) return;

            if (canvas.width !== video.videoWidth || canvas.height !== video.videoHeight) {
                canvas.width = video.videoWidth;
                canvas.height = video.videoHeight;
            }

            const width = canvas.width;
            const height = canvas.height;
            const t = (Date.now() - startTimeRef.current) / 1000;

            // 1. Draw Video
            ctx.save();
            ctx.scale(-1, 1);
            ctx.translate(-width, 0);
            ctx.drawImage(video, 0, 0, width, height);
            ctx.restore();

            // 2. AI Detection
            const now = Date.now();
            const handResults = handLandmarker.detectForVideo(video, now);
            const faceResults = faceLandmarker.detectForVideo(video, now);

            let currentGesture = null;
            let isEyesClosed = false;

            // Hand Logic
            if (handResults.landmarks) {
                for (const landmarks of handResults.landmarks) {
                    drawSmartTracking(ctx, landmarks, width, height);
                    const g = classifyGesture(landmarks);
                    if (g) currentGesture = g;
                }
                if (handResults.landmarks.length >= 2) {
                    if (detectNamaste(handResults.landmarks)) {
                        currentGesture = "Namaste / Anjali Mudra";
                    }
                }
            }

            // Face Logic
            if (faceResults.faceLandmarks && faceResults.faceLandmarks.length > 0) {
                const face = faceResults.faceLandmarks[0];
                const analysis = analyzeFace(face);
                isEyesClosed = analysis.isEyesClosed;
            }

            // Meditation Logic (Stabilized)
            if (isEyesClosed) {
                eyesOpenTimeRef.current = 0; // Reset open timer
                if (eyesClosedTimeRef.current === 0) eyesClosedTimeRef.current = now;

                // Trigger meditation after 1 second of eyes closed
                if (now - eyesClosedTimeRef.current > 1000) {
                    isMeditationRef.current = true;
                }
            } else {
                // Eyes are Open (or lost)
                eyesClosedTimeRef.current = 0; // Reset closed timer

                if (isMeditationRef.current) {
                    // If currently meditating, use a SAFER safety buffer (2000ms)
                    // This prevents "flickering" off due to camera noise
                    if (eyesOpenTimeRef.current === 0) eyesOpenTimeRef.current = now;

                    if (now - eyesOpenTimeRef.current > 2000) {
                        isMeditationRef.current = false;

                        // Only announce "Yoga Stopped" if NO gesture is active
                        if (!currentGesture) {
                            const msg = "Yoga band ho gaya hai. Meditation stopped.";
                            setFeedback(msg);
                            speak(msg);
                        } else {
                            setFeedback("Meditation ended. Maintaining Yoga pose.");
                        }
                    }
                } else {
                    isMeditationRef.current = false;
                }
            }

            // Gesture State Update with Hysteresis (Debounce)
            if (currentGesture) {
                if (pendingGestureRef.current !== currentGesture) {
                    // New potential gesture detected, start timer
                    pendingGestureRef.current = currentGesture;
                    pendingGestureStartTimeRef.current = now;
                } else {
                    // Same pending gesture, check duration
                    if (now - pendingGestureStartTimeRef.current > 500) { // 500ms stability required
                        if (gestureRef.current !== currentGesture) {
                            // Confirmed new gesture
                            gestureRef.current = currentGesture;
                            setGesture(currentGesture);

                            const isGyan = currentGesture === "Gyan Mudra";
                            const msg = generateSmartCoachMessage(energiesRef.current, "Calm", isMeditationRef.current, isGyan);

                            // Prevent repeating the same message too soon (10s)
                            if (msg !== lastSpeechTextRef.current || now - lastSpeechTimeRef.current > 10000) {
                                setFeedback(msg);
                                speak(msg);
                                lastSpeechTextRef.current = msg;
                                lastSpeechTimeRef.current = now;
                            }
                        }
                    }
                }
            } else {
                // No gesture detected, reset pending if it was something
                pendingGestureRef.current = null;
                pendingGestureStartTimeRef.current = 0;
            }

            if (isMeditationRef.current && gestureRef.current !== "Meditation") {
                // Trigger speech for meditation start
                gestureRef.current = "Meditation";
                setGesture("Meditation");
                const msg = "Deep meditation detected. Your energy is rising rapidly.";

                if (msg !== lastSpeechTextRef.current || now - lastSpeechTimeRef.current > 10000) {
                    setFeedback(msg);
                    speak(msg);
                    lastSpeechTextRef.current = msg;
                    lastSpeechTimeRef.current = now;
                }
            }

            // 3. Logic: Aura & Energy
            const isYogaMode = !!currentGesture || isMeditationRef.current;

            // Aura Dynamics
            if (isYogaMode) {
                auraIntensityRef.current = Math.min(1.0, auraIntensityRef.current + 0.08); // Faster Rise
            } else {
                auraIntensityRef.current = Math.max(0.0, auraIntensityRef.current - 0.08); // Faster Fade
            }

            // Energy Dynamics
            const energies = energiesRef.current;
            let allBalanced = true;

            if (isMeditationRef.current) {
                // SUPER FAST Rise for ALL chakras (Peaking to 100)
                for (let i = 0; i < 7; i++) {
                    energies[i] = Math.min(1.0, energies[i] + 0.02); // ~2% per frame (very fast)
                    if (energies[i] < 1.0) allBalanced = false;
                }
            } else if (currentGesture) {
                // If ANY gesture is active, slowly rise ALL energies (so boxes aren't empty)
                for (let i = 0; i < 7; i++) {
                    energies[i] = Math.min(1.0, energies[i] + 0.001); // Slow base rise
                }

                if (currentGesture === "Gyan Mudra") {
                    // Specific Rise (Faster)
                    energies[0] = Math.min(1.0, energies[0] + 0.005); // Root
                    energies[6] = Math.min(1.0, energies[6] + 0.005); // Crown
                }
                // Add other mudras here if needed

                allBalanced = false;
            } else if (!isYogaMode) {
                // FAST DECAY when inactive
                for (let i = 0; i < 7; i++) {
                    energies[i] = Math.max(0.0, energies[i] - 0.01); // Fast decay
                }
                allBalanced = false;
            } else {
                allBalanced = false;
            }

            // Check for Full Balance Event
            if (allBalanced && gestureRef.current !== "Balanced") {
                gestureRef.current = "Balanced";
                const msg = "All Chakras are perfectly balanced. You are in harmony.";
                setFeedback(msg);
                speak(msg);
            }

            // Sync UI occasionally (every 10 frames)
            if (Math.floor(t * 30) % 10 === 0) {
                setUiEnergies([...energies]);

                // Update Session Time
                const elapsedMin = (Date.now() - startTimeRef.current) / 60000;
                setSessionTime(`${elapsedMin.toFixed(1)} min`);

                // Update Mood
                if (isMeditationRef.current) {
                    setMood("Peaceful");
                } else if (gestureRef.current) {
                    setMood("Focused");
                } else if (eyesClosedTimeRef.current > 0) {
                    setMood("Calm");
                } else {
                    setMood("Relaxed");
                }
            }

            // 4. Draw Visuals

            // BACKGROUND SUN AURA (Instead of revolving stars on head)
            if (auraIntensityRef.current > 0.01) {
                ctx.save();
                const cx = width / 2;
                const cy = height / 2;
                const maxRadius = Math.max(width, height) * 0.8;
                const gradient = ctx.createRadialGradient(cx, cy, 100, cx, cy, maxRadius);
                gradient.addColorStop(0, `rgba(255, 215, 0, ${auraIntensityRef.current * 0.3})`); // Gold center
                gradient.addColorStop(0.5, `rgba(255, 140, 0, ${auraIntensityRef.current * 0.1})`); // Orange mid
                gradient.addColorStop(1, "rgba(0, 0, 0, 0)");

                ctx.fillStyle = gradient;
                ctx.fillRect(0, 0, width, height);
                ctx.restore();
            }

            // Speed factor depends on yoga mode
            const speedFactor = isYogaMode ? 2.0 : 0.5;

            drawUniverse(ctx, width, height, t, speedFactor);
            const breathFactor = 1.0 + 0.1 * Math.sin(t * 0.8);

            drawChakras(
                ctx,
                width * 0.5,
                height * 0.2,
                height * 0.8,
                activeIndexRef.current,
                energies,
                breathFactor,
                t
            );

            requestRef.current = requestAnimationFrame(animate);
        };

        requestRef.current = requestAnimationFrame(animate);
        return () => cancelAnimationFrame(requestRef.current);
    }, [handLandmarker, faceLandmarker]);

    return (
        <div className="relative w-full h-screen bg-[#0a0a0a] overflow-hidden flex flex-col font-sans selection:bg-green-500/30">
            {isLoading && (
                <div className="absolute z-50 top-0 left-0 w-full h-full bg-black/90 flex flex-col items-center justify-center gap-4">
                    <div className="w-16 h-16 border-4 border-green-500 border-t-transparent rounded-full animate-spin"></div>
                    <div className="text-green-400 text-xl font-light tracking-widest animate-pulse">
                        INITIALIZING AI MODELS...
                    </div>
                </div>
            )}

            {/* Indian Flag (Top Left - Floating) */}
            <div className="absolute top-6 left-8 z-40 group cursor-default">
                <div className="flex flex-col items-center transform transition-transform group-hover:scale-105 duration-300">
                    <div className="w-12 h-3 bg-[#FF9933] rounded-t-sm shadow-sm"></div>
                    <div className="w-12 h-3 bg-white flex items-center justify-center relative shadow-sm">
                        <div className="w-2.5 h-2.5 rounded-full border-[1.5px] border-[#000080] flex items-center justify-center animate-spin-slow">
                            <div className="w-0.5 h-0.5 bg-[#000080] rounded-full"></div>
                        </div>
                    </div>
                    <div className="w-12 h-3 bg-[#138808] rounded-b-sm shadow-sm"></div>
                    <div className="text-[8px] text-white/60 mt-1 font-bold tracking-[0.2em] opacity-0 group-hover:opacity-100 transition-opacity">JAI HIND</div>
                </div>
            </div>

            {/* Voice Toggle & Arduino Connect (Top Right - Floating Glass) */}
            <div className="absolute top-6 right-8 z-40 flex flex-col gap-3 items-end">
                <button
                    onClick={toggleListening}
                    className={`
                        px-5 py-2.5 rounded-full backdrop-blur-xl border transition-all duration-300 flex items-center gap-3 shadow-lg
                        ${isListening
                            ? "bg-red-500/20 border-red-500/50 text-red-400 shadow-[0_0_20px_rgba(239,68,68,0.3)]"
                            : "bg-white/5 border-white/10 text-white hover:bg-white/10 hover:border-white/30"
                        }
                    `}
                >
                    {isListening ? (
                        <>
                            <span className="relative flex h-3 w-3">
                                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-red-400 opacity-75"></span>
                                <span className="relative inline-flex rounded-full h-3 w-3 bg-red-500"></span>
                            </span>
                            <span className="font-medium text-sm tracking-wide">Listening...</span>
                        </>
                    ) : (
                        <>
                            <span className="text-lg">🎙️</span>
                            <span className="font-medium text-sm tracking-wide">Voice AI</span>
                        </>
                    )}
                </button>

                {/* Arduino Connect Button */}
                <button
                    onClick={connectArduino}
                    className={`
                        px-5 py-2.5 rounded-full backdrop-blur-xl border transition-all duration-300 flex items-center gap-3 shadow-lg
                        ${arduinoData.isConnected
                            ? "bg-green-500/20 border-green-500/50 text-green-400 shadow-[0_0_20px_rgba(34,197,94,0.3)]"
                            : "bg-blue-500/10 border-blue-500/30 text-blue-300 hover:bg-blue-500/20 hover:border-blue-500/50"
                        }
                    `}
                >
                    {arduinoData.isConnected ? (
                        <>
                            <span className="relative flex h-3 w-3">
                                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-green-400 opacity-75"></span>
                                <span className="relative inline-flex rounded-full h-3 w-3 bg-green-500"></span>
                            </span>
                            <span className="font-medium text-sm tracking-wide">Sensor Active</span>
                        </>
                    ) : (
                        <>
                            <span className="text-lg">🔌</span>
                            <span className="font-medium text-sm tracking-wide">Connect Sensor</span>
                        </>
                    )}
                </button>
            </div>

            {/* Bio Analytics Panel (Floating Left-Center) */}
            <div className="absolute top-24 left-36 z-30">
                <BioAnalyticsPanel
                    heartRate={arduinoData.heartRate}
                    spo2={arduinoData.spo2}
                    beatDetected={arduinoData.beatDetected}
                    isConnected={arduinoData.isConnected}
                    energyLevel={uiEnergies.reduce((a, b) => a + b, 0) / 7} // Avg Energy
                    stressLevel={Math.max(0, 1 - (uiEnergies[3] || 0))} // Inverse of Heart Chakra? Or just mock based on HR
                    focusScore={uiEnergies[5] || 0.5} // Third Eye
                />
            </div>

            {!isPlaying && (
                <div className="absolute z-50 top-0 left-0 w-full h-full bg-black/80 backdrop-blur-sm flex items-center justify-center">
                    <button
                        onClick={toggleAudio}
                        className="
                            group relative px-10 py-5 bg-transparent overflow-hidden rounded-full
                            border border-green-500/50 text-white shadow-[0_0_40px_rgba(34,197,94,0.2)]
                            transition-all duration-500 hover:shadow-[0_0_60px_rgba(34,197,94,0.4)] hover:border-green-400
                        "
                    >
                        <div className="absolute inset-0 w-full h-full bg-green-600/20 group-hover:bg-green-600/30 transition-all duration-500"></div>
                        <span className="relative text-2xl font-light tracking-widest flex items-center gap-4">
                            <span>START JOURNEY</span>
                            <span className="text-3xl">🕉️</span>
                        </span>
                    </button>
                </div>
            )}

            <TopBar
                sessionTime={sessionTime}
                mood={mood}
            />

            <div className="flex-1 flex relative z-10">
                <LeftSidebar energies={uiEnergies} />

                <div className="flex-1 relative flex items-center justify-center overflow-hidden">
                    {/* Vignette Overlay */}
                    <div className="absolute inset-0 z-20 pointer-events-none bg-[radial-gradient(circle_at_center,transparent_0%,rgba(0,0,0,0.4)_80%,rgba(0,0,0,0.8)_100%)]"></div>

                    {/* Grid Overlay (Subtle) */}
                    <div className="absolute inset-0 z-10 pointer-events-none opacity-[0.03]"
                        style={{ backgroundImage: 'linear-gradient(#fff 1px, transparent 1px), linear-gradient(90deg, #fff 1px, transparent 1px)', backgroundSize: '40px 40px' }}>
                    </div>

                    <video
                        ref={videoRef}
                        className="absolute w-full h-full object-cover opacity-0"
                        playsInline
                        muted
                    />
                    <canvas
                        ref={canvasRef}
                        className="w-full h-full object-cover"
                    />
                </div>

                <RightSidebar activeGesture={gesture} />
            </div>

            <BottomOverlay
                gesture={gesture}
                feedback={feedback}
                logs={logs}
            />
        </div>
    );
}
