/* eslint global-require: off, no-console: off, promise/always-return: off */

/**
 * This module executes inside of electron's main process. You can start
 * electron renderer process from here and communicate with the other processes
 * through IPC.
 *
 * When running `npm run build` or `npm run build:main`, this file is compiled to
 * `./src/main.js` using webpack. This gives us some performance wins.
 */
import path from 'path';
import { ImageGenInput, ImageGenService } from './imageGen';
import { app, BrowserWindow, shell, ipcMain, screen, webContents } from 'electron';
import log from 'electron-log';
import MenuBuilder from './menu';
import { resolveHtmlPath } from './util';
import { v4 as uuidv4 } from 'uuid';
import { NovelAiImageGenService } from './genVendors/nai';
const sharp = require('sharp');
const native = require('sdsnative');
const { exiftool } = require('exiftool-vendored');
const chokidar = require('chokidar');
import webpackPaths from '../../.erb/configs/webpack.paths';
import { Config } from './config';
import { spawn } from 'child_process';
import LocalAIService from './localai';
const StreamZip = require('node-stream-zip');


import contextMenu from 'electron-context-menu';
import * as electronDL from 'electron-dl';

interface DataBaseConns {
  tagDBId: number;
  pieceDBId: number;
}

let databases: DataBaseConns = {
  tagDBId: -1,
  pieceDBId: -1
};

let mainWindow: BrowserWindow | null = null;

const imageGen: ImageGenService = new NovelAiImageGenService();

async function listFilesInDirectory(dir: any) {
  try {
    const files = await fs.readdir(dir);
    return files; // Return the list of files
  } catch (err: any) {
    if (err.code === 'ENOENT') {
      return [];
    } else {
      throw err;
    }
  }
}

// Function to get the MIME type based on file extension
function getMimeType(filePath: any) {
  const ext = path.extname(filePath).toLowerCase();
  switch (ext) {
    case '.jpeg':
    case '.jpg':
      return 'image/jpeg';
    case '.png':
      return 'image/png';
    case '.gif':
      return 'image/gif';
    case '.pdf':
      return 'application/pdf';
    case '.txt':
      return 'text/plain';
    case '.html':
      return 'text/html';
    default:
      return 'application/octet-stream';
  }
}

// Function to read file as Data URL
async function readFileAsDataURL(filePath: any) {
  try {
    const data = await fs.readFile(filePath);
    const mimeType = getMimeType(filePath);
    const base64Data = data.toString('base64');
    const dataURL = `data:${mimeType};base64,${base64Data}`;
    return dataURL;
  } catch (err) {
    console.error('Error reading file:', err);
    throw err;
  }
}

const APP_DIR = app.getPath('userData') + '/' + 'SDStudio';

let saveCompleted = false;
let config: Config = {};

ipcMain.handle('get-config', async (event) => {
  return config;
});

ipcMain.handle('set-config', async (event, newConfig) => {
  config = newConfig;
  await fs.writeFile(path.join(APP_DIR, 'config.json'), JSON.stringify(config), 'utf-8');
});

ipcMain.handle('get-version', async (event) => {
  return app.getVersion();
});

ipcMain.handle('open-web-page', async (event, url) => {
  await shell.openExternal(url);
});

ipcMain.handle('image-gen', async (event, arg: ImageGenInput) => {
  const token = await fs.readFile(APP_DIR + '/TOKEN.txt', 'utf-8');
  arg.outputFilePath = APP_DIR + '/' + arg.outputFilePath;
  await imageGen.generateImage(token, arg);
});

ipcMain.handle('login', async (event, email, password) => {
  const rsp = await imageGen.login(email, password);
  await fs.writeFile(APP_DIR + '/TOKEN.txt', rsp.accessToken, 'utf-8');
});

ipcMain.handle('show-file', async (event, arg) => {
  shell.showItemInFolder(path.join(APP_DIR, arg));
});

const AdmZip = require('adm-zip');

const fsSync = require('fs');

ipcMain.handle('zip-files', async (event, files, outPath) => {
  const dir = path.dirname(APP_DIR + '/' + outPath);
  files = files.map((x: any) => ({
    name: x.name,
    path: APP_DIR + '/' + x.path,
  }));
  await fs.mkdir(dir, { recursive: true });
  const zip = new AdmZip();
  files.forEach((x: any) => {
    const { name, path } = x;
    const fileContent = fsSync.readFileSync(path);
    zip.addFile(`${name}.png`, fileContent);
  });
  await zip.writeZip(APP_DIR + '/' + outPath);
});

const fs = require('fs').promises;

ipcMain.handle('search-tags', async (event, word) => {
  return native.search(databases.tagDBId, word);
});

ipcMain.handle('load-pieces-db', async (event, pieces) => {
  const csv = pieces.map((x: string) => {
    return `<${x}>,0,0,null`;
  }).join('\n');
  native.loadDB(databases.pieceDBId, csv);
});

ipcMain.handle('search-pieces', async (event, word) => {
  return native.search(databases.pieceDBId, word);
});

ipcMain.handle('list-files', async (event, arg) => {
  return await listFilesInDirectory(APP_DIR + '/' + arg);
});

ipcMain.handle('read-file', async (event, filename) => {
  const data = await fs.readFile(APP_DIR + '/' + filename, 'utf-8');
  return data;
});

ipcMain.handle('write-file', async (event, filename, data) => {
  const dir = path.dirname(APP_DIR + '/' + filename);
  await fs.mkdir(dir, { recursive: true });
  const tmpFile = APP_DIR + '/' + uuidv4();
  await fs.writeFile(tmpFile, data, 'utf-8');
  await fs.rename(tmpFile, APP_DIR + '/' + filename, { recursive: true });
});

ipcMain.handle('copy-file', async (event, src, dest) => {
  const dir = path.dirname(APP_DIR + '/' + dest);
  await fs.mkdir(dir, { recursive: true });
  await fs.copyFile(APP_DIR + '/' + src, APP_DIR + '/' + dest);
});

ipcMain.handle('read-data-file', async (event, arg) => {
  return await readFileAsDataURL(APP_DIR + '/' + arg);
});

ipcMain.handle('write-data-file', async (event, filename, data) => {
  const binaryData = Buffer.from(data, 'base64');
  const dir = path.dirname(APP_DIR + '/' + filename);
  await fs.mkdir(dir, { recursive: true });
  const tmpFile = APP_DIR + '/' + uuidv4();
  await fs.writeFile(tmpFile, binaryData);
  await fs.rename(tmpFile, APP_DIR + '/' + filename, { recursive: true });
});

ipcMain.handle('rename-file', async (event, oldfile, newfile) => {
  const oldPath = path.join(APP_DIR,oldfile);
  const newPath = path.join(APP_DIR,newfile);
  watchHandles.delete(oldPath);
  watchHandles.delete(newPath);
  return await fs.rename(APP_DIR + '/' + oldfile, APP_DIR + '/' + newfile);
});

ipcMain.handle('rename-dir', async (event, oldfile, newfile) => {
  return await fs.rename(APP_DIR + '/' + oldfile, APP_DIR + '/' + newfile);
});

ipcMain.handle('delete-file', async (event, filename) => {
  return await fs.unlink(APP_DIR + '/' + filename);
});

ipcMain.handle('delete-dir', async (event, filename) => {
  return await fs.rmdir(APP_DIR + '/' + filename, { recursive: true });
});

ipcMain.handle('trash-file', async (event, filename) => {
  await shell.trashItem(path.join(APP_DIR, filename));
});

ipcMain.handle('close', async (event) => {
  saveCompleted = true;
  mainWindow!.close();
});

ipcMain.handle('exist-file', async (event, filename) => {
  try {
    await fs.access(APP_DIR + '/' + filename);
    return true;
  } catch (e) {
    return false;
  }
});

ipcMain.handle('download', async (event, url, dest, filename) => {
  dest = path.join(APP_DIR, dest);
  await fs.mkdir(dest, { recursive: true });
  const options = {
    directory: dest,
    saveAs: false,
    openFolderWhenDone: false,
    filename,
    onProgress: (progress) => {
      mainWindow!.webContents.send('download-progress', progress);
    }
  };
  try {
    await electronDL.download(mainWindow!, url, options);
  } catch (e) {
    if (!(e instanceof electronDL.CancelError)) {
      console.error(e);
    }
  }
});

ipcMain.handle(
  'resize-image',
  async (event, { inputPath, outputPath, maxWidth, maxHeight }) => {
    inputPath = APP_DIR + '/' + inputPath;
    outputPath = APP_DIR + '/' + outputPath;
    const dir = path.dirname(outputPath);
    await fs.mkdir(dir, { recursive: true });
    await sharp(inputPath)
      .resize(maxWidth, maxHeight, {
        fit: sharp.fit.inside,
        withoutEnlargement: true,
      })
      .toFile(outputPath);
  },
);

const { exec } = require('child_process');

const dirWatchHandles = new Map<string, any>();
const watchHandles = new Map<string, any>();
const exclusiveCounter = new Map<string, number>();
let isWritingExifData = false;
const os = require('os');

async function openImageEditor(inputPath: string) {
  const editor = config.imageEditor ?? 'photoshop';
  const homeDir = os.homedir();
  const gimpBaseDirCand1 = path.join(homeDir, 'AppData', 'Local', 'Programs');
  const gimpBaseDirCand2 = "C:\\Program Files";
  async function findGimpPath(baseDir: string) {
    const platform = os.platform();

    if (platform === 'win32') {
      const gimpDir = 'GIMP 2';
      const binDir = 'bin';
      const gimpPath = path.join(baseDir, gimpDir, binDir);
      const files = await fs.readdir(gimpPath);
      const gimpExecutable = files.find((file: string) => file.startsWith('gimp-') && file.endsWith('.exe'));
      if (gimpExecutable) {
        return path.join(gimpPath, gimpExecutable);
      } else {
        throw new Error('GIMP executable not found.');
      }
    } else if (platform === 'darwin') {
      return '/Applications/GIMP.app';
    } else {
      throw new Error('Unsupported platform: ' + platform);
    }
  }

  const commonPaths = [
    'C:\\Program Files\\Adobe\\Adobe Photoshop CC 2019\\Photoshop.exe',
    'C:\\Program Files\\Adobe\\Adobe Photoshop CC 2020\\Photoshop.exe',
    'C:\\Program Files\\Adobe\\Adobe Photoshop CC 2021\\Photoshop.exe',
    'C:\\Program Files\\Adobe\\Adobe Photoshop 2022\\Photoshop.exe',
    'C:\\Program Files\\Adobe\\Adobe Photoshop 2023\\Photoshop.exe',
    'C:\\Program Files\\Adobe\\Adobe Photoshop 2024\\Photoshop.exe',
    '/Applications/Adobe Photoshop CC 2019/Adobe Photoshop CC 2019.app',
    '/Applications/Adobe Photoshop CC 2020/Adobe Photoshop CC 2020.app',
    '/Applications/Adobe Photoshop CC 2021/Adobe Photoshop CC 2021.app',
    '/Applications/Adobe Photoshop 2022/Adobe Photoshop 2022.app',
    '/Applications/Adobe Photoshop 2023/Adobe Photoshop 2023.app',
    '/Applications/Adobe Photoshop 2024/Adobe Photoshop 2024.app',
  ];

  async function findPhotoshopPath(paths: string[]) {
    for (let photoshopPath of paths) {
      if (await fs.access(photoshopPath).then(() => true).catch(() => false)) {
        return photoshopPath;
      }
    }
    return null;
  }

  const editorsToTry = ['photoshop', 'gimp', 'mspaint'];
  editorsToTry.splice(editorsToTry.indexOf(editor), 1);
  editorsToTry.unshift(editor);
  const runProgram = async (program: string) => {
    const command = os.platform() === 'win32' ? `"${program}" "${path.resolve(inputPath)}"` : `open -a "${program}" "${path.resolve(inputPath)}"`;

    exec(command, (err: any) => {
      if (err) {
        console.error(`Error opening Photoshop: ${err.message}`);
        return;
      }
      console.log('Image editor opened successfully.');
    });
  };
  for (const edi of editorsToTry) {
    switch(edi) {
      case 'photoshop':
        try {
          const photoshopPath = await findPhotoshopPath(commonPaths);
          if (photoshopPath) {
            runProgram(photoshopPath);
            return;
          }
        } catch(e){}
        break;
      case 'gimp':
        try {
          const gimpPath = await findGimpPath(gimpBaseDirCand1);
          if (gimpPath) {
            runProgram(gimpPath);
            return;
          }
        } catch(e){}
        try {
          const gimpPath = await findGimpPath(gimpBaseDirCand2);
          if (gimpPath) {
            runProgram(gimpPath);
            return;
          }
        } catch(e){}
        break;
      case 'mspaint':
        if (os.platform() === 'win32') {
          runProgram('mspaint');
          return;
        }
        break;
    }
  }
}

ipcMain.handle('open-image-editor', async (event, inputPath) => {
  await openImageEditor(APP_DIR + '/' + inputPath);
});

ipcMain.handle('watch-image', async (event, inputPath) => {
  const orgDir = inputPath.split('/').slice(0, -1).join('/');
  inputPath = path.join(APP_DIR, inputPath);
  const dir = path.dirname(inputPath);
  console.log(orgDir);
  const curPath = path.join(dir, path.basename(inputPath));

  let tags = null;
  if (watchHandles.has(curPath) && watchHandles.get(curPath) !== 'null'){
    tags = watchHandles.get(curPath);
  } else {
    try {
      tags = await exiftool.read(curPath);
    } catch (e) {
      console.error("Could not read exif:", curPath, e);
    }
  }
  if (!dirWatchHandles.has(dir)) {
    const handle = chokidar.watch(dir, {
      persistent: true,
      ignoreInitial: true,
    });

    handle.on('change', async (changedPath: string) => {
      console.log('File changed:', changedPath);
      const candPath = path.join(dir, path.basename(changedPath));
      if (watchHandles.has(candPath)) {
        console.log('Image changed:', changedPath);
        if (!isWritingExifData) {
          if (watchHandles.get(candPath) !== 'null') {
            const trigger = (dur: number, retry: boolean) => {
              const myCounter = (exclusiveCounter.get(changedPath) ?? 0)+1;
              exclusiveCounter.set(changedPath, myCounter);
              setTimeout(async () => {
                if (exclusiveCounter.get(changedPath) !== myCounter) {
                  return;
                }
                try {
                  isWritingExifData = true;
                  await exiftool.write(changedPath, watchHandles.get(candPath));
                  console.log('Exif data written:', orgDir + '/' +  path.basename(changedPath));
                  mainWindow!.webContents.send('image-changed', orgDir + '/' +  path.basename(changedPath));
                } catch(e) {
                } finally {
                  isWritingExifData = false;
                  exclusiveCounter.delete(changedPath);
                }
                if (retry) {
                  setTimeout(() => {
                    trigger(0, false);
                  }, dur);
                }
              }, 1000);
            };
            trigger(4000, true);
          }
          mainWindow!.webContents.send('image-changed', orgDir + '/' +  path.basename(changedPath));
        }
      }
    });

    dirWatchHandles.set(dir, handle);
  }
  watchHandles.set(curPath, tags ?? 'null');
});

ipcMain.handle('unwatch-image', async (event, inputPath) => {
  const dir = path.dirname(inputPath);
  const curPath = path.join(dir, path.basename(inputPath));
  watchHandles.delete(curPath);
});

ipcMain.handle('load-model', async (event, modelPath) => {
  modelPath =  path.resolve(path.join(APP_DIR, modelPath));
  await localAI.loadModel(modelPath, config.useCUDA ?? false);
});

ipcMain.handle('extract-zip', async (event, zipPath, outPath) => {
  const dir = path.join(APP_DIR, outPath);
  const zip = new StreamZip.async({ file: path.join(APP_DIR, zipPath) });

  let numExtracted = 0;
  const entries = Object.values(await zip.entries());
  zip.on('extract', (entry, file) => {
    numExtracted++;
    mainWindow!.webContents.send('download-progress', { percent: numExtracted / entries.length });
  });
  await fs.mkdir(dir, { recursive: true });
  await zip.extract(null, dir);
  await zip.close();
});

let localAIRunning = false;

async function spawnLocalAI() {
  const localaiProcess = spawn(path.join(APP_DIR, 'localai', 'localai'), ['--port', '5353'], {
    stdio: 'inherit',
    windowsHide: true,
  });
  localAIRunning = true;
  localaiProcess.on('close', (code) => {
    localAIRunning = false;
  });
}

ipcMain.handle('spawn-local-ai', async (event) => {
  if (!localAIRunning) {
    await spawnLocalAI();
  }
});

ipcMain.handle('is-local-ai-running', async (event) => {
  return localAIRunning;
});

const qualityMap: any = {
  'low': 320,
  'normal': 640,
  'high': 1024,
  'veryhigh': 1536,
  'veryveryhigh': 2048
}

ipcMain.handle('remove-bg', async (event, inputImageBase64, outputPath) => {
  outputPath = path.join(APP_DIR, outputPath);
  await localAI.runModel(inputImageBase64, qualityMap[config.removeBgQuality ?? 'normal'], outputPath);
});

if (process.env.NODE_ENV === 'production') {
  const sourceMapSupport = require('source-map-support');
  sourceMapSupport.install();
}

const isDebug =
  process.env.NODE_ENV === 'development' || process.env.DEBUG_PROD === 'true';

if (isDebug) {
  require('electron-debug')({ showDevTools: true });
}

const installExtensions = async () => {
  const installer = require('electron-devtools-installer');
  const forceDownload = !!process.env.UPGRADE_EXTENSIONS;
  const extensions = ['REACT_DEVELOPER_TOOLS'];

  return installer
    .default(
      extensions.map((name) => installer[name]),
      forceDownload,
    )
    .catch(console.log);
};

const RESOURCES_PATH = app.isPackaged
  ? path.join(process.resourcesPath, 'assets')
  : path.join(__dirname, '../../assets');

const getAssetPath = (...paths: string[]): string => {
  return path.join(RESOURCES_PATH, ...paths);
};

const createWindow = async () => {
  if (isDebug) {
    await installExtensions();
  }


  const primaryDisplay = screen.getPrimaryDisplay();
  const { width, height } = primaryDisplay.workAreaSize;

  mainWindow = new BrowserWindow({
    show: false,
    width: width,
    height: height,
    minWidth: 1024,
    minHeight: 728,
    icon: getAssetPath('icon.png'),
    webPreferences: {
      preload: app.isPackaged
        ? path.join(__dirname, 'preload.js')
        : path.join(__dirname, '../../.erb/dll/preload.js'),
    },
  });

   contextMenu({
    window: mainWindow,
    prepend: (defaultActions, params, browserWindow) => {
      console.log(params.mediaType);
      console.log(params.altText);
      console.log(params.titleText);
      const handleContextAlt = (altContext: any) => {
        if (altContext.type === 'image') {
          return [
            {
              label: '해당 이미지를 다른 씬으로 복사',
              click: () => {
                mainWindow!.webContents.send('copy-image', altContext);
              },
            },
            {
              label: '해당 이미지를 복제',
              click: () => {
                mainWindow!.webContents.send('duplicate-image', altContext);
              },
            },
          ];
        } else {
          return [
            {
              label: '해당 씬을 맨위로 이동',
              click: () => {
                mainWindow!.webContents.send('move-scene-front', altContext);
              },
            },
            {
              label: '해당 씬을 맨뒤로 이동',
              click: () => {
                mainWindow!.webContents.send('move-scene-back', altContext);
              },
            },
            {
              label: '해당 씬을 복제',
              click: () => {
                mainWindow!.webContents.send('duplicate-scene', altContext);
              },
            }
          ];
        }
      };
      if (params.mediaType === 'image' && params.altText) {
        try {
          const altContext = JSON.parse(params.altText);
          return handleContextAlt(altContext);
        } catch(e) {
          console.error(e);
        }
      }
      if (params.mediaType === 'none' && params.titleText) {
        try {
          const altContext = JSON.parse(params.titleText);
          return handleContextAlt(altContext);
        } catch(e) {
          console.error(e);
        }
      }
      return [];
    },
  });


  mainWindow.loadURL(resolveHtmlPath('index.html'));

  mainWindow.on('ready-to-show', () => {
    if (!mainWindow) {
      throw new Error('"mainWindow" is not defined');
    }
    if (process.env.START_MINIMIZED) {
      mainWindow.minimize();
    } else {
      mainWindow.show();
    }
  });

  mainWindow.on('close', (e) => {
    if (saveCompleted) {
      e.preventDefault();
    } else {
      mainWindow!.webContents.send('close');
    }
  });

  mainWindow.on('closed', () => {
    mainWindow = null;
  });

  const menuBuilder = new MenuBuilder(mainWindow);
  menuBuilder.buildMenu();
  mainWindow.setMenu(null)

  // Open urls in the user's browser
  mainWindow.webContents.setWindowOpenHandler((edata) => {
    shell.openExternal(edata.url);
    return { action: 'deny' };
  });

  // Remove this if your app does not use auto updates
  // eslint-disable-next-line
  // new AppUpdater();
};

const dataDir = isDebug
  ? path.join(webpackPaths.appPath, 'data')
  : path.join(__dirname, '../../data');

const localAIDir = isDebug
  ? path.join(webpackPaths.appPath, 'localai')
  : path.join(__dirname, '../../localai');

const localAI = new LocalAIService('http://127.0.0.1:5353');

async function init() {
  await fs.mkdir(APP_DIR, { recursive: true });
  try {
    config = JSON.parse(await fs.readFile(path.join(APP_DIR, 'config.json'), 'utf-8'));
  } catch(e) {}
  const dbCsvContent = await fs.readFile(path.join(dataDir, 'db.csv'), 'utf-8');
  databases.tagDBId = native.createDB('danbooru');
  native.loadDB(databases.tagDBId, dbCsvContent);
  databases.pieceDBId = native.createDB('pieces');
}

init();


const gotTheLock = app.requestSingleInstanceLock()

if (!gotTheLock) {
  app.quit()
} else {
  app.on('second-instance', (event, commandLine, workingDirectory) => {
    // Someone tried to run a second instance, we should focus our window.
    if (mainWindow) {
      if (mainWindow.isMinimized()) mainWindow.restore()
      mainWindow.focus();
    }
  })
  /**
  * Add event listeners...
  */

  app.on('window-all-closed', () => {
    // Respect the OSX convention of having the application in memory even
    // after all windows have been closed
    if (process.platform !== 'darwin') {
      app.quit();
    }
  });

  app
    .whenReady()
    .then(() => {
      createWindow();
      app.on('activate', () => {
        // On macOS it's common to re-create a window in the app when the
        // dock icon is clicked and there are no other windows open.
        if (mainWindow === null) createWindow();
        // APP_DIR = app.getPath('userData');
      });
    })
    .catch(console.log);
}
