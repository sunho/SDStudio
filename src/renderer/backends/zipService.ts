import { registerPlugin } from "@capacitor/core";

export interface FileEntry {
  name: string;
  path: string;
}

export interface ZipPlugin {
  zipFiles(options: { files: FileEntry[]; outPath: string }): Promise<void>;
  unzipFiles(options: { zipPath: string; outPath: string }): Promise<void>;
}

const ZipService = registerPlugin<ZipPlugin>('ZipService');

export default ZipService;
