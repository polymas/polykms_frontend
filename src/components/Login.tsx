import { useState, useCallback } from 'react';
import { authAPI } from '../utils/api';
import { validateUsername, sanitizeInput } from '../utils/validation';
import { getSafeErrorMessage, throttle } from '../utils/security';
import './Login.css';

interface LoginProps {
  onLoginSuccess: () => void;
  onSwitchToRegister: () => void;
}

export default function Login({ onLoginSuccess, onSwitchToRegister }: LoginProps) {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [usernameError, setUsernameError] = useState('');

  // 节流处理登录请求（防止暴力破解）
  const throttledLogin = useCallback(
    throttle(async (username: string, password: string) => {
      setError('');
      setLoading(true);

      try {
        // 输入验证
        const usernameValidation = validateUsername(username);
        if (!usernameValidation.valid) {
          setError(usernameValidation.error || '用户名验证失败');
          setLoading(false);
          return;
        }

        // 清理输入
        const sanitizedUsername = sanitizeInput(username);

        await authAPI.login({ username: sanitizedUsername, password });
        onLoginSuccess();
      } catch (err: any) {
        setError(getSafeErrorMessage(err, '登录失败'));
      } finally {
        setLoading(false);
      }
    }, 2000), // 2秒内只能提交一次
    [onLoginSuccess]
  );

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setUsernameError('');

    // 客户端验证
    const usernameValidation = validateUsername(username);
    if (!usernameValidation.valid) {
      setUsernameError(usernameValidation.error || '');
      return;
    }

    if (!password || password.length === 0) {
      setError('密码不能为空');
      return;
    }

    await throttledLogin(username, password);
  };

  const handleUsernameChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const value = e.target.value;
    setUsername(value);
    setUsernameError('');

    // 实时验证
    if (value.length > 0) {
      const validation = validateUsername(value);
      if (!validation.valid) {
        setUsernameError(validation.error || '');
      }
    }
  };

  return (
    <div className="auth-container">
      <div className="auth-card">
        <h1>登录</h1>
        <form onSubmit={handleSubmit}>
          <div className="form-group">
            <label htmlFor="username">用户名</label>
            <input
              id="username"
              type="text"
              value={username}
              onChange={handleUsernameChange}
              required
              disabled={loading}
              maxLength={50}
              autoComplete="username"
            />
            {usernameError && <div className="field-error">{usernameError}</div>}
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
              maxLength={128}
              autoComplete="current-password"
            />
          </div>
          {error && <div className="error-message">{error}</div>}
          <button type="submit" disabled={loading} className="btn-primary">
            {loading ? '登录中...' : '登录'}
          </button>
        </form>
        <div className="auth-switch">
          还没有账号？{' '}
          <button type="button" onClick={onSwitchToRegister} className="link-button">
            立即注册
          </button>
        </div>
      </div>
    </div>
  );
}

