import { Config } from "../../main/config";
import { ImageGenInput, ImageGenService } from "./imageGen";
import { Backend, FileEntry, ResizeImageInput } from "../backend";
import { SceneContextAlt, ContextAlt, ImageContextAlt, dataUriToBase64 } from "../models";
import { Filesystem, Directory, Encoding } from '@capacitor/filesystem';
import { FileOpener, FileOpenerOptions } from '@capacitor-community/file-opener';
import { Buffer } from 'buffer';
import { v4 as uuidv4 } from 'uuid';
import Pica from 'pica';
import { NovelAiFetcher, NovelAiImageGenService } from "./genVendors/nai";
import FetchService from "./fecthService";
import JSZip from "jszip";

declare var cordova: any;

const APP_DIR = "SDStudio";
let config: Config = {};
const pica = new Pica();

function extname(filename: string): string {
  const parts = filename.split('.');
  return parts[parts.length - 1];
}

// Function to get the MIME type based on file extension
function getMimeType(filePath: any) {
  const ext = extname(filePath).toLowerCase();
  switch (ext) {
    case 'jpeg':
    case 'jpg':
      return 'image/jpeg';
    case 'png':
      return 'image/png';
    case 'gif':
      return 'image/gif';
    case 'pdf':
      return 'application/pdf';
    case 'txt':
      return 'text/plain';
    case 'html':
      return 'text/html';
    case 'zip':
      return 'application/zip';
    default:
      return 'vnd.android.document/directory';
  }
}

function getDirName(filePath: string): string {
  const parts = filePath.split('/');
  parts.pop();
  return parts.join('/');
}

class AndroidFetcher implements NovelAiFetcher {
  async fetchArrayBuffer(url: string, body: any, headers: any): Promise<ArrayBuffer> {
    const controller = new AbortController();
    const response = await FetchService.fetchData({
      url: url,
      body: JSON.stringify(body),
      headers: JSON.stringify(headers),
    });
    function base64ToArrayBuffer(base64: string) {
      // Decode the base64 string
      const binaryString = atob(base64);

      // Create a new ArrayBuffer with the same length as the binary string
      const len = binaryString.length;
      const bytes = new Uint8Array(len);

      // Write the decoded binary string to the array buffer
      for (let i = 0; i < len; i++) {
          bytes[i] = binaryString.charCodeAt(i);
      }

      return bytes.buffer;
    }
    return base64ToArrayBuffer(response.data);
  }
}

export class AndroidBackend extends Backend {
  private imageGenService: ImageGenService;
  constructor() {
    super();
    Filesystem.mkdir({
      path: APP_DIR,
      recursive: true,
      directory: Directory.Documents,
    });
    this.imageGenService = new NovelAiImageGenService(new AndroidFetcher);

  }

  async getConfig(): Promise<Config> {
    return config;
  }

  async setConfig(newConfig: Config): Promise<void> {
    config = newConfig;
    await Filesystem.writeFile({
      path: `${APP_DIR}/config.json`,
      data: JSON.stringify(config),
      directory: Directory.Documents,
      encoding: Encoding.UTF8,
    });
  }

  async getVersion(): Promise<string> {
    return '';
  }

  async openWebPage(url: string): Promise<void> {
    return;
  }

  async generateImage(arg: ImageGenInput): Promise<void> {
    const token = await this.readFile('TOKEN.txt');
    const res = await this.imageGenService.generateImage(token, arg);
    await this.writeDataFile(arg.outputFilePath, res);
  }

  async login(email: string, password: string): Promise<void> {
    const token = await this.imageGenService.login(email, password);
    await this.writeFile('TOKEN.txt', token.accessToken);
  }

  async showFile(arg: string): Promise<void> {
    const urlRes = await Filesystem.getUri({
      path: `${APP_DIR}/${arg}`,
      directory: Directory.Documents,
    });
    let mime = getMimeType(arg);
    if (mime.startsWith('image')) {
      mime = "image/*";
    }
    const fileOpenerOptions: FileOpenerOptions = {
      filePath: urlRes.uri,
      openWithDefault: false
    };
    await FileOpener.open(fileOpenerOptions);
  }

  async zipFiles(files: FileEntry[], outPath: string): Promise<void> {
    const zip = new JSZip();

    for (const file of files) {
      const content = await this.readDataFile(file.path);
      zip.file(file.name + '.png', dataUriToBase64(content), {
        base64: true
      });
    }

    const zipContent = await zip.generateAsync({ type: 'blob' });

    const reader = new FileReader();
    reader.readAsDataURL(zipContent);
    await new Promise<void>((resolve, reject) => {
      reader.onloadend = () => {
        const base64data = reader.result as string;
        const base64Content = base64data.split(',')[1];
        this.writeDataFile(outPath, base64Content).then(resolve).catch(reject);
      };
      reader.onerror = reject;
    });
  }

  async searchTags(word: string): Promise<any> {
    return;
  }

  async loadPiecesDB(pieces: string[]): Promise<void> {
    return;
  }

  async searchPieces(word: string): Promise<any> {
    return;
  }

  async listFiles(arg: string): Promise<string[]> {
    const { files } = await Filesystem.readdir({
      path: `${APP_DIR}/${arg}`,
      directory: Directory.Documents,
    });
    return files.map(x => x.name);
  }

  async readFile(filename: string): Promise<string> {
    const data = await Filesystem.readFile({
      path: `${APP_DIR}/${filename}`,
      directory: Directory.Documents,
      encoding: Encoding.UTF8,
    });
    return data.data.toString();
  }

  async writeFile(filename: string, data: string): Promise<void> {
    const dir = getDirName(`${APP_DIR}/${filename}`);
    try {
      await Filesystem.mkdir({
        path: dir,
        directory: Directory.Documents,
        recursive: true,
      });
    } catch(e) {}
    const tmpFile = `${APP_DIR}/${uuidv4()}`;
    await Filesystem.writeFile({
      path: tmpFile,
      data,
      directory: Directory.Documents,
      encoding: Encoding.UTF8,
    });
    await Filesystem.rename({
      from: tmpFile,
      to: `${APP_DIR}/${filename}`,
      directory: Directory.Documents,
    });
  }

  async copyFile(src: string, dest: string): Promise<void> {
    const dir = getDirName(`${APP_DIR}/${dest}`);
    try {
      await Filesystem.mkdir({
        path: dir,
        directory: Directory.Documents,
        recursive: true,
      });
    } catch (e) {
    }
    await Filesystem.copy({
      from: `${APP_DIR}/${src}`,
      to: `${APP_DIR}/${dest}`,
      directory: Directory.Documents,
    });
  }

  async readDataFile(arg: string): Promise<string> {
    const data = await Filesystem.readFile({
      path: `${APP_DIR}/${arg}`,
      directory: Directory.Documents,
    });
    const mimeType = getMimeType(arg);
    const base64Data = data.data.toString();
    const dataURL = `data:${mimeType};base64,${base64Data}`;
    return dataURL;
  }

  async writeDataFile(filename: string, data: string): Promise<void> {
    const binaryData = Buffer.from(data, 'base64').toString('base64');
    const dir = getDirName(`${APP_DIR}/${filename}`);
    try {
      await Filesystem.mkdir({
        path: dir,
        directory: Directory.Documents,
        recursive: true,
      });
    } catch(e) {}
    const tmpFile = `${APP_DIR}/${uuidv4()}`;
    await Filesystem.writeFile({
      path: tmpFile,
      data: binaryData,
      directory: Directory.Documents,
    });
    await Filesystem.rename({
      from: tmpFile,
      to: `${APP_DIR}/${filename}`,
      directory: Directory.Documents,
    });
  }

  async renameFile(oldfile: string, newfile: string): Promise<void> {
    const oldPath = `${APP_DIR}/${oldfile}`;
    const newPath = `${APP_DIR}/${newfile}`;
    return await Filesystem.rename({
      from: oldPath,
      to: newPath,
      directory: Directory.Documents,
    });
  }

  async renameDir(oldfile: string, newfile: string): Promise<void> {
    return await Filesystem.rename({
      from: `${APP_DIR}/${oldfile}`,
      to: `${APP_DIR}/${newfile}`,
      directory: Directory.Documents,
    });
  }

  async deleteFile(filename: string): Promise<void> {
    return await Filesystem.deleteFile({
      path: `${APP_DIR}/${filename}`,
      directory: Directory.Documents,
    });
  }

  async deleteDir(filename: string): Promise<void> {
    return await Filesystem.rmdir({
      path: `${APP_DIR}/${filename}`,
      directory: Directory.Documents,
      recursive: true,
    });
  }

  async trashFile(filename: string): Promise<void> {
    return;
  }

  async close(): Promise<void> {
    return;
  }

  async existFile(filename: string): Promise<boolean> {
    try {
      await Filesystem.stat({
        path: `${APP_DIR}/${filename}`,
        directory: Directory.Documents,
      });
      return true;
    } catch (e) {
      return false;
    }
  }

  async download(url: string, dest: string, filename: string): Promise<void> {
    return;
  }

  async resizeImage(input: ResizeImageInput): Promise<void> {
    let { inputPath, outputPath, maxWidth, maxHeight } = input;
    inputPath = `${APP_DIR}/${inputPath}`;
    outputPath = `${APP_DIR}/${outputPath}`;
    const dir = getDirName(outputPath);

    try {
      await Filesystem.mkdir({
        path: dir,
        directory: Directory.Documents,
        recursive: true,
      });
    } catch(e){
    }

    const { data } = await Filesystem.readFile({
      path: inputPath,
      directory: Directory.Documents,
    });

    const img = new Image();
    img.src = `data:image/png;base64,${data}`;
    await img.decode();

    const canvas = document.createElement('canvas');
    const context = canvas.getContext('2d')!;

    canvas.width = img.width;
    canvas.height = img.height;
    context.drawImage(img, 0, 0);

    // Create a canvas for the output image
    const outputCanvas = document.createElement('canvas');
    const ratio = img.height / img.width;
    outputCanvas.width = maxWidth;
    outputCanvas.height = Math.floor(maxWidth * ratio);

    await pica.resize(canvas, outputCanvas, {
      unsharpAmount: 160,
      unsharpRadius: 0.6,
      unsharpThreshold: 1
    });

    const outputBlob = await pica.toBlob(outputCanvas, 'image/png', 0.9);

    const arrayBuffer = await outputBlob.arrayBuffer();
    const outputBuffer = Buffer.from(arrayBuffer);

    await Filesystem.writeFile({
      path: outputPath,
      data: outputBuffer.toString('base64'),
      directory: Directory.Documents,
    });
  }

  async openImageEditor(inputPath: string): Promise<void> {
    return;
  }

  async watchImage(inputPath: string): Promise<void> {
    return;
  }

  async unwatchImage(inputPath: string): Promise<void> {
    return;
  }

  async loadModel(modelPath: string): Promise<void> {
    return;
  }

  async extractZip(zipPath: string, outPath: string): Promise<void> {
    return;
  }

  async spawnLocalAI(): Promise<void> {
    return;
  }

  async isLocalAIRunning(): Promise<boolean> {
    return false;
  }

  async removeBackground(inputImageBase64: string, outputPath: string): Promise<void> {
    return;
  }

  async selectDir(): Promise<string | undefined> {
    return undefined;
  }

  onDownloadProgress(callback: (progress: any) => void | Promise<void>): () => void{
    return () => {};
  }

  onDuplicateScene(callback: (ctx: SceneContextAlt) => void | Promise<void>): () => void {
    return () => {};
  }

  onImageChanged(callback: (path: string) => void | Promise<void>): () => void {
    return () => {};
  }

  onDuplicateImage(callback: (ctx: ImageContextAlt) => void | Promise<void>): () => void {
    return () => {};
  }

  onCopyImage(callback: (ctx: ImageContextAlt) => void | Promise<void>): () => void {
    return () => {};
  }

  onMoveSceneFront(callback: (ctx: SceneContextAlt) => void | Promise<void>): () => void {
    return () => {};
  }

  onMoveSceneBack(callback: (ctx: SceneContextAlt) => void | Promise<void>): () => void {
    return () => {};
  }

  onClose(callback: () => void): () => void {
    return () => {};
  }
}
