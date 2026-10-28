import type { CapacitorConfig } from '@capacitor/cli'

/**
 * Capacitor 安卓打包配置
 * AppId / AppName 为产品锁定值，勿随意修改（影响已安装用户升级）。
 */
const config: CapacitorConfig = {
  appId: 'com.fishcrm.app',
  appName: '我是鱼人际',
  webDir: 'dist',
  android: {
    allowMixedContent: false,
    backgroundColor: '#f8fafc',
  },
}

export default config
