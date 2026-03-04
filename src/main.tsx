import React from 'react'
import ReactDOM from 'react-dom/client'
import { ConfigProvider, theme } from 'antd'
import zhCN from 'antd/locale/zh_CN'
import App from './App'
import 'antd/dist/reset.css'
import './App.css'

// PolyDash 风格：浅色主题 + 统一 token
const appTheme = {
  algorithm: theme.defaultAlgorithm,
  token: {
    colorPrimary: '#3b82f6',
    colorSuccess: '#22c55e',
    colorError: '#ef4444',
    colorWarning: '#f59e0b',
    borderRadius: 8,
    colorBgContainer: '#ffffff',
    colorBgElevated: '#ffffff',
    colorBorder: 'rgba(0,0,0,0.06)',
    colorText: '#1e293b',
    colorTextSecondary: '#64748b',
  },
}

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <ConfigProvider locale={zhCN} theme={appTheme}>
      <App />
    </ConfigProvider>
  </React.StrictMode>,
)
