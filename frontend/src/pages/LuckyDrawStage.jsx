import { useState, useEffect, useRef, useCallback } from 'react';

// Deterministic particle arrays — computed once at module level so JSX renders
// produce stable values without needing useMemo.
const SPARKLE_PARTICLES = Array.from({ length: 20 }, (_, i) => ({
  left:     `${(i * 4.7 + 5) % 90}%`,
  bottom:   `${(i * 3.1) % 45 + 5}%`,
  size:     6 + (i * 5) % 14,
  color:    `hsl(${(i * 47) % 360}, 90%, 70%)`,
  duration: `${(1.5 + (i * 0.17) % 2).toFixed(2)}s`,
  delay:    `${((i * 0.23) % 2.5).toFixed(2)}s`,
}));

const CONFETTI_PARTICLES = Array.from({ length: 30 }, (_, i) => ({
  isLeft:   i < 15,
  x:        (i % 15) * 3,                          // 0–42 px in from edge
  yStart:   30 + ((i % 15) * 11 + 7) % 45,         // 30–75% down the screen (mid-area)
  width:    8  + (i * 3) % 12,
  height:   12 + (i * 5) % 16,
  color:    `hsl(${(i * 37) % 360}, 85%, 60%)`,
  duration: `${(1.6 + (i * 0.1) % 0.8).toFixed(2)}s`, // shorter = punchier burst
  delay:    `${((i * 0.15) % 2).toFixed(2)}s`,
}));

export default function LuckyDrawStage() {
  // stage states: standby | rolling | revealing | reveal | intermission | complete
  const [state, setState] = useState('standby');
  const [currentRound, setCurrentRound] = useState(null);
  const [currentRoundName, setCurrentRoundName] = useState('');
  const [nextRound, setNextRound] = useState(null);
  const [rollingName, setRollingName] = useState('');
  // Single winner shown during 'revealing' phase (one at a time)
  const [currentRevealingWinner, setCurrentRevealingWinner] = useState(null);
  // All winners shown during 'reveal' summary phase
  const [revealedWinners, setRevealedWinners] = useState([]);
  const [totalWinnersCount, setTotalWinnersCount] = useState(0);
  const [allComplete, setAllComplete] = useState(false);
  const [isExiting, setIsExiting] = useState(false);
  const [bgConfig, setBgConfig] = useState({
    color1: '#667eea', color2: '#764ba2', color3: '#f093fb', speed: '8'
  });
  // Mutable ref — always holds the latest winner card config without closure staleness.
  // Never read this in JSX; it is read inside revealWinners → showNext only.
  const winnerCardConfigRef = useRef({
    enabled: false,
    fields: ['full_name', 'staff_id', 'disabled', 'disabled']
  });

  // Stage Modification config — ref for logic inside closures, state for reactive rendering.
  const stageModRef = useRef({ enabled: false, noGroup: false, fx: false });
  const [stageModState, setStageModState] = useState({ enabled: false, noGroup: false, fx: false });
  // Increments each time a new winner card appears during 'revealing'; keyed div re-triggers pulse.
  const [bgFlashKey, setBgFlashKey] = useState(0);

  const channelRef = useRef(null);
  const rollingIntervalRef = useRef(null);
  const registrationNamesRef = useRef([]);
  const exitTimeoutRef = useRef(null);
  const transitionTimeoutRef = useRef(null);
  const revealTimerRef = useRef(null);
  const revealCancelRef = useRef(false);

  // Fetch site config for gradient + winner card + stage mod experimental settings
  useEffect(() => {
    fetch('/api/config')
      .then(r => r.ok ? r.json() : null)
      .then(data => {
        if (data) {
          setBgConfig({
            color1: data.bg_color1 || '#667eea',
            color2: data.bg_color2 || '#764ba2',
            color3: data.bg_color3 || '#f093fb',
            speed: data.bg_animation_speed || '8'
          });
          winnerCardConfigRef.current = {
            enabled: data.exp_winner_card_enabled === '1',
            fields: [
              data.exp_winner_card_field1 || 'full_name',
              data.exp_winner_card_field2 || 'staff_id',
              data.exp_winner_card_field3 || 'disabled',
              data.exp_winner_card_field4 || 'disabled',
            ]
          };
          const smEnabled = data.exp_stage_mod_enabled === '1';
          const smConfig = {
            enabled: smEnabled,
            noGroup: smEnabled && data.exp_stage_mod_no_group === '1',
            fx:      smEnabled && data.exp_stage_mod_fx      === '1',
          };
          stageModRef.current = smConfig;
          setStageModState(smConfig);
        }
      })
      .catch(() => {});
  }, []);

  // Trigger bg-pulse flash each time a new winner card slides in during 'revealing'
  useEffect(() => {
    if (stageModState.fx && currentRevealingWinner) {
      setBgFlashKey(k => k + 1);
    }
  // currentRevealingWinner is intentionally the only dep: fire only when winner changes.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentRevealingWinner]);

  // Fetch registration names for roulette animation
  useEffect(() => {
    fetch('/api/registration/table?page=1&limit=500')
      .then(r => r.ok ? r.json() : null)
      .then(data => {
        if (data && Array.isArray(data.data) && data.data.length > 0) {
          registrationNamesRef.current = data.data.map(r => r.full_name);
        }
      })
      .catch(() => {});
  }, []);

  const stopRolling = useCallback(() => {
    if (rollingIntervalRef.current) {
      clearInterval(rollingIntervalRef.current);
      rollingIntervalRef.current = null;
    }
  }, []);

  const clearPendingTimers = useCallback(() => {
    // Cancel any pending reveal chain
    revealCancelRef.current = true;
    if (revealTimerRef.current) {
      clearTimeout(revealTimerRef.current);
      revealTimerRef.current = null;
    }
    if (exitTimeoutRef.current) {
      clearTimeout(exitTimeoutRef.current);
      exitTimeoutRef.current = null;
    }
    if (transitionTimeoutRef.current) {
      clearTimeout(transitionTimeoutRef.current);
      transitionTimeoutRef.current = null;
    }
  }, []);

  const revealWinners = useCallback((winnersList, roundNumber, roundName, totalRnds, namePool) => {
    setState('rolling');
    setCurrentRound(roundNumber);
    setCurrentRoundName(roundName || `Round ${roundNumber}`);
    setCurrentRevealingWinner(null);
    setRevealedWinners([]);
    setTotalWinnersCount(winnersList.length);
    revealCancelRef.current = false;

    let rollCount = 0;
    const totalRolls = 3000 / 50; // 3 seconds at 50ms intervals

    rollingIntervalRef.current = setInterval(() => {
      rollCount++;
      const randomIdx = Math.floor(Math.random() * namePool.length);
      setRollingName(namePool[randomIdx]);

      if (rollCount >= totalRolls) {
        stopRolling();
        setState('revealing');

        // Show winners one by one, 2 seconds each.
        // Active fields are baked into each winner object here so JSX
        // never needs to read the ref (refs don't trigger re-renders).
        const cfg = winnerCardConfigRef.current;
        const activeFields = cfg.enabled
          ? cfg.fields.filter(f => f !== 'disabled')
          : ['full_name', 'staff_id'];

        const showNext = (idx) => {
          if (revealCancelRef.current) return;

          if (idx < winnersList.length) {
            setCurrentRevealingWinner({ ...winnersList[idx], activeFields });
            revealTimerRef.current = setTimeout(() => {
              showNext(idx + 1);
            }, 2500);
          } else {
            // All winners revealed one-by-one
            revealTimerRef.current = null;

            if (stageModRef.current.noGroup) {
              // "Disable Grouped Winners" is on — skip the summary screen.
              // The last winner card stays visible; after 7 s transition out.
              if (channelRef.current) {
                channelRef.current.postMessage({ type: 'round_complete', roundNumber });
              }
              exitTimeoutRef.current = setTimeout(() => {
                exitTimeoutRef.current = null;
                setIsExiting(true);
                transitionTimeoutRef.current = setTimeout(() => {
                  transitionTimeoutRef.current = null;
                  setIsExiting(false);
                  if (roundNumber >= totalRnds) {
                    setAllComplete(true);
                  } else {
                    setNextRound(roundNumber + 1);
                    setState('intermission');
                  }
                }, 700);
              }, 7000);
            } else {
              // Normal flow — switch to grouped summary view
              setRevealedWinners(winnersList);
              setState('reveal');

              if (channelRef.current) {
                channelRef.current.postMessage({ type: 'round_complete', roundNumber });
              }

              // Wait 7s then either exit to intermission or complete
              exitTimeoutRef.current = setTimeout(() => {
                exitTimeoutRef.current = null;
                setIsExiting(true);
                transitionTimeoutRef.current = setTimeout(() => {
                  transitionTimeoutRef.current = null;
                  setIsExiting(false);
                  if (roundNumber >= totalRnds) {
                    setAllComplete(true);
                  } else {
                    setNextRound(roundNumber + 1);
                    setState('intermission');
                  }
                }, 700);
              }, 7000);
            }
          }
        };

        showNext(0);
      }
    }, 50);
  }, [stopRolling]);

  useEffect(() => {
    channelRef.current = new BroadcastChannel('luckydraw');

    channelRef.current.onmessage = (event) => {
      const { type, roundNumber, roundName, totalRounds: total, winners: winnersList } = event.data;

      if (type === 'run_round') {
        clearPendingTimers();
        stopRolling();
        setIsExiting(false);
        setAllComplete(false);
        const pool = registrationNamesRef.current.length > 0
          ? registrationNamesRef.current
          : ['Loading...'];

        // Re-fetch config before starting so Winner Card settings are always
        // fresh. revealWinners is called INSIDE .then() so the ref is
        // guaranteed updated before showNext ever fires.
        fetch('/api/config')
          .then(r => r.ok ? r.json() : null)
          .then(data => {
            if (data) {
              winnerCardConfigRef.current = {
                enabled: data.exp_winner_card_enabled === '1',
                fields: [
                  data.exp_winner_card_field1 || 'full_name',
                  data.exp_winner_card_field2 || 'staff_id',
                  data.exp_winner_card_field3 || 'disabled',
                  data.exp_winner_card_field4 || 'disabled',
                ]
              };
              const smEnabled = data.exp_stage_mod_enabled === '1';
              const smConfig = {
                enabled: smEnabled,
                noGroup: smEnabled && data.exp_stage_mod_no_group === '1',
                fx:      smEnabled && data.exp_stage_mod_fx      === '1',
              };
              stageModRef.current = smConfig;
              setStageModState(smConfig);
            }
            revealWinners(winnersList, roundNumber, roundName, total, pool);
          })
          .catch(() => {
            // Config fetch failed — use whatever ref holds and proceed anyway
            revealWinners(winnersList, roundNumber, roundName, total, pool);
          });
      }
    };

    return () => {
      stopRolling();
      clearPendingTimers();
      if (channelRef.current) channelRef.current.close();
    };
  }, [revealWinners, stopRolling, clearPendingTimers]);

  const fxActive = stageModState.fx;
  // 5.1.1 — A second overlay div always runs the fast version; its opacity cross-fades
  //         in/out via CSS transition, giving a smooth speedup and slowdown effect.
  const fastBgSpeed = `${Math.max(1.5, parseFloat(bgConfig.speed) / 4).toFixed(1)}s`;
  const bgStyle = {
    backgroundImage: `linear-gradient(-45deg, ${bgConfig.color1}, ${bgConfig.color2}, ${bgConfig.color3}, ${bgConfig.color1})`,
    backgroundSize: '400% 400%',
    animation: `gradientShift ${bgConfig.speed}s ease infinite`,
  };

  const manyWinners = totalWinnersCount > 4;
  const lotsOfWinners = totalWinnersCount > 7;

  return (
    <div className="stage-container" style={bgStyle}>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Orbitron:wght@400;500;600;700;800;900&family=Rajdhani:wght@300;400;500;600;700&display=swap');

        @keyframes gradientShift {
          0% { background-position: 0% 50%; }
          50% { background-position: 100% 50%; }
          100% { background-position: 0% 50%; }
        }
        @keyframes pulse {
          0%, 100% { opacity: 0.6; transform: scale(1); }
          50% { opacity: 1; transform: scale(1.02); }
        }
        @keyframes glow {
          0%, 100% { text-shadow: 0 0 20px rgba(255,255,255,0.3), 0 0 40px rgba(255,255,255,0.1); }
          50% { text-shadow: 0 0 40px rgba(255,255,255,0.6), 0 0 80px rgba(255,255,255,0.3); }
        }
        @keyframes rollFlash {
          0%, 100% { opacity: 1; }
          50% { opacity: 0.7; }
        }
        @keyframes celebrateIn {
          0% { opacity: 0; transform: translateY(28px); }
          100% { opacity: 1; transform: translateY(0); }
        }
        @keyframes fallAndFade {
          0% { opacity: 1; transform: translateY(0); }
          100% { opacity: 0; transform: translateY(55px); }
        }
        @keyframes fadeInUp {
          0% { opacity: 0; transform: translateY(20px); }
          100% { opacity: 1; transform: translateY(0); }
        }
        @keyframes winnerSlideIn {
          0% { opacity: 0; transform: translateX(80px); }
          100% { opacity: 1; transform: translateX(0); }
        }

        /* ── Special Effects (5.1.x) ─────────────────────────────────── */

        /* 5.1.1 — Speed overlay: full-screen gradient running at 4× speed;
                   React transitions its opacity for smooth speedup/slowdown. */
        .stage-bg-fx-speed-overlay {
          position: absolute; inset: 0;
          pointer-events: none; z-index: 0;
        }

        /* 5.1.2 — One-shot radial pulse on each winner card transition */
        @keyframes winnerBgPulse {
          0%   { opacity: 0.55; }
          100% { opacity: 0; }
        }
        .stage-winner-bg-pulse {
          position: fixed; inset: 0;
          background: radial-gradient(ellipse at center, rgba(255,255,255,0.32) 0%, transparent 68%);
          pointer-events: none; z-index: 0;
          animation: winnerBgPulse 0.9s ease-out forwards;
        }

        /* 5.1.3 — Orbiting rainbow outline on the winner card edge.
                   @property lets the browser smoothly interpolate the conic-gradient
                   start angle, so the rainbow sweeps continuously around the border. */
        @property --rainbow-angle {
          syntax: '<angle>';
          initial-value: 0deg;
          inherits: false;
        }
        @keyframes rainbowOrbitSpin {
          to { --rainbow-angle: 360deg; }
        }
        .winner-fx-rainbow-wrap {
          --rainbow-angle: 0deg;
          background: conic-gradient(from var(--rainbow-angle),
            #ff0000, #ff7700, #ffff00, #00ff00, #00ffff, #0000ff, #9400d3, #ff0000);
          animation: rainbowOrbitSpin 3s linear infinite;
          padding: 4px;
          border-radius: 23px;
          overflow: hidden;
        }

        /* 5.1.4 — Sparkle particles drifting up throughout the stage */
        @keyframes sparkleFloat {
          0%   { opacity: 0; transform: scale(0.3) translateY(0); }
          25%  { opacity: 1; }
          100% { opacity: 0; transform: scale(0.8) translateY(-110px); }
        }

        /* 5.1.5 — Confetti burst from the screen edges (popper physics).
                   Keyframes encode the physics: large distance in the first 20% of
                   time = explosive start; diminishing distance per frame = slowdown.
                   linear timing preserves this distribution faithfully. */
        @keyframes confettiBurstLeft {
          0%   { opacity: 1;   transform: translateX(0)     translateY(0)     rotate(0deg); }
          20%  { opacity: 1;   transform: translateX(160px) translateY(-60px) rotate(240deg); }
          55%  { opacity: 0.8; transform: translateX(220px) translateY(60px)  rotate(500deg); }
          100% { opacity: 0;   transform: translateX(280px) translateY(280px) rotate(820deg); }
        }
        @keyframes confettiBurstRight {
          0%   { opacity: 1;   transform: translateX(0)      translateY(0)     rotate(0deg);   }
          20%  { opacity: 1;   transform: translateX(-160px) translateY(-60px) rotate(-240deg); }
          55%  { opacity: 0.8; transform: translateX(-220px) translateY(60px)  rotate(-500deg); }
          100% { opacity: 0;   transform: translateX(-280px) translateY(280px) rotate(-820deg); }
        }

        /* Dynamic field entries inside the winner prize card left panel */
        .winner-field {
          overflow-wrap: break-word;
          word-break: break-word;
          line-height: 1.25;
          max-width: 100%;
        }

        * { margin: 0; padding: 0; box-sizing: border-box; }

        .stage-container {
          width: 100vw; height: 100vh;
          display: flex; align-items: center; justify-content: center;
          font-family: 'Rajdhani', sans-serif;
          overflow: hidden; position: relative;
        }
        .stage-container::after {
          content: ''; position: absolute; bottom: 0; left: 0; right: 0;
          height: 160px; backdrop-filter: blur(10px); -webkit-backdrop-filter: blur(10px);
          mask-image: linear-gradient(to top, black 20%, transparent 100%);
          -webkit-mask-image: linear-gradient(to top, black 20%, transparent 100%);
          pointer-events: none; z-index: 4;
        }
        .stage-content {
          text-align: center; color: #fff; z-index: 1; padding: 2rem;
          width: 100%; max-width: 1100px; max-height: 100vh;
          display: flex; flex-direction: column; align-items: center; justify-content: center;
        }

        /* Standby */
        .stage-standby h1 {
          font-family: 'Orbitron', sans-serif; font-size: 4rem; font-weight: 700;
          letter-spacing: 0.15em; animation: pulse 3s ease-in-out infinite;
          text-shadow: 0 0 30px rgba(255,255,255,0.3);
        }
        .stage-standby p { font-size: 1.5rem; margin-top: 1rem; opacity: 0.7; letter-spacing: 0.1em; }

        /* Rolling */
        .stage-rolling { display: flex; flex-direction: column; align-items: center; gap: 2rem; }
        .stage-rolling .round-label { font-family: 'Orbitron', sans-serif; font-size: 2rem; letter-spacing: 0.1em; opacity: 0.8; }
        .rolling-name {
          font-family: 'Orbitron', sans-serif; font-size: 5rem; font-weight: 800;
          animation: rollFlash 0.1s linear infinite;
          text-shadow: 0 0 40px rgba(255,255,255,0.5);
          min-height: 7rem; display: flex; align-items: center; justify-content: center;
        }

        /* Revealing — single winner with prize */
        .stage-revealing {
          display: flex; flex-direction: column; align-items: center;
          gap: 1.5rem; width: 100%;
        }
        .stage-revealing .round-label {
          font-family: 'Orbitron', sans-serif; font-size: 2rem;
          letter-spacing: 0.1em; opacity: 0.8;
          animation: glow 2s ease-in-out infinite;
        }
        .winner-prize-card {
          display: flex; align-items: stretch; gap: 0;
          width: 100%; max-width: 860px;
          background: rgba(255,255,255,0.13);
          backdrop-filter: blur(24px); -webkit-backdrop-filter: blur(24px);
          border: 1px solid rgba(255,255,255,0.25);
          border-radius: 20px; overflow: hidden;
          animation: winnerSlideIn 0.5s cubic-bezier(0.34,1.56,0.64,1) both;
        }
        .winner-prize-left {
          flex: 1; padding: 2.5rem 2.5rem;
          display: flex; flex-direction: column; justify-content: center;
          border-right: 1px solid rgba(255,255,255,0.15);
          text-align: left;
        }
        .winner-prize-left .winner-name {
          font-family: 'Orbitron', sans-serif; font-size: 2.2rem; font-weight: 700;
          overflow-wrap: break-word; word-break: break-word;
          line-height: 1.25;
        }
        .winner-prize-left .winner-id {
          font-size: 1.3rem; opacity: 0.65; margin-top: 0.5rem;
          font-family: 'Rajdhani', sans-serif; letter-spacing: 0.05em;
        }
        .winner-prize-right {
          width: 340px; flex-shrink: 0;
          display: flex; flex-direction: column;
          align-items: center; justify-content: center;
          gap: 0.75rem; padding: 1.5rem;
          background: rgba(0,0,0,0.15);
        }
        .winner-prize-img {
          width: 100%; aspect-ratio: 7/3;
          border-radius: 10px; overflow: hidden;
          background: rgba(255,255,255,0.06);
          border: 1px solid rgba(255,255,255,0.15);
        }
        .winner-prize-img img {
          width: 100%; height: 100%; object-fit: cover;
        }
        .winner-prize-name {
          font-family: 'Orbitron', sans-serif; font-size: 1.1rem; font-weight: 600;
          text-align: center; letter-spacing: 0.04em;
        }
        .winner-prize-id {
          font-size: 0.85rem; opacity: 0.55;
          font-family: 'Orbitron', sans-serif; letter-spacing: 0.06em;
        }

        /* Reveal summary */
        .stage-reveal {
          display: flex; flex-direction: column; align-items: center;
          gap: 1rem; width: 100%; max-height: 100vh; overflow: hidden;
        }
        .stage-reveal .round-label {
          font-family: 'Orbitron', sans-serif; font-size: 2.5rem;
          letter-spacing: 0.1em; animation: glow 2s ease-in-out infinite; flex-shrink: 0;
        }
        .stage-reveal.exiting .round-label { animation: fallAndFade 0.45s ease-in forwards; }
        .stage-reveal.exiting .winners-display { animation: fallAndFade 0.6s ease-in 0.07s forwards; }

        .winners-display {
          display: flex; flex-direction: column; gap: 0.75rem;
          width: 100%; max-width: 700px;
          max-height: calc(100vh - 10rem);
          overflow-y: auto; overflow-x: hidden; padding: 0.5rem 1rem;
          scrollbar-width: none; -ms-overflow-style: none;
        }
        .winners-display::-webkit-scrollbar { display: none; }
        .winners-display.grid-layout {
          display: grid; grid-template-columns: repeat(2, 1fr); max-width: 900px;
        }
        .winners-display.many-cols {
          grid-template-columns: repeat(3, 1fr); max-width: 1050px;
        }

        .winner-reveal-card {
          background: rgba(255,255,255,0.15);
          backdrop-filter: blur(20px); -webkit-backdrop-filter: blur(20px);
          border: 1px solid rgba(255,255,255,0.25); border-radius: 16px;
          padding: 1.5rem 2.5rem;
          animation: celebrateIn 0.65s cubic-bezier(0.34,1.56,0.64,1) both;
          text-shadow: 0 0 10px rgba(255,255,255,0.2);
        }
        .winner-reveal-card.compact { padding: 0.75rem 1.5rem; border-radius: 10px; }
        .winner-reveal-card .winner-name {
          font-family: 'Orbitron', sans-serif; font-size: 2rem; font-weight: 700;
          overflow-wrap: break-word; word-break: break-word;
        }
        .winner-reveal-card.compact .winner-name { font-size: 1.2rem; }
        .winner-reveal-card .winner-id { font-size: 1.2rem; opacity: 0.7; margin-top: 0.25rem; }
        .winner-reveal-card.compact .winner-id { font-size: 0.9rem; }

        /* Intermission */
        .stage-intermission {
          display: flex; flex-direction: column; align-items: center; gap: 1rem;
          animation: fadeInUp 0.6s ease-out both;
        }
        .stage-intermission .intermission-round {
          font-family: 'Orbitron', sans-serif; font-size: 2rem; letter-spacing: 0.1em; opacity: 0.7;
        }
        .stage-intermission h1 {
          font-family: 'Orbitron', sans-serif; font-size: 4rem; font-weight: 700;
          letter-spacing: 0.15em; animation: pulse 3s ease-in-out infinite;
          text-shadow: 0 0 30px rgba(255,255,255,0.3);
        }
        .stage-intermission p { font-size: 1.5rem; margin-top: 0.5rem; opacity: 0.7; letter-spacing: 0.1em; }

        /* Complete */
        .stage-complete { animation: fadeInUp 0.7s ease-out both; }
        .stage-complete h1 {
          font-family: 'Orbitron', sans-serif; font-size: 3.5rem; font-weight: 700;
          letter-spacing: 0.1em; animation: glow 2s ease-in-out infinite;
        }
        .stage-complete p { font-size: 1.5rem; opacity: 0.7; margin-top: 1rem; }
      `}</style>

      {/* 5.1.1 — Fast gradient overlay; always runs but cross-fades in only during rolling */}
      {fxActive && (
        <div
          className="stage-bg-fx-speed-overlay"
          style={{
            backgroundImage: bgStyle.backgroundImage,
            backgroundSize: bgStyle.backgroundSize,
            animation: `gradientShift ${fastBgSpeed} ease infinite`,
            opacity: state === 'rolling' ? 1 : 0,
            transition: 'opacity 1.5s ease',
          }}
        />
      )}

      {/* 5.1.2 — Background pulse: keyed so each new winner card triggers a fresh animation */}
      {fxActive && state === 'revealing' && (
        <div key={bgFlashKey} className="stage-winner-bg-pulse" />
      )}

      {/* 5.1.4 — Sparkle particles drifting up throughout the entire roulette stage */}
      {fxActive && state !== 'standby' && SPARKLE_PARTICLES.map((p, i) => (
        <div
          key={i}
          style={{
            position: 'fixed', left: p.left, bottom: p.bottom,
            width: `${p.size}px`, height: `${p.size}px`,
            borderRadius: '50%', background: p.color,
            pointerEvents: 'none', zIndex: 0,
            animation: `sparkleFloat ${p.duration} ${p.delay} ease-out infinite`,
          }}
        />
      ))}

      {/* 5.1.5 — Confetti popper burst from left and right edges on congratulations screen */}
      {allComplete && fxActive && CONFETTI_PARTICLES.map((p, i) => (
        <div
          key={i}
          style={{
            position: 'fixed',
            [p.isLeft ? 'left' : 'right']: `${p.x}px`,
            top: `${p.yStart}%`,
            width: `${p.width}px`, height: `${p.height}px`,
            borderRadius: '2px', background: p.color,
            pointerEvents: 'none', zIndex: 10,
            animation: `${p.isLeft ? 'confettiBurstLeft' : 'confettiBurstRight'} ${p.duration} ${p.delay} linear infinite`,
          }}
        />
      ))}

      <div className="stage-content">
        {allComplete ? (
          <div className="stage-complete">
            <h1>ALL ROUNDS COMPLETE</h1>
            <p>Congratulations to all winners!</p>
          </div>

        ) : state === 'intermission' ? (
          <div className="stage-intermission">
            <div className="intermission-round">ROUND {nextRound}</div>
            <h1>STANDBY</h1>
            <p>Awaiting Lucky Draw</p>
          </div>

        ) : state === 'standby' ? (
          <div className="stage-standby">
            <h1>STANDBY</h1>
            <p>Awaiting Lucky Draw</p>
          </div>

        ) : state === 'rolling' ? (
          <div className="stage-rolling">
            <div className="round-label">{currentRoundName || `ROUND ${currentRound}`}</div>
            <div className="rolling-name">{rollingName}</div>
          </div>

        ) : state === 'revealing' ? (
          <div className="stage-revealing">
            <div className="round-label">{currentRoundName || `ROUND ${currentRound}`}</div>
            {currentRevealingWinner && (() => {
              const w = currentRevealingWinner;
              // activeFields was baked in by showNext using the ref at display time
              const activeFields = w.activeFields || ['full_name', 'staff_id'];
              const fieldMap = {
                full_name:  w.fullName   || w.name || '',
                staff_id:   w.staffId    || '',
                title:      w.title      || '',
                department: w.department || '',
                location:   w.location   || '',
              };
              return (
                <div className={fxActive ? 'winner-fx-rainbow-wrap' : undefined}>
                  <div key={w.staffId + (w.prizeId || '')} className="winner-prize-card">
                    <div className="winner-prize-left">
                      {activeFields.map((field, idx) => (
                        <div
                          key={field}
                          className={idx === 0 ? 'winner-name winner-field' : 'winner-id winner-field'}
                          style={{ fontSize: idx === 0 ? 'clamp(1rem, 3.5vw, 2.2rem)' : 'clamp(0.7rem, 1.8vw, 1.3rem)' }}
                        >
                          {fieldMap[field]}
                        </div>
                      ))}
                    </div>
                    <div className="winner-prize-right">
                      <div className="winner-prize-img">
                        <img
                          src={w.prizePicture || '/RewardsFallback.png'}
                          alt={w.prizeName || ''}
                          onError={(e) => { e.target.src = '/RewardsFallback.png'; }}
                        />
                      </div>
                      {w.prizeName && (
                        <div className="winner-prize-name" style={{ fontSize: 'clamp(0.7rem, 1.5vw, 1.1rem)' }}>{w.prizeName}</div>
                      )}
                      {w.prizeId && (
                        <div className="winner-prize-id">{w.prizeId}</div>
                      )}
                    </div>
                  </div>
                </div>
              );
            })()}
          </div>

        ) : state === 'reveal' ? (
          <div className={`stage-reveal${isExiting ? ' exiting' : ''}`}>
            <div className="round-label">{currentRoundName || `ROUND ${currentRound}`} — WINNERS</div>
            <div className={`winners-display${lotsOfWinners ? ' grid-layout many-cols' : manyWinners ? ' grid-layout' : ''}`}>
              {revealedWinners.map((winner, idx) => (
                <div
                  key={idx}
                  className={`winner-reveal-card${lotsOfWinners ? ' compact' : ''}`}
                  style={{ animationDelay: `${idx * 0.08}s` }}
                >
                  <div className="winner-name">{winner.fullName || winner.name}</div>
                  {winner.staffId && <div className="winner-id">{winner.staffId}</div>}
                </div>
              ))}
            </div>
          </div>

        ) : null}
      </div>
    </div>
  );
}
