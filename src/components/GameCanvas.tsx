import React, { useEffect, useRef, useState } from "react";
import { createInitialState, updateGameState } from "../game/engine";
import { renderGame } from "../game/renderer";
import { audioManager } from "../game/audio";
import {
  GAME_WIDTH,
  GAME_HEIGHT,
  setGameDimensions,
  WeaponType,
} from "../game/types";
import { Shield, Zap, Skull, Maximize, Minimize } from "lucide-react";
import { getPlayerProfile, PlayerProfile } from '../lib/player';
import { submitScore } from '../lib/firebase';
import { signInWithGoogle, signOutUser, onAuthChange, loadProgress, saveProgress } from '../lib/firebase';
import type { GameProgress } from '../lib/firebase';
import type { User } from 'firebase/auth';
import { LeaderboardView } from './LeaderboardView';

export default function GameCanvas() {
  const containerRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const gameState = useRef(createInitialState());
  const keys = useRef<Record<string, boolean>>({});
  const requestRef = useRef<number>();
  const lastTime = useRef<number>(performance.now());
  const [profile, setProfile] = useState<PlayerProfile | null>(null);
  const [user, setUser] = useState<User | null>(null);
  const [cloudBest, setCloudBest] = useState<number>(0);

  // Display settings
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [gameSize, setGameSize] = useState({ width: 500, height: 900 });

  useEffect(() => {
    getPlayerProfile().then(setProfile);
  }, []);

  // Track Firebase auth state and load the signed-in user's cloud progress.
  useEffect(() => {
    const unsub = onAuthChange(async (u) => {
      setUser(u);
      if (u) {
        try {
          const progress = await loadProgress(u.uid);
          if (progress) {
            setCloudBest(progress.bestDistance || 0);
            if ((progress.bestDistance || 0) > highScore) {
              setHighScore(progress.bestDistance);
            }
          }
        } catch (err) {
          console.error('Failed to load progress:', err);
        }
      } else {
        setCloudBest(0);
      }
    });
    return () => unsub();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (!containerRef.current) return;
    const ro = new ResizeObserver((entries) => {
      for (const entry of entries) {
        const { width, height } = entry.contentRect;
        setGameSize({ width, height });
        setGameDimensions(width, height);
      }
    });
    ro.observe(containerRef.current);
    return () => ro.disconnect();
  }, [isFullscreen]);

  // HUD State
  const [distance, setDistance] = useState(0);
  const [level, setLevel] = useState(1);
  const [isGameOver, setIsGameOver] = useState(false);
  const [highScore, setHighScore] = useState(0);

  useEffect(() => {
    const storedScore = localStorage.getItem("endlessRacerHighScore");
    if (storedScore) {
      setHighScore(parseInt(storedScore, 10));
    }
  }, []);

  useEffect(() => {
    if (isGameOver) {
      if (distance > highScore) {
        setHighScore(distance);
        localStorage.setItem("endlessRacerHighScore", distance.toString());
      }
      if (profile && distance > 0) {
        submitScore(profile.id, distance, profile.country, profile.countryCode);
      }
      if (user && distance > 0) {
        const best = Math.max(distance, cloudBest, highScore);
        saveProgress(user.uid, {
          bestDistance: best,
          lastPlayed: Date.now(),
          displayName: user.displayName || (profile ? profile.name : 'Racer'),
        }).catch((err) => console.error('Failed to save progress:', err));
        setCloudBest(best);
    }
      }
  }, [isGameOver, distance, highScore, profile]);
  const [activeWeapon, setActiveWeapon] = useState<WeaponType | null>(null);
  const [weaponTimer, setWeaponTimer] = useState(0);
  const [intensity, setIntensity] = useState(0);
  const [activeTaunt, setActiveTaunt] = useState<{ text: string } | null>(null);
  const [weatherCondition, setWeatherCondition] = useState<
    "NONE" | "RAIN" | "FOG"
  >("NONE");

  // Joypad State
  const [joypadKnob, setJoypadKnob] = useState({ x: 0, y: 0 });

  const [isPaused, setIsPaused] = useState(false);
  const pausedRef = useRef(false);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'p' || e.key === 'P') {
        pausedRef.current = !pausedRef.current;
        setIsPaused(pausedRef.current);
      }
      keys.current[e.key] = true;
      audioManager.init();
      audioManager.resume();
    };
    const handleKeyUp = (e: KeyboardEvent) => {
      keys.current[e.key] = false;
    };

    window.addEventListener("keydown", handleKeyDown);
    window.addEventListener("keyup", handleKeyUp);

    return () => {
      window.removeEventListener("keydown", handleKeyDown);
      window.removeEventListener("keyup", handleKeyUp);
    };
  }, []);

  const resetGame = () => {
    gameState.current = createInitialState();
    setIsGameOver(false);
    lastTime.current = performance.now();
  };

  useEffect(() => {
    const animate = (time: number) => {
      const dt = (time - lastTime.current) / 1000;
      lastTime.current = time;

      if (pausedRef.current && !gameState.current.isGameOver) {
        audioManager.stopEngine();
        requestRef.current = requestAnimationFrame(animate);
        return;
      }

      // Cap dt to prevent massive jumps on lag
      const cappedDt = Math.min(dt, 0.05);

      updateGameState(gameState.current, cappedDt, keys.current);

      const canvas = canvasRef.current;
      if (canvas) {
        const ctx = canvas.getContext("2d");
        if (ctx) {
          renderGame(ctx, gameState.current);
        }
      }

      // Update HUD at lower frequency or directly if changed roughly
      if (!gameState.current.isGameOver) {
        setDistance(Math.floor(gameState.current.distance / 100)); // meters
        setLevel(gameState.current.level);
        setActiveWeapon(gameState.current.player.activeWeapon);
        setWeaponTimer(gameState.current.player.weaponTimer);

        const calcIntensity = Math.min(
          100,
          Math.max(
            0,
            (gameState.current.speed - 400) / 10 + gameState.current.level * 2,
          ),
        );
        setIntensity(calcIntensity);
        setWeatherCondition(gameState.current.weather || "NONE");

        if (gameState.current.activeTaunt) {
          setActiveTaunt({ text: gameState.current.activeTaunt.text });
        } else {
          setActiveTaunt(null);
        }
      } else if (gameState.current.gameOverTimer > 1.0) {
        setIsGameOver(true);
      }

      // engine humming based on state.speed
      if (!gameState.current.isGameOver) {
        audioManager.updateEngine(gameState.current.speed);
      } else {
        audioManager.stopEngine();
      }

      requestRef.current = requestAnimationFrame(animate);
    };

    requestRef.current = requestAnimationFrame(animate);

    return () => {
      if (requestRef.current) cancelAnimationFrame(requestRef.current);
    };
  }, []);

  const handleTouchStart = (key: string) => {
    keys.current[key] = true;
    audioManager.init();
    audioManager.resume();
  };
  const handleTouchEnd = (key: string) => {
    keys.current[key] = false;
  };

  const handleJoypadEvent = (e: React.PointerEvent<HTMLDivElement>) => {
    e.preventDefault();

    if (e.type === "pointerdown") {
      e.currentTarget.setPointerCapture(e.pointerId);
      audioManager.init();
      audioManager.resume();
    }

    if (e.type === "pointerup" || e.type === "pointercancel") {
      if (e.currentTarget.hasPointerCapture(e.pointerId)) {
        e.currentTarget.releasePointerCapture(e.pointerId);
      }
      keys.current["ArrowUp"] = false;
      keys.current["ArrowDown"] = false;
      keys.current["ArrowLeft"] = false;
      keys.current["ArrowRight"] = false;
      setJoypadKnob({ x: 0, y: 0 });
      return;
    }

    if (e.type === "pointermove" && e.buttons === 0) {
      return; // hovering on desktop without pressing
    }

    const rect = e.currentTarget.getBoundingClientRect();
    const centerX = rect.left + rect.width / 2;
    const centerY = rect.top + rect.height / 2;

    const dx = e.clientX - centerX;
    const dy = e.clientY - centerY;

    const distance = Math.sqrt(dx * dx + dy * dy);
    const deadzone = 15;

    if (distance < deadzone) {
      keys.current["ArrowUp"] = false;
      keys.current["ArrowDown"] = false;
      keys.current["ArrowLeft"] = false;
      keys.current["ArrowRight"] = false;
      setJoypadKnob({ x: 0, y: 0 });
      return;
    }

    const maxDist = rect.width / 2;
    const angle = Math.atan2(dy, dx);

    // limit knob visual dist
    const knobDist = Math.min(distance, maxDist * 0.7);
    setJoypadKnob({
      x: Math.cos(angle) * knobDist,
      y: Math.sin(angle) * knobDist,
    });

    keys.current["ArrowRight"] = dx > 20;
    keys.current["ArrowLeft"] = dx < -20;
    keys.current["ArrowUp"] = dy < -20;
    keys.current["ArrowDown"] = dy > 20;
  };

  return (
    <div className="relative flex flex-col items-center justify-center h-[100dvh] bg-black sm:bg-gray-950 sm:p-4 overflow-hidden touch-none w-full">
      {/* HUD Backdrop for contrast */}
      <div className="hidden sm:block absolute inset-0 bg-[radial-gradient(ellipse_at_center,_var(--tw-gradient-stops))] from-gray-900 to-gray-950 -z-10" />

      {/* Main Game Container */}
      <div
        ref={containerRef}
        className={`relative flex shadow-none sm:shadow-2xl overflow-hidden w-full h-full bg-black transition-all duration-300 ${isFullscreen ? "max-w-none sm:rounded-none sm:ring-0" : "max-w-lg sm:rounded-xl sm:ring-4 sm:ring-gray-800"}`}
      >
        {/* Canvas */}
        <canvas
          ref={canvasRef}
          width={gameSize.width}
          height={gameSize.height}
          className="absolute inset-0 w-full h-full"
        />

        {/* Top HUD Overlay */}
        <div className="absolute top-0 left-0 w-full px-4 pt-4 pb-12 flex justify-between items-start z-10 bg-gradient-to-b from-black/80 to-transparent pointer-events-none">
          <div className="flex flex-col gap-2 pointer-events-none">
            <div className="flex items-center gap-3">
              <div className="bg-gray-900/80 backdrop-blur px-3 py-1 rounded-lg border border-gray-700 font-mono text-white text-base shadow-lg">
                {distance} m
              </div>
              <div className="bg-blue-900/80 backdrop-blur px-2 py-1 rounded-md border border-blue-700 font-mono text-blue-200 text-xs shadow-lg">
                LVL {level}
              </div>
              {weatherCondition === "RAIN" && (
                <div className="bg-blue-800/80 backdrop-blur px-2 py-1 rounded-md border border-blue-400 font-mono text-blue-100 text-xs shadow-lg animate-pulse">
                  CAUTION: RAIN
                </div>
              )}
              {weatherCondition === "FOG" && (
                <div className="bg-slate-700/80 backdrop-blur px-2 py-1 rounded-md border border-slate-400 font-mono text-slate-100 text-xs shadow-lg animate-pulse">
                  LOW VISIBILITY
                </div>
              )}
            </div>
            <div className="bg-gray-900/80 backdrop-blur px-2 py-1.5 rounded-lg border border-gray-700 w-32 shadow-lg pointer-events-none">
              <div className="flex justify-between text-[10px] text-gray-400 font-mono mb-1">
                <span>INTENSITY</span>
                <span>{Math.floor(intensity)}%</span>
              </div>
              <div className="h-1 w-full bg-gray-800 rounded-full border border-gray-700 relative overflow-hidden">
                <div
                  className="absolute left-0 top-0 h-full transition-all duration-300"
                  style={{
                    width: `${Math.min(100, intensity)}%`,
                    backgroundColor:
                      intensity > 80
                        ? "#ef4444"
                        : intensity > 50
                          ? "#facc15"
                          : "#4ade80",
                  }}
                />
              </div>
            </div>
          </div>

          {/* Weapon Status */}
          <div className="pointer-events-none flex flex-col items-end gap-2">
            <div className="flex gap-2">
              <button
                onClick={() => {
                  keys.current["v"] = true;
                  setTimeout(() => {
                    keys.current["v"] = false;
                  }, 50);
                }}
                className="pointer-events-auto bg-gray-900/80 backdrop-blur px-3 py-1.5 rounded-lg border border-gray-700 font-mono text-white text-xs shadow-lg active:scale-95 transition-transform"
              >
                CAM
              </button>
              <button
                onClick={() => setIsFullscreen(!isFullscreen)}
                className="pointer-events-auto bg-gray-900/80 backdrop-blur px-2 py-1.5 rounded-lg border border-gray-700 text-gray-400 hover:text-white shadow-lg active:scale-95 transition-transform"
                title="Toggle Fullscreen"
              >
                {isFullscreen ? (
                  <Minimize className="w-4 h-4" />
                ) : (
                  <Maximize className="w-4 h-4" />
                )}
              </button>
            </div>
            {/* Active Weapon Indicator */}
            <div
              className={`
                w-12 h-12 rounded-xl flex items-center justify-center border-2 backdrop-blur transition-all duration-300 shadow-xl
                ${activeWeapon ? "bg-amber-500/30 border-amber-500" : "bg-gray-800/60 border-gray-700"}
             `}
            >
              {activeWeapon === "SHIELD" && (
                <Shield className="w-6 h-6 text-blue-400 drop-shadow-[0_0_8px_rgba(59,130,246,0.8)]" />
              )}
              {activeWeapon === "BUMP" && (
                <Zap className="w-6 h-6 text-amber-400 drop-shadow-[0_0_8px_rgba(251,191,36,0.8)]" />
              )}
              {activeWeapon === "SAW" && (
                <Skull className="w-6 h-6 text-red-500 drop-shadow-[0_0_8px_rgba(239,68,68,0.8)]" />
              )}
              {!activeWeapon && (
                <span className="text-gray-500 font-mono text-[10px]">
                  NONE
                </span>
              )}
            </div>
          </div>
        </div>

        {/* Bottom Controls Overlay */}
        <div className="absolute bottom-6 left-0 w-full px-6 flex justify-between items-end z-20 pb-safe">
          {/* Steering Joypad */}
          <div
            onContextMenu={(e) => e.preventDefault()}
            onPointerDown={handleJoypadEvent}
            onPointerMove={handleJoypadEvent}
            onPointerUp={handleJoypadEvent}
            onPointerCancel={handleJoypadEvent}
            className="relative w-36 h-36 sm:w-40 sm:h-40 rounded-full bg-black/20 border border-white/10 backdrop-blur shadow-[0_0_20px_rgba(0,0,0,0.5)] flex items-center justify-center select-none"
            style={{
              touchAction: "none",
              WebkitTouchCallout: "none",
              WebkitUserSelect: "none",
            }}
          >
            {/* Inner Ring (Static visual) */}
            <div className="absolute w-20 h-20 sm:w-20 sm:h-20 rounded-full border border-white/5 pointer-events-none flex items-center justify-center overflow-hidden">
              <div className="w-full h-[1px] bg-white/5 absolute" />
              <div className="w-[1px] h-full bg-white/5 absolute" />
            </div>

            {/* Moving Knob */}
            <div
              className="absolute w-12 h-12 sm:w-14 sm:h-14 rounded-full bg-white/30 border-2 border-white/50 shadow-[0_0_15px_rgba(255,255,255,0.2)] pointer-events-none transition-transform duration-75"
              style={{
                transform: `translate(${joypadKnob.x}px, ${joypadKnob.y}px)`,
              }}
            />
          </div>

          {/* Action */}
          <button
            onContextMenu={(e) => e.preventDefault()}
            onPointerDown={(e) => {
              e.preventDefault();
              handleTouchStart(" ");
            }}
            onPointerUp={(e) => {
              e.preventDefault();
              handleTouchEnd(" ");
            }}
            onPointerLeave={() => handleTouchEnd(" ")}
            className={`w-20 h-20 sm:w-24 sm:h-24 rounded-full flex items-center justify-center text-white font-bold select-none text-xl sm:text-2xl shadow-[0_0_15px_rgba(0,0,0,0.5)] transition-colors border-2 outline-none backdrop-blur
                ${activeWeapon ? "bg-amber-600/80 active:bg-amber-500 border-amber-400" : "bg-gray-800/40 active:bg-gray-700/60 border-gray-600/50"}`}
            style={{
              touchAction: "none",
              WebkitTouchCallout: "none",
              WebkitUserSelect: "none",
            }}
          >
            USE
          </button>
        </div>

        {/* Taunt Overlay */}
        {activeTaunt && (
          <div className="absolute top-[25%] left-1/2 -translate-x-1/2 z-30 pointer-events-none animate-bounce">
            <div className="bg-red-600/90 text-white font-black italic tracking-widest px-4 py-2 rounded-xl text-3xl sm:text-4xl shadow-[0_0_20px_rgba(220,38,38,0.8)] border-4 border-red-500 transform -rotate-2">
              "{activeTaunt.text}"
            </div>
          </div>
        )}

        {/* Pause Screen Overlay */}
        {isPaused && !isGameOver && (
          <div className="absolute inset-0 bg-black/60 backdrop-blur-sm flex flex-col items-center justify-center z-40 p-6 text-center pointer-events-none">
            <h2 className="text-5xl sm:text-6xl font-black text-white mb-2 tracking-widest drop-shadow-[0_0_15px_rgba(255,255,255,0.8)] animate-pulse">
              PAUSED
            </h2>
            <p className="text-gray-300 font-mono text-sm tracking-widest uppercase">
              Press 'P' to resume
            </p>
          </div>
        )}

        {/* Game Over Screen Overlay within game boundary */}
        {isGameOver && (
          <div className="absolute inset-0 bg-black/80 backdrop-blur-md flex flex-col items-center justify-center z-50 p-6 text-center">
            <div className="text-amber-400 font-mono text-sm tracking-widest mb-4 bg-amber-900/30 px-3 py-1 rounded-full border border-amber-700">
              ALL-TIME BEST: {Math.max(highScore, distance)} m
            </div>
            <h2 className="text-5xl sm:text-6xl font-black text-red-500 mb-2 tracking-tighter drop-shadow-[0_0_15px_rgba(239,68,68,0.5)]">
              WRECKED
            </h2>
            <p className="text-gray-300 font-mono text-xl mb-6 bg-gray-900/50 px-4 py-2 rounded-lg border border-gray-800 shadow-xl">
              Distance: <strong className="text-white">{distance}</strong> m
            </p>

            <button
              onClick={resetGame}
              className="px-8 py-4 bg-white hover:bg-gray-200 text-black font-black rounded-full tracking-widest uppercase shadow-[0_0_20px_rgba(255,255,255,0.4)] hover:scale-105 active:scale-95 transition-all text-lg w-full max-w-xs pointer-events-auto mt-4 mb-8"
            >
              Race Again
            </button>

            {profile && <LeaderboardView profile={profile} currentDistance={Math.max(highScore, distance)} />}

            {/* auth-panel-injected */}
            <div className="absolute top-4 right-4 flex flex-col items-end gap-2 z-50 pointer-events-auto">
              {user ? (
                <>
                  <p className="text-amber-300 font-mono text-xs bg-black/50 px-2 py-1 rounded">
                    {user.displayName || 'Racer'}
                  </p>
                  <button
                    onClick={() => signOutUser().catch((e) => console.error(e))}
                    className="px-4 py-1.5 bg-gray-800/80 hover:bg-gray-700 text-white font-bold rounded-full text-[10px] tracking-widest uppercase transition-all border border-gray-600"
                  >
                    Sign Out
                  </button>
                </>
              ) : (
                <button
                  onClick={() => signInWithGoogle().catch((e) => console.error(e))}
                  className="px-4 py-2 bg-white hover:bg-gray-100 text-gray-800 font-bold rounded-full text-xs tracking-widest shadow-lg transition-all flex items-center gap-2 border border-gray-200"
                >
                  <svg className="w-4 h-4" viewBox="0 0 24 24">
                    <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/>
                    <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/>
                    <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81 1.38z"/>
                    <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/>
                  </svg>
                  SIGN IN TO SAVE
                </button>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
