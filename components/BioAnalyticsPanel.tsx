import React, { useEffect, useRef } from 'react';

interface BioAnalyticsPanelProps {
    heartRate: number;
    spo2: number;
    beatDetected: boolean;
    energyLevel: number; // 0.0 to 1.0
    stressLevel: number; // 0.0 to 1.0 (derived from HRV/Focus)
    focusScore: number; // 0.0 to 1.0
    isConnected: boolean;
}

export default function BioAnalyticsPanel({
    heartRate,
    spo2,
    beatDetected,
    energyLevel,
    stressLevel,
    focusScore,
    isConnected
}: BioAnalyticsPanelProps) {
    const canvasRef = useRef<HTMLCanvasElement>(null);

    // Animation Refs
    const pulseDataRef = useRef<number[]>(new Array(100).fill(0));
    const hrvDataRef = useRef<number[]>(new Array(50).fill(0));
    const pranaDataRef = useRef<number[]>(new Array(100).fill(0));
    const focusDataRef = useRef<number[]>(new Array(100).fill(0.5));
    const phaseRef = useRef(0);
    const animationFrameRef = useRef<number>(0);

    useEffect(() => {
        const canvas = canvasRef.current;
        if (!canvas) return;
        const ctx = canvas.getContext('2d');
        if (!ctx) return;

        const animate = () => {
            phaseRef.current += 0.1;
            const w = canvas.width;
            const h = canvas.height;

            // Clear
            ctx.clearRect(0, 0, w, h);

            // --- UPDATE DATA ---

            // 1. Pulse (ECG)
            if (beatDetected) {
                pulseDataRef.current.push(-0.5, 1.0, -0.2); // Beat spike
            } else {
                pulseDataRef.current.push(Math.random() * 0.05 - 0.025); // Noise
            }
            while (pulseDataRef.current.length > 100) pulseDataRef.current.shift();

            // 2. HRV (Stress Bars)
            const stressNoise = Math.random() * stressLevel;
            hrvDataRef.current.push(stressNoise);
            while (hrvDataRef.current.length > 50) hrvDataRef.current.shift();

            // 3. Prana (Energy Wave)
            const breath = Math.sin(phaseRef.current * 0.2) * 0.1;
            pranaDataRef.current.push(energyLevel + breath);
            while (pranaDataRef.current.length > 100) pranaDataRef.current.shift();

            // 4. Focus (Beam)
            const wobble = (1.0 - focusScore) * 0.2;
            const focusVal = 0.5 + Math.sin(phaseRef.current * 0.5) * wobble + (Math.random() - 0.5) * wobble;
            focusDataRef.current.push(focusVal);
            while (focusDataRef.current.length > 100) focusDataRef.current.shift();


            // --- DRAW GRAPHS ---

            // Helper to draw graph in a box
            const drawGraph = (
                label: string,
                data: number[],
                x: number, y: number, width: number, height: number,
                color: string,
                style: 'line' | 'bars' | 'fill' | 'beam'
            ) => {
                // Background
                ctx.fillStyle = 'rgba(0, 20, 10, 0.6)';
                ctx.fillRect(x, y, width, height);
                ctx.strokeStyle = 'rgba(0, 255, 100, 0.2)';
                ctx.strokeRect(x, y, width, height);

                // Label
                ctx.fillStyle = 'rgba(200, 255, 200, 0.8)';
                ctx.font = '10px monospace';
                ctx.fillText(label, x + 5, y + 12);

                if (style === 'bars') {
                    const barW = width / data.length;
                    data.forEach((val, i) => {
                        const barH = val * height * 0.8;
                        ctx.fillStyle = val > 0.6 ? '#ff4444' : (val > 0.3 ? '#ffff44' : color);
                        ctx.fillRect(x + i * barW, y + height - barH, barW - 1, barH);
                    });
                } else {
                    ctx.beginPath();
                    ctx.strokeStyle = color;
                    ctx.lineWidth = 2;

                    data.forEach((val, i) => {
                        const px = x + (i / data.length) * width;
                        let py = y + height / 2;

                        if (style === 'line') {
                            py = y + height - (val + 0.5) * (height * 0.5); // Centered around 0
                            // Clamp
                            py = Math.max(y, Math.min(y + height, py));
                        } else if (style === 'fill') {
                            py = y + height - (val * height * 0.9);
                        } else if (style === 'beam') {
                            py = y + height - (val * height);
                        }

                        if (i === 0) ctx.moveTo(px, py);
                        else ctx.lineTo(px, py);
                    });
                    ctx.stroke();

                    if (style === 'fill') {
                        ctx.lineTo(x + width, y + height);
                        ctx.lineTo(x, y + height);
                        ctx.fillStyle = color.replace('1)', '0.2)'); // Transparent fill
                        ctx.fill();
                    }
                }
            };

            const graphH = 60;
            const gap = 10;
            const startY = 10;

            drawGraph("HEART RHYTHM", pulseDataRef.current, 10, startY, w - 20, graphH, 'rgba(0, 255, 255, 1)', 'line');
            drawGraph("STRESS / HRV", hrvDataRef.current, 10, startY + graphH + gap, w - 20, graphH, 'rgba(255, 100, 100, 1)', 'bars');
            drawGraph("PRANA ENERGY", pranaDataRef.current, 10, startY + (graphH + gap) * 2, w - 20, graphH, 'rgba(255, 200, 50, 1)', 'fill');
            drawGraph("FOCUS LEVEL", focusDataRef.current, 10, startY + (graphH + gap) * 3, w - 20, graphH, 'rgba(100, 255, 100, 1)', 'beam');

            animationFrameRef.current = requestAnimationFrame(animate);
        };

        animationFrameRef.current = requestAnimationFrame(animate);
        return () => cancelAnimationFrame(animationFrameRef.current);
    }, [beatDetected, energyLevel, stressLevel, focusScore]);

    return (
        <div className="w-80 bg-black/40 backdrop-blur-md border border-white/10 rounded-xl p-4 flex flex-col gap-4">
            <div className="flex justify-between items-center border-b border-white/10 pb-2">
                <h3 className="text-green-400 font-mono tracking-widest text-sm">BIO-ANALYTICS</h3>
                <div className={`w-2 h-2 rounded-full ${isConnected ? 'bg-green-500 animate-pulse' : 'bg-red-500'}`}></div>
            </div>

            {/* Numeric Stats */}
            <div className="grid grid-cols-2 gap-2">
                <div className="bg-black/30 p-2 rounded border border-white/5">
                    <div className="text-[10px] text-gray-400">HEART RATE</div>
                    <div className="text-2xl font-bold text-white font-mono">{heartRate} <span className="text-sm text-gray-500">BPM</span></div>
                </div>
                <div className="bg-black/30 p-2 rounded border border-white/5">
                    <div className="text-[10px] text-gray-400">SpO2</div>
                    <div className="text-2xl font-bold text-blue-400 font-mono">{spo2}%</div>
                </div>
            </div>

            {/* Canvas Graphs */}
            <canvas
                ref={canvasRef}
                width={280}
                height={300}
                className="w-full h-auto rounded bg-black/20"
            />
        </div>
    );
}
