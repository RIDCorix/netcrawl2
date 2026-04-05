import fs from 'fs';
import path from 'path';
import { execSync } from 'child_process';

export interface PythonStatus {
  found: boolean;
  version?: string;
  path?: string;
  uvFound: boolean;
}

export function detectPython(): PythonStatus {
  const result: PythonStatus = { found: false, uvFound: false };

  for (const cmd of ['python3', 'python']) {
    try {
      const version = execSync(`${cmd} --version`, { encoding: 'utf8', timeout: 5000 }).trim();
      const pyPath = execSync(process.platform === 'win32' ? `where ${cmd}` : `which ${cmd}`, {
        encoding: 'utf8', timeout: 5000,
      }).trim().split('\n')[0];
      result.found = true;
      result.version = version;
      result.path = pyPath;
      break;
    } catch {
      // try next
    }
  }

  try {
    execSync('uv --version', { encoding: 'utf8', timeout: 5000 });
    result.uvFound = true;
  } catch {
    // uv not found
  }

  return result;
}

export function initWorkspace(workspacePath: string, templatePath?: string): void {
  const workersDir = path.join(workspacePath, 'workers');

  if (fs.existsSync(path.join(workspacePath, 'main.py'))) {
    return; // already initialized
  }

  fs.mkdirSync(workersDir, { recursive: true });

  // If template directory exists, copy from it
  if (templatePath && fs.existsSync(templatePath)) {
    copyDirSync(templatePath, workspacePath);
    return;
  }

  // Otherwise create minimal files
  fs.writeFileSync(path.join(workersDir, '__init__.py'), '');

  fs.writeFileSync(path.join(workersDir, 'miner.py'), `from netcrawl import WorkerClass, Edge, Pickaxe

class Miner(WorkerClass):
    class_name = 'Miner'
    class_icon = 'Pickaxe'

    pickaxe = Pickaxe()
    to_mine = Edge('Edge to resource node')
    to_hub = Edge('Edge back to hub')

    def on_startup(self):
        self.info('Miner started!')

    def on_loop(self):
        self.move(self.to_mine)
        self.pickaxe.mine_and_collect()
        self.move(self.to_hub)
        self.deposit()
        self.info('Deposited resources')
`);

  fs.writeFileSync(path.join(workspacePath, 'main.py'), `from netcrawl import NetCrawl
from workers.miner import Miner

app = NetCrawl()
app.register(Miner)
app.run()
`);
}

function copyDirSync(src: string, dest: string): void {
  fs.mkdirSync(dest, { recursive: true });
  for (const entry of fs.readdirSync(src, { withFileTypes: true })) {
    const srcPath = path.join(src, entry.name);
    const destPath = path.join(dest, entry.name);
    if (entry.isDirectory()) {
      copyDirSync(srcPath, destPath);
    } else {
      fs.copyFileSync(srcPath, destPath);
    }
  }
}
