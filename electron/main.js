const { app, BrowserWindow, ipcMain, shell, Tray, Menu } = require('electron');
const path = require('path');
const fs = require('fs');
const { spawn, exec } = require('child_process');
const https = require('https');
const AdmZip = require('adm-zip');
const { autoUpdater } = require('electron-updater');

let mainWindow = null;
let tray = null;
let isQuitting = false;
let zapretProcess = null;
let zapretStatus = 'stopped'; // 'stopped' | 'starting' | 'running' | 'stopping'
let activeStrategy = '';
let strategiesList = [];

const ZAPRET_DIR = app.isPackaged 
  ? path.join(path.dirname(app.getPath('exe')), 'zapret') 
  : 'C:\\drivera\\MacroZapret\\zapret';
const CONFIG_PATH = path.join(app.getPath('userData'), 'config.json');

// Default settings structure
let appSettings = {
  autostart: 'none', // 'none' | 'app_only' | 'strategy'
  autostartStrategy: '', // Strategy file name, or 'last_used'
  lastUsedStrategy: '',
  zapretVersion: 'none',
  closeToTray: true // 'true' = close to tray, 'false' = close app
};

// Load settings
function loadSettings() {
  try {
    if (fs.existsSync(CONFIG_PATH)) {
      const data = fs.readFileSync(CONFIG_PATH, 'utf-8');
      appSettings = { ...appSettings, ...JSON.parse(data) };
      console.log('Loaded config successfully:', appSettings);
      
      if (appSettings.closeToTray) {
        createTray();
      }
    } else {
      console.log('Config file does not exist, using defaults.');
      if (appSettings.closeToTray) {
        createTray();
      }
    }
  } catch (err) {
    console.error('Failed to load config:', err);
  }
}

// Save settings
function saveSettings(settings) {
  try {
    appSettings = { ...appSettings, ...settings };
    console.log('Saving config:', appSettings);
    fs.writeFileSync(CONFIG_PATH, JSON.stringify(appSettings, null, 2), 'utf-8');
    
    if (appSettings.closeToTray) {
      createTray();
    } else {
      destroyTray();
    }
    
    // Apply autostart configurations
    const exePath = app.getPath('exe');
    const isAutostart = appSettings.autostart !== 'none';
    
    app.setLoginItemSettings({
      openAtLogin: isAutostart,
      path: exePath,
      args: isAutostart ? ['--autostart'] : []
    });
    
    // Broadcast updated settings to frontend
    if (mainWindow && mainWindow.webContents) {
      mainWindow.webContents.send('settings:updated', appSettings);
    }
    
    return { success: true };
  } catch (err) {
    console.error('Failed to save config:', err);
    return { success: false, error: err.message };
  }
}

// Check admin privileges
function checkAdminPrivileges() {
  return new Promise((resolve) => {
    exec('net session', (err) => {
      resolve(!err);
    });
  });
}

function createTray() {
  if (tray) return;
  const iconPath = path.join(__dirname, '../assets/icon.ico');
  if (!fs.existsSync(iconPath)) return;
  
  tray = new Tray(iconPath);
  tray.setToolTip('MacroZapret');
  
  tray.on('double-click', () => {
    if (mainWindow) {
      mainWindow.show();
      mainWindow.focus();
    }
  });
  
  updateTrayMenu();
}

function updateTrayMenu() {
  if (!tray) return;

  const isRunning = zapretStatus === 'running';
  const statusLabel = isRunning ? `Статус: Активен (${activeStrategy})` : 'Статус: Выключен';
  
  const menuTemplate = [
    { label: statusLabel, enabled: false },
    {
      label: isRunning ? 'Отключить обход' : 'Включить обход',
      click: async () => {
        if (isRunning) {
          await stopZapretProcess();
        } else {
          const strat = activeStrategy || appSettings.lastUsedStrategy || (strategiesList.length > 0 ? strategiesList[0] : '');
          if (strat) {
            await startStrategy(strat);
          }
        }
        updateTrayMenu();
      }
    },
    { type: 'separator' }
  ];

  // Strategy Submenu
  if (strategiesList.length > 0) {
    const strategySubmenu = strategiesList.map(strat => ({
      label: strat,
      type: 'checkbox',
      checked: activeStrategy === strat || (!activeStrategy && appSettings.lastUsedStrategy === strat),
      click: async () => {
        activeStrategy = strat;
        if (zapretStatus === 'running') {
          await startStrategy(strat);
        } else {
          saveSettings({ lastUsedStrategy: strat });
        }
        updateTrayMenu();
      }
    }));

    menuTemplate.push({
      label: 'Выбрать режим обхода',
      submenu: strategySubmenu
    });
  }

  menuTemplate.push(
    { type: 'separator' },
    { 
      label: 'Открыть MacroZapret', 
      click: () => {
        if (mainWindow) {
          mainWindow.show();
          mainWindow.focus();
        }
      } 
    },
    { 
      label: 'Выход', 
      click: () => {
        isQuitting = true;
        app.quit();
      } 
    }
  );

  const contextMenu = Menu.buildFromTemplate(menuTemplate);
  tray.setContextMenu(contextMenu);
}

function destroyTray() {
  if (tray) {
    tray.destroy();
    tray = null;
  }
}

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1020,
    height: 720,
    minWidth: 800,
    minHeight: 600,
    title: 'MacroZapret Control Panel',
    icon: path.join(__dirname, '../assets/icon.ico'),
    frame: true, // Keep standard frame for ease of use on Windows, style elegantly
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false
    }
  });

  mainWindow.setMenuBarVisibility(false);

  // In development, load Vite server. In production, load dist/index.html
  if (process.env.NODE_ENV === 'development' || !app.isPackaged) {
    mainWindow.loadURL('http://localhost:5173');
    mainWindow.webContents.openDevTools();
  } else {
    mainWindow.loadFile(path.join(__dirname, '../dist/index.html'));
  }

  mainWindow.on('close', (event) => {
    if (appSettings.closeToTray && !isQuitting) {
      event.preventDefault();
      mainWindow.hide();
    }
  });

  mainWindow.on('closed', () => {
    mainWindow = null;
  });
}

// Helper to log to frontend
function logToFrontend(message) {
  console.log(`[Zapret Log] ${message}`);
  if (mainWindow && mainWindow.webContents) {
    mainWindow.webContents.send('zapret:log', message);
  }
}

// Helper to fetch tag and zipball URL using standard HTTP redirects (bypasses API rate-limiting)
function resolveLatestRelease() {
  return new Promise((resolve, reject) => {
    const url = 'https://github.com/flowseal/zapret-discord-youtube/releases/latest';
    https.get(url, { headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36' } }, (res) => {
      if (res.statusCode === 302 || res.statusCode === 301) {
        const location = res.headers.location;
        const match = location.match(/\/releases\/tag\/(.+)$/);
        if (match && match[1]) {
          const tag = match[1].trim();
          resolve({
            tag_name: tag,
            zipball_url: `https://github.com/flowseal/zapret-discord-youtube/archive/refs/tags/${tag}.zip`
          });
        } else {
          reject(new Error(`Could not parse tag from redirect location: ${location}`));
        }
      } else {
        reject(new Error(`Expected redirect (302/301), got status ${res.statusCode}`));
      }
    }).on('error', reject);
  });
}

// 1. Check for latest zapret release from flowseal github
ipcMain.handle('zapret:check-version', async () => {
  try {
    const release = await resolveLatestRelease();
    return {
      current: appSettings.zapretVersion,
      latest: release.tag_name,
      downloadUrl: release.zipball_url,
      updateAvailable: release.tag_name !== appSettings.zapretVersion
    };
  } catch (err) {
    return {
      current: appSettings.zapretVersion,
      latest: 'unknown',
      updateAvailable: false,
      error: err.message
    };
  }
});

// Helper: Download a file
function downloadFile(url, dest) {
  return new Promise((resolve, reject) => {
    const file = fs.createWriteStream(dest);
    const request = (targetUrl) => {
      https.get(targetUrl, { headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)' } }, (response) => {
        if (response.statusCode === 302 || response.statusCode === 301) {
          request(response.headers.location);
          return;
        }
        if (response.statusCode !== 200) {
          reject(new Error(`Failed to download: Status Code ${response.statusCode}`));
          return;
        }
        response.pipe(file);
        file.on('finish', () => {
          file.close(resolve);
        });
      }).on('error', (err) => {
        fs.unlink(dest, () => {});
        reject(err);
      });
    };
    request(url);
  });
}

// 2. Download and unpack latest zapret
ipcMain.handle('zapret:download', async () => {
  logToFrontend('Checking latest release on GitHub...');
  
  let versionInfo;
  try {
    versionInfo = await resolveLatestRelease();
  } catch (err) {
    logToFrontend(`❌ Error: ${err.message}`);
    return { success: false, error: err.message };
  }

  const downloadUrl = versionInfo.zipball_url;
  const tagName = versionInfo.tag_name;
  
  if (!downloadUrl) {
    logToFrontend('❌ Error: No download URL found.');
    return { success: false, error: 'No download URL found' };
  }

  // Backup ALL custom lists in zapret/lists if folder exists
  const listDir = path.join(ZAPRET_DIR, 'lists');
  const backups = {};
  if (fs.existsSync(listDir)) {
    logToFrontend('Сохранение всех списков (zapret/lists)...');
    const listFiles = fs.readdirSync(listDir);
    for (const file of listFiles) {
      const fullPath = path.join(listDir, file);
      if (fs.statSync(fullPath).isFile()) {
        backups[file] = fs.readFileSync(fullPath, 'utf8');
      }
    }
  }

  // Make sure ZAPRET_DIR exists
  if (!fs.existsSync(ZAPRET_DIR)) {
    fs.mkdirSync(ZAPRET_DIR, { recursive: true });
  }

  const tempZipPath = path.join(app.getPath('temp'), `zapret-${tagName}.zip`);
  logToFrontend(`Downloading zapret ${tagName} archive...`);
  
  try {
    await downloadFile(downloadUrl, tempZipPath);
    logToFrontend('Download complete. Extracting archive...');

    // Extract
    const zip = new AdmZip(tempZipPath);
    const tempExtractPath = path.join(app.getPath('temp'), `zapret_extract_${Date.now()}`);
    fs.mkdirSync(tempExtractPath, { recursive: true });
    zip.extractAllTo(tempExtractPath, true);

    // Look for root folder in zip (GitHub releases zipball packs everything inside a root folder)
    const dirs = fs.readdirSync(tempExtractPath);
    const mainDirInZip = dirs.find(d => fs.statSync(path.join(tempExtractPath, d)).isDirectory());
    const sourceDir = mainDirInZip ? path.join(tempExtractPath, mainDirInZip) : tempExtractPath;

    // Clean old zapret directory (keeping custom lists backup safely in memory)
    logToFrontend('Updating files...');
    if (fs.existsSync(ZAPRET_DIR)) {
      fs.rmSync(ZAPRET_DIR, { recursive: true, force: true });
    }
    fs.mkdirSync(ZAPRET_DIR, { recursive: true });

    // Copy files
    const copyRecursiveSync = (src, dest) => {
      const exists = fs.existsSync(src);
      const stats = exists && fs.statSync(src);
      const isDirectory = exists && stats.isDirectory();
      if (isDirectory) {
        fs.mkdirSync(dest, { recursive: true });
        fs.readdirSync(src).forEach((childItemName) => {
          copyRecursiveSync(path.join(src, childItemName), path.join(dest, childItemName));
        });
      } else {
        fs.copyFileSync(src, dest);
      }
    };
    copyRecursiveSync(sourceDir, ZAPRET_DIR);

    // Restore backups
    const newListDir = path.join(ZAPRET_DIR, 'lists');
    if (!fs.existsSync(newListDir)) {
      fs.mkdirSync(newListDir, { recursive: true });
    }
    for (const [file, content] of Object.entries(backups)) {
      fs.writeFileSync(path.join(newListDir, file), content, 'utf8');
    }

    // Clean temp
    fs.rmSync(tempExtractPath, { recursive: true, force: true });
    fs.unlinkSync(tempZipPath);

    logToFrontend(`🎉 Successfully installed zapret ${tagName}!`);
    
    // Save version
    appSettings.zapretVersion = tagName;
    saveSettings({ zapretVersion: tagName });

    return { success: true, version: tagName };
  } catch (err) {
    logToFrontend(`❌ Error during update: ${err.message}`);
    return { success: false, error: err.message };
  }
});

// 3. Scan for strategy bat files
ipcMain.handle('zapret:get-strategies', async () => {
  if (!fs.existsSync(ZAPRET_DIR)) return [];
  try {
    const files = fs.readdirSync(ZAPRET_DIR);
    strategiesList = files.filter(f => f.startsWith('general') && f.endsWith('.bat'));
    updateTrayMenu();
    return strategiesList;
  } catch (err) {
    console.error('Error reading strategies:', err);
    return [];
  }
});

// 4. Start Zapret strategy
async function startStrategy(strategyName) {
  if (zapretProcess) {
    logToFrontend('Stopping active zapret first...');
    await stopZapretProcess();
  }

  const batPath = path.join(ZAPRET_DIR, strategyName);
  if (!fs.existsSync(batPath)) {
    return { success: false, error: `Батник ${strategyName} не найден.` };
  }

  zapretStatus = 'starting';
  activeStrategy = strategyName;
  logToFrontend(`Starting strategy: ${strategyName}`);

  // Parse strategy bat to extract command arguments
  let args = [];
  try {
    const content = fs.readFileSync(batPath, 'utf-8');
    // Look for lines that call winws.exe or start winws.exe
    const winwsLines = content.split('\n').filter(line => line.includes('winws.exe'));
    
    if (winwsLines.length > 0) {
      // Find the main start command. It is usually split with ^ symbols.
      // We can combine lines with trailing ^
      const lines = content.split(/\r?\n/);
      let commandLine = '';
      let buildCommand = false;
      
      for (let i = 0; i < lines.length; i++) {
        const line = lines[i].trim();
        if (line.includes('winws.exe') || buildCommand) {
          buildCommand = true;
          commandLine += ' ' + line.replace(/\^$/, '').trim();
          if (!line.endsWith('^')) {
            buildCommand = false;
          }
        }
      }

      // Parse the command line arguments
      // Remove starting options like: start "..." /min "%BIN%winws.exe"
      let paramsIndex = commandLine.indexOf('winws.exe');
      if (paramsIndex !== -1) {
        let paramsString = commandLine.substring(paramsIndex + 'winws.exe'.length).trim();
        if (paramsString.startsWith('"')) {
          paramsString = paramsString.substring(1).trim();
        }
        
        // Resolve variables: %BIN% -> absolute bin folder, %LISTS% -> absolute lists folder, etc.
        const binPath = path.join(ZAPRET_DIR, 'bin') + '\\';
        const listsPath = path.join(ZAPRET_DIR, 'lists') + '\\';
        
        // Load additional game filters if needed (usually loaded from service.bat or config)
        // We'll replace typical variables in the string
        // Replace variables
        paramsString = paramsString
          .replace(/%BIN%/gi, binPath)
          .replace(/%LISTS%/gi, listsPath)
          .replace(/%GameFilterTCP%/gi, '')
          .replace(/%GameFilterUDP%/gi, '');

        // Clean up trailing commas in port lists (e.g. "8443, --wf-udp" -> "8443 --wf-udp")
        paramsString = paramsString.replace(/,(\s+-)/g, '$1').replace(/,(\s*$)/, '');

        // Process blocks divided by --new
        const blocks = paramsString.split(/\s+--new\s+/);
        const parsedBlocks = [];
        for (let i = 0; i < blocks.length; i++) {
          let block = blocks[i].trim();
          
          // Clean up line joining trailing '^' or leftover '--new' inside the block
          block = block.replace(/\^$/, '').trim();
          if (block.endsWith('--new')) {
            block = block.substring(0, block.length - 5).trim();
          }
          
          if (!block) continue;
          
          const hasEmptyFilter = /--filter-tcp=\s*(?:--|$)/i.test(block) || /--filter-udp=\s*(?:--|$)/i.test(block);
          if (hasEmptyFilter) {
            if (i === 0) {
              // If it's the first block, just strip the empty filters
              block = block.replace(/--filter-tcp=\S*/g, '').replace(/--filter-udp=\S*/g, '').trim();
              if (block) parsedBlocks.push(block);
            } else {
              // Subsequent blocks with empty filters are discarded entirely
              continue;
            }
          } else {
            parsedBlocks.push(block);
          }
        }
        paramsString = parsedBlocks.join(' --new ');

        // Final sanity check: if the entire command ends with --new, remove it
        paramsString = paramsString.trim();
        if (paramsString.endsWith('--new')) {
          paramsString = paramsString.substring(0, paramsString.length - 5).trim();
        }
          
        // Regex to parse arguments (ensuring --option="value" is matched as a single argument)
        const regex = /[^\s"']*(?:"[^"]*"|'[^']*')|[^\s"']+/g;
        let match;
        while ((match = regex.exec(paramsString)) !== null) {
          let arg = match[0];
          // Strip quotes inside the argument (e.g. --hostlist="path" -> --hostlist=path)
          arg = arg.replace(/"/g, '').replace(/'/g, '');
          if (arg) args.push(arg);
        }
      }
    }
  } catch (err) {
    logToFrontend(`⚠️ Warning parsing BAT file: ${err.message}. Running default arguments.`);
  }

  // If parsing failed or gave no arguments, fallback to running the bat file directly (in background)
  if (args.length === 0) {
    logToFrontend('Could not parse arguments from BAT. Running BAT file directly.');
    return new Promise((resolve) => {
      zapretProcess = spawn('cmd.exe', ['/c', batPath], {
        cwd: ZAPRET_DIR,
        env: { ...process.env },
        windowsHide: true
      });

      zapretProcess.stdout.on('data', (data) => logToFrontend(data.toString()));
      zapretProcess.stderr.on('data', (data) => logToFrontend(data.toString()));
      
      zapretProcess.on('close', (code) => {
        logToFrontend(`Zapret BAT exited with code ${code}`);
        zapretProcess = null;
        zapretStatus = 'stopped';
        updateTrayMenu();
      });

      zapretStatus = 'running';
      saveSettings({ lastUsedStrategy: strategyName });
      updateTrayMenu();
      resolve({ success: true, mode: 'bat_direct' });
    });
  }

  // Ensure all referenced list and ipset files exist to prevent winws.exe from crashing
  args.forEach(arg => {
    if (arg.startsWith('--hostlist=') || 
        arg.startsWith('--hostlist-exclude=') || 
        arg.startsWith('--ipset=') || 
        arg.startsWith('--ipset-exclude=')) {
      const filePath = arg.substring(arg.indexOf('=') + 1).trim();
      if (filePath) {
        const dir = path.dirname(filePath);
        if (!fs.existsSync(dir)) {
          fs.mkdirSync(dir, { recursive: true });
        }
        if (!fs.existsSync(filePath)) {
          try {
            fs.writeFileSync(filePath, '', 'utf-8');
            logToFrontend(`Created missing file: ${filePath}`);
          } catch (e) {
            console.error(`Failed to create missing file ${filePath}:`, e);
          }
        }
      }
    }
  });

  // If parsed args, run winws.exe directly for better stdout logs and process control
  const winwsExe = path.join(ZAPRET_DIR, 'bin', 'winws.exe');
  logToFrontend(`Spawning winws.exe directly with args: ${args.join(' ')}`);

  return new Promise((resolve) => {
    try {
      zapretProcess = spawn(winwsExe, args, {
        cwd: path.join(ZAPRET_DIR, 'bin'),
        windowsHide: true
      });

      zapretProcess.stdout.on('data', (data) => {
        logToFrontend(data.toString());
      });

      zapretProcess.stderr.on('data', (data) => {
        logToFrontend(data.toString());
      });

      zapretProcess.on('error', (err) => {
        logToFrontend(`❌ Process error: ${err.message}`);
        zapretStatus = 'stopped';
        zapretProcess = null;
      });

      zapretProcess.on('close', (code) => {
        logToFrontend(`winws.exe process exited with code ${code}`);
        zapretProcess = null;
        zapretStatus = 'stopped';
        updateTrayMenu();
      });

      zapretStatus = 'running';
      saveSettings({ lastUsedStrategy: strategyName });
      updateTrayMenu();
      resolve({ success: true, mode: 'winws_direct' });
    } catch (err) {
      zapretStatus = 'stopped';
      resolve({ success: false, error: err.message });
    }
  });
}

ipcMain.handle('zapret:start-strategy', async (event, strategyName) => {
  return await startStrategy(strategyName);
});

// Helper: Stop active zapret
function stopZapretProcess() {
  return new Promise((resolve) => {
    const cleanUpDriver = () => {
      exec('sc.exe stop WinDivert', () => {
        exec('sc.exe stop WinDivert14', () => {
          zapretStatus = 'stopped';
          activeStrategy = '';
          updateTrayMenu();
          resolve();
        });
      });
    };

    if (!zapretProcess) {
      // Force kill any orphaned winws.exe processes on the machine
      exec('taskkill /f /im winws.exe', () => {
        cleanUpDriver();
      });
      return;
    }

    zapretStatus = 'stopping';
    logToFrontend('Stopping zapret process...');

    // On Windows, taskkill is reliable for child processes
    exec(`taskkill /pid ${zapretProcess.pid} /t /f`, () => {
      zapretProcess = null;
      cleanUpDriver();
    });
  });
}

// 5. Stop Zapret
ipcMain.handle('zapret:stop-strategy', async () => {
  await stopZapretProcess();
  return { success: true };
});

// 6. Get running status
ipcMain.handle('zapret:get-status', async () => {
  return new Promise((resolve) => {
    // Also double check tasklist to verify if winws is running in case it was started elsewhere
    exec('tasklist /fi "imagename eq winws.exe"', (err, stdout) => {
      const isRunningInSystem = stdout.toLowerCase().includes('winws.exe');
      let statusChanged = false;

      if (isRunningInSystem && zapretStatus === 'stopped') {
        zapretStatus = 'running';
        statusChanged = true;
        if (!activeStrategy && appSettings.lastUsedStrategy) {
          activeStrategy = appSettings.lastUsedStrategy;
        }
      } else if (!isRunningInSystem && zapretStatus === 'running') {
        zapretStatus = 'stopped';
        zapretProcess = null;
        activeStrategy = '';
        statusChanged = true;
      }

      if (statusChanged) {
        updateTrayMenu();
      }

      resolve({ status: zapretStatus, strategy: activeStrategy });
    });
  });
});

// Helper for testing url connection via HTTPS
function testConnection(url) {
  return new Promise((resolve) => {
    try {
      const parsedUrl = new URL(url);
      const options = {
        hostname: parsedUrl.hostname,
        port: 443,
        path: parsedUrl.pathname || '/',
        method: 'HEAD',
        timeout: 4000,
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
        }
      };

      const req = https.request(options, (res) => {
        // Any response code means the connection was established (not blocked by provider resets/dropouts)
        resolve(true);
      });

      req.on('timeout', () => {
        req.destroy();
        resolve(false);
      });

      req.on('error', (err) => {
        resolve(false);
      });

      req.end();
    } catch (e) {
      resolve(false);
    }
  });
}

// 6.5. Test strategy connection
ipcMain.handle('zapret:test-strategy', async (event, strategyName) => {
  logToFrontend(`=== Тест обхода: ${strategyName} ===`);
  
  // Save current state
  const wasRunning = zapretStatus === 'running';
  const originalStrategy = activeStrategy;

  // Start strategy
  const startRes = await startStrategy(strategyName);
  if (!startRes.success) {
    logToFrontend(`❌ Ошибка запуска: ${startRes.error}`);
    return { success: false, error: startRes.error };
  }

  // Wait for driver to bind
  await new Promise(resolve => setTimeout(resolve, 3000));

  // Test
  logToFrontend('Проверяем соединение с YouTube...');
  const youtubeOk = await testConnection('https://www.youtube.com');
  
  logToFrontend('Проверяем соединение с Discord...');
  const discordOk = await testConnection('https://www.discord.com');

  // Stop strategy
  await stopZapretProcess();

  // Restore original state
  if (wasRunning && originalStrategy && originalStrategy !== strategyName) {
    logToFrontend(`Восстанавливаем обход: ${originalStrategy}`);
    await startStrategy(originalStrategy);
  }

  return {
    success: true,
    working: youtubeOk || discordOk,
    youtube: youtubeOk,
    discord: discordOk
  };
});

// 7. Get user list content
ipcMain.handle('zapret:get-list', async (event, listName) => {
  const filePath = path.join(ZAPRET_DIR, 'lists', listName);
  if (!fs.existsSync(filePath)) {
    return '';
  }
  try {
    return fs.readFileSync(filePath, 'utf-8');
  } catch (err) {
    return `Error reading file: ${err.message}`;
  }
});

// 8. Save user list content
ipcMain.handle('zapret:save-list', async (event, listName, content) => {
  const listDir = path.join(ZAPRET_DIR, 'lists');
  if (!fs.existsSync(listDir)) {
    fs.mkdirSync(listDir, { recursive: true });
  }
  const filePath = path.join(listDir, listName);
  try {
    fs.writeFileSync(filePath, content, 'utf-8');
    logToFrontend(`Saved list ${listName}`);
    return { success: true };
  } catch (err) {
    return { success: false, error: err.message };
  }
});

// 9. Get & Save Settings
ipcMain.handle('settings:get', () => {
  return appSettings;
});

ipcMain.handle('settings:save', (event, settings) => {
  return saveSettings(settings);
});

// 10. Check Admin privileges
ipcMain.handle('system:check-admin', async () => {
  return await checkAdminPrivileges();
});

// 11. App Auto-Updater (GitHub Releases)
autoUpdater.autoDownload = false;

autoUpdater.on('update-available', (info) => {
  console.log('App update available:', info.version);
  if (mainWindow && mainWindow.webContents) {
    mainWindow.webContents.send('app-update:available', {
      version: info.version,
      releaseNotes: info.releaseNotes || ''
    });
  }
});

autoUpdater.on('download-progress', (progressObj) => {
  if (mainWindow && mainWindow.webContents) {
    mainWindow.webContents.send('app-update:progress', Math.round(progressObj.percent));
  }
});

autoUpdater.on('update-downloaded', () => {
  console.log('App update downloaded successfully');
  if (mainWindow && mainWindow.webContents) {
    mainWindow.webContents.send('app-update:downloaded');
  }
});

autoUpdater.on('error', (err) => {
  console.error('App AutoUpdater error:', err);
  if (mainWindow && mainWindow.webContents) {
    mainWindow.webContents.send('app-update:error', err ? err.message : 'Unknown error');
  }
});

ipcMain.handle('app:get-version', () => {
  return app.getVersion();
});

ipcMain.handle('app:check-update', async () => {
  try {
    const result = await autoUpdater.checkForUpdates();
    return {
      updateAvailable: result && result.updateInfo ? result.updateInfo.version !== app.getVersion() : false,
      version: result && result.updateInfo ? result.updateInfo.version : app.getVersion()
    };
  } catch (err) {
    console.error('App update check failed:', err);
    return { error: err.message };
  }
});

ipcMain.on('app:download-update', () => {
  autoUpdater.downloadUpdate().catch(err => {
    console.error('Failed to download app update:', err);
  });
});

ipcMain.on('app:install-update', () => {
  isQuitting = true;
  autoUpdater.quitAndInstall(true, true);
});

// App Lifecycle
const gotTheLock = app.requestSingleInstanceLock();

if (!gotTheLock) {
  app.quit();
} else {
  app.on('second-instance', () => {
    if (mainWindow) {
      if (mainWindow.isMinimized()) mainWindow.restore();
      mainWindow.show();
      mainWindow.focus();
    }
  });

  app.whenReady().then(async () => {
    loadSettings();
    createWindow();

    // If launched with autostart argument, handle automatically
    const isAutostartRun = process.argv.includes('--autostart');
    
    if (isAutostartRun) {
      logToFrontend('App started by Windows Autostart.');
      
      // Check if configuration requires starting strategy
      if (appSettings.autostart === 'strategy') {
        const strategyToRun = appSettings.autostartStrategy === 'last_used' 
          ? appSettings.lastUsedStrategy 
          : appSettings.autostartStrategy;
          
        if (strategyToRun) {
          // Wait a few seconds for system to fully boot, then start
          setTimeout(() => {
            startStrategy(strategyToRun);
          }, 5000);
        }
      }
    }

    app.on('activate', () => {
      if (BrowserWindow.getAllWindows().length === 0) createWindow();
    });

    // Check for App updates from GitHub shortly after startup
    setTimeout(() => {
      autoUpdater.checkForUpdatesAndNotify().catch(err => console.error('App update check error:', err));
    }, 3000);

    // Periodically check for updates every 10 minutes
    setInterval(() => {
      autoUpdater.checkForUpdatesAndNotify().catch(err => console.error('App update check error:', err));
    }, 10 * 60 * 1000);
  });

  app.on('before-quit', async (event) => {
    if (zapretProcess) {
      event.preventDefault();
      await stopZapretProcess();
      isQuitting = true;
      app.quit();
    }
  });

  app.on('window-all-closed', async () => {
    // Stop zapret when window is closed (or keep running if service option is added. For now, stop process)
    if (zapretProcess) {
      await stopZapretProcess();
    }
    if (process.platform !== 'darwin') {
      app.quit();
    }
  });
}
