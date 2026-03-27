import { useConfig } from '../contexts/ConfigContext';

const LICENSE_TEXT = `MIT License

Copyright (c) 2026 Lala J. on behalf of Metaelyon LLC

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.`;

export default function About() {
  const { config } = useConfig();
  const speed = config.bg_animation_speed || 8;

  return (
    <div className="about-page">
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Orbitron:wght@400;500;600;700;800;900&family=Rajdhani:wght@300;400;500;600;700&display=swap');

        @keyframes aboutGradientShift {
          0%   { background-position: 0% 50%; }
          50%  { background-position: 100% 50%; }
          100% { background-position: 0% 50%; }
        }

        .about-page {
          min-height: 100vh;
          width: 100%;
          display: flex;
          align-items: center;
          justify-content: center;
          padding: 3rem 1rem;
          font-family: 'Rajdhani', sans-serif;
          background: linear-gradient(-45deg, #000000, #350160, #4d0f41, #000000);
          background-size: 400% 400%;
          animation: aboutGradientShift ${speed}s ease infinite;
          box-sizing: border-box;
        }

        .about-card {
          background: rgba(255, 255, 255, 0.07);
          backdrop-filter: blur(28px);
          -webkit-backdrop-filter: blur(28px);
          border: 1px solid rgba(255, 255, 255, 0.12);
          border-radius: 20px;
          padding: 3rem 3.5rem;
          max-width: 680px;
          width: 100%;
          text-align: center;
          color: #ffffff;
        }

        .about-logo {
          margin-bottom: 2rem;
        }

        .about-logo img {
          max-width: 160px;
          max-height: 160px;
          object-fit: contain;
          filter:
            drop-shadow(0 4px 10px rgba(0, 0, 0, 0.85))
            drop-shadow(0 0 20px rgba(108, 59, 170, 0.5));
        }

        .about-heading {
          font-family: 'Orbitron', sans-serif;
          font-size: 1.5rem;
          font-weight: 700;
          letter-spacing: 0.1em;
          color: #ffffff;
          text-shadow:
            0 2px 12px rgba(100, 0, 180, 0.8),
            0 0 30px rgba(180, 80, 255, 0.4);
          margin-bottom: 0.5rem;
        }

        .about-subheading {
          font-family: 'Rajdhani', sans-serif;
          font-size: 0.95rem;
          font-weight: 500;
          letter-spacing: 0.12em;
          color: rgba(255, 255, 255, 0.55);
          text-transform: uppercase;
          margin-bottom: 2rem;
        }

        .about-divider {
          border: none;
          border-top: 1px solid rgba(255, 255, 255, 0.12);
          margin: 0 0 1.75rem 0;
        }

        .about-license {
          font-family: 'Rajdhani', sans-serif;
          font-size: 0.92rem;
          line-height: 1.75;
          color: rgba(255, 255, 255, 0.65);
          white-space: pre-wrap;
          text-align: left;
        }
      `}</style>

      <div className="about-card">
        <div className="about-logo">
          <img src="/about-logo.png" alt="Metaelyon LLC" />
        </div>

        <h1 className="about-heading">METAELYON LLC &nbsp;|&nbsp; C09072026</h1>
        <p className="about-subheading">Republic of Maldives</p>

        <hr className="about-divider" />

        <p className="about-license">{LICENSE_TEXT}</p>
      </div>
    </div>
  );
}