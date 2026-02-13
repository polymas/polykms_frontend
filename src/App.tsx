import { useState } from 'react';
import { BrowserRouter, Routes, Route, Navigate, useNavigate, useLocation } from 'react-router-dom';
import { Layout, Menu, Button } from 'antd';
import { KeyOutlined, MonitorOutlined, LogoutOutlined, BarChartOutlined } from '@ant-design/icons';
import Login from './components/Login';
import Register from './components/Register';
import SecretManagement from './components/SecretManagement';
import WorkerStatus from './components/WorkerStatus';
import PolymarketAnalytics from './components/PolymarketAnalytics';
import EnvironmentBanner from './components/EnvironmentBanner';
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

// 仅管理员可访问的路由（非管理员重定向到密钥页）
function AdminRoute({ children }: { children: React.ReactNode }) {
  const token = localStorage.getItem('token');
  const isAdmin = localStorage.getItem('is_admin') === 'true';
  if (!token) {
    return <Navigate to="/login" replace />;
  }
  if (!isAdmin) {
    return <Navigate to="/secrets" replace />;
  }
  return <>{children}</>;
}

// 从 localStorage 读取是否管理员（与登录响应一致）
function getIsAdmin(): boolean {
  return localStorage.getItem('is_admin') === 'true';
}

// 导航栏组件
function Navigation() {
  const navigate = useNavigate();
  const location = useLocation();
  const isAdmin = getIsAdmin();

  const handleLogout = () => {
    localStorage.removeItem('token');
    localStorage.removeItem('username');
    localStorage.removeItem('is_admin');
    navigate('/login');
  };

  // 普通账号：仅「密钥管理」（上传秘钥）；管理员：密钥管理 + 工作机状态 + 数据分析
  const allMenuItems = [
    { key: '/secrets', icon: <KeyOutlined />, label: '密钥管理', adminOnly: false },
    { key: '/workers', icon: <MonitorOutlined />, label: '工作机状态', adminOnly: true },
    { key: '/analytics', icon: <BarChartOutlined />, label: 'Polymarket 数据分析', adminOnly: false },
  ];
  const menuItems = allMenuItems.filter((item) => !item.adminOnly || isAdmin).map(({ key, icon, label }) => ({ key, icon, label }));

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
          path="/analytics"
          element={
            <ProtectedRoute>
              <MainLayout>
                <PolymarketAnalytics />
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
