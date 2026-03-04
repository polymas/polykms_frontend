/**
 * 工作机 data / info_data 解析与关键指标提取
 * 供 WorkerStatus 与 PolymarketAnalytics 共用
 */

/** 解析 info_data JSON 字符串 */
export function parseInfoData(infoDataStr?: string): Record<string, unknown> | null {
  if (!infoDataStr || infoDataStr === '{}' || infoDataStr.trim() === '') return null;
  try {
    const parsed = JSON.parse(infoDataStr) as Record<string, unknown>;
    if (typeof parsed === 'object' && parsed !== null && Object.keys(parsed).length === 0) {
      return null;
    }
    return parsed;
  } catch {
    return null;
  }
}

/** 解析 data（业务数据）JSON 字符串 */
export function parseBusinessData(dataStr?: string): Record<string, unknown> | null {
  if (!dataStr) return null;
  try {
    return JSON.parse(dataStr) as Record<string, unknown>;
  } catch {
    return null;
  }
}

/**
 * 从业务数据中提取关键字段值
 * 支持传入字符串（JSON 字符串）或对象
 */
export function getKeyMetricValue(
  data: string | Record<string, unknown> | undefined,
  fieldName: string
): string {
  if (!data) return '-';

  let businessData: Record<string, unknown> | null;
  if (typeof data === 'string') {
    if (data === '{}' || data.trim() === '') return '-';
    businessData = parseBusinessData(data);
  } else {
    businessData = data;
  }

  if (!businessData || Object.keys(businessData).length === 0) return '-';

  for (const [key, value] of Object.entries(businessData)) {
    if (fieldName === 'position_count' && (
      key.includes('持仓') || key.includes('持仓数') ||
      /position.*count/i.test(key) || /positions/i.test(key)
    )) {
      if (Array.isArray(value)) return String(value.length);
      return String(value);
    }
    if (fieldName === 'order_count' && (
      key.includes('挂单') || key.includes('挂单数') ||
      /order.*count/i.test(key) || /orders/i.test(key)
    )) {
      if (Array.isArray(value)) return String(value.length);
      return String(value);
    }
    if (fieldName === 'balance') {
      const lowerKey = key.toLowerCase();
      if (lowerKey === 'usdc_balance' || lowerKey === 'wallet.usdc_balance' ||
        key === 'WALLET.USDC_BALANCE') {
        const numValue = Number(value);
        if (!isNaN(numValue)) return numValue.toFixed(2);
        return String(value);
      }
      if ((/usdc.*balance/i.test(key) || /balance.*usdc/i.test(key)) &&
        !/pol.*balance/i.test(key) && !/balance.*pol/i.test(key)) {
        const numValue = Number(value);
        if (!isNaN(numValue)) return numValue.toFixed(2);
        return String(value);
      }
    }
    if (fieldName === 'position_value') {
      const lowerKey = key.toLowerCase();
      if (lowerKey === 'positions.value' || lowerKey === 'position.value' ||
        key === 'POSITIONS.VALUE' || key === 'POSITION.VALUE' ||
        (key.includes('仓位') && key.includes('价值')) ||
        (key.includes('持仓') && key.includes('价值')) ||
        /position.*value/i.test(key)) {
        const numValue = Number(value);
        if (!isNaN(numValue)) return numValue.toFixed(2);
        return String(value);
      }
      if (typeof value === 'object' && value !== null && typeof (value as Record<string, unknown>).value !== 'undefined') {
        const numValue = Number((value as Record<string, unknown>).value);
        if (!isNaN(numValue)) return numValue.toFixed(2);
        return String((value as Record<string, unknown>).value);
      }
    }
    if (fieldName === 'version_number') {
      const lowerKey = key.toLowerCase();
      if (lowerKey === 'version.number' || lowerKey === 'version' ||
        key === 'VERSION.NUMBER' || key === 'VERSION' || key.includes('版本') ||
        /version.*number/i.test(key) || /^version$/i.test(key)) {
        return String(value);
      }
      if (typeof value === 'object' && value !== null && typeof (value as Record<string, unknown>).number !== 'undefined') {
        return String((value as Record<string, unknown>).number);
      }
    }
  }

  if (fieldName === 'position_value') {
    const positions = businessData.positions ?? businessData.POSITIONS;
    if (positions && typeof positions === 'object' && !Array.isArray(positions)) {
      const pos = positions as Record<string, unknown>;
      const posValue = pos.value ?? pos.VALUE;
      if (posValue !== undefined) {
        const numValue = Number(posValue);
        if (!isNaN(numValue)) return numValue.toFixed(2);
        return String(posValue);
      }
    }
  }

  if (fieldName === 'total_assets') {
    let positionValue = 0;
    let balance = 0;
    const positions = businessData.positions ?? businessData.POSITIONS;
    if (positions && typeof positions === 'object' && !Array.isArray(positions)) {
      const pos = positions as Record<string, unknown>;
      const posValue = pos.value ?? pos.VALUE;
      if (posValue !== undefined) {
        const numValue = Number(posValue);
        if (!isNaN(numValue)) positionValue = numValue;
      }
    }
    if (positionValue === 0) {
      for (const [key, value] of Object.entries(businessData)) {
        const lowerKey = key.toLowerCase();
        if (lowerKey === 'positions.value' || lowerKey === 'position.value' ||
          key === 'POSITIONS.VALUE' || key === 'POSITION.VALUE' ||
          (key.includes('仓位') && key.includes('价值')) ||
          (key.includes('持仓') && key.includes('价值')) ||
          /position.*value/i.test(key)) {
          const numValue = Number(value);
          if (!isNaN(numValue)) {
            positionValue = numValue;
            break;
          }
        }
      }
    }
    for (const [key, value] of Object.entries(businessData)) {
      const lowerKey = key.toLowerCase();
      if (lowerKey === 'usdc_balance' || lowerKey === 'wallet.usdc_balance' || key === 'WALLET.USDC_BALANCE') {
        const numValue = Number(value);
        if (!isNaN(numValue)) {
          balance = numValue;
          break;
        }
      }
      if ((/usdc.*balance/i.test(key) || /balance.*usdc/i.test(key)) &&
        !/pol.*balance/i.test(key) && !/balance.*pol/i.test(key)) {
        const numValue = Number(value);
        if (!isNaN(numValue)) {
          balance = numValue;
          break;
        }
      }
    }
    const totalAssets = positionValue + balance;
    if (totalAssets > 0) return totalAssets.toFixed(2);
    return '-';
  }

  if (fieldName === 'version_number') {
    const version = businessData.version ?? businessData.VERSION;
    if (version && typeof version === 'object' && !Array.isArray(version)) {
      const ver = version as Record<string, unknown>;
      const verNumber = ver.number ?? ver.NUMBER;
      if (verNumber !== undefined) return String(verNumber);
    }
    if (businessData.version && typeof businessData.version === 'string') {
      return businessData.version;
    }
  }

  return '-';
}

/**
 * 从单条工作机状态合并 data + info_data 得到用于取数的对象
 */
export function mergeWorkerData(dataStr?: string, infoDataStr?: string): Record<string, unknown> {
  const dynamic = parseBusinessData(dataStr);
  const staticInfo = parseInfoData(infoDataStr) ?? {};
  return { ...staticInfo, ...(dynamic ?? {}) };
}

/**
 * 从 positions 数组去重统计活跃市场数（按 token_id / market 等唯一标识）
 */
export function countActiveMarketsFromStatuses(
  statuses: { data?: string; info_data?: string }[]
): number {
  const marketIds = new Set<string>();
  for (const s of statuses) {
    const merged = mergeWorkerData(s.data, s.info_data);
    const positions = merged.positions ?? merged.POSITIONS;
    if (Array.isArray(positions)) {
      for (const p of positions) {
        if (p && typeof p === 'object') {
          const o = p as Record<string, unknown>;
          const id = o.token_id ?? o.tokenId ?? o.market_id ?? o.marketId ?? o.condition_id ?? o.conditionId;
          if (id != null) marketIds.add(String(id));
        }
      }
    }
  }
  return marketIds.size;
}
