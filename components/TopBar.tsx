import React from "react";

interface TopBarProps {
    sessionTime: string;
    mood: string;
    posture?: string;
    alignmentMode?: string;
}

export default function TopBar({ sessionTime, mood, posture = "Good", alignmentMode = "Standard" }: TopBarProps) {
    return (
        <div className="absolute top-0 left-0 w-full z-30 flex justify-center pt-4 pointer-events-none">
            <div className="
                flex items-center gap-6 px-8 py-3 
                bg-black/40 backdrop-blur-xl border border-white/10 rounded-full 
                shadow-[0_0_20px_rgba(0,0,0,0.5)]
                text-white font-medium text-sm tracking-wide
            ">
                <div className="flex items-center gap-2">
                    <span className="text-amber-400 font-bold text-lg">AI ChakraFlow</span>
                </div>

                <div className="w-px h-4 bg-white/20"></div>

                <div className="flex items-center gap-2">
                    <span className="text-gray-400 uppercase text-xs">Session</span>
                    <span className="font-mono text-cyan-300">{sessionTime}</span>
                </div>

                <div className="w-px h-4 bg-white/20"></div>

                <div className="flex items-center gap-2">
                    <span className="text-gray-400 uppercase text-xs">Mood</span>
                    <span className="text-purple-300">{mood}</span>
                </div>

                <div className="w-px h-4 bg-white/20"></div>

                <div className="flex items-center gap-2">
                    <span className="text-gray-400 uppercase text-xs">Posture</span>
                    <span className={`text-${posture === "Good" ? "green" : "red"}-400`}>{posture}</span>
                </div>

                {alignmentMode && (
                    <>
                        <div className="w-px h-4 bg-white/20"></div>
                        <div className="flex items-center gap-2">
                            <span className="text-gray-400 uppercase text-xs">Mode</span>
                            <span className="text-blue-300">{alignmentMode}</span>
                        </div>
                    </>
                )}
            </div>
        </div>
    );
}
