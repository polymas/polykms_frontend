import { useState, useEffect } from 'react';
import { secretsAPI, StoreSecretRequest, ListSecretsResponse } from '../utils/api';
import { parseJWT, decryptSecret } from '../utils/crypto';
import './SecretManagement.css';

export default function SecretManagement() {
  const [secrets, setSecrets] = useState<ListSecretsResponse['secrets']>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  // 批量上传相关状态
  const [batchInput, setBatchInput] = useState('');
  const [uploading, setUploading] = useState(false);

  // 查询和解密相关状态
  const [selectedKeyName, setSelectedKeyName] = useState('');
  const [decryptedValue, setDecryptedValue] = useState('');
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

  // 批量上传密钥
  const handleBatchUpload = async () => {
    if (!batchInput.trim()) {
      setError('请输入密钥数据');
      return;
    }

    setUploading(true);
    setError('');
    setSuccess('');

    try {
      // 解析输入：支持每行一个密钥，格式为 key_name:value 或 key_name:value:description
      const lines = batchInput.trim().split('\n').filter(line => line.trim());
      const secretsToUpload: StoreSecretRequest[] = [];

      for (const line of lines) {
        const parts = line.split(':').map(p => p.trim());
        if (parts.length < 2) {
          throw new Error(`格式错误: ${line}。格式应为 key_name:value 或 key_name:value:description`);
        }

        secretsToUpload.push({
          key_name: parts[0],
          value: parts[1],
          description: parts[2] || '',
        });
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

  // 获取并解密密文
  const handleGetAndDecrypt = async (keyName: string) => {
    setSelectedKeyName(keyName);
    setDecryptedValue('');
    setDecrypting(true);
    setError('');

    try {
      // 获取加密的密钥
      const secret = await secretsAPI.getSecret(keyName);
      
      if (!secret.value) {
        setError('该密钥没有值');
        return;
      }

      // 从localStorage获取token
      const token = localStorage.getItem('token');
      if (!token) {
        setError('未找到登录token');
        return;
      }

      // 解析JWT获取client_key
      const clientKey = parseJWT(token);

      // 解密
      const decrypted = await decryptSecret(secret.value, clientKey);
      setDecryptedValue(decrypted);
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

      {/* 批量上传区域 */}
      <div className="section">
        <h2>批量上传密钥</h2>
        <p className="section-description">
          每行一个密钥，格式：<code>key_name:value</code> 或 <code>key_name:value:description</code>
        </p>
        <textarea
          className="batch-input"
          value={batchInput}
          onChange={(e) => setBatchInput(e.target.value)}
          placeholder="例如：&#10;my_key1:0x1234567890abcdef&#10;my_key2:0xabcdef1234567890:这是第二个密钥"
          rows={8}
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
                  <th>描述</th>
                  <th>状态</th>
                  <th>创建时间</th>
                  <th>操作</th>
                </tr>
              </thead>
              <tbody>
                {secrets.map((secret) => (
                  <tr key={secret.id}>
                    <td>{secret.key_name}</td>
                    <td>{secret.description || '-'}</td>
                    <td>
                      <span className={`status-badge status-${secret.status}`}>
                        {secret.status}
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
      {decryptedValue && (
        <div className="section">
          <h2>解密结果 - {selectedKeyName}</h2>
          <div className="decrypted-value">
            <code>{decryptedValue}</code>
            <button
              onClick={() => {
                navigator.clipboard.writeText(decryptedValue);
                setSuccess('已复制到剪贴板');
              }}
              className="btn-small"
            >
              复制
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

