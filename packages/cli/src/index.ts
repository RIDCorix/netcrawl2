#!/usr/bin/env node

import { execSync, spawn } from 'child_process';
import path from 'path';
import fs from 'fs';
import readline from 'readline';
import chalk from 'chalk';

const args = process.argv.slice(2);
const command = args[0] || 'help';

function log(msg: string) {
  console.log(chalk.cyan('[netcrawl]') + ' ' + msg);
}

function error(msg: string) {
  console.error(chalk.red('[netcrawl error]') + ' ' + msg);
}

function success(msg: string) {
  console.log(chalk.green('[netcrawl]') + ' ' + msg);
}

// Find repo root (where netcrawl2 package.json lives)
function findRepoRoot(): string {
  // Check if we're inside netcrawl2 already
  let dir = process.cwd();
  for (let i = 0; i < 10; i++) {
    const pkgPath = path.join(dir, 'package.json');
    if (fs.existsSync(pkgPath)) {
      const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf-8'));
      if (pkg.name === 'netcrawl') return dir;
    }
    const parent = path.dirname(dir);
    if (parent === dir) break;
    dir = parent;
  }
  return process.cwd();
}

async function cmdInit() {
  const workspaceDir = path.join(process.cwd(), 'workspace');
  const workersDir = path.join(workspaceDir, 'workers');

  log('Initializing NetCrawl workspace...');

  if (!fs.existsSync(workersDir)) {
    fs.mkdirSync(workersDir, { recursive: true });
  }

  // Write harvester
  const harvesterPath = path.join(workersDir, 'harvester.js');
  if (!fs.existsSync(harvesterPath)) {
    fs.writeFileSync(harvesterPath, `// Example Harvester worker
// Run: deploy from Hub → select "Harvester" class

export class Harvester {
  async run(api) {
    console.log('Harvester started!')

    while (true) {
      // Find path from hub to energy node
      const path = await api.findPath('hub', 'r1')

      // Move to energy node
      for (const nodeId of path.slice(1)) {
        await api.move(nodeId)
      }

      // Harvest
      await api.harvest()

      // Return to hub
      const returnPath = [...path].reverse()
      for (const nodeId of returnPath.slice(1)) {
        await api.move(nodeId)
      }

      // Deposit
      await api.deposit()
    }
  }
}
`);
    success('Created workspace/workers/harvester.js');
  }

  // Write guardian
  const guardianPath = path.join(workersDir, 'guardian.js');
  if (!fs.existsSync(guardianPath)) {
    fs.writeFileSync(guardianPath, `// Guardian patrols and repairs infected nodes

export class Guardian {
  async run(api) {
    while (true) {
      const nodes = await api.scan()
      const infected = nodes.find(n => n.type === 'infected' || n.data?.infected)

      if (infected) {
        await api.repair(infected.id)
        api.log('Repaired ' + infected.id)
      }

      // Patrol: move to adjacent nodes and back
      const neighbors = nodes.filter(n => n.adjacent)
      if (neighbors.length > 0) {
        const target = neighbors[Math.floor(Math.random() * neighbors.length)]
        await api.move(target.id)
        await api.move('hub')
      }

      // Wait before next patrol
      await new Promise(r => setTimeout(r, 3000))
    }
  }
}
`);
    success('Created workspace/workers/guardian.js');
  }

  // Write config
  const configPath = path.join(process.cwd(), 'netcrawl.config.json');
  if (!fs.existsSync(configPath)) {
    fs.writeFileSync(configPath, JSON.stringify({
      workspacePath: './workspace',
      serverPort: 3001,
      uiPort: 5173,
    }, null, 2));
    success('Created netcrawl.config.json');
  }

  // Git init workspace
  if (!fs.existsSync(path.join(workspaceDir, '.git'))) {
    try {
      execSync('git init && git add -A && git commit -m "initial workers"', {
        cwd: workspaceDir,
        stdio: 'inherit',
      });
      success('Initialized git repository in workspace/');
    } catch (err) {
      error('Git init failed (you may need to configure git user.name and user.email)');
    }
  }

  success('NetCrawl workspace initialized!');
  log('Run ' + chalk.yellow('netcrawl start') + ' to launch the game.');
}

async function cmdStart() {
  const repoRoot = findRepoRoot();
  log('Starting NetCrawl...');
  log('Server: ' + chalk.yellow('http://localhost:3001'));
  log('UI:     ' + chalk.yellow('http://localhost:5173'));

  const serverPkg = path.join(repoRoot, 'packages', 'server');
  const uiPkg = path.join(repoRoot, 'packages', 'ui');

  if (!fs.existsSync(serverPkg)) {
    error(`Server package not found at ${serverPkg}`);
    process.exit(1);
  }

  // Start server and UI concurrently
  const proc = spawn('pnpm', ['run', 'dev'], {
    cwd: repoRoot,
    stdio: 'inherit',
    shell: true,
  });

  proc.on('exit', (code) => {
    if (code !== 0) {
      error(`Processes exited with code ${code}`);
    }
  });

  // Open browser after a short delay
  setTimeout(async () => {
    try {
      const { default: open } = await import('open');
      await open('http://localhost:5173');
      success('Opened browser at http://localhost:5173');
    } catch (err) {
      log('Open http://localhost:5173 in your browser');
    }
  }, 3000);

  // Handle Ctrl+C
  process.on('SIGINT', () => {
    log('Shutting down...');
    proc.kill('SIGINT');
    process.exit(0);
  });
}

async function cmdReset() {
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  rl.question(chalk.yellow('Reset game state? This cannot be undone. [y/N] '), async (answer) => {
    rl.close();
    if (answer.toLowerCase() !== 'y') {
      log('Reset cancelled.');
      return;
    }
    try {
      const res = await fetch('http://localhost:3001/api/reset', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
      });
      const data = await res.json() as any;
      if (data.ok) {
        success('Game state reset to initial.');
      } else {
        error('Reset failed: ' + JSON.stringify(data));
      }
    } catch (err) {
      error('Could not connect to server. Is it running?');
    }
  });
}

function cmdHelp() {
  console.log(`
${chalk.cyan('NetCrawl')} - A programmable idle network exploration game

${chalk.yellow('Commands:')}
  ${chalk.green('netcrawl init')}    Initialize workspace with example workers
  ${chalk.green('netcrawl start')}   Start server + UI, open browser
  ${chalk.green('netcrawl reset')}   Reset game state to initial

${chalk.yellow('Quick Start:')}
  cd my-project
  netcrawl init
  netcrawl start
`);
}

async function main() {
  switch (command) {
    case 'init':   await cmdInit();  break;
    case 'start':  await cmdStart(); break;
    case 'reset':  await cmdReset(); break;
    case 'help':
    default:       cmdHelp();        break;
  }
}

main().catch(err => {
  error(err.message || String(err));
  process.exit(1);
});
