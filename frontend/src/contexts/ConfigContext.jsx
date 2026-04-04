import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';

const ConfigContext = createContext(null);

export function ConfigProvider({ children }) {
  const [config, setConfig] = useState({
    heading_text: 'Lucky Draw',
    subtitle_text: '',
    bg_color1: '#000000',
    bg_color2: '#350160',
    bg_color3: '#4d0f41',
    bg_animation_speed: 8,
    show_copyright: true
  });
  const [loading, setLoading] = useState(true);

  const fetchConfig = useCallback(async () => {
    try {
      const res = await fetch('/api/config');
      if (res.ok) {
        const data = await res.json();
        setConfig(prev => ({ ...prev, ...data }));
      }
    } catch (err) {
      console.error('Failed to fetch config:', err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchConfig();
  }, [fetchConfig]);

  // Inject custom font @font-face + CSS variable overrides whenever the font
  // experiment config changes. A single <style id="exp-font-override"> in
  // <head> is created on first use and updated in-place on subsequent changes.
  useEffect(() => {
    const styleId = 'exp-font-override';

    if (config.exp_font_enabled !== '1') {
      const el = document.getElementById(styleId);
      if (el) el.remove();
      return;
    }

    const headerFontId = config.exp_font_header_id;
    const bodyFontId   = config.exp_font_body_id;

    if ((!headerFontId || headerFontId === 'default') &&
        (!bodyFontId   || bodyFontId   === 'default')) {
      const el = document.getElementById(styleId);
      if (el) el.remove();
      return;
    }

    fetch('/api/fonts')
      .then(r => r.ok ? r.json() : [])
      .then(fonts => {
        const headerFont = headerFontId && headerFontId !== 'default'
          ? fonts.find(f => String(f.id) === String(headerFontId))
          : null;
        const bodyFont = bodyFontId && bodyFontId !== 'default'
          ? fonts.find(f => String(f.id) === String(bodyFontId))
          : null;

        let css = '';

        if (headerFont) {
          css += `@font-face { font-family: '${headerFont.css_family}'; src: url('/api/fonts/file/${headerFont.filename}') format('${headerFont.format}'); font-weight: 100 900; }\n`;
          css += `:root { --font-header: '${headerFont.css_family}', 'Orbitron', sans-serif; }\n`;
        }
        if (bodyFont) {
          css += `@font-face { font-family: '${bodyFont.css_family}'; src: url('/api/fonts/file/${bodyFont.filename}') format('${bodyFont.format}'); font-weight: 100 900; }\n`;
          css += `:root { --font-body: '${bodyFont.css_family}', 'Rajdhani', sans-serif; }\n`;
        }

        let styleEl = document.getElementById(styleId);
        if (!styleEl) {
          styleEl = document.createElement('style');
          styleEl.id = styleId;
          document.head.appendChild(styleEl);
        }
        styleEl.textContent = css;
      })
      .catch(() => {});
  }, [config.exp_font_enabled, config.exp_font_header_id, config.exp_font_body_id]);

  const refreshConfig = useCallback(() => {
    return fetchConfig();
  }, [fetchConfig]);

  return (
    <ConfigContext.Provider value={{ config, loading, refreshConfig }}>
      {children}
    </ConfigContext.Provider>
  );
}

export function useConfig() {
  const ctx = useContext(ConfigContext);
  if (!ctx) throw new Error('useConfig must be used within ConfigProvider');
  return ctx;
}

export default ConfigContext;
