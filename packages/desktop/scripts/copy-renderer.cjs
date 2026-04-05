const fs = require('fs');
const path = require('path');

const src = path.join(__dirname, '..', '..', 'ui', 'dist');
const dest = path.join(__dirname, '..', 'renderer');

if (!fs.existsSync(src)) {
  console.error('UI build output not found at', src);
  console.error('Run "pnpm --filter ui build" first');
  process.exit(1);
}

// Clean and copy
if (fs.existsSync(dest)) {
  fs.rmSync(dest, { recursive: true });
}

fs.cpSync(src, dest, { recursive: true });
console.log(`Copied UI build: ${src} -> ${dest}`);
