import { useState, useEffect, useRef, useCallback } from 'react';

export default function LuckyDrawStage() {
  const [state, setState] = useState('standby');
  const [currentRound, setCurrentRound] = useState(null);
  const [nextRound, setNextRound] = useState(null);
  const [rollingName, setRollingName] = useState('');
  const [revealedWinners, setRevealedWinners] = useState([]);
  const [allComplete, setAllComplete] = useState(false);
  const [totalWinnersCount, setTotalWinnersCount] = useState(0);
  const [isExiting, setIsExiting] = useState(false);
  const [bgConfig, setBgConfig] = useState({
    color1: '#667eea', color2: '#764ba2', color3: '#f093fb', speed: '8'
  });
  const channelRef = useRef(null);
  const rollingIntervalRef = useRef(null);
  const registrationNamesRef = useRef([]);
  const exitTimeoutRef = useRef(null);
  const transitionTimeoutRef = useRef(null);

  // Fetch site config for gradient
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
        }
      })
      .catch(() => {});
  }, []);

  // Fetch registration names for roulette animation
  useEffect(() => {
    const token = localStorage.getItem('admin_token');
    if (!token) return;
    fetch('/api/registration/table?page=1&limit=500', {
      headers: { Authorization: `Bearer ${token}` }
    })
      .then(r => r.ok ? r.json() : null)
      .then(data => {
        if (data && Array.isArray(data.data) && data.data.length > 0) {
          registrationNamesRef.current = data.data.map(r => r.full_name);
        }
      })
      .catch(() => {});
  }, []);

  const clearPendingTimers = useCallback(() => {
    if (exitTimeoutRef.current) {
      clearTimeout(exitTimeoutRef.current);
      exitTimeoutRef.current = null;
    }
    if (transitionTimeoutRef.current) {
      clearTimeout(transitionTimeoutRef.current);
      transitionTimeoutRef.current = null;
    }
  }, []);

  const stopRolling = useCallback(() => {
    if (rollingIntervalRef.current) {
      clearInterval(rollingIntervalRef.current);
      rollingIntervalRef.current = null;
    }
  }, []);

  const revealWinners = useCallback((winnersList, roundNumber, totalRnds, namePool) => {
    setState('rolling');
    setCurrentRound(roundNumber);
    setRevealedWinners([]);
    setTotalWinnersCount(winnersList.length);

    let rollCount = 0;
    const rollDuration = 3000;
    const rollInterval = 50;
    const totalRolls = rollDuration / rollInterval;

    rollingIntervalRef.current = setInterval(() => {
      rollCount++;
      const randomIdx = Math.floor(Math.random() * namePool.length);
      setRollingName(namePool[randomIdx]);

      if (rollCount >= totalRolls) {
        stopRolling();
        setState('revealing');

        let revealIdx = 0;
        const revealInterval = setInterval(() => {
          if (revealIdx < winnersList.length) {
            const winner = winnersList[revealIdx];
            setRevealedWinners(prev => [...prev, winner]);
            revealIdx++;
          } else {
            clearInterval(revealInterval);
            setState('reveal');

            if (channelRef.current) {
              channelRef.current.postMessage({ type: 'round_complete', roundNumber });
            }

            if (roundNumber >= totalRnds) {
              exitTimeoutRef.current = setTimeout(() => {
                exitTimeoutRef.current = null;
                setAllComplete(true);
              }, 7000);
            } else {
              exitTimeoutRef.current = setTimeout(() => {
                exitTimeoutRef.current = null;
                setIsExiting(true);
                transitionTimeoutRef.current = setTimeout(() => {
                  transitionTimeoutRef.current = null;
                  setIsExiting(false);
                  setNextRound(roundNumber + 1);
                  setState('intermission');
                }, 700);
              }, 7000);
            }
          }
        }, 1500);
      }
    }, rollInterval);
  }, [stopRolling]);

  useEffect(() => {
    channelRef.current = new BroadcastChannel('luckydraw');

    channelRef.current.onmessage = (event) => {
      const { type, roundNumber, totalRounds: total, winners: winnersList } = event.data;

      if (type === 'run_round') {
        clearPendingTimers();
        setIsExiting(false);
        setAllComplete(false);
        const pool = registrationNamesRef.current.length > 0
          ? registrationNamesRef.current
          : ['Loading...'];
        revealWinners(winnersList, roundNumber, total, pool);
      }
    };

    return () => {
      stopRolling();
      clearPendingTimers();
      if (channelRef.current) {
        channelRef.current.close();
      }
    };
  }, [revealWinners, stopRolling, clearPendingTimers]);

  const bgStyle = {
    backgroundImage: `linear-gradient(-45deg, ${bgConfig.color1}, ${bgConfig.color2}, ${bgConfig.color3}, ${bgConfig.color1})`,
    backgroundSize: '400% 400%',
    animation: `gradientShift ${bgConfig.speed}s ease infinite`
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

        * {
          margin: 0;
          padding: 0;
          box-sizing: border-box;
        }

        .stage-container {
          width: 100vw;
          height: 100vh;
          display: flex;
          align-items: center;
          justify-content: center;
          font-family: 'Rajdhani', sans-serif;
          overflow: hidden;
          position: relative;
        }

        .stage-container::after {
          content: '';
          position: absolute;
          bottom: 0;
          left: 0;
          right: 0;
          height: 160px;
          backdrop-filter: blur(10px);
          -webkit-backdrop-filter: blur(10px);
          mask-image: linear-gradient(to top, black 20%, transparent 100%);
          -webkit-mask-image: linear-gradient(to top, black 20%, transparent 100%);
          pointer-events: none;
          z-index: 4;
        }

        .stage-content {
          text-align: center;
          color: #fff;
          z-index: 1;
          padding: 2rem;
          width: 100%;
          max-width: 1000px;
          max-height: 100vh;
          display: flex;
          flex-direction: column;
          align-items: center;
          justify-content: center;
        }

        .stage-standby h1 {
          font-family: 'Orbitron', sans-serif;
          font-size: 4rem;
          font-weight: 700;
          letter-spacing: 0.15em;
          animation: pulse 3s ease-in-out infinite;
          text-shadow: 0 0 30px rgba(255,255,255,0.3);
        }

        .stage-standby p {
          font-size: 1.5rem;
          margin-top: 1rem;
          opacity: 0.7;
          letter-spacing: 0.1em;
        }

        .stage-rolling {
          display: flex;
          flex-direction: column;
          align-items: center;
          gap: 2rem;
        }

        .stage-rolling .round-label {
          font-family: 'Orbitron', sans-serif;
          font-size: 2rem;
          letter-spacing: 0.1em;
          opacity: 0.8;
        }

        .rolling-name {
          font-family: 'Orbitron', sans-serif;
          font-size: 5rem;
          font-weight: 800;
          animation: rollFlash 0.1s linear infinite;
          text-shadow: 0 0 40px rgba(255,255,255,0.5);
          min-height: 7rem;
          display: flex;
          align-items: center;
          justify-content: center;
        }

        .stage-reveal {
          display: flex;
          flex-direction: column;
          align-items: center;
          gap: 1rem;
          width: 100%;
          max-height: 100vh;
          overflow: hidden;
        }

        .stage-reveal .round-label {
          font-family: 'Orbitron', sans-serif;
          font-size: 2.5rem;
          letter-spacing: 0.1em;
          animation: glow 2s ease-in-out infinite;
          flex-shrink: 0;
        }

        .stage-reveal.exiting .round-label {
          animation: fallAndFade 0.45s ease-in forwards;
        }

        .stage-reveal.exiting .winners-display {
          animation: fallAndFade 0.6s ease-in 0.07s forwards;
        }

        .winners-display {
          display: flex;
          flex-direction: column;
          gap: 0.75rem;
          width: 100%;
          max-width: 700px;
          max-height: calc(100vh - 10rem);
          overflow-y: auto;
          overflow-x: hidden;
          padding: 0.5rem 1rem;
          scrollbar-width: none;
          -ms-overflow-style: none;
        }

        .winners-display::-webkit-scrollbar {
          display: none;
        }

        .winners-display.grid-layout {
          display: grid;
          grid-template-columns: repeat(2, 1fr);
          max-width: 900px;
        }

        .winner-reveal-card {
          background: rgba(255, 255, 255, 0.15);
          backdrop-filter: blur(20px);
          border: 1px solid rgba(255, 255, 255, 0.25);
          border-radius: 16px;
          padding: 1.5rem 2.5rem;
          animation: celebrateIn 0.65s cubic-bezier(0.34, 1.56, 0.64, 1) both;
          text-shadow: 0 0 10px rgba(255,255,255,0.2);
        }

        .winner-reveal-card.compact {
          padding: 0.75rem 1.5rem;
          border-radius: 10px;
        }

        .winner-reveal-card .winner-name {
          font-family: 'Orbitron', sans-serif;
          font-size: 2rem;
          font-weight: 700;
          overflow-wrap: break-word;
          word-break: break-word;
        }

        .winner-reveal-card.compact .winner-name {
          font-size: 1.2rem;
        }

        .winner-reveal-card .winner-id {
          font-size: 1.2rem;
          opacity: 0.7;
          margin-top: 0.25rem;
        }

        .winner-reveal-card.compact .winner-id {
          font-size: 0.9rem;
        }

        .stage-intermission {
          display: flex;
          flex-direction: column;
          align-items: center;
          gap: 1rem;
          animation: fadeInUp 0.6s ease-out both;
        }

        .stage-intermission .intermission-round {
          font-family: 'Orbitron', sans-serif;
          font-size: 2rem;
          letter-spacing: 0.1em;
          opacity: 0.7;
        }

        .stage-intermission h1 {
          font-family: 'Orbitron', sans-serif;
          font-size: 4rem;
          font-weight: 700;
          letter-spacing: 0.15em;
          animation: pulse 3s ease-in-out infinite;
          text-shadow: 0 0 30px rgba(255,255,255,0.3);
        }

        .stage-intermission p {
          font-size: 1.5rem;
          margin-top: 0.5rem;
          opacity: 0.7;
          letter-spacing: 0.1em;
        }

        .stage-complete h1 {
          font-family: 'Orbitron', sans-serif;
          font-size: 3.5rem;
          font-weight: 700;
          letter-spacing: 0.1em;
          animation: glow 2s ease-in-out infinite;
        }

        .stage-complete p {
          font-size: 1.5rem;
          opacity: 0.7;
          margin-top: 1rem;
        }
      `}</style>

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
            <div className="round-label">ROUND {currentRound}</div>
            <div className="rolling-name">{rollingName}</div>
          </div>
        ) : (state === 'revealing' || state === 'reveal') ? (
          <div className={`stage-reveal${isExiting ? ' exiting' : ''}`}>
            <div className="round-label">ROUND {currentRound} — WINNERS</div>
            <div className={`winners-display${manyWinners ? ' grid-layout' : ''}`}>
              {revealedWinners.map((winner, idx) => (
                <div
                  key={idx}
                  className={`winner-reveal-card${lotsOfWinners ? ' compact' : ''}`}
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