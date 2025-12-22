import { isTestEnvironment } from '../utils/env';
import './EnvironmentBanner.css';

export default function EnvironmentBanner() {
  const isTest = isTestEnvironment();
  
  // 开发模式下，如果没有明确设置为 production，始终显示警告
  if (!isTest) {
    return null;
  }

  return (
    <div className="environment-banner">
      <div className="environment-banner-content">
        <div className="environment-banner-icon">⚠️</div>
        <div className="environment-banner-text">
          <strong>测试环境警告</strong>
          <span>
            当前为测试环境，请勿使用真实私钥！测试环境数据可能被清理或重置，使用真实私钥可能导致私钥丢失或泄露。
          </span>
        </div>
      </div>
    </div>
  );
}

