import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  // sessionStorage holds a UI-only flag — the actual authentication is the HttpOnly
  // cookie set by the server. The flag is cleared on tab close or explicit logout.
  const [isAuthenticated, setIsAuthenticated] = useState(false);

  // isVerifying is true only when the stored flag claims the user is logged in.
  // While true, ProtectedRoute renders nothing to prevent the admin UI from
  // showing before the server confirms the session is valid.
  const [isVerifying, setIsVerifying] = useState(
    () => sessionStorage.getItem('admin_logged_in') === 'true'
  );

  useEffect(() => {
    // If the stored flag is not set there is nothing to verify.
    if (sessionStorage.getItem('admin_logged_in') !== 'true') return;

    // Confirm the HttpOnly cookie is present and valid server-side.
    fetch('/api/admin/verify')
      .then(res => {
        if (res.ok) {
          setIsAuthenticated(true);
        } else {
          sessionStorage.removeItem('admin_logged_in');
          setIsAuthenticated(false);
        }
      })
      .catch(() => {
        sessionStorage.removeItem('admin_logged_in');
        setIsAuthenticated(false);
      })
      .finally(() => setIsVerifying(false));
  }, []);

  // Cookies are sent automatically by the browser for same-origin requests.
  // No Authorization header is needed or used.
  const getAuthHeaders = useCallback(() => ({}), []);

  const login = useCallback(async (password) => {
    const res = await fetch('/api/admin/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ password })
    });
    const data = await res.json();
    if (!res.ok) {
      throw new Error(data.error || data.message || 'Login failed');
    }
    localStorage.removeItem('admin_token'); // Remove legacy key left over from older versions
    sessionStorage.setItem('admin_logged_in', 'true');
    setIsAuthenticated(true);
    return data;
  }, []);

  const logout = useCallback(() => {
    sessionStorage.removeItem('admin_logged_in');
    setIsAuthenticated(false);
    // Ask the server to clear the HttpOnly cookie. Fire-and-forget — the cookie
    // will expire naturally if this request fails.
    fetch('/api/admin/logout', { method: 'POST' }).catch(() => {});
  }, []);

  return (
    <AuthContext.Provider value={{ isAuthenticated, isVerifying, login, logout, getAuthHeaders }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
}

export default AuthContext;
