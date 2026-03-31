import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  // sessionStorage holds a UI-only flag — the actual authentication is the HttpOnly
  // cookie set by the server. The flag is cleared on tab close or explicit logout.
  const [isAuthenticated, setIsAuthenticated] = useState(false);

  // isVerifying is true on every mount while we confirm the session server-side.
  // ProtectedRoute renders nothing during this window to prevent the admin UI
  // from flashing before the server confirms the HttpOnly cookie is valid.
  const [isVerifying, setIsVerifying] = useState(true);

  useEffect(() => {
    // Always confirm the HttpOnly cookie is present and valid server-side,
    // regardless of the sessionStorage flag. This prevents an attacker who
    // manipulates sessionStorage from bypassing the server check.
    fetch('/api/admin/verify')
      .then(res => {
        if (res.ok) {
          sessionStorage.setItem('admin_logged_in', 'true');
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
