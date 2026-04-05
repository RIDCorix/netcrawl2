/**
 * Development launcher for Electron.
 * On macOS, uses 'open -a' to properly initialize the app bundle.
 * On other platforms, uses the electron CLI directly.
 */
const { execSync, spawn } = require('child_process');
const path = require('path');

// Build first
console.log('Building main process...');
execSync('node scripts/build-main.cjs', { stdio: 'inherit', cwd: __dirname + '/..' });

// Find electron binary
const electronPath = require('electron');
const desktopDir = path.join(__dirname, '..');

if (process.platform === 'darwin') {
  // On macOS, find the .app bundle and use 'open -a' for proper initialization
  const appPath = path.join(path.dirname(electronPath), '..', '..');
  console.log(`Launching: open -a ${appPath} --args ${desktopDir}`);
  const child = spawn('open', ['-W', '-a', appPath, '--args', desktopDir], {
    stdio: 'inherit',
  });
  child.on('exit', (code) => process.exit(code || 0));
} else {
  // On Windows/Linux, electron CLI works directly
  const child = spawn(electronPath, [desktopDir], {
    stdio: 'inherit',
  });
  child.on('exit', (code) => process.exit(code || 0));
}
