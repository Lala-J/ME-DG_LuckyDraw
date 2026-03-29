import { useNavigate } from 'react-router-dom';
import Layout from '../../components/Layout';

export default function Experimentals() {
  const navigate = useNavigate();

  return (
    <Layout>
      <div className="admin-page">
        <div className="glass-card admin-form-card">
          <div className="admin-header">
            <button className="btn btn-outline btn-small" onClick={() => navigate('/administrator/dashboard')}>
              &larr; Back
            </button>
            <h2>Experimental Features</h2>
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: '4rem 2rem', gap: '1.5rem', textAlign: 'center' }}>
            <span style={{ fontSize: '4rem' }}>🔧</span>
            <p style={{ fontSize: '1rem', opacity: 0.8, maxWidth: '420px', lineHeight: '1.6' }}>
              You can configure certain settings such as transition delays in the Roulette Staging here, but this is under construction so come back later :3
            </p>
          </div>
        </div>
      </div>
    </Layout>
  );
}