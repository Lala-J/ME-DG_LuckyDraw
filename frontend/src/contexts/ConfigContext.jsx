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
