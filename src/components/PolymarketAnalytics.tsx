import { Card, Typography } from 'antd';
import { BarChartOutlined } from '@ant-design/icons';

const { Title, Paragraph } = Typography;

/**
 * Polymarket 数据分析页占位组件。
 * 保证构建时该模块存在，避免 Vercel 等环境因缺少文件导致 build 失败。
 * 完整实现可后续替换此文件或通过动态路由加载。
 */
export default function PolymarketAnalytics() {
  return (
    <div style={{ maxWidth: 960, margin: '0 auto' }}>
      <Card>
        <div style={{ textAlign: 'center', padding: '48px 24px' }}>
          <BarChartOutlined style={{ fontSize: 48, color: '#bfbfbf', marginBottom: 16 }} />
          <Title level={3}>Polymarket 数据分析</Title>
          <Paragraph type="secondary">功能即将上线</Paragraph>
        </div>
      </Card>
    </div>
  );
}
