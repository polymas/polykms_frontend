/**
 * 客户看板：仿 onchain_data/web 的暗色主题布局
 * 左侧：钱包/分组列表（搜索 + 排序）
 * 右侧：选中钱包/分组的统计 + 图表 + PnL 日历 + 持仓明细
 */
import { useEffect, useState, useMemo } from 'react';
import {
  Line,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  ComposedChart,
} from 'recharts';
import {
  dashboardAPI,
  dashboardOverviewAPI,
  activityAPI,
  onchainAPI,
  parseDailyProfit,
  getRole,
  type DashboardWalletItem,
  type OnchainEquityResponse,
  type OnchainPosition,
} from '../utils/api';
import './CustomerDashboard.css';

/* ── helpers ── */
const fmt = (n: number | null | undefined) => {
  if (n == null) return '-';
  const s = n < 0 ? '-' : '';
  const a = Math.abs(n);
  if (a >= 1000) return s + '$' + a.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  return s + '$' + a.toFixed(2);
};
const fmtShort = (n: number | null | undefined) => {
  if (n == null) return '-';
  const s = n < 0 ? '-' : '';
  const a = Math.abs(n);
  if (a >= 1e6) return s + '$' + (a / 1e6).toFixed(1) + 'M';
  if (a >= 1e3) return s + '$' + (a / 1e3).toFixed(1) + 'K';
  return s + '$' + a.toFixed(0);
};
const addrShort = (w: string) => w.length > 10 ? w.slice(0, 6) + '...' + w.slice(-4) : w;

/** ISO 时间格式化为本地简短可读 */
function fmtLocalISO(iso: string | undefined): string {
  if (!iso) return '';
  try {
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return iso;
    return d.toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' });
  } catch {
    return iso;
  }
}

/* ── Group aggregation type ── */
type GroupInfo = {
  group: string;
  pnl: number;
  total_buy: number;
  wins: number;
  losses: number;
  wallet_count: number;
  total_assets: number;
  wallets: string[];
};

/* ── Daily point for PnL calendar ── */
type DailyPoint = { date: string; day_pnl: number };

/* ── PnL Calendar (heatmap style, ported from onchain_data/web) ── */
function PnlCalendar({ dailyData }: { dailyData: DailyPoint[] }) {
  if (!dailyData || dailyData.length === 0)
    return <div style={{ color: 'var(--dash-text2)', fontSize: 13, padding: '20px 0', textAlign: 'center' }}>No daily PnL data available</div>;

  // 1. Build PnL map with gap filling
  const pnlMap: Record<string, number> = {};
  for (const d of dailyData) pnlMap[d.date] = d.day_pnl || 0;
  if (dailyData.length >= 2) {
    const f = new Date(dailyData[0].date + 'T00:00:00');
    const l = new Date(dailyData[dailyData.length - 1].date + 'T00:00:00');
    const c = new Date(f);
    while (c <= l) {
      const ds = c.toISOString().slice(0, 10);
      if (!(ds in pnlMap)) pnlMap[ds] = 0;
      c.setDate(c.getDate() + 1);
    }
  }

  // 2. Compute stats + streak tracking
  const sortedDates = Object.keys(pnlMap).sort();
  let maxAbs = 0, profitDays = 0, lossDays = 0, bestDay = 0, worstDay = 0;
  let bestDate = '', worstDate = '', maxStreak = 0;
  const dateStreak: Record<string, number> = {};
  let pStreak = 0, lStreak = 0;
  const rolling7: Record<string, number> = {};
  const window: number[] = [];
  let rollingSum = 0;

  for (const date of sortedDates) {
    const dp = pnlMap[date];
    if (dp > 0) { profitDays++; pStreak++; lStreak = 0; dateStreak[date] = pStreak; }
    else if (dp < 0) { lossDays++; lStreak++; pStreak = 0; dateStreak[date] = -lStreak; }
    else { pStreak = 0; lStreak = 0; dateStreak[date] = 0; }
    if (pStreak > maxStreak) maxStreak = pStreak;
    if (dp > bestDay) { bestDay = dp; bestDate = date; }
    if (dp < worstDay) { worstDay = dp; worstDate = date; }
    if (Math.abs(dp) > maxAbs) maxAbs = Math.abs(dp);
    window.push(dp); rollingSum += dp;
    if (window.length > 7) rollingSum -= window.shift()!;
    rolling7[date] = rollingSum / Math.min(window.length, 7);
  }
  const totalDays = profitDays + lossDays;
  const winPct = totalDays > 0 ? (profitDays / totalDays * 100).toFixed(0) : '0';
  const absVals = sortedDates.map(d => Math.abs(pnlMap[d])).filter(v => v > 0).sort((a, b) => a - b);
  const p90 = absVals.length > 0 ? absVals[Math.floor(absVals.length * 0.9)] : maxAbs;
  const overallAvg = sortedDates.length > 0 ? sortedDates.reduce((s, d) => s + pnlMap[d], 0) / sortedDates.length : 0;
  const lastDate7 = sortedDates.slice(-7);
  const recent7Avg = lastDate7.length > 0 ? lastDate7.reduce((s, d) => s + pnlMap[d], 0) / lastDate7.length : 0;
  const momentum = recent7Avg - overallAvg;

  // 3. Perceptual color (sqrt scale)
  const greenLevels = ['#0e4429', '#006d32', '#1a8c43', '#26a641', '#39d353'];
  const redLevels = ['#4a1e1e', '#6e2b2b', '#9e3333', '#c73a3a', '#f85149'];
  const noDataColor = 'rgba(255,255,255,0.02)';
  function pnlColor(val: number) {
    if (val === 0) return noDataColor;
    const t = maxAbs > 0 ? Math.sqrt(Math.min(Math.abs(val) / maxAbs, 1)) : 0;
    const idx = t < 0.2 ? 0 : t < 0.4 ? 1 : t < 0.6 ? 2 : t < 0.8 ? 3 : 4;
    return val > 0 ? greenLevels[idx] : redLevels[idx];
  }

  // 4. Build week grid
  const firstDate = new Date(dailyData[0].date + 'T00:00:00');
  const lastDate = new Date(dailyData[dailyData.length - 1].date + 'T00:00:00');
  const start = new Date(firstDate);
  const dow = start.getDay();
  start.setDate(start.getDate() - (dow === 0 ? 6 : dow - 1));
  const end = new Date(lastDate);
  const edow = end.getDay();
  if (edow !== 0) end.setDate(end.getDate() + (7 - edow));

  type WeekDay = { date: string; pnl: number | undefined; month: number; day: number };
  const weeks: WeekDay[][] = [];
  const cur = new Date(start);
  let weekDays: WeekDay[] = [];
  while (cur <= end) {
    const dateStr = cur.toISOString().slice(0, 10);
    weekDays.push({ date: dateStr, pnl: pnlMap[dateStr], month: cur.getMonth(), day: cur.getDate() });
    if (weekDays.length === 7) { weeks.push(weekDays); weekDays = []; }
    cur.setDate(cur.getDate() + 1);
  }
  if (weekDays.length) weeks.push(weekDays);

  // 5. Month labels
  const monthNames = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  const monthLabels: { col: number; label: string }[] = [];
  let lastMonth = -1;
  for (let wi = 0; wi < weeks.length; wi++) {
    const firstDayOfWeek = weeks[wi].find(d => d.day <= 7) || weeks[wi][0];
    const m = firstDayOfWeek.month;
    if (m !== lastMonth && firstDayOfWeek.day <= 7) {
      lastMonth = m;
      monthLabels.push({ col: wi * 2 + 1, label: monthNames[m] });
    }
  }

  function cellVal(v: number) {
    if (v === 0) return '0.00';
    const abs = Math.abs(v);
    const s = abs >= 10000 ? (abs / 1000).toFixed(0) + 'k' : abs >= 1000 ? (abs / 1000).toFixed(1) + 'k' : abs.toFixed(2);
    return v < 0 ? '-' + s : s;
  }

  const momColor = momentum >= 0 ? 'var(--dash-green)' : 'var(--dash-red)';
  const momArrow = momentum >= 0 ? '\u2191' : '\u2193';
  const momLabel = Math.abs(momentum) < 0.01 ? 'Flat' : `${momArrow} ${Math.abs(momentum).toFixed(2)}/d`;

  return (
    <>
      {/* Stat cards */}
      <div className="polydash-cal-stats">
        <div className="polydash-cal-stat">
          <span className="cal-stat-label">Day Win Rate</span>
          <span className="cal-stat-value" style={{ color: +winPct >= 50 ? 'var(--dash-green)' : 'var(--dash-red)' }}>{winPct}%</span>
          <span className="cal-stat-sub">{profitDays} up / {lossDays} down days</span>
        </div>
        <div className="polydash-cal-stat">
          <span className="cal-stat-label">Best Day</span>
          <span className="cal-stat-value" style={{ color: 'var(--dash-green)' }}>+{fmt(bestDay)}</span>
          <span className="cal-stat-sub">{bestDate}</span>
        </div>
        <div className="polydash-cal-stat">
          <span className="cal-stat-label">Worst Day</span>
          <span className="cal-stat-value" style={{ color: 'var(--dash-red)' }}>{fmt(worstDay)}</span>
          <span className="cal-stat-sub">{worstDate}</span>
        </div>
        <div className="polydash-cal-stat">
          <span className="cal-stat-label">Best Streak</span>
          <span className="cal-stat-value" style={{ color: 'var(--dash-green)' }}>{maxStreak}d</span>
          <span className="cal-stat-sub">consecutive wins</span>
        </div>
        <div className="polydash-cal-stat">
          <span className="cal-stat-label">Momentum</span>
          <span className="cal-stat-value" style={{ color: momColor }}>{momLabel}</span>
          <span className="cal-stat-sub">7d avg vs overall</span>
        </div>
      </div>

      {/* Heatmap */}
      <div className="polydash-cal-wrap">
        <div className="polydash-cal-graph">
          <div className="polydash-cal-day-labels">
            {['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'].map(l => <span key={l}>{l}</span>)}
          </div>
          <div className="polydash-cal-weeks">
            <div className="polydash-cal-months-row" style={{ display: 'grid', gridTemplateColumns: `repeat(${weeks.length * 2}, 30px)`, gap: 0, marginBottom: 6 }}>
              {monthLabels.map((ml, i) => (
                <span key={i} className="polydash-cal-month-label" style={{ gridColumn: ml.col }}>{ml.label}</span>
              ))}
            </div>
            <div className="polydash-cal-weeks-inner">
              {weeks.map((week, wi) => {
                let weekSum = 0;
                let weekActive = 0;
                const cells = week.map((d, ri) => {
                  const inRange = new Date(d.date + 'T00:00:00') >= firstDate && new Date(d.date + 'T00:00:00') <= lastDate;
                  if (d.pnl !== undefined) {
                    weekSum += d.pnl;
                    weekActive++;
                    const bg = pnlColor(d.pnl);
                    const sign = d.pnl >= 0 ? '+' : '';
                    const tipColor = d.pnl >= 0 ? '#3fb950' : '#f85149';
                    const valColor = d.pnl > 0 ? '#c3e6c3' : d.pnl < 0 ? '#f0b0ad' : 'rgba(255,255,255,0.25)';
                    const tipClass = ri <= 1 ? 'polydash-cal-tip tip-below' : 'polydash-cal-tip';
                    const sk = dateStreak[d.date] || 0;
                    let streakCls = '';
                    if (sk >= 2) streakCls = ' streak-g';
                    else if (sk <= -2) streakCls = ' streak-r';
                    let extremeCls = '';
                    if (Math.abs(d.pnl) >= p90 && d.pnl !== 0) {
                      extremeCls = d.pnl > 0 ? ' extreme-g' : ' extreme-r';
                    }
                    const r7 = rolling7[d.date] || 0;
                    const skAbs = Math.abs(sk);
                    const ctxParts = [`7d avg: ${r7 >= 0 ? '+' : ''}${r7.toFixed(2)}`];
                    if (skAbs >= 2) ctxParts.push(`${skAbs}-day ${sk > 0 ? 'win' : 'loss'} streak`);

                    return (
                      <div key={ri} className={`polydash-cal-cell${streakCls}${extremeCls}`} style={{ background: bg }}>
                        <span className="cal-day-num">{d.day}</span>
                        <span className="cal-val" style={{ color: valColor }}>{cellVal(d.pnl)}</span>
                        <div className={tipClass}>
                          <div className="tip-pnl" style={{ color: tipColor }}>{sign}${Math.abs(d.pnl).toFixed(2)}</div>
                          <div className="tip-date">{d.date}</div>
                          <div className="tip-ctx">{ctxParts.join(' \u00b7 ')}</div>
                        </div>
                      </div>
                    );
                  } else if (inRange) {
                    return <div key={ri} className="polydash-cal-cell no-data"><span className="cal-day-num">{d.day}</span></div>;
                  } else {
                    return <div key={ri} className="polydash-cal-cell empty" />;
                  }
                });
                const wsColor = weekActive === 0 ? 'rgba(255,255,255,0.2)' : weekSum >= 0 ? '#3fb950' : '#f85149';
                return (
                  <React.Fragment key={wi}>
                    <div className="polydash-cal-col">{cells}</div>
                    <div className="polydash-cal-col week-sum-col">
                      <div className="polydash-cal-week-sum">
                        <span className="ws-label">wk</span>
                        <span className="ws-val" style={{ color: wsColor }}>{weekActive > 0 ? cellVal(weekSum) : '-'}</span>
                      </div>
                    </div>
                  </React.Fragment>
                );
              })}
            </div>
          </div>
        </div>
      </div>

      {/* Footer legend */}
      <div className="polydash-cal-footer">
        <span className="polydash-cal-footer-note">sqrt color scale &middot; streak borders &middot; weekly pulse</span>
        <div className="polydash-cal-legend">
          <span>Loss</span>
          {[...redLevels].reverse().map((c, i) => <div key={'r' + i} className="polydash-cal-legend-cell" style={{ background: c }} />)}
          <div className="polydash-cal-legend-cell" style={{ background: noDataColor, border: '1px solid var(--dash-border)' }} />
          {greenLevels.map((c, i) => <div key={'g' + i} className="polydash-cal-legend-cell" style={{ background: c }} />)}
          <span>Profit</span>
        </div>
      </div>
    </>
  );
}

/* ── Wallet Detail Panel ── */
function WalletDetailPanel({ walletAddr, walletItem, dailyData }: {
  walletAddr: string;
  walletItem: DashboardWalletItem | undefined;
  dailyData: DailyPoint[];
}) {
  const [equityData, setEquityData] = useState<OnchainEquityResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [chartMode, setChartMode] = useState<'daily' | 'position' | 'value'>('daily');

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    onchainAPI.getEquity(walletAddr)
      .then(res => { if (!cancelled) setEquityData(res); })
      .catch(() => { if (!cancelled) setEquityData(null); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [walletAddr]);

  const w = walletItem;
  const s = equityData?.summary;
  const winRate = s ? ((s.wins + s.losses) > 0 ? (s.wins / (s.wins + s.losses) * 100).toFixed(1) : '0') : '0';

  // Build chart data
  let chartData: { date: string; cumulative: number; daily?: number }[] = [];
  if (equityData) {
    if (chartMode === 'daily') {
      chartData = (equityData.daily || []).map(d => ({ date: d.date, cumulative: d.equity, daily: d.day_pnl }));
    } else if (chartMode === 'value') {
      const vd = equityData.value_daily || [];
      chartData = vd.map((d, i) => ({
        date: d.date,
        cumulative: d.value,
        daily: i > 0 ? d.value - vd[i - 1].value : d.value,
      }));
    } else {
      chartData = (equityData.closed_events || []).map(e => ({ date: e.datetime?.slice(0, 10) || '', cumulative: e.equity, daily: e.pnl }));
    }
  }

  // Merge daily data from activity API if no equity daily data
  const calendarDailyData = equityData?.daily?.length
    ? equityData.daily.map(d => ({ date: d.date, day_pnl: d.day_pnl || 0 }))
    : dailyData;

  return (
    <>
      {/* Stats */}
      <div className="polydash-card">
        <h2>
          <span>{equityData?.label || w?.key_name || ''}</span>
          <span style={{ fontFamily: 'monospace', color: 'var(--dash-text2)', marginLeft: 8, fontSize: 13 }}>{walletAddr}</span>
        </h2>
        {(equityData?.sync_meta?.data_through || equityData?.sync_meta?.last_sync_at || equityData?.sync_meta?.l3_last_updated) ? (
          <div className="polydash-sync-meta">
            {equityData?.sync_meta?.data_through ? (
              <span title="Polymarket 活动数据已同步到的最近时间（UTC 存库，此处显示本地）">
                链上数据截至：{fmtLocalISO(equityData.sync_meta.data_through)}
              </span>
            ) : null}
            {equityData?.sync_meta?.last_sync_at ? (
              <span title="上次成功推进 L1 同步游标的时间">
                {equityData?.sync_meta?.data_through ? ' · ' : ''}游标同步：{fmtLocalISO(equityData.sync_meta.last_sync_at)}
              </span>
            ) : null}
            {equityData?.sync_meta?.l3_last_updated ? (
              <span title="L3 汇总表（盈亏/胜负等）最近刷新时间">
                {(equityData?.sync_meta?.data_through || equityData?.sync_meta?.last_sync_at) ? ' · ' : ''}汇总刷新：{fmtLocalISO(equityData.sync_meta.l3_last_updated)}
              </span>
            ) : null}
          </div>
        ) : null}
        <div className="polydash-stats-grid">
          <div className="polydash-stat-box">
            <div className="label">Realized PnL</div>
            <div className={`value ${(s?.total_pnl ?? w?.pnl ?? 0) >= 0 ? 'pos' : 'neg'}`}>{fmt(s?.total_pnl ?? w?.pnl)}</div>
            <div className="polydash-stat-hint">same as wallet list (L3)</div>
          </div>
          <div className="polydash-stat-box">
            <div className="label">Win Rate</div>
            <div className="value">{winRate}%</div>
            <div className="polydash-stat-hint">closed positions only</div>
          </div>
          <div className="polydash-stat-box">
            <div className="label">Wins / Losses</div>
            <div className="value">{s?.wins ?? w?.wins ?? 0} / {s?.losses ?? w?.losses ?? 0}</div>
          </div>
          <div className="polydash-stat-box">
            <div className="label">Total Assets</div>
            <div className="value">{fmt(w?.total_assets)}</div>
          </div>
          <div className="polydash-stat-box">
            <div className="label">Positions</div>
            <div className="value">{typeof w?.chain_position_count === 'number' ? w.chain_position_count : (s?.total_positions ?? w?.position_count ?? 0)}</div>
            <div className="polydash-stat-hint">l3 position rows</div>
          </div>
          <div className="polydash-stat-box">
            <div className="label">Open</div>
            <div className="value">{w?.open_positions ?? s?.open ?? 0}</div>
          </div>
        </div>

        {/* Chart tabs + chart */}
        <div className="polydash-chart-tabs">
          {(['daily', 'position', 'value'] as const).map(mode => (
            <button key={mode} className={`polydash-chart-tab${chartMode === mode ? ' active' : ''}`} onClick={() => setChartMode(mode)}>
              {mode === 'daily' ? 'PnL Daily' : mode === 'position' ? 'PnL Per Position' : 'Position Value'}
            </button>
          ))}
        </div>
        {chartMode === 'value' && (
          <p className="polydash-chart-explainer">
            每日结束时未平仓仓位的成本合计（与 L2 成本法一致，非市价）；柱为相邻两日成本变动。
          </p>
        )}
        <div className="polydash-chart-container">
          {loading ? (
            <div className="polydash-loading"><div className="polydash-spinner" />Loading...</div>
          ) : chartData.length > 0 ? (
            <ResponsiveContainer width="100%" height={350}>
              <ComposedChart data={chartData} margin={{ top: 8, right: 16, left: 8, bottom: 8 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="rgba(48,54,61,0.5)" />
                <XAxis dataKey="date" tick={{ fontSize: 11, fill: '#8b949e' }} stroke="#30363d" />
                <YAxis yAxisId="left" tick={{ fontSize: 11, fill: '#8b949e' }} stroke="#30363d" tickFormatter={v => fmtShort(v)} />
                {(chartMode === 'daily' || chartMode === 'value') && (
                  <YAxis yAxisId="right" orientation="right" tick={{ fontSize: 10, fill: '#8b949e' }} stroke="#30363d" tickFormatter={v => fmtShort(v)} />
                )}
                <Tooltip
                  contentStyle={{ background: '#1c2333', border: '1px solid #30363d', borderRadius: 8, fontSize: 12 }}
                  labelStyle={{ color: '#8b949e' }}
                  formatter={(value, name) => {
                    const v = fmt(Number(value ?? 0));
                    if (chartMode === 'value') {
                      return [v, name === 'cumulative' ? '未平仓成本' : '日变动'];
                    }
                    return [v, name === 'cumulative' ? 'Cumulative' : 'Daily'];
                  }}
                />
                <Line
                  type="monotone"
                  dataKey="cumulative"
                  yAxisId="left"
                  stroke={chartMode === 'value' ? '#58a6ff' : (chartData[chartData.length - 1]?.cumulative ?? 0) >= 0 ? '#3fb950' : '#f85149'}
                  strokeWidth={1.5}
                  dot={false}
                  fill={chartMode === 'value' ? 'rgba(88,166,255,0.08)' : (chartData[chartData.length - 1]?.cumulative ?? 0) >= 0 ? 'rgba(63,185,80,0.08)' : 'rgba(248,81,73,0.08)'}
                />
                {(chartMode === 'daily' || chartMode === 'value') && (
                  <Bar dataKey="daily" yAxisId="right" fill={chartMode === 'value' ? 'rgba(88,166,255,0.35)' : 'rgba(63,185,80,0.4)'} />
                )}
              </ComposedChart>
            </ResponsiveContainer>
          ) : (
            <div className="polydash-loading" style={{ height: 350 }}>No chart data</div>
          )}
        </div>
      </div>

      {/* PnL Calendar */}
      <div className="polydash-card">
        <h2>PnL Calendar</h2>
        <PnlCalendar dailyData={calendarDailyData} />
      </div>

      {/* Positions table */}
      {equityData?.positions && equityData.positions.length > 0 && (
        <div className="polydash-card">
          <h2>Positions ({equityData.positions.length})</h2>
          <div style={{ maxHeight: 400, overflowY: 'auto' }}>
            <table className="polydash-pos-table">
              <thead>
                <tr>
                  <th>Status</th>
                  <th>Token ID</th>
                  <th>Cost</th>
                  <th>Revenue</th>
                  <th>PnL</th>
                  <th>PnL %</th>
                  <th>First Tx</th>
                </tr>
              </thead>
              <tbody>
                {equityData.positions.map((p: OnchainPosition, i: number) => (
                  <tr key={i}>
                    <td><span className={`polydash-badge polydash-badge-${p.status?.toLowerCase() || 'closed'}`}>{p.status}</span></td>
                    <td style={{ fontFamily: 'monospace', fontSize: 11, maxWidth: 200, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{p.token_id?.slice(0, 16)}...</td>
                    <td>{fmt(p.cost)}</td>
                    <td>{fmt(p.revenue)}</td>
                    <td style={{ color: p.pnl >= 0 ? 'var(--dash-green)' : 'var(--dash-red)' }}>{fmt(p.pnl)}</td>
                    <td style={{ color: p.pnl_pct >= 0 ? 'var(--dash-green)' : 'var(--dash-red)' }}>{p.pnl_pct}%</td>
                    <td style={{ fontSize: 12, color: 'var(--dash-text2)' }}>{p.first_tx || '-'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </>
  );
}

/* ── Group Detail Panel ── */
function GroupDetailPanel({ groupInfo, allWallets, dailyData, onSelectWallet }: {
  groupInfo: GroupInfo;
  allWallets: DashboardWalletItem[];
  dailyData: DailyPoint[];
  onSelectWallet: (addr: string) => void;
}) {
  const g = groupInfo;
  const totalPnl = g.pnl;
  const winRate = (g.wins + g.losses) > 0 ? (g.wins / (g.wins + g.losses) * 100).toFixed(1) : '0';

  // Build chart data from dailyData
  let cumSum = 0;
  const chartData = dailyData.map(d => {
    cumSum += d.day_pnl;
    return { date: d.date, cumulative: cumSum, daily: d.day_pnl };
  });

  return (
    <>
      <div className="polydash-card">
        <h2>
          <span>{g.group}</span>
          <span className="polydash-gbadge">{g.wallet_count} wallets</span>
        </h2>
        <div className="polydash-stats-grid">
          <div className="polydash-stat-box">
            <div className="label">Total Realized PnL</div>
            <div className={`value ${totalPnl >= 0 ? 'pos' : 'neg'}`}>{fmt(totalPnl)}</div>
          </div>
          <div className="polydash-stat-box">
            <div className="label">Win Rate</div>
            <div className="value">{winRate}%</div>
          </div>
          <div className="polydash-stat-box">
            <div className="label">Wins / Losses</div>
            <div className="value">{g.wins} / {g.losses}</div>
          </div>
          <div className="polydash-stat-box">
            <div className="label">Total Assets</div>
            <div className="value">{fmt(g.total_assets)}</div>
          </div>
          <div className="polydash-stat-box">
            <div className="label">Wallets</div>
            <div className="value">{g.wallet_count}</div>
          </div>
          <div className="polydash-stat-box">
            <div className="label">Total Buy</div>
            <div className="value">{fmtShort(g.total_buy)}</div>
          </div>
        </div>

        {/* Chart */}
        {chartData.length > 0 && (
          <div className="polydash-chart-container">
            <ResponsiveContainer width="100%" height={350}>
              <ComposedChart data={chartData} margin={{ top: 8, right: 16, left: 8, bottom: 8 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="rgba(48,54,61,0.5)" />
                <XAxis dataKey="date" tick={{ fontSize: 11, fill: '#8b949e' }} stroke="#30363d" />
                <YAxis yAxisId="left" tick={{ fontSize: 11, fill: '#8b949e' }} stroke="#30363d" tickFormatter={v => fmtShort(v)} />
                <YAxis yAxisId="right" orientation="right" tick={{ fontSize: 10, fill: '#8b949e' }} stroke="#30363d" tickFormatter={v => fmtShort(v)} />
                <Tooltip
                  contentStyle={{ background: '#1c2333', border: '1px solid #30363d', borderRadius: 8, fontSize: 12 }}
                  labelStyle={{ color: '#8b949e' }}
                  formatter={(value, name) => [fmt(Number(value ?? 0)), name === 'cumulative' ? 'Cumulative PnL' : 'Daily PnL']}
                />
                <Line
                  type="monotone"
                  dataKey="cumulative"
                  yAxisId="left"
                  stroke={cumSum >= 0 ? '#3fb950' : '#f85149'}
                  strokeWidth={1.5}
                  dot={false}
                />
                <Bar dataKey="daily" yAxisId="right" fill="rgba(63,185,80,0.4)" />
              </ComposedChart>
            </ResponsiveContainer>
          </div>
        )}
      </div>

      {/* PnL Calendar */}
      <div className="polydash-card">
        <h2>PnL Calendar</h2>
        <PnlCalendar dailyData={dailyData} />
      </div>

      {/* Wallets in group */}
      <div className="polydash-card">
        <h2>Wallets in {g.group} ({g.wallets.length})</h2>
        <div className="polydash-group-wallets">
          {g.wallets.map(addr => {
            const w = allWallets.find(x => x.proxy_address.toLowerCase() === addr);
            const label = w?.key_name || addr.slice(0, 10);
            const pnl = w?.pnl ?? 0;
            return (
              <div key={addr} className="polydash-group-wallet-chip" onClick={() => onSelectWallet(addr)}>
                <span>{label}</span>
                <span style={{ color: pnl >= 0 ? 'var(--dash-green)' : 'var(--dash-red)', fontWeight: 600 }}>{fmtShort(pnl)}</span>
              </div>
            );
          })}
        </div>
      </div>
    </>
  );
}

/* ── Main Dashboard ── */
import React from 'react';

export default function CustomerDashboard() {
  const [allWallets, setAllWallets] = useState<DashboardWalletItem[]>([]);
  const [groups, setGroups] = useState<GroupInfo[]>([]);
  const [loading, setLoading] = useState(true);
  const [currentView, setCurrentView] = useState<'wallets' | 'groups'>('wallets');
  const [searchQuery, setSearchQuery] = useState('');
  const [sortBy, setSortBy] = useState('pnl_desc');
  const [selectedWallet, setSelectedWallet] = useState<string | null>(null);
  const [selectedGroup, setSelectedGroup] = useState<string | null>(null);

  const [precomputeLoading, setPrecomputeLoading] = useState(false);
  const isAdmin = getRole() === 'admin';

  // Per-wallet daily PnL data (from activity API)
  const [walletDailyMap, setWalletDailyMap] = useState<Map<string, DailyPoint[]>>(new Map());
  // Per-group daily PnL data
  const [groupDailyMap, setGroupDailyMap] = useState<Map<string, DailyPoint[]>>(new Map());

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const overviewRes = await dashboardOverviewAPI.getOverview();
        if (cancelled) return;
        const wallets = overviewRes.wallets || [];
        setAllWallets(wallets);

        // Build groups
        const byKey: Record<string, DashboardWalletItem[]> = {};
        for (const w of wallets) {
          if (!w.group) continue;
          if (!byKey[w.group]) byKey[w.group] = [];
          byKey[w.group].push(w);
        }
        const groupInfos: GroupInfo[] = Object.entries(byKey).map(([key, items]) => ({
          group: key,
          pnl: items.reduce((s, w) => s + w.pnl, 0),
          total_buy: items.reduce((s, w) => s + w.total_buy, 0),
          wins: items.reduce((s, w) => s + w.wins, 0),
          losses: items.reduce((s, w) => s + w.losses, 0),
          wallet_count: items.length,
          total_assets: items.reduce((s, w) => s + w.total_assets, 0),
          wallets: items.map(w => w.proxy_address.toLowerCase()),
        })).sort((a, b) => b.pnl - a.pnl);
        setGroups(groupInfos);

        // Fetch daily stats (no secret_ids needed, backend auto-resolves by user role)
        if (wallets.length > 0) {
          const toDate = new Date();
          const fromDate = new Date(toDate);
          fromDate.setDate(fromDate.getDate() - 90);
          const statsRes = await activityAPI.getDailyStats(fromDate.toISOString().slice(0, 10), toDate.toISOString().slice(0, 10));
          if (cancelled) return;

          const addrToGroup = new Map<string, string>();
          for (const w of wallets) {
            if (w.proxy_address) addrToGroup.set(w.proxy_address.toLowerCase(), w.group);
          }

          const wMap = new Map<string, Map<string, number>>();
          const gMap = new Map<string, Map<string, number>>();

          for (const w of statsRes.data || []) {
            const walletAddr = (w.wallet || '').toLowerCase();
            const groupKey = addrToGroup.get(walletAddr);
            for (const d of w.daily || []) {
              const row = d as unknown as Record<string, unknown>;
              const date = row?.date as string | undefined;
              if (!date) continue;
              const p = parseDailyProfit(row);
              // Per wallet
              if (!wMap.has(walletAddr)) wMap.set(walletAddr, new Map());
              wMap.get(walletAddr)!.set(date, (wMap.get(walletAddr)!.get(date) ?? 0) + p);
              // Per group
              if (groupKey) {
                if (!gMap.has(groupKey)) gMap.set(groupKey, new Map());
                gMap.get(groupKey)!.set(date, (gMap.get(groupKey)!.get(date) ?? 0) + p);
              }
            }
          }

          const toDaily = (m: Map<string, number>): DailyPoint[] =>
            [...m.entries()].map(([date, pnl]) => ({ date, day_pnl: pnl })).sort((a, b) => a.date.localeCompare(b.date));

          const wDailyMap = new Map<string, DailyPoint[]>();
          wMap.forEach((dateMap, addr) => wDailyMap.set(addr, toDaily(dateMap)));
          setWalletDailyMap(wDailyMap);

          const gDailyMap = new Map<string, DailyPoint[]>();
          gMap.forEach((dateMap, gk) => gDailyMap.set(gk, toDaily(dateMap)));
          setGroupDailyMap(gDailyMap);
        }
      } catch {
        // silently fail
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, []);

  // Global stats
  const globalStats = useMemo(() => {
    const totalPnl = allWallets.reduce((s, w) => s + w.pnl, 0);
    const profitable = allWallets.filter(w => w.pnl > 0).length;
    return `${allWallets.length} wallets | ${groups.length} groups | Realized PnL: ${fmt(totalPnl)} | Profitable: ${profitable}/${allWallets.length}`;
  }, [allWallets, groups]);

  // Sort + filter wallets
  const filteredWallets = useMemo(() => {
    const q = searchQuery.toLowerCase();
    let filtered = allWallets.filter(w =>
      w.proxy_address.toLowerCase().includes(q) || w.key_name.toLowerCase().includes(q)
    );
    const sorters: Record<string, (a: DashboardWalletItem, b: DashboardWalletItem) => number> = {
      pnl_desc: (a, b) => b.pnl - a.pnl,
      pnl_asc: (a, b) => a.pnl - b.pnl,
      assets_desc: (a, b) => b.total_assets - a.total_assets,
      volume_desc: (a, b) => b.total_buy - a.total_buy,
    };
    filtered.sort(sorters[sortBy] || sorters.pnl_desc);
    return filtered;
  }, [allWallets, searchQuery, sortBy]);

  // Sort + filter groups
  const filteredGroups = useMemo(() => {
    const q = searchQuery.toLowerCase();
    let filtered = groups.filter(g => g.group.toLowerCase().includes(q));
    const sorters: Record<string, (a: GroupInfo, b: GroupInfo) => number> = {
      pnl_desc: (a, b) => b.pnl - a.pnl,
      pnl_asc: (a, b) => a.pnl - b.pnl,
      wallets_desc: (a, b) => b.wallet_count - a.wallet_count,
      volume_desc: (a, b) => b.total_buy - a.total_buy,
    };
    filtered.sort(sorters[sortBy] || sorters.pnl_desc);
    return filtered;
  }, [groups, searchQuery, sortBy]);

  const handleSelectWallet = (addr: string) => {
    setSelectedWallet(addr);
    setSelectedGroup(null);
  };
  const handleSelectGroup = (group: string) => {
    setSelectedGroup(group);
    setSelectedWallet(null);
  };

  const walletSortBtns = [
    { key: 'pnl_desc', label: 'PnL High' },
    { key: 'pnl_asc', label: 'PnL Low' },
    { key: 'assets_desc', label: 'Assets' },
    { key: 'volume_desc', label: 'Volume' },
  ];
  const groupSortBtns = [
    { key: 'pnl_desc', label: 'PnL High' },
    { key: 'pnl_asc', label: 'PnL Low' },
    { key: 'wallets_desc', label: 'Most Wallets' },
    { key: 'volume_desc', label: 'Volume' },
  ];
  const sortBtns = currentView === 'groups' ? groupSortBtns : walletSortBtns;

  return (
    <div className="polydash-root">
      <header className="polydash-header">
        <h1>Polymarket Equity Curves</h1>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <div className="stats">{globalStats}</div>
          {isAdmin && (
            <button
              className={`polydash-sort-btn${precomputeLoading ? ' active' : ''}`}
              style={{ padding: '6px 14px', fontSize: 13 }}
              disabled={precomputeLoading}
              onClick={async () => {
                setPrecomputeLoading(true);
                try {
                  await dashboardAPI.triggerPrecompute();
                  window.location.reload();
                } catch (e: any) {
                  alert('重算失败: ' + (e?.response?.data?.error || e?.message));
                } finally {
                  setPrecomputeLoading(false);
                }
              }}
            >
              {precomputeLoading ? 'Recomputing...' : 'Recompute PnL'}
            </button>
          )}
        </div>
      </header>
      <div className="polydash-layout">
        {/* Sidebar */}
        <div className="polydash-sidebar">
          <div className="polydash-view-toggle">
            <button
              className={`polydash-view-toggle-btn${currentView === 'wallets' ? ' active' : ''}`}
              onClick={() => { setCurrentView('wallets'); setSearchQuery(''); setSortBy('pnl_desc'); }}
            >Wallets</button>
            <button
              className={`polydash-view-toggle-btn${currentView === 'groups' ? ' active' : ''}`}
              onClick={() => { setCurrentView('groups'); setSearchQuery(''); setSortBy('pnl_desc'); }}
            >Groups</button>
          </div>
          <input
            type="text"
            className="polydash-search"
            placeholder={currentView === 'groups' ? 'Search groups...' : 'Search by label or address...'}
            value={searchQuery}
            onChange={e => setSearchQuery(e.target.value)}
          />
          <div className="polydash-sort-bar">
            {sortBtns.map(btn => (
              <button
                key={btn.key}
                className={`polydash-sort-btn${sortBy === btn.key ? ' active' : ''}`}
                onClick={() => setSortBy(btn.key)}
              >{btn.label}</button>
            ))}
          </div>
          <div className="polydash-wallet-list">
            {loading ? (
              <div className="polydash-loading"><div className="polydash-spinner" />Loading wallets...</div>
            ) : currentView === 'wallets' ? (
              filteredWallets.map((w, i) => (
                <div
                  key={w.proxy_address || i}
                  className={`polydash-witem${selectedWallet === w.proxy_address.toLowerCase() ? ' active' : ''}`}
                  onClick={() => handleSelectWallet(w.proxy_address.toLowerCase())}
                >
                  <div>
                    <div className="wname">{w.key_name || `#${i + 1}`}</div>
                    <div className="waddr">{addrShort(w.proxy_address)}</div>
                    {(w.onchain_data_through || w.onchain_last_sync_at || w.onchain_l3_updated) ? (
                      <div className="wsync" title="链上库：活动数据截至 / L1 游标 / L3 汇总刷新">
                        {[
                          w.onchain_data_through ? `截至 ${fmtLocalISO(w.onchain_data_through)}` : null,
                          w.onchain_last_sync_at ? `游标 ${fmtLocalISO(w.onchain_last_sync_at)}` : null,
                          w.onchain_l3_updated ? `汇总 ${fmtLocalISO(w.onchain_l3_updated)}` : null,
                        ].filter(Boolean).join(' · ')}
                      </div>
                    ) : null}
                  </div>
                  <div>
                    <div className={`wpnl ${w.pnl >= 0 ? 'pos' : 'neg'}`}>{fmt(w.pnl)}</div>
                    <div className="wmeta">W{w.wins}/L{w.losses} | {typeof w.chain_position_count === 'number' ? w.chain_position_count : w.position_count} pos</div>
                  </div>
                </div>
              ))
            ) : (
              filteredGroups.map(g => (
                <div
                  key={g.group}
                  className={`polydash-witem${selectedGroup === g.group ? ' active' : ''}`}
                  onClick={() => handleSelectGroup(g.group)}
                >
                  <div>
                    <div style={{ fontWeight: 600, fontSize: 15 }}>{g.group}</div>
                    <div className="waddr">{g.wallet_count} wallets</div>
                  </div>
                  <div>
                    <div className={`wpnl ${g.pnl >= 0 ? 'pos' : 'neg'}`}>{fmt(g.pnl)}</div>
                    <div className="wmeta">W{g.wins}/L{g.losses}</div>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>

        {/* Main Panel */}
        <div className="polydash-main">
          {!selectedWallet && !selectedGroup ? (
            <div className="polydash-empty">Select a wallet or group to view equity curve</div>
          ) : selectedWallet ? (
            <WalletDetailPanel
              walletAddr={selectedWallet}
              walletItem={allWallets.find(w => w.proxy_address.toLowerCase() === selectedWallet)}
              dailyData={walletDailyMap.get(selectedWallet) || []}
            />
          ) : selectedGroup ? (
            <GroupDetailPanel
              groupInfo={groups.find(g => g.group === selectedGroup)!}
              allWallets={allWallets}
              dailyData={groupDailyMap.get(selectedGroup) || []}
              onSelectWallet={handleSelectWallet}
            />
          ) : null}
        </div>
      </div>
    </div>
  );
}
