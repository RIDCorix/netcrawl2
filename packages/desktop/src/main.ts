const { app, BrowserWindow, ipcMain, shell, dialog } = require('electron');
import path from 'path';
import fs from 'fs';
import os from 'os';
import http from 'http';

const LOG = path.join(os.homedir(), 'netcrawl-debug.log');
function log(msg: string) {
  const line = `[${new Date().toISOString()}] ${msg}\n`;
  try { fs.appendFileSync(LOG, line); } catch {}
}
try { fs.writeFileSync(LOG, ''); } catch {}

process.on('uncaughtException', (err) => {
  log(`UNCAUGHT EXCEPTION: ${err.message}\n${err.stack}`);
});
process.on('unhandledRejection', (err: any) => {
  log(`UNHANDLED REJECTION: ${err?.message || err}\n${err?.stack || ''}`);
});

// Enable GPU acceleration for smooth rendering
app.commandLine.appendSwitch('enable-gpu-rasterization');
app.commandLine.appendSwitch('enable-zero-copy');
app.commandLine.appendSwitch('ignore-gpu-blocklist');

log(`app=${typeof app} isPackaged=${app?.isPackaged} __dirname=${__dirname}`);

const isDev = !app.isPackaged;
let mainWindow: BrowserWindow | null = null;
let gameServer: http.Server | null = null;

function getDataDir() {
  return isDev ? process.cwd() : app.getPath('userData');
}

function getStaticDir(): string {
  const p = path.join(__dirname, '..', 'renderer');
  const resolved = p;
  log(`staticDir=${resolved} exists=${fs.existsSync(resolved)}`);
  return resolved;
}

function getSplashHtml(): string {
  const p = path.join(__dirname, '..', 'static', 'splash.html');
  return p;
}

app.whenReady().then(async () => {
  log('app ready');

  // Splash
  const splash = new BrowserWindow({
    width: 480, height: 320, frame: false,
    transparent: true, resizable: false, alwaysOnTop: true,
    webPreferences: { nodeIntegration: false, contextIsolation: true },
  });
  splash.loadFile(getSplashHtml());

  // IPC
  ipcMain.handle('app:version', () => app.getVersion());
  ipcMain.handle('workspace:path', () => path.join(getDataDir(), 'workspace'));
  ipcMain.handle('workspace:open', () => shell.openPath(path.join(getDataDir(), 'workspace')));

  // Workspace init
  const wsPath = path.join(getDataDir(), 'workspace', 'workers');
  if (!fs.existsSync(wsPath)) fs.mkdirSync(wsPath, { recursive: true });

  // Start server
  try {
    const dataDir = getDataDir();
    const staticDir = isDev ? undefined : getStaticDir();
    log(`starting server dataDir=${dataDir} staticDir=${staticDir}`);

    const { startServer } = require('@netcrawl/server');
    const result = await startServer({ port: 0, dataDir, staticDir });
    gameServer = result.server;

    const port = result.port;
    log(`server ready port=${port}`);

    // Main window — show immediately, don't wait for ready-to-show
    const url = isDev ? 'http://localhost:5173' : `http://localhost:${port}`;
    log(`loading ${url}`);

    mainWindow = new BrowserWindow({
      width: 1440, height: 900, minWidth: 1024, minHeight: 680,
      title: 'NetCrawl', backgroundColor: '#0a0a0f',
      webPreferences: {
        nodeIntegration: false, contextIsolation: true,
        preload: path.join(__dirname, 'preload.js'),
      },
    });

    mainWindow.loadURL(url);

    mainWindow.webContents.on('did-finish-load', () => {
      log('page loaded OK');
      splash.close();
    });

    mainWindow.webContents.on('did-fail-load', (_e: any, code: number, desc: string) => {
      log(`page FAILED: ${code} ${desc}`);
      splash.close();
      dialog.showErrorBox('NetCrawl', `Failed to load UI: ${desc}\nURL: ${url}`);
    });

    // Fallback: close splash after 10s no matter what
    setTimeout(() => { try { splash.close(); } catch {} }, 10000);

    mainWindow.webContents.setWindowOpenHandler(({ url }: any) => {
      shell.openExternal(url);
      return { action: 'deny' as const };
    });

    mainWindow.on('closed', () => { mainWindow = null; });

    if (isDev) mainWindow.webContents.openDevTools();

  } catch (err: any) {
    log(`FATAL: ${err.message}\n${err.stack}`);
    splash.close();
    dialog.showErrorBox('NetCrawl', `Server failed:\n${err.message}`);
    app.quit();
  }
});

app.on('window-all-closed', () => {
  log('window-all-closed');
  if (process.platform !== 'darwin') app.quit();
});

app.on('will-quit', () => { log('will-quit'); });
app.on('quit', (_event: any, exitCode: number) => { log(`quit exitCode=${exitCode}`); });
app.on('before-quit', () => {
  log('before-quit');
  if (gameServer) { gameServer.close(); gameServer = null; }
});
