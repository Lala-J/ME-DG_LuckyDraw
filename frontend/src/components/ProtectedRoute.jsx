import React from 'react';
import { Navigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';

export default function ProtectedRoute({ children }) {
  const { isAuthenticated, isVerifying } = useAuth();

  // Wait for server-side session verification before rendering anything.
  // Returning null prevents the admin UI from flashing for an attacker who
  // has spoofed the sessionStorage flag but holds no valid HttpOnly cookie.
  if (isVerifying) {
    return null;
  }

  if (!isAuthenticated) {
    return <Navigate to="/administrator" replace />;
  }

  return children;
}
