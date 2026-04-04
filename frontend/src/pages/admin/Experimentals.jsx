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

// ── Winner Card modal ─────────────────────────────────────────────────────────
function WinnerCardModal({ onClose, getAuthHeaders }) {
  const [visible, setVisible] = useState(false);
  const [enabled, setEnabled] = useState(false);
  const [fields, setFields] = useState(['full_name', 'staff_id', 'disabled', 'disabled']);
  const windowRef = useRef(null);

  useEffect(() => {
    requestAnimationFrame(() => requestAnimationFrame(() => setVisible(true)));
  }, []);

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

        <div className="fullscreen-modal-body">
          <div className="exp-card-wrapper">
            <div className="exp-card-container">
              <div
                className="exp-winner-preview-card"
                style={{
                  filter:        !enabled ? 'blur(7px)' : 'none',
                  pointerEvents: !enabled ? 'none'      : 'auto',
                  userSelect:    !enabled ? 'none'      : 'auto',
                  transition:    'filter 0.4s ease',
                }}
              >
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

                <div className="exp-winner-preview-right">
                  <div className="exp-winner-preview-img">
                    <img src="/RewardsFallback.png" alt="Prize placeholder" />
                  </div>
                  <div className="exp-winner-preview-prize-name">Prize Name</div>
                  <div className="exp-winner-preview-prize-id">PRIZE-PLACEHOLDER</div>
                </div>
              </div>

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

// ── Font Family modal ─────────────────────────────────────────────────────────
function FontFamilyModal({ onClose, getAuthHeaders }) {
  const [visible, setVisible]       = useState(false);
  const [enabled, setEnabled]       = useState(false);
  const [fonts, setFonts]           = useState([]);
  const [headerFontId, setHeaderFontId] = useState('default');
  const [bodyFontId,   setBodyFontId]   = useState('default');
  const [uploading, setUploading]   = useState({ header: false, body: false });
  const [uploadError, setUploadError] = useState('');
  const headerInputRef = useRef(null);
  const bodyInputRef   = useRef(null);
  const windowRef      = useRef(null);

  useEffect(() => {
    requestAnimationFrame(() => requestAnimationFrame(() => setVisible(true)));
  }, []);

  const loadFonts = useCallback(() => {
    return fetch('/api/fonts')
      .then(r => r.ok ? r.json() : [])
      .then(data => setFonts(data))
      .catch(() => {});
  }, []);

  useEffect(() => {
    fetch('/api/config')
      .then(r => r.ok ? r.json() : null)
      .then(data => {
        if (!data) return;
        setEnabled(data.exp_font_enabled === '1');
        setHeaderFontId(data.exp_font_header_id || 'default');
        setBodyFontId(data.exp_font_body_id   || 'default');
      })
      .catch(() => {});
    loadFonts();
  }, [loadFonts]);

  const saveConfig = useCallback((newEnabled, newHeaderId, newBodyId) => {
    fetch('/api/config', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json', ...getAuthHeaders() },
      body: JSON.stringify({
        exp_font_enabled:   newEnabled ? '1' : '0',
        exp_font_header_id: newHeaderId,
        exp_font_body_id:   newBodyId,
      }),
    }).catch(() => {});
  }, [getAuthHeaders]);

  const handleMasterToggle = () => {
    const next = !enabled;
    setEnabled(next);
    saveConfig(next, headerFontId, bodyFontId);
  };

  const handleHeaderSelect = (e) => {
    const val = e.target.value;
    setHeaderFontId(val);
    saveConfig(enabled, val, bodyFontId);
  };

  const handleBodySelect = (e) => {
    const val = e.target.value;
    setBodyFontId(val);
    saveConfig(enabled, headerFontId, val);
  };

  const handleUpload = (slot) => async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    e.target.value = '';
    setUploadError('');

    const ext = file.name.split('.').pop().toLowerCase();
    if (!['ttf', 'otf', 'woff', 'woff2'].includes(ext)) {
      setUploadError('Invalid file type. Please upload a .ttf, .otf, .woff, or .woff2 file.');
      return;
    }

    setUploading(prev => ({ ...prev, [slot]: true }));
    const formData = new FormData();
    formData.append('font', file);

    try {
      const res = await fetch('/api/fonts', {
        method: 'POST',
        headers: getAuthHeaders(),
        body: formData,
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        setUploadError(err.error || 'Upload failed.');
        return;
      }
      const newFont = await res.json();
      await loadFonts();
      const newId = String(newFont.id);
      if (slot === 'header') {
        setHeaderFontId(newId);
        saveConfig(enabled, newId, bodyFontId);
      } else {
        setBodyFontId(newId);
        saveConfig(enabled, headerFontId, newId);
      }
    } catch {
      setUploadError('Upload failed. Please try again.');
    } finally {
      setUploading(prev => ({ ...prev, [slot]: false }));
    }
  };

  const handleDelete = async (fontId) => {
    const res = await fetch(`/api/fonts/${fontId}`, {
      method: 'DELETE',
      headers: getAuthHeaders(),
    }).catch(() => null);

    if (!res || !res.ok) return;

    let newHeader = headerFontId;
    let newBody   = bodyFontId;
    if (String(headerFontId) === String(fontId)) { newHeader = 'default'; setHeaderFontId('default'); }
    if (String(bodyFontId)   === String(fontId)) { newBody   = 'default'; setBodyFontId('default');   }
    if (newHeader !== headerFontId || newBody !== bodyFontId) {
      saveConfig(enabled, newHeader, newBody);
    }
    await loadFonts();
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
        <div className="fullscreen-modal-header">
          <h3>Font Family</h3>
          <div className="exp-toggle-group">
            <span className={`exp-toggle-label-text${enabled ? ' exp-toggle-label-text--on' : ''}`}>
              {enabled ? 'ENABLED' : 'DISABLED'}
            </span>
            <label className="exp-toggle-switch" title={enabled ? 'Disable feature' : 'Enable feature'}>
              <input type="checkbox" checked={enabled} onChange={handleMasterToggle} />
              <span className="exp-toggle-slider" />
            </label>
          </div>
        </div>

        <div className="fullscreen-modal-body">
          <div style={{ position: 'relative' }}>
            <div
              className="exp-font-container"
              style={{
                filter:        !enabled ? 'blur(7px)' : 'none',
                pointerEvents: !enabled ? 'none'      : 'auto',
                userSelect:    !enabled ? 'none'      : 'auto',
                transition:    'filter 0.4s ease',
              }}
            >
              <input ref={headerInputRef} type="file" accept=".ttf,.otf,.woff,.woff2" style={{ display: 'none' }} onChange={handleUpload('header')} />
              <input ref={bodyInputRef}   type="file" accept=".ttf,.otf,.woff,.woff2" style={{ display: 'none' }} onChange={handleUpload('body')}   />

              <div className="exp-font-row">
                <div className="exp-font-row-label">
                  <h4>Header Font</h4>
                  <p>Used for titles and headings. Default: Orbitron.</p>
                </div>
                <div className="exp-font-row-controls">
                  <select className="exp-font-select" value={headerFontId} onChange={handleHeaderSelect} disabled={!enabled}>
                    <option value="default" className="exp-font-option--default">Orbitron (Default)</option>
                    {fonts.map(f => <option key={f.id} value={String(f.id)}>{f.display_name}</option>)}
                  </select>
                  <button className="btn btn-outline btn-small exp-font-upload-btn" disabled={!enabled || uploading.header} onClick={() => headerInputRef.current?.click()}>
                    {uploading.header ? 'Uploading…' : '↑ Upload'}
                  </button>
                </div>
              </div>

              <div className="exp-font-row">
                <div className="exp-font-row-label">
                  <h4>Paragraph Font</h4>
                  <p>Used for body text and descriptions. Default: Rajdhani.</p>
                </div>
                <div className="exp-font-row-controls">
                  <select className="exp-font-select" value={bodyFontId} onChange={handleBodySelect} disabled={!enabled}>
                    <option value="default" className="exp-font-option--default">Rajdhani (Default)</option>
                    {fonts.map(f => <option key={f.id} value={String(f.id)}>{f.display_name}</option>)}
                  </select>
                  <button className="btn btn-outline btn-small exp-font-upload-btn" disabled={!enabled || uploading.body} onClick={() => bodyInputRef.current?.click()}>
                    {uploading.body ? 'Uploading…' : '↑ Upload'}
                  </button>
                </div>
              </div>

              {uploadError && <p className="exp-font-error">{uploadError}</p>}

              {fonts.length > 0 && (
                <div className="exp-font-library">
                  <h4 className="exp-font-library-title">Uploaded Fonts</h4>
                  <div className="exp-font-library-list">
                    {fonts.map(f => (
                      <div key={f.id} className="exp-font-library-item">
                        <span className="exp-font-library-name">
                          {f.display_name}
                          <span className="exp-font-library-fmt">.{f.format === 'truetype' ? 'ttf' : f.format === 'opentype' ? 'otf' : f.format}</span>
                        </span>
                        <button className="exp-font-delete-btn" title={`Remove ${f.display_name}`} onClick={() => handleDelete(f.id)}>&#x2715;</button>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              <p className="exp-winner-warning" style={{ marginTop: '1rem' }}>
                Note: Font changes apply site-wide and on the Lucky Draw Stage. Reload the page if changes
                do not appear immediately. Please note that changing the font may cause text wrapping to break in certain areas. Review any public-facing pages before using in production.
              </p>
            </div>

            {!enabled && <div className="exp-shimmer-overlay" />}
          </div>
        </div>
      </div>
    </div>
  );
}

// ── Stage Modification modal ──────────────────────────────────────────────────
function StageModModal({ onClose, getAuthHeaders }) {
  const [visible, setVisible] = useState(false);
  const [enabled, setEnabled] = useState(false);
  const [noGroup, setNoGroup] = useState(false);
  const [cardDelay, setCardDelay] = useState(2.5);
  const [roundTimeout, setRoundTimeout] = useState(7.0);
  const [suspenseDelay, setSuspenseDelay] = useState(3.0);
  const windowRef = useRef(null);

  useEffect(() => {
    requestAnimationFrame(() => requestAnimationFrame(() => setVisible(true)));
  }, []);

  useEffect(() => {
    fetch('/api/config')
      .then(r => r.ok ? r.json() : null)
      .then(data => {
        if (!data) return;
        setEnabled(data.exp_stage_mod_enabled === '1');
        setNoGroup(data.exp_stage_mod_no_group === '1');
        setCardDelay(parseFloat(data.exp_transition_card_delay) || 2.5);
        setRoundTimeout(parseFloat(data.exp_transition_round_timeout) || 7.0);
        setSuspenseDelay(parseFloat(data.exp_transition_suspense_delay) || 3.0);
      })
      .catch(() => {});
  }, []);

  const saveConfig = useCallback((newEnabled, newNoGroup, newCardDelay, newRoundTimeout, newSuspenseDelay) => {
    fetch('/api/config', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json', ...getAuthHeaders() },
      body: JSON.stringify({
        exp_stage_mod_enabled:          newEnabled  ? '1' : '0',
        exp_stage_mod_no_group:         newNoGroup  ? '1' : '0',
        exp_transition_card_delay:      String(newCardDelay),
        exp_transition_round_timeout:   String(newRoundTimeout),
        exp_transition_suspense_delay:  String(newSuspenseDelay),
      })
    }).catch(() => {});
  }, [getAuthHeaders]);

  const handleMasterToggle = () => {
    const next = !enabled;
    setEnabled(next);
    saveConfig(next, noGroup, cardDelay, roundTimeout, suspenseDelay);
  };

  const handleNoGroupToggle = () => {
    const next = !noGroup;
    setNoGroup(next);
    saveConfig(enabled, next, cardDelay, roundTimeout, suspenseDelay);
  };

  const handleDelayBlur = (setter, defaultVal, otherVals) => (e) => {
    const v = Math.max(0.1, parseFloat(e.target.value) || defaultVal);
    setter(v);
    saveConfig(enabled, noGroup, ...otherVals(v));
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
        <div className="fullscreen-modal-header">
          <h3>Stage Modification</h3>
          <div className="exp-toggle-group">
            <span className={`exp-toggle-label-text${enabled ? ' exp-toggle-label-text--on' : ''}`}>
              {enabled ? 'ENABLED' : 'DISABLED'}
            </span>
            <label className="exp-toggle-switch" title={enabled ? 'Disable feature' : 'Enable feature'}>
              <input type="checkbox" checked={enabled} onChange={handleMasterToggle} />
              <span className="exp-toggle-slider" />
            </label>
          </div>
        </div>

        <div className="fullscreen-modal-body">
          <div style={{ position: 'relative' }}>
            <div
              className="exp-options-container"
              style={{
                filter:        !enabled ? 'blur(7px)' : 'none',
                pointerEvents: !enabled ? 'none'      : 'auto',
                userSelect:    !enabled ? 'none'      : 'auto',
                transition:    'filter 0.4s ease',
              }}
            >
              <div className="exp-option-row">
                <div className="exp-option-left">
                  <h4>Disable Grouped Winners</h4>
                  <p>
                    When enabled, the Winners Overview screen (grouped winner cards) will not appear
                    after the one-by-one reveal. Instead, the Round Timeout delay will play after the
                    last winner of that round before transitioning to the Next Round Standby Screen.
                  </p>
                  <p>
                    This feature is useful if you want a round to only have one winner, which would
                    make the Winners Overview redundant.
                  </p>
                </div>
                <div className="exp-option-right">
                  <span className={`exp-toggle-label-text${noGroup ? ' exp-toggle-label-text--on' : ''}`}>
                    {noGroup ? 'ON' : 'OFF'}
                  </span>
                  <label className="exp-toggle-switch" title={noGroup ? 'Turn off' : 'Turn on'}>
                    <input type="checkbox" checked={noGroup} onChange={handleNoGroupToggle} disabled={!enabled} />
                    <span className="exp-toggle-slider" />
                  </label>
                </div>
              </div>

              <div className="exp-option-row exp-transition-row">
                <div className="exp-option-left">
                  <h4>Transition Adjustments</h4>
                  <p>Adjust the timing of stage transitions. Changes take effect on the next round start.</p>
                </div>
                <div className="exp-transition-inputs">
                  <div className="exp-transition-input-row">
                    <span className="exp-transition-label">Card Transition Delay</span>
                    <div className="exp-transition-control">
                      <input type="number" min="0.1" step="0.1" className="exp-transition-number" value={cardDelay} disabled={!enabled}
                        onChange={(e) => setCardDelay(e.target.value)}
                        onBlur={handleDelayBlur(setCardDelay, 2.5, (v) => [v, roundTimeout, suspenseDelay])} />
                      <span className="exp-transition-unit">s</span>
                    </div>
                  </div>
                  <div className="exp-transition-input-row">
                    <span className="exp-transition-label">Round Timeout</span>
                    <div className="exp-transition-control">
                      <input type="number" min="0.1" step="0.1" className="exp-transition-number" value={roundTimeout} disabled={!enabled}
                        onChange={(e) => setRoundTimeout(e.target.value)}
                        onBlur={handleDelayBlur(setRoundTimeout, 7.0, (v) => [cardDelay, v, suspenseDelay])} />
                      <span className="exp-transition-unit">s</span>
                    </div>
                  </div>
                  <div className="exp-transition-input-row">
                    <span className="exp-transition-label">Suspense Delay</span>
                    <div className="exp-transition-control">
                      <input type="number" min="0.1" step="0.1" className="exp-transition-number" value={suspenseDelay} disabled={!enabled}
                        onChange={(e) => setSuspenseDelay(e.target.value)}
                        onBlur={handleDelayBlur(setSuspenseDelay, 3.0, (v) => [cardDelay, roundTimeout, v])} />
                      <span className="exp-transition-unit">s</span>
                    </div>
                  </div>
                </div>
              </div>
            </div>

            {!enabled && <div className="exp-shimmer-overlay" />}
          </div>
        </div>
      </div>
    </div>
  );
}

// ── Shared: backend option row ────────────────────────────────────────────────
// Renders a single authenticated-save option row used by all backend modals.
// `opts`/`setOpts` are the parent's state object; `handleSave` is a shared
// handler that posts to /api/config/secure.
function BackendOptionRow({ configKey, label, description, opts, setOpts, handleSave, children }) {
  const opt = opts[configKey];
  if (!opt) return null;
  return (
    <div className="exp-option-row">
      <div className="exp-option-left">
        <h4>{label}</h4>
        {description && <p>{description}</p>}
        {children}
      </div>
      <div className="exp-option-right exp-backend-option-right">
        <div className="exp-toggle-group">
          <span className={`exp-toggle-label-text${opt.val ? ' exp-toggle-label-text--on' : ''}`}>
            {opt.val ? 'ON' : 'OFF'}
          </span>
          <label className="exp-toggle-switch">
            <input
              type="checkbox"
              checked={opt.val}
              onChange={() => setOpts(prev => ({ ...prev, [configKey]: { ...prev[configKey], val: !prev[configKey].val } }))}
            />
            <span className="exp-toggle-slider" />
          </label>
        </div>
        <div className="exp-backend-save-row">
          <input
            type="password"
            className="exp-backend-pw-input"
            placeholder="Password"
            value={opt.pw}
            onChange={(e) => setOpts(prev => ({ ...prev, [configKey]: { ...prev[configKey], pw: e.target.value } }))}
            onKeyDown={(e) => { if (e.key === 'Enter' && opt.pw && !opt.saving) handleSave(configKey); }}
          />
          <button
            className="btn btn-primary btn-small exp-backend-save-btn"
            onClick={() => handleSave(configKey)}
            disabled={opt.saving || !opt.pw}
          >
            {opt.saving ? 'Saving…' : 'Save'}
          </button>
        </div>
        {opt.msg && (
          <p className={opt.msg.type === 'error' ? 'exp-backend-msg--error' : 'exp-backend-msg--success'}>
            {opt.msg.text}
          </p>
        )}
      </div>
    </div>
  );
}

// Shared hook-style helper: builds opts state and a save handler for a backend modal.
function useBackendOpts(keys, getAuthHeaders) {
  const initial = {};
  for (const k of keys) initial[k] = { val: false, pw: '', saving: false, msg: null };
  const [opts, setOpts] = useState(initial);
  const [configLoaded, setConfigLoaded] = useState(false);

  useEffect(() => {
    fetch('/api/config')
      .then(r => r.ok ? r.json() : {})
      .then(data => {
        setOpts(prev => {
          const next = { ...prev };
          for (const k of keys) {
            next[k] = { ...next[k], val: data[k] === '1' };
          }
          return next;
        });
        setConfigLoaded(true);
      })
      .catch(() => setConfigLoaded(true));
  // keys array is stable (defined at call site); getAuthHeaders changes won't
  // fire this effect again by design (we only need the initial load).
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleSave = useCallback(async (key) => {
    const pw = opts[key]?.pw;
    if (!pw) return;
    setOpts(prev => ({ ...prev, [key]: { ...prev[key], saving: true, msg: null } }));
    try {
      const res = await fetch('/api/config/secure', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json', ...getAuthHeaders() },
        body: JSON.stringify({ password: pw, [key]: opts[key].val ? '1' : '0' }),
      });
      if (res.ok) {
        setOpts(prev => ({ ...prev, [key]: { ...prev[key], saving: false, pw: '', msg: { type: 'success', text: 'Saved successfully.' } } }));
      } else {
        const data = await res.json().catch(() => ({}));
        setOpts(prev => ({ ...prev, [key]: { ...prev[key], saving: false, msg: { type: 'error', text: data.error || 'Failed to save.' } } }));
      }
    } catch {
      setOpts(prev => ({ ...prev, [key]: { ...prev[key], saving: false, msg: { type: 'error', text: 'Network error.' } } }));
    }
  }, [opts, getAuthHeaders]);

  return { opts, setOpts, handleSave, configLoaded };
}

// ── Registration Handling modal ───────────────────────────────────────────────
function RegistrationHandlingModal({ onClose, getAuthHeaders }) {
  const [visible, setVisible] = useState(false);
  const windowRef = useRef(null);
  const KEYS = ['exp_bulk_reg_enabled', 'exp_selective_reg_enabled'];
  const { opts, setOpts, handleSave, configLoaded } = useBackendOpts(KEYS, getAuthHeaders);

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
          <h3>Registration Handling</h3>
          <button className="modal-close-btn" onClick={close}>&#x2715;</button>
        </div>

        <div className="fullscreen-modal-body">
          {!configLoaded ? (
            <p className="exp-backend-loading">Loading…</p>
          ) : (
            <div className="exp-options-container">
              <BackendOptionRow
                configKey="exp_bulk_reg_enabled"
                label="Enable Bulk Registration"
                description='Enables the "Copy Validation to Registration" button in the Registration Master. When disabled, that button is grayed out and cannot be used. Disabled by default.'
                opts={opts} setOpts={setOpts} handleSave={handleSave}
              />
              <BackendOptionRow
                configKey="exp_selective_reg_enabled"
                label="Enable Selective Registration"
                description='Enables the "Add" button inside the Validation Table Full View Modal in the Registration Master, allowing the Admin to manually register individual users into the Registration Table. When disabled, the button is grayed out. Disabled by default.'
                opts={opts} setOpts={setOpts} handleSave={handleSave}
              />
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// ── Data Pruning modal ────────────────────────────────────────────────────────
function DataPruningModal({ onClose, getAuthHeaders }) {
  const [visible, setVisible] = useState(false);
  const windowRef = useRef(null);
  const KEYS = ['exp_ignore_special_chars', 'exp_ignore_country_codes', 'exp_ignore_brackets'];
  const { opts, setOpts, handleSave, configLoaded } = useBackendOpts(KEYS, getAuthHeaders);

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
          <h3>Data Pruning</h3>
          <button className="modal-close-btn" onClick={close}>&#x2715;</button>
        </div>

        <div className="fullscreen-modal-body">
          {!configLoaded ? (
            <p className="exp-backend-loading">Loading…</p>
          ) : (
            <div className="exp-options-container">
              <BackendOptionRow
                configKey="exp_ignore_special_chars"
                label="Ignore Special Characters"
                description="When enabled, any character in the Full Name field that is not a standard English letter or a space is silently discarded before the name is validated against the Validation Table. For example, &quot;Tethys Melyon :)&quot; becomes &quot;Tethys Melyon&quot;. Applies to both Azure and Manual Registration."
                opts={opts} setOpts={setOpts} handleSave={handleSave}
              />
              <BackendOptionRow
                configKey="exp_ignore_country_codes"
                label="Ignore Country Codes"
                description="When enabled, a leading E.164 country code (e.g. +960 for the Maldives) is stripped from the Phone Number before it is matched against the Validation Table. The system first attempts a direct match; only if that fails does it retry with the country code removed. Applies to both Azure and Manual Registration."
                opts={opts} setOpts={setOpts} handleSave={handleSave}
              />
              <BackendOptionRow
                configKey="exp_ignore_brackets"
                label="Ignore Bracketed Characters"
                description="When enabled, any text enclosed in round brackets — including the brackets themselves — is removed from the Full Name before validation. Useful for Azure environments where a display name may include a suffix such as &quot;(DoSA)&quot; that does not appear in the Validation Table. Applies to both Azure and Manual Registration."
                opts={opts} setOpts={setOpts} handleSave={handleSave}
              />
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// ── Direct Editing modal ──────────────────────────────────────────────────────
function DirectEditingModal({ onClose, getAuthHeaders }) {
  const [visible, setVisible] = useState(false);
  const windowRef = useRef(null);
  const KEYS = ['exp_validation_editing', 'exp_additional_entries'];
  const { opts, setOpts, handleSave, configLoaded } = useBackendOpts(KEYS, getAuthHeaders);

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
          <h3>Direct Editing</h3>
          <button className="modal-close-btn" onClick={close}>&#x2715;</button>
        </div>

        <div className="fullscreen-modal-body">
          {!configLoaded ? (
            <p className="exp-backend-loading">Loading…</p>
          ) : (
            <div className="exp-options-container">
              <BackendOptionRow
                configKey="exp_validation_editing"
                label="Validation Editing"
                description="When enabled, the Admin can click any row in the Validation Table Full View Modal to open an inline editing window for that entry. All fields except the sequential ID can be modified. Entries cannot be saved without at minimum a Full Name and a Phone Number."
                opts={opts} setOpts={setOpts} handleSave={handleSave}
              />
              <BackendOptionRow
                configKey="exp_additional_entries"
                label="Additional Entries"
                description='When enabled, an "Add New Entry" button appears in the header of the Validation Table Full View Modal. Clicking it opens the same editing window pre-cleared, allowing the Admin to insert a brand-new entry. The sequential ID is always assigned automatically by the system and cannot be specified manually.'
                opts={opts} setOpts={setOpts} handleSave={handleSave}
              />
            </div>
          )}
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
  { key: 'reg_handling', label: 'Registration Handling' },
  { key: 'data_pruning', label: 'Data Pruning' },
  { key: 'direct_edit',  label: 'Direct Editing' },
];

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
              <button key={f.key} className="btn btn-outline exp-feature-btn" onClick={() => setOpenModal(f.key)}>
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
              <button key={f.key} className="btn btn-outline exp-feature-btn" onClick={() => setOpenModal(f.key)}>
                {f.label}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* ── Frontend modals ── */}
      {openModal === 'winner_card' && (
        <WinnerCardModal onClose={() => setOpenModal(null)} getAuthHeaders={getAuthHeaders} />
      )}
      {openModal === 'font_family' && (
        <FontFamilyModal onClose={() => setOpenModal(null)} getAuthHeaders={getAuthHeaders} />
      )}
      {openModal === 'stage_mod' && (
        <StageModModal onClose={() => setOpenModal(null)} getAuthHeaders={getAuthHeaders} />
      )}

      {/* ── Backend modals ── */}
      {openModal === 'reg_handling' && (
        <RegistrationHandlingModal onClose={() => setOpenModal(null)} getAuthHeaders={getAuthHeaders} />
      )}
      {openModal === 'data_pruning' && (
        <DataPruningModal onClose={() => setOpenModal(null)} getAuthHeaders={getAuthHeaders} />
      )}
      {openModal === 'direct_edit' && (
        <DirectEditingModal onClose={() => setOpenModal(null)} getAuthHeaders={getAuthHeaders} />
      )}
    </Layout>
  );
}
