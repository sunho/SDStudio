import { Config } from '../../main/config';
import { ImageGenInput, ImageGenService } from './imageGen';
import { Backend, FileEntry, ResizeImageInput } from '../backend';
import { NovelAiFetcher, NovelAiImageGenService } from './genVendors/nai';
import { ImageContextAlt, SceneContextAlt } from '../models/types';

const invoke = window.electron?.ipcRenderer?.invoke;

class ElectronFetcher implements NovelAiFetcher {
  async fetchArrayBuffer(
    url: string,
    body: any,
    headers: any,
  ): Promise<Uint8Array> {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => {
      controller.abort();
    }, 120 * 1000);
    const response = await fetch(url, {
      body: JSON.stringify(body),
      headers: headers,
      method: 'POST',
      signal: controller.signal,
    });
    clearTimeout(timeoutId);
    if (!response.ok) {
      throw new Error(`Failed to fetch: ${response.status}`);
    }
    return new Uint8Array(await response.arrayBuffer());
  }
}

export class ElectornBackend extends Backend {
  private imageGenService: ImageGenService;
  constructor() {
    super();
    this.imageGenService = new NovelAiImageGenService(new ElectronFetcher());
  }

  async getConfig(): Promise<Config> {
    return await invoke('get-config');
  }

  async setConfig(newConfig: Config): Promise<void> {
    await invoke('set-config', newConfig);
  }

  async getVersion(): Promise<string> {
    return await invoke('get-version');
  }

  async openWebPage(url: string): Promise<void> {
    await invoke('open-web-page', url);
  }

  async generateImage(arg: ImageGenInput): Promise<void> {
    const token = await this.readFile('TOKEN.txt');
    const res = await this.imageGenService.generateImage(token, arg);
    await this.writeDataFile(arg.outputFilePath, res);
  }

  async getRemainCredits(): Promise<number> {
    const token = await this.readFile('TOKEN.txt');
    return await this.imageGenService.getRemainCredits(token);
  }

  async login(email: string, password: string): Promise<void> {
    const token = await this.imageGenService.login(email, password);
    await this.writeFile('TOKEN.txt', token.accessToken);
  }

  async showFile(arg: string): Promise<void> {
    await invoke('show-file', arg);
  }

  async copyToDownloads(path: string): Promise<void> {
    return;
  }

  async zipFiles(files: FileEntry[], outPath: string): Promise<void> {
    await invoke('zip-files', files, outPath);
  }

  async unzipFiles(zipPath: string, outPath: string): Promise<void> {
    await invoke('unzip-files', zipPath, outPath);
  }

  async searchTags(word: string): Promise<any> {
    return await invoke('search-tags', word);
  }

  async lookupTag(word: string): Promise<any> {
    return await invoke('lookup-tag', word);
  }

  async loadPiecesDB(pieces: string[]): Promise<void> {
    await invoke('load-pieces-db', pieces);
  }

  async searchPieces(word: string): Promise<any> {
    return await invoke('search-pieces', word);
  }

  async listFiles(arg: string): Promise<string[]> {
    return await invoke('list-files', arg);
  }

  async readFile(filename: string): Promise<string> {
    return await invoke('read-file', filename);
  }

  async writeFile(filename: string, data: string): Promise<void> {
    await invoke('write-file', filename, data);
  }

  async copyFile(src: string, dest: string): Promise<void> {
    await invoke('copy-file', src, dest);
  }

  async readDataFile(arg: string): Promise<string> {
    return await invoke('read-data-file', arg);
  }

  async writeDataFile(filename: string, data: string): Promise<void> {
    await invoke('write-data-file', filename, data);
  }

  async renameFile(oldfile: string, newfile: string): Promise<void> {
    await invoke('rename-file', oldfile, newfile);
  }

  async renameDir(oldfile: string, newfile: string): Promise<void> {
    await invoke('rename-dir', oldfile, newfile);
  }

  async deleteFile(filename: string): Promise<void> {
    await invoke('delete-file', filename);
  }

  async deleteDir(filename: string): Promise<void> {
    await invoke('delete-dir', filename);
  }

  async trashFile(filename: string): Promise<void> {
    await invoke('trash-file', filename);
  }

  async close(): Promise<void> {
    await invoke('close');
  }

  async existFile(filename: string): Promise<boolean> {
    return await invoke('exist-file', filename);
  }

  async download(url: string, dest: string, filename: string): Promise<void> {
    await invoke('download', url, dest, filename);
  }

  async resizeImage(input: ResizeImageInput): Promise<void> {
    await invoke('resize-image', input);
  }

  async openImageEditor(inputPath: string): Promise<void> {
    await invoke('open-image-editor', inputPath);
  }

  async watchImage(inputPath: string): Promise<void> {
    await invoke('watch-image', inputPath);
  }

  async unwatchImage(inputPath: string): Promise<void> {
    await invoke('unwatch-image', inputPath);
  }

  async loadModel(modelPath: string): Promise<void> {
    await invoke('load-model', modelPath);
  }

  async extractZip(zipPath: string, outPath: string): Promise<void> {
    await invoke('extract-zip', zipPath, outPath);
  }

  async spawnLocalAI(): Promise<void> {
    await invoke('spawn-local-ai');
  }

  async isLocalAIRunning(): Promise<boolean> {
    return await invoke('is-local-ai-running');
  }

  async selectDir() {
    return await invoke('select-dir');
  }

  async selectFile() {
    return await invoke('select-file');
  }

  async removeBackground(
    inputImageBase64: string,
    outputPath: string,
  ): Promise<void> {
    await invoke('remove-bg', inputImageBase64, outputPath);
  }

  onDownloadProgress(
    callback: (progress: any) => void | Promise<void>,
  ): () => void {
    return window.electron.ipcRenderer.on('download-progress', callback);
  }

  onZipProgress(callback: (progress: any) => void | Promise<void>): () => void {
    return window.electron.ipcRenderer.on('zip-progress', callback);
  }

  onDuplicateScene(
    callback: (ctx: SceneContextAlt) => void | Promise<void>,
  ): () => void {
    return window.electron.ipcRenderer.on('duplicate-scene', callback);
  }

  onImageChanged(callback: (path: string) => void | Promise<void>): () => void {
    return window.electron.ipcRenderer.on('image-changed', callback);
  }

  onDuplicateImage(
    callback: (ctx: ImageContextAlt) => void | Promise<void>,
  ): () => void {
    return window.electron.ipcRenderer.on('duplicate-image', callback);
  }

  onCopyImage(
    callback: (ctx: ImageContextAlt) => void | Promise<void>,
  ): () => void {
    return window.electron.ipcRenderer.on('copy-image', callback);
  }

  onMoveSceneFront(
    callback: (ctx: SceneContextAlt) => void | Promise<void>,
  ): () => void {
    return window.electron.ipcRenderer.on('move-scene-front', callback);
  }

  onMoveSceneBack(
    callback: (ctx: SceneContextAlt) => void | Promise<void>,
  ): () => void {
    return window.electron.ipcRenderer.on('move-scene-back', callback);
  }

  onClose(callback: () => void | Promise<void>): () => void {
    return window.electron.ipcRenderer.on('close', callback);
  }

  async copyImageToClipboard(imagePath: string): Promise<void> {
    await invoke('copy-image-to-clipboard', imagePath);
  }
}
