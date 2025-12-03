import { useState, useRef, useCallback, useEffect } from 'react';

export interface ArduinoData {
    heartRate: number;
    spo2: number;
    beatDetected: boolean;
    isConnected: boolean;
    hrvIndex: number;
    doshas: {
        vata: number;
        pitta: number;
        kapha: number;
    };
}

export function useArduino() {
    const [data, setData] = useState<ArduinoData>({
        heartRate: 0,
        spo2: 0,
        beatDetected: false,
        isConnected: false,
        hrvIndex: 50,
        doshas: { vata: 0.33, pitta: 0.33, kapha: 0.33 }
    });

    const [error, setError] = useState<string | null>(null);
    const portRef = useRef<SerialPort | null>(null);
    const readerRef = useRef<ReadableStreamDefaultReader<string> | null>(null);
    const isReadingRef = useRef(false);
    const lastBeatTimeRef = useRef<number>(0);
    const lastDataTimeRef = useRef<number>(0);
    const ibiHistoryRef = useRef<number[]>([]);

    // Data Timeout & Reset Logic
    useEffect(() => {
        const interval = setInterval(() => {
            if (data.isConnected && Date.now() - lastDataTimeRef.current > 3000) {
                // No data for 3 seconds, reset
                setData(prev => {
                    if (prev.heartRate === 0 && prev.spo2 === 0) return prev; // Already reset
                    return { ...prev, heartRate: 0, spo2: 0, beatDetected: false, hrvIndex: 0 };
                });
            }
        }, 1000);
        return () => clearInterval(interval);
    }, [data.isConnected]);

    const calculateDoshas = (ibis: number[]) => {
        if (ibis.length < 5) return { vata: 0.33, pitta: 0.33, kapha: 0.33 };

        // Simple simulation based on HRV characteristics
        // Vata: High variability (Irregular)
        // Pitta: Moderate variability (Strong/Fast)
        // Kapha: Low variability (Slow/Steady)

        let rmssd = 0;
        for (let i = 0; i < ibis.length - 1; i++) {
            rmssd += Math.pow(ibis[i + 1] - ibis[i], 2);
        }
        rmssd = Math.sqrt(rmssd / (ibis.length - 1));

        const avgIbi = ibis.reduce((a, b) => a + b, 0) / ibis.length;
        const bpm = 60000 / avgIbi;

        let v = 0.3, p = 0.3, k = 0.3;

        // Vata (Anxiety/Movement) -> High RMSSD, Irregular
        if (rmssd > 50) v += 0.4;

        // Pitta (Heat/Energy) -> High BPM, Moderate RMSSD
        if (bpm > 80) p += 0.4;

        // Kapha (Stability) -> Low BPM, Low RMSSD
        if (bpm < 65 && rmssd < 30) k += 0.4;

        // Normalize
        const total = v + p + k;
        return { vata: v / total, pitta: p / total, kapha: k / total };
    };

    const hrBufferRef = useRef<number[]>([]);

    const parseLine = useCallback((line: string) => {
        // Expected format: "BPM:75,SpO2:98" or similar
        if (!line) return;

        const parts = line.split(',');
        let newHr: number | null = null;
        let newSpo2: number | null = null;
        let beat = false;

        parts.forEach(part => {
            const [key, valStr] = part.split(':');
            if (!key || !valStr) return;

            const val = parseFloat(valStr);

            if (key.includes('BPM') || key.includes('HR')) {
                newHr = val;
            } else if (key.includes('SpO2') || key.includes('O2')) {
                newSpo2 = val;
            } else if (key.includes('BEAT')) {
                beat = val > 0;
            }
        });

        // Update if we got valid keys
        if (newHr !== null || newSpo2 !== null) {
            lastDataTimeRef.current = Date.now();
            const now = Date.now();

            // Beat simulation if not explicit
            if (newHr !== null && newHr > 0) {
                const beatInterval = 60000 / newHr;
                if (now - lastBeatTimeRef.current > beatInterval) {
                    beat = true;
                    // Calculate IBI
                    const ibi = now - lastBeatTimeRef.current;
                    if (ibi > 300 && ibi < 1500) { // Valid IBI
                        ibiHistoryRef.current.push(ibi);
                        if (ibiHistoryRef.current.length > 20) ibiHistoryRef.current.shift();
                    }
                    lastBeatTimeRef.current = now;
                }
            }

            // Calculate Metrics
            let hrv = 50;
            let doshas = { vata: 0.33, pitta: 0.33, kapha: 0.33 };

            if (ibiHistoryRef.current.length > 5) {
                // RMSSD Calculation
                let sumSqDiff = 0;
                for (let i = 0; i < ibiHistoryRef.current.length - 1; i++) {
                    sumSqDiff += Math.pow(ibiHistoryRef.current[i + 1] - ibiHistoryRef.current[i], 2);
                }
                hrv = Math.sqrt(sumSqDiff / (ibiHistoryRef.current.length - 1));
                doshas = calculateDoshas(ibiHistoryRef.current);
            }

            // SMOOTHING LOGIC
            let smoothedHr = 0;
            if (newHr !== null) {
                if (newHr > 0) {
                    hrBufferRef.current.push(newHr);
                    if (hrBufferRef.current.length > 10) hrBufferRef.current.shift(); // Keep last 10 samples
                    smoothedHr = Math.round(hrBufferRef.current.reduce((a, b) => a + b, 0) / hrBufferRef.current.length);
                } else {
                    hrBufferRef.current = []; // Reset buffer on 0
                    smoothedHr = 0;
                }
            } else {
                smoothedHr = data.heartRate; // Keep previous if no new HR
            }

            // SpO2 OVERRIDE LOGIC (User Request: 97-100% when HR active)
            let finalSpo2 = 0;
            if (smoothedHr > 0) {
                // Map HR stability to SpO2 or just random high value
                // Using a pseudo-random based on time to look natural but stay high
                const noise = Math.sin(Date.now() / 1000) * 1.5;
                finalSpo2 = Math.min(100, Math.max(97, 98 + noise));
                finalSpo2 = Math.round(finalSpo2);
            } else {
                finalSpo2 = 0;
            }

            setData(prev => ({
                ...prev,
                heartRate: smoothedHr,
                spo2: finalSpo2,
                beatDetected: beat,
                hrvIndex: Math.round(hrv),
                doshas: doshas
            }));

            if (beat) {
                setTimeout(() => setData(prev => ({ ...prev, beatDetected: false })), 100);
            }
        }
    }, [data.heartRate]);

    const disconnect = useCallback(async () => {
        isReadingRef.current = false;
        if (readerRef.current) {
            await readerRef.current.cancel();
            readerRef.current = null;
        }
        if (portRef.current) {
            await portRef.current.close();
            portRef.current = null;
        }
        setData(prev => ({ ...prev, isConnected: false, heartRate: 0, spo2: 0 }));
    }, []);

    const readLoop = useCallback(async () => {
        let buffer = "";

        while (isReadingRef.current && readerRef.current) {
            try {
                const { value, done } = await readerRef.current.read();
                if (done) {
                    break;
                }
                if (value) {
                    buffer += value;
                    const lines = buffer.split('\n');
                    buffer = lines.pop() || ""; // Keep incomplete line

                    for (const line of lines) {
                        parseLine(line.trim());
                    }
                }
            } catch (err) {
                console.error("Read error:", err);
                setError("Connection lost");
                disconnect();
                break;
            }
        }
    }, [disconnect, parseLine]);

    const connect = useCallback(async () => {
        setError(null);
        if (!("serial" in navigator)) {
            setError("Web Serial API not supported in this browser.");
            return;
        }

        try {
            const port = await navigator.serial.requestPort();
            await port.open({ baudRate: 115200 });
            portRef.current = port;

            setData(prev => ({ ...prev, isConnected: true }));

            const textDecoder = new TextDecoderStream();
            // eslint-disable-next-line @typescript-eslint/no-unused-vars
            const readableStreamClosed = port.readable!.pipeTo(textDecoder.writable as unknown as WritableStream<Uint8Array>);
            const reader = textDecoder.readable.getReader();
            readerRef.current = reader;
            isReadingRef.current = true;

            readLoop();
        } catch (err) {
            console.error("Error connecting to Arduino:", err);
            setError(err instanceof Error ? err.message : String(err));
            setData(prev => ({ ...prev, isConnected: false }));
        }
    }, [readLoop]);

    return {
        arduinoData: data,
        connectArduino: connect,
        disconnectArduino: disconnect,
        arduinoError: error
    };
}
