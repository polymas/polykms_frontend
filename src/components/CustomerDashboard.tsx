/**
 * 客户看板占位页（后续接入 polyuser 的 Dashboard/持仓/动态/账户管理）
 * 仅 role 为 customer 或 admin 时可访问
 */
import { Card } from 'antd';

export default function CustomerDashboard() {
  return (
    <div>
      <Card title="客户看板" style={{ marginBottom: 16 }}>
        <p>此处将接入资产总览、持仓、动态与账户管理（参考 polyuser）。</p>
        <p>请先配置后端快照与持仓聚合接口后，再迁移 polyuser 看板组件。</p>
      </Card>
    </div>
  );
}
