import { useState, useEffect, useCallback, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../../contexts/AuthContext';
import { useConfig } from '../../contexts/ConfigContext';
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

const LIMIT = 30;

// Table Popup Window
function TablePopup({
  title,
  data,
  columns,
  page,
  totalPages,
  search,
  onSearchChange,
  onPageChange,
  onClose,
  renderCell,
  startIndex
}) {
  const [visible, setVisible] = useState(false);
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

  const renderPagination = () => {
    const showPrevNext = totalPages > 5;
    let start = Math.max(1, page - 2);
    let end = start + 4;
    if (end > totalPages) { end = totalPages; start = Math.max(1, end - 4); }
    const pages = [];
    for (let i = start; i <= end; i++) pages.push(i);
    return (
      <div className="pagination">
        {showPrevNext && (
          <button className="btn btn-small btn-outline" disabled={page <= 1} onClick={() => onPageChange(page - 1)}>Previous</button>
        )}
        {pages.map(p => (
          <button key={p} className={`btn btn-small ${p === page ? 'btn-primary' : 'btn-outline'}`} onClick={() => onPageChange(p)}>{p}</button>
        ))}
        {showPrevNext && (
          <button className="btn btn-small btn-outline" disabled={page >= totalPages} onClick={() => onPageChange(page + 1)}>Next</button>
        )}
      </div>
    );
  };

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

        <div className="table-modal-search">
          <input
            type="text"
            className="form-input"
            placeholder="Search for Full Name, Staff ID, Phone Number or Department..."
            value={search}
            onChange={(e) => onSearchChange(e.target.value)}
            autoFocus
          />
        </div>

        <div className="table-modal-body">
          {(!data || data.length === 0) ? (
            <p className="empty-text">No data available.</p>
          ) : (
            <div className="table-wrapper">
              <table className="data-table">
                <thead>
                  <tr>
                    {columns.map(col => <th key={col.key}>{col.label}</th>)}
                  </tr>
                </thead>
                <tbody>
                  {data.map((row, idx) => (
                    <tr key={idx}>
                      {columns.map(col => (
                        <td key={col.key}>
                          {renderCell ? renderCell(col, row, startIndex + idx) : (
                            col.key === 'id' ? startIndex + idx + 1 : row[col.key]
                          )}
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>

        <div className="table-modal-footer">
          {renderPagination()}
        </div>
      </div>
    </div>
  );
}

// ── Validation Table Full-View Modal (with Direct Editing / Additional Entries) ──
function ValidationFullViewModal({
  data, columns, page, totalPages, search,
  onSearchChange, onPageChange, onClose,
  renderCell, startIndex,
  validationEditing, additionalEntries,
  getAuthHeaders, onDataChange,
}) {
  const [visible, setVisible] = useState(false);
  const windowRef = useRef(null);

  // Edit / add panel state
  const [editMode, setEditMode] = useState(null); // null | 'edit' | 'add'
  const [editRow,  setEditRow]  = useState(null);
  const EMPTY_FORM = { full_name: '', staff_id: '', phone_number: '', title: '', department: '', location: '' };
  const [form,    setForm]    = useState(EMPTY_FORM);
  const [saving,  setSaving]  = useState(false);
  const [editMsg, setEditMsg] = useState(null);

  useEffect(() => {
    requestAnimationFrame(() => requestAnimationFrame(() => setVisible(true)));
  }, []);

  const close = () => { setVisible(false); setTimeout(onClose, 300); };
  const handleBackdropClick = (e) => {
    if (windowRef.current && !windowRef.current.contains(e.target)) close();
  };

  const openEdit = (row) => {
    setEditRow(row);
    setForm({
      full_name:    row.full_name    || '',
      staff_id:     row.staff_id     || '',
      phone_number: row.phone_number || '',
      title:        row.title        || '',
      department:   row.department   || '',
      location:     row.location     || '',
    });
    setEditMsg(null);
    setEditMode('edit');
  };

  const openAdd = () => {
    setEditRow(null);
    setForm(EMPTY_FORM);
    setEditMsg(null);
    setEditMode('add');
  };

  const closeEdit = () => { setEditMode(null); setEditMsg(null); };

  const handleFormChange = (field, value) => setForm(prev => ({ ...prev, [field]: value }));

  const handleSave = async () => {
    if (!form.full_name.trim() || !form.phone_number.trim()) {
      setEditMsg({ type: 'error', text: 'Full Name and Phone Number are required.' });
      return;
    }
    setSaving(true);
    setEditMsg(null);
    try {
      const url    = editMode === 'edit' ? `/api/validation/entry/${editRow.id}` : '/api/validation/entry';
      const method = editMode === 'edit' ? 'PUT' : 'POST';
      const res = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json', ...getAuthHeaders() },
        body: JSON.stringify(form),
      });
      const payload = await res.json().catch(() => ({}));
      if (res.ok) {
        setEditMsg({ type: 'success', text: editMode === 'edit' ? 'Entry updated.' : 'Entry added.' });
        onDataChange?.();
        // Briefly show success then close the panel
        setTimeout(() => closeEdit(), 1200);
      } else {
        setEditMsg({ type: 'error', text: payload.error || 'Failed to save.' });
      }
    } catch {
      setEditMsg({ type: 'error', text: 'Network error.' });
    } finally {
      setSaving(false);
    }
  };

  const renderPagination = () => {
    const showPrevNext = totalPages > 5;
    let start = Math.max(1, page - 2);
    let end   = start + 4;
    if (end > totalPages) { end = totalPages; start = Math.max(1, end - 4); }
    const pages = [];
    for (let i = start; i <= end; i++) pages.push(i);
    return (
      <div className="pagination">
        {showPrevNext && (
          <button className="btn btn-small btn-outline" disabled={page <= 1} onClick={() => onPageChange(page - 1)}>Previous</button>
        )}
        {pages.map(p => (
          <button key={p} className={`btn btn-small ${p === page ? 'btn-primary' : 'btn-outline'}`} onClick={() => onPageChange(p)}>{p}</button>
        ))}
        {showPrevNext && (
          <button className="btn btn-small btn-outline" disabled={page >= totalPages} onClick={() => onPageChange(page + 1)}>Next</button>
        )}
      </div>
    );
  };

  const FIELDS = [
    { key: 'full_name',    label: 'Full Name',    required: true  },
    { key: 'staff_id',     label: 'Staff ID',     required: false },
    { key: 'phone_number', label: 'Phone Number', required: true  },
    { key: 'title',        label: 'Title',        required: false },
    { key: 'department',   label: 'Department',   required: false },
    { key: 'location',     label: 'Location',     required: false },
  ];

  return (
    <div
      className={`table-modal-backdrop${visible ? ' table-modal-backdrop--visible' : ''}`}
      onClick={handleBackdropClick}
    >
      <div
        className={`table-modal-window${visible ? ' table-modal-window--visible' : ''}`}
        ref={windowRef}
      >
        {/* ── Header ── */}
        <div className="table-modal-header">
          {editMode ? (
            <>
              <h3>
                <button className="val-edit-back-btn" onClick={closeEdit}>&#8592; Back</button>
                {editMode === 'edit' ? 'Edit Entry' : 'Add New Entry'}
              </h3>
            </>
          ) : (
            <>
              <h3>
                Validation Table — Full View
                {additionalEntries && (
                  <button className="btn btn-download btn-small val-add-entry-btn" onClick={openAdd}>
                    + Add New Entry
                  </button>
                )}
              </h3>
            </>
          )}
          <button className="modal-close-btn" onClick={close}>&#x2715;</button>
        </div>

        {editMode ? (
          /* ── Edit / Add form ── */
          <div className="val-edit-body">
            <div className="val-edit-form">
              {FIELDS.map(f => (
                <div key={f.key} className="val-edit-field">
                  <label className="val-edit-label">
                    {f.label}{f.required && <span className="val-edit-required"> *</span>}
                  </label>
                  <input
                    type="text"
                    className="form-input"
                    value={form[f.key]}
                    onChange={(e) => handleFormChange(f.key, e.target.value)}
                    placeholder={f.required ? `${f.label} (required)` : f.label}
                  />
                </div>
              ))}
            </div>
            {editMsg && (
              <p className={editMsg.type === 'error' ? 'exp-backend-msg--error val-edit-msg' : 'exp-backend-msg--success val-edit-msg'}>
                {editMsg.text}
              </p>
            )}
            <div className="val-edit-actions">
              <button
                className="btn btn-primary"
                onClick={handleSave}
                disabled={saving || !form.full_name.trim() || !form.phone_number.trim()}
              >
                {saving ? 'Saving…' : 'Save Entry'}
              </button>
              <button className="btn btn-outline" onClick={closeEdit}>Cancel</button>
            </div>
          </div>
        ) : (
          /* ── Table list view ── */
          <>
            <div className="table-modal-search">
              <input
                type="text"
                className="form-input"
                placeholder="Search for Full Name, Staff ID, Phone Number or Department..."
                value={search}
                onChange={(e) => onSearchChange(e.target.value)}
                autoFocus
              />
            </div>
            <div className="table-modal-body">
              {(!data || data.length === 0) ? (
                <p className="empty-text">No data available.</p>
              ) : (
                <div className="table-wrapper">
                  <table className="data-table">
                    <thead>
                      <tr>{columns.map(col => <th key={col.key}>{col.label}</th>)}</tr>
                    </thead>
                    <tbody>
                      {data.map((row, idx) => (
                        <tr
                          key={idx}
                          className={validationEditing ? 'val-row-editable' : ''}
                          onClick={validationEditing ? () => openEdit(row) : undefined}
                        >
                          {columns.map(col => (
                            <td key={col.key} onClick={validationEditing && col.key === '_add' ? (e) => e.stopPropagation() : undefined}>
                              {renderCell ? renderCell(col, row, startIndex + idx) : (
                                col.key === 'id' ? startIndex + idx + 1 : row[col.key]
                              )}
                            </td>
                          ))}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
            <div className="table-modal-footer">
              {renderPagination()}
            </div>
          </>
        )}
      </div>
    </div>
  );
}

// Main Component
export default function RegistrationConfig() {
  const { getAuthHeaders } = useAuth();
  const { config } = useConfig();
  const navigate = useNavigate();

  // Backend Experimental Feature flags (read from global config on mount)
  const bulkRegEnabled      = config.exp_bulk_reg_enabled      === '1';
  const selectiveRegEnabled = config.exp_selective_reg_enabled === '1';
  const validationEditing   = config.exp_validation_editing    === '1';
  const additionalEntries   = config.exp_additional_entries    === '1';

  const prizeBadgeStyle = {
    background: `linear-gradient(135deg, ${config.bg_color1 || '#667eea'} 0%, ${config.bg_color2 || '#764ba2'} 100%)`,
    color: '#fff',
    display: 'inline-block',
    padding: '0.1rem 0.55rem',
    borderRadius: '20px',
    fontSize: 'inherit',
    fontFamily: 'inherit',
    fontWeight: 'inherit',
    letterSpacing: 'normal',
    whiteSpace: 'nowrap',
    lineHeight: 'inherit'
  };

  const [isOpen, setIsOpen] = useState(false);
  const [endTime, setEndTime] = useState(null);
  const [timeLeft, setTimeLeft] = useState(null);
  const [duration, setDuration] = useState('01:00:00');
  const [message, setMessage] = useState(null);

  // Main table state (no search)
  const [validationData, setValidationData] = useState({ data: [], total: 0 });
  const [validationPage, setValidationPage] = useState(1);

  const [registrationData, setRegistrationData] = useState({ data: [], total: 0 });
  const [registrationPage, setRegistrationPage] = useState(1);

  // Popup state
  const [validationPopupOpen, setValidationPopupOpen] = useState(false);
  const [validationPopupData, setValidationPopupData] = useState({ data: [], total: 0 });
  const [validationPopupPage, setValidationPopupPage] = useState(1);
  const [validationPopupSearch, setValidationPopupSearch] = useState('');

  const [registrationPopupOpen, setRegistrationPopupOpen] = useState(false);
  const [registrationPopupData, setRegistrationPopupData] = useState({ data: [], total: 0 });
  const [registrationPopupPage, setRegistrationPopupPage] = useState(1);
  const [registrationPopupSearch, setRegistrationPopupSearch] = useState('');

  const [uploading, setUploading] = useState(false);
  const [copying, setCopying] = useState(false);
  const [starting, setStarting] = useState(false);

  // Password modal
  const [pwModal, setPwModal] = useState(null); // { title, onConfirm }


  // Hidden file input ref for upload-after-auth flow
  const uploadInputRef = useRef(null);

  const [deleteValidationConfirm, setDeleteValidationConfirm] = useState(false);
  const [deleteValidationPassword, setDeleteValidationPassword] = useState('');
  const [deletingValidation, setDeletingValidation] = useState(false);

  const [deleteRegistrationConfirm, setDeleteRegistrationConfirm] = useState(false);
  const [deleteRegistrationPassword, setDeleteRegistrationPassword] = useState('');
  const [deletingRegistration, setDeletingRegistration] = useState(false);

  // Fetch functions

  const fetchStatus = useCallback(async () => {
    try {
      const res = await fetch('/api/registration/status');
      if (res.ok) {
        const data = await res.json();
        setIsOpen(data.open);
        setEndTime(data.open && data.endTime ? data.endTime : null);
      }
    } catch (err) {
      console.error('Failed to fetch status:', err);
    }
  }, []);

  const fetchValidation = useCallback(async (page) => {
    try {
      const params = new URLSearchParams({ page, limit: LIMIT });
      const res = await fetch(`/api/validation/table?${params}`, { headers: getAuthHeaders() });
      if (res.ok) setValidationData(await res.json());
    } catch (err) {
      console.error('Failed to fetch validation:', err);
    }
  }, [getAuthHeaders]);

  const fetchRegistration = useCallback(async (page) => {
    try {
      const params = new URLSearchParams({ page, limit: LIMIT });
      const res = await fetch(`/api/registration/table?${params}`, { headers: getAuthHeaders() });
      if (res.ok) setRegistrationData(await res.json());
    } catch (err) {
      console.error('Failed to fetch registration:', err);
    }
  }, [getAuthHeaders]);

  const fetchValidationPopup = useCallback(async (page, search) => {
    try {
      const params = new URLSearchParams({ page, limit: LIMIT });
      if (search) params.set('search', search);
      const res = await fetch(`/api/validation/table?${params}`, { headers: getAuthHeaders() });
      if (res.ok) setValidationPopupData(await res.json());
    } catch (err) {
      console.error('Failed to fetch validation popup:', err);
    }
  }, [getAuthHeaders]);

  const fetchRegistrationPopup = useCallback(async (page, search) => {
    try {
      const params = new URLSearchParams({ page, limit: LIMIT });
      if (search) params.set('search', search);
      const res = await fetch(`/api/registration/table?${params}`, { headers: getAuthHeaders() });
      if (res.ok) setRegistrationPopupData(await res.json());
    } catch (err) {
      console.error('Failed to fetch registration popup:', err);
    }
  }, [getAuthHeaders]);

  // Effects

  useEffect(() => { fetchStatus(); }, [fetchStatus]);

  // Countdown tick
  useEffect(() => {
    if (!isOpen || !endTime) { setTimeLeft(null); return; }
    const tick = () => {
      const remaining = Math.max(0, Math.floor((new Date(endTime) - Date.now()) / 1000));
      setTimeLeft(remaining);
      if (remaining === 0) { setIsOpen(false); setEndTime(null); }
    };
    tick();
    const interval = setInterval(tick, 1000);
    return () => clearInterval(interval);
  }, [isOpen, endTime]);

  // Live-update registration table while open
  useEffect(() => {
    if (!isOpen) return;
    const interval = setInterval(() => fetchRegistration(registrationPage), 5000);
    return () => clearInterval(interval);
  }, [isOpen, registrationPage, fetchRegistration]);

  useEffect(() => { fetchValidation(validationPage); }, [validationPage, fetchValidation]);
  useEffect(() => { fetchRegistration(registrationPage); }, [registrationPage, fetchRegistration]);

  // Popup data effects (instant reporting)
  useEffect(() => {
    if (!validationPopupOpen) return;
    fetchValidationPopup(validationPopupPage, validationPopupSearch);
  }, [validationPopupOpen, validationPopupPage, validationPopupSearch, fetchValidationPopup]);

  useEffect(() => {
    if (!registrationPopupOpen) return;
    fetchRegistrationPopup(registrationPopupPage, registrationPopupSearch);
  }, [registrationPopupOpen, registrationPopupPage, registrationPopupSearch, fetchRegistrationPopup]);

  // Handlers

  const handleClose = async () => {
    try {
      const res = await fetch('/api/registration/close', { method: 'POST', headers: getAuthHeaders() });
      if (res.ok) { setIsOpen(false); setEndTime(null); setMessage({ type: 'success', text: 'Registration closed.' }); }
    } catch {
      setMessage({ type: 'error', text: 'Failed to close registration.' });
    }
  };

  const handleStart = async () => {
    if (starting) return;
    setStarting(true);
    setMessage(null);
    try {
      const parts = duration.split(':').map(Number);
      const totalSeconds = (parts[0] || 0) * 3600 + (parts[1] || 0) * 60 + (parts[2] || 0);
      if (totalSeconds <= 0) { setMessage({ type: 'error', text: 'Duration must be greater than 0.' }); return; }

      const res = await fetch('/api/registration/open', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...getAuthHeaders() },
        body: JSON.stringify({ durationSeconds: totalSeconds })
      });

      if (res.ok) {
        const data = await res.json();
        setIsOpen(true);
        setEndTime(data.endTime || null);
        setMessage({ type: 'success', text: 'Registration opened!' });
      } else {
        const data = await res.json();
        throw new Error(data.error || 'Failed to open registration');
      }
    } catch (err) {
      setMessage({ type: 'error', text: err.message });
    } finally {
      setStarting(false);
    }
  };

  const handleUpload = async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    setUploading(true);
    setMessage(null);
    try {
      const formData = new FormData();
      formData.append('file', file);
      const res = await fetch('/api/validation/upload', { method: 'POST', headers: getAuthHeaders(), body: formData });
      if (res.ok) {
        const data = await res.json();
        setMessage({ type: 'success', text: `Validation table uploaded! ${data.count} entries loaded.` });
        setValidationPage(1);
        fetchValidation(1);
        if (validationPopupOpen) { setValidationPopupPage(1); fetchValidationPopup(1, validationPopupSearch); }
      } else {
        const data = await res.json();
        throw new Error(data.error || 'Upload failed');
      }
    } catch (err) {
      setMessage({ type: 'error', text: err.message });
    } finally {
      setUploading(false);
      e.target.value = '';
    }
  };

  const handleCopyToRegistration = async () => {
    if (copying) return;
    setCopying(true);
    setMessage(null);
    try {
      const res = await fetch('/api/validation/to-registration', { method: 'POST', headers: getAuthHeaders() });
      if (res.ok) {
        const data = await res.json();
        setMessage({ type: 'success', text: `Copied ${data.inserted} of ${data.total} entries to registration table.` });
        setRegistrationPage(1);
        fetchRegistration(1);
        if (registrationPopupOpen) { setRegistrationPopupPage(1); fetchRegistrationPopup(1, registrationPopupSearch); }
      } else {
        const data = await res.json();
        throw new Error(data.error || 'Copy failed');
      }
    } catch (err) {
      setMessage({ type: 'error', text: err.message });
    } finally {
      setCopying(false);
    }
  };

  const handleDeleteValidation = async () => {
    if (deletingValidation) return;
    setDeletingValidation(true);
    setMessage(null);
    try {
      const res = await fetch('/api/validation/clear', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...getAuthHeaders() },
        body: JSON.stringify({ password: deleteValidationPassword })
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Delete failed');
      setMessage({ type: 'success', text: 'Validation table cleared.' });
      setDeleteValidationConfirm(false);
      setDeleteValidationPassword('');
      setValidationPage(1);
      fetchValidation(1);
      if (validationPopupOpen) { setValidationPopupPage(1); fetchValidationPopup(1, validationPopupSearch); }
    } catch (err) {
      setMessage({ type: 'error', text: err.message });
    } finally {
      setDeletingValidation(false);
    }
  };

  const handleDeleteRegistration = async () => {
    if (deletingRegistration) return;
    setDeletingRegistration(true);
    setMessage(null);
    try {
      const res = await fetch('/api/registration/clear', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...getAuthHeaders() },
        body: JSON.stringify({ password: deleteRegistrationPassword })
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Delete failed');
      setMessage({ type: 'success', text: 'Registration table cleared.' });
      setDeleteRegistrationConfirm(false);
      setDeleteRegistrationPassword('');
      setRegistrationPage(1);
      fetchRegistration(1);
      if (registrationPopupOpen) { setRegistrationPopupPage(1); fetchRegistrationPopup(1, registrationPopupSearch); }
    } catch (err) {
      setMessage({ type: 'error', text: err.message });
    } finally {
      setDeletingRegistration(false);
    }
  };

  const handleAddToRegistration = async (row) => {
    setMessage(null);
    try {
      const res = await fetch('/api/registration/add-entry', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...getAuthHeaders() },
        body: JSON.stringify({
          full_name: row.full_name,
          staff_id: row.staff_id,
          phone_number: row.phone_number || '',
          title: row.title || '',
          department: row.department || '',
          location: row.location || ''
        })
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to add entry');
      setMessage({ type: 'success', text: `${row.full_name} added to registration.` });
      fetchRegistration(registrationPage);
      fetchRegistrationPopup(registrationPopupPage, registrationPopupSearch);
    } catch (err) {
      setMessage({ type: 'error', text: err.message });
    }
  };

  const handleDownload = (type) => {
    const url = type === 'validation' ? '/api/validation/download' : '/api/registration/download';
    fetch(url, { headers: getAuthHeaders() })
      .then(res => res.blob())
      .then(blob => {
        const a = document.createElement('a');
        a.href = URL.createObjectURL(blob);
        a.download = `${type}-table.xlsx`;
        a.click();
        URL.revokeObjectURL(a.href);
      })
      .catch(() => setMessage({ type: 'error', text: `Failed to download ${type} table.` }));
  };

  const formatTimeLeft = (seconds) => {
    const h = Math.floor(seconds / 3600);
    const m = Math.floor((seconds % 3600) / 60);
    const s = seconds % 60;
    return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
  };

  const totalValidationPages = Math.max(1, Math.ceil((validationData.total || 0) / LIMIT));
  const totalRegistrationPages = Math.max(1, Math.ceil((registrationData.total || 0) / LIMIT));
  const totalValidationPopupPages = Math.max(1, Math.ceil((validationPopupData.total || 0) / LIMIT));
  const totalRegistrationPopupPages = Math.max(1, Math.ceil((registrationPopupData.total || 0) / LIMIT));

  const formatDate = (dateStr) => {
    if (!dateStr) return '';
    const months = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
    const parts = dateStr.replace('T', ' ').split(/[- :]/);
    if (parts.length < 6) return dateStr;
    const [year, month, day, hh, mm, ss] = parts;
    return `${String(day).padStart(2,'0')}-${months[parseInt(month,10)-1]}-${year} ${hh}:${mm}:${ss}`;
  };

  const formatTime = (dateStr) => {
    if (!dateStr) return '';
    const parts = dateStr.replace('T', ' ').split(/[- :]/);
    if (parts.length < 6) return dateStr;
    const [,,, hh, mm, ss] = parts;
    return `${hh}:${mm}:${ss}`;
  };

  const renderPagination = (currentPage, totalPages, setPage) => {
    const showPrevNext = totalPages > 5;
    let start = Math.max(1, currentPage - 2);
    let end = start + 4;
    if (end > totalPages) { end = totalPages; start = Math.max(1, end - 4); }
    const pages = [];
    for (let i = start; i <= end; i++) pages.push(i);
    return (
      <div className="pagination">
        {showPrevNext && (
          <button className="btn btn-small btn-outline" disabled={currentPage <= 1} onClick={() => setPage(currentPage - 1)}>Previous</button>
        )}
        {pages.map(p => (
          <button key={p} className={`btn btn-small ${p === currentPage ? 'btn-primary' : 'btn-outline'}`} onClick={() => setPage(p)}>{p}</button>
        ))}
        {showPrevNext && (
          <button className="btn btn-small btn-outline" disabled={currentPage >= totalPages} onClick={() => setPage(currentPage + 1)}>Next</button>
        )}
      </div>
    );
  };

  // Main-page columns (no title/dept/location)
  const validationColumns = [
    { key: 'id', label: '#' },
    { key: 'full_name', label: 'Full Name' },
    { key: 'staff_id', label: 'Staff ID' },
    { key: 'phone_number', label: 'Phone Number' }
  ];

  const registrationColumns = [
    { key: 'id', label: '#' },
    { key: 'full_name', label: 'Full Name' },
    { key: 'staff_id', label: 'Staff ID' },
    { key: 'phone_number', label: 'Phone Number' },
    { key: 'prize_winner_mark', label: 'Prize' },
    { key: 'registered_at', label: 'Registered' }
  ];

  // Popup columns (all columns)
  const validationPopupColumns = [
    { key: 'id', label: '#' },
    { key: '_add', label: '' },
    { key: 'full_name', label: 'Full Name' },
    { key: 'staff_id', label: 'Staff ID' },
    { key: 'phone_number', label: 'Phone Number' },
    { key: 'title', label: 'Title' },
    { key: 'department', label: 'Department' },
    { key: 'location', label: 'Location' }
  ];

  const registrationPopupColumns = [
    { key: 'id', label: '#' },
    { key: 'full_name', label: 'Full Name' },
    { key: 'staff_id', label: 'Staff ID' },
    { key: 'phone_number', label: 'Phone Number' },
    { key: 'prize_winner_mark', label: 'Prize' },
    { key: 'registered_at', label: 'Registered' },
    { key: 'title', label: 'Title' },
    { key: 'department', label: 'Department' },
    { key: 'location', label: 'Location' }
  ];

  const renderMainTable = (rows, columns, startIndex) => {
    if (!rows || rows.length === 0) return <p className="empty-text">No data available.</p>;
    return (
      <div className="table-wrapper">
        <table className="data-table">
          <thead>
            <tr>{columns.map(col => <th key={col.key}>{col.label}</th>)}</tr>
          </thead>
          <tbody>
            {rows.map((row, idx) => (
              <tr key={idx}>
                {columns.map(col => (
                  <td key={col.key}>
                    {col.key === 'id'
                      ? startIndex + idx + 1
                      : col.key === 'prize_winner_mark'
                        ? (row.prize_winner_mark ? <span style={prizeBadgeStyle}>{row.prize_winner_mark}</span> : '')
                        : col.key === 'registered_at'
                          ? (row.registered_at
                              ? <span title={formatDate(row.registered_at)} style={{ cursor: 'default', borderBottom: '1px dotted currentColor', whiteSpace: 'nowrap' }}>
                                  {formatTime(row.registered_at)}
                                </span>
                              : '')
                          : row[col.key]}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    );
  };

  const renderValidationPopupCell = (col, row, globalIdx) => {
    if (col.key === 'id') return globalIdx + 1;
    if (col.key === '_add') return (
      <button
        className="btn btn-primary btn-small"
        style={{ whiteSpace: 'nowrap' }}
        onClick={() => handleAddToRegistration(row)}
        disabled={!selectiveRegEnabled}
        title={!selectiveRegEnabled ? 'Enable Selective Registration in Experimental Features → Registration Handling' : ''}
      >
        Add
      </button>
    );
    return row[col.key] || '';
  };

  const renderRegistrationPopupCell = (col, row, globalIdx) => {
    if (col.key === 'id') return globalIdx + 1;
    if (col.key === 'prize_winner_mark') {
      return row.prize_winner_mark
        ? <span style={prizeBadgeStyle}>{row.prize_winner_mark}</span>
        : '';
    }
    if (col.key === 'registered_at') return formatDate(row.registered_at);
    return row[col.key] || '';
  };

  return (
    <Layout>
      <div className="admin-page">
        <div className="glass-card admin-form-card">
          <div className="admin-header">
            <button className="btn btn-outline btn-small" onClick={() => navigate('/administrator/dashboard')}>
              &larr; Back
            </button>
            <h2>Registration Master</h2>
          </div>

          {message && (
            <div className={`message-box message-${message.type}`}>{message.text}</div>
          )}

          {/* Registration status */}
          <div className="reg-controls">
            <div className="reg-status-toggle">
              <span className="form-label">Registration Status:</span>
              <div className="toggle-row">
                <span className={`status-badge ${isOpen ? 'status-open' : 'status-closed'}`}>
                  <span className="status-dot"></span>
                  {isOpen ? 'OPEN' : 'CLOSED'}
                </span>
                {isOpen && timeLeft !== null && (
                  <span className="reg-countdown-timer">Closes in {formatTimeLeft(timeLeft)}</span>
                )}
                {isOpen && (
                  <button className="btn btn-danger btn-small" onClick={handleClose}>Close Registration</button>
                )}
              </div>
            </div>
          </div>

          {/* Action controls — two rows, each row: [form input] [button] */}
          <div className="reg-action-block">
            {!isOpen && (
              <div className="reg-action-row">
                <div className="form-group">
                  <label className="form-label">Duration (hh:mm:ss)</label>
                  <input
                    type="text"
                    className="form-input"
                    value={duration}
                    onChange={(e) => setDuration(e.target.value)}
                    placeholder="01:00:00"
                  />
                </div>
                <button className="btn btn-primary reg-action-btn" onClick={handleStart} disabled={starting}>
                  {starting ? 'Starting...' : 'Start Registration'}
                </button>
              </div>
            )}
            <div className="reg-action-row">
              <div className="form-group">
                <label className="form-label">Upload Validation Table (Excel)</label>
                {/* Hidden real file input — triggered after password auth */}
                <input
                  ref={uploadInputRef}
                  type="file"
                  className="form-input form-file"
                  accept=".xlsx,.xls,.csv"
                  onChange={handleUpload}
                  disabled={uploading}
                  style={{ display: 'none' }}
                />
                <button
                  type="button"
                  className="form-input form-file btn"
                  style={{ textAlign: 'left', cursor: uploading ? 'not-allowed' : 'pointer' }}
                  disabled={uploading}
                  onClick={() => setPwModal({
                    title: 'Enter Admin Password to Upload Validation Table',
                    onConfirm: () => { setPwModal(null); uploadInputRef.current?.click(); }
                  })}
                >
                  {uploading ? 'Uploading…' : 'Choose File…'}
                </button>
              </div>
              <button
                className="btn btn-primary reg-action-btn"
                onClick={handleCopyToRegistration}
                disabled={copying || !bulkRegEnabled}
                title={!bulkRegEnabled ? 'Enable Bulk Registration in Experimental Features → Registration Handling' : ''}
              >
                {copying ? 'Copying...' : 'Copy Validation to Registration'}
              </button>
            </div>
          </div>

          {/* Tables */}
          <div className="tables-side-by-side">

            {/* Validation Table */}
            <div className="table-section">
              <div className="table-header">
                <div className="table-header-left">
                  <h3>Validation Table</h3>
                  <button
                    className="btn-eye"
                    title="View full table"
                    onClick={() => { setValidationPopupOpen(true); setValidationPopupPage(1); setValidationPopupSearch(''); }}
                  >
                    👁
                  </button>
                </div>
                <div style={{ display: 'flex', gap: '0.5rem' }}>
                  <button className="btn btn-download btn-small" onClick={() => handleDownload('validation')}>
                    Download Table
                  </button>
                  <button className="btn btn-danger btn-small" onClick={() => { setDeleteValidationConfirm(true); setDeleteValidationPassword(''); }}>
                    Delete Table
                  </button>
                </div>
              </div>

              {deleteValidationConfirm && (
                <div className="delete-confirm-box">
                  <p>Enter admin password to delete all validation data:</p>
                  <input
                    type="password"
                    className="form-input"
                    value={deleteValidationPassword}
                    onChange={(e) => setDeleteValidationPassword(e.target.value)}
                    placeholder="Admin password"
                  />
                  <div style={{ display: 'flex', gap: '0.5rem', marginTop: '0.5rem' }}>
                    <button className="btn btn-danger btn-small" onClick={handleDeleteValidation} disabled={deletingValidation || !deleteValidationPassword}>
                      {deletingValidation ? 'Deleting...' : 'Confirm Delete'}
                    </button>
                    <button className="btn btn-outline btn-small" onClick={() => { setDeleteValidationConfirm(false); setDeleteValidationPassword(''); }}>
                      Cancel
                    </button>
                  </div>
                </div>
              )}

              <p className="table-count">Total: {validationData.total || 0}</p>
              {renderMainTable(validationData.data, validationColumns, (validationPage - 1) * LIMIT)}
              {renderPagination(validationPage, totalValidationPages, setValidationPage)}
            </div>

            {/* Registration Table */}
            <div className="table-section">
              <div className="table-header">
                <div className="table-header-left">
                  <h3>Registration Table</h3>
                  <button
                    className="btn-eye"
                    title="View full table"
                    onClick={() => { setRegistrationPopupOpen(true); setRegistrationPopupPage(1); setRegistrationPopupSearch(''); }}
                  >
                    👁
                  </button>
                </div>
                <div style={{ display: 'flex', gap: '0.5rem' }}>
                  <button className="btn btn-download btn-small" onClick={() => handleDownload('registration')}>
                    Download Table
                  </button>
                  <button className="btn btn-danger btn-small" onClick={() => { setDeleteRegistrationConfirm(true); setDeleteRegistrationPassword(''); }}>
                    Delete Table
                  </button>
                </div>
              </div>

              {deleteRegistrationConfirm && (
                <div className="delete-confirm-box">
                  <p>Enter admin password to delete all registration data:</p>
                  <input
                    type="password"
                    className="form-input"
                    value={deleteRegistrationPassword}
                    onChange={(e) => setDeleteRegistrationPassword(e.target.value)}
                    placeholder="Admin password"
                  />
                  <div style={{ display: 'flex', gap: '0.5rem', marginTop: '0.5rem' }}>
                    <button className="btn btn-danger btn-small" onClick={handleDeleteRegistration} disabled={deletingRegistration || !deleteRegistrationPassword}>
                      {deletingRegistration ? 'Deleting...' : 'Confirm Delete'}
                    </button>
                    <button className="btn btn-outline btn-small" onClick={() => { setDeleteRegistrationConfirm(false); setDeleteRegistrationPassword(''); }}>
                      Cancel
                    </button>
                  </div>
                </div>
              )}

              <p className="table-count">Total: {registrationData.total || 0}</p>
              {renderMainTable(registrationData.data, registrationColumns, (registrationPage - 1) * LIMIT)}
              {renderPagination(registrationPage, totalRegistrationPages, setRegistrationPage)}
            </div>

          </div>
        </div>
      </div>

      {/* Validation Table Popup (with Direct Editing support) */}
      {validationPopupOpen && (
        <ValidationFullViewModal
          data={validationPopupData.data}
          columns={validationPopupColumns}
          page={validationPopupPage}
          totalPages={totalValidationPopupPages}
          search={validationPopupSearch}
          onSearchChange={(val) => { setValidationPopupSearch(val); setValidationPopupPage(1); }}
          onPageChange={setValidationPopupPage}
          onClose={() => setValidationPopupOpen(false)}
          renderCell={renderValidationPopupCell}
          startIndex={(validationPopupPage - 1) * LIMIT}
          validationEditing={validationEditing}
          additionalEntries={additionalEntries}
          getAuthHeaders={getAuthHeaders}
          onDataChange={() => fetchValidationPopup(validationPopupPage, validationPopupSearch)}
        />
      )}

      {/* Registration Table Popup */}
      {registrationPopupOpen && (
        <TablePopup
          title="Registration Table — Full View"
          data={registrationPopupData.data}
          columns={registrationPopupColumns}
          page={registrationPopupPage}
          totalPages={totalRegistrationPopupPages}
          search={registrationPopupSearch}
          onSearchChange={(val) => { setRegistrationPopupSearch(val); setRegistrationPopupPage(1); }}
          onPageChange={setRegistrationPopupPage}
          onClose={() => setRegistrationPopupOpen(false)}
          renderCell={renderRegistrationPopupCell}
          startIndex={(registrationPopupPage - 1) * LIMIT}
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