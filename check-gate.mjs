import fs from 'fs';
import path from 'path';

const MAX_LINES = 450;
const FORBIDDEN_V1 = ['UnifiedDrawer', 'ModuleGrid', 'fishcrm_persons', 'cutoff', 'deceased'];
let hasError = false;

function scanDir(dir) {
  if (!fs.existsSync(dir)) return;
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      scanDir(fullPath);
    } else if (/\.(vue|ts)$/.test(entry.name)) {
      const content = fs.readFileSync(fullPath, 'utf-8');
      const lines = content.split('\n').length;
      if (lines > MAX_LINES) {
        console.error(`❌ [门禁拦截] ${fullPath} 共 ${lines} 行，超过 ${MAX_LINES} 行红线！请拆分模块。`);
        hasError = true;
      }
      if (entry.name.endsWith('.vue') && content.includes('localStorage')) {
        console.error(`❌ [门禁拦截] ${fullPath} 严禁在组件内直接读写 localStorage，必须走 useCrmStore！`);
        hasError = true;
      }
      for (const word of FORBIDDEN_V1) {
        if (content.includes(word)) {
          console.error(`❌ [门禁拦截] ${fullPath} 检测到 v1 旧版残留标识 "${word}"！`);
          hasError = true;
        }
      }
    }
  }
}

scanDir(path.resolve('src'));
if (hasError) process.exit(1);
console.log('✅ [防屎山门禁通过] 行数、存储边界与纯净度全部合格！');