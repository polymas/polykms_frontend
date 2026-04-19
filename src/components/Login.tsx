import { useState, useCallback, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { Form, Input, Button, Card, Alert, Typography } from 'antd';
import { UserOutlined, LockOutlined, SafetyCertificateOutlined } from '@ant-design/icons';
import { authAPI } from '../utils/api';
import { validateUsername, sanitizeInput } from '../utils/validation';
import { getSafeErrorMessage, throttle } from '../utils/security';

const { Text } = Typography;

interface LoginProps {
  onLoginSuccess: () => void;
  onSwitchToRegister: () => void;
}

type Step = 'credential' | 'totp';

export default function Login({ onLoginSuccess, onSwitchToRegister }: LoginProps) {
  const navigate = useNavigate();
  const [form] = Form.useForm();
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [usernameError, setUsernameError] = useState('');
  const [step, setStep] = useState<Step>('credential');
  const [challengeToken, setChallengeToken] = useState('');
  const [code, setCode] = useState('');
  const codeInputRef = useRef<any>(null);

  // 节流处理登录请求（防止暴力破解）
  const throttledLogin = useCallback(
    throttle(async (username: string, password: string) => {
      setError('');
      setLoading(true);

      try {
        const usernameValidation = validateUsername(username);
        if (!usernameValidation.valid) {
          setError(usernameValidation.error || '用户名验证失败');
          setLoading(false);
          return;
        }

        const sanitizedUsername = sanitizeInput(username);
        const resp = await authAPI.login({ username: sanitizedUsername, password });

        // admin 已绑定 TOTP，进入二步验证
        if (resp.requires_totp && resp.challenge_token) {
          setChallengeToken(resp.challenge_token);
          setStep('totp');
          setLoading(false);
          // 等渲染完再聚焦
          setTimeout(() => codeInputRef.current?.focus?.(), 50);
          return;
        }

        // admin 未绑定 TOTP，跳设置页（setup_token 通过 router state 传，刷新即失效更安全）
        if (resp.requires_setup_totp && resp.setup_token) {
          navigate('/setup-2fa', {
            replace: true,
            state: { setupToken: resp.setup_token, username: resp.username },
          });
          return;
        }

        onLoginSuccess();
      } catch (err: any) {
        setError(getSafeErrorMessage(err, '登录失败'));
      } finally {
        setLoading(false);
      }
    }, 2000),
    [onLoginSuccess]
  );

  const handleSubmit = async (values: { username: string; password: string }) => {
    setError('');
    setUsernameError('');

    const usernameValidation = validateUsername(values.username);
    if (!usernameValidation.valid) {
      setUsernameError(usernameValidation.error || '');
      return;
    }
    if (!values.password || values.password.length === 0) {
      setError('密码不能为空');
      return;
    }
    await throttledLogin(values.username, values.password);
  };

  const handleSubmitTOTP = async () => {
    if (!/^\d{6}$/.test(code)) {
      setError('请输入 6 位数字验证码');
      return;
    }
    setError('');
    setLoading(true);
    try {
      await authAPI.loginTOTP({ challenge_token: challengeToken, code });
      onLoginSuccess();
    } catch (err: any) {
      setError(getSafeErrorMessage(err, '验证失败'));
      // 验证失败后清空输入并重新聚焦，便于直接重输
      setCode('');
      setTimeout(() => codeInputRef.current?.focus?.(), 50);
    } finally {
      setLoading(false);
    }
  };

  // 6 位码输入：只接受数字，自动剪到 6 位，到 6 位自动提交
  const handleCodeChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const v = e.target.value.replace(/\D/g, '').slice(0, 6);
    setCode(v);
    if (v.length === 6) {
      // 用 setTimeout 让 state 更新先生效
      setTimeout(() => handleSubmitTOTPWith(v), 0);
    }
  };

  const handleSubmitTOTPWith = async (v: string) => {
    if (loading) return;
    setError('');
    setLoading(true);
    try {
      await authAPI.loginTOTP({ challenge_token: challengeToken, code: v });
      onLoginSuccess();
    } catch (err: any) {
      setError(getSafeErrorMessage(err, '验证失败'));
      setCode('');
      setTimeout(() => codeInputRef.current?.focus?.(), 50);
    } finally {
      setLoading(false);
    }
  };

  const handleBackToCredential = () => {
    setStep('credential');
    setChallengeToken('');
    setCode('');
    setError('');
  };

  const handleUsernameChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const value = e.target.value;
    setUsernameError('');
    if (value.length > 0) {
      const validation = validateUsername(value);
      if (!validation.valid) {
        setUsernameError(validation.error || '');
      }
    }
  };

  return (
    <div className="auth-container">
      <Card className="auth-card" style={{ width: 400 }}>
        {error && (
          <Alert
            message={error}
            type="error"
            showIcon
            closable
            style={{ marginBottom: 16 }}
            onClose={() => setError('')}
          />
        )}

        {step === 'credential' && (
          <>
            <Form
              form={form}
              name="login"
              onFinish={handleSubmit}
              autoComplete="off"
              size="large"
            >
              <Form.Item
                name="username"
                rules={[
                  { required: true, message: '请输入用户名' },
                  { max: 50, message: '用户名不能超过50个字符' },
                ]}
                validateStatus={usernameError ? 'error' : ''}
                help={usernameError}
              >
                <Input
                  prefix={<UserOutlined />}
                  placeholder="用户名"
                  maxLength={50}
                  onChange={handleUsernameChange}
                  disabled={loading}
                />
              </Form.Item>

              <Form.Item
                name="password"
                rules={[
                  { required: true, message: '请输入密码' },
                  { max: 128, message: '密码不能超过128个字符' },
                ]}
              >
                <Input.Password
                  prefix={<LockOutlined />}
                  placeholder="密码"
                  maxLength={128}
                  disabled={loading}
                />
              </Form.Item>

              <Form.Item>
                <Button type="primary" htmlType="submit" block loading={loading}>
                  登录
                </Button>
              </Form.Item>
            </Form>
            <div style={{ textAlign: 'center', marginTop: 16 }}>
              <Text type="secondary">还没有账号？</Text>{' '}
              <Button type="link" onClick={onSwitchToRegister} style={{ padding: 0 }}>
                立即注册
              </Button>
            </div>
          </>
        )}

        {step === 'totp' && (
          <div>
            <div style={{ textAlign: 'center', marginBottom: 16 }}>
              <SafetyCertificateOutlined style={{ fontSize: 32, color: '#1677ff' }} />
              <div style={{ marginTop: 8, fontSize: 16, fontWeight: 500 }}>二次验证</div>
              <Text type="secondary" style={{ fontSize: 12 }}>
                请输入 Authenticator 显示的 6 位验证码
              </Text>
            </div>
            <Input
              ref={codeInputRef}
              size="large"
              value={code}
              onChange={handleCodeChange}
              onPressEnter={handleSubmitTOTP}
              placeholder="6 位数字"
              maxLength={6}
              autoFocus
              inputMode="numeric"
              autoComplete="one-time-code"
              style={{ textAlign: 'center', letterSpacing: 8, fontSize: 20, fontFamily: 'monospace' }}
              disabled={loading}
            />
            <Button
              type="primary"
              block
              size="large"
              style={{ marginTop: 16 }}
              loading={loading}
              onClick={handleSubmitTOTP}
              disabled={code.length !== 6}
            >
              验证并登录
            </Button>
            <Button type="link" block style={{ marginTop: 8 }} onClick={handleBackToCredential} disabled={loading}>
              返回重新输入用户名密码
            </Button>
          </div>
        )}
      </Card>
    </div>
  );
}
