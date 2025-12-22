import { useState } from 'react';
import { authAPI } from '../utils/api';
import './Login.css';

interface RegisterProps {
  onRegisterSuccess: () => void;
  onSwitchToLogin: () => void;
}

export default function Register({ onRegisterSuccess, onSwitchToLogin }: RegisterProps) {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [email, setEmail] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);

    try {
      await authAPI.register({ username, password, email: email || undefined });
      // 注册成功后自动登录
      try {
        await authAPI.login({ username, password });
        onRegisterSuccess();
      } catch (loginErr: any) {
        setError('注册成功，但自动登录失败，请手动登录');
      }
    } catch (err: any) {
      setError(err.response?.data?.error || err.message || '注册失败');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="auth-container">
      <div className="auth-card">
        <h1>注册</h1>
        <form onSubmit={handleSubmit}>
          <div className="form-group">
            <label htmlFor="username">用户名</label>
            <input
              id="username"
              type="text"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              required
              disabled={loading}
            />
          </div>
          <div className="form-group">
            <label htmlFor="password">密码</label>
            <input
              id="password"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              disabled={loading}
            />
          </div>
          <div className="form-group">
            <label htmlFor="email">邮箱（可选）</label>
            <input
              id="email"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              disabled={loading}
            />
          </div>
          {error && <div className="error-message">{error}</div>}
          <button type="submit" disabled={loading} className="btn-primary">
            {loading ? '注册中...' : '注册'}
          </button>
        </form>
        <div className="auth-switch">
          已有账号？{' '}
          <button type="button" onClick={onSwitchToLogin} className="link-button">
            立即登录
          </button>
        </div>
      </div>
    </div>
  );
}

