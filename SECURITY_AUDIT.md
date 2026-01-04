# 安全审计报告

**审计日期**: 2024年
**审计范围**: PolyKMS 前端应用
**审计人员**: AI Security Auditor

---

## 执行摘要

本次安全审计发现了 **14个安全风险**，其中：
- 🔴 **高风险**: 6个
- 🟡 **中风险**: 7个  
- 🟢 **低风险**: 1个

---

## 高风险问题 (Critical)

### 1. JWT Token 存储在 localStorage - XSS 攻击风险 ⚠️

**位置**: 
- `src/utils/api.ts:37` - Token存储
- `src/App.tsx:14` - Token读取
- `src/components/SecretManagement.tsx:83,199,269` - Token使用

**问题描述**:
```typescript
// 当前实现
localStorage.setItem('token', response.data.token);
const token = localStorage.getItem('token');
```

**风险**:
- localStorage 容易受到 XSS 攻击
- 恶意脚本可以读取 localStorage 中的 token
- 一旦 token 被窃取，攻击者可以完全控制用户账户

**建议**:
1. 使用 `httpOnly` cookie 存储 token（需要后端配合）
2. 或者使用 sessionStorage（关闭标签页后自动清除）
3. 实现 token 刷新机制
4. 添加 XSS 防护措施（CSP、输入验证等）

---

### 2. 密码明文传输 ⚠️

**位置**: 
- `src/components/Login.tsx:22` - 登录请求
- `src/components/Register.tsx:23,26` - 注册请求

**问题描述**:
```typescript
// 密码直接明文发送
await authAPI.login({ username, password });
await authAPI.register({ username, password, email });
```

**风险**:
- 如果未使用 HTTPS，密码可以被中间人攻击窃取
- 即使使用 HTTPS，明文传输也不符合最佳实践
- 浏览器历史记录可能保存明文密码

**建议**:
1. **必须使用 HTTPS**（见问题6）
2. 在前端对密码进行哈希（使用 bcrypt 或类似方案）
3. 或者使用 OAuth2/OIDC 等标准认证协议
4. 确保后端也进行密码哈希验证

---

### 3. API Key 和 Passphrase 明文存储和传输 ⚠️

**位置**: 
- `src/components/SecretManagement.tsx:119-125,225-231` - 明文传输
- `src/utils/api.ts:107,109` - 接口定义注释说明明文存储

**问题描述**:
```typescript
// 代码注释明确说明后端明文存储
// api_key?: string; // API密钥（明文，后端明文存储）
// api_passphrase?: string; // API密码短语（明文，后端明文存储）

// 前端直接发送明文
if (item.api_key || item.apiKey) {
  secret.api_key = item.api_key || item.apiKey; // 明文传输
}
```

**风险**:
- API 密钥和密码短语以明文形式传输和存储
- 如果数据库被泄露，这些敏感信息完全暴露
- 即使传输使用 HTTPS，存储明文也是严重风险

**建议**:
1. **后端必须加密存储** API key 和 passphrase
2. 前端传输时也应该加密（即使后端会再次加密）
3. 使用强加密算法（AES-256-GCM）
4. 考虑使用密钥管理系统（如 AWS KMS、HashiCorp Vault）

---

### 4. 缺少 HTTPS 强制 ⚠️

**位置**: 
- `src/utils/api.ts:10-22` - API URL 配置
- `src/components/WorkerStatus.tsx:142` - 直接使用 HTTP

**问题描述**:
```typescript
// 没有强制 HTTPS
const apiBaseUrl = getBackendUrl(); // 可能返回 http://

// WorkerStatus.tsx 中直接使用 HTTP
const url = `http://${ip}:8001/update`; // 硬编码 HTTP
```

**风险**:
- 敏感数据（密码、token、密钥）可能被中间人攻击窃取
- 不符合安全最佳实践
- 可能违反合规要求（如 PCI DSS）

**建议**:
1. **生产环境强制使用 HTTPS**
2. 添加 URL 验证，拒绝非 HTTPS 连接（生产环境）
3. 实现 HSTS（HTTP Strict Transport Security）
4. 修复 WorkerStatus.tsx 中的硬编码 HTTP

---

### 5. 直接使用 HTTP 协议访问工作机 ⚠️

**位置**: 
- `src/components/WorkerStatus.tsx:142`

**问题描述**:
```typescript
const url = `http://${ip}:8001/update`; // 硬编码 HTTP，无加密
```

**风险**:
- 文件上传使用未加密的 HTTP 连接
- 可能被中间人攻击
- 上传的文件内容可能被窃取或篡改

**建议**:
1. 使用 HTTPS 连接
2. 如果工作机不支持 HTTPS，考虑使用 VPN 或内网
3. 添加文件完整性验证（如 SHA-256 哈希）
4. 实现文件上传的加密传输

---

### 6. 缺少输入验证和清理 ⚠️

**位置**: 
- `src/components/Login.tsx` - 用户名/密码输入
- `src/components/Register.tsx` - 注册输入
- `src/components/SecretManagement.tsx` - 密钥输入

**问题描述**:
- 用户名、密码、密钥等输入字段缺少验证
- 没有长度限制
- 没有特殊字符过滤
- 没有 SQL 注入防护（虽然前端无法完全防护，但需要验证）

**风险**:
- XSS 攻击
- 注入攻击
- 缓冲区溢出（虽然 JavaScript 较少见）
- 恶意输入导致系统异常

**建议**:
1. 添加输入验证：
   - 用户名：长度、字符集限制
   - 密码：强度要求（长度、复杂度）
   - 密钥：格式验证
2. 实现输入清理和转义
3. 使用白名单验证而非黑名单
4. 后端也必须进行验证（前端验证可被绕过）

---

## 中风险问题 (Medium)

### 7. 控制台日志可能泄露敏感信息

**位置**: 
- `src/components/WorkerStatus.tsx:56,77,79,85,175,896`
- `src/utils/api.ts:19,59`
- `vite.config.ts:18,28,33,35`

**问题描述**:
```typescript
console.log('加载工作机状态响应:', response); // 可能包含敏感数据
console.error('405 Method Not Allowed:', { method, url, baseURL }); // 泄露URL信息
```

**风险**:
- 生产环境的控制台日志可能泄露敏感信息
- 攻击者可以通过浏览器开发者工具查看
- 可能泄露系统架构信息

**建议**:
1. 生产环境禁用或限制 console.log
2. 使用日志级别控制（开发环境 vs 生产环境）
3. 避免在日志中输出敏感数据（token、密码、密钥等）
4. 使用专业的日志管理工具

---

### 8. 缺少 CSRF 保护

**位置**: 
- `src/utils/api.ts` - API 请求

**问题描述**:
- 所有 API 请求只使用 JWT token，没有 CSRF token
- 如果 token 存储在 cookie 中，需要 CSRF 保护

**风险**:
- 跨站请求伪造攻击
- 恶意网站可以代表用户执行操作

**建议**:
1. 如果使用 cookie 存储 token，必须实现 CSRF 保护
2. 使用 CSRF token 或 SameSite cookie 属性
3. 验证 Referer 头
4. 使用双重提交 cookie 模式

---

### 9. 错误信息可能泄露系统信息

**位置**: 
- `src/utils/api.ts:51-69` - 错误处理
- `src/components/Login.tsx:25` - 错误显示
- `src/components/Register.tsx:32` - 错误显示

**问题描述**:
```typescript
setError(err.response?.data?.error || err.message || '登录失败');
// 可能返回详细的错误信息，泄露系统内部信息
```

**风险**:
- 错误信息可能泄露系统架构
- 可能泄露数据库结构
- 帮助攻击者了解系统弱点

**建议**:
1. 生产环境使用通用错误消息
2. 详细错误信息仅记录在服务器日志
3. 实现错误分类（用户错误 vs 系统错误）
4. 避免在错误消息中暴露文件路径、SQL 语句等

---

### 10. 缺少密码强度验证

**位置**: 
- `src/components/Register.tsx` - 注册表单
- `src/components/Login.tsx` - 登录表单（如果支持密码修改）

**问题描述**:
- 注册时没有密码强度要求
- 没有最小长度限制
- 没有复杂度要求（大小写、数字、特殊字符）

**风险**:
- 弱密码容易被暴力破解
- 用户账户安全性低

**建议**:
1. 实现密码强度验证：
   - 最小长度：8-12 字符
   - 包含大小写字母
   - 包含数字
   - 包含特殊字符
2. 实时显示密码强度指示器
3. 禁止常见弱密码（如 "password123"）
4. 考虑使用密码强度库（如 zxcvbn）

---

### 11. 缺少速率限制（前端）

**位置**: 
- `src/components/Login.tsx` - 登录请求
- `src/components/Register.tsx` - 注册请求

**问题描述**:
- 前端没有实现请求速率限制
- 可以快速连续发送登录请求（暴力破解）

**风险**:
- 暴力破解攻击
- 账户枚举攻击
- 资源消耗攻击（DoS）

**建议**:
1. **后端必须实现速率限制**（前端限制可被绕过）
2. 前端可以添加简单的防抖/节流
3. 实现验证码（登录失败多次后）
4. 账户锁定机制（多次失败后临时锁定）

---

### 12. 缺少内容安全策略 (CSP)

**位置**: 
- `index.html` - HTML 入口文件

**问题描述**:
- 没有设置 Content-Security-Policy 头
- 没有限制资源加载来源

**风险**:
- XSS 攻击
- 恶意脚本注入
- 数据泄露

**建议**:
1. 实现严格的 CSP 策略
2. 限制脚本来源
3. 禁止内联脚本（或使用 nonce）
4. 限制资源加载来源

---

### 13. 敏感字段使用 textarea 而非 password 类型

**位置**: 
- `src/components/SecretManagement.tsx:431-458` - 私钥和 API 密钥输入

**问题描述**:
```typescript
<textarea
  value={formData.private_key}
  // 不是 password 类型，内容可见
/>
```

**风险**:
- 虽然这是密钥输入，但使用 textarea 使得内容完全可见
- 容易被肩窥（shoulder surfing）
- 浏览器可能保存这些值到自动填充

**建议**:
1. 考虑使用 password 类型的 input（对于单行密钥）
2. 或者实现"显示/隐藏"切换按钮
3. 添加警告提示用户注意周围环境
4. 考虑使用虚拟键盘（对于高安全场景）

---

## 低风险问题 (Low)

### 14. 开发环境 SSL 证书验证被禁用

**位置**: 
- `vite.config.ts:13`

**问题描述**:
```typescript
secure: false, // 忽略 SSL 证书验证（开发环境）
```

**风险**:
- 开发环境可能受到中间人攻击
- 如果配置错误，可能影响生产环境

**建议**:
1. 仅在开发环境使用此配置
2. 确保生产环境严格验证 SSL 证书
3. 使用自签名证书时，明确标注为开发环境
4. 定期检查配置，确保不会误用于生产环境

---

## 安全建议总结

### 立即修复（高优先级）

1. ✅ **强制使用 HTTPS**（生产环境）
2. ✅ **修复 WorkerStatus.tsx 中的 HTTP 硬编码**
3. ✅ **后端加密存储 API key 和 passphrase**
4. ✅ **实现密码强度验证**
5. ✅ **添加输入验证和清理**

### 短期改进（中优先级）

6. ✅ **实现 CSRF 保护**
7. ✅ **优化错误处理，避免信息泄露**
8. ✅ **清理生产环境的控制台日志**
9. ✅ **实现内容安全策略 (CSP)**
10. ✅ **考虑使用 httpOnly cookie 存储 token**

### 长期改进（低优先级）

11. ✅ **实现 token 刷新机制**
12. ✅ **添加安全审计日志**
13. ✅ **实现多因素认证 (MFA)**
14. ✅ **定期安全扫描和渗透测试**

---

## 合规性检查

### OWASP Top 10 (2021) 对照

- ✅ **A01:2021 – Broken Access Control**: 部分问题（token 存储）
- ✅ **A02:2021 – Cryptographic Failures**: 严重问题（明文传输、存储）
- ✅ **A03:2021 – Injection**: 部分问题（缺少输入验证）
- ✅ **A04:2021 – Insecure Design**: 部分问题（整体安全设计）
- ✅ **A05:2021 – Security Misconfiguration**: 部分问题（CSP、HTTPS）
- ✅ **A07:2021 – Identification and Authentication Failures**: 严重问题（密码强度、速率限制）

---

## 测试建议

1. **渗透测试**: 建议进行专业的渗透测试
2. **代码审计**: 定期进行代码安全审计
3. **依赖扫描**: 使用工具扫描依赖漏洞（如 npm audit）
4. **自动化安全测试**: 集成到 CI/CD 流程

---

## 结论

当前代码存在多个**严重的安全风险**，特别是：
- 敏感数据明文传输和存储
- 缺少 HTTPS 强制
- Token 存储不安全

**建议立即修复高风险问题**，然后逐步改进中低风险问题。

---

**报告生成时间**: 2024年
**下次审计建议**: 修复后 1-3 个月

