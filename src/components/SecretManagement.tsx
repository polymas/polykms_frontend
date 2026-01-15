import { useState, useEffect } from 'react';
import { secretsAPI, StoreSecretRequest, ListSecretsResponse, Secret } from '../utils/api';
import { parseJWT, decryptSecret, encryptSecret } from '../utils/crypto';
import { validateKeyName, validateIP, validateProxyAddress, sanitizeInput } from '../utils/validation';
import { getSafeErrorMessage } from '../utils/security';
import './SecretManagement.css';

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
  const [secrets, setSecrets] = useState<ListSecretsResponse['secrets']>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  // 单个密钥上传表单状态
  const [showAddForm, setShowAddForm] = useState(false);
  const [formData, setFormData] = useState<StoreSecretRequest>({
    key_name: '',
    active: true,
    server_name: '',
    ip: '',
    proxy_address: '',
    api_key: '',
    api_secret: '',
    api_passphrase: '',
    private_key: '',
    wallet_type: '',
    signature_type: 0,
  });
  const [submitting, setSubmitting] = useState(false);
  
  // 签名类型多选状态（0=EOA, 1=email, 2=key）
  const [selectedSignatureTypes, setSelectedSignatureTypes] = useState<number[]>([]);

  // 查询和解密相关状态
  const [selectedKeyName, setSelectedKeyName] = useState('');
  const [decryptedData, setDecryptedData] = useState<DecryptedSecretData | null>(null);
  const [decrypting, setDecrypting] = useState(false);

  // Toast 提示状态
  const [toast, setToast] = useState<{ message: string; type: 'success' | 'error' } | null>(null);

  // 敏感字段显示/隐藏状态
  const [showPrivateKey, setShowPrivateKey] = useState(false);
  const [showApiKey, setShowApiKey] = useState(false);
  const [showApiSecret, setShowApiSecret] = useState(false);
  const [showApiPassphrase, setShowApiPassphrase] = useState(false);

  // 加载密钥列表
  const loadSecrets = async () => {
    setLoading(true);
    setError('');
    try {
      const response = await secretsAPI.listSecrets();
      // 确保 secrets 始终是数组，防止 undefined 错误
      setSecrets(response?.secrets || []);
    } catch (err: any) {
      setError(err.response?.data?.error || err.message || '加载密钥列表失败');
      // 发生错误时，确保 secrets 是空数组
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
  const handleSignatureTypeChange = (signatureType: number, checked: boolean) => {
    let newSelectedTypes: number[];
    if (checked) {
      newSelectedTypes = [...selectedSignatureTypes, signatureType];
    } else {
      newSelectedTypes = selectedSignatureTypes.filter(t => t !== signatureType);
    }
    setSelectedSignatureTypes(newSelectedTypes);
    
    // 如果选择了类型，使用最新选择的类型（如果取消选择，使用剩余的第一个）
    if (newSelectedTypes.length > 0) {
      // 如果刚选择了一个类型，使用它；否则使用第一个
      const typeToUse = checked ? signatureType : newSelectedTypes[0];
      setFormData({
        ...formData,
        signature_type: typeToUse,
        wallet_type: getWalletTypeFromSignatureType(typeToUse),
      });
    } else {
      setFormData({
        ...formData,
        signature_type: 0,
        wallet_type: '',
      });
    }
  };

  // 单个密钥上传
  const handleSubmitSecret = async () => {
    setError('');
    setSuccess('');

    // 输入验证
    const keyNameValidation = validateKeyName(formData.key_name);
    if (!keyNameValidation.valid) {
      setError(keyNameValidation.error || '密钥名称验证失败');
      return;
    }

    if (!formData.private_key && !formData.api_key && !formData.api_secret && !formData.api_passphrase) {
      setError('至少需要提供私钥、api_key、api_secret或api_passphrase中的一个');
      return;
    }

    // 验证签名类型
    if (selectedSignatureTypes.length === 0) {
      setError('请至少选择一个签名类型');
      return;
    }

    // 代理地址验证
    if (formData.proxy_address) {
      const proxyValidation = validateProxyAddress(formData.proxy_address);
      if (!proxyValidation.valid) {
        setError(proxyValidation.error || '代理地址格式不正确');
        return;
      }
    }

    setSubmitting(true);

    try {
      const token = localStorage.getItem('token');
      if (!token) {
        setError('未找到登录token');
        setSubmitting(false);
        return;
      }
      const clientKey = parseJWT(token);

      // 构建上传数据（清理输入，IP地址不传，由后端自动填写）
      const secretToUpload: StoreSecretRequest = {
        key_name: sanitizeInput(formData.key_name),
        active: formData.active !== undefined ? formData.active : true,
        server_name: formData.server_name ? sanitizeInput(formData.server_name) : '',
        ip: '', // IP地址不传，后端根据请求IP自动填写
        proxy_address: formData.proxy_address || '',
        wallet_type: formData.wallet_type ? sanitizeInput(formData.wallet_type) : '',
        signature_type: formData.signature_type || 0,
      };

      // 只加密需要后端加密存储的字段：private_key 和 api_secret
      if (formData.private_key) {
        secretToUpload.private_key = await encryptSecret(formData.private_key, clientKey);
      }
      if (formData.api_secret) {
        secretToUpload.api_secret = await encryptSecret(formData.api_secret, clientKey);
      }
      
      // api_key 和 api_passphrase 后端明文存储，前端直接发送明文
      if (formData.api_key) {
        secretToUpload.api_key = formData.api_key;
      }
      if (formData.api_passphrase) {
        secretToUpload.api_passphrase = formData.api_passphrase;
      }

      await secretsAPI.storeSecret(secretToUpload);
      setSuccess('密钥上传成功');
      setFormData({
        key_name: '',
        active: true,
        server_name: '',
        ip: '',
        proxy_address: '',
        api_key: '',
        api_secret: '',
        api_passphrase: '',
        private_key: '',
        wallet_type: '',
        signature_type: 0,
      });
      setSelectedSignatureTypes([]);
      setShowAddForm(false);
      await loadSecrets();
    } catch (err: any) {
      setError(getSafeErrorMessage(err, '上传失败'));
    } finally {
      setSubmitting(false);
    }
  };

  // 获取并解密密文
  const handleGetAndDecrypt = async (keyName: string) => {
    setSelectedKeyName(keyName);
    setDecryptedData(null);
    setDecrypting(true);
    setError('');

    try {
      // 获取加密的密钥
      const secret: Secret = await secretsAPI.getSecret(keyName);
      
      // 从localStorage获取token
      const token = localStorage.getItem('token');
      if (!token) {
        setError('未找到登录token');
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
      setSuccess('解密成功');
    } catch (err: any) {
      // 如果是403错误，显示toast提示
      if (err?.response?.status === 403) {
        showToast('无访问权限', 'error');
        setError('');
      } else {
        setError(getSafeErrorMessage(err, '获取或解密失败'));
      }
    } finally {
      setDecrypting(false);
    }
  };

  // 显示 Toast 提示
  const showToast = (message: string, type: 'success' | 'error' = 'success') => {
    setToast({ message, type });
    setTimeout(() => {
      setToast(null);
    }, 3000); // 3秒后自动消失
  };

  // 登出
  const handleLogout = () => {
    localStorage.removeItem('token');
    window.location.reload();
  };

  return (
    <div className="secret-management">
      <div className="header">
        <h1>密钥管理</h1>
        <button onClick={handleLogout} className="btn-secondary">
          登出
        </button>
      </div>

      {/* Toast 提示 */}
      {toast && (
        <div className={`toast toast-${toast.type}`}>
          {toast.message}
        </div>
      )}

      {error && <div className="alert alert-error">{error}</div>}
      {success && <div className="alert alert-success">{success}</div>}

      {/* 单个密钥上传表单 */}
      <div className="section">
        <div className="section-header">
          <h2>添加密钥</h2>
          <button
            onClick={() => setShowAddForm(!showAddForm)}
            className="btn-secondary"
          >
            {showAddForm ? '收起' : '展开表单'}
          </button>
        </div>
        {showAddForm && (
          <div className="secret-form">
            <div className="form-row">
              <div className="form-group">
                <label>密钥名称 *</label>
                <input
                  type="text"
                  value={formData.key_name}
                  onChange={(e) => setFormData({ ...formData, key_name: e.target.value })}
                  placeholder="例如: server_001"
                />
              </div>
              <div className="form-group">
                <label>是否激活</label>
                <input
                  type="checkbox"
                  checked={formData.active}
                  onChange={(e) => setFormData({ ...formData, active: e.target.checked })}
                />
              </div>
            </div>
            <div className="form-row">
              <div className="form-group">
                <label>服务器名称</label>
                <input
                  type="text"
                  value={formData.server_name}
                  onChange={(e) => setFormData({ ...formData, server_name: e.target.value })}
                  placeholder="例如: server_001"
                />
              </div>
            </div>
            <div className="form-row">
              <div className="form-group">
                <label>代理地址</label>
                <input
                  type="text"
                  value={formData.proxy_address}
                  onChange={(e) => setFormData({ ...formData, proxy_address: e.target.value })}
                  placeholder="代理地址"
                />
              </div>
            </div>
            <div className="form-row">
              <div className="form-group">
                <label>签名类型 *</label>
                <div className="signature-type-buttons">
                  <label className="signature-type-button">
                    <input
                      type="checkbox"
                      checked={selectedSignatureTypes.includes(0)}
                      onChange={(e) => handleSignatureTypeChange(0, e.target.checked)}
                    />
                    <span>EOA (0)</span>
                  </label>
                  <label className="signature-type-button">
                    <input
                      type="checkbox"
                      checked={selectedSignatureTypes.includes(1)}
                      onChange={(e) => handleSignatureTypeChange(1, e.target.checked)}
                    />
                    <span>Email (1)</span>
                  </label>
                  <label className="signature-type-button">
                    <input
                      type="checkbox"
                      checked={selectedSignatureTypes.includes(2)}
                      onChange={(e) => handleSignatureTypeChange(2, e.target.checked)}
                    />
                    <span>Key (2)</span>
                  </label>
                </div>
                <div className="form-hint">
                  钱包类型将根据选择的签名类型自动设置
                </div>
              </div>
            </div>
            <div className="form-row">
              <div className="form-group">
                <label>私钥 *</label>
                <div className="password-input-wrapper">
                  <textarea
                    value={showPrivateKey ? formData.private_key : (formData.private_key ? '•'.repeat(Math.min(formData.private_key.length, 50)) : '')}
                    onChange={(e) => {
                      if (showPrivateKey) {
                        setFormData({ ...formData, private_key: e.target.value });
                      }
                    }}
                    placeholder="私钥（将自动加密存储）"
                    rows={2}
                    style={{ fontFamily: 'monospace' }}
                    className={showPrivateKey ? '' : 'password-masked'}
                  />
                  <button
                    type="button"
                    className="toggle-password"
                    onClick={() => setShowPrivateKey(!showPrivateKey)}
                    title={showPrivateKey ? '隐藏' : '显示'}
                  >
                    {showPrivateKey ? '👁️' : '👁️‍🗨️'}
                  </button>
                </div>
                <div className="input-warning">⚠️ 请确保周围环境安全后再显示私钥</div>
              </div>
            </div>
            <div className="form-row">
              <div className="form-group">
                <label>API密钥 (API Key)</label>
                <div className="password-input-wrapper">
                  <textarea
                    value={showApiKey ? formData.api_key : (formData.api_key ? '•'.repeat(Math.min(formData.api_key.length, 50)) : '')}
                    onChange={(e) => {
                      if (showApiKey) {
                        setFormData({ ...formData, api_key: e.target.value });
                      }
                    }}
                    placeholder="API密钥（明文存储）"
                    rows={2}
                    style={{ fontFamily: 'monospace' }}
                    className={showApiKey ? '' : 'password-masked'}
                  />
                  <button
                    type="button"
                    className="toggle-password"
                    onClick={() => setShowApiKey(!showApiKey)}
                    title={showApiKey ? '隐藏' : '显示'}
                  >
                    {showApiKey ? '👁️' : '👁️‍🗨️'}
                  </button>
                </div>
              </div>
            </div>
            <div className="form-row">
              <div className="form-group">
                <label>API密钥 (API Secret)</label>
                <div className="password-input-wrapper">
                  <textarea
                    value={showApiSecret ? formData.api_secret : (formData.api_secret ? '•'.repeat(Math.min(formData.api_secret.length, 50)) : '')}
                    onChange={(e) => {
                      if (showApiSecret) {
                        setFormData({ ...formData, api_secret: e.target.value });
                      }
                    }}
                    placeholder="API密钥Secret（将自动加密存储）"
                    rows={2}
                    style={{ fontFamily: 'monospace' }}
                    className={showApiSecret ? '' : 'password-masked'}
                  />
                  <button
                    type="button"
                    className="toggle-password"
                    onClick={() => setShowApiSecret(!showApiSecret)}
                    title={showApiSecret ? '隐藏' : '显示'}
                  >
                    {showApiSecret ? '👁️' : '👁️‍🗨️'}
                  </button>
                </div>
              </div>
            </div>
            <div className="form-row">
              <div className="form-group">
                <label>API密码短语</label>
                <div className="password-input-wrapper">
                  <input
                    type={showApiPassphrase ? 'text' : 'password'}
                    value={formData.api_passphrase}
                    onChange={(e) => setFormData({ ...formData, api_passphrase: e.target.value })}
                    placeholder="API密码短语（明文存储）"
                  />
                  <button
                    type="button"
                    className="toggle-password"
                    onClick={() => setShowApiPassphrase(!showApiPassphrase)}
                    title={showApiPassphrase ? '隐藏' : '显示'}
                  >
                    {showApiPassphrase ? '👁️' : '👁️‍🗨️'}
                  </button>
                </div>
              </div>
            </div>
            <button
              onClick={handleSubmitSecret}
              disabled={submitting || !formData.key_name}
              className="btn-primary"
            >
              {submitting ? '提交中...' : '提交'}
            </button>
          </div>
        )}
      </div>

      {/* 密钥列表 */}
      <div className="section">
        <div className="section-header">
          <h2>我的密钥列表</h2>
          <button onClick={loadSecrets} disabled={loading} className="btn-secondary">
            {loading ? '刷新中...' : '刷新'}
          </button>
        </div>
        {loading ? (
          <div className="loading">加载中...</div>
        ) : !secrets || secrets.length === 0 ? (
          <div className="empty-state">暂无密钥</div>
        ) : (
          <div className="secrets-table">
            <table>
              <thead>
                <tr>
                  <th>密钥名称</th>
                  <th>服务器名称</th>
                  <th>IP地址</th>
                  <th>代理地址</th>
                  <th>钱包类型</th>
                  <th>激活</th>
                  <th>创建时间</th>
                  <th>操作</th>
                </tr>
              </thead>
              <tbody>
                {secrets.map((secret) => (
                  <tr key={secret.id}>
                    <td>{secret.key_name}</td>
                    <td>{secret.server_name || '-'}</td>
                    <td>{secret.ip || '-'}</td>
                    <td className="text-truncate" title={secret.proxy_address || ''}>
                      {secret.proxy_address ? `${secret.proxy_address.substring(0, 20)}...` : '-'}
                    </td>
                    <td>{secret.wallet_type || '-'}</td>
                    <td>
                      <span className={`status-badge ${secret.active ? 'status-active' : 'status-inactive'}`}>
                        {secret.active ? '激活' : '未激活'}
                      </span>
                    </td>
                    <td>{new Date(secret.created_at).toLocaleString('zh-CN')}</td>
                    <td>
                      <button
                        onClick={() => handleGetAndDecrypt(secret.key_name)}
                        disabled={decrypting && selectedKeyName === secret.key_name}
                        className="btn-small"
                      >
                        {decrypting && selectedKeyName === secret.key_name
                          ? '解密中...'
                          : '获取并解密'}
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* 解密结果显示 */}
      {decryptedData && (
        <div className="section">
          <h2>解密结果 - {selectedKeyName}</h2>
          <div className="decrypted-data">
            <div className="data-grid">
              {decryptedData.server_name && (
                <div className="data-item">
                  <label>服务器名称:</label>
                  <code>{decryptedData.server_name}</code>
                </div>
              )}
              {decryptedData.ip && (
                <div className="data-item">
                  <label>IP地址:</label>
                  <code>{decryptedData.ip}</code>
                </div>
              )}
              {decryptedData.proxy_address && (
                <div className="data-item">
                  <label>代理地址:</label>
                  <code>{decryptedData.proxy_address}</code>
                </div>
              )}
              {decryptedData.wallet_type && (
                <div className="data-item">
                  <label>钱包类型:</label>
                  <code>{decryptedData.wallet_type}</code>
                </div>
              )}
              {decryptedData.signature_type !== undefined && (
                <div className="data-item">
                  <label>签名类型:</label>
                  <code>{decryptedData.signature_type}</code>
                </div>
              )}
              {decryptedData.private_key && (
                <div className="data-item full-width">
                  <label>私钥:</label>
                  <div className="secret-value">
                    <code>{decryptedData.private_key}</code>
                    <button
                      onClick={() => {
                        navigator.clipboard.writeText(decryptedData.private_key!);
                        setSuccess('已复制私钥到剪贴板');
                      }}
                      className="btn-small"
                    >
                      复制
                    </button>
                  </div>
                </div>
              )}
              {decryptedData.api_key && (
                <div className="data-item full-width">
                  <label>API密钥 (API Key):</label>
                  <div className="secret-value">
                    <code>{decryptedData.api_key}</code>
                    <button
                      onClick={() => {
                        navigator.clipboard.writeText(decryptedData.api_key!);
                        setSuccess('已复制API密钥到剪贴板');
                      }}
                      className="btn-small"
                    >
                      复制
                    </button>
                  </div>
                </div>
              )}
              {decryptedData.api_secret && (
                <div className="data-item full-width">
                  <label>API密钥 (API Secret):</label>
                  <div className="secret-value">
                    <code>{decryptedData.api_secret}</code>
                    <button
                      onClick={() => {
                        navigator.clipboard.writeText(decryptedData.api_secret!);
                        setSuccess('已复制API密钥Secret到剪贴板');
                      }}
                      className="btn-small"
                    >
                      复制
                    </button>
                  </div>
                </div>
              )}
              {decryptedData.api_passphrase && (
                <div className="data-item">
                  <label>API密码短语:</label>
                  <div className="secret-value">
                    <code>{decryptedData.api_passphrase}</code>
                    <button
                      onClick={() => {
                        navigator.clipboard.writeText(decryptedData.api_passphrase!);
                        setSuccess('已复制API密码短语到剪贴板');
                      }}
                      className="btn-small"
                    >
                      复制
                    </button>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

