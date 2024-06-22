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
import { app, BrowserWindow, shell, ipcMain, screen } from 'electron';
import log from 'electron-log';
import MenuBuilder from './menu';
import { resolveHtmlPath } from './util';
import { v4 as uuidv4 } from 'uuid';
import { NovelAiImageGenService } from './genVendors/nai';
const sharp = require('sharp');
import contextMenu from 'electron-context-menu';

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
  return await fs.rename(APP_DIR + '/' + oldfile, APP_DIR + '/' + newfile);
});

ipcMain.handle('rename-dir', async (event, oldfile, newfile) => {
  return await fs.rename(APP_DIR + '/' + oldfile, APP_DIR + '/' + newfile);
});

ipcMain.handle('delete-file', async (event, filename) => {
  return await fs.unlink(APP_DIR + '/' + filename);
});

ipcMain.handle('trash-file', async (event, filename) => {
  await shell.trashItem(path.join(APP_DIR, filename));
});

ipcMain.handle('close', async (event) => {
  saveCompleted = true;
  mainWindow!.close();
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

const createWindow = async () => {
  if (isDebug) {
    await installExtensions();
  }

  const RESOURCES_PATH = app.isPackaged
    ? path.join(process.resourcesPath, 'assets')
    : path.join(__dirname, '../../assets');

  const getAssetPath = (...paths: string[]): string => {
    return path.join(RESOURCES_PATH, ...paths);
  };

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

(async () => {
  await fs.mkdir(APP_DIR, { recursive: true });
})();

const gotTheLock = app.requestSingleInstanceLock()

if (!gotTheLock) {
  app.quit()
} else {
  app.on('second-instance', (event, commandLine, workingDirectory) => {
    // Someone tried to run a second instance, we should focus our window.
    if (mainWindow) {
      if (mainWindow.isMinimized()) mainWindow.restore()
      mainWindow.focus()
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
