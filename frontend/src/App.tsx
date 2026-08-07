import { Navigate, Route, Routes } from 'react-router-dom';
import { AppLayout } from './components/layout/AppLayout';
import { ChatProvider } from './hooks/useChat';
import { AuthProvider } from './hooks/useAuth';
import { AnalyticsPage } from './pages/AnalyticsPage';
import { BillingPage } from './pages/BillingPage';
import { ChatPage } from './pages/ChatPage';
import { LoginPage } from './pages/LoginPage';
import { PlansPage } from './pages/PlansPage';
import { ProfilePage } from './pages/ProfilePage';
import { RoamingPage } from './pages/RoamingPage';
import { SupportPage } from './pages/SupportPage';
import { ProtectedRoute } from './routes/ProtectedRoute';
import { AgentDashboardPage } from './pages/AgentDashboardPage';

function App() {
  return (
    <AuthProvider>
      <ChatProvider>
      <Routes>
        <Route path="/login" element={<LoginPage />} />
        <Route
          element={
            <ProtectedRoute>
              <AppLayout />
            </ProtectedRoute>
          }
        >
          <Route index element={<Navigate to="/chat" replace />} />
          <Route path="/chat" element={<ChatPage />} />
           <Route path="/dashboard" element={<AgentDashboardPage />} />
          <Route path="/profile" element={<ProfilePage />} />
          <Route path="/analytics" element={<AnalyticsPage />} />
          <Route path="/plans" element={<PlansPage />} />
          <Route path="/billing" element={<BillingPage />} />
          <Route path="/roaming" element={<RoamingPage />} />
          <Route path="/support" element={<SupportPage />} />
        </Route>
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
      </ChatProvider>
    </AuthProvider>
  );
}

export default App;
