import { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import Layout from '../../components/Layout';

// ── Helpers ───────────────────────────────────────────────────────────────────

const MONTHS = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];

function formatDateTime(date) {
  const d   = date.getDate();
  const mon = MONTHS[date.getMonth()];
  const y   = date.getFullYear();
  const hh  = String(date.getHours()).padStart(2, '0');
  const mm  = String(date.getMinutes()).padStart(2, '0');
  const ss  = String(date.getSeconds()).padStart(2, '0');
  return `${d}-${mon}-${y} ${hh}:${mm}:${ss}`;
}

function formatUptime(totalSeconds) {
  const h = Math.floor(totalSeconds / 3600);
  const m = Math.floor((totalSeconds % 3600) / 60);
  const s = totalSeconds % 60;
  return `${String(h).padStart(2,'0')}:${String(m).padStart(2,'0')}:${String(s).padStart(2,'0')}`;
}

// ── Placeholder modal ─────────────────────────────────────────────────────────

function LogModal({ title, onClose }) {
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

        <div className="fullscreen-modal-body">
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%', padding: '4rem 2rem', textAlign: 'center' }}>
            <p style={{ fontSize: '1rem', opacity: 0.75, maxWidth: '520px', lineHeight: '1.7' }}>
              Whoops, Audit Logs are still being implemented :3 — this will be an even longer
              process because I never originally planned for Audit Logs in the first place!
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}

// ── Status box icons ──────────────────────────────────────────────────────────

function IconInitialisation() {
  return (
    <svg className="audit-status-icon" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
      {/* Power button */}
      <path d="M12 3v5" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/>
      <path d="M7.05 5.05A8 8 0 1 0 16.95 5.05" stroke="currentColor" strokeWidth="2" strokeLinecap="round" fill="none"/>
    </svg>
  );
}

function IconUptime() {
  return (
    <svg className="audit-status-icon" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
      {/* Stopwatch */}
      <circle cx="12" cy="13" r="7" stroke="currentColor" strokeWidth="2"/>
      <path d="M12 13V9" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/>
      <path d="M9.5 3h5" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/>
      <path d="M19 5l1-1" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/>
    </svg>
  );
}

function IconAzure() {
  return (
    <img
      src="/azure_icon.png"
      alt="Azure"
      className="audit-status-icon audit-status-icon--img"
    />
  );
}

// ── Status box ────────────────────────────────────────────────────────────────

function StatusBox({ label, icon, children }) {
  return (
    <div className="audit-status-box">
      {icon && <div className="audit-status-box-icon">{icon}</div>}
      <div className="audit-status-box-label">{label}</div>
      <div className="audit-status-box-value">{children}</div>
    </div>
  );
}

// ── Section divider (same pattern as Experimentals) ───────────────────────────

function SectionDivider({ text, style }) {
  return (
    <div className="exp-section-divider" style={style}>
      <div className="exp-section-divider-line" />
      <span className="exp-section-divider-text">{text}</span>
      <div className="exp-section-divider-line" />
    </div>
  );
}

// ── Log button ────────────────────────────────────────────────────────────────

function LogButton({ label, onClick }) {
  return (
    <button className="btn btn-outline exp-feature-btn" onClick={onClick}>
      {label}
    </button>
  );
}

// ── Main page ─────────────────────────────────────────────────────────────────

const END_USER_LOGS = [
  { key: 'manual_reg',   label: 'Manual Registrations' },
  { key: 'azure_reg',    label: 'Azure Registrations'  },
  { key: 'admin_logins', label: 'Admin Logins'          },
];

const ADMIN_ACTION_LOGS = [
  { key: 'home_changes',   label: 'Home Screen Master Changes'      },
  { key: 'reg_changes',    label: 'Registration Master Changes'     },
  { key: 'draw_changes',   label: 'Lucky Draw Master Changes'       },
  { key: 'website_changes',label: 'Website Master Changes'          },
  { key: 'exp_changes',    label: 'Experimental Feature Changes'    },
];

export default function AuditLogs() {
  const navigate = useNavigate();

  const [openModal, setOpenModal]   = useState(null);
  const [startTime, setStartTime]   = useState(null);   // Date object
  const [uptime, setUptime]         = useState(0);       // seconds
  const [azure, setAzure]           = useState(null);    // { connected, orgName }
  const [statusLoading, setStatusLoading] = useState(true);

  // Fetch system status once on mount
  useEffect(() => {
    fetch('/api/system-status', { credentials: 'include' })
      .then(r => r.ok ? r.json() : null)
      .then(data => {
        if (!data) return;
        const st = new Date(data.startTime);
        setStartTime(st);
        const elapsedSecs = Math.floor((Date.now() - st.getTime()) / 1000);
        setUptime(Math.max(0, elapsedSecs));
        setAzure(data.azure);
      })
      .catch(() => {})
      .finally(() => setStatusLoading(false));
  }, []);

  // Uptime ticker
  useEffect(() => {
    if (!startTime) return;
    const id = setInterval(() => {
      const elapsedSecs = Math.floor((Date.now() - startTime.getTime()) / 1000);
      setUptime(Math.max(0, elapsedSecs));
    }, 1000);
    return () => clearInterval(id);
  }, [startTime]);

  const openLog = (key) => setOpenModal(key);
  const closeModal = () => setOpenModal(null);

  const allLogs = [...END_USER_LOGS, ...ADMIN_ACTION_LOGS];
  const activeModal = allLogs.find(l => l.key === openModal);

  return (
    <Layout>
      <div className="admin-page">
        <div className="glass-card admin-form-card">
          <div className="admin-header">
            <button className="btn btn-outline btn-small" onClick={() => navigate('/administrator/dashboard')}>
              &larr; Back
            </button>
            <h2>Audit Logs</h2>
          </div>

          {/* ── Status boxes ── */}
          <SectionDivider text="SYSTEM STATUS" />

          <div className="audit-status-row">
            {/* Website Initialisation */}
            <StatusBox label="Website Initialisation" icon={<IconInitialisation />}>
              {statusLoading ? (
                <span className="audit-status-loading">Loading…</span>
              ) : startTime ? (
                <span className="audit-status-data">{formatDateTime(startTime)}</span>
              ) : (
                <span className="audit-status-data audit-status-data--unavailable">N/A</span>
              )}
            </StatusBox>

            {/* Website Uptime */}
            <StatusBox label="Website Uptime" icon={<IconUptime />}>
              {statusLoading ? (
                <span className="audit-status-loading">Loading…</span>
              ) : startTime ? (
                <span className="audit-status-data">{formatUptime(uptime)}</span>
              ) : (
                <span className="audit-status-data audit-status-data--unavailable">N/A</span>
              )}
            </StatusBox>

            {/* Azure Connectivity */}
            <StatusBox label="Azure Connectivity" icon={<IconAzure />}>
              {statusLoading ? (
                <span className="audit-status-loading">Loading…</span>
              ) : azure ? (
                <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '0.4rem' }}>
                  <div className={`status-badge ${azure.connected ? 'status-open' : 'status-closed'}`}>
                    <span className="status-dot" />
                    {azure.connected ? 'ACTIVE' : 'INACTIVE'}
                  </div>
                  {azure.connected && (
                    <span className="audit-status-org">
                      {azure.orgName || 'N/A'}
                    </span>
                  )}
                </div>
              ) : (
                <span className="audit-status-data audit-status-data--unavailable">N/A</span>
              )}
            </StatusBox>
          </div>

          {/* ── End-User Logs ── */}
          <SectionDivider text="END-USER LOGS" style={{ marginTop: '2rem' }} />
          <div className="audit-btn-col">
            {END_USER_LOGS.map(l => (
              <LogButton key={l.key} label={l.label} onClick={() => openLog(l.key)} />
            ))}
          </div>

          {/* ── Admin Actions ── */}
          <SectionDivider text="ADMIN ACTIONS" style={{ marginTop: '2rem' }} />
          <div className="audit-btn-col">
            {ADMIN_ACTION_LOGS.map(l => (
              <LogButton key={l.key} label={l.label} onClick={() => openLog(l.key)} />
            ))}
          </div>
        </div>
      </div>

      {activeModal && (
        <LogModal title={activeModal.label} onClose={closeModal} />
      )}
    </Layout>
  );
}
