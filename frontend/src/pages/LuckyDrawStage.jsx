import React, { useState, useEffect, useRef, useCallback } from 'react';

const PLACEHOLDER_NAMES = [
  'Alex Johnson', 'Maria Chen', 'David Park', 'Sarah Wilson',
  'James Lee', 'Emma Davis', 'Robert Kim', 'Lisa Anderson',
  'Michael Brown', 'Jennifer Taylor', 'William Garcia', 'Amanda Martinez',
  'Christopher Robinson', 'Jessica Clark', 'Daniel Rodriguez', 'Ashley Lewis',
  'Matthew Walker', 'Stephanie Hall', 'Andrew Allen', 'Nicole Young'
];

export default function LuckyDrawStage() {
  const [state, setState] = useState('standby');
  const [currentRound, setCurrentRound] = useState(null);
  const [totalRounds, setTotalRounds] = useState(null);
  const [winners, setWinners] = useState([]);
  const [rollingName, setRollingName] = useState('');
  const [revealedWinners, setRevealedWinners] = useState([]);
  const [allComplete, setAllComplete] = useState(false);
  const channelRef = useRef(null);
  const rollingIntervalRef = useRef(null);

  const stopRolling = useCallback(() => {
    if (rollingIntervalRef.current) {
      clearInterval(rollingIntervalRef.current);
      rollingIntervalRef.current = null;
    }
  }, []);

  const revealWinners = useCallback((winnersList, roundNumber, totalRnds) => {
    setState('rolling');
    setCurrentRound(roundNumber);
    setTotalRounds(totalRnds);
    setRevealedWinners([]);

    const allNames = [...PLACEHOLDER_NAMES];
    winnersList.forEach(w => {
      const name = w.fullName || w.name || 'Winner';
      if (!allNames.includes(name)) allNames.push(name);
    });

    let rollCount = 0;
    const rollDuration = 3000;
    const rollInterval = 50;
    const totalRolls = rollDuration / rollInterval;

    rollingIntervalRef.current = setInterval(() => {
      rollCount++;
      const randomIdx = Math.floor(Math.random() * allNames.length);
      setRollingName(allNames[randomIdx]);

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
            setWinners(winnersList);

            if (channelRef.current) {
              channelRef.current.postMessage({ type: 'round_complete', roundNumber });
            }

            if (roundNumber >= totalRnds) {
              setTimeout(() => {
                setAllComplete(true);
              }, 5000);
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
        setAllComplete(false);
        revealWinners(winnersList, roundNumber, total);
      }
    };

    return () => {
      stopRolling();
      if (channelRef.current) {
        channelRef.current.close();
      }
    };
  }, [revealWinners, stopRolling]);

  const bgStyle = {
    background: 'linear-gradient(-45deg, #667eea, #764ba2, #f093fb, #667eea)',
    backgroundSize: '400% 400%',
    animation: 'gradientShift 8s ease infinite'
  };

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

        @keyframes slideUp {
          from { opacity: 0; transform: translateY(40px); }
          to { opacity: 1; transform: translateY(0); }
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
          0% { opacity: 0; transform: scale(0.5) translateY(20px); }
          60% { transform: scale(1.1) translateY(-5px); }
          100% { opacity: 1; transform: scale(1) translateY(0); }
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

        .stage-content {
          text-align: center;
          color: #fff;
          z-index: 1;
          padding: 2rem;
          width: 100%;
          max-width: 1000px;
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
          gap: 1.5rem;
        }

        .stage-reveal .round-label {
          font-family: 'Orbitron', sans-serif;
          font-size: 2.5rem;
          letter-spacing: 0.1em;
          animation: glow 2s ease-in-out infinite;
        }

        .winners-display {
          display: flex;
          flex-direction: column;
          gap: 1rem;
          width: 100%;
          max-width: 700px;
        }

        .winner-reveal-card {
          background: rgba(255, 255, 255, 0.15);
          backdrop-filter: blur(20px);
          border: 1px solid rgba(255, 255, 255, 0.25);
          border-radius: 16px;
          padding: 1.5rem 2.5rem;
          animation: celebrateIn 0.8s cubic-bezier(0.34, 1.56, 0.64, 1) forwards;
          text-shadow: 0 0 10px rgba(255,255,255,0.2);
        }

        .winner-reveal-card .winner-name {
          font-family: 'Orbitron', sans-serif;
          font-size: 2rem;
          font-weight: 700;
        }

        .winner-reveal-card .winner-id {
          font-size: 1.2rem;
          opacity: 0.7;
          margin-top: 0.25rem;
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
          <div className="stage-reveal">
            <div className="round-label">ROUND {currentRound} - WINNERS</div>
            <div className="winners-display">
              {revealedWinners.map((winner, idx) => (
                <div
                  key={idx}
                  className="winner-reveal-card"
                  style={{ animationDelay: `${idx * 0.2}s` }}
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
