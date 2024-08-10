import { cast } from 'mobx-state-tree';
import { backend, isMobile, gameService, imageService } from '.';
import { GenericScene, InpaintScene, Scene, Session } from './types';
import { assert } from './util';
import { v4 } from 'uuid';

export const supportedImageSizes = [200, 400, 500];
const imageDirList = ['outs', 'inpaints'];
const maskDirList = ['inpaint_masks', 'inpaint_orgs'];

const IMAGE_CACHE_SIZE = 256;

const naturalSort = (a: string, b: string) => {
  return a.localeCompare(b, undefined, { numeric: true, sensitivity: 'base' });
};

class LRUCache<K, V> {
  limit: number;
  cache: Map<K, V>;

  constructor(limit: number) {
    this.limit = limit;
    this.cache = new Map<K, V>();
  }

  get(key: K): V | null {
    if (!this.cache.has(key)) {
      return null;
    }
    const value = this.cache.get(key)!;
    this.cache.delete(key);
    this.cache.set(key, value);
    return value;
  }

  set(key: K, value: V): void {
    if (this.cache.has(key)) {
      this.cache.delete(key);
    } else if (this.cache.size >= this.limit) {
      const firstKey = this.cache.keys().next().value;
      this.cache.delete(firstKey);
    }
    this.cache.set(key, value);
  }

  delete(key: K): void {
    this.cache.delete(key);
  }
}

export class ImageService extends EventTarget {
  images: { [key: string]: { [key: string]: string[] } };
  inpaints: { [key: string]: { [key: string]: string[] } };
  cache: LRUCache<string, string>;
  mutexes: { [key: string]: Promise<void> };

  constructor() {
    super();
    this.images = {};
    this.inpaints = {};
    this.cache = new LRUCache(IMAGE_CACHE_SIZE);
    this.mutexes = {};
  }

  private async acquireMutex(path: string) {
    while (this.mutexes[path]) {
      await this.mutexes[path];
    }

    let resolve: () => void = () => {};
    this.mutexes[path] = new Promise((r) => (resolve = r));
    (this.mutexes[path] as any).resolve = resolve;
  }

  private releaseMutex(path: string) {
    const resolve = (this.mutexes[path] as any).resolve;
    delete this.mutexes[path];
    if (resolve) resolve();
  }

  async renameImage(oldPath: string, newPath: string) {
    try {
      await this.acquireMutex(oldPath);
      await this.acquireMutex(newPath);
      await backend.renameFile(oldPath, newPath);
      await this.onRenameFile(oldPath, newPath);
    } finally {
      this.releaseMutex(newPath);
      this.releaseMutex(oldPath);
    }
  }

  async onRenameFile(oldPath: string, newPath: string) {
    const oldPathParts = oldPath.split('/');
    const newPathParts = newPath.split('/');
    const oldDir = oldPathParts[oldPathParts.length - 2];
    const newDir = newPathParts[newPathParts.length - 2];
    assert(oldDir !== 'fastcache' && newDir !== 'fastcache');
    const oldPaths = [];
    const newPaths = [];
    for (const imageSize of supportedImageSizes) {
      oldPaths.push(this.getSmallImagePath(oldPath, imageSize));
      newPaths.push(this.getSmallImagePath(newPath, imageSize));
    }
    for (const path of oldPaths) {
      await this.acquireMutex(path);
    }
    for (const path of newPaths) {
      await this.acquireMutex(path);
    }
    try {
      for (let i = 0; i < oldPaths.length; i++) {
        const oldPath = oldPaths[i];
        const newPath = newPaths[i];
        try {
          await backend.renameFile(oldPath, newPath);
        } catch (e) {}
      }
      if (this.cache.cache.get(oldPath)) {
        this.cache.cache.set(newPath, this.cache.cache.get(oldPath)!);
        this.cache.cache.delete(oldPath);
      }
      for (const imageSize of supportedImageSizes) {
        const oldSmallPath = this.getSmallImagePath(oldPath, imageSize);
        const newSmallPath = this.getSmallImagePath(newPath, imageSize);
        if (this.cache.cache.get(oldSmallPath)) {
          this.cache.cache.set(
            newSmallPath,
            this.cache.cache.get(oldSmallPath)!,
          );
          this.cache.cache.delete(oldSmallPath);
        }
      }
    } finally {
      for (const path of oldPaths) {
        this.releaseMutex(path);
      }
      for (const path of newPaths) {
        this.releaseMutex(path);
      }
    }
  }

  async invalidateCache(path: string) {
    if (path.includes('fastcache')) {
      return;
    }
    await this.acquireMutex(path);
    for (const imageSize of supportedImageSizes) {
      const smallPath = this.getSmallImagePath(path, imageSize);
      await this.acquireMutex(smallPath);
    }
    try {
      this.cache.delete(path);
      for (const imageSize of supportedImageSizes) {
        const smallPath = this.getSmallImagePath(path, imageSize);
        this.cache.delete(smallPath);
        try {
          await backend.deleteFile(smallPath);
        } catch (e) {}
      }
    } finally {
      for (const imageSize of supportedImageSizes) {
        const smallPath = this.getSmallImagePath(path, imageSize);
        this.releaseMutex(smallPath);
      }
      this.releaseMutex(path);
    }
    this.dispatchEvent(
      new CustomEvent('image-cache-invalidated', { detail: { path } }),
    );
  }

  async fetchVibeImage(session: Session, name: string) {
    const path = imageService.getVibesDir(session) + '/' + name.split('/').pop()!;
    return await this.fetchImage(path);
  }

  async writeVibeImage(session: Session, name: string, data: string) {
    const path = imageService.getVibesDir(session) + '/' + name.split('/').pop()!;
    await backend.writeDataFile(path, data);
    await imageService.invalidateCache(path);
  }

  async fetchImage(path: string, holdMutex = true) {
    if (holdMutex) await this.acquireMutex(path);
    try {
      if (this.cache.get(path)) {
        const res = this.cache.get(path);
        return res;
      }
      const data = await backend.readDataFile(path);
      this.cache.set(path, data);
      return data;
    } finally {
      if (holdMutex) this.releaseMutex(path);
    }
  }

  async fetchImageSmall(path: string, size: number) {
    if (size === -1 || (isMobile && size === 500)) {
      return this.fetchImage(path);
    }
    const smallImagePath = this.getSmallImagePath(path, size);
    await this.acquireMutex(smallImagePath);
    try {
      try {
        const resizedImageData = await this.fetchImage(smallImagePath, false);
        return resizedImageData;
      } catch (e) {
        console.log(e);
      }
      await this.resizeImage(path, smallImagePath, size, size);
      const data = (await this.fetchImage(smallImagePath, false))!;
      this.cache.set(smallImagePath, data);
      return data;
    } finally {
      this.releaseMutex(smallImagePath);
    }
  }

  getSmallImagePath(originalPath: string, size: number) {
    const pathParts = originalPath.split('/');
    const fileName = size.toString() + '_' + pathParts.pop();
    pathParts.push('fastcache');
    pathParts.push(fileName!);
    return pathParts.join('/');
  }

  async resizeImage(
    inputPath: string,
    outputPath: string,
    maxWidth: number,
    maxHeight: number,
  ) {
    let scale = maxWidth <= 200 ? 1.25 : 1.1;
    if (isMobile) {
      scale = 1.0;
    }
    maxWidth = Math.ceil(scale * maxWidth);
    maxHeight = Math.ceil(scale * maxHeight);
    await backend.resizeImage({
      inputPath,
      outputPath,
      maxWidth,
      maxHeight,
    });
  }

  // NOTE there is race condition here
  // when deleted resource is being loaded up by somebody
  // we can end up with invalid cache
  // trikcy to handle without global lock
  // but only happens when "swap of scene names" is the case
  // let's just keep it simple; this is probably not common use case
  async onRenameScene(session: Session, oldName: string, newName: string) {
    const cache = this.cache.cache;
    const toDelete = [];
    for (const key of cache.keys()) {
      for (const imgDir of imageDirList.concat(maskDirList)) {
        if (key.startsWith(imgDir + '/' + session.name + '/' + oldName)) {
          toDelete.push(key);
        }
      }
    }
    for (const key of toDelete) {
      cache.delete(key);
    }
    for (const imgDir of imageDirList) {
      const oldPath = imgDir + '/' + session.name + '/' + oldName;
      const newPath = imgDir + '/' + session.name + '/' + newName;
      try {
        await backend.renameDir(oldPath, newPath);
      } catch (e) {
        console.error('rename scene error:', e);
      }
    }
    for (const imgDir of maskDirList) {
      const oldPath = imgDir + '/' + session.name + '/' + oldName + '.png';
      const newPath = imgDir + '/' + session.name + '/' + newName + '.png';
      try {
        await backend.renameFile(oldPath, newPath);
      } catch (e) {
        console.error('rename scene error:', e);
      }
    }
  }

  async resizeImageBrowser(
    dataUrl: string,
    maxWidth: number,
    maxHeight: number,
  ): Promise<string> {
    return new Promise((resolve, reject) => {
      const img = new Image();
      img.src = dataUrl;
      img.onload = () => {
        const canvas = document.createElement('canvas');
        const ctx = canvas.getContext('2d');

        let scale = Math.max(maxWidth / img.width, maxHeight / img.height);

        ctx?.drawImage(img, 0, 0, canvas.width, canvas.height);
        resolve(canvas.toDataURL('image/png'));
      };
      img.onerror = reject;
    });
  }

  getOutputs(session: Session, scene: GenericScene) {
    if (scene.type === 'scene') {
      return this.getImages(session, scene);
    }
    return this.getInPaints(session, scene);
  }

  getImages(session: Session, scene: Scene) {
    if (!(session.name in this.images)) {
      return [];
    }
    if (!(scene.name in this.images[session.name])) {
      return [];
    }
    return this.images[session.name][scene.name];
  }

  getInPaints(session: Session, scene: InpaintScene) {
    if (!(session.name in this.inpaints)) {
      return [];
    }
    if (!(scene.name in this.inpaints[session.name])) {
      return [];
    }
    return this.inpaints[session.name][scene.name];
  }

  getOutputDir(session: Session, scene: GenericScene) {
    if (scene.type === 'scene') {
      return this.getImageDir(session, scene);
    }
    return this.getInPaintDir(session, scene);
  }

  getImageDir(session: Session, scene: Scene) {
    return 'outs/' + session.name + '/' + scene.name;
  }

  getInPaintDir(session: Session, scene: InpaintScene) {
    return 'inpaints/' + session.name + '/' + scene.name;
  }

  getVibesDir(session: Session) {
    return 'vibes/' + session.name;
  }

  async storeVibeImage(session: Session, data: string) {
    const path = imageService.getVibesDir(session) + '/' + v4() + '.png';
    await backend.writeDataFile(path, data);
    return path.split('/').pop()!;
  }

  getVibeImagePath(session: Session, name: string) {
    return imageService.getVibesDir(session) + '/' + name.split('/').pop()!;
  }

  async refresh(
    session: Session,
    scene: GenericScene,
    emitEvent: boolean = true,
  ) {
    const target = scene.type === 'scene' ? this.images : this.inpaints;
    if (!(session.name in target)) {
      target[session.name] = {};
    }
    const fileSet: any = {};
    let files = await backend.listFiles(this.getOutputDir(session, scene));
    files = files.filter((x: string) => x.endsWith('.png'));
    files.sort(naturalSort);
    for (const file of files) {
      fileSet[file] = true;
    }
    const invImageMap: any = {};
    for (let i = 0; i < scene.imageMap.length; i++) {
      invImageMap[scene.imageMap[i]] = i;
    }
    let newImageMap = scene.imageMap.filter((x: string) => x in fileSet);
    for (const file of files) {
      if (!(file in invImageMap)) {
        newImageMap.push(file);
      }
    }
    scene.imageMap = newImageMap;
    target[session.name][scene.name] = [...scene.imageMap];
    if (scene.type === 'scene') {
      scene.mains = scene.mains.filter((x: string) => x in fileSet);
    }
    if (emitEvent)
      this.dispatchEvent(
        new CustomEvent('updated', {
          detail: { batch: false, session, scene },
        }),
      );
  }

  async refreshBatch(session: Session) {
    for (const scene of session.scenes.values()) {
      try {
        await this.refresh(session, scene, false);
      } catch (e) {}
    }
    for (const scene of session.inpaints.values()) {
      try {
        await this.refresh(session, scene, false);
      } catch (e) {}
    }
    this.dispatchEvent(
      new CustomEvent('updated', { detail: { batch: true, session } }),
    );
  }

  onAddImage(session: Session, scene: string, path: string) {
    if (!(session.name in this.images)) {
      this.images[session.name] = {};
    }
    if (!(scene in this.images[session.name])) {
      this.images[session.name][scene] = [];
    }
    this.images[session.name][scene] = this.images[session.name][scene].concat([
      path.split('/').pop()!,
    ]);
    session.scenes.get(scene)?.imageMap.push(path.split('/').pop()!);
    if (isMobile)
      for (const size of supportedImageSizes) this.fetchImageSmall(path, size);
    this.dispatchEvent(
      new CustomEvent('updated', {
        detail: { batch: false, session, scene: session.scenes.get(scene) },
      }),
    );
  }

  onAddInPaint(session: Session, scene: string, path: string) {
    if (!(session.name in this.inpaints)) {
      this.inpaints[session.name] = {};
    }
    if (!(scene in this.inpaints[session.name])) {
      this.inpaints[session.name][scene] = [];
    }
    this.inpaints[session.name][scene] = this.inpaints[session.name][
      scene
    ].concat([path.split('/').pop()!]);
    session.inpaints.get(scene)?.imageMap.push(path.split('/').pop()!);
    if (isMobile)
      for (const size of supportedImageSizes) this.fetchImageSmall(path, size);
    this.dispatchEvent(
      new CustomEvent('updated', {
        detail: { batch: false, session, scene: session.inpaints.get(scene) },
      }),
    );
  }
}

export function base64ToDataUri(data: string) {
  return 'data:image/png;base64,' + data;
}

export function dataUriToBase64(dataUri: string) {
  return dataUri.split(',')[1];
}

export function getMainImagePath(session: Session, scene: Scene) {
  if (scene.mains.length) {
    return imageService.getImageDir(session, scene) + '/' + scene.mains[0];
  }
  const images = gameService.getOutputs(session, scene);
  if (images.length) {
    return imageService.getImageDir(session, scene) + '/' + images[0];
  }
  return undefined;
}

export async function getMainImage(
  session: Session,
  scene: GenericScene,
  size: number,
) {
  if (scene.mains.length) {
    const path =
      imageService.getOutputDir(session, scene) + '/' + scene.mains[0];
    const base64 = await imageService.fetchImageSmall(path, size);
    return base64;
  }
  const images = gameService.getOutputs(session, scene);
  if (images.length) {
    const path = imageService.getOutputDir(session, scene) + '/' + images[0];
    return await imageService.fetchImageSmall(path, size);
  }
  return undefined;
}

export const deleteImageFiles = async (
  curSession: Session,
  paths: string[],
  scene?: GenericScene,
) => {
  for (const path of paths) {
    await backend.trashFile(path);
    await imageService.invalidateCache(path);
  }
  if (scene) {
    await imageService.refresh(curSession, scene);
  } else {
    await imageService.refreshBatch(curSession);
  }
};

export const renameImage = async (oldPath: string, newPath: string) => {
  await imageService.renameImage(oldPath, newPath);
};
