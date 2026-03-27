import { useState, useEffect, useCallback, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../../contexts/AuthContext';
import Layout from '../../components/Layout';

export default function LuckyDrawConfig() {
  const { getAuthHeaders } = useAuth();
  const navigate = useNavigate();
  const channelRef = useRef(null);

  const [numRounds, setNumRounds] = useState(1);
  const [roundsConfirmed, setRoundsConfirmed] = useState(false);
  const [rounds, setRounds] = useState([]);
  const [totalRegistrations, setTotalRegistrations] = useState(0);
  const [message, setMessage] = useState(null);
  const [runningRound, setRunningRound] = useState(null);

  useEffect(() => {
    channelRef.current = new BroadcastChannel('luckydraw');

    channelRef.current.onmessage = (event) => {
      if (event.data.type === 'round_complete') {
        setRunningRound(null);
      }
    };

    return () => {
      if (channelRef.current) {
        channelRef.current.close();
      }
    };
  }, []);

  const fetchRegistrationCount = useCallback(async () => {
    try {
      const res = await fetch('/api/registration/table?page=1&limit=1', {
        headers: getAuthHeaders()
      });
      if (res.ok) {
        const data = await res.json();
        setTotalRegistrations(data.total || 0);
      }
    } catch (err) {
      console.error('Failed to fetch registration count:', err);
    }
  }, [getAuthHeaders]);

  const fetchExistingConfig = useCallback(async () => {
    try {
      const res = await fetch('/api/luckydraw/config', {
        headers: getAuthHeaders()
      });
      if (res.ok) {
        const data = await res.json();
        if (data.rounds && data.rounds.length > 0) {
          setRounds(data.rounds);
          setNumRounds(data.rounds.length);
          setRoundsConfirmed(true);
        }
      }
    } catch (err) {
      console.error('Failed to fetch lucky draw config:', err);
    }
  }, [getAuthHeaders]);

  useEffect(() => {
    fetchRegistrationCount();
    fetchExistingConfig();
  }, [fetchRegistrationCount, fetchExistingConfig]);

  const handleConfirmRounds = async () => {
    setMessage(null);

    try {
      const winnerCounts = Array(numRounds).fill(1);
      const res = await fetch('/api/luckydraw/configure', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...getAuthHeaders()
        },
        body: JSON.stringify({ rounds: numRounds, winnerCounts })
      });

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || 'Failed to configure rounds');
      }

      const roundsArray = [];
      for (let i = 1; i <= numRounds; i++) {
        roundsArray.push({
          roundNumber: i,
          winnerCount: 1,
          executed: false,
          winners: []
        });
      }
      setRounds(roundsArray);
      setRoundsConfirmed(true);
      setMessage({ type: 'success', text: `${numRounds} round(s) configured.` });
    } catch (err) {
      setMessage({ type: 'error', text: err.message });
    }
  };

  const handleWinnerCountChange = (index, value) => {
    const updated = [...rounds];
    updated[index] = { ...updated[index], winnerCount: parseInt(value) || 1 };
    setRounds(updated);
  };

  const handleRunRound = async (index) => {
    const round = rounds[index];
    if (round.executed || runningRound !== null) return;

    setRunningRound(round.roundNumber);
    setMessage(null);

    try {
      const res = await fetch(`/api/luckydraw/run/${round.roundNumber}`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...getAuthHeaders()
        },
        body: JSON.stringify({ winnerCount: round.winnerCount })
      });

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || 'Failed to run lucky draw');
      }

      const data = await res.json();
      const winners = data.winners || [];

      const updated = [...rounds];
      updated[index] = { ...updated[index], executed: true, winners };
      setRounds(updated);

      if (channelRef.current) {
        channelRef.current.postMessage({
          type: 'run_round',
          roundNumber: round.roundNumber,
          totalRounds: rounds.length,
          winners
        });
      }

      setMessage({ type: 'success', text: `Round ${round.roundNumber} completed! ${winners.length} winner(s) selected.` });
    } catch (err) {
      setMessage({ type: 'error', text: err.message });
      setRunningRound(null);
    }
  };

  const handleResetLuckyDraw = async () => {
    setMessage(null);
    try {
      const res = await fetch('/api/luckydraw/reset', {
        method: 'POST',
        headers: getAuthHeaders()
      });
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || 'Failed to reset');
      }
      setRounds([]);
      setRoundsConfirmed(false);
      setNumRounds(1);
      setRunningRound(null);
      setMessage({ type: 'success', text: 'Lucky Draw reset. All winners cleared.' });
    } catch (err) {
      setMessage({ type: 'error', text: err.message });
    }
  };

  const handleResetRound = async (index) => {
    const round = rounds[index];
    setMessage(null);
    try {
      const res = await fetch(`/api/luckydraw/reset-round/${round.roundNumber}`, {
        method: 'POST',
        headers: getAuthHeaders()
      });
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || 'Failed to reset round');
      }
      const updated = [...rounds];
      updated[index] = { ...updated[index], executed: false, winners: [] };
      setRounds(updated);
      setMessage({ type: 'success', text: `Round ${round.roundNumber} reset. Ready to redraw.` });
    } catch (err) {
      setMessage({ type: 'error', text: err.message });
    }
  };

  const handleOpenStage = () => {
    window.open('/luckydraw-stage', 'LuckyDrawStage', 'width=1200,height=800');
  };

  const usedWinners = rounds.reduce((sum, r) => sum + (r.executed ? (r.winners || []).length : 0), 0);
  const remaining = totalRegistrations - usedWinners;

  return (
    <Layout>
      <div className="admin-page">
        <div className="glass-card admin-form-card wide-card">
          <div className="admin-header">
            <button className="btn btn-outline btn-small" onClick={() => navigate('/administrator/dashboard')}>
              &larr; Back
            </button>
            <h2>Lucky Draw</h2>
          </div>

          {message && (
            <div className={`message-box message-${message.type}`}>{message.text}</div>
          )}

          <p className="info-text">Total Registrations: {totalRegistrations} | Remaining Pool: {remaining}</p>

          {!roundsConfirmed ? (
            <div className="rounds-setup">
              <div className="form-group">
                <label className="form-label">Number of Rounds (1-5)</label>
                <input
                  type="number"
                  className="form-input"
                  min="1"
                  max="5"
                  value={numRounds}
                  onChange={(e) => setNumRounds(Math.min(5, Math.max(1, parseInt(e.target.value) || 1)))}
                />
              </div>
              <button className="btn btn-primary" onClick={handleConfirmRounds}>
                Confirm Rounds
              </button>
            </div>
          ) : (
            <div className="rounds-config">
              {rounds.map((round, index) => (
                <div key={round.roundNumber} className={`glass-card round-card ${round.executed ? 'round-executed' : ''}`}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <h3>Round {round.roundNumber}</h3>
                    {round.executed && (
                      <button
                        className="btn btn-outline btn-small"
                        onClick={() => handleResetRound(index)}
                        disabled={runningRound !== null}
                      >
                        Redraw
                      </button>
                    )}
                  </div>

                  <div className="round-controls">
                    <div className="form-group">
                      <label className="form-label">Number of Winners</label>
                      <input
                        type="range"
                        className="form-range"
                        min="1"
                        max={Math.min(15, Math.max(1, remaining + (round.executed ? (round.winners || []).length : 0)))}
                        value={round.winnerCount}
                        onChange={(e) => handleWinnerCountChange(index, e.target.value)}
                        disabled={round.executed}
                      />
                      <span className="range-value">{round.winnerCount}</span>
                    </div>

                    <button
                      className={`btn ${round.executed ? 'btn-disabled' : 'btn-primary'}`}
                      onClick={() => handleRunRound(index)}
                      disabled={round.executed || runningRound !== null}
                    >
                      {round.executed
                        ? 'Completed'
                        : runningRound === round.roundNumber
                          ? 'Running...'
                          : `Run Lucky Draw Round ${round.roundNumber}`}
                    </button>
                  </div>

                  {round.executed && round.winners && round.winners.length > 0 && (
                    <div className="round-winners">
                      <h4>Winners:</h4>
                      <ul className="winners-list">
                        {round.winners.map((winner, wIdx) => (
                          <li key={wIdx} className="winner-item">
                            {winner.fullName} ({winner.staffId})
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}
                </div>
              ))}

              <div style={{ display: 'flex', gap: '1rem', marginTop: '1rem' }}>
                <button className="btn btn-accent btn-large stage-btn" onClick={handleOpenStage}>
                  STAGE LUCKY DRAW ROUNDS
                </button>
                <button className="btn btn-danger" onClick={handleResetLuckyDraw}>
                  Reset Lucky Draw
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </Layout>
  );
}
