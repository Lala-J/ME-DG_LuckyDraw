import { useEffect, useState, useCallback, useRef } from 'react';
import { useConfig } from '../contexts/ConfigContext';
import Layout from '../components/Layout';

// Microsoft Office 365 icon — place your PNG at frontend/public/office365.png
function Office365Icon() {
  return (
    <img src="/office365.png" width="22" height="22" alt="" aria-hidden="true" style={{ objectFit: 'contain' }} />
  );
}

export default function Registration() {
  const { config } = useConfig();

  const [isOpen, setIsOpen] = useState(false);
  const [loading, setLoading] = useState(true);

  // Modal state
  const [modalOpen, setModalOpen] = useState(false);
  const [modalVisible, setModalVisible] = useState(false);

  // Manual entry form
  const [fullName, setFullName] = useState('');
  const [phoneNumber, setPhoneNumber] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [message, setMessage] = useState(null);
  const [messageType, setMessageType] = useState('');

  // Auth result from MS OAuth redirect
  const [msLoading, setMsLoading] = useState(false);

  const modalRef = useRef(null);

  const organisation = (config.organisation || '').trim();
  const subtitleText = organisation
    ? `Ensure your Phone Number is the same phone number provided to ${organisation}.`
    : 'Ensure your Phone Number is the same phone number provided to UNDEFINED.';

  const fetchStatus = useCallback(async () => {
    try {
      const res = await fetch('/api/registration/status');
      if (res.ok) {
        const data = await res.json();
        setIsOpen(data.open);
      }
    } catch (_) {
      // swallow — page will show closed state
    } finally {
      setLoading(false);
    }
  }, []);

  // Handle MS OAuth result token on page load
  useEffect(() => {
    fetchStatus();

    const params = new URLSearchParams(window.location.search);
    const authResult = params.get('authResult');
    if (!authResult) return;

    // Strip the query param from URL without reloading
    const clean = window.location.pathname;
    window.history.replaceState({}, '', clean);

    setMsLoading(true);

    fetch('/api/auth/microsoft/verify', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ token: authResult })
    })
      .then(r => r.json())
      .then(data => {
        if (data.success) {
          setMessage('Registration successful!');
          setMessageType('success');
        } else if (data.errorCode === 406) {
          setMessage('Registration Failed (406). Please attempt Registration via Manual Entry.');
          setMessageType('error');
        } else {
          setMessage('Registration Failed (501).');
          setMessageType('error');
        }
      })
      .catch(() => {
        setMessage('Registration Failed (501).');
        setMessageType('error');
      })
      .finally(() => setMsLoading(false));
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Open / close modal with animation
  const openModal = () => {
    setMessage(null);
    setMessageType('');
    setFullName('');
    setPhoneNumber('');
    setModalOpen(true);
    requestAnimationFrame(() => {
      requestAnimationFrame(() => setModalVisible(true));
    });
  };

  const closeModal = () => {
    setModalVisible(false);
    setTimeout(() => setModalOpen(false), 300);
  };

  // Close on backdrop click
  const handleBackdropClick = (e) => {
    if (modalRef.current && !modalRef.current.contains(e.target)) {
      closeModal();
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (submitting) return;

    setSubmitting(true);
    setMessage(null);

    try {
      const res = await fetch('/api/registration', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ fullName, phoneNumber })
      });
      const data = await res.json();

      if (data.success) {
        setMessage(data.message || 'Registration successful!');
        setMessageType('success');
        setFullName('');
        setPhoneNumber('');
        // Close modal after brief delay so user sees the success message
        setTimeout(() => closeModal(), 1800);
      } else {
        setMessage(data.message || 'Registration Failed. Double check your Full Name or Phone Number.');
        setMessageType('error');
      }
    } catch (_) {
      setMessage('Network error. Please try again.');
      setMessageType('error');
    } finally {
      setSubmitting(false);
    }
  };

  const handleMicrosoftLogin = () => {
    window.location.href = '/api/auth/microsoft/login';
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

          <div className="reg-login-buttons">
            {/* Primary: Microsoft */}
            <button
              className="btn reg-btn-o365"
              onClick={handleMicrosoftLogin}
              type="button"
            >
              <Office365Icon />
              Office 365 Registration
            </button>

            {/* Secondary: Manual Entry */}
            <button
              className="btn reg-btn-manual"
              onClick={openModal}
              type="button"
            >
              Manual Registration
            </button>
          </div>

          {/* MS OAuth result message — rendered below buttons, never overlapping */}
          {msLoading && !message && (
            <div className="message-box message-info reg-result-msg">Verifying your Microsoft login&hellip;</div>
          )}
          {(message && !modalOpen) && (
            <div className={`message-box message-${messageType} reg-result-msg`}>{message}</div>
          )}
        </div>
      </div>

      {/* Floating Manual Entry Modal */}
      {modalOpen && (
        <div
          className={`reg-modal-backdrop ${modalVisible ? 'reg-modal-backdrop--visible' : ''}`}
          onClick={handleBackdropClick}
        >
          <div
            className={`glass-card reg-modal-card ${modalVisible ? 'reg-modal-card--visible' : ''}`}
            ref={modalRef}
          >
            <div className="reg-modal-header">
              <h3>Manual Registration</h3>
              <button className="reg-modal-close" onClick={closeModal} aria-label="Close">
                &#x2715;
              </button>
            </div>

            <form onSubmit={handleSubmit}>
              <div className="form-group">
                <input
                  type="text"
                  className="form-input"
                  placeholder="Enter your Full Name"
                  value={fullName}
                  onChange={(e) => setFullName(e.target.value)}
                  required
                  autoFocus
                />
              </div>
              <div className="form-group">
                <input
                  type="tel"
                  className="form-input"
                  placeholder="Enter your Phone Number"
                  value={phoneNumber}
                  onChange={(e) => setPhoneNumber(e.target.value)}
                  required
                />
                <p className="form-hint">{subtitleText}</p>
              </div>
              <button
                type="submit"
                className="btn btn-primary btn-large reg-modal-submit"
                disabled={submitting}
              >
                {submitting ? 'Registering...' : 'Register'}
              </button>
            </form>

            {message && (
              <div className={`message-box message-${messageType}`}>{message}</div>
            )}
          </div>
        </div>
      )}
    </Layout>
  );
}
