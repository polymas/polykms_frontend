# 环境配置说明

## 概述

PolyKMS前端应用支持两种环境模式：**测试环境**和**生产环境**。测试环境会在页面顶部显示醒目的警告横幅，防止用户误操作导致私钥丢失或泄露。

## 环境变量配置

### 必需的环境变量

在项目根目录创建 `.env` 文件：

```env
# 环境配置（必须）
# 可选值: test, production
# 默认为 test（测试环境）
VITE_ENVIRONMENT=test

# API基础URL（可选）
# 如果设置了代理，可以留空
VITE_API_BASE_URL=http://localhost:8080
```

### 环境变量说明

| 变量名 | 必需 | 默认值 | 说明 |
|--------|------|--------|------|
| `VITE_ENVIRONMENT` | 是 | `test` | 环境类型：`test` 或 `production` |
| `VITE_API_BASE_URL` | 否 | `http://localhost:8080` | API服务器地址 |

## 环境特性对比

### 测试环境 (test)

**特点**：
- ✅ 页面顶部显示红色警告横幅
- ✅ 提醒用户不要使用真实私钥
- ✅ 适合开发和测试使用
- ✅ 数据可能被清理或重置

**警告横幅内容**：
> ⚠️ **测试环境警告**  
> 当前为测试环境，请勿使用真实私钥！测试环境数据可能被清理或重置，使用真实私钥可能导致私钥丢失或泄露。

**使用场景**：
- 本地开发
- 功能测试
- 演示环境
- 预发布环境

### 生产环境 (production)

**特点**：
- ✅ 不显示警告横幅
- ✅ 干净的界面，无干扰
- ✅ 用于正式生产环境
- ✅ 数据持久化存储

**使用场景**：
- 正式生产环境
- 用户实际使用环境

## 配置示例

### 开发环境配置

`.env.development`:
```env
VITE_ENVIRONMENT=test
VITE_API_BASE_URL=http://localhost:8080
```

### 生产环境配置

`.env.production`:
```env
VITE_ENVIRONMENT=production
VITE_API_BASE_URL=https://api.example.com
```

## 构建不同环境

### 方式1: 使用环境文件

Vite会自动加载对应的环境文件：

```bash
# 开发环境（自动加载 .env.development）
npm run dev

# 生产环境（自动加载 .env.production）
npm run build
```

### 方式2: 命令行指定

```bash
# 构建测试环境
VITE_ENVIRONMENT=test npm run build

# 构建生产环境
VITE_ENVIRONMENT=production npm run build
```

## 代码中使用环境变量

```typescript
import { getEnvironment, isTestEnvironment, isProductionEnvironment } from './utils/env';

// 获取当前环境
const env = getEnvironment(); // 'test' | 'production'

// 判断是否为测试环境
if (isTestEnvironment()) {
  console.log('当前为测试环境');
}

// 判断是否为生产环境
if (isProductionEnvironment()) {
  console.log('当前为生产环境');
}
```

## 安全建议

1. **测试环境**：
   - 永远不要使用真实私钥
   - 使用测试数据或假数据
   - 定期清理测试数据

2. **生产环境**：
   - 确保环境变量正确配置
   - 使用HTTPS连接
   - 定期备份数据
   - 监控异常行为

3. **环境切换**：
   - 切换环境前确认配置正确
   - 测试环境切换后验证警告横幅显示
   - 生产环境部署前进行充分测试

## 故障排查

### 警告横幅未显示

1. 检查 `.env` 文件是否存在
2. 确认 `VITE_ENVIRONMENT=test`
3. 重启开发服务器
4. 检查浏览器控制台是否有错误

### 环境变量未生效

1. 确认变量名以 `VITE_` 开头
2. 重启开发服务器
3. 清除浏览器缓存
4. 检查 `.env` 文件格式是否正确

### 生产环境仍显示警告

1. 确认 `VITE_ENVIRONMENT=production`
2. 重新构建项目
3. 检查构建产物中的环境变量

## 最佳实践

1. **版本控制**：
   - 将 `.env.example` 提交到仓库
   - 不要提交实际的 `.env` 文件（已添加到.gitignore）

2. **团队协作**：
   - 统一环境变量命名规范
   - 文档化环境配置要求
   - 使用环境文件模板

3. **CI/CD**：
   - 在CI/CD中设置环境变量
   - 区分不同环境的构建配置
   - 自动化环境验证

