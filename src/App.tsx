import { useState } from 'react';
import { BrowserRouter, Routes, Route, Navigate, useNavigate, useLocation } from 'react-router-dom';
import { Layout, Menu, Button } from 'antd';
import { KeyOutlined, MonitorOutlined, LogoutOutlined, DashboardOutlined } from '@ant-design/icons';
import Login from './components/Login';
import Register from './components/Register';
import SecretManagement from './components/SecretManagement';
import WorkerStatus from './components/WorkerStatus';
import CustomerDashboard from './components/CustomerDashboard';
import EnvironmentBanner from './components/EnvironmentBanner';
import { getRole, type Role } from './utils/api';
import './App.css';

const { Header, Content } = Layout;

type AuthMode = 'login' | 'register';

// 受保护的路由组件
function ProtectedRoute({ children }: { children: React.ReactNode }) {
  const token = localStorage.getItem('token');
  if (!token) {
    return <Navigate to="/login" replace />;
  }
  return <>{children}</>;
}

// 仅管理员可访问的路由（鉴权以后端 JWT 为准，此处仅做前端重定向）
function AdminRoute({ children }: { children: React.ReactNode }) {
  const token = localStorage.getItem('token');
  const role = getRole();
  if (!token) {
    return <Navigate to="/login" replace />;
  }
  if (role !== 'admin') {
    return <Navigate to="/secrets" replace />;
  }
  return <>{children}</>;
}

// 仅客户或管理员可访问的客户看板路由
function CustomerDashboardRoute({ children }: { children: React.ReactNode }) {
  const token = localStorage.getItem('token');
  const role = getRole();
  if (!token) {
    return <Navigate to="/login" replace />;
  }
  if (role !== 'customer' && role !== 'admin') {
    return <Navigate to="/secrets" replace />;
  }
  return <>{children}</>;
}

// 导航栏组件（按 role 显隐：data_entry 仅密钥管理，customer 密钥管理+客户看板，admin 全部）
function Navigation() {
  const navigate = useNavigate();
  const location = useLocation();
  const role = getRole();

  const handleLogout = () => {
    localStorage.removeItem('token');
    localStorage.removeItem('username');
    localStorage.removeItem('is_admin');
    localStorage.removeItem('role');
    navigate('/login');
  };

  const allMenuItems: { key: string; icon: React.ReactNode; label: string; roles: Role[] }[] = [
    { key: '/secrets', icon: <KeyOutlined />, label: '密钥管理', roles: ['data_entry', 'customer', 'admin'] },
    { key: '/dashboard', icon: <DashboardOutlined />, label: '客户看板', roles: ['customer', 'admin'] },
    { key: '/workers', icon: <MonitorOutlined />, label: '工作机状态', roles: ['admin'] },
  ];
  const menuItems = allMenuItems
    .filter((item) => item.roles.includes(role))
    .map(({ key, icon, label }) => ({ key, icon, label }));

  const handleMenuClick = ({ key }: { key: string }) => {
    navigate(key);
  };

  return (
    <Header style={{
      display: 'flex',
      justifyContent: 'space-between',
      alignItems: 'center',
      background: '#fff',
      padding: '0 24px',
      boxShadow: '0 2px 8px rgba(0,0,0,0.1)',
    }}>
      <Menu
        mode="horizontal"
        selectedKeys={[location.pathname]}
        items={menuItems}
        onClick={handleMenuClick}
        style={{ flex: 1, borderBottom: 'none' }}
      />
      <Button
        type="primary"
        danger
        icon={<LogoutOutlined />}
        onClick={handleLogout}
      >
        退出登录
      </Button>
    </Header>
  );
}

// 主布局组件
function MainLayout({ children }: { children: React.ReactNode }) {
  return (
    <Layout style={{ minHeight: '100vh' }}>
      <EnvironmentBanner />
      <Navigation />
      <Content style={{ padding: '24px', background: '#f0f2f5' }}>
        {children}
      </Content>
    </Layout>
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
    <Layout style={{ minHeight: '100vh', background: '#f0f2f5' }}>
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
    </Layout>
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
            <AdminRoute>
              <MainLayout>
                <WorkerStatus />
              </MainLayout>
            </AdminRoute>
          }
        />
        <Route
          path="/dashboard"
          element={
            <CustomerDashboardRoute>
              <MainLayout>
                <CustomerDashboard />
              </MainLayout>
            </CustomerDashboardRoute>
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
