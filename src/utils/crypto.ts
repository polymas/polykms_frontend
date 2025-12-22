/**
 * JWT解析和密钥解密工具函数
 */

/**
 * 解析JWT Token，提取client_key
 */
export function parseJWT(token: string): string {
  try {
    const parts = token.split('.');
    if (parts.length !== 3) {
      throw new Error('无效的 JWT Token 格式');
    }

    // 解码 payload（第二部分）
    let payload = parts[1];
    // 添加 padding
    payload += '='.repeat((4 - (payload.length % 4)) % 4);
    const decoded = atob(payload.replace(/-/g, '+').replace(/_/g, '/'));
    const claims = JSON.parse(decoded);

    if (!claims.client_key) {
      throw new Error('JWT Token 中未找到 client_key');
    }

    return claims.client_key;
  } catch (error) {
    throw new Error(`解析 JWT Token 失败: ${error instanceof Error ? error.message : String(error)}`);
  }
}

/**
 * 使用客户端密钥解密密文
 * @param encryptedBase64 base64编码的密文
 * @param clientKeyBase64 base64编码的客户端密钥
 * @returns 解密后的明文
 */
export async function decryptSecret(
  encryptedBase64: string,
  clientKeyBase64: string
): Promise<string> {
  try {
    // 解码 base64
    const encrypted = Uint8Array.from(atob(encryptedBase64), c => c.charCodeAt(0));
    const key = Uint8Array.from(atob(clientKeyBase64), c => c.charCodeAt(0));

    // 检查密钥长度
    if (key.length !== 32) {
      throw new Error(`客户端密钥长度错误: 期望 32 字节，实际 ${key.length} 字节`);
    }

    // 提取 nonce（前 12 字节）和密文
    if (encrypted.length < 12) {
      throw new Error('密文太短');
    }

    const nonce = encrypted.slice(0, 12);
    const ciphertext = encrypted.slice(12);

    // 使用 Web Crypto API 进行 AES-GCM 解密
    const cryptoKey = await crypto.subtle.importKey(
      'raw',
      key,
      { name: 'AES-GCM' },
      false,
      ['decrypt']
    );

    const decrypted = await crypto.subtle.decrypt(
      {
        name: 'AES-GCM',
        iv: nonce,
      },
      cryptoKey,
      ciphertext
    );

    return new TextDecoder().decode(decrypted);
  } catch (error) {
    throw new Error(`解密失败: ${error instanceof Error ? error.message : String(error)}`);
  }
}

