import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../../contexts/AuthContext';
import Layout from '../../components/Layout';

export default function Login() {
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const { login, isAuthenticated } = useAuth();
  const navigate = useNavigate();

  if (isAuthenticated) {
    navigate('/administrator/dashboard', { replace: true });
  }

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (submitting) return;

    setSubmitting(true);
    setError('');

    try {
      await login(password);
      navigate('/administrator/dashboard');
    } catch (err) {
      setError(err.message || 'Invalid password');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Layout>
      <div className="login-page">
        <div className="glass-card login-card">
          <h2>Admin Login</h2>
          <form onSubmit={handleSubmit}>
            <div className="form-group">
              <input
                type="password"
                className="form-input"
                placeholder="Enter admin password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                autoFocus
              />
            </div>
            <button type="submit" className="btn btn-primary btn-large" disabled={submitting}>
              {submitting ? 'Logging in...' : 'Login'}
            </button>
          </form>
          {error && (
            <div className="message-box message-error">{error}</div>
          )}
        </div>
      </div>
    </Layout>
  );
}
