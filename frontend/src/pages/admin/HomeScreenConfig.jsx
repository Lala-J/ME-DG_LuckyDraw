import { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../../contexts/AuthContext';
import { useConfig } from '../../contexts/ConfigContext';
import Layout from '../../components/Layout';

export default function HomeScreenConfig() {
  const { getAuthHeaders } = useAuth();
  const { config, refreshConfig } = useConfig();
  const navigate = useNavigate();

  const [headingText, setHeadingText] = useState('');
  const [subtitleText, setSubtitleText] = useState('');
  const [organisation, setOrganisation] = useState('');
  const [logoFile, setLogoFile] = useState(null);
  const [logoPreview, setLogoPreview] = useState(null);
  const [logoSize, setLogoSize] = useState(120);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState(null);
  const logoInputRef = useRef(null);

  useEffect(() => {
    setHeadingText(config.heading_text || '');
    setSubtitleText(config.subtitle_text || '');
    setOrganisation(config.organisation || '');
    setLogoSize(parseInt(config.logo_size) || 120);
    if (config.logo_filename) {
      setLogoPreview('/api/config/logo');
    }
  }, [config]);

  const handleLogoChange = (e) => {
    const file = e.target.files[0];
    if (file) {
      setLogoFile(file);
      setLogoPreview(URL.createObjectURL(file));
    }
  };

  const handleSave = async (e) => {
    e.preventDefault();
    setSaving(true);
    setMessage(null);

    try {
      const configRes = await fetch('/api/config', {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          ...getAuthHeaders()
        },
        body: JSON.stringify({
          heading_text: headingText,
          subtitle_text: subtitleText,
          logo_size: String(logoSize),
          organisation: organisation
        })
      });

      if (!configRes.ok) {
        const data = await configRes.json();
        throw new Error(data.error || 'Failed to save config');
      }

      if (logoFile) {
        const formData = new FormData();
        formData.append('logo', logoFile);
        const logoRes = await fetch('/api/config/logo', {
          method: 'POST',
          headers: getAuthHeaders(),
          body: formData
        });
        if (!logoRes.ok) {
          throw new Error('Failed to upload logo');
        }
      }

      await refreshConfig();
      setMessage({ type: 'success', text: 'Saved successfully!' });
    } catch (err) {
      setMessage({ type: 'error', text: err.message });
    } finally {
      setSaving(false);
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
            <h2>Home Screen Master</h2>
          </div>

          <form onSubmit={handleSave}>
            <div className="form-group">
              <label className="form-label">Heading Text</label>
              <textarea
                className="form-input"
                rows={3}
                value={headingText}
                onChange={(e) => setHeadingText(e.target.value)}
                placeholder="Enter heading text (press Enter for a new line)"
                style={{ resize: 'vertical', fontFamily: 'inherit' }}
              />
            </div>

            <div className="form-group">
              <label className="form-label">Logo</label>
              {logoPreview && (
                <div className="logo-preview">
                  <img src={logoPreview} alt="Logo preview" style={{ maxWidth: `${logoSize}px`, maxHeight: `${logoSize}px` }} />
                </div>
              )}
              <input
                ref={logoInputRef}
                type="file"
                accept="image/*"
                onChange={handleLogoChange}
                style={{ display: 'none' }}
              />
              <button
                type="button"
                className="form-input form-file btn"
                style={{ textAlign: 'left', cursor: 'pointer' }}
                onClick={() => logoInputRef.current?.click()}
              >
                {logoFile ? logoFile.name : 'Choose File…'}
              </button>
            </div>

            <div className="form-group">
              <label className="form-label">Logo Display Size: {logoSize}px</label>
              <input
                type="range"
                className="form-range"
                min="40"
                max="320"
                step="10"
                value={logoSize}
                onChange={(e) => setLogoSize(parseInt(e.target.value))}
              />
            </div>

            <div className="form-group">
              <label className="form-label">Organisation</label>
              <input
                type="text"
                className="form-input"
                value={organisation}
                onChange={(e) => setOrganisation(e.target.value)}
                placeholder="e.g. Metaelyon (used in registration page subtitle)"
              />
              <p className="form-hint">
                Shown in the Manual Registration modal as: &ldquo;Ensure your Phone Number is the same phone number provided to <strong>{organisation || 'UNDEFINED'}</strong>.&rdquo;
              </p>
            </div>

            <div className="form-group">
              <label className="form-label">Subtitle Text</label>
              <input
                type="text"
                className="form-input"
                value={subtitleText}
                onChange={(e) => setSubtitleText(e.target.value)}
                placeholder="Enter subtitle text"
              />
            </div>

            <button type="submit" className="btn btn-primary" disabled={saving}>
              {saving ? 'Saving...' : 'Save'}
            </button>
          </form>

          {message && (
            <div className={`message-box message-${message.type}`}>{message.text}</div>
          )}
        </div>
      </div>
    </Layout>
  );
}
