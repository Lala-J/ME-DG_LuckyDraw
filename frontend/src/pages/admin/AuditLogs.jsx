import { useState, useEffect, useRef, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import Layout from '../../components/Layout';

// ── Helpers ───────────────────────────────────────────────────────────────────

const MONTHS = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];

function formatDateTime(isoOrSqlite) {
  // SQLite returns "YYYY-MM-DD HH:MM:SS" (UTC). Append Z so JS parses it as UTC.
  const normalized = typeof isoOrSqlite === 'string' && !isoOrSqlite.includes('T')
    ? isoOrSqlite.replace(' ', 'T') + 'Z'
    : isoOrSqlite;
  const date = new Date(normalized);
  if (isNaN(date.getTime())) return isoOrSqlite ?? '—';
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

// Returns HH:MM:SS countdown string for a future ISO timestamp, or null if expired.
function countdownFromIso(isoString, now) {
  if (!isoString) return null;
  const expMs = new Date(isoString).getTime();
  const diffMs = expMs - now;
  if (diffMs <= 0) return null;
  const totalSecs = Math.floor(diffMs / 1000);
  return formatUptime(totalSecs);
}

// ── Status chip (mirrors Azure Connectivity badge style) ──────────────────────

function StatusChip({ status }) {
  // 'validated' / 'successful' → green   'rejected' / 'failed' → red
  const isPositive = status === 'validated' || status === 'successful';
  const label = status.charAt(0).toUpperCase() + status.slice(1);
  return (
    <div className={`status-badge ${isPositive ? 'status-open' : 'status-closed'}`}>
      <span className="status-dot" />
      {label}
    </div>
  );
}

// ── Reusable log table ────────────────────────────────────────────────────────

function AuditTable({ columns, rows, emptyMessage }) {
  if (rows === null) {
    return <div className="audit-log-empty">Loading…</div>;
  }
  if (rows.length === 0) {
    return <div className="audit-log-empty">{emptyMessage || 'No records found.'}</div>;
  }
  return (
    <div className="table-wrapper">
      <table className="data-table">
        <thead>
          <tr>
            {columns.map(col => (
              <th key={col.key}>{col.label}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row, i) => (
            <tr key={i}>
              {columns.map(col => (
                <td key={col.key}>{col.render ? col.render(row) : (row[col.key] ?? '—')}</td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

// ── Manual Registrations modal body ──────────────────────────────────────────

function ManualRegistrationsBody() {
  const [rows, setRows] = useState(null);
  const [error, setError] = useState(null);

  useEffect(() => {
    fetch('/api/admin/audit/manual-registrations', { credentials: 'include' })
      .then(r => r.ok ? r.json() : Promise.reject(r.status))
      .then(data => setRows(data))
      .catch(() => setError('Failed to load audit log.'));
  }, []);

  const columns = [
    {
      key: 'status',
      label: 'Status',
      render: row => <StatusChip status={row.status} />,
    },
    { key: 'full_name',    label: 'Full Name'     },
    { key: 'phone_number', label: 'Phone Number'  },
    {
      key: 'attempted_at',
      label: 'Timestamp',
      render: row => formatDateTime(row.attempted_at),
    },
    { key: 'ip_address', label: 'IP Address' },
  ];

  if (error) return <div className="audit-log-empty" style={{ color: '#e74c3c' }}>{error}</div>;
  return <AuditTable columns={columns} rows={rows} emptyMessage="No manual registration attempts logged yet." />;
}

// ── Azure Registrations modal body ───────────────────────────────────────────

function AzureRegistrationsBody() {
  const [rows, setRows] = useState(null);
  const [error, setError] = useState(null);

  useEffect(() => {
    fetch('/api/admin/audit/azure-registrations', { credentials: 'include' })
      .then(r => r.ok ? r.json() : Promise.reject(r.status))
      .then(data => setRows(data))
      .catch(() => setError('Failed to load audit log.'));
  }, []);

  const columns = [
    {
      key: 'status',
      label: 'Status',
      render: row => <StatusChip status={row.status} />,
    },
    { key: 'full_name',     label: 'Full Name'      },
    { key: 'phone_number',  label: 'Phone Number'   },
    {
      key: 'attempted_at',
      label: 'Timestamp',
      render: row => formatDateTime(row.attempted_at),
    },
    { key: 'email_address', label: 'Email Address'  },
  ];

  if (error) return <div className="audit-log-empty" style={{ color: '#e74c3c' }}>{error}</div>;
  return <AuditTable columns={columns} rows={rows} emptyMessage="No Azure registration attempts logged yet." />;
}

// ── Admin Logins modal body ───────────────────────────────────────────────────

function AdminLoginsBody() {
  const [rows, setRows] = useState(null);
  const [error, setError] = useState(null);
  const [now, setNow] = useState(Date.now());

  useEffect(() => {
    fetch('/api/admin/audit/admin-logins', { credentials: 'include' })
      .then(r => r.ok ? r.json() : Promise.reject(r.status))
      .then(data => setRows(data))
      .catch(() => setError('Failed to load audit log.'));
  }, []);

  // Tick every second to keep countdown live
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, []);

  const columns = [
    {
      key: 'status',
      label: 'Status',
      render: row => <StatusChip status={row.status} />,
    },
    { key: 'ip_address', label: 'IP Address' },
    {
      key: 'attempted_at',
      label: 'Timestamp',
      render: row => formatDateTime(row.attempted_at),
    },
    {
      key: 'token_expires_at',
      label: 'Token Expiry',
      render: row => {
        if (!row.token_expires_at) return <span style={{ opacity: 0.5 }}>—</span>;
        const countdown = countdownFromIso(row.token_expires_at, now);
        if (!countdown) return <span style={{ color: '#e74c3c' }}>Expired</span>;
        return <span style={{ color: '#2ecc71', fontVariantNumeric: 'tabular-nums' }}>{countdown}</span>;
      },
    },
  ];

  if (error) return <div className="audit-log-empty" style={{ color: '#e74c3c' }}>{error}</div>;
  return <AuditTable columns={columns} rows={rows} emptyMessage="No admin login attempts logged yet." />;
}

// ── Home Screen Changes modal body ───────────────────────────────────────────

function HomeScreenChangesBody() {
  const [rows, setRows] = useState(null);
  const [error, setError] = useState(null);

  useEffect(() => {
    fetch('/api/admin/audit/home-changes', { credentials: 'include' })
      .then(r => r.ok ? r.json() : Promise.reject(r.status))
      .then(data => setRows(data))
      .catch(() => setError('Failed to load audit log.'));
  }, []);

  const columns = [
    {
      key: 'changed_at',
      label: 'Timestamp',
      render: row => formatDateTime(row.changed_at),
    },
    { key: 'field',     label: 'Modified Field' },
    { key: 'old_value', label: 'Old Data',       render: row => row.old_value || <span style={{ opacity: 0.5 }}>—</span> },
    { key: 'new_value', label: 'New Data',        render: row => row.new_value || <span style={{ opacity: 0.5 }}>—</span> },
  ];

  if (error) return <div className="audit-log-empty" style={{ color: '#e74c3c' }}>{error}</div>;
  return <AuditTable columns={columns} rows={rows} emptyMessage="No home screen changes logged yet." />;
}

// ── Registration Changes ── helpers ──────────────────────────────────────────

const ACTION_LABELS = {
  registration_opened:      'Registration Opened',
  registration_closed:      'Registration Closed',
  validation_uploaded:      'Validation Table Uploaded',
  bulk_registration:        'Bulk Registration',
  validation_entry_added:   'Validation Entry Added',
  validation_entry_selected:'Validation Entry Selected',
  validation_deleted:       'Validation Table Deleted',
  registration_deleted:     'Registration Table Deleted',
  validation_downloaded:    'Validation Table Downloaded',
  registration_downloaded:  'Registration Table Downloaded',
};

function RegActionDetail({ row, onBack }) {
  const details = (() => { try { return JSON.parse(row.details); } catch { return {}; } })();
  const ts = formatDateTime(row.changed_at);

  let content;
  switch (row.action_type) {
    case 'registration_opened': {
      const dur = details.duration_seconds || 0;
      const h = Math.floor(dur / 3600);
      const m = Math.floor((dur % 3600) / 60);
      const s = dur % 60;
      const durStr = `${String(h).padStart(2,'0')}:${String(m).padStart(2,'0')}:${String(s).padStart(2,'0')}`;
      content = (
        <div className="audit-detail-block">
          <div className="audit-detail-row"><span>Opened At</span><span>{ts}</span></div>
          <div className="audit-detail-row"><span>Scheduled Close</span><span>{formatDateTime(details.end_time)}</span></div>
          <div className="audit-detail-row"><span>Duration</span><span>{durStr}</span></div>
        </div>
      );
      break;
    }
    case 'registration_closed': {
      const method = details.method === 'auto' ? 'Auto-Close (timer expired)' : 'Forced by Admin';
      content = (
        <div className="audit-detail-block">
          <div className="audit-detail-row"><span>Closed At</span><span>{ts}</span></div>
          <div className="audit-detail-row"><span>Method</span><span>{method}</span></div>
        </div>
      );
      break;
    }
    case 'validation_uploaded':
      content = (
        <div className="audit-detail-block">
          <div className="audit-detail-row"><span>Uploaded At</span><span>{ts}</span></div>
          <div className="audit-detail-row"><span>Entries Loaded</span><span>{details.entry_count ?? '—'}</span></div>
        </div>
      );
      break;
    case 'bulk_registration':
      content = (
        <div className="audit-detail-block">
          <div className="audit-detail-row"><span>Performed At</span><span>{ts}</span></div>
          <div className="audit-detail-row"><span>Entries Copied</span><span>{details.inserted ?? '—'} of {details.total ?? '—'}</span></div>
        </div>
      );
      break;
    case 'validation_entry_added':
      content = (
        <div className="audit-detail-block">
          <div className="audit-detail-row"><span>Added At</span><span>{ts}</span></div>
          <div className="audit-detail-row"><span>Full Name</span><span>{details.full_name || '—'}</span></div>
          <div className="audit-detail-row"><span>Staff ID</span><span>{details.staff_id || '—'}</span></div>
          <div className="audit-detail-row"><span>Phone Number</span><span>{details.phone_number || '—'}</span></div>
          {details.title      && <div className="audit-detail-row"><span>Title</span><span>{details.title}</span></div>}
          {details.department && <div className="audit-detail-row"><span>Department</span><span>{details.department}</span></div>}
          {details.location   && <div className="audit-detail-row"><span>Location</span><span>{details.location}</span></div>}
        </div>
      );
      break;
    case 'validation_entry_selected':
      content = (
        <div className="audit-detail-block">
          <div className="audit-detail-row"><span>Added At</span><span>{ts}</span></div>
          <div className="audit-detail-row"><span>Full Name</span><span>{details.full_name || '—'}</span></div>
          <div className="audit-detail-row"><span>Staff ID</span><span>{details.staff_id || '—'}</span></div>
          <div className="audit-detail-row"><span>Phone Number</span><span>{details.phone_number || '—'}</span></div>
        </div>
      );
      break;
    default:
      content = (
        <div className="audit-detail-block">
          <div className="audit-detail-row"><span>Timestamp</span><span>{ts}</span></div>
        </div>
      );
  }

  return (
    <div className="audit-detail-view">
      <button className="val-edit-back-btn" onClick={onBack}>&#8592; Back</button>
      <h4 className="audit-detail-title">{ACTION_LABELS[row.action_type] || row.action_type}</h4>
      {content}
    </div>
  );
}

// ── Registration Changes modal body ──────────────────────────────────────────

function RegChangesBody() {
  const [rows, setRows] = useState(null);
  const [error, setError] = useState(null);
  const [selectedRow, setSelectedRow] = useState(null);

  useEffect(() => {
    fetch('/api/admin/audit/reg-changes', { credentials: 'include' })
      .then(r => r.ok ? r.json() : Promise.reject(r.status))
      .then(data => setRows(data))
      .catch(() => setError('Failed to load audit log.'));
  }, []);

  if (error) return <div className="audit-log-empty" style={{ color: '#e74c3c' }}>{error}</div>;

  if (selectedRow) {
    return <RegActionDetail row={selectedRow} onBack={() => setSelectedRow(null)} />;
  }

  const columns = [
    {
      key: 'changed_at',
      label: 'Timestamp',
      render: row => formatDateTime(row.changed_at),
    },
    {
      key: 'action_type',
      label: 'Action Type',
      render: row => (
        <button className="audit-action-link" onClick={() => setSelectedRow(row)}>
          {ACTION_LABELS[row.action_type] || row.action_type}
        </button>
      ),
    },
  ];

  return <AuditTable columns={columns} rows={rows} emptyMessage="No registration master changes logged yet." />;
}

// ── Website Changes modal body ────────────────────────────────────────────────

function WebsiteChangesBody() {
  const [rows, setRows] = useState(null);
  const [error, setError] = useState(null);

  useEffect(() => {
    fetch('/api/admin/audit/website-changes', { credentials: 'include' })
      .then(r => r.ok ? r.json() : Promise.reject(r.status))
      .then(data => setRows(data))
      .catch(() => setError('Failed to load audit log.'));
  }, []);

  const columns = [
    {
      key: 'changed_at',
      label: 'Timestamp',
      render: row => formatDateTime(row.changed_at),
    },
    { key: 'field', label: 'Modified Field' },
    { key: 'old_value', label: 'Old Data', render: row => row.old_value || <span style={{ opacity: 0.5 }}>—</span> },
    { key: 'new_value', label: 'New Data', render: row => row.new_value || <span style={{ opacity: 0.5 }}>—</span> },
  ];

  if (error) return <div className="audit-log-empty" style={{ color: '#e74c3c' }}>{error}</div>;
  return <AuditTable columns={columns} rows={rows} emptyMessage="No website master changes logged yet." />;
}

// ── Lucky Draw Changes ── helpers ─────────────────────────────────────────────

const DRAW_ACTION_LABELS = {
  prize_added:          'Prize Added',
  prize_deleted:        'Prize Deleted',
  prize_image_deleted:  'Prize Image Deleted',
  prize_image_replaced: 'Prize Image Replaced',
  prize_name_changed:   'Prize Name Changed',
  round_added:          'Round Added',
  round_deleted:        'Round Deleted',
  prize_configuration:  'Prize Configuration',
  roulette_ran:         'Roulette Ran',
  roulette_redrawn:     'Roulette Redrawn',
  lucky_draw_reset:     'Lucky Draw Reset',
};

function DrawActionDetail({ row, onBack }) {
  const details = (() => { try { return JSON.parse(row.details); } catch { return {}; } })();
  const ts = formatDateTime(row.changed_at);

  let content;
  switch (row.action_type) {
    case 'prize_added':
      content = (
        <div className="audit-detail-block">
          <div className="audit-detail-row"><span>Added At</span><span>{ts}</span></div>
          <div className="audit-detail-row"><span>Prize Name</span><span>{details.prize_name || '—'}</span></div>
        </div>
      );
      break;
    case 'prize_deleted':
      content = (
        <div className="audit-detail-block">
          <div className="audit-detail-row"><span>Deleted At</span><span>{ts}</span></div>
          <div className="audit-detail-row"><span>Prize Name</span><span>{details.prize_name || '—'}</span></div>
        </div>
      );
      break;
    case 'prize_image_deleted':
      content = (
        <div className="audit-detail-block">
          <div className="audit-detail-row"><span>Deleted At</span><span>{ts}</span></div>
          <div className="audit-detail-row"><span>Prize Name</span><span>{details.prize_name || '—'}</span></div>
        </div>
      );
      break;
    case 'prize_image_replaced':
      content = (
        <div className="audit-detail-block">
          <div className="audit-detail-row"><span>Replaced At</span><span>{ts}</span></div>
          <div className="audit-detail-row"><span>Prize Name</span><span>{details.prize_name || '—'}</span></div>
        </div>
      );
      break;
    case 'prize_name_changed':
      content = (
        <div className="audit-detail-block">
          <div className="audit-detail-row"><span>Changed At</span><span>{ts}</span></div>
          <div className="audit-detail-row"><span>Old Name</span><span>{details.old_name || '—'}</span></div>
          <div className="audit-detail-row"><span>New Name</span><span>{details.new_name || '—'}</span></div>
        </div>
      );
      break;
    case 'round_added':
      content = (
        <div className="audit-detail-block">
          <div className="audit-detail-row"><span>Added At</span><span>{ts}</span></div>
          <div className="audit-detail-row"><span>Round Number</span><span>{details.round_number ?? '—'}</span></div>
          {details.custom_name && <div className="audit-detail-row"><span>Round Name</span><span>{details.custom_name}</span></div>}
        </div>
      );
      break;
    case 'round_deleted':
      content = (
        <div className="audit-detail-block">
          <div className="audit-detail-row"><span>Deleted At</span><span>{ts}</span></div>
          <div className="audit-detail-row"><span>Round Number</span><span>{details.round_number ?? '—'}</span></div>
          {details.custom_name && <div className="audit-detail-row"><span>Round Name</span><span>{details.custom_name}</span></div>}
        </div>
      );
      break;
    case 'prize_configuration': {
      const names = Array.isArray(details.prize_names) ? details.prize_names : [];
      content = (
        <div className="audit-detail-block">
          <div className="audit-detail-row"><span>Configured At</span><span>{ts}</span></div>
          <div className="audit-detail-row"><span>Round Number</span><span>{details.round_number ?? '—'}</span></div>
          {details.custom_name && <div className="audit-detail-row"><span>Round Name</span><span>{details.custom_name}</span></div>}
          {names.length > 0 && (
            <div className="audit-detail-row"><span>Prizes Assigned</span><span>{names.join(', ')}</span></div>
          )}
        </div>
      );
      break;
    }
    case 'roulette_ran':
    case 'roulette_redrawn': {
      const winners = Array.isArray(details.winners) ? details.winners : [];
      content = (
        <div className="audit-detail-block">
          <div className="audit-detail-row">
            <span>{row.action_type === 'roulette_redrawn' ? 'Redrawn At' : 'Ran At'}</span>
            <span>{ts}</span>
          </div>
          <div className="audit-detail-row"><span>Round Number</span><span>{details.round_number ?? '—'}</span></div>
          {details.custom_name && <div className="audit-detail-row"><span>Round Name</span><span>{details.custom_name}</span></div>}
          {winners.map((w, i) => (
            <div key={i} className="audit-detail-row">
              <span>Winner {i + 1}</span>
              <span>{w.full_name} ({w.staff_id}) — {w.prize_name}</span>
            </div>
          ))}
        </div>
      );
      break;
    }
    default:
      content = (
        <div className="audit-detail-block">
          <div className="audit-detail-row"><span>Reset At</span><span>{ts}</span></div>
        </div>
      );
  }

  return (
    <div className="audit-detail-view">
      <button className="val-edit-back-btn" onClick={onBack}>&#8592; Back</button>
      <h4 className="audit-detail-title">{DRAW_ACTION_LABELS[row.action_type] || row.action_type}</h4>
      {content}
    </div>
  );
}

// ── Lucky Draw Changes modal body ─────────────────────────────────────────────

function DrawChangesBody() {
  const [rows, setRows] = useState(null);
  const [error, setError] = useState(null);
  const [selectedRow, setSelectedRow] = useState(null);

  useEffect(() => {
    fetch('/api/admin/audit/draw-changes', { credentials: 'include' })
      .then(r => r.ok ? r.json() : Promise.reject(r.status))
      .then(data => setRows(data))
      .catch(() => setError('Failed to load audit log.'));
  }, []);

  if (error) return <div className="audit-log-empty" style={{ color: '#e74c3c' }}>{error}</div>;

  if (selectedRow) {
    return <DrawActionDetail row={selectedRow} onBack={() => setSelectedRow(null)} />;
  }

  const columns = [
    {
      key: 'changed_at',
      label: 'Timestamp',
      render: row => formatDateTime(row.changed_at),
    },
    {
      key: 'action_type',
      label: 'Action Type',
      render: row => (
        <button className="audit-action-link" onClick={() => setSelectedRow(row)}>
          {DRAW_ACTION_LABELS[row.action_type] || row.action_type}
        </button>
      ),
    },
  ];

  return <AuditTable columns={columns} rows={rows} emptyMessage="No lucky draw master changes logged yet." />;
}

// ── Experimental Feature Changes ── helpers ───────────────────────────────────

const WINNER_CARD_FIELD_LABELS = {
  full_name:  'Full Name',
  staff_id:   'Staff ID',
  title:      'Title',
  department: 'Department',
  location:   'Location',
  disabled:   'Disabled',
};

const EXP_ACTION_LABELS = {
  winner_card_changed:                'Winner Card Changes',
  stage_mod_no_group_changed:         'Disable Grouped Winners',
  stage_mod_transitions_changed:      'Transition Adjustments',
  font_header_changed:                'Header Font Changes',
  font_body_changed:                  'Paragraph Font Changes',
  font_deleted:                       'Font Deleted',
  reg_bulk_changed:                   'Enable Bulk Registration',
  reg_selective_changed:              'Enable Selective Registration',
  data_ignore_special_chars_changed:  'Ignore Special Characters',
  data_ignore_country_codes_changed:  'Ignore Country Codes',
  data_ignore_brackets_changed:       'Ignore Bracketed Characters',
  direct_validation_editing_changed:  'Validation Editing',
  direct_additional_entries_changed:  'Additional Entries',
};

function ExpActionDetail({ row, onBack }) {
  const details = (() => { try { return JSON.parse(row.details); } catch { return {}; } })();
  const ts = formatDateTime(row.changed_at);
  const onOff = (val) => val ? 'On' : 'Off';

  let content;
  switch (row.action_type) {
    case 'winner_card_changed': {
      const fields = Array.isArray(details.fields) ? details.fields : [];
      content = (
        <div className="audit-detail-block">
          <div className="audit-detail-row"><span>Changed At</span><span>{ts}</span></div>
          <div className="audit-detail-row"><span>Global Toggle</span><span>{onOff(details.enabled)}</span></div>
          {fields.map((f, i) => (
            <div key={i} className="audit-detail-row">
              <span>Field {i + 1}</span>
              <span>{WINNER_CARD_FIELD_LABELS[f] || f}</span>
            </div>
          ))}
        </div>
      );
      break;
    }
    case 'stage_mod_no_group_changed':
      content = (
        <div className="audit-detail-block">
          <div className="audit-detail-row"><span>Changed At</span><span>{ts}</span></div>
          <div className="audit-detail-row"><span>Global Toggle</span><span>{onOff(details.enabled)}</span></div>
          <div className="audit-detail-row"><span>Disable Grouped Winners</span><span>{onOff(details.no_group)}</span></div>
        </div>
      );
      break;
    case 'stage_mod_transitions_changed': {
      const changed = details.changed || {};
      content = (
        <div className="audit-detail-block">
          <div className="audit-detail-row"><span>Changed At</span><span>{ts}</span></div>
          <div className="audit-detail-row"><span>Global Toggle</span><span>{onOff(details.enabled)}</span></div>
          {changed.card_delay    != null && <div className="audit-detail-row"><span>Card Transition Delay</span><span>{changed.card_delay}s</span></div>}
          {changed.round_timeout != null && <div className="audit-detail-row"><span>Round Timeout</span><span>{changed.round_timeout}s</span></div>}
          {changed.suspense_delay != null && <div className="audit-detail-row"><span>Suspense Delay</span><span>{changed.suspense_delay}s</span></div>}
        </div>
      );
      break;
    }
    case 'font_header_changed':
      content = (
        <div className="audit-detail-block">
          <div className="audit-detail-row"><span>Changed At</span><span>{ts}</span></div>
          <div className="audit-detail-row"><span>Global Toggle</span><span>{onOff(details.enabled)}</span></div>
          <div className="audit-detail-row"><span>Font</span><span>{details.font_name || '—'}</span></div>
        </div>
      );
      break;
    case 'font_body_changed':
      content = (
        <div className="audit-detail-block">
          <div className="audit-detail-row"><span>Changed At</span><span>{ts}</span></div>
          <div className="audit-detail-row"><span>Global Toggle</span><span>{onOff(details.enabled)}</span></div>
          <div className="audit-detail-row"><span>Font</span><span>{details.font_name || '—'}</span></div>
        </div>
      );
      break;
    case 'font_deleted':
      content = (
        <div className="audit-detail-block">
          <div className="audit-detail-row"><span>Deleted At</span><span>{ts}</span></div>
          <div className="audit-detail-row"><span>Font Name</span><span>{details.font_name || '—'}</span></div>
        </div>
      );
      break;
    default:
      // All simple toggle types: reg, data pruning, direct editing
      content = (
        <div className="audit-detail-block">
          <div className="audit-detail-row"><span>Changed At</span><span>{ts}</span></div>
          <div className="audit-detail-row"><span>Toggled</span><span>{onOff(details.enabled)}</span></div>
        </div>
      );
  }

  return (
    <div className="audit-detail-view">
      <button className="val-edit-back-btn" onClick={onBack}>&#8592; Back</button>
      <h4 className="audit-detail-title">{EXP_ACTION_LABELS[row.action_type] || row.action_type}</h4>
      {content}
    </div>
  );
}

// ── Experimental Feature Changes modal body ───────────────────────────────────

function ExpChangesBody() {
  const [rows, setRows] = useState(null);
  const [error, setError] = useState(null);
  const [selectedRow, setSelectedRow] = useState(null);

  useEffect(() => {
    fetch('/api/admin/audit/exp-changes', { credentials: 'include' })
      .then(r => r.ok ? r.json() : Promise.reject(r.status))
      .then(data => setRows(data))
      .catch(() => setError('Failed to load audit log.'));
  }, []);

  if (error) return <div className="audit-log-empty" style={{ color: '#e74c3c' }}>{error}</div>;

  if (selectedRow) {
    return <ExpActionDetail row={selectedRow} onBack={() => setSelectedRow(null)} />;
  }

  const columns = [
    {
      key: 'changed_at',
      label: 'Timestamp',
      render: row => formatDateTime(row.changed_at),
    },
    {
      key: 'action_type',
      label: 'Action Type',
      render: row => (
        <button className="audit-action-link" onClick={() => setSelectedRow(row)}>
          {EXP_ACTION_LABELS[row.action_type] || row.action_type}
        </button>
      ),
    },
  ];

  return <AuditTable columns={columns} rows={rows} emptyMessage="No experimental feature changes logged yet." />;
}

// ── Generic log modal wrapper ─────────────────────────────────────────────────

const BODY_MAP = {
  manual_reg:      ManualRegistrationsBody,
  azure_reg:       AzureRegistrationsBody,
  admin_logins:    AdminLoginsBody,
  home_changes:    HomeScreenChangesBody,
  reg_changes:     RegChangesBody,
  draw_changes:    DrawChangesBody,
  website_changes: WebsiteChangesBody,
  exp_changes:     ExpChangesBody,
};

function LogModal({ logKey, title, onClose }) {
  const [visible, setVisible] = useState(false);
  const windowRef = useRef(null);

  useEffect(() => {
    requestAnimationFrame(() => requestAnimationFrame(() => setVisible(true)));
  }, []);

  const close = useCallback(() => { setVisible(false); setTimeout(onClose, 300); }, [onClose]);
  const handleBackdropClick = (e) => {
    if (windowRef.current && !windowRef.current.contains(e.target)) close();
  };

  const BodyComponent = BODY_MAP[logKey] || PlaceholderBody;

  return (
    <div
      className={`table-modal-backdrop${visible ? ' table-modal-backdrop--visible' : ''}`}
      onClick={handleBackdropClick}
    >
      <div
        className={`table-modal-window${visible ? ' table-modal-window--visible' : ''}`}
        ref={windowRef}
      >
        <div className="table-modal-header">
          <h3>{title}</h3>
          <button className="modal-close-btn" onClick={close}>&#x2715;</button>
        </div>

        <div className="table-modal-body">
          <BodyComponent />
        </div>
      </div>
    </div>
  );
}

// ── Placeholder body (admin action logs — not yet implemented) ────────────────

function PlaceholderBody() {
  return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%', padding: '4rem 2rem', textAlign: 'center' }}>
      <p style={{ fontSize: '1rem', opacity: 0.75, maxWidth: '520px', lineHeight: '1.7' }}>
        Whoops, this Audit Log is still being implemented :3
      </p>
    </div>
  );
}

// ── Status box icons ──────────────────────────────────────────────────────────

function IconInitialisation() {
  return (
    <svg className="audit-status-icon" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
      <path d="M12 3v5" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/>
      <path d="M7.05 5.05A8 8 0 1 0 16.95 5.05" stroke="currentColor" strokeWidth="2" strokeLinecap="round" fill="none"/>
    </svg>
  );
}

function IconUptime() {
  return (
    <svg className="audit-status-icon" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
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

// ── Section divider ───────────────────────────────────────────────────────────

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
  { key: 'home_changes',    label: 'Home Screen Master Changes'   },
  { key: 'reg_changes',     label: 'Registration Master Changes'  },
  { key: 'draw_changes',    label: 'Lucky Draw Master Changes'    },
  { key: 'website_changes', label: 'Website Master Changes'       },
  { key: 'exp_changes',     label: 'Experimental Features Changes' },
];

export default function AuditLogs() {
  const navigate = useNavigate();

  const [openModal, setOpenModal]   = useState(null);
  const [startTime, setStartTime]   = useState(null);
  const [uptime, setUptime]         = useState(0);
  const [azure, setAzure]           = useState(null);
  const [statusLoading, setStatusLoading] = useState(true);

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

  useEffect(() => {
    if (!startTime) return;
    const id = setInterval(() => {
      const elapsedSecs = Math.floor((Date.now() - startTime.getTime()) / 1000);
      setUptime(Math.max(0, elapsedSecs));
    }, 1000);
    return () => clearInterval(id);
  }, [startTime]);

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
            <StatusBox label="Website Initialisation" icon={<IconInitialisation />}>
              {statusLoading ? (
                <span className="audit-status-loading">Loading…</span>
              ) : startTime ? (
                <span className="audit-status-data">{formatDateTime(startTime.toISOString())}</span>
              ) : (
                <span className="audit-status-data audit-status-data--unavailable">N/A</span>
              )}
            </StatusBox>

            <StatusBox label="Website Uptime" icon={<IconUptime />}>
              {statusLoading ? (
                <span className="audit-status-loading">Loading…</span>
              ) : startTime ? (
                <span className="audit-status-data">{formatUptime(uptime)}</span>
              ) : (
                <span className="audit-status-data audit-status-data--unavailable">N/A</span>
              )}
            </StatusBox>

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
                    <span className="audit-status-org">{azure.orgName || 'N/A'}</span>
                  )}
                </div>
              ) : (
                <span className="audit-status-data audit-status-data--unavailable">N/A</span>
              )}
            </StatusBox>
          </div>

          {/* ── End-User Logs ── */}
          <SectionDivider text="END-USER ACTIONS" style={{ marginTop: '2rem' }} />
          <div className="audit-btn-col">
            {END_USER_LOGS.map(l => (
              <LogButton key={l.key} label={l.label} onClick={() => setOpenModal(l.key)} />
            ))}
          </div>

          {/* ── Admin Actions ── */}
          <SectionDivider text="ADMIN ACTIONS" style={{ marginTop: '2rem' }} />
          <div className="audit-btn-col">
            {ADMIN_ACTION_LOGS.map(l => (
              <LogButton key={l.key} label={l.label} onClick={() => setOpenModal(l.key)} />
            ))}
          </div>
        </div>
      </div>

      {activeModal && (
        <LogModal
          key={activeModal.key}
          logKey={activeModal.key}
          title={activeModal.label}
          onClose={() => setOpenModal(null)}
        />
      )}
    </Layout>
  );
}
