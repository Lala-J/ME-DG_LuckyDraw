import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../../contexts/AuthContext';
import { useConfig } from '../../contexts/ConfigContext';
import Layout from '../../components/Layout';

export default function MainConfig() {
  const { getAuthHeaders, logout } = useAuth();
  const { config, refreshConfig } = useConfig();
  const navigate = useNavigate();

  const [bgColor1, setBgColor1] = useState('#667eea');
  const [bgColor2, setBgColor2] = useState('#764ba2');
  const [bgColor3, setBgColor3] = useState('#f093fb');
  const [animSpeed, setAnimSpeed] = useState(8);
  const [copyrightVisible, setCopyrightVisible] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState(null);

  // Password change
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [changingPassword, setChangingPassword] = useState(false);

  // Wipe
  const [wipePassword, setWipePassword] = useState('');
  const [wiping, setWiping] = useState(false);
  const [wipeConfirm, setWipeConfirm] = useState(false);

  useEffect(() => {
    setBgColor1(config.bg_color1 || '#667eea');
    setBgColor2(config.bg_color2 || '#764ba2');
    setBgColor3(config.bg_color3 || '#f093fb');
    setAnimSpeed(parseInt(config.bg_animation_speed) || 8);
    setCopyrightVisible(config.copyright_visible !== '0');
  }, [config]);

  const handleSaveAppearance = async (e) => {
    e.preventDefault();
    setSaving(true);
    setMessage(null);

    try {
      const res = await fetch('/api/config', {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          ...getAuthHeaders()
        },
        body: JSON.stringify({
          bg_color1: bgColor1,
          bg_color2: bgColor2,
          bg_color3: bgColor3,
          bg_animation_speed: String(animSpeed),
          copyright_visible: copyrightVisible ? '1' : '0'
        })
      });

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || 'Failed to save');
      }

      await refreshConfig();
      setMessage({ type: 'success', text: 'Appearance saved!' });
    } catch (err) {
      setMessage({ type: 'error', text: err.message });
    } finally {
      setSaving(false);
    }
  };

  const handleChangePassword = async (e) => {
    e.preventDefault();
    if (changingPassword) return;
    setChangingPassword(true);
    setMessage(null);

    try {
      const res = await fetch('/api/admin/password', {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          ...getAuthHeaders()
        },
        body: JSON.stringify({ currentPassword, newPassword })
      });

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || 'Failed to change password');
      }

      setCurrentPassword('');
      setNewPassword('');
      // Server has cleared the session cookie — log out and redirect to login
      logout();
      navigate('/administrator');
    } catch (err) {
      setMessage({ type: 'error', text: err.message });
    } finally {
      setChangingPassword(false);
    }
  };

  const handleWipe = async () => {
    if (wiping) return;
    setWiping(true);
    setMessage(null);

    try {
      const res = await fetch('/api/admin/wipe', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...getAuthHeaders()
        },
        body: JSON.stringify({ password: wipePassword })
      });

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || 'Wipe failed');
      }

      setWipePassword('');
      setWipeConfirm(false);
      await refreshConfig();
      setMessage({ type: 'success', text: 'All data wiped and defaults restored. Password reset to: admin123' });
    } catch (err) {
      setMessage({ type: 'error', text: err.message });
    } finally {
      setWiping(false);
    }
  };

  return (
    <Layout>
      <div className="admin-page">
        <div className="glass-card admin-form-card">
          <div className="admin-header">
            <button className="btn btn-outline btn-small" onClick={() => navigate('/administrator/dashboard')}>
              &larr; Back
            </button>
            <h2>Website Master</h2>
          </div>

          {message && (
            <div className={`message-box message-${message.type}`}>{message.text}</div>
          )}

          {/* Password Change */}
          <div className="config-section">
            <h3>Change Admin Password</h3>
            <form onSubmit={handleChangePassword}>
              <div className="form-group">
                <label className="form-label">Current Password</label>
                <input
                  type="password"
                  className="form-input"
                  value={currentPassword}
                  onChange={(e) => setCurrentPassword(e.target.value)}
                  required
                />
              </div>
              <div className="form-group">
                <label className="form-label">New Password</label>
                <input
                  type="password"
                  className="form-input"
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                  required
                  minLength={4}
                />
              </div>
              <button type="submit" className="btn btn-primary" disabled={changingPassword}>
                {changingPassword ? 'Changing...' : 'Change Password'}
              </button>
            </form>
          </div>

          {/* Appearance */}
          <div className="config-section">
            <h3>Background & Appearance</h3>
            <form onSubmit={handleSaveAppearance}>
              <div className="form-group">
                <label className="form-label">Gradient Color 1</label>
                <div className="color-input-row">
                  <input type="color" value={bgColor1} onChange={(e) => setBgColor1(e.target.value)} />
                  <input type="text" className="form-input" value={bgColor1} onChange={(e) => setBgColor1(e.target.value)} />
                </div>
              </div>

              <div className="form-group">
                <label className="form-label">Gradient Color 2</label>
                <div className="color-input-row">
                  <input type="color" value={bgColor2} onChange={(e) => setBgColor2(e.target.value)} />
                  <input type="text" className="form-input" value={bgColor2} onChange={(e) => setBgColor2(e.target.value)} />
                </div>
              </div>

              <div className="form-group">
                <label className="form-label">Gradient Color 3</label>
                <div className="color-input-row">
                  <input type="color" value={bgColor3} onChange={(e) => setBgColor3(e.target.value)} />
                  <input type="text" className="form-input" value={bgColor3} onChange={(e) => setBgColor3(e.target.value)} />
                </div>
              </div>

              <div className="form-group">
                <label className="form-label">Animation Speed: {animSpeed}s</label>
                <input
                  type="range"
                  className="form-range"
                  min="2"
                  max="30"
                  value={animSpeed}
                  onChange={(e) => setAnimSpeed(parseInt(e.target.value) || 8)}
                />
              </div>

              <div className="form-group">
                <label className="form-label checkbox-label">
                  <input
                    type="checkbox"
                    checked={copyrightVisible}
                    onChange={(e) => setCopyrightVisible(e.target.checked)}
                  />
                  Show Copyright
                </label>
              </div>

              <div className="gradient-preview" style={{
                background: `linear-gradient(-45deg, ${bgColor1}, ${bgColor2}, ${bgColor3}, ${bgColor1})`,
                backgroundSize: '400% 400%',
                animation: `gradientShift ${animSpeed}s ease infinite`,
                height: '100px',
                borderRadius: '12px',
                marginBottom: '1.5rem'
              }} />

              <button type="submit" className="btn btn-primary" disabled={saving}>
                {saving ? 'Saving...' : 'Save Appearance'}
              </button>
            </form>
          </div>

          {/* Wipe Data */}
          <div className="config-section">
            <h3>Wipe All Data</h3>
            <p className="form-hint" style={{ marginBottom: '1rem' }}>
              This will permanently delete ALL data including registrations, validation tables,
              lucky draw results, and site configuration. Admin password will reset to default.
            </p>
            {!wipeConfirm ? (
              <button className="btn btn-danger" onClick={() => setWipeConfirm(true)}>
                Wipe All Data
              </button>
            ) : (
              <div>
                <div className="form-group">
                  <label className="form-label">Enter Admin Password to Confirm</label>
                  <input
                    type="password"
                    className="form-input"
                    value={wipePassword}
                    onChange={(e) => setWipePassword(e.target.value)}
                    placeholder="Enter admin password"
                  />
                </div>
                <div style={{ display: 'flex', gap: '0.75rem' }}>
                  <button className="btn btn-danger" onClick={handleWipe} disabled={wiping || !wipePassword}>
                    {wiping ? 'Wiping...' : 'Confirm Wipe'}
                  </button>
                  <button className="btn btn-outline" onClick={() => { setWipeConfirm(false); setWipePassword(''); }}>
                    Cancel
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </Layout>
  );
}
