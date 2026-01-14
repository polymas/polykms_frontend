# Vercel 部署配置说明

## 路由配置（解决404问题）

项目已包含 `vercel.json` 配置文件，用于解决SPA（单页应用）路由的404问题。

### 问题说明

当直接访问子路由（如 `/secrets`、`/workers`）时，Vercel会尝试查找对应的文件或目录，找不到就会返回404。这是因为React Router是客户端路由，需要将所有路由请求重定向到 `index.html`，让React Router来处理路由。

### 解决方案

`vercel.json` 配置文件会将所有路由请求重写到 `index.html`：

```json
{
  "rewrites": [
    {
      "source": "/(.*)",
      "destination": "/index.html"
    }
  ]
}
```

### 注意事项

1. **静态资源**：Vercel会自动处理静态资源（JS、CSS、图片等），不会被重写规则影响
2. **API请求**：生产环境中，API请求会直接发送到后端服务器（通过 `VITE_API_BASE_URL`），不会经过Vercel的重写规则
3. **开发环境**：开发环境使用Vite代理，不受此配置影响

## 环境变量配置

### 问题说明

当部署到 Vercel 时，Vite 的构建模式（`import.meta.env.MODE`）会自动设置为 `production`，但这**不会**影响我们的环境判断逻辑。

我们的环境判断逻辑：
- 只有在**明确设置** `VITE_ENVIRONMENT=production` 时，才会返回生产环境
- 如果没有设置 `VITE_ENVIRONMENT`，默认返回 `test`（显示测试环境警告）

## 在 Vercel 中配置环境变量

### 方式 1: 通过 Vercel Dashboard

1. 登录 [Vercel Dashboard](https://vercel.com/dashboard)
2. 选择你的项目
3. 进入 **Settings** → **Environment Variables**
4. 添加环境变量：
   - **Name**: `VITE_ENVIRONMENT`
   - **Value**: 
     - `test` - 显示测试环境警告（推荐用于预览/测试部署）
     - `production` - 不显示警告（用于正式生产环境）
   - **Environment**: 选择适用的环境（Production, Preview, Development）

### 方式 2: 通过 Vercel CLI

```bash
# 设置测试环境（显示警告）
vercel env add VITE_ENVIRONMENT production
# 输入值: test

# 设置生产环境（不显示警告）
vercel env add VITE_ENVIRONMENT production
# 输入值: production
```

## 推荐配置

### 测试/预览环境
```
VITE_ENVIRONMENT=test
```
- ✅ 显示测试环境警告
- ✅ 提醒用户不要使用真实私钥
- ✅ 适合预览部署和测试

### 生产环境
```
VITE_ENVIRONMENT=production
```
- ✅ 不显示警告横幅
- ✅ 干净的界面
- ✅ 用于正式生产环境

## 注意事项

1. **环境变量必须以 `VITE_` 开头**，Vite 才会在构建时注入
2. **修改环境变量后需要重新部署**，环境变量是在构建时注入的
3. **不同环境可以设置不同的值**：
   - Production 环境：`VITE_ENVIRONMENT=production`
   - Preview 环境：`VITE_ENVIRONMENT=test`
   - Development 环境：`VITE_ENVIRONMENT=test`

## 验证配置

部署后，检查页面是否显示测试环境警告：
- 如果设置了 `VITE_ENVIRONMENT=test`，应该显示红色警告横幅
- 如果设置了 `VITE_ENVIRONMENT=production`，不应该显示警告横幅
- 如果没有设置，默认显示警告横幅（安全起见）

## 故障排查

### 警告横幅未显示（期望显示）

1. 检查 Vercel 环境变量设置
2. 确认 `VITE_ENVIRONMENT=test`
3. 重新部署项目
4. 清除浏览器缓存

### 警告横幅显示了（期望不显示）

1. 检查 Vercel 环境变量设置
2. 确认 `VITE_ENVIRONMENT=production`
3. 重新部署项目
4. 清除浏览器缓存

## 示例配置

### 场景 1: 所有环境都显示警告（测试部署）

在 Vercel Dashboard 中设置：
- **Production**: `VITE_ENVIRONMENT=test`
- **Preview**: `VITE_ENVIRONMENT=test`
- **Development**: `VITE_ENVIRONMENT=test`

### 场景 2: 生产环境不显示警告，预览环境显示警告

在 Vercel Dashboard 中设置：
- **Production**: `VITE_ENVIRONMENT=production`
- **Preview**: `VITE_ENVIRONMENT=test`
- **Development**: `VITE_ENVIRONMENT=test`



