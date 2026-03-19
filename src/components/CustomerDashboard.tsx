/**
 * 客户看板：按分组以卡片形式展示资产总览、持仓/挂单汇总与近期快照；
 * 每日利润曲线数据来自 polykms 后端 /api/v1/activity/daily-stats（wallet_daily_stats）
 * 仅 role 为 customer 或 admin 时可访问
 */
import { useEffect, useState } from 'react';
import { Card, Spin, Alert, Button, Row, Col, Segmented, Table } from 'antd';
import { MenuFoldOutlined, MenuUnfoldOutlined, LeftOutlined, RightOutlined, CalendarOutlined, LineChartOutlined } from '@ant-design/icons';
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from 'recharts';
import {
  dashboardAPI,
  activityAPI,
  parseDailyProfit,
  parseDailyVolume,
  secretsAPI,
  getRole,
  type GroupAggregateResponse,
  type GroupDailySnapshotItem,
  type Secret,
  type ActivityRecordItem,
} from '../utils/api';
import './CustomerDashboard.css';

function formatMoney(v: number) {
  if (v >= 1e9) return (v / 1e9).toFixed(2) + 'B';
  if (v >= 1e6) return (v / 1e6).toFixed(2) + 'M';
  if (v >= 1e3) return (v / 1e3).toFixed(2) + 'K';
  return v.toFixed(2);
}

/** 总资产用：不用 K，千/万级显示完整数字，仅 M/B 缩写 */
function formatAsset(v: number) {
  if (v >= 1e9) return (v / 1e9).toFixed(2) + 'B';
  if (v >= 1e6) return (v / 1e6).toFixed(2) + 'M';
  return v.toFixed(2);
}

/**
 * 从 key_name 提取「字母前缀」作为分组 key：
 * - 若以数字开头 → 返回 null（该密钥不展示在卡片中）
 * - 若以字母开头 → 返回连续字母部分（a-zA-Z），如 "ev_1" -> "ev"，"prod_2" -> "prod"
 */
function getGroupKeyFromKeyName(keyName: string): string | null {
  const s = (keyName || '').trim();
  if (!s.length) return null;
  const first = s[0];
  if (first >= '0' && first <= '9') return null;
  const m = s.match(/^[a-zA-Z]+/);
  return m ? m[0] : null;
}

/**
 * 按 key_name 字母前缀将密钥分组；数字前缀的 key 不展示
 * 返回：{ groupKeys: string[], groupsByKey: Record<string, Secret[]> }
 */
function buildGroupsByKeyName(secrets: Secret[]) {
  const groupsByKey: Record<string, Secret[]> = {};
  for (const s of secrets) {
    const key = getGroupKeyFromKeyName(s.key_name || '');
    if (key === null) continue;
    if (!groupsByKey[key]) groupsByKey[key] = [];
    groupsByKey[key].push(s);
  }
  const groupKeys = Object.keys(groupsByKey).sort();
  return { groupKeys, groupsByKey };
}

type GroupData = {
  aggregate: GroupAggregateResponse;
  snapshots: GroupDailySnapshotItem[];
};

/** 分组每日汇总：日盈利额、日交易额、日盈利率（%） */
type DailyPoint = { date: string; profit: number; volume: number; rate: number | null };

/** 资产变化曲线点：日期 + 累计盈亏（用于曲线图） */
type AssetChangePoint = { date: string; cumulative: number };

/** 当日交易明细按 token_id 聚合后的行类型 */
type DayAggRow = {
  tokenId: string;
  typesStr: string;
  count: number;
  size: number;
  usdcSize: number;
  pnl: number;
  lastTs: number;
};

const WEEKDAY_LABELS = ['日', '一', '二', '三', '四', '五', '六'];

/** 利润日历：按周排布日期，每格显示当日利润与交易额；可选点击某日回调 */
function ProfitCalendar({
  curve,
  formatMoney,
  onDayClick,
}: {
  curve: DailyPoint[];
  formatMoney: (v: number) => string;
  onDayClick?: (date: string) => void;
}) {
  const dateMap = new Map<string, DailyPoint>();
  curve.forEach((p) => dateMap.set(p.date, p));
  const sortedDates = curve.map((p) => p.date).sort();
  if (sortedDates.length === 0) return null;
  const minDate = new Date(sortedDates[0] + 'T00:00:00');
  const maxDate = new Date(sortedDates[sortedDates.length - 1] + 'T00:00:00');
  const startPad = minDate.getDay();
  const days: (string | null)[] = [];
  for (let i = 0; i < startPad; i++) days.push(null);
  const totalDays = Math.round((maxDate.getTime() - minDate.getTime()) / (24 * 60 * 60 * 1000)) + 1;
  const toDateStr = (d: Date) =>
    `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  for (let i = 0; i < totalDays; i++) {
    const d = new Date(minDate);
    d.setDate(d.getDate() + i);
    days.push(toDateStr(d));
  }
  const rows: (string | null)[][] = [];
  for (let i = 0; i < days.length; i += 7) {
    const row = days.slice(i, i + 7);
    while (row.length < 7) row.push(null);
    rows.push(row);
  }

  const todayStr = new Date().toISOString().slice(0, 10);
  return (
    <div className="polydash-daily-calendar" style={{ overflowX: 'auto' }}>
      <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
        <thead>
          <tr>
            {WEEKDAY_LABELS.map((l) => (
              <th key={l} style={{ padding: '6px 4px', fontWeight: 600, width: '14.28%' }}>
                {l}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row, ri) => (
            <tr key={ri}>
              {row.map((date, ci) => {
                const point = date ? dateMap.get(date) : null;
                const isEmpty = !date;
                const profit = point?.profit ?? 0;
                const volume = point?.volume ?? 0;
                const dayNum = date ? new Date(date).getDate() : '';
                const isToday = date === todayStr;
                return (
                  <td
                    key={ci}
                    role={date ? 'button' : undefined}
                    className={`polydash-day-cell ${isEmpty ? 'empty' : ''} ${profit > 0 ? 'profit' : profit < 0 ? 'loss' : ''} ${isToday ? 'today' : ''} ${date && onDayClick ? 'clickable' : ''}`}
                    style={{ padding: '8px 4px', verticalAlign: 'top' }}
                    onClick={date && onDayClick ? () => onDayClick(date) : undefined}
                  >
                    {isEmpty ? (
                      <span className="polydash-day-empty">–</span>
                    ) : (
                      <>
                        <div className="polydash-day-num">{dayNum}</div>
                        {point && (
                          <>
                            <div className={`polydash-day-pnl ${profit >= 0 ? 'positive' : 'negative'}`}>
                              {profit >= 0 ? '+' : ''}{formatMoney(profit)}
                            </div>
                            {volume > 0 && (
                              <div className="polydash-day-volume">成交量 {formatMoney(volume)}</div>
                            )}
                          </>
                        )}
                      </>
                    )}
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export default function CustomerDashboard() {
  /** 按 key_name 字母前缀得到的分组 key 列表（数字前缀的 key 不展示） */
  const [groupKeys, setGroupKeys] = useState<string[]>([]);
  /** 每个分组 key 下的密钥列表（用于请求聚合与地址→分组映射） */
  const [groupsByKey, setGroupsByKey] = useState<Record<string, Secret[]>>({});
  const [groupData, setGroupData] = useState<Record<string, GroupData>>({});
  const [loading, setLoading] = useState(true);
  const [triggerLoading, setTriggerLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  /** 按分组 key 聚合的每日利润/交易额/盈利率 */
  const [dailyProfitByGroup, setDailyProfitByGroup] = useState<Record<string, DailyPoint[]>>({});
  /** 全部的每日利润日历数据（date + profit + volume + rate） */
  const [dailyCurveAll, setDailyCurveAll] = useState<DailyPoint[]>([]);
  const [dailyProfitLoading, setDailyProfitLoading] = useState(false);
  /** 当前打开的分组利润弹窗（分组 key，null 表示关闭） */
  const [selectedGroupForChart, setSelectedGroupForChart] = useState<string | null>(null);
  /** 左侧栏折叠状态（滑动收起） */
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  /** 每日表现：展示的月份偏移（0=当月，-1=上一月，-2=上两月） */
  const [dailyDisplayMonthOffset, setDailyDisplayMonthOffset] = useState(0);
  /** 每日表现：日历 / 曲线图 */
  const [dailyViewMode, setDailyViewMode] = useState<'calendar' | 'curve'>('calendar');
  /** 曲线图模式：总资产变化 / 盈利额变化 */
  const [curveChartMode, setCurveChartMode] = useState<'assets' | 'profit'>('assets');
  /** 点击日历某一天后选中的日期（YYYY-MM-DD），用于展示当日平仓交易 */
  const [selectedDailyDate, setSelectedDailyDate] = useState<string | null>(null);
  /** 当日平仓交易列表（卖出 SELL + 赎回 REDEEM，接口同时请求两种类型） */
  const [dayRecords, setDayRecords] = useState<ActivityRecordItem[]>([]);
  const [dayRecordsLoading, setDayRecordsLoading] = useState(false);
  const isAdmin = getRole() === 'admin';

  /** 根据月份偏移得到目标年-月 YYYY-MM，并过滤出该月的 curve */
  function getCurveForMonth(curve: DailyPoint[], monthOffset: number): DailyPoint[] {
    const d = new Date();
    d.setMonth(d.getMonth() + monthOffset);
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, '0');
    const prefix = `${y}-${m}-`;
    return curve.filter((p) => p.date.startsWith(prefix)).sort((a, b) => a.date.localeCompare(b.date));
  }

  /** 当前展示月份标题，如 2026年2月 */
  function getDisplayMonthLabel(offset: number): string {
    const d = new Date();
    d.setMonth(d.getMonth() + offset);
    return `${d.getFullYear()}年${d.getMonth() + 1}月`;
  }

  /** 当前选中的分组对应的密钥 ID 列表（用于请求当日平仓） */
  const selectedSecretIds = (() => {
    if (selectedGroupForChart == null) {
      const list: number[] = [];
      groupKeys.forEach((k) => {
        (groupsByKey[k] || []).forEach((s) => {
          if (s.id) list.push(s.id);
        });
      });
      return [...new Set(list)];
    }
    return (groupsByKey[selectedGroupForChart] || []).map((s) => s.id).filter(Boolean) as number[];
  })();

  useEffect(() => {
    if (!selectedDailyDate || selectedSecretIds.length === 0) {
      setDayRecords([]);
      return;
    }
    let cancelled = false;
    setDayRecordsLoading(true);
    const pageSize = 5000;
    const fetchAll = async () => {
      const all: ActivityRecordItem[] = [];
      let page = 1;
      for (;;) {
        const res = await activityAPI.getRecords({
          secretIds: selectedSecretIds,
          fromDate: selectedDailyDate,
          toDate: selectedDailyDate,
          types: ['SELL', 'REDEEM'],
          page,
          pageSize,
        });
        if (cancelled) return;
        const list = res.list || [];
        all.push(...list);
        const total = res.total ?? 0;
        if (list.length < pageSize || page * pageSize >= total) break;
        page += 1;
      }
      if (!cancelled) setDayRecords(all);
    };
    fetchAll()
      .catch(() => {
        if (!cancelled) setDayRecords([]);
      })
      .finally(() => {
        if (!cancelled) setDayRecordsLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [selectedDailyDate, selectedSecretIds.join(',')]);

  /** 按分组 key 拉取聚合数据（使用 aggregate-by-secrets；按 key 分组无历史快照） */
  const loadData = async (keys: string[], byKey: Record<string, Secret[]>) => {
    if (keys.length === 0) {
      setGroupData({});
      return;
    }
    setError(null);
    const results = await Promise.allSettled(
      keys.map(async (key) => {
        const secrets = byKey[key] || [];
        const secretIds = secrets.map((s) => s.id);
        const agg = await dashboardAPI.getAggregateBySecretIDs(secretIds);
        return [key, { aggregate: agg, snapshots: [] as GroupDailySnapshotItem[] }] as const;
      })
    );
    const data: Record<string, GroupData> = {};
    results.forEach((r, i) => {
      if (r.status === 'fulfilled') data[keys[i]] = r.value[1];
    });
    setGroupData(data);
  };

  // 从密钥列表按 key_name 字母前缀分组（数字前缀不展示），拉取各分组聚合与 poly_activity 每日利润
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await secretsAPI.listSecrets();
        if (cancelled) return;
        const secrets = res.secrets || [];
        const { groupKeys: keys, groupsByKey: byKey } = buildGroupsByKeyName(secrets);
        setGroupKeys(keys);
        setGroupsByKey(byKey);
        await loadData(keys, byKey);

        // 按 key 分组：仅对 key_name 以字母开头的密钥，用 secret_id 请求每日利润并归到对应 groupKey
        const secretIdToGroupKey = new Map<number, string>();
        for (const s of secrets) {
          const key = getGroupKeyFromKeyName(s.key_name || '');
          if (key !== null && s.id) {
            secretIdToGroupKey.set(s.id, key);
          }
        }
        const secretIds = [...new Set(secretIdToGroupKey.keys())];
        if (secretIds.length > 0) {
          setDailyProfitLoading(true);
          try {
            const toDate = new Date();
            const fromDate = new Date(toDate);
            fromDate.setDate(fromDate.getDate() - 90);
            const fromStr = fromDate.toISOString().slice(0, 10);
            const toStr = toDate.toISOString().slice(0, 10);
            const statsRes = await activityAPI.getDailyStats(secretIds, fromStr, toStr);
            if (cancelled) return;
            const byDate = new Map<string, number>();
            const byDateVolume = new Map<string, number>();
            const byGroupProfit = new Map<string, Map<string, number>>();
            const byGroupVolume = new Map<string, Map<string, number>>();
            const walletToSecretID = new Map<string, number>();
            for (const s of secrets) {
              if (s.id && s.proxy_address) {
                walletToSecretID.set((s.proxy_address || '').toLowerCase(), s.id);
              }
            }
            for (const w of statsRes.data || []) {
              const sid = walletToSecretID.get((w.wallet || '').toLowerCase());
              const groupKey = sid ? secretIdToGroupKey.get(sid) : undefined;
              for (const d of w.daily || []) {
                const row = d as unknown as Record<string, unknown>;
                const date = row?.date as string | undefined;
                if (!date) continue;
                const p = parseDailyProfit(row);
                const vol = parseDailyVolume(row);
                byDate.set(date, (byDate.get(date) ?? 0) + p);
                byDateVolume.set(date, (byDateVolume.get(date) ?? 0) + vol);
                if (groupKey) {
                  if (!byGroupProfit.has(groupKey)) {
                    byGroupProfit.set(groupKey, new Map());
                    byGroupVolume.set(groupKey, new Map());
                  }
                  const gp = byGroupProfit.get(groupKey)!;
                  const gv = byGroupVolume.get(groupKey)!;
                  gp.set(date, (gp.get(date) ?? 0) + p);
                  gv.set(date, (gv.get(date) ?? 0) + vol);
                }
              }
            }
            const allDates = new Set([...byDate.keys(), ...byDateVolume.keys()]);
            const curveAll: DailyPoint[] = [...allDates]
              .map((date) => {
                const profit = byDate.get(date) ?? 0;
                const volume = byDateVolume.get(date) ?? 0;
                const rate = volume > 0 ? (profit / volume) * 100 : null;
                return { date, profit, volume, rate };
              })
              .sort((a, b) => a.date.localeCompare(b.date));
            setDailyCurveAll(curveAll);
            const groupCurves: Record<string, DailyPoint[]> = {};
            byGroupProfit.forEach((dateToProfit, gk) => {
              const dateToVolume = byGroupVolume.get(gk)!;
              const gDates = new Set([...dateToProfit.keys(), ...dateToVolume.keys()]);
              groupCurves[gk] = [...gDates]
                .map((date) => {
                  const profit = dateToProfit.get(date) ?? 0;
                  const volume = dateToVolume.get(date) ?? 0;
                  const rate = volume > 0 ? (profit / volume) * 100 : null;
                  return { date, profit, volume, rate };
                })
                .sort((a, b) => a.date.localeCompare(b.date));
            });
            setDailyProfitByGroup(groupCurves);
          } catch (e) {
            if (!cancelled) {
              setDailyProfitByGroup({});
              setDailyCurveAll([]);
            }
          } finally {
            if (!cancelled) setDailyProfitLoading(false);
          }
        }
      } catch (e: any) {
        if (!cancelled) setError(e?.response?.data?.error || e?.message || '加载密钥列表失败');
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const handleTriggerSnapshot = async () => {
    setTriggerLoading(true);
    try {
      await dashboardAPI.triggerDailySnapshot();
      await loadData(groupKeys, groupsByKey);
    } catch (e: any) {
      setError(e?.response?.data?.error || e?.message || '触发快照失败');
    } finally {
      setTriggerLoading(false);
    }
  };

  if (loading) {
    return (
      <div style={{ textAlign: 'center', padding: 48 }}>
        <Spin size="large" tip="加载中…" />
      </div>
    );
  }

  const noGroup = groupKeys.length === 0;

  const mainContent = (
    <>
      <div style={{ marginBottom: 16 }}>
        {error && (
          <Alert
            type="error"
            message={error}
            closable
            onClose={() => setError(null)}
            style={{ marginBottom: 16 }}
          />
        )}
        {!noGroup && isAdmin && (
          <Button type="primary" loading={triggerLoading} onClick={handleTriggerSnapshot} style={{ marginBottom: 16 }}>
            触发今日快照
          </Button>
        )}
      </div>

      {noGroup ? (
        <Card>
          <Alert
            type="info"
            message="暂无卡片数据"
            description="卡片按 key_name 字母前缀分组展示：以字母开头的 key（如 ev_1、prod_2）会展示，以数字开头的 key 不会展示。请确保密钥的 key_name 以字母开头。"
          />
        </Card>
      ) : (
        <>
          {/* 顶部 KPI 卡片：总资产、总盈亏、今日盈亏、月回报率（随左侧分组切换） */}
          {(() => {
            const curve =
              selectedGroupForChart == null ? dailyCurveAll : dailyProfitByGroup[selectedGroupForChart] || [];
            // 近30日：只取 curve 中日期最近的 30 天（curve 已按 date 升序）
            const curveLast30 = curve.slice(-30);
            const totalProfit = curveLast30.reduce((s, p) => s + p.profit, 0);
            const totalVolume = curveLast30.reduce((s, p) => s + p.volume, 0);
            const monthRate = totalVolume > 0 ? (totalProfit / totalVolume) * 100 : null;
            const todayStr = new Date().toISOString().slice(0, 10);
            const todayPoint = curve.find((p) => p.date === todayStr);
            const todayProfit = todayPoint?.profit ?? 0;
            const todayVolume = todayPoint?.volume ?? 0;
            let totalAssets = 0;
            if (selectedGroupForChart == null) {
              groupKeys.forEach((k) => {
                const d = groupData[k]?.aggregate;
                if (d) totalAssets += d.total_assets ?? 0;
              });
            } else {
              totalAssets = groupData[selectedGroupForChart]?.aggregate?.total_assets ?? 0;
            }
            return (
              <Row gutter={[12, 12]} className="dashboard-kpi-row" style={{ marginBottom: 16 }}>
                <Col xs={12} md={6}>
                  <div className="polydash-kpi-card">
                    <div className="polydash-kpi-value">$ {formatAsset(totalAssets)}</div>
                    <div className="polydash-kpi-label">总资产</div>
                  </div>
                </Col>
                <Col xs={12} md={6}>
                  <div className="polydash-kpi-card">
                    <div className={`polydash-kpi-value ${totalProfit >= 0 ? 'positive' : 'negative'}`}>
                      {totalProfit >= 0 ? '+' : ''}{formatMoney(totalProfit)}
                    </div>
                    <div className="polydash-kpi-label">总盈亏（近30日）</div>
                  </div>
                </Col>
                <Col xs={12} md={6}>
                  <div className="polydash-kpi-card">
                    <div className={`polydash-kpi-value ${todayProfit >= 0 ? 'positive' : 'negative'}`}>
                      {todayProfit >= 0 ? '+' : ''}{formatMoney(todayProfit)}
                    </div>
                    <div className="polydash-kpi-label">今日盈亏{todayVolume > 0 ? ` · 成交量 ${formatMoney(todayVolume)}` : ''}</div>
                  </div>
                </Col>
                <Col xs={12} md={6}>
                  <div className="polydash-kpi-card">
<div className={`polydash-kpi-value ${monthRate != null && monthRate >= 0 ? 'positive' : 'negative'}`}>
                                      {monthRate != null ? `${monthRate >= 0 ? '+' : ''}${monthRate.toFixed(2)}%` : '–'}
                                    </div>
                    <div className="polydash-kpi-label">月回报率（近30日）</div>
                  </div>
                </Col>
              </Row>
            );
          })()}

          <Row gutter={[16, 16]} className="dashboard-calendar-cards-row">
            {/* 左侧：每日表现（日历/曲线图 + 上一月/下一月） */}
            <Col xs={24} lg={14}>
              <Card
                className="polydash-calendar-card"
                title={
                  <span className="polydash-section-title">
                    {dailyViewMode === 'curve'
                      ? (selectedGroupForChart == null
                          ? (curveChartMode === 'assets' ? '总资产变化曲线 · 全部' : '盈利额变化曲线 · 全部')
                          : (curveChartMode === 'assets' ? `总资产变化曲线 · ${selectedGroupForChart}` : `盈利额变化曲线 · ${selectedGroupForChart}`))
                      : selectedGroupForChart == null
                        ? '每日表现 · 全部'
                        : `每日表现 · ${selectedGroupForChart}`}
                    {dailyViewMode === 'calendar' && (
                      <span className="polydash-month-label" style={{ marginLeft: 8, fontWeight: 500, opacity: 0.9 }}>
                        {getDisplayMonthLabel(dailyDisplayMonthOffset)}
                      </span>
                    )}
                    {dailyViewMode === 'curve' && (
                      <span className="polydash-month-label" style={{ marginLeft: 8, fontWeight: 500, opacity: 0.9 }}>
                        全部数据
                      </span>
                    )}
                  </span>
                }
                extra={
                  <div className="polydash-daily-actions">
                    <Button
                      type="text"
                      size="small"
                      icon={<LeftOutlined />}
                      onClick={() => setDailyDisplayMonthOffset((o) => o - 1)}
                      disabled={dailyDisplayMonthOffset <= -2}
                      className="polydash-month-btn"
                    >
                      上一月
                    </Button>
                    <Button
                      type="text"
                      size="small"
                      icon={<RightOutlined />}
                      iconPosition="end"
                      onClick={() => setDailyDisplayMonthOffset((o) => o + 1)}
                      disabled={dailyDisplayMonthOffset >= 0}
                      className="polydash-month-btn"
                    >
                      下一月
                    </Button>
                    <Segmented
                      size="small"
                      options={[
                        { label: '日历', value: 'calendar', icon: <CalendarOutlined /> },
                        { label: '曲线图', value: 'curve', icon: <LineChartOutlined /> },
                      ]}
                      value={dailyViewMode}
                      onChange={(v) => setDailyViewMode(v === 'curve' ? 'curve' : 'calendar')}
                      style={{ marginLeft: 8 }}
                    />
                    {dailyViewMode === 'curve' && (
                      <Segmented
                        size="small"
                        options={[
                          { label: '总资产变化', value: 'assets' },
                          { label: '盈利额变化', value: 'profit' },
                        ]}
                        value={curveChartMode}
                        onChange={(v) => setCurveChartMode(v === 'profit' ? 'profit' : 'assets')}
                        style={{ marginLeft: 8 }}
                      />
                    )}
                  </div>
                }
                size="small"
                style={{ height: '100%' }}
              >
              {dailyProfitLoading ? (
                <div style={{ minHeight: 280, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                  <Spin tip="加载每日利润…" />
                </div>
              ) : (() => {
                const fullCurve =
                  selectedGroupForChart == null
                    ? dailyCurveAll
                    : dailyProfitByGroup[selectedGroupForChart] || [];
                const monthCurve = getCurveForMonth(fullCurve, dailyDisplayMonthOffset);
                if (dailyViewMode === 'curve') {
                  const sorted = [...fullCurve].sort((a, b) => a.date.localeCompare(b.date));
                  const totalProfitInRange = sorted.reduce((s, p) => s + p.profit, 0);
                  const isAssets = curveChartMode === 'assets';
                  let totalAssets = 0;
                  if (isAssets) {
                    if (selectedGroupForChart == null) {
                      groupKeys.forEach((k) => {
                        const d = groupData[k]?.aggregate;
                        if (d) totalAssets += d.total_assets ?? 0;
                      });
                    } else {
                      totalAssets = groupData[selectedGroupForChart]?.aggregate?.total_assets ?? 0;
                    }
                  }
                  const initialAssets = isAssets ? totalAssets - totalProfitInRange : 0;
                  let sum = 0;
                  const points: AssetChangePoint[] = sorted.map((p) => {
                    sum += p.profit;
                    return { date: p.date, cumulative: initialAssets + sum };
                  });
                  if (isAssets && points.length > 0 && initialAssets !== 0) {
                    const firstDate = new Date(points[0].date);
                    firstDate.setDate(firstDate.getDate() - 1);
                    points.unshift({ date: firstDate.toISOString().slice(0, 10), cumulative: initialAssets });
                  }
                  const chartLabel = isAssets ? '资产' : '累计盈亏';
                  return points.length > 0 ? (
                    <ResponsiveContainer width="100%" height={320}>
                      <LineChart
                        data={points}
                        margin={{ top: 8, right: 16, left: 8, bottom: 8 }}
                        onClick={(e: { activeLabel?: string | number }) => {
                          const label = e?.activeLabel;
                          const date = label != null ? String(label) : undefined;
                          if (date) setSelectedDailyDate(date);
                        }}
                      >
                        <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.08)" />
                        <XAxis dataKey="date" tick={{ fontSize: 11 }} stroke="#94a3b8" />
                        <YAxis
                          tick={{ fontSize: 11 }}
                          stroke="#94a3b8"
                          tickFormatter={(v) => (v >= 1e6 ? `${(v / 1e6).toFixed(1)}M` : v >= 1e3 ? `${(v / 1e3).toFixed(1)}K` : String(v))}
                        />
                        <Tooltip
                          contentStyle={{ background: '#1e293b', border: '1px solid rgba(255,255,255,0.08)', borderRadius: 8 }}
                          labelStyle={{ color: '#f1f5f9' }}
                          formatter={(value) => [formatMoney(Number(value ?? 0)), chartLabel]}
                          labelFormatter={(label) => `日期: ${label}（点击查看当日交易明细）`}
                        />
                        <Line
                          type="monotone"
                          dataKey="cumulative"
                          name={chartLabel}
                          stroke="#3b82f6"
                          strokeWidth={2}
                          dot={{
                            r: 4,
                            cursor: 'pointer',
                            onClick: (e: unknown) => {
                              const payload = (e as { payload?: AssetChangePoint })?.payload;
                              if (payload?.date) setSelectedDailyDate(payload.date);
                            },
                          }}
                        />
                      </LineChart>
                    </ResponsiveContainer>
                  ) : (
                    <div style={{ minHeight: 200, display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#94a3b8', fontSize: 13 }}>
                      暂无数据
                    </div>
                  );
                }
                const calendarNode = (
                  <ProfitCalendar
                    curve={monthCurve}
                    formatMoney={formatMoney}
                    onDayClick={dailyViewMode === 'calendar' ? (date) => setSelectedDailyDate(date) : undefined}
                  />
                );
                return calendarNode ?? (
                  <div style={{ minHeight: 200, display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#94a3b8', fontSize: 13 }}>
                    该月暂无数据
                  </div>
                );
              })()}
            </Card>
          </Col>
          {/* 右侧：分组卡片，选全部则展示所有卡片，选某组则只展示该组一张卡 */}
          <Col xs={24} lg={10}>
            <div className="dashboard-cards-panel">
              {selectedGroupForChart == null ? (
                <Row gutter={[12, 12]}>
                  {groupKeys.map((groupKey) => {
                    const data = groupData[groupKey];
                    const curve = dailyProfitByGroup[groupKey] || [];
                    const totalProfit = curve.reduce((s, p) => s + p.profit, 0);
                    const totalVolume = curve.reduce((s, p) => s + p.volume, 0);
                    const totalRate = totalVolume > 0 ? (totalProfit / totalVolume) * 100 : null;
                    return (
                      <Col xs={24} sm={12} key={groupKey}>
                        <Card
                          className={`polydash-account-card dashboard-group-card${selectedGroupForChart === groupKey ? ' dashboard-group-card-selected' : ''}`}
                          size="small"
                          onClick={() => setSelectedGroupForChart(groupKey)}
                        >
                          {data ? (
                            <>
                              <div className="polydash-account-header">
                                <div className="polydash-account-avatar">{groupKey.slice(0, 1).toUpperCase()}</div>
                                <div className="polydash-account-name">{groupKey}</div>
                              </div>
                              <div className="polydash-account-metrics">
                                <div className="polydash-metric">
                                  <span className="polydash-metric-label">TOTAL VALUE</span>
                                  <span className="polydash-metric-value">$ {formatAsset(data.aggregate.total_assets)}</span>
                                </div>
                                <div className="polydash-metric">
                                  <span className="polydash-metric-label">机器数量</span>
                                  <span className="polydash-metric-value">{data.aggregate.key_count ?? 0}</span>
                                </div>
                                {curve.length > 0 && (
                                  <>
                                    <div className="polydash-metric">
                                      <span className="polydash-metric-label">TOTAL PNL</span>
                                      <span className={`polydash-metric-value ${totalProfit >= 0 ? 'positive' : 'negative'}`}>
                                        {totalProfit >= 0 ? '+' : ''}{formatMoney(totalProfit)}
                                      </span>
                                    </div>
                                    <div className="polydash-metric">
                                      <span className="polydash-metric-label">MONTHLY ROI</span>
                                      <span className={`polydash-metric-value ${totalRate != null && totalRate >= 0 ? 'positive' : 'negative'}`}>
                                        {totalRate != null ? `${totalRate.toFixed(2)}%` : '–'}
                                      </span>
                                    </div>
                                  </>
                                )}
                              </div>
                            </>
                          ) : (
                            <div className="dashboard-card-loading">
                              <Spin tip="加载中…" />
                            </div>
                          )}
                        </Card>
                      </Col>
                    );
                  })}
                </Row>
              ) : (
                (() => {
                  const groupKey = selectedGroupForChart;
                  const data = groupData[groupKey];
                  const curve = dailyProfitByGroup[groupKey] || [];
                  const totalProfit = curve.reduce((s, p) => s + p.profit, 0);
                  const totalVolume = curve.reduce((s, p) => s + p.volume, 0);
                  const totalRate = totalVolume > 0 ? (totalProfit / totalVolume) * 100 : null;
                  return (
                    <Card
                      className="polydash-account-card dashboard-group-card dashboard-group-card-selected"
                      size="small"
                    >
                      {data ? (
                        <>
                          <div className="polydash-account-header">
                            <div className="polydash-account-avatar">{groupKey.slice(0, 1).toUpperCase()}</div>
                            <div className="polydash-account-name">{groupKey}</div>
                          </div>
                          <div className="polydash-account-metrics">
                            <div className="polydash-metric">
                              <span className="polydash-metric-label">TOTAL VALUE</span>
                              <span className="polydash-metric-value">$ {formatAsset(data.aggregate.total_assets)}</span>
                            </div>
                            <div className="polydash-metric">
                              <span className="polydash-metric-label">机器数量</span>
                              <span className="polydash-metric-value">{data.aggregate.key_count ?? 0}</span>
                            </div>
                            {curve.length > 0 && (
                              <>
                                <div className="polydash-metric">
                                  <span className="polydash-metric-label">TOTAL PNL</span>
                                  <span className={`polydash-metric-value ${totalProfit >= 0 ? 'positive' : 'negative'}`}>
                                    {totalProfit >= 0 ? '+' : ''}{formatMoney(totalProfit)}
                                  </span>
                                </div>
                                <div className="polydash-metric">
                                  <span className="polydash-metric-label">MONTHLY ROI</span>
                                  <span className={`polydash-metric-value ${totalRate != null && totalRate >= 0 ? 'positive' : 'negative'}`}>
                                    {totalRate != null ? `${totalRate.toFixed(2)}%` : '–'}
                                  </span>
                                </div>
                              </>
                            )}
                          </div>
                        </>
                      ) : (
                        <div className="dashboard-card-loading">
                          <Spin tip="加载中…" />
                        </div>
                      )}
                    </Card>
                  );
                })()
              )}
            </div>
          </Col>
        </Row>

        {/* 点击日历某天后展示：当日交易明细（含所有类型，与日历利润一致） */}
        {selectedDailyDate && (
          <Row style={{ marginTop: 16 }}>
            <Col span={24}>
              <Card
                className="polydash-calendar-card"
                title={
                  <span className="polydash-section-title">
                    当日交易明细
                    <span className="polydash-month-label" style={{ marginLeft: 8, fontWeight: 500 }}>
                      {selectedDailyDate}
                    </span>
                  </span>
                }
                extra={
                  <Button type="text" size="small" onClick={() => setSelectedDailyDate(null)}>
                    关闭
                  </Button>
                }
                size="small"
              >
                {dayRecordsLoading ? (
                  <div style={{ minHeight: 120, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                    <Spin tip="加载中…" />
                  </div>
                ) : dayRecords.length === 0 ? (
                  <div style={{ minHeight: 80, display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--polydash-text-muted)', fontSize: 13 }}>
                    该日暂无交易记录
                  </div>
                ) : (
                  (() => {
                    // 仅按 token_id 聚合：归一化后同一资产一行，多钱包的份额/金额/盈亏合计
                    const normalizeTokenId = (tid: string | undefined): string => {
                      const s = (tid ?? '').trim().toLowerCase();
                      return s.startsWith('0x') ? s.slice(2) : s;
                    };
                    const byTokenId = new Map<
                      string,
                      { tokenId: string; types: Set<string>; count: number; size: number; usdcSize: number; pnl: number; lastTs: number }
                    >();
                    const toNum = (v: unknown): number => {
                      if (typeof v === 'number' && !Number.isNaN(v)) return v;
                      const n = Number(v);
                      return Number.isNaN(n) ? 0 : n;
                    };
                    for (const r of dayRecords) {
                      const tidNorm = normalizeTokenId(r.token_id);
                      let cur = byTokenId.get(tidNorm);
                      if (!cur) {
                        cur = {
                          tokenId: tidNorm || (r.token_id ?? ''),
                          types: new Set(),
                          count: 0,
                          size: 0,
                          usdcSize: 0,
                          pnl: 0,
                          lastTs: 0,
                        };
                        byTokenId.set(tidNorm, cur);
                      }
                      cur.types.add(r.type || '');
                      cur.count += 1;
                      cur.size += toNum(r.size);
                      cur.usdcSize += toNum(r.usdc_size);
                      cur.pnl += toNum(r.pnl);
                      cur.lastTs = Math.max(cur.lastTs, r.ts ?? 0);
                    }
                    const aggregated = Array.from(byTokenId.values()).map((agg) => ({
                      ...agg,
                      typesStr: Array.from(agg.types).filter(Boolean).sort().join(', ') || '–',
                    }));
                    return (
                      <Table<DayAggRow>
                        size="small"
                        rowKey="tokenId"
                        dataSource={aggregated}
                        pagination={false}
                        scroll={{ x: 720 }}
                        summary={(pageData) => {
                          if (pageData.length === 0) return null;
                          const totalPnl = pageData.reduce((s, r) => s + (r.pnl ?? 0), 0);
                          return (
                            <Table.Summary fixed>
                              <Table.Summary.Row>
                                <Table.Summary.Cell index={0} colSpan={3} align="right">
                                  <span style={{ fontWeight: 600 }}>合计</span>
                                </Table.Summary.Cell>
                                <Table.Summary.Cell index={1} align="right">
                                  {pageData.reduce((s, r) => s + (r.count ?? 0), 0)}
                                </Table.Summary.Cell>
                                <Table.Summary.Cell index={2} align="right">
                                  {(pageData.reduce((s, r) => s + (r.size ?? 0), 0)).toFixed(2)}
                                </Table.Summary.Cell>
                                <Table.Summary.Cell index={3} align="right">
                                  {formatMoney(pageData.reduce((s, r) => s + (r.usdcSize ?? 0), 0))}
                                </Table.Summary.Cell>
                                <Table.Summary.Cell index={4} align="right">
                                  <span className={totalPnl >= 0 ? 'polydash-positive' : 'polydash-negative'}>
                                    {(totalPnl >= 0 ? '+' : '') + formatMoney(totalPnl)}
                                  </span>
                                </Table.Summary.Cell>
                              </Table.Summary.Row>
                            </Table.Summary>
                          );
                        }}
                        columns={[
                          {
                            title: '最后平仓时间',
                            dataIndex: 'lastTs',
                            width: 160,
                            sorter: (a, b) => (a.lastTs ?? 0) - (b.lastTs ?? 0),
                            sortDirections: ['descend', 'ascend'],
                            defaultSortOrder: 'descend',
                            render: (ts: number) => (ts ? new Date(ts * 1000).toLocaleString('zh-CN') : '–'),
                          },
                          {
                            title: '资产ID (token_id)',
                            dataIndex: 'tokenId',
                            width: 200,
                            ellipsis: { showTitle: true },
                            sorter: (a, b) => (a.tokenId ?? '').localeCompare(b.tokenId ?? ''),
                            sortDirections: ['ascend', 'descend'],
                            render: (tid: string) => tid ?? '–',
                          },
                          {
                            title: '类型',
                            dataIndex: 'typesStr',
                            width: 100,
                            sorter: (a, b) => (a.typesStr ?? '').localeCompare(b.typesStr ?? ''),
                            sortDirections: ['ascend', 'descend'],
                          },
                          {
                            title: '笔数',
                            dataIndex: 'count',
                            width: 72,
                            align: 'right',
                            sorter: (a, b) => (a.count ?? 0) - (b.count ?? 0),
                            sortDirections: ['ascend', 'descend'],
                          },
                          {
                            title: '份额合计',
                            dataIndex: 'size',
                            width: 110,
                            align: 'right',
                            sorter: (a, b) => (a.size ?? 0) - (b.size ?? 0),
                            sortDirections: ['ascend', 'descend'],
                            render: (v: number) => (v != null ? Number(v).toFixed(2) : '–'),
                          },
                          {
                            title: '金额合计 (USDC)',
                            dataIndex: 'usdcSize',
                            width: 130,
                            align: 'right',
                            sorter: (a, b) => (a.usdcSize ?? 0) - (b.usdcSize ?? 0),
                            sortDirections: ['ascend', 'descend'],
                            render: (v: number) => (v != null ? formatMoney(v) : '–'),
                          },
                          {
                            title: '盈亏合计',
                            dataIndex: 'pnl',
                            width: 110,
                            align: 'right',
                            sorter: (a, b) => (a.pnl ?? 0) - (b.pnl ?? 0),
                            sortDirections: ['ascend', 'descend'],
                            render: (v: number) =>
                              v != null ? (
                                <span className={v >= 0 ? 'polydash-positive' : 'polydash-negative'}>
                                  {v >= 0 ? '+' : ''}{formatMoney(v)}
                                </span>
                              ) : '–',
                          },
                        ]}
                      />
                    );
                  })()
                )}
              </Card>
            </Col>
          </Row>
        )}

        </>
      )}
    </>
  );

  if (noGroup) {
    return (
      <div className="polydash-dashboard" style={{ padding: 24 }}>
        <div style={{ marginBottom: 16 }}>
          {error && (
            <Alert type="error" message={error} closable onClose={() => setError(null)} style={{ marginBottom: 16 }} />
          )}
        </div>
        <Card>
          <Alert
            type="info"
            message="暂无卡片数据"
            description="卡片按 key_name 字母前缀分组展示：以字母开头的 key（如 ev_1、prod_2）会展示，以数字开头的 key 不会展示。请确保密钥的 key_name 以字母开头。"
          />
        </Card>
      </div>
    );
  }

  return (
    <div className="polydash-dashboard dashboard-layout">
      <aside className={`dashboard-sidebar ${sidebarCollapsed ? 'dashboard-sidebar-collapsed' : ''}`}>
        <div className="dashboard-sidebar-header">
          {!sidebarCollapsed && <span className="dashboard-sidebar-title">分组</span>}
          <Button
            type="text"
            size="small"
            icon={sidebarCollapsed ? <MenuUnfoldOutlined /> : <MenuFoldOutlined />}
            onClick={() => setSidebarCollapsed(!sidebarCollapsed)}
            className="dashboard-sidebar-toggle"
          />
        </div>
        <div
          className={`dashboard-sidebar-item${selectedGroupForChart === null ? ' dashboard-sidebar-item-active' : ''}`}
          onClick={() => setSelectedGroupForChart(null)}
        >
          {sidebarCollapsed ? '全' : '全部'}
        </div>
        {groupKeys.map((key) => (
          <div
            key={key}
            className={`dashboard-sidebar-item${selectedGroupForChart === key ? ' dashboard-sidebar-item-active' : ''}`}
            onClick={() => setSelectedGroupForChart(key)}
          >
            {sidebarCollapsed ? key.slice(0, 1) : key}
          </div>
        ))}
      </aside>
      <main className="dashboard-main">{mainContent}</main>
    </div>
  );
}
