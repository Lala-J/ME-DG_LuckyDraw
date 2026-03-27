import { useEffect, useState, useCallback } from 'react';
import Layout from '../components/Layout';

export default function Registration() {
  const [isOpen, setIsOpen] = useState(false);
  const [loading, setLoading] = useState(true);
  const [fullName, setFullName] = useState('');
  const [staffId, setStaffId] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [message, setMessage] = useState(null);
  const [messageType, setMessageType] = useState('');

  const fetchStatus = useCallback(async () => {
    try {
      const res = await fetch('/api/registration/status');
      if (res.ok) {
        const data = await res.json();
        setIsOpen(data.open);
      }
    } catch (err) {
      console.error('Failed to fetch status:', err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchStatus();
  }, [fetchStatus]);

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (submitting) return;

    setSubmitting(true);
    setMessage(null);

    try {
      const res = await fetch('/api/registration', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ fullName, staffId })
      });
      const data = await res.json();

      if (data.success) {
        setMessage(data.message || 'Registration successful!');
        setMessageType('success');
        setFullName('');
        setStaffId('');
      } else {
        setMessage(data.message || 'Registration Failed. Double check your Full Name or Staff ID.');
        setMessageType('error');
      }
    } catch (err) {
      setMessage('Network error. Please try again.');
      setMessageType('error');
    } finally {
      setSubmitting(false);
    }
  };

  if (loading) {
    return (
      <Layout>
        <div className="registration-page">
          <div className="glass-card">
            <p className="loading-text">Loading...</p>
          </div>
        </div>
      </Layout>
    );
  }

  if (!isOpen) {
    return (
      <Layout>
        <div className="registration-page">
          <div className="glass-card registration-closed-card">
            <div className="lock-icon">
              <svg width="64" height="64" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <rect x="3" y="11" width="18" height="11" rx="2" ry="2" />
                <path d="M7 11V7a5 5 0 0 1 10 0v4" />
              </svg>
            </div>
            <h2>Registrations are Closed.</h2>
          </div>
        </div>
      </Layout>
    );
  }

  return (
    <Layout>
      <div className="registration-page">
        <div className="glass-card registration-form-card">
          <h2>Register</h2>
          <form onSubmit={handleSubmit}>
            <div className="form-group">
              <input
                type="text"
                className="form-input"
                placeholder="Enter your Full Name"
                value={fullName}
                onChange={(e) => setFullName(e.target.value)}
                required
              />
            </div>
            <div className="form-group">
              <input
                type="text"
                className="form-input"
                placeholder="Enter your Staff ID (CASE SENSITIVE)"
                value={staffId}
                onChange={(e) => setStaffId(e.target.value)}
                required
              />
              <p className="form-hint">Ensure your Staff ID is written exactly as it is on your Access Card.</p>
            </div>
            <button type="submit" className="btn btn-primary btn-large" disabled={submitting}>
              {submitting ? 'Registering...' : 'Register'}
            </button>
          </form>

          {message && (
            <div className={`message-box message-${messageType}`}>
              {message}
            </div>
          )}
        </div>
      </div>
    </Layout>
  );
}
