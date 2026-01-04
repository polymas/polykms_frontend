import { useState, useCallback } from 'react';
import { authAPI } from '../utils/api';
import { validateUsername, validatePassword, validateEmail, sanitizeInput } from '../utils/validation';
import { getSafeErrorMessage, throttle } from '../utils/security';
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
  const [usernameError, setUsernameError] = useState('');
  const [passwordError, setPasswordError] = useState('');
  const [passwordStrength, setPasswordStrength] = useState<'weak' | 'medium' | 'strong'>('weak');
  const [emailError, setEmailError] = useState('');

  // 节流处理注册请求
  const throttledRegister = useCallback(
    throttle(async (username: string, password: string, email?: string) => {
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

        const passwordValidation = validatePassword(password);
        if (!passwordValidation.valid) {
          setError(passwordValidation.error || '密码验证失败');
          setLoading(false);
          return;
        }

        if (email) {
          const emailValidation = validateEmail(email);
          if (!emailValidation.valid) {
            setError(emailValidation.error || '邮箱验证失败');
            setLoading(false);
            return;
          }
        }

        // 清理输入
        const sanitizedUsername = sanitizeInput(username);
        const sanitizedEmail = email ? sanitizeInput(email) : undefined;

        await authAPI.register({ username: sanitizedUsername, password, email: sanitizedEmail });
        // 注册成功后自动登录
        try {
          await authAPI.login({ username: sanitizedUsername, password });
          onRegisterSuccess();
        } catch (loginErr: any) {
          setError('注册成功，但自动登录失败，请手动登录');
        }
      } catch (err: any) {
        setError(getSafeErrorMessage(err, '注册失败'));
      } finally {
        setLoading(false);
      }
    }, 2000), // 2秒内只能提交一次
    [onRegisterSuccess]
  );

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setUsernameError('');
    setPasswordError('');
    setEmailError('');

    // 客户端验证
    const usernameValidation = validateUsername(username);
    if (!usernameValidation.valid) {
      setUsernameError(usernameValidation.error || '');
      return;
    }

    const passwordValidation = validatePassword(password);
    if (!passwordValidation.valid) {
      setPasswordError(passwordValidation.error || '');
      return;
    }

    if (email) {
      const emailValidation = validateEmail(email);
      if (!emailValidation.valid) {
        setEmailError(emailValidation.error || '');
        return;
      }
    }

    await throttledRegister(username, password, email || undefined);
  };

  const handleUsernameChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const value = e.target.value;
    setUsername(value);
    setUsernameError('');

    if (value.length > 0) {
      const validation = validateUsername(value);
      if (!validation.valid) {
        setUsernameError(validation.error || '');
      }
    }
  };

  const handlePasswordChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const value = e.target.value;
    setPassword(value);
    setPasswordError('');

    if (value.length > 0) {
      const validation = validatePassword(value);
      setPasswordStrength(validation.strength);
      if (!validation.valid) {
        setPasswordError(validation.error || '');
      }
    } else {
      setPasswordStrength('weak');
    }
  };

  const handleEmailChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const value = e.target.value;
    setEmail(value);
    setEmailError('');

    if (value.length > 0) {
      const validation = validateEmail(value);
      if (!validation.valid) {
        setEmailError(validation.error || '');
      }
    }
  };

  const getPasswordStrengthColor = () => {
    switch (passwordStrength) {
      case 'strong':
        return '#28a745';
      case 'medium':
        return '#ffc107';
      case 'weak':
        return '#dc3545';
      default:
        return '#6c757d';
    }
  };

  const getPasswordStrengthText = () => {
    switch (passwordStrength) {
      case 'strong':
        return '强';
      case 'medium':
        return '中';
      case 'weak':
        return '弱';
      default:
        return '';
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
              onChange={handlePasswordChange}
              required
              disabled={loading}
              maxLength={128}
              autoComplete="new-password"
            />
            {password && (
              <div className="password-strength">
                <span>密码强度：</span>
                <span style={{ color: getPasswordStrengthColor(), fontWeight: 'bold' }}>
                  {getPasswordStrengthText()}
                </span>
              </div>
            )}
            {passwordError && <div className="field-error">{passwordError}</div>}
            <div className="password-hint">
              密码要求：至少8个字符，包含字母和数字
            </div>
          </div>
          <div className="form-group">
            <label htmlFor="email">邮箱（可选）</label>
            <input
              id="email"
              type="email"
              value={email}
              onChange={handleEmailChange}
              disabled={loading}
              maxLength={255}
              autoComplete="email"
            />
            {emailError && <div className="field-error">{emailError}</div>}
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

