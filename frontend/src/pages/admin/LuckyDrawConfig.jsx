import { useState, useEffect, useCallback, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../../contexts/AuthContext';
import Layout from '../../components/Layout';

// Password Confirm Modal
function PasswordModal({ title, onConfirm, onCancel }) {
  const [pw, setPw] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const inputRef = useRef(null);

  useEffect(() => {
    setTimeout(() => inputRef.current?.focus(), 50);
  }, []);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);
    setError('');
    try {
      const res = await fetch('/api/admin/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ password: pw })
      });
      const data = await res.json();
      if (data.success) {
        onConfirm();
      } else {
        setError('Incorrect password.');
      }
    } catch {
      setError('Network error.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="pw-modal-backdrop" onClick={(e) => { if (e.target === e.currentTarget) onCancel(); }}>
      <div className="glass-card pw-modal-card">
        <h3>{title}</h3>
        <form onSubmit={handleSubmit}>
          <div className="form-group">
            <input
              ref={inputRef}
              type="password"
              className="form-input"
              placeholder="Admin Password"
              value={pw}
              onChange={(e) => setPw(e.target.value)}
              required
            />
          </div>
          {error && <div className="message-box message-error" style={{ marginBottom: '0.75rem' }}>{error}</div>}
          <div style={{ display: 'flex', gap: '0.75rem' }}>
            <button type="submit" className="btn btn-primary" style={{ flex: 1 }} disabled={loading}>
              {loading ? 'Verifying…' : 'Confirm'}
            </button>
            <button type="button" className="btn btn-outline" onClick={onCancel}>Cancel</button>
          </div>
        </form>
      </div>
    </div>
  );
}

// Prize Entry (used in both Prize Definition & Configure Prizes windows) 
function PrizeEntry({ prize, onNameBlur, onPictureUpload, onDeletePicture, onDelete, selectable, selected, onToggle, disabledReason }) {
  const [name, setName] = useState(prize.name || '');
  const [pendingDelete, setPendingDelete] = useState(false);
  const pendingDeleteTimerRef = useRef(null);

  useEffect(() => { setName(prize.name || ''); }, [prize.name]);
  useEffect(() => () => clearTimeout(pendingDeleteTimerRef.current), []);

  const handleDeleteClick = () => {
    if (pendingDelete) {
      clearTimeout(pendingDeleteTimerRef.current);
      setPendingDelete(false);
      onDelete(prize.prize_id);
    } else {
      setPendingDelete(true);
      pendingDeleteTimerRef.current = setTimeout(() => setPendingDelete(false), 3000);
    }
  };

  const imgSrc = prize.picturePath
    ? prize.picturePath + '?t=' + (prize._ts || 0)
    : '/RewardsFallback.png';

  return (
    <div className={`prize-entry${selected ? ' prize-entry--selected' : ''}${disabledReason ? ' prize-entry--disabled' : ''}`}
      title={disabledReason || ''}
    >
      {selectable && (
        <div className="prize-entry-check">
          <input
            type="checkbox"
            checked={selected}
            onChange={() => onToggle && onToggle(prize.prize_id)}
            disabled={!!disabledReason}
          />
        </div>
      )}

      <div className="prize-entry-left">
        {onNameBlur ? (
          <input
            type="text"
            className="form-input"
            placeholder="Prize Name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            onBlur={() => onNameBlur(prize.prize_id, name)}
          />
        ) : (
          <div style={{ fontWeight: 600, fontSize: '1rem' }}>{prize.name || <em style={{ opacity: 0.5 }}>Unnamed</em>}</div>
        )}
        <div className="prize-id-badge">{prize.prize_id}</div>
      </div>

      <div className="prize-entry-right">
        <div className="prize-image-preview">
          <img
            src={imgSrc}
            alt={prize.name || prize.prize_id}
            onError={(e) => { e.target.src = '/RewardsFallback.png'; }}
          />
          {/* Hover overlay: only rendered in editable (Prize Definition) mode */}
          {onPictureUpload && (
            <div className="prize-image-overlay">
              <div
                className="prize-image-overlay-left"
                onClick={() => onDeletePicture && onDeletePicture(prize.prize_id)}
                title="Delete image"
              >
                Delete Image
              </div>
              <label className="prize-image-overlay-right" title="Replace image">
                Replace Image
                <input
                  type="file"
                  accept="image/*"
                  style={{ display: 'none' }}
                  onChange={(e) => e.target.files[0] && onPictureUpload(prize.prize_id, e.target.files[0])}
                />
              </label>
            </div>
          )}
        </div>
        <p className="form-hint" style={{ textAlign: 'center', fontSize: '0.72rem' }}>
          Picture: 7:3 ratio. Hover to replace or remove.
        </p>
      </div>

      {onDelete && (
        <div className="prize-entry-actions">
          <button
            className={`btn btn-small${pendingDelete ? ' btn-delete-confirm' : ' btn-outline'}`}
            onClick={handleDeleteClick}
            title={pendingDelete ? 'Click again to confirm deletion' : 'Delete prize'}
          >
            ✕
          </button>
        </div>
      )}
    </div>
  );
}

// Add Item Line (horizontal + icon)
function AddItemLine({ onClick, disabled, tooltip }) {
  return (
    <div
      className={`add-item-line${disabled ? ' add-round-line--disabled' : ''}`}
      onClick={!disabled ? onClick : undefined}
      title={disabled ? tooltip : 'Add'}
    >
      <div className="add-item-line-bar" />
      <div className="add-item-line-icon">+</div>
      <div className="add-item-line-bar" />
    </div>
  );
}

// Prize Definition Window
function PrizeDefinitionWindow({ prizes, onClose, onAdd, onNameBlur, onPictureUpload, onDeletePicture, onDelete }) {
  const [visible, setVisible] = useState(false);
  const windowRef = useRef(null);
  const bodyRef = useRef(null);
  const prevLengthRef = useRef(prizes.length);

  useEffect(() => {
    requestAnimationFrame(() => requestAnimationFrame(() => setVisible(true)));
  }, []);

  // Auto-scroll to bottom when a prize is added
  useEffect(() => {
    if (prizes.length > prevLengthRef.current && bodyRef.current) {
      bodyRef.current.scrollTop = bodyRef.current.scrollHeight;
    }
    prevLengthRef.current = prizes.length;
  }, [prizes.length]);

  const close = () => {
    setVisible(false);
    setTimeout(onClose, 300);
  };

  const handleBackdropClick = (e) => {
    if (windowRef.current && !windowRef.current.contains(e.target)) close();
  };

  return (
    <div
      className={`fullscreen-modal-backdrop${visible ? ' fullscreen-modal-backdrop--visible' : ''}`}
      onClick={handleBackdropClick}
    >
      <div
        className={`fullscreen-modal-window${visible ? ' fullscreen-modal-window--visible' : ''}`}
        ref={windowRef}
      >
        <div className="fullscreen-modal-header">
          <h3>Prize Definition</h3>
          <button className="modal-close-btn" onClick={close}>&#x2715;</button>
        </div>
        <div className="fullscreen-modal-body" ref={bodyRef}>
          {prizes.length === 0 && (
            <p style={{ opacity: 0.5, textAlign: 'center', padding: '1rem 0' }}>No prizes defined yet. Add one below.</p>
          )}
          {prizes.map(prize => (
            <PrizeEntry
              key={prize.prize_id}
              prize={prize}
              onNameBlur={onNameBlur}
              onPictureUpload={onPictureUpload}
              onDeletePicture={onDeletePicture}
              onDelete={onDelete}
            />
          ))}
          <AddItemLine onClick={onAdd} />
        </div>
      </div>
    </div>
  );
}

// Configure Prizes Window 
function ConfigurePrizesWindow({ allPrizes, currentRoundNumber, currentRoundPrizeIds, onSave, onClose }) {
  const [visible, setVisible] = useState(false);
  const [selected, setSelected] = useState(new Set(currentRoundPrizeIds));
  const [saving, setSaving] = useState(false);
  const windowRef = useRef(null);

  useEffect(() => {
    requestAnimationFrame(() => requestAnimationFrame(() => setVisible(true)));
  }, []);

  const close = () => {
    setVisible(false);
    setTimeout(onClose, 300);
  };

  const handleBackdropClick = (e) => {
    if (windowRef.current && !windowRef.current.contains(e.target)) close();
  };

  const toggle = (prizeId) => {
    setSelected(prev => {
      const next = new Set(prev);
      if (next.has(prizeId)) next.delete(prizeId);
      else next.add(prizeId);
      return next;
    });
  };

  const handleSave = async () => {
    setSaving(true);
    await onSave(currentRoundNumber, Array.from(selected));
    setSaving(false);
    close();
  };

  return (
    <div
      className={`fullscreen-modal-backdrop${visible ? ' fullscreen-modal-backdrop--visible' : ''}`}
      onClick={handleBackdropClick}
    >
      <div
        className={`fullscreen-modal-window${visible ? ' fullscreen-modal-window--visible' : ''}`}
        ref={windowRef}
      >
        <div className="fullscreen-modal-header">
          <h3>Configure Prizes — Round {currentRoundNumber}</h3>
          <button className="modal-close-btn" onClick={close}>&#x2715;</button>
        </div>
        <div className="fullscreen-modal-body">
          {allPrizes.length === 0 && (
            <p style={{ opacity: 0.5, textAlign: 'center', padding: '1rem 0' }}>No prizes defined. Use Prize Definition first.</p>
          )}
          {[...allPrizes]
            .sort((a, b) => {
              const aOther = a.assignedRound && a.assignedRound !== currentRoundNumber ? 1 : 0;
              const bOther = b.assignedRound && b.assignedRound !== currentRoundNumber ? 1 : 0;
              return aOther - bOther;
            })
            .map(prize => {
              const inOtherRound = prize.assignedRound && prize.assignedRound !== currentRoundNumber;
              return (
                <PrizeEntry
                  key={prize.prize_id}
                  prize={prize}
                  selectable
                  selected={selected.has(prize.prize_id)}
                  onToggle={toggle}
                  disabledReason={inOtherRound ? `Assigned to Round ${prize.assignedRound}` : null}
                />
              );
            })}
        </div>
        <div className="fullscreen-modal-footer">
          <button className="btn btn-outline" onClick={close}>Cancel</button>
          <button className="btn btn-primary" onClick={handleSave} disabled={saving}>
            {saving ? 'Saving…' : 'Save Prize Selection'}
          </button>
        </div>
      </div>
    </div>
  );
}

// Round Card
function RoundCard({ round, runningRound, canDelete, onRunRoulette, onRedraw, onDeleteRound, onConfigPrizes, onNameBlur }) {
  const [localName, setLocalName] = useState(round.customName || '');

  useEffect(() => { setLocalName(round.customName || ''); }, [round.customName]);

  const isRunning = runningRound === round.roundNumber;
  const canRun = !round.executed && runningRound === null && round.prizes.length > 0;
  const showFooter = canDelete || round.executed;

  return (
    <div className={`glass-card round-card-v2${round.executed ? ' round-executed' : ''}`}>
      {/* Title — full width */}
      <input
        className="form-input round-name-input"
        placeholder={`Round ${round.roundNumber}`}
        value={localName}
        onChange={(e) => setLocalName(e.target.value)}
        onBlur={() => onNameBlur(round.roundNumber, localName)}
        disabled={round.executed}
      />

      {/* Action row: Configure Prizes (left) | Run Roulette (right) */}
      {!round.executed && (
        <div className="round-card-btn-row">
          <button
            className="btn btn-prize-def ldc-action-btn round-card-action-btn"
            onClick={() => onConfigPrizes(round.roundNumber)}
          >
            Configure Prizes
          </button>
          <button
            className={`btn ldc-action-btn round-card-action-btn ${canRun ? 'btn-primary' : 'btn-outline'}`}
            onClick={() => canRun && onRunRoulette(round.roundNumber)}
            disabled={!canRun}
            title={round.prizes.length === 0 ? 'No prizes configured' : ''}
          >
            {isRunning ? 'Running…' : 'Run Roulette'}
          </button>
        </div>
      )}

      {/* Prizes section */}
      <div className="round-prizes-section">
        {round.prizes.length > 0 ? (
          <div className="round-prizes-chips">
            {round.prizes.map(p => (
              <span key={p.prizeId} className="prize-chip">{p.name || p.prizeId} <span style={{ opacity: 0.6 }}>({p.prizeId})</span></span>
            ))}
          </div>
        ) : (
          <p style={{ opacity: 0.45, fontSize: '0.82rem', margin: '0.25rem 0' }}>No prizes configured.</p>
        )}
      </div>

      {/* Winners table — immediately after prize section */}
      {round.executed && round.winners.length > 0 && (
        <div style={{ overflowX: 'auto' }}>
          <table className="round-winners-table">
            <thead>
              <tr>
                <th>Full Name</th>
                <th>Staff ID</th>
                <th>Prize</th>
              </tr>
            </thead>
            <tbody>
              {round.winners.map((w, i) => (
                <tr key={i}>
                  <td>{w.fullName}</td>
                  <td>{w.staffId}</td>
                  <td>
                    <span className="prize-chip" style={{ fontSize: '0.72rem' }}>{w.prizeId}</span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Footer: Delete Round (bottom-left) | Redraw (bottom-right) */}
      {showFooter && (
        <div className="round-card-footer">
          <div>
            {canDelete && (
              <button
                className="btn btn-danger btn-small"
                onClick={() => onDeleteRound(round.roundNumber)}
                disabled={runningRound !== null}
              >
                Delete Round
              </button>
            )}
          </div>
          <div>
            {round.executed && (
              <button
                className="btn btn-outline btn-small"
                onClick={() => onRedraw(round.roundNumber)}
                disabled={runningRound !== null}
              >
                Redraw
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

// Main Component
export default function LuckyDrawConfig() {
  const { getAuthHeaders } = useAuth();
  const navigate = useNavigate();
  const channelRef = useRef(null);

  const [prizes, setPrizes] = useState([]);
  const [rounds, setRounds] = useState([]);
  const [totalRegistrations, setTotalRegistrations] = useState(0);
  const [message, setMessage] = useState(null);
  const [runningRound, setRunningRound] = useState(null);

  // Prize Definition window
  const [prizeDefOpen, setPrizeDefOpen] = useState(false);

  // Configure Prizes window
  const [configPrizesRound, setConfigPrizesRound] = useState(null);

  // Password modal
  const [pwModal, setPwModal] = useState(null); // { title, onConfirm }

  const showMessage = (type, text) => {
    setMessage({ type, text });
    setTimeout(() => setMessage(null), 5000);
  };

  // Broadcast channel
  useEffect(() => {
    channelRef.current = new BroadcastChannel('luckydraw');
    channelRef.current.onmessage = (event) => {
      if (event.data.type === 'round_complete') setRunningRound(null);
    };
    return () => channelRef.current?.close();
  }, []);

  // Fetch state
  const fetchAll = useCallback(async () => {
    try {
      const [configRes, regRes] = await Promise.all([
        fetch('/api/luckydraw/config', { headers: getAuthHeaders() }),
        fetch('/api/registration/table?page=1&limit=1', { headers: getAuthHeaders() })
      ]);
      if (configRes.ok) {
        const data = await configRes.json();
        setPrizes(data.allPrizes || []);
        let fetchedRounds = data.rounds || [];
        // Auto-create round 1 if none exist (inline to avoid circular dep)
        if (fetchedRounds.length === 0) {
          const createRes = await fetch('/api/luckydraw/rounds', { method: 'POST', headers: getAuthHeaders() });
          if (createRes.ok) {
            const configRes2 = await fetch('/api/luckydraw/config', { headers: getAuthHeaders() });
            if (configRes2.ok) {
              const data2 = await configRes2.json();
              setPrizes(data2.allPrizes || []);
              fetchedRounds = data2.rounds || [];
            }
          }
        }
        setRounds(fetchedRounds);
      }
      if (regRes.ok) {
        const regData = await regRes.json();
        setTotalRegistrations(regData.total || 0);
      }
    } catch (err) {
      console.error('Failed to fetch config:', err);
    }
  }, [getAuthHeaders]);

  useEffect(() => { fetchAll(); }, [fetchAll]);

  // Add round
  const addRound = async (silent = false) => {
    try {
      const res = await fetch('/api/luckydraw/rounds', {
        method: 'POST',
        headers: getAuthHeaders()
      });
      if (!res.ok) throw new Error((await res.json()).error || 'Failed to add round');
      await fetchAll();
      if (!silent) showMessage('success', 'New round added.');
    } catch (err) {
      showMessage('error', err.message);
    }
  };

  // Save round name
  const handleNameBlur = async (roundNumber, customName) => {
    try {
      await fetch(`/api/luckydraw/rounds/${roundNumber}/name`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json', ...getAuthHeaders() },
        body: JSON.stringify({ customName })
      });
    } catch {
      // silent
    }
  };

  // Configure prizes for a round
  const handleSaveRoundPrizes = async (roundNumber, prizeIds) => {
    try {
      const res = await fetch(`/api/luckydraw/rounds/${roundNumber}/prizes`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json', ...getAuthHeaders() },
        body: JSON.stringify({ prizeIds })
      });
      if (!res.ok) throw new Error((await res.json()).error || 'Failed to save');
      await fetchAll();
      showMessage('success', `Prizes updated for Round ${roundNumber}.`);
    } catch (err) {
      showMessage('error', err.message);
    }
  };

  // Run Roulette
  const handleRunRoulette = async (roundNumber) => {
    // Capture round metadata BEFORE fetchAll can change state
    const roundName = rounds.find(r => r.roundNumber === roundNumber)?.customName || `Round ${roundNumber}`;
    const totalRoundsNow = rounds.length;

    setRunningRound(roundNumber);
    setMessage(null);
    try {
      const res = await fetch(`/api/luckydraw/run/${roundNumber}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...getAuthHeaders() },
        body: JSON.stringify({})
      });
      if (!res.ok) throw new Error((await res.json()).error || 'Failed to run');
      const data = await res.json();
      const winners = data.winners || [];

      await fetchAll();

      if (channelRef.current) {
        channelRef.current.postMessage({
          type: 'run_round',
          roundNumber,
          roundName,
          totalRounds: totalRoundsNow,
          winners
        });
      }
      showMessage('success', `Round ${roundNumber} complete — ${winners.length} winner(s) selected.`);
    } catch (err) {
      showMessage('error', err.message);
      setRunningRound(null);
    }
  };

  // Redraw (password required)
  const handleRedraw = (roundNumber) => {
    setPwModal({
      title: `Confirm Redraw — Round ${roundNumber}`,
      onConfirm: async () => {
        setPwModal(null);
        try {
          const res = await fetch(`/api/luckydraw/reset-round/${roundNumber}`, {
            method: 'POST',
            headers: getAuthHeaders()
          });
          if (!res.ok) throw new Error((await res.json()).error || 'Failed to reset');
          await fetchAll();
          showMessage('success', `Round ${roundNumber} reset. Ready to redraw.`);
        } catch (err) {
          showMessage('error', err.message);
        }
      }
    });
  };

  // Delete Round
  const handleDeleteRound = async (roundNumber) => {
    try {
      const res = await fetch(`/api/luckydraw/rounds/${roundNumber}`, {
        method: 'DELETE',
        headers: getAuthHeaders()
      });
      if (!res.ok) throw new Error((await res.json()).error || 'Failed to delete round');
      await fetchAll();
      showMessage('success', `Round ${roundNumber} deleted.`);
    } catch (err) {
      showMessage('error', err.message);
    }
  };

  // Reset Lucky Draw (password required)
  const handleReset = () => {
    setPwModal({
      title: 'Confirm Reset Lucky Draw',
      onConfirm: async () => {
        setPwModal(null);
        try {
          const res = await fetch('/api/luckydraw/reset', {
            method: 'POST',
            headers: getAuthHeaders()
          });
          if (!res.ok) throw new Error((await res.json()).error || 'Failed to reset');
          await fetchAll();
          showMessage('success', 'Lucky Draw reset. All winners cleared.');
        } catch (err) {
          showMessage('error', err.message);
        }
      }
    });
  };

  // Prize Definition CRUD
  const openPrizeDef = () => {
    setPwModal({
      title: 'Enter Admin Password to Access Prize Definition',
      onConfirm: () => {
        setPwModal(null);
        setPrizeDefOpen(true);
      }
    });
  };

  const handleAddPrize = async () => {
    try {
      const res = await fetch('/api/prizes', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...getAuthHeaders() },
        body: JSON.stringify({ name: '' })
      });
      if (!res.ok) throw new Error((await res.json()).error || 'Failed to create prize');
      const prize = await res.json();
      setPrizes(prev => [...prev, prize]);
    } catch (err) {
      showMessage('error', err.message);
    }
  };

  const handlePrizeNameBlur = async (prizeId, name) => {
    try {
      await fetch(`/api/prizes/${prizeId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json', ...getAuthHeaders() },
        body: JSON.stringify({ name })
      });
      setPrizes(prev => prev.map(p => p.prize_id === prizeId ? { ...p, name } : p));
    } catch {
      // silent
    }
  };

  const handlePrizePictureUpload = async (prizeId, file) => {
    const formData = new FormData();
    formData.append('picture', file);
    try {
      const res = await fetch(`/api/prizes/${prizeId}/picture`, {
        method: 'POST',
        headers: getAuthHeaders(),
        body: formData
      });
      if (!res.ok) throw new Error((await res.json()).error || 'Upload failed');
      const data = await res.json();
      setPrizes(prev => prev.map(p =>
        p.prize_id === prizeId ? { ...p, picturePath: data.picturePath, _ts: Date.now() } : p
      ));
    } catch (err) {
      showMessage('error', err.message);
    }
  };

  const handleDeletePrizePicture = async (prizeId) => {
    try {
      const res = await fetch(`/api/prizes/${prizeId}/picture`, {
        method: 'DELETE',
        headers: getAuthHeaders()
      });
      if (!res.ok) throw new Error((await res.json()).error || 'Failed to delete picture');
      setPrizes(prev => prev.map(p =>
        p.prize_id === prizeId ? { ...p, picturePath: null, picture_filename: '', _ts: Date.now() } : p
      ));
    } catch (err) {
      showMessage('error', err.message);
    }
  };

  const handleDeletePrize = async (prizeId) => {
    try {
      const res = await fetch(`/api/prizes/${prizeId}`, {
        method: 'DELETE',
        headers: getAuthHeaders()
      });
      if (!res.ok) throw new Error((await res.json()).error || 'Failed to delete');
      setPrizes(prev => prev.filter(p => p.prize_id !== prizeId));
      // Refresh rounds to clear any prize chips that may have been removed
      fetchAll();
    } catch (err) {
      showMessage('error', err.message);
    }
  };

  // Derived values
  const assignedPrizeIds = new Set(rounds.flatMap(r => r.prizes.map(p => p.prizeId)));
  const availablePrizesCount = prizes.filter(p => !assignedPrizeIds.has(p.prize_id)).length;

  const usedWinners = rounds.reduce((sum, r) => sum + (r.executed ? r.winners.length : 0), 0);
  const remaining = totalRegistrations - usedWinners;

  const configPrizesRoundData = configPrizesRound !== null ? rounds.find(r => r.roundNumber === configPrizesRound) : null;
  const maxRoundNumber = rounds.length > 0 ? Math.max(...rounds.map(r => r.roundNumber)) : 0;

  return (
    <Layout>
      <div className="admin-page">
        <div className="glass-card admin-form-card wide-card">

          {/* Header */}
          <div className="ldc-header">
            <div className="ldc-header-left">
              <button className="btn btn-outline btn-small" onClick={() => navigate('/administrator/dashboard')}>
                &larr; Back
              </button>
              <h2 style={{ fontSize: '1.4rem' }}>Lucky Draw Master</h2>
            </div>
          </div>

          {/* Action buttons row */}
          <div className="ldc-action-row">
            <button className="btn btn-prize-def ldc-action-btn" onClick={openPrizeDef}>
              Prize Definition
            </button>
            <button className="btn btn-accent ldc-action-btn" onClick={() => window.open('/luckydraw-stage', 'LuckyDrawStage', 'width=1280,height=800')}>
              Roulette Staging
            </button>
          </div>

          {message && (
            <div className={`message-box message-${message.type}`} style={{ marginBottom: '1rem' }}>{message.text}</div>
          )}

          <p className="info-text">
            Total Registrations: {totalRegistrations} &nbsp;|&nbsp; Remaining Pool: {remaining} &nbsp;|&nbsp; Available Prizes: {availablePrizesCount}
          </p>

          {/* Rounds grid */}
          {rounds.length > 0 && (
            <div className="ldc-rounds-grid">
              {rounds.map(round => (
                <RoundCard
                  key={round.roundNumber}
                  round={round}
                  runningRound={runningRound}
                  canDelete={!round.executed && round.roundNumber === maxRoundNumber}
                  onRunRoulette={handleRunRoulette}
                  onRedraw={handleRedraw}
                  onDeleteRound={handleDeleteRound}
                  onConfigPrizes={(rn) => setConfigPrizesRound(rn)}
                  onNameBlur={handleNameBlur}
                />
              ))}
            </div>
          )}

          {/* Add Round line */}
          <div
            className={`add-round-line${availablePrizesCount === 0 ? ' add-round-line--disabled' : ''}`}
            onClick={availablePrizesCount > 0 ? () => addRound() : undefined}
            title={availablePrizesCount === 0 ? 'Available Prizes Exhausted' : 'Add Round'}
          >
            <div className="add-round-line-bar" />
            <div className="add-round-line-icon">+</div>
            <div className="add-round-line-bar" />
          </div>

          {/* Reset Lucky Draw */}
          <div style={{ marginTop: '1rem', display: 'flex', justifyContent: 'center' }}>
            <button className="btn btn-danger" onClick={handleReset}>
              Reset Lucky Draw
            </button>
          </div>

        </div>
      </div>

      {/* Prize Definition Window */}
      {prizeDefOpen && (
        <PrizeDefinitionWindow
          prizes={prizes}
          onClose={() => { setPrizeDefOpen(false); fetchAll(); }}
          onAdd={handleAddPrize}
          onNameBlur={handlePrizeNameBlur}
          onPictureUpload={handlePrizePictureUpload}
          onDeletePicture={handleDeletePrizePicture}
          onDelete={handleDeletePrize}
        />
      )}

      {/* Configure Prizes Window */}
      {configPrizesRound !== null && configPrizesRoundData && (
        <ConfigurePrizesWindow
          allPrizes={prizes}
          currentRoundNumber={configPrizesRound}
          currentRoundPrizeIds={configPrizesRoundData.prizes.map(p => p.prizeId)}
          onSave={handleSaveRoundPrizes}
          onClose={() => setConfigPrizesRound(null)}
        />
      )}

      {/* Password Modal */}
      {pwModal && (
        <PasswordModal
          title={pwModal.title}
          onConfirm={pwModal.onConfirm}
          onCancel={() => setPwModal(null)}
        />
      )}
    </Layout>
  );
}
