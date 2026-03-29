import { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../../contexts/AuthContext';
import Layout from '../../components/Layout';

export default function RegistrationConfig() {
  const { getAuthHeaders } = useAuth();
  const navigate = useNavigate();

  const [isOpen, setIsOpen] = useState(false);
  const [endTime, setEndTime] = useState(null);
  const [timeLeft, setTimeLeft] = useState(null);
  const [duration, setDuration] = useState('01:00:00');
  const [message, setMessage] = useState(null);

  const [validationData, setValidationData] = useState({ data: [], total: 0 });
  const [validationPage, setValidationPage] = useState(1);
  const [validationSearch, setValidationSearch] = useState('');

  const [registrationData, setRegistrationData] = useState({ data: [], total: 0 });
  const [registrationPage, setRegistrationPage] = useState(1);
  const [registrationSearch, setRegistrationSearch] = useState('');

  const [uploading, setUploading] = useState(false);
  const [copying, setCopying] = useState(false);
  const [starting, setStarting] = useState(false);

  const [deleteValidationConfirm, setDeleteValidationConfirm] = useState(false);
  const [deleteValidationPassword, setDeleteValidationPassword] = useState('');
  const [deletingValidation, setDeletingValidation] = useState(false);

  const [deleteRegistrationConfirm, setDeleteRegistrationConfirm] = useState(false);
  const [deleteRegistrationPassword, setDeleteRegistrationPassword] = useState('');
  const [deletingRegistration, setDeletingRegistration] = useState(false);

  const LIMIT = 100;

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

  const fetchValidation = useCallback(async (page, search = '') => {
    try {
      const params = new URLSearchParams({ page, limit: LIMIT });
      if (search) params.set('search', search);
      const res = await fetch(`/api/validation/table?${params}`, {
        headers: getAuthHeaders()
      });
      if (res.ok) {
        const data = await res.json();
        setValidationData(data);
      }
    } catch (err) {
      console.error('Failed to fetch validation:', err);
    }
  }, [getAuthHeaders]);

  const fetchRegistration = useCallback(async (page, search = '') => {
    try {
      const params = new URLSearchParams({ page, limit: LIMIT });
      if (search) params.set('search', search);
      const res = await fetch(`/api/registration/table?${params}`, {
        headers: getAuthHeaders()
      });
      if (res.ok) {
        const data = await res.json();
        setRegistrationData(data);
      }
    } catch (err) {
      console.error('Failed to fetch registration:', err);
    }
  }, [getAuthHeaders]);

  useEffect(() => { fetchStatus(); }, [fetchStatus]);

  // Countdown tick: updates timeLeft every second and auto-closes when expired
  useEffect(() => {
    if (!isOpen || !endTime) {
      setTimeLeft(null);
      return;
    }
    const tick = () => {
      const remaining = Math.max(0, Math.floor((new Date(endTime) - Date.now()) / 1000));
      setTimeLeft(remaining);
      if (remaining === 0) {
        setIsOpen(false);
        setEndTime(null);
      }
    };
    tick();
    const interval = setInterval(tick, 1000);
    return () => clearInterval(interval);
  }, [isOpen, endTime]);

  // Live-update registration table while registration is open
  useEffect(() => {
    if (!isOpen) return;
    const interval = setInterval(() => {
      fetchRegistration(registrationPage, registrationSearch);
    }, 5000);
    return () => clearInterval(interval);
  }, [isOpen, registrationPage, registrationSearch, fetchRegistration]);

  useEffect(() => {
    const t = setTimeout(() => fetchValidation(validationPage, validationSearch), validationSearch ? 200 : 0);
    return () => clearTimeout(t);
  }, [validationPage, validationSearch, fetchValidation]);

  useEffect(() => {
    const t = setTimeout(() => fetchRegistration(registrationPage, registrationSearch), registrationSearch ? 200 : 0);
    return () => clearTimeout(t);
  }, [registrationPage, registrationSearch, fetchRegistration]);

  const handleClose = async () => {
    try {
      const res = await fetch('/api/registration/close', {
        method: 'POST',
        headers: getAuthHeaders()
      });
      if (res.ok) {
        setIsOpen(false);
        setEndTime(null);
        setMessage({ type: 'success', text: 'Registration closed.' });
      }
    } catch (err) {
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

      if (totalSeconds <= 0) {
        setMessage({ type: 'error', text: 'Duration must be greater than 0.' });
        setStarting(false);
        return;
      }

      const res = await fetch('/api/registration/open', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...getAuthHeaders()
        },
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
      const res = await fetch('/api/validation/upload', {
        method: 'POST',
        headers: getAuthHeaders(),
        body: formData
      });

      if (res.ok) {
        const data = await res.json();
        setMessage({ type: 'success', text: `Validation table uploaded! ${data.count} entries loaded.` });
        setValidationSearch('');
        setValidationPage(1);
        fetchValidation(1, '');
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
      const res = await fetch('/api/validation/to-registration', {
        method: 'POST',
        headers: getAuthHeaders()
      });
      if (res.ok) {
        const data = await res.json();
        setMessage({ type: 'success', text: `Copied ${data.inserted} of ${data.total} entries to registration table.` });
        setRegistrationPage(1);
        fetchRegistration(1, registrationSearch);
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
      setValidationSearch('');
      setValidationPage(1);
      fetchValidation(1, '');
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
      setRegistrationSearch('');
      setRegistrationPage(1);
      fetchRegistration(1, '');
    } catch (err) {
      setMessage({ type: 'error', text: err.message });
    } finally {
      setDeletingRegistration(false);
    }
  };

  const handleAddToRegistration = async (full_name, staff_id, phone_number) => {
    setMessage(null);
    try {
      const res = await fetch('/api/registration/add-entry', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...getAuthHeaders() },
        body: JSON.stringify({ full_name, staff_id, phone_number: phone_number || '' })
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to add entry');
      setMessage({ type: 'success', text: `${full_name} added to registration.` });
      fetchRegistration(registrationPage, registrationSearch);
    } catch (err) {
      setMessage({ type: 'error', text: err.message });
    }
  };

  const handleDownload = (type) => {
    const url = type === 'validation' ? '/api/validation/download' : '/api/registration/download';
    const headers = getAuthHeaders();
    fetch(url, { headers })
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

  const renderPagination = (currentPage, totalPages, setPage) => {
    const pages = [];
    const start = Math.max(1, currentPage - 2);
    const end = Math.min(totalPages, currentPage + 2);

    for (let i = start; i <= end; i++) {
      pages.push(i);
    }

    return (
      <div className="pagination">
        <button
          className="btn btn-small btn-outline"
          disabled={currentPage <= 1}
          onClick={() => setPage(currentPage - 1)}
        >
          Previous
        </button>
        {pages.map(p => (
          <button
            key={p}
            className={`btn btn-small ${p === currentPage ? 'btn-primary' : 'btn-outline'}`}
            onClick={() => setPage(p)}
          >
            {p}
          </button>
        ))}
        <button
          className="btn btn-small btn-outline"
          disabled={currentPage >= totalPages}
          onClick={() => setPage(currentPage + 1)}
        >
          Next
        </button>
      </div>
    );
  };

  const renderTable = (rows, columns, startIndex = 0, onRowAction = null) => {
    if (!rows || rows.length === 0) {
      return <p className="empty-text">No data available.</p>;
    }

    return (
      <div className="table-wrapper">
        <table className="data-table">
          <thead>
            <tr>
              {columns.map(col => (
                <th key={col.key}>{col.label}</th>
              ))}
              {onRowAction && <th></th>}
            </tr>
          </thead>
          <tbody>
            {rows.map((row, idx) => (
              <tr key={idx}>
                {columns.map(col => (
                  <td key={col.key}>
                    {col.key === 'id' ? startIndex + idx + 1 : row[col.key]}
                  </td>
                ))}
                {onRowAction && (
                  <td>
                    <button
                      className="btn btn-primary btn-small"
                      onClick={() => onRowAction(row)}
                    >
                      Add
                    </button>
                  </td>
                )}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    );
  };

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

          <div className="reg-controls">
            <div className="reg-status-toggle">
              <span className="form-label">Registration Status:</span>
              <div className="toggle-row">
                <span className={`status-badge ${isOpen ? 'status-open' : 'status-closed'}`}>
                  <span className="status-dot"></span>
                  {isOpen ? 'OPEN' : 'CLOSED'}
                </span>
                {isOpen && timeLeft !== null && (
                  <span className="reg-countdown-timer">
                    Closes in {formatTimeLeft(timeLeft)}
                  </span>
                )}
                {isOpen && (
                  <button className="btn btn-danger btn-small" onClick={handleClose}>
                    Close Registration
                  </button>
                )}
              </div>
            </div>

            {!isOpen && (
              <div className="reg-open-controls">
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
                <button className="btn btn-primary" onClick={handleStart} disabled={starting}>
                  {starting ? 'Starting...' : 'Start Registration'}
                </button>
              </div>
            )}
          </div>

          <div className="upload-controls">
            <div className="form-group">
              <label className="form-label">Upload Validation Table (Excel)</label>
              <input
                type="file"
                className="form-input form-file"
                accept=".xlsx,.xls,.csv"
                onChange={handleUpload}
                disabled={uploading}
              />
            </div>
            <button className="btn btn-secondary" onClick={handleCopyToRegistration} disabled={copying}>
              {copying ? 'Copying...' : 'Copy Validation to Registration'}
            </button>
          </div>

          <div className="tables-side-by-side">
            <div className="table-section">
              <div className="table-header">
                <h3>Validation Table</h3>
                <div style={{ display: 'flex', gap: '0.5rem' }}>
                  <button className="btn btn-outline btn-small" onClick={() => handleDownload('validation')}>
                    Download
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
              <input
                type="text"
                className="form-input"
                placeholder="Search name, staff ID or phone..."
                value={validationSearch}
                onChange={(e) => { setValidationSearch(e.target.value); setValidationPage(1); }}
                style={{ marginBottom: '0.5rem' }}
              />
              {renderTable(validationData.data, validationColumns, (validationPage - 1) * LIMIT, (row) => handleAddToRegistration(row.full_name, row.staff_id, row.phone_number))}
              {renderPagination(validationPage, totalValidationPages, setValidationPage)}
            </div>

            <div className="table-section">
              <div className="table-header">
                <h3>Registration Table</h3>
                <div style={{ display: 'flex', gap: '0.5rem' }}>
                  <button className="btn btn-outline btn-small" onClick={() => handleDownload('registration')}>
                    Download
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
              <input
                type="text"
                className="form-input"
                placeholder="Search name, staff ID or phone..."
                value={registrationSearch}
                onChange={(e) => { setRegistrationSearch(e.target.value); setRegistrationPage(1); }}
                style={{ marginBottom: '0.5rem' }}
              />
              {renderTable(registrationData.data, registrationColumns, (registrationPage - 1) * LIMIT)}
              {renderPagination(registrationPage, totalRegistrationPages, setRegistrationPage)}
            </div>
          </div>
        </div>
      </div>
    </Layout>
  );
}
