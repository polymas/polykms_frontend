/// <reference types="vite/client" />

interface ImportMetaEnv {
    readonly VITE_ENVIRONMENT?: string;
    readonly VITE_API_BASE_URL?: string;
    /** poly_activity 钱包活动缓存后端，用于客户看板每日交易额/利润 */
    readonly VITE_ACTIVITY_API_BASE_URL?: string;
}

interface ImportMeta {
    readonly env: ImportMetaEnv;
}

