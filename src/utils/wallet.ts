/**
 * 钱包工具函数
 * 用于计算EVM地址和调用合约
 */
import { ethers } from 'ethers';
import { secureLog } from './security';

/**
 * 从私钥计算EVM钱包地址
 * @param privateKey 私钥（可以是带0x前缀或不带）
 * @returns EVM钱包地址
 */
export function getAddressFromPrivateKey(privateKey: string): string {
  try {
    // 移除可能的空格
    const cleanedKey = privateKey.trim();

    // 如果私钥没有0x前缀，添加它
    const keyWithPrefix = cleanedKey.startsWith('0x') ? cleanedKey : `0x${cleanedKey}`;

    // 使用ethers.js创建钱包并获取地址
    const wallet = new ethers.Wallet(keyWithPrefix);
    return wallet.address;
  } catch (error) {
    throw new Error(`计算钱包地址失败: ${error instanceof Error ? error.message : String(error)}`);
  }
}

/**
 * 验证私钥格式
 * @param privateKey 私钥
 * @returns 是否为有效私钥
 */
export function isValidPrivateKey(privateKey: string): boolean {
  try {
    const cleanedKey = privateKey.trim();
    const keyWithPrefix = cleanedKey.startsWith('0x') ? cleanedKey : `0x${cleanedKey}`;

    // 尝试创建钱包，如果成功则私钥有效
    new ethers.Wallet(keyWithPrefix);
    return true;
  } catch {
    return false;
  }
}

/**
 * 验证以太坊地址格式
 * @param address 地址
 * @returns 是否为有效地址
 */
export function isValidAddress(address: string): boolean {
  try {
    if (!address || typeof address !== 'string') {
      return false;
    }
    // 使用ethers.js验证地址格式
    return ethers.isAddress(address);
  } catch {
    return false;
  }
}

/**
 * Polygon 主网公开 RPC 端点（来自 Polygon 官方文档，无需 API Key）
 * 按顺序尝试，使用第一个可用的
 */
const POLYGON_RPC_URLS = [
  'https://polygon.drpc.org',           // dRPC，官方推荐
  'https://polygon.publicnode.com',     // Allnodes/PublicNode
  'https://polygon-public.nodies.app',  // Nodies
  'https://rpc.ankr.com/polygon',       // Ankr
  'https://1rpc.io/matic',              // 1RPC
  'https://tenderly.rpc.polygon.community', // Tenderly
];

// 缓存Provider实例，避免重复创建和测试连接
let cachedProvider: ethers.JsonRpcProvider | null = null;
let providerInitializing = false;

/**
 * 获取Polygon网络的Provider（带缓存）
 */
async function getPolygonProvider(): Promise<ethers.JsonRpcProvider> {
  // 如果已有缓存的Provider，直接返回
  if (cachedProvider) {
    return cachedProvider;
  }

  // 如果正在初始化，等待
  if (providerInitializing) {
    // 等待最多5秒
    for (let i = 0; i < 50; i++) {
      await new Promise(resolve => setTimeout(resolve, 100));
      if (cachedProvider) {
        return cachedProvider;
      }
    }
    throw new Error('Provider初始化超时');
  }

  providerInitializing = true;
  try {
    // 尝试多个RPC端点，使用第一个可用的
    for (const url of POLYGON_RPC_URLS) {
      try {
        const provider = new ethers.JsonRpcProvider(url);
        // 测试连接并验证响应（设置超时时间5秒，避免长时间等待）
        const blockNumber = await Promise.race([
          provider.getBlockNumber(),
          new Promise<number>((_, reject) => setTimeout(() => reject(new Error('连接超时')), 5000))
        ]);

        // 验证Provider响应有效性
        if (typeof blockNumber !== 'number' || blockNumber <= 0) {
          throw new Error('RPC响应无效');
        }

        cachedProvider = provider;
        return provider;
      } catch (error) {
        secureLog.warn(`RPC端点 ${url} 不可用，尝试下一个...`);
        continue;
      }
    }
    throw new Error('无法连接到Polygon网络，请检查网络连接');
  } finally {
    providerInitializing = false;
  }
}

/**
 * Polymarket合约地址（Polygon主网）
 */
const POLYGON_EXCHANGE_ADDRESS = '0x4bFb41d5B3570DeFd03C39a9A4D8dE6Bd8B8982E';
const SAFE_PROXY_FACTORY_ADDRESS = '0xaacFeEa03eb1561C4e67d661e40682Bd20E3541b';

/**
 * 签名类型枚举（与Go SDK保持一致）
 */
export enum SignatureType {
  EOA = 0,      // EOA钱包
  Proxy = 1,    // Proxy钱包
  Safe = 2,     // Safe/Gnosis钱包
}

/**
 * 获取PolyProxy钱包地址（Proxy类型）
 * 调用PolygonExchange合约的getPolyProxyWalletAddress函数
 * @param walletAddress 基础钱包地址
 * @returns 代理钱包地址
 */
async function getPolyProxyWalletAddress(walletAddress: string): Promise<string> {
  // 验证基础地址格式
  if (!isValidAddress(walletAddress)) {
    throw new Error(`无效的基础钱包地址: ${walletAddress}`);
  }

  const provider = await getPolygonProvider();

  // PolygonExchange合约的ABI（仅包含getPolyProxyWalletAddress函数）
  const exchangeABI = [
    {
      inputs: [{ internalType: 'address', name: '_addr', type: 'address' }],
      name: 'getPolyProxyWalletAddress',
      outputs: [{ internalType: 'address', name: '', type: 'address' }],
      stateMutability: 'view',
      type: 'function',
    },
  ];

  const contract = new ethers.Contract(POLYGON_EXCHANGE_ADDRESS, exchangeABI, provider);

  // 添加超时控制（10秒）
  const proxyAddress = await Promise.race([
    contract.getPolyProxyWalletAddress(walletAddress),
    new Promise<string>((_, reject) =>
      setTimeout(() => reject(new Error('获取代理地址超时')), 10000)
    )
  ]) as string;

  // 验证返回的地址格式
  if (!proxyAddress || proxyAddress === ethers.ZeroAddress) {
    throw new Error('获取PolyProxy钱包地址失败：返回地址为空');
  }

  // 验证地址格式
  if (!ethers.isAddress(proxyAddress)) {
    throw new Error('获取PolyProxy钱包地址失败：返回地址格式无效');
  }

  return proxyAddress;
}

/**
 * 获取Safe代理地址（Safe类型）
 * 调用SafeProxyFactory合约的computeProxyAddress函数
 * @param walletAddress 基础钱包地址（owner）
 * @returns Safe代理地址
 */
async function getSafeProxyAddress(walletAddress: string): Promise<string> {
  // 验证基础地址格式
  if (!isValidAddress(walletAddress)) {
    throw new Error(`无效的基础钱包地址: ${walletAddress}`);
  }

  const provider = await getPolygonProvider();

  // SafeProxyFactory合约的ABI（仅包含computeProxyAddress函数）
  const safeProxyFactoryABI = [
    {
      inputs: [{ internalType: 'address', name: 'owner', type: 'address' }],
      name: 'computeProxyAddress',
      outputs: [{ internalType: 'address', name: '', type: 'address' }],
      stateMutability: 'view',
      type: 'function',
    },
  ];

  const contract = new ethers.Contract(SAFE_PROXY_FACTORY_ADDRESS, safeProxyFactoryABI, provider);

  // 添加超时控制（10秒）
  const proxyAddress = await Promise.race([
    contract.computeProxyAddress(walletAddress),
    new Promise<string>((_, reject) =>
      setTimeout(() => reject(new Error('获取代理地址超时')), 10000)
    )
  ]) as string;

  // 验证返回的地址格式
  if (!proxyAddress || proxyAddress === ethers.ZeroAddress) {
    throw new Error('获取Safe代理地址失败：返回地址为空');
  }

  // 验证地址格式
  if (!ethers.isAddress(proxyAddress)) {
    throw new Error('获取Safe代理地址失败：返回地址格式无效');
  }

  return proxyAddress;
}

/**
 * 根据签名类型获取Polymarket代理地址
 * 参考Go SDK的实现逻辑
 * 
 * @param walletAddress 基础钱包地址
 * @param signatureType 签名类型：0=EOA, 1=Proxy, 2=Safe
 * @returns Polymarket代理地址
 */
export async function getPolymarketProxyAddress(
  walletAddress: string,
  signatureType: number = SignatureType.Proxy
): Promise<string> {
  try {
    // 首先验证基础地址格式（所有类型都需要验证）
    if (!isValidAddress(walletAddress)) {
      throw new Error(`无效的基础钱包地址: ${walletAddress}`);
    }

    // 根据签名类型获取代理地址
    switch (signatureType) {
      case SignatureType.EOA:
        // EOA类型：代理地址等于基础地址（已验证，直接返回）
        return walletAddress;

      case SignatureType.Proxy:
        // Proxy类型：调用PolygonExchange合约的getPolyProxyWalletAddress
        // 地址已在getPolyProxyWalletAddress中验证，这里直接调用
        return await getPolyProxyWalletAddress(walletAddress);

      case SignatureType.Safe:
        // Safe类型：调用SafeProxyFactory合约的computeProxyAddress
        // 地址已在getSafeProxyAddress中验证，这里直接调用
        return await getSafeProxyAddress(walletAddress);

      default:
        // 未知类型：默认返回基础地址（已验证）
        secureLog.warn(`未知的签名类型 ${signatureType}，返回基础地址`);
        return walletAddress;
    }
  } catch (error) {
    throw new Error(`获取Polymarket代理地址失败: ${error instanceof Error ? error.message : String(error)}`);
  }
}

/**
 * 从私钥自动计算地址并获取Polymarket代理地址
 * @param privateKey 私钥
 * @returns 包含钱包地址和代理地址的对象
 */
export async function getWalletAndProxyAddress(privateKey: string): Promise<{
  walletAddress: string;
  proxyAddress: string | null;
}> {
  try {
    // 验证私钥
    if (!isValidPrivateKey(privateKey)) {
      throw new Error('无效的私钥格式');
    }

    // 计算钱包地址
    const walletAddress = getAddressFromPrivateKey(privateKey);

    // 获取代理地址（可能失败，所以用try-catch包裹）
    let proxyAddress: string | null = null;
    try {
      proxyAddress = await getPolymarketProxyAddress(walletAddress);
    } catch (error) {
      secureLog.warn('获取代理地址失败:', error);
      // 不抛出错误，只返回null
    }

    return {
      walletAddress,
      proxyAddress,
    };
  } catch (error) {
    throw new Error(`处理失败: ${error instanceof Error ? error.message : String(error)}`);
  }
}
