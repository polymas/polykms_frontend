import { useEffect, useRef, useState } from 'react';
import { Tag, Tooltip } from 'antd';
import { workersAPI, ShareSnapshotGroup, StrategyShareSnapshot } from '../utils/api';

/**
 * 策略下注份额面板（工作机监控页，仅管理员）。
 *
 * 回答三个问题：
 *  1. worker 现在拿到的分母可不可用（ready / 预热中 / 过期）；
 *  2. 每个分组的 live 分母和兜底分母各是多少、由谁构成；
 *  3. 哪些机器没被计入、为什么。
 *
 * 样式在 WorkerStatus.css 里，限定在 .worker-status-container 下，沿用该页的 --ws-* 变量。
 */

const REFRESH_MS = 10_000;
/** 与后端 strategyShareScaleTolerance 一致：上报份额与配置份额偏差超过该比例视为量纲不一致 */
const SCALE_TOLERANCE = 0.2;

const GROUP_LABELS: Record<string, string> = {
  S2: '尾盘下注',
};

const REASON_LABELS: Record<string, string> = {
  inactive: '已停用',
  not_online: '不在线或上报过期',
  pending: '等下一轮快照',
  not_reported: '未上报',
};

const fmtShare = (v: number | undefined): string =>
  (v ?? 0).toLocaleString('en-US', { maximumFractionDigits: 2 });

const fmtPercent = (v: number): string =>
  `${(v * 100).toLocaleString('en-US', { maximumFractionDigits: 1 })}%`;

function fmtClock(iso?: string): string {
  if (!iso) return '-';
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? '-' : d.toLocaleTimeString('zh-CN', { hour12: false });
}

function GroupBlock({ group }: { group: ShareSnapshotGroup }) {
  const members = [...(group.members ?? [])].sort((a, b) => b.share - a.share);
  const excluded = [...(group.excluded ?? [])].sort((a, b) => b.share - a.share);
  const estimatedCount = members.filter((m) => m.estimated).length;

  const total = group.total_share ?? 0;
  const fallback = group.default_total_share ?? 0;
  const reported = group.reported_share ?? 0;
  const estimated = group.estimated_share ?? 0;

  // 占比条以较大的那个分母为满格：正常是兜底分母；上报份额超过配置份额时是 live 分母
  const barMax = Math.max(total, fallback);
  const reportedPct = barMax > 0 ? (reported / barMax) * 100 : 0;
  const estimatedPct = barMax > 0 ? (estimated / barMax) * 100 : 0;
  const idle = Math.max(fallback - total, 0);

  const configOfReporters = group.reported_config_share ?? 0;
  const deviation = configOfReporters > 0 ? reported / configOfReporters - 1 : 0;
  const scaleMismatch = configOfReporters > 0 && Math.abs(deviation) > SCALE_TOLERANCE;

  const label = GROUP_LABELS[group.strategy_group];

  return (
    <section className="share-group" aria-label={`分组 ${group.strategy_group}`}>
      <div className="share-group-head">
        <h3 className="share-group-name">
          {group.strategy_group}
          {label && <span className="share-group-alias">{label}</span>}
        </h3>
        <dl className="share-metrics">
          <div className="share-metric">
            <dt>
              <Tooltip title="worker 在 ready 时使用的分母：真实上报的份额，加上按配置份额估算计入的老版本 worker">
                <span>live 总份额</span>
              </Tooltip>
            </dt>
            <dd>{fmtShare(total)}</dd>
          </div>
          <div className="share-metric">
            <dt>
              <Tooltip title="分组内 active=1 机器的配置份额之和，含离线机器。KMS 刚重启或 worker 刚启动时用它做分母；0 表示该分组没有配置来源">
                <span>兜底总份额</span>
              </Tooltip>
            </dt>
            <dd>{fallback > 0 ? fmtShare(fallback) : <span className="share-muted">无</span>}</dd>
          </div>
          <div className="share-metric">
            <dt>计入机器</dt>
            <dd>
              {members.length}
              {estimatedCount > 0 && <span className="share-metric-note">其中估算 {estimatedCount}</span>}
            </dd>
          </div>
          <div className="share-metric">
            <dt>未计入</dt>
            <dd>{excluded.length}</dd>
          </div>
        </dl>
      </div>

      {/* 占比条对比的是 live 与兜底分母；没有兜底来源的分组画出来只会是一整条，没有信息量 */}
      {fallback > 0 && (
        <div className="share-bar-wrap">
          <div
            className="share-bar"
            role="img"
            aria-label={`上报 ${fmtShare(reported)}，估算 ${fmtShare(estimated)}，未在线 ${fmtShare(idle)}`}
          >
            <span className="share-bar-seg share-bar-reported" style={{ width: `${reportedPct}%` }} />
            <span className="share-bar-seg share-bar-estimated" style={{ width: `${estimatedPct}%` }} />
          </div>
          <ul className="share-legend">
            <li><i className="share-dot share-bar-reported" />上报 {fmtShare(reported)}</li>
            {estimated > 0 && (
              <li><i className="share-dot share-bar-estimated" />估算（老版本 worker）{fmtShare(estimated)}</li>
            )}
            {idle > 0 && <li><i className="share-dot share-bar-idle" />配置了但未在线 {fmtShare(idle)}</li>}
          </ul>
        </div>
      )}

      {scaleMismatch && (
        <p className="share-warning" role="alert">
          {`上报份额 ${fmtShare(reported)} 与这些机器的配置份额 ${fmtShare(configOfReporters)} 偏差 ${deviation > 0 ? '+' : ''}${fmtPercent(deviation)}。`}
          {'兜底分母和老版本 worker 的估算都按配置份额计，偏差这么大说明两者量纲不一致，兜底分母不可信，请核对 worker 上报的 expected_share。'}
        </p>
      )}

      <details className="share-details">
        <summary>成员明细（计入 {members.length} · 未计入 {excluded.length}）</summary>
        <div className="share-tables">
          <div className="share-table-scroll">
            <table className="share-table">
              <caption>计入分母</caption>
              <thead>
                <tr>
                  <th scope="col">密钥名称</th>
                  <th scope="col" className="share-num">份额</th>
                  <th scope="col" className="share-num">占比</th>
                  <th scope="col">来源</th>
                </tr>
              </thead>
              <tbody>
                {members.length === 0 && (
                  <tr><td colSpan={4} className="share-empty-cell">暂无</td></tr>
                )}
                {members.map((m) => (
                  <tr key={m.secret_id}>
                    <td>
                      {m.key_name || `#${m.secret_id}`}
                      {(m.accounts ?? 0) > 1 && (
                        <Tooltip title="一个进程管多个账号：共用同一 IP 的一组点击审批密钥算一台机器，份额是各账号之和，这一行用其中 ID 最小的密钥代表整机">
                          <span className="share-accounts">整机 {m.accounts} 个账号</span>
                        </Tooltip>
                      )}
                    </td>
                    <td className="share-num">{fmtShare(m.share)}</td>
                    <td className="share-num">{total > 0 ? fmtPercent(m.share / total) : '-'}</td>
                    <td>
                      {m.estimated
                        ? <Tag color="gold">估算</Tag>
                        : <Tag color="green">上报</Tag>}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {excluded.length > 0 && (
            <div className="share-table-scroll">
              <table className="share-table">
                <caption>未计入</caption>
                <thead>
                  <tr>
                    <th scope="col">密钥名称</th>
                    <th scope="col" className="share-num">上报份额</th>
                    <th scope="col">原因</th>
                  </tr>
                </thead>
                <tbody>
                  {excluded.map((e) => (
                    <tr key={e.secret_id}>
                      <td>{e.key_name || `#${e.secret_id}`}</td>
                      <td className="share-num">{fmtShare(e.share)}</td>
                      <td>{REASON_LABELS[e.reason] ?? e.reason}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </details>
    </section>
  );
}

export default function StrategySharePanel() {
  const [snapshot, setSnapshot] = useState<StrategyShareSnapshot | null>(null);
  const [stale, setStale] = useState(false);
  // 首次请求就失败（非管理员 403、老后端 404）时整个面板不渲染，不打扰页面
  const [unavailable, setUnavailable] = useState(false);
  const loadedOnce = useRef(false);

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      try {
        const data = await workersAPI.getShareSnapshot();
        if (cancelled) return;
        loadedOnce.current = true;
        setSnapshot(data);
        setStale(false);
      } catch {
        if (cancelled) return;
        if (loadedOnce.current) setStale(true);
        else setUnavailable(true);
      }
    };
    load();
    const id = setInterval(load, REFRESH_MS);
    return () => {
      cancelled = true;
      clearInterval(id);
    };
  }, []);

  if (unavailable || !snapshot) return null;

  const groups = Object.values(snapshot.groups ?? {}).sort((a, b) =>
    a.strategy_group.localeCompare(b.strategy_group, 'en', { numeric: true }),
  );

  let stateTag = <Tag color="green">可用</Tag>;
  let stateHint = 'worker 使用 live 占比（ratio）';
  if (!snapshot.ready) {
    if (snapshot.warmup || !snapshot.computed_at) {
      stateTag = <Tag color="gold">预热中</Tag>;
      stateHint = 'KMS 刚启动，上报还没到齐；worker 此时改用兜底分母，约一分钟后恢复';
    } else {
      stateTag = <Tag color="red">快照过期</Tag>;
      stateHint = '快照超过 30 秒没有刷新；worker 此时改用兜底分母，请检查服务日志';
    }
  }

  return (
    <section className="share-panel" aria-label="策略下注份额">
      <header className="share-panel-head">
        <h2 className="share-panel-title">策略份额</h2>
        {stateTag}
        <span className="share-panel-hint">{stateHint}</span>
        <span className="share-panel-time">
          快照 {fmtClock(snapshot.computed_at)}
          {stale && <span className="share-stale"> · 刷新失败，显示的是旧数据</span>}
        </span>
      </header>
      {groups.length === 0 ? (
        <p className="share-empty">
          还没有 worker 上报策略份额，也没有带配置份额的活跃机器。worker 升级到协议 v1.2.0 并上报 strategies 后这里会出现分组。
        </p>
      ) : (
        groups.map((g) => <GroupBlock key={g.strategy_group} group={g} />)
      )}
    </section>
  );
}
