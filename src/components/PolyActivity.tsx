/**
 * PolyActivity: 资金曲线看板（数据源: sharddb 分片数据库）
 * 左侧：分组列表 + 组内钱包列表
 * 右侧：统计卡片 + PnL 曲线 / Volume 图表
 */
import React, { useEffect, useState, useMemo, useCallback } from 'react';
import {
  Line,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  ComposedChart,
  ReferenceLine,
  Cell,
} from 'recharts';
import {
  sharddbAPI,
  type SharddbGroupItem,
  type SharddbEquityCurveResponse,
} from '../utils/api';
import './PolyActivity.css';

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
const addrShort = (w: string) => (w.length > 12 ? w.slice(0, 6) + '...' + w.slice(-4) : w);
const fmtDate = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

// 点击事件名称，查询父事件链接并新 tab 打开
const openMarket = (conditionId: string) => {
  if (!conditionId) return;
  sharddbAPI.getMarketURL(conditionId).then((res) => {
    if (res.url) window.open(res.url, '_blank');
  }).catch(() => {});
};

interface ChartPoint { date: string; daily: number; cumulative: number; volume: number; isWeekend: boolean }

type DailyItem = { date: string; day_pnl: number; cum_pnl: number; volume: number };
type SummaryData = {
  total_buy: number; total_sell: number; pnl: number;
  wins: number; losses: number; open_count: number; position_count: number;
};


/* ── PnL / Volume 日历 ── */
function ActivityCalendar({ daily, wallet, group, calMode, onModeChange, selectedDate, onSelectDate }: {
  daily: DailyItem[];
  wallet: string | null;
  group: string | null;
  calMode: 'pnl' | 'volume';
  onModeChange: (m: 'pnl' | 'volume') => void;
  selectedDate: string | null;
  onSelectDate: (d: string | null) => void;
}) {
  const todayStr = fmtDate(new Date());
  if (!daily || daily.length === 0) return null;

  // Build data map
  const dataMap: Record<string, { pnl: number; volume: number }> = {};
  for (const d of daily) dataMap[d.date] = { pnl: d.day_pnl, volume: d.volume };

  // Fill gaps
  const sortedDates = Object.keys(dataMap).sort();
  if (sortedDates.length >= 2) {
    const c = new Date(sortedDates[0] + 'T00:00:00');
    const last = new Date(sortedDates[sortedDates.length - 1] + 'T00:00:00');
    while (c <= last) {
      const ds = fmtDate(c);
      if (!dataMap[ds]) dataMap[ds] = { pnl: 0, volume: 0 };
      c.setDate(c.getDate() + 1);
    }
  }

  const allDates = Object.keys(dataMap).sort();
  const vals = allDates.map((d) => calMode === 'pnl' ? dataMap[d].pnl : dataMap[d].volume);
  const maxAbs = Math.max(...vals.map(Math.abs), 1);

  const greenLevels = ['#d1fae5', '#6ee7b7', '#34d399', '#059669'];
  const redLevels = ['#fee2e2', '#fca5a5', '#f87171', '#dc2626'];
  const blueLevels = ['#e0e7ff', '#a5b4fc', '#818cf8', '#4f46e5'];

  function cellColor(val: number): string {
    if (val === 0) return '#f1f5f9';
    const t = Math.sqrt(Math.min(Math.abs(val) / maxAbs, 1));
    const idx = t < 0.25 ? 0 : t < 0.5 ? 1 : t < 0.75 ? 2 : 3;
    if (calMode === 'volume') return blueLevels[idx];
    return val > 0 ? greenLevels[idx] : redLevels[idx];
  }

  function cellText(v: number): string {
    if (v === 0) return '';
    const a = Math.abs(v);
    const s = a >= 10000 ? (a / 1000).toFixed(0) + 'k' : a >= 1000 ? (a / 1000).toFixed(1) + 'k' : a.toFixed(1);
    return v < 0 ? '-' + s : s;
  }

  const firstDate = new Date(allDates[0] + 'T00:00:00');
  const lastDate = new Date(allDates[allDates.length - 1] + 'T00:00:00');
  const start = new Date(firstDate);
  const dow = start.getDay();
  start.setDate(start.getDate() - (dow === 0 ? 6 : dow - 1));

  type Cell = { date: string; val: number; inRange: boolean; day: number; month: number };
  const weeks: Cell[][] = [];
  const cur = new Date(start);
  let week: Cell[] = [];
  while (cur <= lastDate || week.length > 0) {
    const ds = fmtDate(cur);
    const inRange = cur >= firstDate && cur <= lastDate;
    const raw = dataMap[ds];
    const val = raw ? (calMode === 'pnl' ? raw.pnl : raw.volume) : 0;
    week.push({ date: ds, val, inRange, day: cur.getDate(), month: cur.getMonth() });
    if (week.length === 7) {
      weeks.push(week);
      week = [];
      if (cur > lastDate) break;
    }
    cur.setDate(cur.getDate() + 1);
  }

  const monthNames = ['1月', '2月', '3月', '4月', '5月', '6月', '7月', '8月', '9月', '10月', '11月', '12月'];

  return (
    <>
      <div className="pa-card">
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
          <h2 style={{ margin: 0 }}>{calMode === 'pnl' ? '盈亏' : '交易额'} 日历</h2>
          <div className="pa-chart-tabs">
            <button className={`pa-chart-tab${calMode === 'pnl' ? ' active' : ''}`} onClick={() => onModeChange('pnl')}>盈亏</button>
            <button className={`pa-chart-tab${calMode === 'volume' ? ' active' : ''}`} onClick={() => onModeChange('volume')}>交易额</button>
          </div>
        </div>
        <div className="pa-cal-wrap">
          <div className="pa-cal-days">
            {['一', '二', '三', '四', '五', '六', '日'].map((d, i) => <span key={i}>{d}</span>)}
          </div>
          <div className="pa-cal-grid">
            {[...weeks].reverse().map((wk, wi, arr) => (
              <div key={wi} className="pa-cal-week">
                {wi === 0 || wk[0].month !== arr[wi - 1]?.[0]?.month ? (
                  <div className="pa-cal-month-label">{monthNames[wk[0].month]}</div>
                ) : <div className="pa-cal-month-label" />}
                {wk.map((cell, ci) => {
                  if (!cell.inRange) return <div key={ci} className="pa-cal-cell empty" />;
                  const isSelected = cell.date === selectedDate;
                  return (
                    <div
                      key={ci}
                      className={`pa-cal-cell${isSelected ? ' selected' : ''}${cell.date === todayStr ? ' today' : ''}`}
                      style={{ background: isSelected ? 'var(--pa-accent)' : cellColor(cell.val) }}
                      onClick={() => (wallet || group) && onSelectDate(isSelected ? null : cell.date)}
                      title={`${cell.date}: ${calMode === 'pnl' ? '盈亏' : 'Vol'} ${fmt(cell.val)}`}
                    >
                      <span className="pa-cal-day">{cell.day}</span>
                      {cell.val !== 0 && <span className="pa-cal-val">{cellText(cell.val)}</span>}
                    </div>
                  );
                })}
              </div>
            ))}
          </div>
        </div>
      </div>

    </>
  );
}

export default function PolyActivity() {
  const [groups, setGroups] = useState<SharddbGroupItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [search, setSearch] = useState('');

  // Selection: group or single wallet within a group
  const [selectedGroup, setSelectedGroup] = useState<string | null>('_total');
  const [selectedWallet, setSelectedWallet] = useState<string | null>(null);

  // Data
  const [daily, setDaily] = useState<DailyItem[]>([]);
  const [summary, setSummary] = useState<SummaryData | null>(null);
  const [walletLabels, setWalletLabels] = useState<Record<string, string>>({});
  const [walletPnls, setWalletPnls] = useState<Record<string, number>>({});
  const [loadingData, setLoadingData] = useState(false);
  const [chartMode, setChartMode] = useState<'pnl' | 'volume'>('pnl');
  const [calMode, setCalMode] = useState<'pnl' | 'volume'>('pnl');
  const [equityCurve, setEquityCurve] = useState<SharddbEquityCurveResponse | null>(null);
  const [walletSortAsc, setWalletSortAsc] = useState(false); // default: descending
  const [totalExcluded, setTotalExcluded] = useState<Set<string>>(new Set(['chongwebdev', '_ungrouped', 'polysporttest']));
  const [excludeInited, setExcludeInited] = useState(false);

  // Load groups + wallet metadata
  useEffect(() => {
    setLoading(true);
    sharddbAPI.getGroups().then((g) => {
      setGroups(g);
      // 首次加载：自动排除所有以 _ 开头的分组
      if (!excludeInited) {
        setExcludeInited(true);
        setTotalExcluded((prev) => {
          const next = new Set(prev);
          for (const grp of g) {
            if (grp.group.startsWith('_')) next.add(grp.group);
          }
          return next;
        });
      }
      sharddbAPI.getWallets().then((ws) => {
        const labels: Record<string, string> = {};
        const pnls: Record<string, number> = {};
        for (const w of ws) {
          if (w.label) labels[w.wallet] = w.label;
          pnls[w.wallet] = w.pnl ?? 0;
        }
        setWalletLabels(labels);
        setWalletPnls(pnls);
      });
    }).catch(console.error).finally(() => setLoading(false));
  }, []);

  // Load detail when selection changes
  useEffect(() => {
    if (selectedWallet) {
      setLoadingData(true);
      sharddbAPI.getEquity(selectedWallet).then((res) => {
        setDaily(res.daily || []);
        setSummary(res.summary);
      }).catch(console.error).finally(() => setLoadingData(false));
      sharddbAPI.getEquityCurve(selectedWallet).then(setEquityCurve).catch(console.error);
    } else if (selectedGroup === '_total') {
      // Total: aggregate all non-excluded groups client-side
      setEquityCurve(null);
      setLoadingData(true);
      const includedGroups = groups.filter((g) => g.group !== '_total' && !totalExcluded.has(g.group));
      Promise.all(includedGroups.map((g) => sharddbAPI.getGroupEquity(g.group)))
        .then((results) => {
          // Merge daily data
          const dayMap = new Map<string, DailyItem>();
          const sum = { total_buy: 0, total_sell: 0, pnl: 0, wins: 0, losses: 0, open_count: 0, position_count: 0 };
          for (const res of results) {
            if (res.summary) {
              sum.total_buy += res.summary.total_buy || 0;
              sum.total_sell += res.summary.total_sell || 0;
              sum.pnl += res.summary.pnl || 0;
              sum.wins += res.summary.wins || 0;
              sum.losses += res.summary.losses || 0;
              sum.open_count += res.summary.open_count || 0;
              sum.position_count += res.summary.position_count || 0;
            }
            for (const d of (res.daily || [])) {
              const existing = dayMap.get(d.date);
              if (existing) {
                existing.day_pnl += d.day_pnl;
                existing.volume += d.volume;
              } else {
                dayMap.set(d.date, { ...d });
              }
            }
          }
          // Recalculate cum_pnl
          const sorted = [...dayMap.values()].sort((a, b) => a.date.localeCompare(b.date));
          let cum = 0;
          for (const d of sorted) { cum += d.day_pnl; d.cum_pnl = cum; }
          setDaily(sorted);
          setSummary(sum);
        })
        .catch(console.error)
        .finally(() => setLoadingData(false));
    } else if (selectedGroup) {
      setEquityCurve(null);
      setLoadingData(true);
      sharddbAPI.getGroupEquity(selectedGroup).then((res) => {
        setDaily(res.daily || []);
        setSummary(res.summary);
      }).catch(console.error).finally(() => setLoadingData(false));
    } else {
      setDaily([]);
      setSummary(null);
    }
  }, [selectedGroup, selectedWallet, selectedGroup === '_total' ? [...totalExcluded].join(',') : '']);

  const filteredGroups = useMemo(() => {
    if (!search.trim()) return groups;
    const q = search.toLowerCase();
    return groups.filter((g) => g.group.toLowerCase().includes(q));
  }, [groups, search]);

  const chartDataAll: ChartPoint[] = useMemo(() =>
    daily.map((d) => {
      const dow = new Date(d.date + 'T00:00:00').getDay();
      return { date: d.date, daily: d.day_pnl, cumulative: d.cum_pnl, volume: d.volume, isWeekend: dow === 0 || dow === 6 };
    }),
  [daily]);

  const [hiddenChartDates, setHiddenChartDates] = useState<Set<string>>(new Set());
  useEffect(() => { setHiddenChartDates(new Set()); }, [daily]);
  const chartData = chartDataAll.filter((d) => !hiddenChartDates.has(d.date));
  const chartScrollRef = useCallback((el: HTMLDivElement | null) => { if (el) el.scrollLeft = el.scrollWidth; }, [chartData.length]);

  // Day detail state
  const [selectedDate, setSelectedDate] = useState<string | null>(null);
  type EventItem = { title: string; condition_id: string; count: number; total_usdc: number; total_pnl: number };
  const [dailyEvents, setDailyEvents] = useState<EventItem[]>([]);
  const [loadingEvents, setLoadingEvents] = useState(false);
  const [detailSortAsc, setDetailSortAsc] = useState(false);
  const [expandedEvent, setExpandedEvent] = useState<string | null>(null);
  const [expandedDetail, setExpandedDetail] = useState<{ wallet: string; label: string; type: string; side: string; size: number; usdc_size: number; price: number; pnl?: number; ts: number }[]>([]);
  const [loadingEventDetail, setLoadingEventDetail] = useState(false);
  const [detailPnlAsc, setDetailPnlAsc] = useState(false);

  // Fetch daily events when selectedDate changes
  useEffect(() => {
    if (!selectedDate) { setDailyEvents([]); return; }
    const w = selectedWallet;
    const g = selectedWallet ? null : selectedGroup;
    if (!w && !g) { setDailyEvents([]); return; }
    setLoadingEvents(true);
    setExpandedEvent(null);

    let params: Record<string, string> = { date: selectedDate };
    if (g === '_total') {
      const excludedWallets = groups
        .filter((grp) => grp.group !== '_total' && totalExcluded.has(grp.group))
        .flatMap((grp) => grp.wallets || []);
      params.exclude_wallets = excludedWallets.join(',');
    } else if (w) {
      params.wallet = w;
    } else {
      params.group = g!;
    }
    sharddbAPI.getDailyEvents(params as any).then((res) => {
      const evts = res.events || [];
      if (detailSortAsc) evts.sort((a, b) => a.total_pnl - b.total_pnl);
      else evts.sort((a, b) => b.total_pnl - a.total_pnl);
      setDailyEvents(evts);
    }).catch(console.error).finally(() => setLoadingEvents(false));
  }, [selectedDate, selectedWallet, selectedGroup, selectedGroup === '_total' ? [...totalExcluded].join(',') : '']);

  // Fetch event detail when expanded
  useEffect(() => {
    if (!expandedEvent || !selectedDate) { setExpandedDetail([]); return; }
    const ev = dailyEvents.find((e) => e.title === expandedEvent);
    if (!ev?.condition_id) return;
    setLoadingEventDetail(true);
    sharddbAPI.getEventDetail(selectedDate, ev.condition_id)
      .then((res) => setExpandedDetail(res.records || []))
      .catch(console.error)
      .finally(() => setLoadingEventDetail(false));
  }, [expandedEvent, selectedDate]);

  // Reset selectedDate when wallet/group changes
  useEffect(() => { setSelectedDate(null); }, [selectedWallet, selectedGroup]);


  const activeGroupObj = groups.find((g) => g.group === selectedGroup);

  // Client-side total: recalculate from groups excluding _total, _ungrouped, and user-excluded
  const clientTotal = useMemo(() => {
    const t = { pnl: 0, wallet_count: 0, total_buy: 0, total_sell: 0, wins: 0, losses: 0, open_count: 0, position_count: 0, total_deposit: 0, total_withdraw: 0 };
    for (const g of groups) {
      if (g.group === '_total' || g.group === '_ungrouped' || totalExcluded.has(g.group)) continue;
      t.pnl += g.pnl;
      t.wallet_count += g.wallet_count;
      t.total_buy += g.total_buy;
      t.total_sell += g.total_sell;
      t.wins += g.wins;
      t.losses += g.losses;
      t.open_count += g.open_count;
      t.position_count += g.position_count;
      t.total_deposit += g.total_deposit ?? 0;
      t.total_withdraw += g.total_withdraw ?? 0;
    }
    return t;
  }, [groups, totalExcluded]);

  const toggleExclude = (grp: string) => {
    setTotalExcluded((prev) => {
      const next = new Set(prev);
      if (next.has(grp)) next.delete(grp); else next.add(grp);
      return next;
    });
  };

  // Select group handler
  const onGroupClick = (grp: string) => {
    if (selectedGroup === grp && !selectedWallet) {
      setSelectedGroup(null); // deselect
    } else {
      setSelectedGroup(grp);
      setSelectedWallet(null); // show group aggregate
    }
  };

  const onWalletClick = (wallet: string) => {
    if (selectedWallet === wallet) {
      setSelectedWallet(null); // back to group view
    } else {
      setSelectedWallet(wallet);
    }
  };

  const totalPnl = summary?.pnl ?? 0;

  return (
    <div className="pa-root">
      <div className="pa-header">
        <h1>PolyActivity</h1>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <span style={{ fontSize: 13, color: 'var(--pa-text2)' }}>{groups.length} 分组</span>
          <button className="pa-chart-tab" style={{ fontSize: 11, padding: '3px 10px' }} onClick={() => {
            setLoading(true);
            sharddbAPI.getGroups().then((g) => {
              setGroups(g);
              sharddbAPI.getWallets().then((ws) => {
                const labels: Record<string, string> = {};
                const pnls: Record<string, number> = {};
                for (const w of ws) { if (w.label) labels[w.wallet] = w.label; pnls[w.wallet] = w.pnl ?? 0; }
                setWalletLabels(labels); setWalletPnls(pnls);
              });
            }).catch(console.error).finally(() => setLoading(false));
          }}>刷新</button>
        </div>
      </div>

      <div className="pa-layout">
        {/* ── Sidebar: groups + wallets ── */}
        <div className="pa-sidebar">
          <input
            className="pa-search"
            placeholder="搜索分组..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
          {loading ? (
            <div className="pa-loading"><div className="pa-spinner" />加载中...</div>
          ) : (
            <div className="pa-group-list">
              {filteredGroups.map((g) => (
                <div key={g.group}>
                  {g.group === '_total' ? (
                    <>
                      <div
                        className={`pa-group-item total${selectedGroup === '_total' ? ' active' : ''}`}
                        onClick={() => onGroupClick('_total')}
                      >
                        <div className="pa-group-left">
                          <span className="pa-group-name">Total</span>
                          <span className="pa-group-count">{clientTotal.wallet_count} wallets</span>
                        </div>
                        <div className={`pa-group-pnl${clientTotal.pnl >= 0 ? ' pos' : ' neg'}`}>
                          {fmtShort(clientTotal.pnl)}
                        </div>
                      </div>
                      {selectedGroup === '_total' && (
                        <div className="pa-exclude-list">
                          <div className="pa-exclude-title">Exclude from Total:</div>
                          {groups.filter((gg) => gg.group !== '_total' && gg.group !== '_ungrouped').map((gg) => (
                            <label key={gg.group} className="pa-exclude-item">
                              <input
                                type="checkbox"
                                checked={totalExcluded.has(gg.group)}
                                onChange={() => toggleExclude(gg.group)}
                              />
                              <span>{gg.group}</span>
                              <span className={`pa-ws-pnl${gg.pnl >= 0 ? ' pos' : ' neg'}`}>{fmtShort(gg.pnl)}</span>
                            </label>
                          ))}
                        </div>
                      )}
                    </>
                  ) : (
                  <>
                  <div
                    className={`pa-group-item${selectedGroup === g.group ? ' active' : ''}`}
                    onClick={() => onGroupClick(g.group)}
                  >
                    <div className="pa-group-left">
                      <span className="pa-group-name">{g.group}</span>
                      <span className="pa-group-count">{g.wallet_count} wallets</span>
                    </div>
                    <div className={`pa-group-pnl${g.pnl >= 0 ? ' pos' : ' neg'}`}>
                      {fmtShort(g.pnl)}
                    </div>
                  </div>
                  </>
                  )}
                  {/* Expanded wallet list */}
                  {selectedGroup === g.group && g.group !== '_total' && g.wallets && (
                    <div className="pa-wallet-sublist">
                      <div
                        className="pa-wallet-subheader"
                        onClick={() => setWalletSortAsc((v) => !v)}
                        title="Click to toggle sort"
                      >
                        <span>Wallet</span>
                        <span>PnL {walletSortAsc ? '\u25B2' : '\u25BC'}</span>
                      </div>
                      {[...g.wallets]
                        .sort((a, b) => walletSortAsc
                          ? (walletPnls[a] ?? 0) - (walletPnls[b] ?? 0)
                          : (walletPnls[b] ?? 0) - (walletPnls[a] ?? 0))
                        .map((w) => {
                          const pnl = walletPnls[w] ?? 0;
                          return (
                            <div
                              key={w}
                              className={`pa-wallet-subitem${selectedWallet === w ? ' active' : ''}`}
                              onClick={() => onWalletClick(w)}
                              title={w}
                            >
                              <span className="pa-ws-label">{walletLabels[w] || addrShort(w)}</span>
                              <span className={`pa-ws-pnl${pnl >= 0 ? ' pos' : ' neg'}`}>{fmtShort(pnl)}</span>
                            </div>
                          );
                        })}
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>

        {/* ── Main panel ── */}
        <div className="pa-main">
          {!selectedGroup ? (
            <div className="pa-empty" style={{ height: '100%' }}>选择分组</div>
          ) : (
            <>
              {/* Breadcrumb */}
              <div className="pa-breadcrumb">
                <span className="pa-bc-group" onClick={() => setSelectedWallet(null)} style={{ cursor: 'pointer' }}>
                  {selectedGroup}
                  {activeGroupObj && <span className="pa-bc-count"> ({activeGroupObj.wallet_count})</span>}
                </span>
                {selectedWallet && (
                  <span className="pa-bc-wallet"> / {walletLabels[selectedWallet] || addrShort(selectedWallet)}</span>
                )}
              </div>

              {/* Stats */}
              {summary && (
                <div className="pa-stats">
                  <div className="pa-stat-card">
                    <div className="label">总盈亏</div>
                    <div className={`value${totalPnl >= 0 ? ' pos' : ' neg'}`}>{fmt(totalPnl)}</div>
                  </div>
                  {(() => {
                    // 存取款数据：单钱包用 equityCurve，分组用 groups 数据
                    let dep = 0, wit = 0, hasData = false;
                    if (selectedWallet && equityCurve) {
                      dep = equityCurve.total_deposit; wit = equityCurve.total_withdraw; hasData = true;
                    } else if (selectedGroup === '_total') {
                      dep = clientTotal.total_deposit ?? 0; wit = clientTotal.total_withdraw ?? 0; hasData = dep > 0 || wit > 0;
                    } else if (selectedGroup && activeGroupObj) {
                      dep = activeGroupObj.total_deposit ?? 0; wit = activeGroupObj.total_withdraw ?? 0; hasData = dep > 0 || wit > 0;
                    }
                    return hasData ? (
                      <div className="pa-stat-card">
                        <div className="label">存取款</div>
                        <div className="value" style={{ fontSize: 16 }}>
                          净 {fmt(dep - wit)}
                        </div>
                        <div className="sub">
                          <span style={{ color: 'var(--pa-green)' }}>入 {fmtShort(dep)}</span>
                          {' / '}
                          <span style={{ color: 'var(--pa-red)' }}>出 {fmtShort(wit)}</span>
                        </div>
                      </div>
                    ) : null;
                  })()}
                  <div className="pa-stat-card">
                    <div className="label">总买入</div>
                    <div className="value">{fmtShort(summary.total_buy)}</div>
                    <div className="sub">卖出: {fmtShort(summary.total_sell)}</div>
                  </div>
                  <div className="pa-stat-card">
                    <div className="label">胜/负</div>
                    <div className="value">
                      <span style={{ color: 'var(--pa-green)' }}>{summary.wins}</span>
                      {' / '}
                      <span style={{ color: 'var(--pa-red)' }}>{summary.losses}</span>
                    </div>
                    <div className="sub">持仓: {summary.open_count}</div>
                  </div>
                </div>
              )}

              {/* 日历 (left) + PnL Chart (right) side by side */}
              <div className="pa-row">
                {/* 日历 */}
                {daily.length > 0 && (
                  <div className="pa-row-left">
                    <ActivityCalendar
                      daily={daily}
                      wallet={selectedWallet}
                      group={selectedWallet ? null : selectedGroup}
                      calMode={calMode}
                      onModeChange={setCalMode}
                      selectedDate={selectedDate}
                      onSelectDate={setSelectedDate}
                    />
                  </div>
                )}

                {/* PnL Chart */}
                <div className="pa-row-right">
                  <div className="pa-card">
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
                      <div className="pa-chart-tabs">
                        <button className={`pa-chart-tab${chartMode === 'pnl' ? ' active' : ''}`} onClick={() => setChartMode('pnl')}>
                          盈亏
                        </button>
                        <button className={`pa-chart-tab${chartMode === 'volume' ? ' active' : ''}`} onClick={() => setChartMode('volume')}>
                          交易额
                        </button>
                      </div>
                      {hiddenChartDates.size > 0 && (
                        <button className="pa-chart-tab" onClick={() => setHiddenChartDates(new Set())} style={{ fontSize: 11 }}>
                          重置 ({hiddenChartDates.size})
                        </button>
                      )}
                    </div>
                    <div className="pa-chart-scroll" ref={chartScrollRef}>
                      {loadingData ? (
                        <div className="pa-loading"><div className="pa-spinner" />加载中...</div>
                      ) : chartData.length > 0 ? (
                        <div style={{ width: Math.max(chartData.length * 28, 300), minWidth: '100%', height: '100%' }}>
                          <ResponsiveContainer width="100%" height="100%">
                            <ComposedChart
                              data={chartData}
                              margin={{ top: 8, right: 16, left: 8, bottom: 8 }}
                              onClick={(e) => {
                                if (e?.activeLabel) {
                                  setHiddenChartDates((prev) => { const n = new Set(prev); n.add(e.activeLabel as string); return n; });
                                }
                              }}
                              style={{ cursor: 'pointer' }}
                            >
                              <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                              <XAxis dataKey="date" tick={{ fontSize: 10, fill: '#94a3b8' }} stroke="#e2e8f0" />
                              <YAxis yAxisId="left" tick={{ fontSize: 10, fill: '#94a3b8' }} stroke="#e2e8f0" tickFormatter={(v) => fmtShort(v)} domain={['auto', 'auto']} />
                              <ReferenceLine yAxisId="left" y={0} stroke="#94a3b8" strokeWidth={1.5} />
                              <Tooltip
                                contentStyle={{ background: '#ffffff', border: '1px solid #e2e8f0', borderRadius: 10, fontSize: 12, boxShadow: '0 4px 16px rgba(15,23,42,0.1)' }}
                                labelStyle={{ color: '#64748b' }}
                                formatter={(value, name) => {
                                  const v = fmt(Number(value ?? 0));
                                  if (name === 'daily') return [v, '当日盈亏'];
                                  if (name === 'volume') return [v, '交易额'];
                                  return [v, String(name)];
                                }}
                              />
                              {chartMode === 'volume' ? (
                                <>
                                  <YAxis yAxisId="right" orientation="right" tick={{ fontSize: 10, fill: '#94a3b8' }} stroke="#e2e8f0" tickFormatter={(v) => fmtShort(v)} domain={['auto', 'auto']} />
                                  <Bar dataKey="volume" yAxisId="left" radius={[4, 4, 0, 0]}>
                                    {chartData.map((d, i) => (
                                      <Cell key={i} fill={d.isWeekend ? '#d97706' : 'rgba(79,70,229,0.6)'} />
                                    ))}
                                  </Bar>
                                  <Line type="monotone" dataKey="daily" yAxisId="right" stroke="#d97706" strokeWidth={1.5} dot={false} />
                                </>
                              ) : (
                                <Bar dataKey="daily" yAxisId="left" radius={[4, 4, 0, 0]}>
                                  {chartData.map((d, i) => (
                                    <Cell key={i} fill={d.daily >= 0
                                      ? (d.isWeekend ? '#d97706' : 'rgba(5,150,105,0.7)')
                                      : (d.isWeekend ? '#b91c1c' : 'rgba(220,38,38,0.7)')} />
                                  ))}
                                </Bar>
                              )}
                            </ComposedChart>
                          </ResponsiveContainer>
                        </div>
                      ) : (
                        <div className="pa-empty">暂无数据</div>
                      )}
                    </div>
                  </div>

                </div>
              </div>

              {/* 交易明细（日历和图表下方，全宽） */}
              {selectedDate && (
                <div className="pa-card">
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
                    <h2 style={{ margin: 0 }}>{selectedDate} 交易明细</h2>
                    <button className="pa-chart-tab" style={{ fontSize: 11, padding: '3px 10px' }} onClick={() => {
                      const text = '市场\t事件\t笔数\t金额\t盈亏\n' + dailyEvents.map((ev) =>
                        `${ev.condition_id.slice(0,10)}\t${ev.title}\t${ev.count}\t${ev.total_usdc.toFixed(2)}\t${ev.total_pnl.toFixed(2)}`
                      ).join('\n');
                      navigator.clipboard.writeText(text).then(() => {
                        const btn = document.activeElement as HTMLButtonElement;
                        const orig = btn.textContent;
                        btn.textContent = '已复制';
                        setTimeout(() => { btn.textContent = orig; }, 1500);
                      });
                    }}>复制</button>
                  </div>
                  {loadingEvents ? (
                    <div className="pa-loading"><div className="pa-spinner" />加载中...</div>
                  ) : dailyEvents.length > 0 ? (
                    <div className="pa-table-wrap">
                      <table className="pa-table">
                        <thead>
                          <tr>
                            <th>市场</th>
                            <th>事件</th>
                            <th style={{ textAlign: 'right' }}>笔数</th>
                            <th style={{ textAlign: 'right' }}>金额</th>
                            <th className="pa-th-sort" style={{ textAlign: 'right' }} onClick={() => {
                              setDetailSortAsc((v) => !v);
                              setDailyEvents((prev) => [...prev].sort((a, b) => !detailSortAsc ? a.total_pnl - b.total_pnl : b.total_pnl - a.total_pnl));
                            }}>
                              盈亏 {detailSortAsc ? '\u25B2' : '\u25BC'}
                            </th>
                          </tr>
                        </thead>
                        <tbody>
                          {dailyEvents.map((ev, i) => (
                            <React.Fragment key={i}>
                              <tr style={{ cursor: 'pointer' }} onClick={() => setExpandedEvent(expandedEvent === ev.title ? null : ev.title)}>
                                <td style={{ fontFamily: 'ui-monospace, monospace', fontSize: 11 }}>
                                  {ev.condition_id ? (
                                    <span className="pa-market-link" onClick={(e) => { e.stopPropagation(); openMarket(ev.condition_id); }} title={ev.condition_id}>{ev.condition_id.slice(0, 10)}...</span>
                                  ) : '-'}
                                </td>
                                <td style={{ fontSize: 12, maxWidth: 300, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={ev.title}>
                                  <span style={{ marginRight: 4, fontSize: 10, color: 'var(--pa-text2)' }}>{expandedEvent === ev.title ? '\u25BC' : '\u25B6'}</span>
                                  {ev.title}
                                </td>
                                <td style={{ textAlign: 'right' }}>{ev.count}</td>
                                <td style={{ textAlign: 'right' }}>{fmt(ev.total_usdc)}</td>
                                <td style={{ textAlign: 'right', color: ev.total_pnl >= 0 ? 'var(--pa-green)' : 'var(--pa-red)', fontWeight: 600 }}>{fmt(ev.total_pnl)}</td>
                              </tr>
                              {expandedEvent === ev.title && (
                                <tr><td colSpan={5} style={{ padding: 0 }}>
                                  {loadingEventDetail ? (
                                    <div className="pa-loading" style={{ height: 60 }}><div className="pa-spinner" /></div>
                                  ) : (
                                    <div className="pa-event-detail">
                                      <div className="pa-event-wallet" style={{ borderBottom: '1px solid var(--pa-border)', paddingBottom: 4, marginBottom: 4 }}>
                                        <span className="pa-ew-name" style={{ color: 'var(--pa-text3)', fontSize: 11 }}>钱包</span>
                                        <span className="pa-ew-info" style={{ color: 'var(--pa-text3)', fontSize: 11 }}>操作</span>
                                        <span className="pa-ew-pnl pa-th-sort" style={{ color: 'var(--pa-text3)', fontSize: 11 }} onClick={() => setDetailPnlAsc((v) => !v)}>
                                          盈亏 {detailPnlAsc ? '\u25B2' : '\u25BC'}
                                        </span>
                                      </div>
                                      {[...expandedDetail].sort((a, b) => detailPnlAsc ? (a.pnl ?? 0) - (b.pnl ?? 0) : (b.pnl ?? 0) - (a.pnl ?? 0)).map((r, ri) => {
                                        const action = r.type === 'TRADE' ? r.side : r.type;
                                        return (
                                          <div key={ri} className="pa-event-wallet">
                                            <span className="pa-ew-name">{r.label || addrShort(r.wallet)}</span>
                                            <span className="pa-ew-info">
                                              <span className="pa-ew-rec">{action} {fmt(r.usdc_size)} @{r.price > 0 ? r.price.toFixed(3) : '-'}</span>
                                            </span>
                                            <span className={`pa-ew-pnl${(r.pnl ?? 0) >= 0 ? ' pos' : ' neg'}`}>{r.pnl != null ? fmt(r.pnl) : '-'}</span>
                                          </div>
                                        );
                                      })}
                                    </div>
                                  )}
                                </td></tr>
                              )}
                            </React.Fragment>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  ) : (
                    <div className="pa-empty" style={{ height: 80 }}>无记录</div>
                  )}
                </div>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
}
