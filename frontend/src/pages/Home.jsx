import { useEffect, useState, useRef, useCallback } from 'react';
import { Link } from 'react-router-dom';
import { useConfig } from '../contexts/ConfigContext';
import Layout from '../components/Layout';

export default function Home() {
  const { config } = useConfig();
  const [isOpen, setIsOpen] = useState(false);
  const [countdown, setCountdown] = useState(null);
  const [loaded, setLoaded] = useState(false);
  const timerRef = useRef(null);

  const fetchStatus = useCallback(async () => {
    try {
      const res = await fetch('/api/registration/status');
      if (res.ok) {
        const data = await res.json();
        setIsOpen(data.open);

        if (data.open && data.endTime) {
          const remaining = Math.max(0, Math.floor((new Date(data.endTime) - Date.now()) / 1000));
          setCountdown(remaining > 0 ? remaining : 0);
        } else {
          setCountdown(null);
        }
      }
    } catch (err) {
      console.error('Failed to fetch registration status:', err);
    } finally {
      setLoaded(true);
    }
  }, []);

  useEffect(() => {
    fetchStatus();
    const interval = setInterval(fetchStatus, 30000);
    return () => clearInterval(interval);
  }, [fetchStatus]);

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

  return (
    <Layout>
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

          <Link to="/registration" className="btn btn-primary btn-large home-register-btn">
            Registration
          </Link>

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
    </Layout>
  );
}
