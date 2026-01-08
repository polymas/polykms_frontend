import { useState, useCallback } from 'react';
import { Form, Input, Button, Card, Alert, Typography, Progress } from 'antd';
import { UserOutlined, LockOutlined, MailOutlined } from '@ant-design/icons';
import { authAPI } from '../utils/api';
import { validateUsername, validatePassword, validateEmail, sanitizeInput } from '../utils/validation';
import { getSafeErrorMessage, throttle } from '../utils/security';

const { Title, Text } = Typography;

interface RegisterProps {
  onRegisterSuccess: () => void;
  onSwitchToLogin: () => void;
}

export default function Register({ onRegisterSuccess, onSwitchToLogin }: RegisterProps) {
  const [form] = Form.useForm();
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [usernameError, setUsernameError] = useState('');
  const [passwordError, setPasswordError] = useState('');
  const [emailError, setEmailError] = useState('');
  const [passwordStrength, setPasswordStrength] = useState<'weak' | 'medium' | 'strong'>('weak');

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

  const handleSubmit = async (values: { username: string; password: string; email?: string }) => {
    setError('');
    setUsernameError('');
    setPasswordError('');
    setEmailError('');

    // 客户端验证
    const usernameValidation = validateUsername(values.username);
    if (!usernameValidation.valid) {
      setUsernameError(usernameValidation.error || '');
      return;
    }

    const passwordValidation = validatePassword(values.password);
    if (!passwordValidation.valid) {
      setPasswordError(passwordValidation.error || '');
      return;
    }

    if (values.email) {
      const emailValidation = validateEmail(values.email);
      if (!emailValidation.valid) {
        setEmailError(emailValidation.error || '');
        return;
      }
    }

    await throttledRegister(values.username, values.password, values.email);
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

  const handlePasswordChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const value = e.target.value;
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
    setEmailError('');

    if (value.length > 0) {
      const validation = validateEmail(value);
      if (!validation.valid) {
        setEmailError(validation.error || '');
      }
    }
  };

  const getPasswordStrengthPercent = () => {
    switch (passwordStrength) {
      case 'strong': return 100;
      case 'medium': return 66;
      case 'weak': return 33;
      default: return 0;
    }
  };

  const getPasswordStrengthColor = () => {
    switch (passwordStrength) {
      case 'strong': return '#52c41a';
      case 'medium': return '#faad14';
      case 'weak': return '#ff4d4f';
      default: return '#d9d9d9';
    }
  };

  const getPasswordStrengthText = () => {
    switch (passwordStrength) {
      case 'strong': return '强';
      case 'medium': return '中';
      case 'weak': return '弱';
      default: return '';
    }
  };

  return (
    <div className="auth-container">
      <Card style={{ width: 450, boxShadow: '0 4px 12px rgba(0,0,0,0.15)' }}>
        <Title level={2} style={{ textAlign: 'center', marginBottom: 24 }}>
          注册
        </Title>
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
        <Form
          form={form}
          name="register"
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
              { min: 8, message: '密码至少8个字符' },
              { max: 128, message: '密码不能超过128个字符' },
            ]}
            validateStatus={passwordError ? 'error' : ''}
            help={passwordError}
          >
            <Input.Password
              prefix={<LockOutlined />}
              placeholder="密码"
              maxLength={128}
              onChange={handlePasswordChange}
              disabled={loading}
            />
          </Form.Item>

          {form.getFieldValue('password') && (
            <Form.Item>
              <div style={{ marginBottom: 8 }}>
                <Text type="secondary" style={{ fontSize: 12 }}>密码强度：</Text>
                <Text strong style={{ color: getPasswordStrengthColor(), fontSize: 12 }}>
                  {getPasswordStrengthText()}
                </Text>
              </div>
              <Progress
                percent={getPasswordStrengthPercent()}
                strokeColor={getPasswordStrengthColor()}
                showInfo={false}
                size="small"
              />
              <Text type="secondary" style={{ fontSize: 12, display: 'block', marginTop: 4 }}>
                密码要求：至少8个字符，包含字母和数字
              </Text>
            </Form.Item>
          )}

          <Form.Item
            name="email"
            rules={[
              { type: 'email', message: '请输入有效的邮箱地址' },
              { max: 255, message: '邮箱不能超过255个字符' },
            ]}
            validateStatus={emailError ? 'error' : ''}
            help={emailError}
          >
            <Input
              prefix={<MailOutlined />}
              placeholder="邮箱（可选）"
              maxLength={255}
              onChange={handleEmailChange}
              disabled={loading}
            />
          </Form.Item>

          <Form.Item>
            <Button
              type="primary"
              htmlType="submit"
              block
              loading={loading}
            >
              注册
            </Button>
          </Form.Item>
        </Form>
        <div style={{ textAlign: 'center', marginTop: 16 }}>
          <Text type="secondary">已有账号？</Text>{' '}
          <Button type="link" onClick={onSwitchToLogin} style={{ padding: 0 }}>
            立即登录
          </Button>
        </div>
      </Card>
    </div>
  );
}
