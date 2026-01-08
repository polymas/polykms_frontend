import { useState, useCallback } from 'react';
import { Form, Input, Button, Card, Alert, Typography } from 'antd';
import { UserOutlined, LockOutlined } from '@ant-design/icons';
import { authAPI } from '../utils/api';
import { validateUsername, sanitizeInput } from '../utils/validation';
import { getSafeErrorMessage, throttle } from '../utils/security';

const { Title, Text } = Typography;

interface LoginProps {
  onLoginSuccess: () => void;
  onSwitchToRegister: () => void;
}

export default function Login({ onLoginSuccess, onSwitchToRegister }: LoginProps) {
  const [form] = Form.useForm();
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

  const handleSubmit = async (values: { username: string; password: string }) => {
    setError('');
    setUsernameError('');

    // 客户端验证
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

  const handleUsernameChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const value = e.target.value;
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
      <Card style={{ width: 400, boxShadow: '0 4px 12px rgba(0,0,0,0.15)' }}>
        <Title level={2} style={{ textAlign: 'center', marginBottom: 24 }}>
          登录
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
            <Button
              type="primary"
              htmlType="submit"
              block
              loading={loading}
            >
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
      </Card>
    </div>
  );
}
