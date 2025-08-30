const { app, BrowserWindow, ipcMain } = require('electron');
const fs = require('fs');
const path = require('path');
const os = require('os');
const vdf = require('vdf');
const axios = require('axios');

// ---------------- Steam Path Finding ----------------
function getSteamPaths() {
  const platform = process.platform;
  const paths = [];

  if (platform === 'win32') {
    const programFiles = process.env['PROGRAMFILES'] || 'C:\\Program Files';
    const programFilesX86 = process.env['PROGRAMFILES(X86)'] || 'C:\\Program Files (x86)';
    paths.push(path.join(programFiles, 'Steam'));
    paths.push(path.join(programFilesX86, 'Steam'));
  } else if (platform === 'darwin') {
    paths.push(path.join(os.homedir(), 'Library', 'Application Support', 'Steam'));
  } else if (platform === 'linux') {
    paths.push(path.join(os.homedir(), '.steam', 'steam'));
    paths.push(path.join(os.homedir(), '.local', 'share', 'Steam'));
  }

  return paths.filter(p => fs.existsSync(p));
}

// ---------------- Parse VDF (steam file extension (thing) I found on a forum) ----------------
function parseVDF(filePath) {
  try {
    const data = fs.readFileSync(filePath, 'utf-8');
    return vdf.parse(data);
  } catch (err) {
    console.error('Failed to parse VDF:', filePath, err.message);
    return null;
  }
}

// ---------------- Steam Libraries ----------------
function getSteamLibraries(basePath) {
  const libraries = [path.join(basePath, 'steamapps')];
  const vdfPath = path.join(basePath, 'steamapps', 'libraryfolders.vdf');
  if (!fs.existsSync(vdfPath)) return libraries;

  const parsed = parseVDF(vdfPath);
  if (!parsed) return libraries;

  const folders = parsed.LibraryFolders || parsed.libraryfolders || {};

  for (const key in folders) {
    if (!isNaN(key)) {
      let libPath = folders[key].path || folders[key];
      if (typeof libPath === 'string') {
        libPath = libPath.replace(/\\\\/g, '/'); 
        if (fs.existsSync(libPath)) {
          libraries.push(path.join(libPath, 'steamapps'));
        }
      }
    }
  }

  return Array.from(new Set(libraries));
}

// ---------------- Steam Users ----------------
function getSteamUsers(basePath) {
  const userdataPath = path.join(basePath, 'userdata');
  if (!fs.existsSync(userdataPath)) return [];
  
  try {
    return fs.readdirSync(userdataPath).filter(f => {
      const fullPath = path.join(userdataPath, f);
      return fs.statSync(fullPath).isDirectory() && !isNaN(f);
    });
  } catch (err) {
    console.error('Error reading userdata directory:', err);
    return [];
  }
}

// ---------------- Read Playtime from localconfig.vdf ----------------
function readUserPlaytime(userPath) {
  const localConfigPath = path.join(userPath, 'config', 'localconfig.vdf');
  if (!fs.existsSync(localConfigPath)) {
    console.log('localconfig.vdf not found at:', localConfigPath);
    return {};
  }

  console.log('Reading playtime from:', localConfigPath);
  const localConfig = parseVDF(localConfigPath);
  if (!localConfig) return {};

  try {
    const userStore = localConfig.UserLocalConfigStore || localConfig.userlocalconfigstore;
    if (!userStore) {
      console.log('UserLocalConfigStore not found in localconfig.vdf');
      return {};
    }

    const software = userStore.Software || userStore.software;
    if (!software) {
      console.log('Software section not found');
      return {};
    }

    const valve = software.Valve || software.valve;
    if (!valve) {
      console.log('Valve section not found');
      return {};
    }

    const steam = valve.Steam || valve.steam;
    if (!steam) {
      console.log('Steam section not found');
      return {};
    }

    const apps = steam.Apps || steam.apps;
    if (!apps) {
      console.log('Apps section not found');
      return {};
    }

    const playtimes = {};
    let gameCount = 0;
    for (const appid in apps) {
      const appData = apps[appid];
      if (appData && (appData.Playtime || appData.playtime)) {
        // Playtime is stored in minutes
        const playtime = parseInt(appData.Playtime || appData.playtime || '0', 10);
        if (playtime > 0) {
          playtimes[appid] = playtime;
          gameCount++;
        }
      }
    }

    console.log(`Found playtime data for ${gameCount} games in user config`);
    return playtimes;
  } catch (err) {
    console.error('Error parsing localconfig.vdf structure:', err);
    return {};
  }
}

// ---------------- Fetch Thumbnail ----------------
async function fetchThumbnail(appid) {
  try {
    const res = await axios.get(`https://store.steampowered.com/api/appdetails?appids=${appid}`, {
      timeout: 5000
    });
    const json = res.data;
    if (json[appid] && json[appid].success) {
      return json[appid].data.header_image;
    }
  } catch (err) {
    console.error('Failed to fetch thumbnail for', appid, err.message);
  }
  return null;
}

function isActualGame(appInfo, appid) {
  const name = (appInfo.name || '').toLowerCase();
  const installDir = (appInfo.installdir || '').toLowerCase();
  
  const nonGameAppIds = new Set([
    '228980', // Steamworks Common Redistributables
    '1070560', // Steam Linux Runtime
    '1391110', // Steam Linux Runtime 2.0
    '1628350', // Steam Linux Runtime 3.0
    '323370', // Proton
    '858280', // Proton 4.2
    '996510', // Proton 4.11
    '1054830', // Proton 5.0
    '1113280', // Proton 5.13
    '1245040', // Proton 6.3
    '1420170', // Proton 7.0
    '1887720', // Proton 8.0
    '2180100', // Proton 9.0
  ]);

  if (nonGameAppIds.has(appid)) {
    return false;
  }

  const nonGamePatterns = [
    'steamworks',
    'redistributable',
    'redist',
    'vcredist',
    'directx',
    'runtime',
    'proton',
    'steam linux runtime',
    'common redistributables',
    'spacewar',
    'steam controller',
    'steam link',
    'benchmark',
    'demo',
    'beta',
    'test',
    'development',
    'sdk',
    'toolkit',
    'editor',
    'launcher',
    'updater'
  ];

  for (const pattern of nonGamePatterns) {
    if (name.includes(pattern)) {
      return false;
    }
  }

  const nonGameDirPatterns = [
    'steamworks',
    'redist',
    'runtime',
    'proton',
    'common_redist'
  ];

  for (const pattern of nonGameDirPatterns) {
    if (installDir.includes(pattern)) {
      return false;
    }
  }

  if (!appInfo.name || appInfo.name.trim().length === 0) {
    return false;
  }

  const toolType = (appInfo.type || '').toLowerCase();
  if (toolType === 'tool' || toolType === 'config' || toolType === 'application') {
    return false;
  }

  return true;
}

async function fetchAllGames() {
  console.log('Starting to fetch all games...');
  const steamBases = getSteamPaths();
  if (steamBases.length === 0) {
    console.log('No Steam installations found');
    return [];
  }

  console.log('Found Steam installations at:', steamBases);
  const allGames = [];

  for (const base of steamBases) {
    console.log('Processing Steam installation:', base);
    const libraries = getSteamLibraries(base);
    const users = getSteamUsers(base);

    console.log('Found libraries:', libraries);
    console.log('Found users:', users);

    const userPlaytimes = {};
    for (const user of users) {
      const userPath = path.join(base, 'userdata', user);
      console.log('Reading playtime for user:', user);
      userPlaytimes[user] = readUserPlaytime(userPath);
    }

    for (const lib of libraries) {
      if (!fs.existsSync(lib)) {
        console.log('Library does not exist:', lib);
        continue;
      }

      console.log('Processing library:', lib);
      const files = fs.readdirSync(lib);
      const manifests = files.filter(f => f.startsWith('appmanifest_') && f.endsWith('.acf'));
      console.log(`Found ${manifests.length} game manifests`);

      for (const manifest of manifests) {
        const manifestPath = path.join(lib, manifest);
        const data = parseVDF(manifestPath);
        if (!data || !data.AppState) {
          console.log('Invalid manifest:', manifest);
          continue;
        }

        const info = data.AppState;
        const appid = info.appid || info.AppID;
        if (!appid) {
          console.log('No appid found in manifest:', manifest);
          continue;
        }

        if (!isActualGame(info, appid)) {
          console.log(`Filtered out non-game: ${info.name} (${appid})`);
          continue;
        }

        const stateFlags = parseInt(info.StateFlags || '0', 10);
        if ((stateFlags & 4) !== 4) {
          console.log(`Skipping ${info.name} (${appid}) — not fully installed`);
          continue;
        }

        let playtime = 0;
        for (const user in userPlaytimes) {
          const userTime = userPlaytimes[user][appid] || 0;
          playtime = Math.max(playtime, userTime);
        }

        if (playtime === 0 && info.PlaytimeForever) {
          playtime = parseInt(info.PlaytimeForever, 10);
          console.log(`Using fallback playtime for ${info.name}: ${playtime} minutes`);
        }

        if (playtime === 0 && info.LastUpdated) {
          const lastUpdated = parseInt(info.LastUpdated, 10);
          const now = Math.floor(Date.now() / 1000);
          const daysSinceUpdate = (now - lastUpdated) / (24 * 60 * 60);
          if (daysSinceUpdate < 30) playtime = 1;
        }

        let thumbnail = null;
        try {
          thumbnail = await fetchThumbnail(appid);
        } catch {
          console.log(`Failed to fetch thumbnail for ${info.name}`);
        }

        allGames.push({
          appid,
          title: info.name || 'Unknown',
          installDir: path.join(lib, 'common', info.installdir || ''),
          playtime, 
          thumbnail,
          raw: info
        });
      }
    }
  }

  console.log(`Total fully installed games found: ${allGames.length}`);
  return allGames;
}

// ---------------- idfk electron I feel like you should be able to guess this ----------------
function createWindow() {
  const win = new BrowserWindow({
    width: 1200,
    height: 800,
    frame: false,
    webPreferences: {
      preload: path.join(app.getAppPath(), 'src', 'preload', 'preload.js'), // src folder included as-is
      contextIsolation: true,
      enableRemoteModule: false,
      nodeIntegration: false
    }
  });

  win.loadFile(path.join(app.getAppPath(), 'src', 'index.html'));
  
  if (process.env.NODE_ENV === 'development') {
    win.webContents.openDevTools();
  }
}

app.whenReady().then(() => {
  createWindow();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
    }
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

ipcMain.handle('get-games', async () => {
  try {
    console.log('get-games called');
    const games = await fetchAllGames();
    console.log(`Returning ${games.length} games`);
    return games;
  } catch (error) {
    console.error('Error in get-games IPC handler:', error);
    throw error;
  }
});

ipcMain.handle('launch-game', async (event, appid) => {
  try {
    const { spawn } = require('child_process');
    const steamUrl = `steam://rungameid/${appid}`;
    
    console.log(`Launching game with Steam URL: ${steamUrl}`);
    
    if (process.platform === 'win32') {
      spawn('cmd', ['/c', 'start', steamUrl], { detached: true });
    } else if (process.platform === 'darwin') {
      spawn('open', [steamUrl], { detached: true });
    } else {
      spawn('xdg-open', [steamUrl], { detached: true });
    }
    
    return true;
  } catch (error) {
    console.error('Error launching game:', error);
    return false;
  }
});

console.log('Steam paths found:', getSteamPaths());