import { useState, useEffect, useCallback, useRef } from 'react';
import {
  Card,
  Form,
  Input,
  InputNumber,
  Button,
  Radio,
  Space,
  Row,
  Col,
  Table,
  message,
  Typography,
  Divider
} from 'antd';
import {
  EyeOutlined,
  EyeInvisibleOutlined,
  ReloadOutlined,
  CopyOutlined,
  ExclamationCircleOutlined
} from '@ant-design/icons';
import { secretsAPI, StoreSecretRequest, ListSecretsResponse } from '../utils/api';
import { parseJWT, encryptSecret } from '../utils/crypto';
import { validateKeyName, sanitizeInput } from '../utils/validation';
import { getSafeErrorMessage, debounce, secureLog } from '../utils/security';
import { getAddressFromPrivateKey, getPolymarketProxyAddress, isValidPrivateKey, SignatureType } from '../utils/wallet';

const { Text } = Typography;

export default function SecretManagement() {
  const [form] = Form.useForm();
  const [secrets, setSecrets] = useState<ListSecretsResponse['secrets']>([]);
  const [loading, setLoading] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  // 钱包地址计算相关状态
  const [walletAddress, setWalletAddress] = useState<string>('');
  const [proxyAddress, setProxyAddress] = useState<string>('');

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

    // 组件卸载时清理敏感状态
    return () => {
      setWalletAddress('');
      setProxyAddress('');
      // 取消正在进行的请求
      if (abortControllerRef.current) {
        abortControllerRef.current.abort();
      }
    };
  }, []);

  // 根据签名类型获取钱包类型（与Go SDK保持一致）
  // EOA: 裸钱包, Proxy: 邮箱钱包, Safe: 私钥钱包
  const getWalletTypeFromSignatureType = (signatureType: number): string => {
    const typeMap: { [key: number]: string } = {
      0: 'EOA',      // 裸钱包
      1: 'proxy',    // 邮箱钱包
      2: 'safe',     // 私钥钱包
    };
    return typeMap[signatureType] || 'key';
  };

  // 处理签名类型选择变化
  const handleSignatureTypeChange = async (e: any) => {
    const signatureType = e.target.value;
    form.setFieldsValue({
      signature_type: signatureType,
      wallet_type: getWalletTypeFromSignatureType(signatureType),
    });

    // 如果已经有私钥和钱包地址，重新计算代理地址
    const privateKey = form.getFieldValue('private_key');
    if (privateKey && walletAddress) {
      try {
        const proxyAddress = await getPolymarketProxyAddress(walletAddress, signatureType);
        setProxyAddress(proxyAddress);
        form.setFieldsValue({
          proxy_address: proxyAddress,
        });
      } catch (error) {
        secureLog.warn('重新计算代理地址失败:', error);
        message.error('重新计算代理地址失败，请手动输入');
      }
    }
  };

  // 处理密钥名称变化，同时更新服务器名称
  const handleKeyNameChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const keyName = e.target.value;
    form.setFieldsValue({
      key_name: keyName,
      server_name: keyName, // 密钥名称和服务器名称保持一致
    });
  };

  // 用于取消正在进行的请求
  const abortControllerRef = useRef<AbortController | null>(null);

  // 处理私钥输入变化，自动计算钱包地址和代理地址（带防抖）
  const handlePrivateKeyChangeInternal = useCallback(async (privateKey: string) => {
    // 取消之前的请求
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
    }
    abortControllerRef.current = new AbortController();
    const signal = abortControllerRef.current.signal;

    // 清空之前的结果
    setWalletAddress('');
    setProxyAddress('');

    // 如果私钥为空，不进行计算
    if (!privateKey) {
      return;
    }

    // 验证私钥格式
    if (!isValidPrivateKey(privateKey)) {
      // 私钥格式无效，但不显示错误（可能用户还在输入）
      return;
    }

    // 立即计算钱包地址（本地计算，不需要网络调用）
    let calculatedAddress: string;
    try {
      calculatedAddress = getAddressFromPrivateKey(privateKey);
      setWalletAddress(calculatedAddress);
    } catch (error) {
      secureLog.error('计算钱包地址失败:', error);
      // 如果计算地址失败，可能是私钥格式问题
      if (privateKey.length > 20) {
        // 只有私钥长度足够时才显示错误（避免用户输入过程中频繁提示）
        message.error('私钥格式无效，无法计算钱包地址');
      }
      return;
    }

    // 检查是否已取消
    if (signal.aborted) return;

    // 获取签名类型
    const signatureType = form.getFieldValue('signature_type');

    // 如果是EOA类型，代理地址等于基础地址，不需要调用网络
    if (signatureType === SignatureType.EOA) {
      setProxyAddress(calculatedAddress);
      form.setFieldsValue({
        proxy_address: calculatedAddress,
      });
      return;
    }

    // 异步获取代理地址（需要调用Polygon网络）
    try {
      const proxyAddress = await getPolymarketProxyAddress(calculatedAddress, signatureType);

      // 再次检查是否已取消
      if (signal.aborted) return;

      setProxyAddress(proxyAddress);
      // 自动填充代理地址到表单
      form.setFieldsValue({
        proxy_address: proxyAddress,
      });
    } catch (error) {
      // 如果请求被取消，不显示错误
      if (signal.aborted) return;

      secureLog.warn('获取Polymarket代理地址失败:', error);
      // 获取代理地址失败不影响钱包地址的显示，只显示错误toast
      message.error('获取Polymarket代理地址失败，请手动输入代理地址');
    }
  }, [form]);

  // 使用防抖包装处理函数（800ms延迟，减少RPC调用）
  const debouncedHandlePrivateKeyChange = useCallback(
    debounce((privateKey: string) => {
      handlePrivateKeyChangeInternal(privateKey);
    }, 800),
    [handlePrivateKeyChangeInternal]
  );

  // 处理私钥输入变化
  const handlePrivateKeyChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const privateKey = e.target.value.trim();
    debouncedHandlePrivateKeyChange(privateKey);
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

      // 验证API密钥字段（三个都是必填的）
      if (!values.api_key || !values.api_secret || !values.api_passphrase) {
        message.error('API密钥 (API Key)、API密钥 (API Secret) 和 API密码短语(api_passphrase) 都是必填项');
        setSubmitting(false);
        return;
      }

      // 构建上传数据（清理输入，IP地址不传，由后端自动填写）
      const secretToUpload: StoreSecretRequest = {
        key_name: sanitizeInput(values.key_name),
        active: true, // 默认激活
        server_name: sanitizeInput(values.key_name), // 服务器名称和密钥名称一致
        ip: '', // IP地址不传，后端根据请求IP自动填写
        proxy_address: proxyAddress || '', // 使用计算出的代理地址
        base_address: walletAddress || '', // 使用计算出的钱包地址作为基础地址
        wallet_type: values.wallet_type ? sanitizeInput(values.wallet_type) : getWalletTypeFromSignatureType(values.signature_type || 2),
        signature_type: values.signature_type !== undefined ? values.signature_type : 2,
      };

      // ExtraInfo：子项 tail_order_share，默认 100，范围 0-1000
      const tailOrderShare = Math.round(Number(values.tail_order_share ?? 100));
      secretToUpload.extra_info = JSON.stringify({ tail_order_share: tailOrderShare });

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

      // 安全清理：立即清除敏感数据
      form.resetFields();
      // 重置钱包地址相关状态
      setWalletAddress('');
      setProxyAddress('');
      // 强制清除私钥字段（防止浏览器自动填充）
      form.setFieldsValue({ private_key: '' });

      await loadSecrets();
    } catch (err: any) {
      message.error(getSafeErrorMessage(err, '上传失败'));
    } finally {
      setSubmitting(false);
    }
  };

  // 复制到剪贴板
  const handleCopy = (text: string, label: string) => {
    navigator.clipboard.writeText(text);
    message.success(`已复制${label}到剪贴板`);
  };

  // 格式化地址为 0x1234...1234 格式
  const formatAddress = (address: string): string => {
    if (!address || address.length < 10) return address;
    if (address.startsWith('0x')) {
      return `${address.substring(0, 6)}...${address.substring(address.length - 4)}`;
    }
    return address;
  };

  // 表格列定义
  const columns = [
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
      title: '基础地址',
      dataIndex: 'base_address',
      key: 'base_address',
      render: (text: string, record: any) => {
        if (!text) return '-';
        return (
          <Space>
            <Text
              code
              style={{
                fontFamily: 'monospace',
                cursor: 'pointer',
                userSelect: 'none',
              }}
              onClick={() => handleCopy(record.base_address, '基础地址')}
              onMouseEnter={(e) => {
                e.currentTarget.style.color = '#1890ff';
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.color = '';
              }}
            >
              {formatAddress(text)}
            </Text>
            <Button
              type="text"
              size="small"
              icon={<CopyOutlined />}
              onClick={() => handleCopy(record.base_address, '基础地址')}
              style={{ padding: 0, height: 'auto' }}
            />
          </Space>
        );
      },
    },
    {
      title: '代理地址',
      dataIndex: 'proxy_address',
      key: 'proxy_address',
      render: (text: string, record: any) => {
        if (!text) return '-';
        return (
          <Space>
            <Text
              code
              style={{
                fontFamily: 'monospace',
                cursor: 'pointer',
                userSelect: 'none',
                maxWidth: 200,
                display: 'inline-block',
              }}
              onClick={() => handleCopy(record.proxy_address, '代理地址')}
              onMouseEnter={(e) => {
                e.currentTarget.style.color = '#1890ff';
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.color = '';
              }}
              ellipsis={{ tooltip: record.proxy_address }}
            >
              {formatAddress(text)}
            </Text>
            <Button
              type="text"
              size="small"
              icon={<CopyOutlined />}
              onClick={() => handleCopy(record.proxy_address, '代理地址')}
              style={{ padding: 0, height: 'auto' }}
            />
          </Space>
        );
      },
      ellipsis: true,
    },
    {
      title: '钱包类型',
      dataIndex: 'wallet_type',
      key: 'wallet_type',
      render: (text: string) => text || '-',
    },
    {
      title: '创建时间',
      dataIndex: 'created_at',
      key: 'created_at',
      render: (date: string) => new Date(date).toLocaleString('zh-CN'),
      // 后端已按创建时间倒序返回，前端直接使用后端顺序
      // 保留sorter允许用户手动排序
      sorter: (a: any, b: any) => {
        const dateA = new Date(a.created_at).getTime();
        const dateB = new Date(b.created_at).getTime();
        return dateB - dateA; // 倒序：最新的在前
      },
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
              signature_type: 2, // 默认使用Safe类型（私钥钱包）
              wallet_type: 'safe',
              tail_order_share: 100, // ExtraInfo 子项，默认 100
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
                  label={
                    <Space>
                      <span>私钥</span>
                      <Space
                        style={{
                          color: '#ff4d4f',
                          fontSize: 13,
                          fontWeight: 500,
                          backgroundColor: '#fff2f0',
                          padding: '2px 8px',
                          borderRadius: 4,
                          border: '1px solid #ffccc7',
                          marginLeft: 8
                        }}
                      >
                        <ExclamationCircleOutlined style={{ fontSize: 14 }} />
                        <span>请确保周围环境安全后再显示私钥</span>
                      </Space>
                    </Space>
                  }
                  name="private_key"
                  tooltip="将自动加密存储，输入后会自动计算基础地址和Polymarket代理地址"
                >
                  <Input.Password
                    placeholder="secret"
                    iconRender={(visible) => (visible ? <EyeOutlined /> : <EyeInvisibleOutlined />)}
                    style={{ fontFamily: 'monospace' }}
                    onChange={handlePrivateKeyChange}
                    autoComplete="off"
                    autoCorrect="off"
                    autoCapitalize="off"
                    spellCheck={false}
                  />
                </Form.Item>
                <Form.Item
                  label="签名类型"
                  name="signature_type"
                  rules={[{ required: true, message: '请选择签名类型' }]}
                  tooltip="EOA: 裸钱包，代理地址等于基础地址；Proxy: 邮箱钱包；Safe: 私钥钱包"
                >
                  <Radio.Group onChange={handleSignatureTypeChange} buttonStyle="solid">
                    <Radio.Button value={0}>EOA (裸钱包)</Radio.Button>
                    <Radio.Button value={1}>Proxy (邮箱钱包)</Radio.Button>
                    <Radio.Button value={2}>Safe (私钥钱包)</Radio.Button>
                  </Radio.Group>
                </Form.Item>
                {/* 显示计算出的钱包地址和代理地址 */}
                {(walletAddress || proxyAddress) && (
                  <div style={{ marginBottom: 16, padding: '8px 12px', backgroundColor: '#f5f5f5', borderRadius: 4 }}>
                    {walletAddress && (
                      <div style={{ marginBottom: walletAddress && proxyAddress ? 8 : 0 }}>
                        <Text type="secondary" style={{ fontSize: 12 }}>基础地址: </Text>
                        <Text code style={{ fontFamily: 'monospace', fontSize: 12 }}>
                          {formatAddress(walletAddress)}
                        </Text>
                        <Button
                          type="text"
                          size="small"
                          icon={<CopyOutlined />}
                          onClick={() => handleCopy(walletAddress, '钱包地址')}
                          style={{ marginLeft: 8 }}
                        />
                      </div>
                    )}
                    {proxyAddress && (
                      <div>
                        <Text type="secondary" style={{ fontSize: 12 }}>代理地址: </Text>
                        <Text code style={{ fontFamily: 'monospace', fontSize: 12 }}>
                          {formatAddress(proxyAddress)}
                        </Text>
                        <Button
                          type="text"
                          size="small"
                          icon={<CopyOutlined />}
                          onClick={() => handleCopy(proxyAddress, '代理地址')}
                          style={{ marginLeft: 8 }}
                        />
                      </div>
                    )}
                  </div>
                )}
                <Form.Item name="wallet_type" hidden>
                  <Input />
                </Form.Item>
                <Form.Item name="server_name" hidden>
                  <Input />
                </Form.Item>
              </Col>

              {/* 右栏 - API密钥相关字段 */}
              <Col xs={24} lg={12}>
                <Form.Item
                  label="API密钥 (API Key)"
                  name="api_key"
                  rules={[{ required: true, message: '请输入API密钥 (API Key)' }]}
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
                  rules={[{ required: true, message: '请输入API密钥 (API Secret)' }]}
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
                  rules={[{ required: true, message: '请输入API密码短语(api_passphrase)' }]}
                  tooltip="明文存储"
                >
                  <Input.Password
                    placeholder="api_passphrase"
                    iconRender={(visible) => (visible ? <EyeOutlined /> : <EyeInvisibleOutlined />)}
                  />
                </Form.Item>
                <Form.Item
                  label="ExtraInfo - tail_order_share"
                  name="tail_order_share"
                  rules={[
                    { required: true, message: '请输入 tail_order_share' },
                    {
                      type: 'number',
                      min: 0,
                      max: 1000,
                      message: 'tail_order_share 需为 0-1000 的整数',
                    },
                  ]}
                  tooltip="尾单分成比例，0-1000 的整数，默认 100"
                >
                  <InputNumber
                    min={0}
                    max={1000}
                    step={1}
                    precision={0}
                    placeholder="100"
                    style={{ width: '100%' }}
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
      </Space>
    </div>
  );
}
