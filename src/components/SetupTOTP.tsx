import { useEffect, useRef, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { Card, Button, Input, Alert, Steps, Typography, Space, Spin, message } from 'antd';
import { SafetyCertificateOutlined, ReloadOutlined, CopyOutlined } from '@ant-design/icons';
import { authAPI, type TOTPSetupResponse } from '../utils/api';
import { getSafeErrorMessage } from '../utils/security';

const { Text, Paragraph } = Typography;

/**
 * admin 首次绑定 TOTP 页：
 *  入口：/setup-2fa，必须由 Login 页通过 navigate(state.setupToken) 进入
 *  step 0：调 setup 拿 QR + secret 文本，提示扫码或手动添加
 *  step 1：输入 6 位码确认绑定，成功后服务端直接发 JWT，前端跳主界面
 *
 *  setup_token 不进 localStorage：5 分钟有效期 + 刷新即失效，意外离开页面只能重新登录
 */
export default function SetupTOTP() {
  const navigate = useNavigate();
  const location = useLocation();
  const setupToken: string | undefined = (location.state as any)?.setupToken;

  const [setup, setSetup] = useState<TOTPSetupResponse | null>(null);
  const [loadingSetup, setLoadingSetup] = useState(false);
  const [error, setError] = useState('');
  const [code, setCode] = useState('');
  const [verifying, setVerifying] = useState(false);
  const [stepIndex, setStepIndex] = useState(0);
  const codeInputRef = useRef<any>(null);
  // 防止 React 18 StrictMode 双调用导致后端覆盖刚生成的 secret
  const requestedRef = useRef(false);

  const fetchSetup = async () => {
    if (!setupToken) return;
    setLoadingSetup(true);
    setError('');
    try {
      const data = await authAPI.setupTOTP(setupToken);
      setSetup(data);
    } catch (err: any) {
      setError(getSafeErrorMessage(err, '生成 TOTP 密钥失败'));
    } finally {
      setLoadingSetup(false);
    }
  };

  useEffect(() => {
    if (!setupToken) {
      // 没 token 多半是直接刷新或粘贴 URL 进来的；导回登录
      message.error('会话已过期，请重新登录');
      navigate('/login', { replace: true });
      return;
    }
    if (requestedRef.current) return;
    requestedRef.current = true;
    fetchSetup();
  }, [setupToken, navigate]);

  const handleVerify = async (codeArg?: string) => {
    const submitCode = codeArg ?? code;
    if (!/^\d{6}$/.test(submitCode)) {
      setError('请输入 6 位数字验证码');
      return;
    }
    if (!setupToken) return;
    setVerifying(true);
    setError('');
    try {
      const resp = await authAPI.verifySetupTOTP(setupToken, submitCode);
      message.success(resp.message || 'TOTP 已启用，已登录');
      // verify-setup 已经写好了 JWT，直接跳主界面（admin → /secrets）
      navigate('/secrets', { replace: true });
    } catch (err: any) {
      setError(getSafeErrorMessage(err, '验证失败'));
      setCode('');
      setTimeout(() => codeInputRef.current?.focus?.(), 50);
    } finally {
      setVerifying(false);
    }
  };

  const handleCopySecret = async () => {
    if (!setup?.secret) return;
    try {
      await navigator.clipboard.writeText(setup.secret);
      message.success('密钥已复制');
    } catch {
      message.error('复制失败，请手动选中');
    }
  };

  const handleRegenerate = async () => {
    setSetup(null);
    setCode('');
    setStepIndex(0);
    await fetchSetup();
  };

  return (
    <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24, background: '#f5f5f5' }}>
      <Card style={{ maxWidth: 560, width: '100%' }}>
        <div style={{ textAlign: 'center', marginBottom: 24 }}>
          <SafetyCertificateOutlined style={{ fontSize: 40, color: '#1677ff' }} />
          <h2 style={{ marginTop: 12, marginBottom: 4 }}>绑定二次验证</h2>
          <Text type="secondary">管理员账号必须绑定 TOTP 后才能继续使用</Text>
        </div>

        <Steps
          current={stepIndex}
          size="small"
          style={{ marginBottom: 24 }}
          items={[
            { title: '扫码 / 手动添加' },
            { title: '输入验证码确认' },
          ]}
        />

        {error && (
          <Alert message={error} type="error" showIcon closable style={{ marginBottom: 16 }} onClose={() => setError('')} />
        )}

        {loadingSetup && (
          <div style={{ textAlign: 'center', padding: 40 }}>
            <Spin />
          </div>
        )}

        {!loadingSetup && setup && stepIndex === 0 && (
          <Space direction="vertical" size="large" style={{ width: '100%' }}>
            <div style={{ textAlign: 'center' }}>
              <img
                src={`data:image/png;base64,${setup.qr_png_base64}`}
                alt="TOTP QR"
                style={{ width: 220, height: 220, border: '1px solid #f0f0f0', borderRadius: 8 }}
              />
            </div>

            <div>
              <Text strong>1. 打开 Authenticator 应用</Text>
              <Paragraph type="secondary" style={{ marginBottom: 4, marginTop: 4 }}>
                推荐使用 Google Authenticator、1Password、Bitwarden、iCloud 钥匙串等支持云同步的工具，可避免换手机后丢失密钥。
              </Paragraph>
            </div>

            <div>
              <Text strong>2. 扫描二维码 或 手动输入下面的密钥</Text>
              <div style={{ marginTop: 8, padding: 12, background: '#fafafa', borderRadius: 6, fontFamily: 'monospace', fontSize: 13, wordBreak: 'break-all', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
                <span>{setup.secret}</span>
                <Button size="small" icon={<CopyOutlined />} onClick={handleCopySecret}>复制</Button>
              </div>
              <Text type="secondary" style={{ fontSize: 12 }}>
                发行方: {setup.issuer}　账号: {setup.account_name}
              </Text>
            </div>

            <Alert
              type="warning"
              showIcon
              message="重要"
              description="如果换手机后丢失了 Authenticator，请联系管理员人工重置（直接修改数据库 totp_enabled 字段）。本系统不提供备份码。"
            />

            <Space style={{ width: '100%', justifyContent: 'space-between' }}>
              <Button icon={<ReloadOutlined />} onClick={handleRegenerate}>重新生成</Button>
              <Button type="primary" onClick={() => { setStepIndex(1); setTimeout(() => codeInputRef.current?.focus?.(), 50); }}>
                我已添加，下一步
              </Button>
            </Space>
          </Space>
        )}

        {!loadingSetup && setup && stepIndex === 1 && (
          <Space direction="vertical" size="large" style={{ width: '100%' }}>
            <div style={{ textAlign: 'center' }}>
              <Text>请输入 Authenticator 显示的 6 位验证码</Text>
            </div>
            <Input
              ref={codeInputRef}
              size="large"
              value={code}
              onChange={(e) => {
                const v = e.target.value.replace(/\D/g, '').slice(0, 6);
                setCode(v);
                if (v.length === 6) {
                  // 输满 6 位自动提交
                  setTimeout(() => handleVerify(v), 0);
                }
              }}
              onPressEnter={() => handleVerify()}
              placeholder="6 位数字"
              maxLength={6}
              autoFocus
              inputMode="numeric"
              autoComplete="one-time-code"
              style={{ textAlign: 'center', letterSpacing: 10, fontSize: 24, fontFamily: 'monospace' }}
              disabled={verifying}
            />
            <Space style={{ width: '100%', justifyContent: 'space-between' }}>
              <Button onClick={() => setStepIndex(0)} disabled={verifying}>上一步</Button>
              <Button type="primary" onClick={() => handleVerify()} loading={verifying} disabled={code.length !== 6}>
                完成绑定并登录
              </Button>
            </Space>
          </Space>
        )}
      </Card>
    </div>
  );
}
