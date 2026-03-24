import { useState, useMemo, useCallback, useEffect } from 'react';
import { BrowserRouter, Routes, Route, Navigate, useNavigate, useLocation } from 'react-router-dom';
import { Layout, Menu, Button, Typography, Grid, Tabs } from 'antd';
import {
  KeyOutlined,
  MonitorOutlined,
  LogoutOutlined,
  DashboardOutlined,
  MenuFoldOutlined,
  MenuUnfoldOutlined,
} from '@ant-design/icons';
import Login from './components/Login';
import Register from './components/Register';
import SecretManagement from './components/SecretManagement';
import WorkerStatus from './components/WorkerStatus';
import CustomerDashboard from './components/CustomerDashboard';
import EnvironmentBanner from './components/EnvironmentBanner';
import { getRole, type Role } from './utils/api';
import './App.css';

const { Sider, Header, Content } = Layout;
const { Text } = Typography;

type AuthMode = 'login' | 'register';

function ProtectedRoute({ children }: { children: React.ReactNode }) {
  const token = localStorage.getItem('token');
  if (!token) {
    return <Navigate to="/login" replace />;
  }
  return <>{children}</>;
}

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

/** 侧栏 + 顶栏 + 内容区：玻璃顶栏、可折叠导航 */
function AppShell({ children }: { children: React.ReactNode }) {
  const navigate = useNavigate();
  const location = useLocation();
  const role = getRole();
  const screens = Grid.useBreakpoint();
  const [collapsed, setCollapsed] = useState(false);

  const handleLogout = useCallback(() => {
    localStorage.removeItem('token');
    localStorage.removeItem('username');
    localStorage.removeItem('is_admin');
    localStorage.removeItem('role');
    navigate('/login');
  }, [navigate]);

  const menuItems = useMemo(() => {
    const all: { key: string; icon: React.ReactNode; label: string; roles: Role[] }[] = [
      { key: '/secrets', icon: <KeyOutlined />, label: '密钥管理', roles: ['data_entry', 'customer', 'admin'] },
      { key: '/dashboard', icon: <DashboardOutlined />, label: '客户看板', roles: ['customer', 'admin'] },
      { key: '/workers', icon: <MonitorOutlined />, label: '工作机状态', roles: ['admin'] },
    ];
    return all
      .filter((item) => item.roles.includes(role))
      .map(({ key, icon, label }) => ({ key, icon, label }));
  }, [role]);

  const username = typeof window !== 'undefined' ? localStorage.getItem('username') : null;

  return (
    <Layout className="app-shell" hasSider>
      <Sider
        className="app-sider"
        width={244}
        collapsed={collapsed}
        onCollapse={setCollapsed}
        collapsible
        collapsedWidth={screens.lg === false ? 0 : 72}
        breakpoint="lg"
        trigger={null}
        onBreakpoint={(broken) => {
          if (broken) {
            setCollapsed(true);
          }
        }}
      >
        <div
          className="app-sider-logo"
          onClick={() => navigate('/secrets')}
          role="button"
          tabIndex={0}
          onKeyDown={(e) => {
            if (e.key === 'Enter' || e.key === ' ') {
              e.preventDefault();
              navigate('/secrets');
            }
          }}
        >
          <span className="app-sider-logo-mark" aria-hidden>
            P
          </span>
          {!collapsed && (
            <span className="app-sider-logo-text">
              <span className="app-sider-logo-title">PolyKMS</span>
              <span className="app-sider-logo-sub">密钥与运维</span>
            </span>
          )}
        </div>
        <Menu
          mode="inline"
          selectedKeys={[location.pathname]}
          items={menuItems}
          onClick={({ key }) => navigate(String(key))}
          className="app-sider-menu"
        />
      </Sider>
      <Layout className="app-shell-main">
        <Header className="app-shell-header">
          <Button
            type="text"
            aria-label={collapsed ? '展开菜单' : '收起菜单'}
            icon={collapsed ? <MenuUnfoldOutlined /> : <MenuFoldOutlined />}
            onClick={() => setCollapsed((c) => !c)}
            className="app-shell-trigger"
          />
          <div className="app-shell-header-right">
            {username ? (
              <Text type="secondary" className="app-shell-user">
                {username}
              </Text>
            ) : null}
            <Button type="primary" danger icon={<LogoutOutlined />} onClick={handleLogout}>
              退出登录
            </Button>
          </div>
        </Header>
        <EnvironmentBanner />
        <Content className="app-shell-content">{children}</Content>
      </Layout>
    </Layout>
  );
}

function MainLayout({ children }: { children: React.ReactNode }) {
  return <AppShell>{children}</AppShell>;
}

function AuthPage() {
  const [authMode, setAuthMode] = useState<AuthMode>('login');
  const navigate = useNavigate();
  const location = useLocation();

  // 与路由 /login、/register 同步，便于分享链接与浏览器前进后退
  useEffect(() => {
    setAuthMode(location.pathname === '/register' ? 'register' : 'login');
  }, [location.pathname]);

  const handleLoginSuccess = () => {
    navigate('/secrets');
  };

  const handleRegisterSuccess = () => {
    navigate('/secrets');
  };

  const handleAuthTabChange = (key: string) => {
    const mode = key as AuthMode;
    setAuthMode(mode);
    navigate(mode === 'register' ? '/register' : '/login', { replace: true });
  };

  return (
    <div className="auth-layout">
      <EnvironmentBanner />
      <div className="auth-shell">
        <aside className="auth-shell-brand">
          <div className="auth-shell-brand-inner">
            <h1>PolyKMS</h1>
            <p>密钥管理、客户看板与工作机状态统一控制台。安全、清晰、为运维与业务协作而设计。</p>
          </div>
          <div className="auth-shell-brand-footer">内部使用 · 请妥善保管凭据</div>
        </aside>
        <div className="auth-shell-form">
          <Tabs
            activeKey={authMode}
            onChange={handleAuthTabChange}
            className="auth-page-tabs"
            centered
            size="large"
            destroyInactiveTabPane={false}
            items={[
              {
                key: 'login',
                label: '登录',
                children: (
                  <Login
                    onLoginSuccess={handleLoginSuccess}
                    onSwitchToRegister={() => handleAuthTabChange('register')}
                  />
                ),
              },
              {
                key: 'register',
                label: '注册',
                children: (
                  <Register
                    onRegisterSuccess={handleRegisterSuccess}
                    onSwitchToLogin={() => handleAuthTabChange('login')}
                  />
                ),
              },
            ]}
          />
        </div>
      </div>
    </div>
  );
}

function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/login" element={<AuthPage />} />
        <Route path="/register" element={<AuthPage />} />

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

        <Route path="/" element={<Navigate to="/secrets" replace />} />
        <Route path="*" element={<Navigate to="/secrets" replace />} />
      </Routes>
    </BrowserRouter>
  );
}

export default App;
