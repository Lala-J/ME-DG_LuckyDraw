import { useNavigate } from 'react-router-dom';
import { useAuth } from '../../contexts/AuthContext';
import Layout from '../../components/Layout';

const navItems = [
  { label: 'Home Screen Master', path: '/administrator/homescreenconfig', icon: '\u2302' },
  { label: 'Registration Master', path: '/administrator/registrationconfig', icon: '\u2611' },
  { label: 'Lucky Draw', path: '/administrator/luckydrawconfig', icon: '\u2605' },
  { label: 'Site Master', path: '/administrator/mainconfig', icon: '\u2699' }
];

export default function Dashboard() {
  const { logout } = useAuth();
  const navigate = useNavigate();

  const handleLogout = () => {
    logout();
    navigate('/administrator');
  };

  return (
    <Layout>
      <div className="dashboard-page">
        <div className="glass-card dashboard-card">
          <div className="dashboard-header">
            <h2>Admin Dashboard</h2>
            <button className="btn btn-outline btn-small" onClick={handleLogout}>
              Logout
            </button>
          </div>
          <div className="dashboard-grid">
            {navItems.map((item) => (
              <button
                key={item.path}
                className="dashboard-nav-card glass-card"
                onClick={() => navigate(item.path)}
              >
                <span className="dashboard-nav-icon">{item.icon}</span>
                <span className="dashboard-nav-label">{item.label}</span>
              </button>
            ))}
          </div>
        </div>
      </div>
    </Layout>
  );
}
