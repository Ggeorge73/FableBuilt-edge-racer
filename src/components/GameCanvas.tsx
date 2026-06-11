import { useEffect, useRef, useState, useCallback } from 'react';
import { createInitialState, updateGameState, getRoadSegmentAt, InputState } from '../game/engine';
import { SkyWorld } from '../game/world';
import { audioManager } from '../game/audio';
import { GameState, WeaponType, WEAPON_INFO, realmForLevel, WeatherType, Whisper } from '../game/types';
import { getPlayerProfile, PlayerProfile } from '../lib/player';
import {
  submitScore,
  signInWithGoogle,
  signOutUser,
  onAuthChange,
  loadProgress,
  saveProgress,
} from '../lib/firebase';
import type { User } from 'firebase/auth';
import { LeaderboardView } from './LeaderboardView';

type Phase = 'title' | 'playing' | 'gameover';

const WEAPON_GLYPH: Record<WeaponType, string> = {
  GUST: '≋',
  AURA: '◉',
  SHARD: '✦',
};

const WEATHER_LABEL: Record<WeatherType, string> = {
  NONE: '',
  RAIN: 'rain of light',
  FOG: 'the veil thickens',
};

interface HudState {
  distance: number;
  level: number;
  realmName: string;
  weapon: WeaponType | null;
  cooling: boolean;
  weather: WeatherType;
  whisper: Whisper | null;
}

export default function GameCanvas() {
  const containerRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const worldRef = useRef<SkyWorld | null>(null);
  const stateRef = useRef<GameState>(createInitialState());
  const phaseRef = useRef<Phase>('title');
  const pausedRef = useRef(false);
  const keysRef = useRef<Record<string, boolean>>({});
  const inputRef = useRef<InputState>({
    left: false,
    right: false,
    up: false,
    down: false,
    action: false,
    axisX: 0,
    axisY: 0,
  });
  const requestRef = useRef<number>(0);
  const lastTime = useRef<number>(performance.now());
  const lastHudSync = useRef<number>(0);
  const edgeWarnRef = useRef<HTMLDivElement>(null);
  const joyRef = useRef<HTMLDivElement>(null);
  const knobRef = useRef<HTMLDivElement>(null);
  const touchAnchor = useRef<{ id: number; x: number; y: number } | null>(null);

  const [phase, setPhase] = useState<Phase>('title');
  const [isPaused, setIsPaused] = useState(false);
  const [muted, setMuted] = useState(false);
  const [hud, setHud] = useState<HudState>({
    distance: 0,
    level: 1,
    realmName: realmForLevel(1).realm.name,
    weapon: null,
    cooling: false,
    weather: 'NONE',
    whisper: null,
  });
  const [finalDistance, setFinalDistance] = useState(0);
  const [highScore, setHighScore] = useState(0);
  const [isNewRecord, setIsNewRecord] = useState(false);

  // -- profile & auth ---------------------------------------------------------
  const [profile, setProfile] = useState<PlayerProfile | null>(null);
  const [user, setUser] = useState<User | null>(null);
  const cloudBestRef = useRef(0);

  useEffect(() => {
    getPlayerProfile().then(setProfile);
    const stored = localStorage.getItem('endlessRacerHighScore');
    if (stored) setHighScore(parseInt(stored, 10));
  }, []);

  useEffect(() => {
    const unsub = onAuthChange(async (u) => {
      setUser(u);
      if (u) {
        try {
          const progress = await loadProgress(u.uid);
          if (progress) {
            cloudBestRef.current = progress.bestDistance || 0;
            setHighScore((hs) => Math.max(hs, progress.bestDistance || 0));
          }
        } catch (err) {
          console.error('Failed to load progress:', err);
        }
      } else {
        cloudBestRef.current = 0;
      }
    });
    return () => unsub();
  }, []);

  // -- keep phase in a ref for the loop ---------------------------------------
  useEffect(() => {
    phaseRef.current = phase;
  }, [phase]);
  useEffect(() => {
    pausedRef.current = isPaused;
  }, [isPaused]);

  // -- score persistence on game over ------------------------------------------
  const handleGameOver = useCallback(
    (distance: number) => {
      const d = Math.floor(distance);
      setFinalDistance(d);
      setIsNewRecord(d > highScore && d > 0);
      if (d > highScore) {
        setHighScore(d);
        localStorage.setItem('endlessRacerHighScore', d.toString());
      }
      if (profile && d > 0) {
        submitScore(profile.id, d, profile.country, profile.countryCode);
      }
      if (user && d > 0) {
        const best = Math.max(d, cloudBestRef.current, highScore);
        saveProgress(user.uid, {
          bestDistance: best,
          lastPlayed: Date.now(),
          displayName: user.displayName || (profile ? profile.name : 'Racer'),
        }).catch((err) => console.error('Failed to save progress:', err));
        cloudBestRef.current = best;
      }
    },
    [highScore, profile, user],
  );
  const handleGameOverRef = useRef(handleGameOver);
  useEffect(() => {
    handleGameOverRef.current = handleGameOver;
  }, [handleGameOver]);
  const gameOverHandled = useRef(false);

  // -- world setup -------------------------------------------------------------
  useEffect(() => {
    if (!canvasRef.current || !containerRef.current) return;
    const world = new SkyWorld(canvasRef.current);
    worldRef.current = world;

    const ro = new ResizeObserver((entries) => {
      for (const entry of entries) {
        const { width, height } = entry.contentRect;
        world.resize(Math.max(1, width), Math.max(1, height));
      }
    });
    ro.observe(containerRef.current);

    return () => {
      ro.disconnect();
      world.dispose();
      worldRef.current = null;
    };
  }, []);

  // -- main loop ----------------------------------------------------------------
  useEffect(() => {
    const loop = (now: number) => {
      requestRef.current = requestAnimationFrame(loop);
      const dt = Math.min((now - lastTime.current) / 1000, 0.05);
      lastTime.current = now;
      const world = worldRef.current;
      if (!world) return;

      const state = stateRef.current;
      const ph = phaseRef.current;

      if (ph === 'title') {
        // attract mode: a spirit autopilot drifts along the road
        const seg = getRoadSegmentAt(state.road, state.player.y - 120);
        const auto: InputState = {
          left: false,
          right: false,
          up: false,
          down: false,
          action: false,
          axisX: seg ? Math.max(-1, Math.min(1, (seg.centerX - state.player.x) / 60)) : 0,
          axisY: 0,
        };
        updateGameState(state, dt, auto);
        if (state.isGameOver) {
          stateRef.current = createInitialState(); // quietly reborn
        }
      } else if (ph === 'playing' && !pausedRef.current) {
        const keys = keysRef.current;
        const input = inputRef.current;
        input.left = !!(keys['ArrowLeft'] || keys['a'] || keys['A']);
        input.right = !!(keys['ArrowRight'] || keys['d'] || keys['D']);
        input.up = !!(keys['ArrowUp'] || keys['w'] || keys['W']);
        input.down = !!(keys['ArrowDown'] || keys['s'] || keys['S']);
        if (keys[' ']) input.action = true;

        updateGameState(state, dt, input);
        input.action = false;

        if (state.isGameOver && !gameOverHandled.current) {
          gameOverHandled.current = true;
          handleGameOverRef.current(state.distance);
        }
        if (state.isGameOver && state.gameOverTimer > 1.9) {
          phaseRef.current = 'gameover';
          setPhase('gameover');
        }
      }

      // audio reactions to engine events
      for (const ev of state.events) {
        switch (ev.type) {
          case 'pickup':
            audioManager.playChime();
            break;
          case 'collision':
            audioManager.playImpact(ev.intensity);
            break;
          case 'weapon':
            audioManager.playWeapon();
            break;
          case 'shatter':
            audioManager.playShatter();
            break;
          case 'playerFall':
            audioManager.playFall();
            break;
          case 'slip':
            audioManager.playSlip();
            break;
          case 'levelUp':
            audioManager.playBlessing();
            break;
        }
      }

      audioManager.setIntensity(
        Math.min(1, (state.speed - 400) / 700),
        phaseRef.current === 'playing' ? state.edgeProximity : 0,
      );

      world.update(state, dt); // consumes burst events for visuals
      state.events.length = 0;

      // direct-DOM edge warning (no react re-render at 60fps)
      if (edgeWarnRef.current) {
        const danger = phaseRef.current === 'playing' && !state.isGameOver ? state.edgeProximity : 0;
        edgeWarnRef.current.style.opacity = (danger * 0.9).toFixed(2);
      }

      // throttled HUD sync
      if (now - lastHudSync.current > 120) {
        lastHudSync.current = now;
        if (phaseRef.current === 'playing') {
          setHud({
            distance: Math.floor(state.distance),
            level: state.level,
            realmName: realmForLevel(state.level).realm.name,
            weapon: state.player.activeWeapon,
            cooling: state.player.weaponCooldown > 0,
            weather: state.weather,
            whisper: state.whisper,
          });
        }
      }
    };

    requestRef.current = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(requestRef.current);
  }, []);

  // -- keyboard ----------------------------------------------------------------
  useEffect(() => {
    const down = (e: KeyboardEvent) => {
      keysRef.current[e.key] = true;
      if (e.key === ' ') e.preventDefault();
      if ((e.key === 'p' || e.key === 'P' || e.key === 'Escape') && phaseRef.current === 'playing') {
        setIsPaused((p) => !p);
      }
      if (e.key === 'm' || e.key === 'M') {
        setMuted((m) => {
          audioManager.setMuted(!m);
          return !m;
        });
      }
      if (e.key === 'Enter') {
        if (phaseRef.current === 'title') begin();
        else if (phaseRef.current === 'gameover') flyAgain();
      }
    };
    const up = (e: KeyboardEvent) => {
      keysRef.current[e.key] = false;
    };
    window.addEventListener('keydown', down);
    window.addEventListener('keyup', up);
    return () => {
      window.removeEventListener('keydown', down);
      window.removeEventListener('keyup', up);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // -- touch joystick -----------------------------------------------------------
  const onPointerDown = (e: React.PointerEvent) => {
    if (phaseRef.current !== 'playing' || pausedRef.current) return;
    if (e.pointerType === 'mouse') return;
    if (touchAnchor.current) return;
    touchAnchor.current = { id: e.pointerId, x: e.clientX, y: e.clientY };
    if (joyRef.current) {
      joyRef.current.style.display = 'block';
      joyRef.current.style.left = `${e.clientX}px`;
      joyRef.current.style.top = `${e.clientY}px`;
    }
  };
  const onPointerMove = (e: React.PointerEvent) => {
    const anchor = touchAnchor.current;
    if (!anchor || anchor.id !== e.pointerId) return;
    const dx = e.clientX - anchor.x;
    const dy = e.clientY - anchor.y;
    const r = 55;
    inputRef.current.axisX = Math.max(-1, Math.min(1, dx / r));
    inputRef.current.axisY = Math.max(-1, Math.min(1, dy / r));
    if (knobRef.current) {
      const cx = Math.max(-r, Math.min(r, dx));
      const cy = Math.max(-r, Math.min(r, dy));
      knobRef.current.style.transform = `translate(calc(-50% + ${cx}px), calc(-50% + ${cy}px))`;
    }
  };
  const endTouch = (e: React.PointerEvent) => {
    const anchor = touchAnchor.current;
    if (!anchor || anchor.id !== e.pointerId) return;
    touchAnchor.current = null;
    inputRef.current.axisX = 0;
    inputRef.current.axisY = 0;
    if (joyRef.current) joyRef.current.style.display = 'none';
    if (knobRef.current) knobRef.current.style.transform = 'translate(-50%, -50%)';
  };

  // -- actions -------------------------------------------------------------------
  const begin = () => {
    audioManager.init();
    audioManager.resume();
    stateRef.current = createInitialState();
    gameOverHandled.current = false;
    setIsPaused(false);
    setPhase('playing');
    phaseRef.current = 'playing';
  };

  const flyAgain = () => {
    audioManager.resume();
    stateRef.current = createInitialState();
    gameOverHandled.current = false;
    setIsPaused(false);
    setPhase('playing');
    phaseRef.current = 'playing';
  };

  const toTitle = () => {
    stateRef.current = createInitialState();
    gameOverHandled.current = false;
    setIsPaused(false);
    setPhase('title');
    phaseRef.current = 'title';
  };

  const fireWeapon = () => {
    inputRef.current.action = true;
  };

  const toggleFullscreen = () => {
    if (!document.fullscreenElement) {
      document.documentElement.requestFullscreen?.().catch(() => {});
    } else {
      document.exitFullscreen?.().catch(() => {});
    }
  };

  const toggleMute = () => {
    setMuted((m) => {
      audioManager.setMuted(!m);
      return !m;
    });
  };

  const signIn = async () => {
    try {
      await signInWithGoogle();
    } catch (err) {
      console.error('Sign-in failed:', err);
    }
  };

  // -------------------------------------------------------------------- render
  return (
    <div className="stage" ref={containerRef}>
      <canvas ref={canvasRef} />
      <div className="vignette" />
      <div className="edge-warning" ref={edgeWarnRef} />

      {/* touch steering surface */}
      {phase === 'playing' && (
        <div
          className="touch-zone"
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={endTouch}
          onPointerCancel={endTouch}
        >
          <div className="joystick" ref={joyRef} style={{ display: 'none' }}>
            <div className="joystick-knob" ref={knobRef} />
          </div>
        </div>
      )}

      <div className="overlay">
        {/* ------------------------------------------------ playing HUD */}
        {phase === 'playing' && (
          <>
            <div className="hud-top">
              <div className="hud-distance">
                {hud.distance.toLocaleString()}
                <small>m</small>
              </div>
              <div className="hud-realm">
                {hud.realmName} · ascent {hud.level}
              </div>
              {hud.weather !== 'NONE' && (
                <div className="hud-weather">{WEATHER_LABEL[hud.weather]}</div>
              )}
            </div>

            {hud.whisper && (
              <div key={hud.whisper.text} className={`whisper ${hud.whisper.tone}`}>
                {hud.whisper.text}
              </div>
            )}

            <div className="weapon-charm" onPointerDown={fireWeapon}>
              <div
                className={`charm-ring ${hud.weapon ? 'armed' : ''} ${
                  hud.cooling ? 'cooling' : ''
                }`}
              >
                {hud.weapon ? WEAPON_GLYPH[hud.weapon] : '·'}
              </div>
              <div className="charm-label">
                {hud.weapon ? WEAPON_INFO[hud.weapon].label : 'no charm'}
              </div>
            </div>

            <div className="corner-buttons">
              <button className="icon-btn" onClick={() => setIsPaused(true)} title="Pause (P)">
                ❚❚
              </button>
              <button className="icon-btn" onClick={toggleMute} title="Mute (M)">
                {muted ? '×' : '♪'}
              </button>
              <button className="icon-btn" onClick={toggleFullscreen} title="Fullscreen">
                ⛶
              </button>
            </div>

            {isPaused && (
              <div className="pause-veil">
                <div className="pause-title">a moment of stillness</div>
                <button className="btn" onClick={() => setIsPaused(false)}>
                  Resume
                </button>
                <button className="btn btn-ghost" onClick={toTitle}>
                  Return to sky
                </button>
              </div>
            )}
          </>
        )}

        {/* --------------------------------------------------- title screen */}
        {phase === 'title' && (
          <div className="screen">
            <div className="title-kicker">a journey above the clouds</div>
            <h1 className="title-main">EDGE RACER</h1>
            <div className="title-sub">Realms of Light</div>

            <button className="btn btn-primary" onClick={begin}>
              Take Flight
            </button>

            <div className="menu-meta">
              {highScore > 0 && (
                <span>
                  furthest light · <b>{highScore.toLocaleString()} m</b>
                </span>
              )}
              {user ? (
                <span className="signed-as">
                  flying as {user.displayName || 'traveler'} ·{' '}
                  <a
                    style={{ color: 'inherit', cursor: 'pointer', textDecoration: 'underline' }}
                    onClick={signOutUser}
                  >
                    sign out
                  </a>
                </span>
              ) : (
                <button className="btn btn-ghost" onClick={signIn}>
                  Sign in to keep your light
                </button>
              )}
            </div>

            <div className="controls-hint">
              ← → or A D — glide · ↑ ↓ — surge & ease
              <br />
              space — release charm · p — stillness · drag to steer on touch
            </div>
          </div>
        )}

        {/* ------------------------------------------------- game over screen */}
        {phase === 'gameover' && (
          <div className="screen">
            <div className="gameover-title">the clouds caught you</div>
            <div className="gameover-distance">
              {finalDistance.toLocaleString()}
              <small> m of light</small>
            </div>
            <div className={`gameover-best ${isNewRecord ? 'new-record' : ''}`}>
              {isNewRecord
                ? '✦ a new furthest light ✦'
                : `furthest light · ${highScore.toLocaleString()} m`}
            </div>

            <div className="gameover-actions">
              <button className="btn btn-primary" style={{ marginTop: 0 }} onClick={flyAgain}>
                Fly Again
              </button>
              <button className="btn btn-ghost" onClick={toTitle}>
                Return to sky
              </button>
            </div>

            {!user && (
              <div className="sign-row">
                <button className="btn btn-ghost" onClick={signIn}>
                  Sign in to keep your light
                </button>
              </div>
            )}

            {profile && <LeaderboardView profile={profile} currentDistance={finalDistance} />}
          </div>
        )}
      </div>
    </div>
  );
}
