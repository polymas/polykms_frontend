import { useState, useEffect } from 'react';
import Login from './components/Login';
import Register from './components/Register';
import SecretManagement from './components/SecretManagement';
import './App.css';

type AuthMode = 'login' | 'register';

function App() {
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [authMode, setAuthMode] = useState<AuthMode>('login');

  useEffect(() => {
    // 检查是否有token
    const token = localStorage.getItem('token');
    if (token) {
      setIsAuthenticated(true);
    }
  }, []);

  const handleLoginSuccess = () => {
    setIsAuthenticated(true);
  };

  const handleRegisterSuccess = () => {
    setIsAuthenticated(true);
  };

  if (isAuthenticated) {
    return <SecretManagement />;
  }

  return (
    <div className="app">
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

export default App;

