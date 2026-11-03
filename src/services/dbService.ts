/**
 * FishCRM v2.0 数据层统一出口（barrel re-export）
 * 具体实现按职责拆分在 ./db/*，外部导入路径保持不变。
 */
export * from './db/core';
export * from './db/seed';
export * from './db/query';
export * from './db/io';
