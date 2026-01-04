import { useState } from 'react';
import { BrowserRouter, Routes, Route, Navigate, useNavigate, useLocation, Link } from 'react-router-dom';
import Login from './components/Login';
import Register from './components/Register';
import SecretManagement from './components/SecretManagement';
import WorkerStatus from './components/WorkerStatus';
import EnvironmentBanner from './components/EnvironmentBanner';
import './App.css';

type AuthMode = 'login' | 'register';

// 受保护的路由组件
function ProtectedRoute({ children }: { children: React.ReactNode }) {
  const token = localStorage.getItem('token');
  if (!token) {
    return <Navigate to="/login" replace />;
  }
  return <>{children}</>;
}

// 导航栏组件
function Navigation() {
  const navigate = useNavigate();
  const location = useLocation();

  const handleLogout = () => {
    localStorage.removeItem('token');
    navigate('/login');
  };

  return (
    <div className="app-navigation">
      <div className="nav-tabs">
        <Link
          to="/secrets"
          className={location.pathname === '/secrets' ? 'active' : ''}
        >
          密钥管理
        </Link>
        <Link
          to="/workers"
          className={location.pathname === '/workers' ? 'active' : ''}
        >
          工作机状态
        </Link>
      </div>
      <button className="logout-button" onClick={handleLogout}>
        退出登录
      </button>
    </div>
  );
}

// 主布局组件
function MainLayout({ children }: { children: React.ReactNode }) {
  return (
    <>
      <EnvironmentBanner />
      <Navigation />
      {children}
    </>
  );
}

// 登录/注册页面组件
function AuthPage() {
  const [authMode, setAuthMode] = useState<AuthMode>('login');
  const navigate = useNavigate();

  const handleLoginSuccess = () => {
    navigate('/secrets');
  };

  const handleRegisterSuccess = () => {
    navigate('/secrets');
  };

  return (
    <div className="app">
      <EnvironmentBanner />
      {authMode === 'login' ? (
        <Login
          onLoginSuccess={handleLoginSuccess}
          onSwitchToRegister={() => setAuthMode('register')}
        />
      ) : (
        <Register
          onRegisterSuccess={handleRegisterSuccess}
          onSwitchToLogin={() => setAuthMode('login')}
        />
      )}
    </div>
  );
}

function App() {
  return (
    <BrowserRouter>
      <Routes>
        {/* 登录/注册路由 */}
        <Route path="/login" element={<AuthPage />} />
        <Route path="/register" element={<AuthPage />} />
        
        {/* 受保护的路由 */}
        <Route
          path="/secrets"
          element={
            <ProtectedRoute>
              <MainLayout>
                <SecretManagement />
              </MainLayout>
            </ProtectedRoute>
          }
        />
        <Route
          path="/workers"
          element={
            <ProtectedRoute>
              <MainLayout>
                <WorkerStatus />
              </MainLayout>
            </ProtectedRoute>
          }
        />
        
        {/* 默认重定向 */}
        <Route path="/" element={<Navigate to="/secrets" replace />} />
        <Route path="*" element={<Navigate to="/secrets" replace />} />
      </Routes>
    </BrowserRouter>
  );
}

export default App;

