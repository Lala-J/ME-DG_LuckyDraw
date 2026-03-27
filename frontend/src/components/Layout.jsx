import React, { useMemo } from 'react';
import { Link } from 'react-router-dom';
import { useConfig } from '../contexts/ConfigContext';
import AnimatedBackground from './AnimatedBackground';

function hexToRgb(hex) {
  const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
  return result
    ? { r: parseInt(result[1], 16), g: parseInt(result[2], 16), b: parseInt(result[3], 16) }
    : { r: 128, g: 128, b: 128 };
}

function getLuminance(hex) {
  const { r, g, b } = hexToRgb(hex);
  return (0.299 * r + 0.587 * g + 0.114 * b) / 255;
}

export default function Layout({ children }) {
  const { config } = useConfig();

  const color1 = config.bg_color1 || '#667eea';
  const color2 = config.bg_color2 || '#764ba2';
  const color3 = config.bg_color3 || '#f093fb';
  const copyrightVisible = config.copyright_visible !== '0';

  const isDark = useMemo(() => {
    const avg = (getLuminance(color1) + getLuminance(color2) + getLuminance(color3)) / 3;
    return avg < 0.5;
  }, [color1, color2, color3]);

  const themeClass = isDark ? 'theme-dark-bg' : 'theme-light-bg';

  return (
    <div className={`layout ${themeClass}`}>
      <AnimatedBackground />
      <div className="layout-content">
        <main className="layout-main">
          {children}
        </main>
        {copyrightVisible && (
          <footer className="layout-footer">
            <Link to="/about" className="footer-link">
              &copy; Metaelyon LLC &nbsp;|&nbsp; 2026 &ndash; For Eternity
            </Link>
          </footer>
        )}
      </div>
    </div>
  );
}
