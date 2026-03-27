import React, { useMemo } from 'react';
import { useConfig } from '../contexts/ConfigContext';

export default function AnimatedBackground() {
  const { config } = useConfig();

  const color1 = config.bg_color1 || '#667eea';
  const color2 = config.bg_color2 || '#764ba2';
  const color3 = config.bg_color3 || '#f093fb';
  const speed = config.bg_animation_speed || 8;

  const style = useMemo(() => ({
    position: 'fixed',
    top: 0,
    left: 0,
    width: '100vw',
    height: '100vh',
    zIndex: -1,
    background: `linear-gradient(-45deg, ${color1}, ${color2}, ${color3}, ${color1})`,
    backgroundSize: '400% 400%',
    animation: `gradientShift ${speed}s ease infinite`
  }), [color1, color2, color3, speed]);

  return <div className="animated-background" style={style} />;
}
