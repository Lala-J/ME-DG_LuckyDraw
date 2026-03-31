import { useState, useEffect, useRef, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../../contexts/AuthContext';
import Layout from '../../components/Layout';

const FIELD_OPTIONS = [
  { value: 'full_name',  label: 'Full Name'  },
  { value: 'staff_id',   label: 'Staff ID'   },
  { value: 'title',      label: 'Title'      },
  { value: 'department', label: 'Department' },
  { value: 'location',   label: 'Location'   },
];

const PLACEHOLDER = {
  full_name:  'Tethys Melyon',
  staff_id:   'ME-ET0067',
  title:      'Director of Systems Architecture',
  department: 'D-Suite',
  location:   "Saturnalia City",
};

// ── Stub modal for unimplemented features ─────────────────────────────────────
function ConstructionModal({ title, onClose }) {
  const [visible, setVisible] = useState(false);
  const windowRef = useRef(null);

  useEffect(() => {
    requestAnimationFrame(() => requestAnimationFrame(() => setVisible(true)));
  }, []);

  const close = () => { setVisible(false); setTimeout(onClose, 300); };

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
          <h3>{title}</h3>
          <button className="modal-close-btn" onClick={close}>&#x2715;</button>
        </div>
        <div className="fullscreen-modal-body exp-construction-body">
          <span className="exp-construction-icon">🚧</span>
          <p className="exp-construction-text">
            Oops, still under construction :3 — this will be a slow process because of big codebase changes, hope you don't mind.
          </p>
        </div>
      </div>
    </div>
  );
}

// ── Winner Card modal ─────────────────────────────────────────────────────────
function WinnerCardModal({ onClose, getAuthHeaders }) {
  const [visible, setVisible] = useState(false);
  const [enabled, setEnabled] = useState(false);
  const [fields, setFields] = useState(['full_name', 'staff_id', 'disabled', 'disabled']);
  const windowRef = useRef(null);

  useEffect(() => {
    requestAnimationFrame(() => requestAnimationFrame(() => setVisible(true)));
  }, []);

  // Load saved config on mount
  useEffect(() => {
    fetch('/api/config')
      .then(r => r.ok ? r.json() : null)
      .then(data => {
        if (!data) return;
        setEnabled(data.exp_winner_card_enabled === '1');
        setFields([
          data.exp_winner_card_field1 || 'full_name',
          data.exp_winner_card_field2 || 'staff_id',
          data.exp_winner_card_field3 || 'disabled',
          data.exp_winner_card_field4 || 'disabled',
        ]);
      })
      .catch(() => {});
  }, []);

  const saveConfig = useCallback((newEnabled, newFields) => {
    fetch('/api/config', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json', ...getAuthHeaders() },
      body: JSON.stringify({
        exp_winner_card_enabled: newEnabled ? '1' : '0',
        exp_winner_card_field1: newFields[0],
        exp_winner_card_field2: newFields[1],
        exp_winner_card_field3: newFields[2],
        exp_winner_card_field4: newFields[3],
      })
    }).catch(() => {});
  }, [getAuthHeaders]);

  const handleToggle = () => {
    const next = !enabled;
    setEnabled(next);
    saveConfig(next, fields);
  };

  const handleFieldChange = (idx, value) => {
    const next = [...fields];
    next[idx] = value;
    setFields(next);
    saveConfig(enabled, next);
  };

  // Options available for a given dropdown (exclude values used in other dropdowns)
  const getOptions = (idx) => {
    const used = new Set(fields.filter((v, i) => i !== idx && v !== 'disabled'));
    return FIELD_OPTIONS.filter(opt => !used.has(opt.value));
  };

  const close = () => { setVisible(false); setTimeout(onClose, 300); };

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
        {/* Header */}
        <div className="fullscreen-modal-header">
          <h3>Winner Card</h3>
          <div className="exp-toggle-group">
            <span className={`exp-toggle-label-text${enabled ? ' exp-toggle-label-text--on' : ''}`}>
              {enabled ? 'ENABLED' : 'DISABLED'}
            </span>
            <label className="exp-toggle-switch" title={enabled ? 'Disable feature' : 'Enable feature'}>
              <input type="checkbox" checked={enabled} onChange={handleToggle} />
              <span className="exp-toggle-slider" />
            </label>
          </div>
        </div>

        {/* Body */}
        <div className="fullscreen-modal-body">
          <div className="exp-card-wrapper">
            <div className="exp-card-container">

              {/* Preview card — blurred and locked when disabled */}
              <div
                className="exp-winner-preview-card"
                style={{
                  filter:        !enabled ? 'blur(7px)' : 'none',
                  pointerEvents: !enabled ? 'none'      : 'auto',
                  userSelect:    !enabled ? 'none'      : 'auto',
                  transition:    'filter 0.4s ease',
                }}
              >
                {/* Left: dropdown selectors */}
                <div className="exp-winner-preview-left">
                  {[0, 1, 2, 3].map((idx) => {
                    const opts = getOptions(idx);
                    const hasDisabled = idx > 0;
                    const isDisabled = fields[idx] === 'disabled';

                    return (
                      <div key={idx} className="exp-field-row">
                        <select
                          className={`exp-field-select${idx === 0 ? ' exp-field-select--primary' : ''}`}
                          value={fields[idx]}
                          onChange={(e) => handleFieldChange(idx, e.target.value)}
                          disabled={!enabled}
                        >
                          {hasDisabled && <option value="disabled">Disabled</option>}
                          {opts.map(opt => (
                            <option key={opt.value} value={opt.value}>{opt.label}</option>
                          ))}
                        </select>
                        {!isDisabled && (
                          <div className={`exp-field-preview-text${idx === 0 ? ' exp-field-preview-text--primary' : ''}`}>
                            {PLACEHOLDER[fields[idx]] || ''}
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>

                {/* Right: prize placeholder */}
                <div className="exp-winner-preview-right">
                  <div className="exp-winner-preview-img">
                    <img src="/RewardsFallback.png" alt="Prize placeholder" />
                  </div>
                  <div className="exp-winner-preview-prize-name">Prize Name</div>
                  <div className="exp-winner-preview-prize-id">PRIZE-PLACEHOLDER</div>
                </div>
              </div>

              {/* Shimmer overlay when disabled */}
              {!enabled && <div className="exp-shimmer-overlay" />}
            </div>
          </div>

          <p className="exp-winner-warning">
            Note: The Winner Card rendering might behave in unexpected ways due to additional display text fields,
            even if measures have been taken to mitigate potential deviations from expected rendering behavior.
          </p>
        </div>
      </div>
    </div>
  );
}

// ── Main page ─────────────────────────────────────────────────────────────────
const FRONTEND_FEATURES = [
  { key: 'winner_card', label: 'Winner Card' },
  { key: 'stage_mod',   label: 'Stage Modification' },
  { key: 'font_family', label: 'Font Family' },
];

const BACKEND_FEATURES = [
  { key: 'bulk_reg',     label: 'Bulk Registration' },
  { key: 'data_pruning', label: 'Data Pruning' },
  { key: 'direct_edit',  label: 'Direct Editing' },
];

const STUB_MODALS = new Set(['stage_mod', 'font_family', 'bulk_reg', 'data_pruning', 'direct_edit']);

const MODAL_TITLES = {
  stage_mod:    'Stage Modification',
  font_family:  'Font Family',
  bulk_reg:     'Bulk Registration',
  data_pruning: 'Data Pruning',
  direct_edit:  'Direct Editing',
};

export default function Experimentals() {
  const navigate = useNavigate();
  const { getAuthHeaders } = useAuth();
  const [openModal, setOpenModal] = useState(null);

  return (
    <Layout>
      <div className="admin-page">
        <div className="glass-card admin-form-card">
          <div className="admin-header">
            <button className="btn btn-outline btn-small" onClick={() => navigate('/administrator/dashboard')}>
              &larr; Back
            </button>
            <h2>Experimental Features</h2>
          </div>

          {/* Frontend section */}
          <div className="exp-section-divider">
            <div className="exp-section-divider-line" />
            <span className="exp-section-divider-text">FRONTEND EXPERIMENTAL FEATURES</span>
            <div className="exp-section-divider-line" />
          </div>
          <div className="exp-btn-grid">
            {FRONTEND_FEATURES.map(f => (
              <button
                key={f.key}
                className="btn btn-outline exp-feature-btn"
                onClick={() => setOpenModal(f.key)}
              >
                {f.label}
              </button>
            ))}
          </div>

          {/* Backend section */}
          <div className="exp-section-divider" style={{ marginTop: '2rem' }}>
            <div className="exp-section-divider-line" />
            <span className="exp-section-divider-text">BACKEND EXPERIMENTAL FEATURES</span>
            <div className="exp-section-divider-line" />
          </div>
          <div className="exp-btn-grid">
            {BACKEND_FEATURES.map(f => (
              <button
                key={f.key}
                className="btn btn-outline exp-feature-btn"
                onClick={() => setOpenModal(f.key)}
              >
                {f.label}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Winner Card modal */}
      {openModal === 'winner_card' && (
        <WinnerCardModal onClose={() => setOpenModal(null)} getAuthHeaders={getAuthHeaders} />
      )}

      {/* Stub modals */}
      {openModal && STUB_MODALS.has(openModal) && (
        <ConstructionModal title={MODAL_TITLES[openModal]} onClose={() => setOpenModal(null)} />
      )}
    </Layout>
  );
}
