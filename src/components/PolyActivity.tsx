/**
 * PolyActivity: 资金曲线看板（数据源: sharddb 分片数据库）
 * 左侧：分组列表 + 组内钱包列表
 * 右侧：统计卡片 + PnL 曲线 / Volume 图表
 */
import React, { useEffect, useState, useMemo, useCallback } from 'react';
import {
  Line,
  Bar,
  Area,
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
  type SharddbRecordItem,
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
  if (!daily || daily.length === 0) return null;

  // Build data map
  const dataMap: Record<string, { pnl: number; volume: number }> = {};
  for (const d of daily) dataMap[d.date] = { pnl: d.day_pnl, volume: d.volume };

  // Helper: format Date as YYYY-MM-DD in local timezone (avoid toISOString UTC shift)
  const fmtDate = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

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
                      className={`pa-cal-cell${isSelected ? ' selected' : ''}`}
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
  const [selectedGroup, setSelectedGroup] = useState<string | null>(null);
  const [selectedWallet, setSelectedWallet] = useState<string | null>(null);

  // Data
  const [daily, setDaily] = useState<DailyItem[]>([]);
  const [summary, setSummary] = useState<SummaryData | null>(null);
  const [walletLabels, setWalletLabels] = useState<Record<string, string>>({});
  const [walletPnls, setWalletPnls] = useState<Record<string, number>>({});
  const [loadingDetail, setLoadingDetail] = useState(false);
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
      setLoadingDetail(true);
      sharddbAPI.getEquity(selectedWallet).then((res) => {
        setDaily(res.daily || []);
        setSummary(res.summary);
      }).catch(console.error).finally(() => setLoadingDetail(false));
      sharddbAPI.getEquityCurve(selectedWallet).then(setEquityCurve).catch(console.error);
    } else if (selectedGroup === '_total') {
      // Total: aggregate all non-excluded groups client-side
      setEquityCurve(null);
      setLoadingDetail(true);
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
        .finally(() => setLoadingDetail(false));
    } else if (selectedGroup) {
      setEquityCurve(null);
      setLoadingDetail(true);
      sharddbAPI.getGroupEquity(selectedGroup).then((res) => {
        setDaily(res.daily || []);
        setSummary(res.summary);
      }).catch(console.error).finally(() => setLoadingDetail(false));
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

  // Day detail state (shared between calendar click and detail panel)
  const [selectedDate, setSelectedDate] = useState<string | null>(null);
  const [detailRecords, setDetailRecords] = useState<SharddbRecordItem[]>([]);
  const [loadingRecords, setLoadingRecords] = useState(false);
  const [hiddenTypes, setHiddenTypes] = useState<Set<string>>(new Set(['BUY']));
  const [detailSortKey, setDetailSortKey] = useState<'ts' | 'type' | 'usdc_size' | 'pnl'>('pnl');
  const [detailSortAsc, setDetailSortAsc] = useState(false);
  const [expandedEvent, setExpandedEvent] = useState<string | null>(null);

  const toggleDetailSort = (key: typeof detailSortKey) => {
    if (detailSortKey === key) setDetailSortAsc((v) => !v);
    else { setDetailSortKey(key); setDetailSortAsc(false); }
  };

  // Fetch records when selectedDate changes
  useEffect(() => {
    if (!selectedDate) { setDetailRecords([]); return; }
    const w = selectedWallet;
    const g = selectedWallet ? null : selectedGroup;
    if (!w && !g) { setDetailRecords([]); return; }
    setLoadingRecords(true);

    if (g === '_total') {
      // Total: query all wallets but exclude the ones in excluded groups
      const excludedWallets = groups
        .filter((grp) => grp.group !== '_total' && totalExcluded.has(grp.group))
        .flatMap((grp) => grp.wallets || []);
      const params = { exclude_wallets: excludedWallets.join(','), from: selectedDate, to: selectedDate };
      sharddbAPI.getRecords(params).then((res) => setDetailRecords(res.list || [])).catch(console.error).finally(() => setLoadingRecords(false));
    } else {
      const params = w ? { wallet: w, from: selectedDate, to: selectedDate } : { group: g!, from: selectedDate, to: selectedDate };
      sharddbAPI.getRecords(params).then((res) => setDetailRecords(res.list || [])).catch(console.error).finally(() => setLoadingRecords(false));
    }
  }, [selectedDate, selectedWallet, selectedGroup, selectedGroup === '_total' ? [...totalExcluded].join(',') : '']);

  // Reset selectedDate when wallet/group changes
  useEffect(() => { setSelectedDate(null); }, [selectedWallet, selectedGroup]);

  const detailAllTypes = useMemo(() => {
    const s = new Set<string>();
    for (const r of detailRecords) s.add(r.type === 'TRADE' ? r.side : r.type);
    return [...s].sort();
  }, [detailRecords]);

  const detailFiltered = useMemo(() =>
    detailRecords.filter((r) => !hiddenTypes.has(r.type === 'TRADE' ? r.side : r.type)),
  [detailRecords, hiddenTypes]);

  type WalletDetail = { wallet: string; pnl: number; usdc: number; records: SharddbRecordItem[] };
  const eventSummary = useMemo(() => {
    const map = new Map<string, { title: string; totalPnl: number; totalUsdc: number; count: number; wallets: Map<string, WalletDetail> }>();
    for (const r of detailFiltered) {
      if (r.pnl == null) continue;
      const key = r.title || (r.type === 'MAKER_REBATE' ? '做市奖励' : r.token_id) || 'unknown';
      let ev = map.get(key);
      if (!ev) { ev = { title: key, totalPnl: 0, totalUsdc: 0, count: 0, wallets: new Map() }; map.set(key, ev); }
      ev.totalPnl += r.pnl; ev.totalUsdc += r.usdc_size; ev.count++;
      const wd = ev.wallets.get(r.wallet) ?? { wallet: r.wallet, pnl: 0, usdc: 0, records: [] };
      wd.pnl += r.pnl; wd.usdc += r.usdc_size; wd.records.push(r); ev.wallets.set(r.wallet, wd);
    }
    const arr = [...map.values()];
    arr.sort((a, b) => detailSortAsc ? a.totalPnl - b.totalPnl : b.totalPnl - a.totalPnl);
    return arr;
  }, [detailFiltered, detailSortAsc]);

  const sortedDetailRecords = useMemo(() => {
    const arr = [...detailFiltered];
    arr.sort((a, b) => {
      let va: number, vb: number;
      switch (detailSortKey) {
        case 'ts': va = a.ts; vb = b.ts; break;
        case 'type': { const ta = a.type === 'TRADE' ? a.side : a.type; const tb = b.type === 'TRADE' ? b.side : b.type; return detailSortAsc ? ta.localeCompare(tb) : tb.localeCompare(ta); }
        case 'usdc_size': va = a.usdc_size; vb = b.usdc_size; break;
        case 'pnl': va = a.pnl ?? -Infinity; vb = b.pnl ?? -Infinity; break;
        default: va = a.ts; vb = b.ts;
      }
      return detailSortAsc ? va - vb : vb - va;
    });
    return arr;
  }, [detailFiltered, detailSortKey, detailSortAsc]);

  const isGroupMode = !selectedWallet && !!selectedGroup;

  const activeGroupObj = groups.find((g) => g.group === selectedGroup);

  // Client-side total: recalculate from groups excluding _total, _ungrouped, and user-excluded
  const clientTotal = useMemo(() => {
    const t = { pnl: 0, wallet_count: 0, total_buy: 0, total_sell: 0, wins: 0, losses: 0, open_count: 0, position_count: 0 };
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
        <span style={{ fontSize: 13, color: 'var(--pa-text2)' }}>
          {groups.length} groups
        </span>
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
                  {selectedWallet && equityCurve && (
                    <div className="pa-stat-card">
                      <div className="label">存取款</div>
                      <div className="value" style={{ fontSize: 16 }}>
                        净 {fmt(equityCurve.total_deposit - equityCurve.total_withdraw)}
                      </div>
                      <div className="sub">
                        <span style={{ color: 'var(--pa-green)' }}>入 {fmtShort(equityCurve.total_deposit)}</span>
                        {' / '}
                        <span style={{ color: 'var(--pa-red)' }}>出 {fmtShort(equityCurve.total_withdraw)}</span>
                      </div>
                    </div>
                  )}
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
                      {loadingDetail ? (
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

                  {/* Equity Curve */}
                  {selectedWallet && equityCurve && equityCurve.curve.length > 0 && (
                    <div className="pa-card" style={{ marginTop: 16 }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12, flexWrap: 'wrap', gap: 8 }}>
                        <h2 style={{ margin: 0, fontSize: 14 }}>账户资金</h2>
                        <div style={{ fontSize: 11, color: 'var(--pa-text2)', display: 'flex', gap: 12 }}>
                          <span>充值: <b style={{ color: 'var(--pa-green)' }}>{fmtShort(equityCurve.total_deposit)}</b></span>
                          <span>提现: <b style={{ color: 'var(--pa-red)' }}>{fmtShort(equityCurve.total_withdraw)}</b></span>
                          <span>PnL: <b style={{ color: equityCurve.total_pnl >= 0 ? 'var(--pa-green)' : 'var(--pa-red)' }}>{fmtShort(equityCurve.total_pnl)}</b></span>
                        </div>
                      </div>
                      <div style={{ height: 200 }}>
                        <ResponsiveContainer width="100%" height={200}>
                          <ComposedChart data={equityCurve.curve} margin={{ top: 4, right: 12, left: 4, bottom: 4 }}>
                            <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                            <XAxis dataKey="date" tick={{ fontSize: 9, fill: '#94a3b8' }} stroke="#e2e8f0" />
                            <YAxis yAxisId="left" tick={{ fontSize: 9, fill: '#94a3b8' }} stroke="#e2e8f0" tickFormatter={(v) => fmtShort(v)} />
                            <Tooltip
                              contentStyle={{ background: '#ffffff', border: '1px solid #e2e8f0', borderRadius: 10, fontSize: 11, boxShadow: '0 4px 16px rgba(15,23,42,0.1)' }}
                              formatter={(value, name) => [fmt(Number(value ?? 0)), name === 'equity' ? '权益' : '盈亏']}
                            />
                            <Area type="monotone" dataKey="equity" yAxisId="left" stroke="#4f46e5" strokeWidth={1.5} fill="rgba(79,70,229,0.06)" dot={false} />
                          </ComposedChart>
                        </ResponsiveContainer>
                      </div>
                    </div>
                  )}
                </div>
              </div>

              {/* 交易明细（日历和图表下方，全宽） */}
              {selectedDate && (
                <div className="pa-card">
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12, flexWrap: 'wrap', gap: 8 }}>
                    <h2 style={{ margin: 0 }}>{selectedDate} 交易明细</h2>
                    <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                      <div className="pa-type-filters">
                        {detailAllTypes.map((t) => {
                          const hidden = hiddenTypes.has(t);
                          const cls = t === 'BUY' ? 'type-buy' : t === 'SELL' ? 'type-sell' : t === 'REDEEM' ? 'type-redeem' : 'type-other';
                          return (
                            <button key={t} className={`pa-type-btn${hidden ? ' hidden' : ''} ${cls}`} onClick={() => setHiddenTypes((prev) => { const n = new Set(prev); if (n.has(t)) n.delete(t); else n.add(t); return n; })}>
                              {t}
                            </button>
                          );
                        })}
                      </div>
                    </div>
                  </div>
                  {loadingRecords ? (
                    <div className="pa-loading"><div className="pa-spinner" />加载中...</div>
                  ) : detailRecords.length > 0 ? (
                    <>
                      {isGroupMode ? (
                        <div className="pa-table-wrap">
                          <table className="pa-table">
                            <thead>
                              <tr>
                                <th>事件</th>
                                <th style={{ textAlign: 'right' }}>笔数</th>
                                <th style={{ textAlign: 'right' }}>金额</th>
                                <th className="pa-th-sort" style={{ textAlign: 'right' }} onClick={() => setDetailSortAsc((v) => !v)}>
                                  盈亏 {detailSortAsc ? '\u25B2' : '\u25BC'}
                                </th>
                              </tr>
                            </thead>
                            <tbody>
                              {eventSummary.map((ev, i) => (
                                <React.Fragment key={i}>
                                  <tr style={{ cursor: 'pointer' }} onClick={() => setExpandedEvent(expandedEvent === ev.title ? null : ev.title)}>
                                    <td style={{ fontSize: 12, maxWidth: 300, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={ev.title}>
                                      <span style={{ marginRight: 4, fontSize: 10, color: 'var(--pa-text2)' }}>{expandedEvent === ev.title ? '\u25BC' : '\u25B6'}</span>
                                      {ev.title}
                                    </td>
                                    <td style={{ textAlign: 'right' }}>{ev.count}</td>
                                    <td style={{ textAlign: 'right' }}>{fmt(ev.totalUsdc)}</td>
                                    <td style={{ textAlign: 'right', color: ev.totalPnl >= 0 ? 'var(--pa-green)' : 'var(--pa-red)', fontWeight: 600 }}>{fmt(ev.totalPnl)}</td>
                                  </tr>
                                  {expandedEvent === ev.title && (
                                    <tr><td colSpan={4} style={{ padding: 0 }}>
                                      <div className="pa-event-detail">
                                        {[...ev.wallets.values()].sort((a, b) => b.pnl - a.pnl).map((wd) => (
                                          <div key={wd.wallet} className="pa-event-wallet">
                                            <span className="pa-ew-name">{walletLabels[wd.wallet] || addrShort(wd.wallet)}</span>
                                            <span className="pa-ew-info">
                                              {wd.records.map((r, ri) => { const action = r.type === 'TRADE' ? r.side : r.type; return <span key={ri} className="pa-ew-rec">{action} {fmt(r.usdc_size)} @{r.price > 0 ? r.price.toFixed(3) : '-'}</span>; })}
                                            </span>
                                            <span className={`pa-ew-pnl${wd.pnl >= 0 ? ' pos' : ' neg'}`}>{fmt(wd.pnl)}</span>
                                          </div>
                                        ))}
                                      </div>
                                    </td></tr>
                                  )}
                                </React.Fragment>
                              ))}
                            </tbody>
                          </table>
                        </div>
                      ) : (
                        <div className="pa-table-wrap">
                          <table className="pa-table">
                            <thead>
                              <tr>
                                <th className="pa-th-sort" onClick={() => toggleDetailSort('ts')}>时间 {detailSortKey === 'ts' ? (detailSortAsc ? '\u25B2' : '\u25BC') : ''}</th>
                                <th className="pa-th-sort" onClick={() => toggleDetailSort('type')}>类型 {detailSortKey === 'type' ? (detailSortAsc ? '\u25B2' : '\u25BC') : ''}</th>
                                <th>事件</th>
                                <th className="pa-th-sort" style={{ textAlign: 'right' }} onClick={() => toggleDetailSort('usdc_size')}>金额 {detailSortKey === 'usdc_size' ? (detailSortAsc ? '\u25B2' : '\u25BC') : ''}</th>
                                <th className="pa-th-sort" style={{ textAlign: 'right' }} onClick={() => toggleDetailSort('pnl')}>盈亏 {detailSortKey === 'pnl' ? (detailSortAsc ? '\u25B2' : '\u25BC') : ''}</th>
                              </tr>
                            </thead>
                            <tbody>
                              {sortedDetailRecords.map((r, i) => {
                                const action = r.type === 'TRADE' ? r.side : r.type;
                                const typeClass = action === 'BUY' ? 'type-buy' : action === 'SELL' ? 'type-sell' : r.type === 'REDEEM' ? 'type-redeem' : 'type-other';
                                return (
                                  <tr key={`${r.ts}-${i}`}>
                                    <td style={{ whiteSpace: 'nowrap', fontSize: 12 }}>{new Date(r.ts * 1000).toLocaleString('zh-CN', { hour12: false, month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit' })}</td>
                                    <td className={typeClass} style={{ fontWeight: 500 }}>{action}</td>
                                    <td style={{ fontSize: 12, maxWidth: 200, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={r.title || (r.type === 'MAKER_REBATE' ? '做市奖励' : '')}>{r.title || (r.type === 'MAKER_REBATE' ? '做市奖励' : '-')}</td>
                                    <td style={{ textAlign: 'right' }}>{fmt(r.usdc_size)}</td>
                                    <td style={{ textAlign: 'right', color: r.pnl != null ? (r.pnl >= 0 ? 'var(--pa-green)' : 'var(--pa-red)') : 'var(--pa-text2)' }}>{r.pnl != null ? fmt(r.pnl) : '-'}</td>
                                  </tr>
                                );
                              })}
                            </tbody>
                          </table>
                        </div>
                      )}
                    </>
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
