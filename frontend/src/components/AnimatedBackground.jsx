import React from 'react';
import { useConfig } from '../contexts/ConfigContext';

export default function AnimatedBackground() {
  const { config } = useConfig();

  const color1 = config.bg_color1 || '#667eea';
  const color2 = config.bg_color2 || '#764ba2';
  const color3 = config.bg_color3 || '#f093fb';
  const speed = config.bg_animation_speed || 8;

  return (
    <div
      className="animated-background"
      style={{
        '--bg-color1': color1,
        '--bg-color2': color2,
        '--bg-color3': color3,
        '--bg-speed': `${speed}s`
      }}
    />
  );
}
