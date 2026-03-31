import { useEffect, useState, useRef, useCallback } from 'react';
import { useConfig } from '../contexts/ConfigContext';
import Layout from '../components/Layout';

// Microsoft Office 365 icon
function Office365Icon() {
  return (
    <img src="/office365.png" width="22" height="22" alt="" aria-hidden="true" style={{ objectFit: 'contain' }} />
  );
}

// Pen-on-paper icon for Manual Registration
function PenSignIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M12 20h9" />
      <path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z" />
    </svg>
  );
}

export default function Home() {
  const { config } = useConfig();

  // Registration status
  const [isOpen, setIsOpen] = useState(false);
  const [countdown, setCountdown] = useState(null);
  const [loaded, setLoaded] = useState(false);
  const timerRef = useRef(null);

  // Modal state
  const [modalOpen, setModalOpen] = useState(false);
  const [modalVisible, setModalVisible] = useState(false);
  const modalRef = useRef(null);

  // Manual entry form
  const [fullName, setFullName] = useState('');
  const [phoneNumber, setPhoneNumber] = useState('');
  const [submitting, setSubmitting] = useState(false);

  // Toast notification
  const [toast, setToast] = useState(null); // { message, type }
  const [toastVisible, setToastVisible] = useState(false);
  const toastTimerRef = useRef(null);

  // MS OAuth loading state
  const [msLoading, setMsLoading] = useState(false);

  const organisation = (config.organisation || '').trim();
  const subtitleText = organisation
    ? `Ensure your Phone Number is the same phone number provided to ${organisation}.`
    : 'Ensure your Phone Number is the same phone number provided to UNDEFINED.';

  const showToast = useCallback((message, type) => {
    if (toastTimerRef.current) clearTimeout(toastTimerRef.current);
    setToast({ message, type });
    requestAnimationFrame(() => {
      requestAnimationFrame(() => setToastVisible(true));
    });
    toastTimerRef.current = setTimeout(() => {
      setToastVisible(false);
      setTimeout(() => setToast(null), 300);
    }, 4000);
  }, []);

  // Apply a status payload from either SSE or polling
  const applyStatus = useCallback((data) => {
    setIsOpen(data.open);
    if (data.open && data.endTime) {
      const remaining = Math.max(0, Math.floor((new Date(data.endTime) - Date.now()) / 1000));
      setCountdown(remaining > 0 ? remaining : 0);
    } else {
      setCountdown(null);
    }
    setLoaded(true);
  }, []);

  const fetchStatus = useCallback(async () => {
    try {
      const res = await fetch('/api/registration/status');
      if (res.ok) applyStatus(await res.json());
    } catch (err) {
      console.error('Failed to fetch registration status:', err);
    } finally {
      setLoaded(true);
    }
  }, [applyStatus]);

  useEffect(() => {
    // Immediate fetch — sets loaded state and seeds initial status before SSE connects
    fetchStatus();

    let source = null;
    let fallbackPoll = null;

    const startFallback = () => {
      if (!fallbackPoll) fallbackPoll = setInterval(fetchStatus, 5000);
    };

    try {
      source = new EventSource('/api/registration/status/stream');

      source.onmessage = (e) => {
        try { applyStatus(JSON.parse(e.data)); } catch (_) {}
      };

      // SSE connection failed — drop to polling so the page stays live
      source.onerror = () => {
        source.close();
        source = null;
        startFallback();
      };
    } catch (_) {
      // EventSource unavailable (very rare) — use polling
      startFallback();
    }

    return () => {
      if (source) source.close();
      if (fallbackPoll) clearInterval(fallbackPoll);
    };
  }, [fetchStatus, applyStatus]);

  // Handle MS OAuth result token on page load
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const authResult = params.get('authResult');
    if (!authResult) return;

    // Strip the query param from URL without reloading
    window.history.replaceState({}, '', window.location.pathname);

    setMsLoading(true);

    fetch('/api/auth/microsoft/verify', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ token: authResult })
    })
      .then(r => r.json())
      .then(data => {
        if (data.success) {
          showToast('Registration successful!', 'success');
        } else if (data.errorCode === 409) {
          showToast('This staff member is already registered.', 'error');
        } else if (data.errorCode === 406) {
          showToast('Registration Failed. Please attempt Registration via Manual Entry.', 'error');
        } else {
          showToast('Registration Failed. Please try again or contact support.', 'error');
        }
      })
      .catch(() => {
        showToast('Registration Failed (501).', 'error');
      })
      .finally(() => setMsLoading(false));
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Countdown timer
  useEffect(() => {
    if (timerRef.current) clearInterval(timerRef.current);

    if (countdown === null || countdown <= 0) {
      if (countdown !== null && countdown <= 0) {
        setIsOpen(false);
        setCountdown(null);
      }
      return;
    }

    timerRef.current = setInterval(() => {
      setCountdown(prev => {
        if (prev <= 1) {
          clearInterval(timerRef.current);
          setIsOpen(false);
          return null;
        }
        return prev - 1;
      });
    }, 1000);

    return () => clearInterval(timerRef.current);
  }, [countdown]);

  const formatTime = (seconds) => {
    if (seconds === null || seconds === undefined) return '00:00:00';
    const h = Math.floor(seconds / 3600);
    const m = Math.floor((seconds % 3600) / 60);
    const s = seconds % 60;
    return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
  };

  const openModal = () => {
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

  const handleBackdropClick = (e) => {
    if (modalRef.current && !modalRef.current.contains(e.target)) {
      closeModal();
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (submitting) return;

    setSubmitting(true);

    try {
      const res = await fetch('/api/registration', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ fullName, phoneNumber })
      });
      const data = await res.json();

      if (data.success) {
        showToast(data.message || 'Registration successful!', 'success');
        setFullName('');
        setPhoneNumber('');
        setTimeout(() => closeModal(), 1800);
      } else {
        showToast(data.message || 'Registration Failed. Double check your Full Name or Phone Number.', 'error');
      }
    } catch (_) {
      showToast('Network error. Please try again.', 'error');
    } finally {
      setSubmitting(false);
    }
  };

  const handleMicrosoftLogin = () => {
    window.location.href = '/api/auth/microsoft/login';
  };

  // Buttons are disabled (and greyed out) only once status is confirmed closed
  const buttonsDisabled = loaded && !isOpen;

  return (
    <Layout>
      {/* Toast notifications — fixed top-center */}
      {msLoading ? (
        <div className="reg-toast reg-toast--info reg-toast--visible">
          Verifying your Microsoft login&hellip;
        </div>
      ) : toast ? (
        <div className={`reg-toast reg-toast--${toast.type} ${toastVisible ? 'reg-toast--visible' : ''}`}>
          {toast.message}
        </div>
      ) : null}

      <div className="home-page">
        <div className="glass-card home-card">
          {config.logo_filename && (
            <div className="home-logo">
              <img
                src="/api/config/logo"
                alt="Logo"
                style={{
                  maxWidth: `${parseInt(config.logo_size) || 120}px`,
                  maxHeight: `${parseInt(config.logo_size) || 120}px`
                }}
              />
            </div>
          )}

          <h1 className="home-heading">{config.heading_text || 'Lucky Draw'}</h1>

          <div className={`reg-login-buttons home-reg-buttons${buttonsDisabled ? ' reg-buttons-disabled' : ''}`}>
            <button
              className="btn reg-btn-o365"
              onClick={handleMicrosoftLogin}
              type="button"
              disabled={buttonsDisabled}
            >
              <Office365Icon />
              Office 365 Registration
            </button>
            <button
              className="btn reg-btn-manual"
              onClick={openModal}
              type="button"
              disabled={buttonsDisabled}
            >
              <PenSignIcon />
              Manual Registration
            </button>
          </div>

          {config.subtitle_text && (
            <p className="home-subtitle">{config.subtitle_text}</p>
          )}

          {loaded && (
            <div className="reg-status-container">
              {isOpen ? (
                <>
                  <div className="status-badge status-open">
                    <span className="status-dot"></span>
                    REGISTRATIONS OPEN
                  </div>
                  {countdown !== null && countdown > 0 && (
                    <div className="countdown-timer">
                      <span className="countdown-label">Closing in</span>
                      <span className="countdown-value">{formatTime(countdown)}</span>
                    </div>
                  )}
                </>
              ) : (
                <div className="status-badge status-closed">
                  <span className="status-dot"></span>
                  REGISTRATIONS CLOSED
                </div>
              )}
            </div>
          )}
        </div>
      </div>

      {/* Manual Entry Modal */}
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
          </div>
        </div>
      )}
    </Layout>
  );
}