# PolyKMS 前端应用

这是 PolyKMS 密钥管理系统的前端应用，使用 React + TypeScript + Vite 构建。

## 功能特性

- ✅ 用户注册和登录
- ✅ JWT Token 认证
- ✅ 批量上传密钥
- ✅ 查询当前账户下的密钥列表
- ✅ 获取密文密钥并解密显示

## 快速开始

### 1. 安装依赖

```bash
cd frontend
npm install
```

### 2. 配置API地址

创建 `.env` 文件（可选，默认使用 `http://localhost:8080`）：

```env
VITE_API_BASE_URL=http://localhost:8080
```

### 3. 启动开发服务器

```bash
npm run dev
```

应用将在 `http://localhost:3000` 启动。

### 4. 构建生产版本

```bash
npm run build
```

构建产物在 `dist` 目录。

## 使用说明

### 注册和登录

1. 首次使用需要注册账号
2. 注册成功后会自动登录
3. 登录后可以访问密钥管理功能

### 批量上传密钥

在"批量上传密钥"区域，输入密钥数据，格式为：
- 每行一个密钥
- 格式：`key_name:value` 或 `key_name:value:description`
- 示例：
  ```
  my_key1:0x1234567890abcdef
  my_key2:0xabcdef1234567890:这是第二个密钥
  ```

### 查询密钥

1. 在"我的密钥列表"中查看所有密钥
2. 点击"获取并解密"按钮获取密钥的密文并自动解密
3. 解密后的明文会显示在页面底部，可以复制使用

## 技术栈

- **React 18** - UI框架
- **TypeScript** - 类型安全
- **Vite** - 构建工具
- **Axios** - HTTP客户端
- **Web Crypto API** - 密钥解密

## 项目结构

```
frontend/
├── src/
│   ├── components/          # React组件
│   │   ├── Login.tsx       # 登录组件
│   │   ├── Register.tsx    # 注册组件
│   │   └── SecretManagement.tsx  # 密钥管理组件
│   ├── utils/              # 工具函数
│   │   ├── api.ts          # API服务层
│   │   └── crypto.ts       # 加密解密工具
│   ├── App.tsx             # 主应用组件
│   └── main.tsx           # 入口文件
├── package.json
├── vite.config.ts
└── tsconfig.json
```

## API说明

前端通过以下API与后端交互：

- `POST /api/v1/auth/register` - 注册
- `POST /api/v1/auth/login` - 登录
- `POST /api/v1/secrets` - 存储密钥
- `GET /api/v1/secrets` - 列出所有密钥
- `GET /api/v1/secrets/:key_name` - 获取单个密钥

所有需要认证的API都会自动在请求头中添加 `Authorization: Bearer <token>`。

## 密钥解密流程

1. 从JWT Token中解析出 `client_key`
2. 调用API获取加密的密钥值（base64编码）
3. 使用 `client_key` 通过 AES-GCM 解密得到明文
4. 显示解密后的明文

## 注意事项

- Token存储在localStorage中，刷新页面后仍保持登录状态
- Token过期后需要重新登录
- 密钥解密使用浏览器原生的 Web Crypto API，确保安全性

