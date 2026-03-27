import React from 'react';
import { Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider } from './contexts/AuthContext';
import { ConfigProvider } from './contexts/ConfigContext';
import ProtectedRoute from './components/ProtectedRoute';

import Home from './pages/Home';
import Registration from './pages/Registration';
import LuckyDrawStage from './pages/LuckyDrawStage';
import Login from './pages/admin/Login';
import Dashboard from './pages/admin/Dashboard';
import HomeScreenConfig from './pages/admin/HomeScreenConfig';
import RegistrationConfig from './pages/admin/RegistrationConfig';
import LuckyDrawConfig from './pages/admin/LuckyDrawConfig';
import MainConfig from './pages/admin/MainConfig';

export default function App() {
  return (
    <AuthProvider>
      <ConfigProvider>
        <Routes>
          <Route path="/" element={<Navigate to="/home" replace />} />
          <Route path="/home" element={<Home />} />
          <Route path="/registration" element={<Registration />} />
          <Route path="/administrator" element={<Login />} />
          <Route path="/administrator/dashboard" element={
            <ProtectedRoute><Dashboard /></ProtectedRoute>
          } />
          <Route path="/administrator/homescreenconfig" element={
            <ProtectedRoute><HomeScreenConfig /></ProtectedRoute>
          } />
          <Route path="/administrator/registrationconfig" element={
            <ProtectedRoute><RegistrationConfig /></ProtectedRoute>
          } />
          <Route path="/administrator/luckydrawconfig" element={
            <ProtectedRoute><LuckyDrawConfig /></ProtectedRoute>
          } />
          <Route path="/administrator/mainconfig" element={
            <ProtectedRoute><MainConfig /></ProtectedRoute>
          } />
          <Route path="/luckydraw-stage" element={<LuckyDrawStage />} />
        </Routes>
      </ConfigProvider>
    </AuthProvider>
  );
}
