import { useState, useRef, useCallback } from 'react';

export interface ArduinoData {
    heartRate: number;
    spo2: number;
    beatDetected: boolean;
    isConnected: boolean;
}

export function useArduino() {
    const [data, setData] = useState<ArduinoData>({
        heartRate: 0,
        spo2: 0,
        beatDetected: false,
        isConnected: false,
    });

    const [error, setError] = useState<string | null>(null);
    const portRef = useRef<SerialPort | null>(null);
    const readerRef = useRef<ReadableStreamDefaultReader<string> | null>(null);
    const isReadingRef = useRef(false);
    const lastBeatTimeRef = useRef<number>(0);

    const parseLine = useCallback((line: string) => {
        // Expected format: "BPM:75,SpO2:98" or similar
        if (!line) return;

        const parts = line.split(',');
        let newHr = 0;
        let newSpo2 = 0;
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

        if (newHr > 0 || newSpo2 > 0) {
            if (newHr > 0) {
                const now = Date.now();
                const beatInterval = 60000 / newHr;
                if (now - lastBeatTimeRef.current > beatInterval) {
                    beat = true;
                    lastBeatTimeRef.current = now;
                }
            }

            setData(prev => ({
                ...prev,
                heartRate: newHr || prev.heartRate,
                spo2: newSpo2 || prev.spo2,
                beatDetected: beat
            }));

            if (beat) {
                setTimeout(() => setData(prev => ({ ...prev, beatDetected: false })), 100);
            }
        }
    }, []);

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
            const readableStreamClosed = port.readable!.pipeTo(textDecoder.writable);
            const reader = textDecoder.readable.getReader();
            readerRef.current = reader;
            isReadingRef.current = true;

            readLoop();
        } catch (err) {
            console.error("Error connecting to Arduino:", err);
            setError(err instanceof Error ? err.message : String(err));
            setData(prev => ({ ...prev, isConnected: false }));
        }
    }, [readLoop]); // Removed readLoop from dependency array to avoid circular dependency, relying on closure

    return {
        arduinoData: data,
        connectArduino: connect,
        disconnectArduino: disconnect,
        arduinoError: error
    };
}
