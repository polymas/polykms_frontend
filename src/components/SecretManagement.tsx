import { useState, useEffect } from 'react';
import {
  Card,
  Form,
  Input,
  Button,
  Radio,
  Space,
  Row,
  Col,
  Table,
  Tag,
  message,
  Typography,
  Descriptions,
  Alert,
  Divider
} from 'antd';
import {
  EyeOutlined,
  EyeInvisibleOutlined,
  ReloadOutlined,
  CopyOutlined
} from '@ant-design/icons';
import { secretsAPI, StoreSecretRequest, ListSecretsResponse, Secret } from '../utils/api';
import { parseJWT, decryptSecret, encryptSecret } from '../utils/crypto';
import { validateKeyName, validateProxyAddress, sanitizeInput } from '../utils/validation';
import { getSafeErrorMessage } from '../utils/security';

const { Text } = Typography;

interface DecryptedSecretData {
  server_name?: string;
  ip?: string;
  proxy_address?: string;
  api_key?: string;
  api_secret?: string;
  api_passphrase?: string;
  private_key?: string;
  wallet_type?: string;
  signature_type?: number;
}

export default function SecretManagement() {
  const [form] = Form.useForm();
  const [secrets, setSecrets] = useState<ListSecretsResponse['secrets']>([]);
  const [loading, setLoading] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  // 查询和解密相关状态
  const [selectedKeyName, setSelectedKeyName] = useState('');
  const [decryptedData, setDecryptedData] = useState<DecryptedSecretData | null>(null);
  const [decrypting, setDecrypting] = useState(false);

  // 加载密钥列表
  const loadSecrets = async () => {
    setLoading(true);
    try {
      const response = await secretsAPI.listSecrets();
      setSecrets(response?.secrets || []);
    } catch (err: any) {
      message.error(err.response?.data?.error || err.message || '加载密钥列表失败');
      setSecrets([]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadSecrets();
  }, []);

  // 根据签名类型获取钱包类型
  const getWalletTypeFromSignatureType = (signatureType: number): string => {
    const typeMap: { [key: number]: string } = {
      0: 'EOA',
      1: 'email',
      2: 'key',
    };
    return typeMap[signatureType] || '';
  };

  // 处理签名类型选择变化
  const handleSignatureTypeChange = (e: any) => {
    const signatureType = e.target.value;
    form.setFieldsValue({
      signature_type: signatureType,
      wallet_type: getWalletTypeFromSignatureType(signatureType),
    });
  };

  // 处理密钥名称变化，同时更新服务器名称
  const handleKeyNameChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const keyName = e.target.value;
    form.setFieldsValue({
      key_name: keyName,
      server_name: keyName, // 密钥名称和服务器名称保持一致
    });
  };

  // 单个密钥上传
  const handleSubmitSecret = async (values: any) => {
    setSubmitting(true);

    try {
      const token = localStorage.getItem('token');
      if (!token) {
        message.error('未找到登录token');
        setSubmitting(false);
        return;
      }
      const clientKey = parseJWT(token);

      // 验证至少需要一个密钥字段
      if (!values.private_key && !values.api_key && !values.api_secret && !values.api_passphrase) {
        message.error('至少需要提供私钥、api_key、api_secret或api_passphrase中的一个');
        setSubmitting(false);
        return;
      }

      // 构建上传数据（清理输入，IP地址不传，由后端自动填写）
      const secretToUpload: StoreSecretRequest = {
        key_name: sanitizeInput(values.key_name),
        active: true, // 默认激活
        server_name: sanitizeInput(values.key_name), // 服务器名称和密钥名称一致
        ip: '', // IP地址不传，后端根据请求IP自动填写
        proxy_address: values.proxy_address || '',
        wallet_type: values.wallet_type ? sanitizeInput(values.wallet_type) : 'key',
        signature_type: values.signature_type !== undefined ? values.signature_type : 2,
      };

      // 只加密需要后端加密存储的字段：private_key 和 api_secret
      if (values.private_key) {
        secretToUpload.private_key = await encryptSecret(values.private_key, clientKey);
      }
      if (values.api_secret) {
        secretToUpload.api_secret = await encryptSecret(values.api_secret, clientKey);
      }

      // api_key 和 api_passphrase 后端明文存储，前端直接发送明文
      if (values.api_key) {
        secretToUpload.api_key = values.api_key;
      }
      if (values.api_passphrase) {
        secretToUpload.api_passphrase = values.api_passphrase;
      }

      await secretsAPI.storeSecret(secretToUpload);
      message.success('密钥上传成功');
      form.resetFields();
      await loadSecrets();
    } catch (err: any) {
      message.error(getSafeErrorMessage(err, '上传失败'));
    } finally {
      setSubmitting(false);
    }
  };

  // 获取并解密密文
  const handleGetAndDecrypt = async (keyName: string) => {
    setSelectedKeyName(keyName);
    setDecryptedData(null);
    setDecrypting(true);

    try {
      // 获取加密的密钥
      const secret: Secret = await secretsAPI.getSecret(keyName);

      // 从localStorage获取token
      const token = localStorage.getItem('token');
      if (!token) {
        message.error('未找到登录token');
        return;
      }

      // 解析JWT获取client_key
      const clientKey = parseJWT(token);

      const decrypted: DecryptedSecretData = {};

      // 解密敏感字段（只有 private_key 和 api_secret 需要解密，因为后端加密存储）
      if (secret.private_key) {
        decrypted.private_key = await decryptSecret(secret.private_key, clientKey);
      }
      if (secret.api_secret) {
        decrypted.api_secret = await decryptSecret(secret.api_secret, clientKey);
      }

      // api_key 和 api_passphrase 在后端是明文存储的，后端返回时已经是明文，直接使用
      if (secret.api_key) {
        decrypted.api_key = secret.api_key;
      }
      if (secret.api_passphrase) {
        decrypted.api_passphrase = secret.api_passphrase;
      }

      // 如果使用旧格式的value字段
      if (secret.value && !decrypted.private_key) {
        try {
          const decryptedValue = await decryptSecret(secret.value, clientKey);
          // 尝试解析为JSON
          try {
            const parsed = JSON.parse(decryptedValue);
            Object.assign(decrypted, parsed);
          } catch {
            // 如果不是JSON，作为private_key
            decrypted.private_key = decryptedValue;
          }
        } catch (e) {
          // 忽略解密错误
        }
      }

      // 添加非敏感字段
      decrypted.server_name = secret.server_name || '';
      decrypted.ip = secret.ip || '';
      decrypted.proxy_address = secret.proxy_address || '';
      decrypted.wallet_type = secret.wallet_type || '';
      decrypted.signature_type = secret.signature_type || 1;

      setDecryptedData(decrypted);
      message.success('解密成功');
    } catch (err: any) {
      // 如果是403错误，显示错误提示
      if (err?.response?.status === 403) {
        message.error('无访问权限');
      } else {
        message.error(getSafeErrorMessage(err, '获取或解密失败'));
      }
    } finally {
      setDecrypting(false);
    }
  };

  // 复制到剪贴板
  const handleCopy = (text: string, label: string) => {
    navigator.clipboard.writeText(text);
    message.success(`已复制${label}到剪贴板`);
  };

  // 表格列定义
  const columns = [
    {
      title: '密钥名称',
      dataIndex: 'key_name',
      key: 'key_name',
    },
    {
      title: '服务器名称',
      dataIndex: 'server_name',
      key: 'server_name',
      render: (text: string) => text || '-',
    },
    {
      title: 'IP地址',
      dataIndex: 'ip',
      key: 'ip',
      render: (text: string) => text || '-',
    },
    {
      title: '代理地址',
      dataIndex: 'proxy_address',
      key: 'proxy_address',
      render: (text: string) => text ? (text.length > 20 ? `${text.substring(0, 20)}...` : text) : '-',
      ellipsis: true,
    },
    {
      title: '钱包类型',
      dataIndex: 'wallet_type',
      key: 'wallet_type',
      render: (text: string) => text || '-',
    },
    {
      title: '激活',
      dataIndex: 'active',
      key: 'active',
      render: (active: boolean) => (
        <Tag color={active ? 'success' : 'default'}>
          {active ? '激活' : '未激活'}
        </Tag>
      ),
    },
    {
      title: '创建时间',
      dataIndex: 'created_at',
      key: 'created_at',
      render: (date: string) => new Date(date).toLocaleString('zh-CN'),
    },
    {
      title: '操作',
      key: 'action',
      render: (_: any, record: any) => (
        <Button
          type="link"
          onClick={() => handleGetAndDecrypt(record.key_name)}
          disabled={decrypting && selectedKeyName === record.key_name}
          loading={decrypting && selectedKeyName === record.key_name}
        >
          {decrypting && selectedKeyName === record.key_name ? '解密中...' : '获取并解密'}
        </Button>
      ),
    },
  ];

  return (
    <div style={{ maxWidth: '1400px', margin: '0 auto' }}>
      <Space direction="vertical" size="large" style={{ width: '100%' }}>
        {/* 添加密钥表单 */}
        <Card title="添加密钥">
          <Form
            form={form}
            layout="vertical"
            onFinish={handleSubmitSecret}
            initialValues={{
              signature_type: 2,
              wallet_type: 'key',
            }}
          >
            <Row gutter={24}>
              {/* 左栏 */}
              <Col xs={24} lg={12}>
                <Form.Item
                  label="密钥名称/服务器名称"
                  name="key_name"
                  rules={[
                    { required: true, message: '请输入密钥名称' },
                    {
                      validator: (_, value) => {
                        if (!value) return Promise.resolve();
                        const validation = validateKeyName(value);
                        return validation.valid
                          ? Promise.resolve()
                          : Promise.reject(new Error(validation.error || '密钥名称格式不正确'));
                      }
                    }
                  ]}
                >
                  <Input
                    placeholder="例如: server_001"
                    onChange={handleKeyNameChange}
                  />
                </Form.Item>
                <Form.Item
                  label="代理地址"
                  name="proxy_address"
                  rules={[
                    {
                      validator: (_, value) => {
                        if (!value) return Promise.resolve();
                        const validation = validateProxyAddress(value);
                        return validation.valid
                          ? Promise.resolve()
                          : Promise.reject(new Error(validation.error || '代理地址格式不正确'));
                      }
                    }
                  ]}
                >
                  <Input placeholder="代理地址" />
                </Form.Item>
                <Form.Item
                  label="签名类型"
                  name="signature_type"
                  rules={[{ required: true, message: '请选择签名类型' }]}
                >
                  <Radio.Group onChange={handleSignatureTypeChange} buttonStyle="solid">
                    <Radio.Button value={0}>EOA</Radio.Button>
                    <Radio.Button value={1}>Email</Radio.Button>
                    <Radio.Button value={2}>Key</Radio.Button>
                  </Radio.Group>
                </Form.Item>
                <Form.Item name="wallet_type" hidden>
                  <Input />
                </Form.Item>
                <Form.Item name="server_name" hidden>
                  <Input />
                </Form.Item>
              </Col>

              {/* 右栏 - 密钥相关字段 */}
              <Col xs={24} lg={12}>
                <Form.Item
                  label="私钥"
                  name="private_key"
                  tooltip="将自动加密存储"
                >
                  <Input.Password
                    placeholder="secret"
                    iconRender={(visible) => (visible ? <EyeOutlined /> : <EyeInvisibleOutlined />)}
                    style={{ fontFamily: 'monospace' }}
                  />
                </Form.Item>
                <Alert
                  message="⚠️ 请确保周围环境安全后再显示私钥"
                  type="warning"
                  showIcon
                  style={{ marginBottom: 16 }}
                />
                <Form.Item
                  label="API密钥 (API Key)"
                  name="api_key"
                  tooltip="明文存储"
                >
                  <Input.Password
                    placeholder="api_key"
                    iconRender={(visible) => (visible ? <EyeOutlined /> : <EyeInvisibleOutlined />)}
                    style={{ fontFamily: 'monospace' }}
                  />
                </Form.Item>
                <Form.Item
                  label="API密钥 (API Secret)"
                  name="api_secret"
                  tooltip="将自动加密存储"
                >
                  <Input.Password
                    placeholder="api_secret"
                    iconRender={(visible) => (visible ? <EyeOutlined /> : <EyeInvisibleOutlined />)}
                    style={{ fontFamily: 'monospace' }}
                  />
                </Form.Item>
                <Form.Item
                  label="API密码短语(api_passphrase)"
                  name="api_passphrase"
                  tooltip="明文存储"
                >
                  <Input.Password
                    placeholder="api_passphrase"
                    iconRender={(visible) => (visible ? <EyeOutlined /> : <EyeInvisibleOutlined />)}
                  />
                </Form.Item>
              </Col>
            </Row>

            <Divider />

            <Form.Item>
              <Button
                type="primary"
                htmlType="submit"
                loading={submitting}
                block
              >
                提交
              </Button>
            </Form.Item>
          </Form>
        </Card>

        {/* 密钥列表 */}
        <Card
          title="我的密钥列表"
          extra={
            <Button
              icon={<ReloadOutlined />}
              onClick={loadSecrets}
              loading={loading}
            >
              刷新
            </Button>
          }
        >
          <Table
            columns={columns}
            dataSource={secrets}
            rowKey="id"
            loading={loading}
            pagination={{
              pageSize: 10,
              showSizeChanger: true,
              showTotal: (total) => `共 ${total} 条`,
            }}
          />
        </Card>

        {/* 解密结果显示 */}
        {decryptedData && (
          <Card title={`解密结果 - ${selectedKeyName}`}>
            <Descriptions column={2} bordered>
              {decryptedData.server_name && (
                <Descriptions.Item label="服务器名称">
                  <Text code>{decryptedData.server_name}</Text>
                </Descriptions.Item>
              )}
              {decryptedData.ip && (
                <Descriptions.Item label="IP地址">
                  <Text code>{decryptedData.ip}</Text>
                </Descriptions.Item>
              )}
              {decryptedData.proxy_address && (
                <Descriptions.Item label="代理地址">
                  <Text code>{decryptedData.proxy_address}</Text>
                </Descriptions.Item>
              )}
              {decryptedData.wallet_type && (
                <Descriptions.Item label="钱包类型">
                  <Text code>{decryptedData.wallet_type}</Text>
                </Descriptions.Item>
              )}
              {decryptedData.signature_type !== undefined && (
                <Descriptions.Item label="签名类型">
                  <Text code>{decryptedData.signature_type}</Text>
                </Descriptions.Item>
              )}
              {decryptedData.private_key && (
                <Descriptions.Item label="私钥" span={2}>
                  <Space>
                    <Text code style={{ fontFamily: 'monospace', wordBreak: 'break-all' }}>
                      {decryptedData.private_key}
                    </Text>
                    <Button
                      type="text"
                      icon={<CopyOutlined />}
                      onClick={() => handleCopy(decryptedData.private_key!, '私钥')}
                    />
                  </Space>
                </Descriptions.Item>
              )}
              {decryptedData.api_key && (
                <Descriptions.Item label="API密钥 (API Key)" span={2}>
                  <Space>
                    <Text code style={{ fontFamily: 'monospace', wordBreak: 'break-all' }}>
                      {decryptedData.api_key}
                    </Text>
                    <Button
                      type="text"
                      icon={<CopyOutlined />}
                      onClick={() => handleCopy(decryptedData.api_key!, 'API密钥')}
                    />
                  </Space>
                </Descriptions.Item>
              )}
              {decryptedData.api_secret && (
                <Descriptions.Item label="API密钥 (API Secret)" span={2}>
                  <Space>
                    <Text code style={{ fontFamily: 'monospace', wordBreak: 'break-all' }}>
                      {decryptedData.api_secret}
                    </Text>
                    <Button
                      type="text"
                      icon={<CopyOutlined />}
                      onClick={() => handleCopy(decryptedData.api_secret!, 'API密钥Secret')}
                    />
                  </Space>
                </Descriptions.Item>
              )}
              {decryptedData.api_passphrase && (
                <Descriptions.Item label="API密码短语(api_passphrase)" span={2}>
                  <Space>
                    <Text code style={{ fontFamily: 'monospace', wordBreak: 'break-all' }}>
                      {decryptedData.api_passphrase}
                    </Text>
                    <Button
                      type="text"
                      icon={<CopyOutlined />}
                      onClick={() => handleCopy(decryptedData.api_passphrase!, 'API密码短语(api_passphrase)')}
                    />
                  </Space>
                </Descriptions.Item>
              )}
            </Descriptions>
          </Card>
        )}
      </Space>
    </div>
  );
}
