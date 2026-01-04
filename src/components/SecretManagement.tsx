import { useState, useEffect } from 'react';
import { secretsAPI, StoreSecretRequest, ListSecretsResponse, Secret } from '../utils/api';
import { parseJWT, decryptSecret, encryptSecret } from '../utils/crypto';
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

  // 批量上传相关状态
  const [batchInput, setBatchInput] = useState('');
  const [uploading, setUploading] = useState(false);

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
    signature_type: 1,
  });
  const [submitting, setSubmitting] = useState(false);

  // 查询和解密相关状态
  const [selectedKeyName, setSelectedKeyName] = useState('');
  const [decryptedData, setDecryptedData] = useState<DecryptedSecretData | null>(null);
  const [decrypting, setDecrypting] = useState(false);

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

  // 批量上传密钥（支持JSON格式）
  const handleBatchUpload = async () => {
    if (!batchInput.trim()) {
      setError('请输入密钥数据');
      return;
    }

    setUploading(true);
    setError('');
    setSuccess('');

    try {
      const token = localStorage.getItem('token');
      if (!token) {
        setError('未找到登录token');
        return;
      }
      const clientKey = parseJWT(token);

      // 尝试解析为JSON数组
      let secretsToUpload: StoreSecretRequest[] = [];
      try {
        const jsonData = JSON.parse(batchInput);
        if (Array.isArray(jsonData)) {
          // JSON数组格式
          secretsToUpload = await Promise.all(
            jsonData.map(async (item) => {
              const secret: StoreSecretRequest = {
                key_name: item.key_name || item.keyName || '',
                active: item.active !== undefined ? item.active : true,
                server_name: item.server_name || item.serverName || '',
                ip: item.ip || item.IP || '',
                proxy_address: item.proxy_address || item.proxyAddress || '',
                wallet_type: item.wallet_type || item.walletType || '',
                signature_type: item.signature_type || item.signatureType || 1,
              };

              // 只加密需要后端加密存储的字段：private_key 和 api_secret
              if (item.private_key || item.privateKey) {
                secret.private_key = await encryptSecret(
                  item.private_key || item.privateKey,
                  clientKey
                );
              }
              if (item.api_secret || item.apiSecret) {
                secret.api_secret = await encryptSecret(item.api_secret || item.apiSecret, clientKey);
              }
              
              // api_key 和 api_passphrase 后端明文存储，前端直接发送明文
              if (item.api_key || item.apiKey) {
                secret.api_key = item.api_key || item.apiKey;
              }
              if (item.api_passphrase || item.apiPassphrase) {
                secret.api_passphrase = item.api_passphrase || item.apiPassphrase;
              }

              return secret;
            })
          );
        } else {
          throw new Error('JSON格式错误：必须是数组');
        }
      } catch (jsonError) {
        // 如果不是JSON，尝试解析为旧格式：key_name:value 或 key_name:value:description
        const lines = batchInput.trim().split('\n').filter(line => line.trim());
        for (const line of lines) {
          const parts = line.split(':').map(p => p.trim());
          if (parts.length < 2) {
            throw new Error(`格式错误: ${line}。支持JSON数组格式或 key_name:value 格式`);
          }

          const secret: StoreSecretRequest = {
            key_name: parts[0],
          };

          // 加密private_key
          if (parts[1]) {
            secret.private_key = await encryptSecret(parts[1], clientKey);
          }

          secretsToUpload.push(secret);
        }
      }

      if (secretsToUpload.length === 0) {
        setError('没有有效的密钥数据');
        return;
      }

      const result = await secretsAPI.storeSecretsBatch(secretsToUpload);
      
      if (result.failed.length > 0) {
        setError(`成功上传 ${result.success.length} 个，失败 ${result.failed.length} 个`);
        if (result.success.length > 0) {
          setSuccess(`成功: ${result.success.map(s => s.key_name).join(', ')}`);
        }
        const failedNames = result.failed.map(f => `${f.secret.key_name}: ${f.error}`).join('\n');
        setError((prev) => prev + '\n失败详情:\n' + failedNames);
      } else {
        setSuccess(`成功上传 ${result.success.length} 个密钥`);
        setError('');
        setBatchInput('');
        await loadSecrets();
      }
    } catch (err: any) {
      setError(err.message || '批量上传失败');
    } finally {
      setUploading(false);
    }
  };

  // 单个密钥上传
  const handleSubmitSecret = async () => {
    if (!formData.key_name) {
      setError('密钥名称不能为空');
      return;
    }

    if (!formData.private_key && !formData.api_key && !formData.api_secret && !formData.api_passphrase) {
      setError('至少需要提供私钥、api_key、api_secret或api_passphrase中的一个');
      return;
    }

    setSubmitting(true);
    setError('');
    setSuccess('');

    try {
      const token = localStorage.getItem('token');
      if (!token) {
        setError('未找到登录token');
        return;
      }
      const clientKey = parseJWT(token);

      // 构建上传数据
      const secretToUpload: StoreSecretRequest = {
        key_name: formData.key_name,
        active: formData.active !== undefined ? formData.active : true,
        server_name: formData.server_name || '',
        ip: formData.ip || '',
        proxy_address: formData.proxy_address || '',
        wallet_type: formData.wallet_type || '',
        signature_type: formData.signature_type || 1,
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
        signature_type: 1,
      });
      setShowAddForm(false);
      await loadSecrets();
    } catch (err: any) {
      setError(err.response?.data?.error || err.message || '上传失败');
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
      setError(err.message || '获取或解密失败');
    } finally {
      setDecrypting(false);
    }
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
              <div className="form-group">
                <label>IP地址</label>
                <input
                  type="text"
                  value={formData.ip}
                  onChange={(e) => setFormData({ ...formData, ip: e.target.value })}
                  placeholder="例如: 192.168.1.100"
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
              <div className="form-group">
                <label>钱包类型</label>
                <input
                  type="text"
                  value={formData.wallet_type}
                  onChange={(e) => setFormData({ ...formData, wallet_type: e.target.value })}
                  placeholder="例如: EOA"
                />
              </div>
              <div className="form-group">
                <label>签名类型</label>
                <input
                  type="number"
                  value={formData.signature_type || 1}
                  onChange={(e) => setFormData({ ...formData, signature_type: parseInt(e.target.value) || 1 })}
                  placeholder="例如: 1"
                />
              </div>
            </div>
            <div className="form-row">
              <div className="form-group">
                <label>私钥 *</label>
                <textarea
                  value={formData.private_key}
                  onChange={(e) => setFormData({ ...formData, private_key: e.target.value })}
                  placeholder="私钥（将自动加密存储）"
                  rows={2}
                />
              </div>
            </div>
            <div className="form-row">
              <div className="form-group">
                <label>API密钥 (API Key)</label>
                <textarea
                  value={formData.api_key}
                  onChange={(e) => setFormData({ ...formData, api_key: e.target.value })}
                  placeholder="API密钥（明文存储）"
                  rows={2}
                />
              </div>
            </div>
            <div className="form-row">
              <div className="form-group">
                <label>API密钥 (API Secret)</label>
                <textarea
                  value={formData.api_secret}
                  onChange={(e) => setFormData({ ...formData, api_secret: e.target.value })}
                  placeholder="API密钥Secret（将自动加密存储）"
                  rows={2}
                />
              </div>
            </div>
            <div className="form-row">
              <div className="form-group">
                <label>API密码短语</label>
                <input
                  type="password"
                  value={formData.api_passphrase}
                  onChange={(e) => setFormData({ ...formData, api_passphrase: e.target.value })}
                  placeholder="API密码短语（明文存储）"
                />
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

      {/* 批量上传区域 */}
      <div className="section">
        <h2>批量上传密钥</h2>
        <p className="section-description">
          支持JSON数组格式或旧格式（每行一个密钥）：
          <br />
          <code>key_name:value</code> 或 JSON数组格式
        </p>
        <textarea
          className="batch-input"
          value={batchInput}
          onChange={(e) => setBatchInput(e.target.value)}
          placeholder={`JSON格式示例：
[{
  "key_name": "server_001",
  "server_name": "server_001",
  "ip": "192.168.1.100",
  "private_key": "0x1234...",
  "wallet_type": "EOA"
}]

或旧格式：
my_key1:0x1234567890abcdef`}
          rows={12}
          disabled={uploading}
        />
        <button
          onClick={handleBatchUpload}
          disabled={uploading || !batchInput.trim()}
          className="btn-primary"
        >
          {uploading ? '上传中...' : '批量上传'}
        </button>
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

