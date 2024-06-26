import { watchFile } from 'fs';
import { ImageGenInput, Model, Resolution, Sampling } from '../main/imageGen';
import { CircularQueue } from './circularQueue';

import { v4 as uuidv4 } from 'uuid';
import ExifReader from 'exifreader';
import { setInterval } from 'timers/promises';
import { Config } from '../main/config';
import { a } from 'hangul-js';

const PROMPT_SERVICE_INTERVAL = 5000;
const UPDATE_SERVICE_INTERVAL = 60*1000;
const SESSION_SERVICE_INTERVAL = 5000;
const FAST_TASK_TIME_ESTIMATOR_SAMPLE_COUNT = 16;
const TASK_TIME_ESTIMATOR_SAMPLE_COUNT = 128;
const IMAGE_CACHE_SIZE = 256;
const TASK_DEFAULT_ESTIMATE = 22 * 1000;
const RANDOM_DELAY_BIAS = 6.0;
const RANDOM_DELAY_STD = 3.0;
const LARGE_RANDOM_DELAY_BIAS = RANDOM_DELAY_BIAS * 2;
const LARGE_RANDOM_DELAY_STD = RANDOM_DELAY_STD * 2;
const LARGE_WAIT_DELAY_BIAS = 5*60;
const LARGE_WAIT_DELAY_STD = 2.5*60;
const LARGE_WAIT_INTERVAL_BIAS = 500;
const LARGE_WAIT_INTERVAL_STD = 100;
const FAST_TASK_DEFAULT_ESTIMATE = TASK_DEFAULT_ESTIMATE - RANDOM_DELAY_BIAS * 1000 - RANDOM_DELAY_STD * 1000 / 2 + 1000;

export function assert(condition: any, message?: string): asserts condition {
  if (!condition) {
    throw new Error(message);
  }
}

export const invoke = window.electron.ipcRenderer.invoke;

export const defaultFPrompt = `1girl, {artist:ixy}`;
export const defaultBPrompt = `{best quality, amazing quality, very aesthetic, highres, incredibly absurdres}`;
export const defaultUC = `worst quality, bad quality, displeasing, very displeasing, lowres, bad anatomy, bad perspective, bad proportions, bad aspect ratio, bad face, long face, bad teeth, bad neck, long neck, bad arm, bad hands, bad ass, bad leg, bad feet, bad reflection, bad shadow, bad link, bad source, wrong hand, wrong feet, missing limb, missing eye, missing tooth, missing ear, missing finger, extra faces, extra eyes, extra eyebrows, extra mouth, extra tongue, extra teeth, extra ears, extra breasts, extra arms, extra hands, extra legs, extra digits, fewer digits, cropped head, cropped torso, cropped shoulders, cropped arms, cropped legs, mutation, deformed, disfigured, unfinished, chromatic aberration, text, error, jpeg artifacts, watermark, scan, scan artifacts`;

export function getDefaultPreset(): PreSet {
  return {
    frontPrompt: defaultFPrompt,
    backPrompt: defaultBPrompt,
    uc: defaultUC,
    vibes: [],
    sampling: Sampling.KEulerAncestral,
    promptGuidance: 5.0,
    steps: 28,
  };
}

export interface VibeItem {
  image: string;
  info: number;
  strength: number;
}

export interface PreSet {
  frontPrompt: string;
  backPrompt: string;
  uc: string;
  vibes: VibeItem[];
  steps?: number;
  promptGuidance?: number;
  smeaOff?: boolean;
  dynOn?: boolean;
  sampling?: Sampling;
  seed?: number;
}

export interface PieceLibrary {
  description: string;
  pieces: { [key: string]: string };
  multi:  { [key: string]: boolean };
}

export interface PromptPiece {
  prompt: string;
  enabled: boolean | undefined;
}

export type PromptPieceSlot = PromptPiece[];

export type Game = Player[];

export interface Player {
  rank: number;
  path: string;
}

export interface Scene {
  type: 'scene';
  name: string;
  resolution: string;
  locked: boolean;
  slots: PromptPieceSlot[];
  game: Game | undefined;
  round: Round | undefined;
  landscape?: boolean;
  mains: string[];
}

export interface InPaintScene {
  type: 'inpaint';
  name: string;
  resolution: string;
  prompt: string;
  uc: string;
  game: Game | undefined;
  round: Round | undefined;
  landscape?: boolean;
  sceneRef?: string;
  image?: string;
  mask?: string;
  originalImage?: boolean;
}

export interface Session {
  name: string;
  presets: { [key: string]: PreSet };
  inpaints: { [key: string]: InPaintScene };
  scenes: { [key: string]: Scene };
  library: { [key: string]: PieceLibrary };
}

export const isValidPreSet = (preset: any) => {
  return (
    typeof preset.frontPrompt === 'string' &&
    typeof preset.backPrompt === 'string' &&
    typeof preset.uc === 'string'
  );
};

export const isValidPromptPiece = (piece: any) => {
  return (
    typeof piece.prompt === 'string' &&
    (typeof piece.enabled === 'boolean' || piece.enabled === undefined)
  );
};

export const isValidPromptPieceSlot = (slot: any) =>
  Array.isArray(slot) && slot.every(isValidPromptPiece);

export const isValidGame = (game: any) =>
  Array.isArray(game) &&
  game.every((player) => {
    return typeof player.rank === 'number' && typeof player.path === 'string';
  });

export const isValidScene = (scene: any) => {
  return (
    scene.type === 'scene' &&
    typeof scene.name === 'string' &&
    typeof scene.locked === 'boolean' &&
    Array.isArray(scene.slots) &&
    scene.slots.every(isValidPromptPieceSlot) &&
    (scene.game === undefined || isValidGame(scene.game)) &&
    (scene.main === undefined || typeof scene.main === 'string')
  );
};

export const isValidInPaintScene = (inpaint: any) => {
  return (
    inpaint.type === 'inpaint' &&
    typeof inpaint.name === 'string' &&
    (inpaint.game === undefined || isValidGame(inpaint.game)) &&
    (inpaint.sceneRef === undefined || typeof inpaint.sceneRef === 'string')
  );
};

export const isValidPieceLibrary = (library: any) => {
  return (
    typeof library.description === 'string' &&
    typeof library.pieces === 'object' &&
    Object.values(library.pieces).every((value) => typeof value === 'string')
  );
};

export const isValidSession = (session: any) => {
  return (
    typeof session.name === 'string' &&
    typeof session.presets === 'object' &&
    Object.values(session.presets).every(isValidPreSet) &&
    typeof session.inpaints === 'object' &&
    Object.values(session.inpaints).every(isValidInPaintScene) &&
    typeof session.scenes === 'object' &&
    Object.values(session.scenes).every(isValidScene) &&
    typeof session.library === 'object' &&
    Object.values(session.library).every(isValidPieceLibrary)
  );
};

export interface BakedPreSet {
  prompt: PromptNode;
  resolution: Resolution;
  uc: string;
  vibes: VibeItem[];
  sampling: Sampling;
  smea: boolean;
  dyn: boolean;
  steps: number;
  promptGuidance: number;
  seed?: number;
}

export interface GenerateTask {
  type: 'generate';
  id: string | undefined;
  session: Session;
  scene: string;
  preset: BakedPreSet;
  outPath: string;
  done: number;
  total: number;
  nodelay?: boolean;
  onComplete?: (path: string) => void;
}

export interface InPaintTask {
  type: 'inpaint';
  id: string | undefined;
  session: Session;
  scene: string;
  image: string;
  mask: string;
  preset: BakedPreSet;
  outPath: string;
  done: number;
  total: number;
  nodelay?: boolean;
  onComplete?: (path: string) => void;
  originalImage?: boolean;
}

function getRandomInt(min: number, max: number): number {
  min = Math.ceil(min);
  max = Math.floor(max);
  return Math.floor(Math.random() * (max - min)) + min;
}

const MOD = 2100000000;
function randomBaseSeed() {
  return getRandomInt(1, MOD);
}

function stepSeed(seed: number) {
  seed ^= seed << 13;
  seed ^= seed >> 17;
  seed ^= seed << 5;
  seed = (seed >>> 0) % MOD;
  return Math.max(1, seed);
}

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export function cleanPARR(parr: PARR): PARR {
  return parr.map((p) => p.trim());
}

export function toPARR(str: string) {
  return cleanPARR(str.replace('\n',',').split(',')).filter((x) => x !== '');
}

export type PARR = string[];

abstract class ResourceSyncService<T> extends EventTarget {
  resources: { [name: string]: T };
  dirty: { [name: string]: boolean };
  resourceList: string[];
  resourceDir: string;
  updateInterval: number;
  running: boolean;
  constructor(resourceDir: string, interval: number) {
    super();
    this.resources = {};
    this.dirty = {};
    this.resourceDir = resourceDir;
    this.resourceList = [];
    this.updateInterval = interval;
    this.running = true;
  }

  abstract createDefault(name: string): T;
  abstract getHook(rc: T, name: string): Promise<void>;

  async add(name: string) {
    if (name in this.resources) {
      throw new Error('Resource already exists');
    }
    this.resources[name] = this.createDefault(name);
    await this.getHook(this.resources[name], name);
    this.markUpdated(name);
    await this.update();
  }

  list() {
    return this.resourceList;
  }

  getPath(name: string) {
    return this.resourceDir + '/' + name + '.json';
  }

  async delete(name: string) {
    if (name in this.resources) {
      delete this.resources[name];
      await invoke(
        'rename-file',
        this.resourceDir + '/' + name + '.json',
        this.resourceDir + '/' + name + '.deleted',
      );
      await this.update();
    }
  }

  getFast(name: string) {
    const rc = this.resources[name];
    if (!rc) {
      this.get(name);
    }
    return rc;
  }

  async get(name: string): Promise<T | undefined> {
    if (!(name in this.resources)) {
      try {
        const str = await invoke(
          'read-file',
          this.resourceDir + '/' + name + '.json',
        );
        this.resources[name] = JSON.parse(str);
        await this.getHook(this.resources[name], name);
        this.dispatchEvent(
          new CustomEvent<{ name: string }>('fetched', { detail: { name } }),
        );
      } catch (e: any) {
        console.error('get library error:', e);
        return undefined;
      }
    }
    return this.resources[name];
  }

  async update() {
    for (const name of Object.keys(this.dirty)) {
      const l = await this.get(name);
      if (l)
        await invoke(
          'write-file',
          this.resourceDir + '/' + name + '.json',
          JSON.stringify(l),
        );
    }
    this.dirty = {};
    this.resourceList = await this.getList();
    this.dispatchEvent(new CustomEvent('listupdated', {}));
  }

  async saveAll() {
    for (const name of Object.keys(this.resources)) {
      const l = this.resources[name];
      await invoke(
        'write-file',
        this.resourceDir + '/' + name + '.json',
        JSON.stringify(l),
      );
    }
  }

  async createFrom(name: string, value: T) {
    if (name in this.resources) {
      throw new Error('Resource already exists');
    }
    this.resources[name] = value;
    await this.getHook(this.resources[name], name);
    this.markUpdated(name);
    await this.update();
  }

  async run() {
    while (this.running) {
      await this.update();
      await sleep(this.updateInterval);
    }
  }

  markUpdated(name: string) {
    this.dirty[name] = true;
    this.dispatchEvent(
      new CustomEvent<{ name: string }>('updated', { detail: { name } }),
    );
  }

  private async getList() {
    const sessions = await invoke('list-files', this.resourceDir);
    return sessions
      .filter((x: string) => x.endsWith('.json'))
      .map((x: string) => x.substring(0, x.length - 5));
  }
}

export class SessionService extends ResourceSyncService<Session> {
  constructor() {
    super('projects', SESSION_SERVICE_INTERVAL);
  }

  async getHook(rc: Session, name: string) {
    rc.name = name;
    await this.migrateSession(rc);
  }

  createDefault(name: string): Session {
    return {
      name: name,
      presets: {
        default: getDefaultPreset(),
      },
      inpaints: {},
      scenes: {},
      library: {},
    };
  }

  getInpaintOrgPath(session: Session, inpaint: InPaintScene) {
    return (
      'inpaint_orgs/' + session.name + '/' + inpaint.name + '.png'
    );
  }

  getInpaintMaskPath(session: Session, inpaint: InPaintScene) {
    return (
      'inpaint_masks/' + session.name + '/' + inpaint.name + '.png'
    );
  }

  async migrateSession(session: Session) {
    for (const preset of Object.values(session.presets)) {
      if ((preset as any).vibe) {
        preset.vibes = [{ image: (preset as any).vibe, info: 1, strength: 0.6 }];
        (preset as any).vibe = undefined;
      }
      if (preset.vibes == null) {
        preset.vibes = [];
      }
    }

    for (const inpaint of Object.values(session.inpaints)) {
      if (inpaint.image) {
        try {
          const path = "inpaint_orgs/" + session.name + "/" + inpaint.name + ".png";
          await invoke('write-data-file', path, inpaint.image);
          inpaint.image = undefined;
        } catch(e){
          inpaint.image = undefined;
        }
      }
      if (inpaint.mask) {
        try {
          const path = "inpaint_masks/" + session.name + "/" + inpaint.name + ".png";
          await invoke('write-data-file', path, inpaint.mask);
          inpaint.mask = undefined;
        } catch(e) {
          inpaint.mask = undefined;
        }
      }
      if ((inpaint as any).middlePrompt != null) {
        inpaint.prompt = '';
        try {
          const image = dataUriToBase64(await imageService.fetchImage(this.getInpaintOrgPath(session, inpaint)));
          const [prompt, seed, scale, sampler, steps, uc] = await extractPromptDataFromBase64(image);
          inpaint.prompt = prompt;
        } catch (e) {
          inpaint.prompt = (inpaint as any).middlePrompt;
        }
        (inpaint as any).middlePrompt = undefined;
      }
      if (!inpaint.uc) {
        inpaint.uc = '';
        try {
          const image = dataUriToBase64(await imageService.fetchImage(this.getInpaintOrgPath(session, inpaint)));
          const [prompt, seed, scale, sampler, steps, uc] = await extractPromptDataFromBase64(image);
          inpaint.uc = uc;
        } catch (e) {
          inpaint.uc = defaultUC;
        }
      }
    }

    for (const scene of Object.values(session.scenes)) {
      if (scene.landscape != null) {
        if (scene.landscape) {
          scene.resolution = 'landscape';
        } else {
          scene.resolution = 'portrait';
        }
        scene.landscape = undefined;
      }
      if ((scene as any).main) {
        scene.mains = [(scene as any).main];
        (scene as any).main = undefined;
      }
      scene.mains = scene.mains ?? [];
    }

    for (const inpaint of Object.values(session.inpaints)) {
      if (inpaint.landscape != null) {
        if (inpaint.landscape) {
          inpaint.resolution = 'landscape';
        } else {
          inpaint.resolution = 'portrait';
        }
        inpaint.landscape = undefined;
      }
    }

    for (const library of Object.values(session.library)) {
      if (!library.multi) {
        library.multi = {};
      }
    }
  }

  async saveInpaintImages(seesion: Session, inpaint: InPaintScene, image: string, mask: string) {
    await invoke('write-data-file', this.getInpaintOrgPath(seesion, inpaint), image);
    await invoke('write-data-file', this.getInpaintMaskPath(seesion, inpaint), mask);
    await imageService.invalidateCache(this.getInpaintOrgPath(seesion, inpaint));
    await imageService.invalidateCache(this.getInpaintMaskPath(seesion, inpaint));
  }

  inPaintHook(): void {
    this.dispatchEvent(new CustomEvent('inpaint-updated', {}));
  }

  mainImageUpdated(): void {
    this.dispatchEvent(new CustomEvent('main-image-updated', {}));
  }

  pieceLibraryImported(): void {
    this.dispatchEvent(new CustomEvent('piece-library-imported', {}));
  }

  sceneOrderChanged(): void {
    this.dispatchEvent(new CustomEvent('scene-order-changed', {}));
  }

  async reloadPieceLibraryDB(session: Session) {
    const res = [];
    for (const [k,v] of Object.entries(session.library)) {
      for (const piece of Object.keys(v.pieces)) {
        res.push(k + "." + piece);
      }
    }
    await invoke('load-pieces-db', res);
  }
}

export const sessionService = new SessionService();
sessionService.run();

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

const naturalSort = (a: string, b: string) => {
  return b.localeCompare(a, undefined, { numeric: true, sensitivity: 'base' });
};

export const supportedImageSizes = [200, 400, 500];
const imageDirList = ['outs', 'inpaints'];
const maskDirList = ['inpaint_masks', 'inpaint_orgs'];

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

    let resolve: () => void;
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
      await invoke('rename-file', oldPath, newPath);
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
          await invoke('rename-file', oldPath, newPath);
        } catch (e) {
        }
      }
      if (this.cache.cache.get(oldPath)) {
        this.cache.cache.set(newPath, this.cache.cache.get(oldPath)!);
        this.cache.cache.delete(oldPath);
      }
      for (const imageSize of supportedImageSizes) {
        const oldSmallPath = this.getSmallImagePath(oldPath, imageSize);
        const newSmallPath = this.getSmallImagePath(newPath, imageSize);
        if (this.cache.cache.get(oldSmallPath)) {
          this.cache.cache.set(newSmallPath, this.cache.cache.get(oldSmallPath)!);
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
          await invoke('delete-file', smallPath);
        } catch(e) {
        }
      }
    } finally {
      for (const imageSize of supportedImageSizes) {
        const smallPath = this.getSmallImagePath(path, imageSize);
        this.releaseMutex(smallPath);
      }
      this.releaseMutex(path);
    }
    this.dispatchEvent(new CustomEvent('image-cache-invalidated', { detail: { path } }));
  }

  async fetchImage(path: string, holdMutex = true) {
    if (holdMutex)
      await this.acquireMutex(path);
    try {
      if (this.cache.get(path)) {
        const res = this.cache.get(path);
        return res;
      }
      const data = await invoke('read-data-file', path);
      this.cache.set(path, data);
      return data;
    } finally {
      if (holdMutex)
        this.releaseMutex(path);
    }
  }

  async fetchImageSmall(path: string, size: number) {
    if (size === -1) {
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
      const data = await this.fetchImage(smallImagePath, false);
      this.cache.set(smallImagePath, data);
      return data;
    } finally {
      this.releaseMutex(smallImagePath);
    }
  }

  getSmallImagePath(originalPath: string, size: number) {
    const pathParts = originalPath.split('/');
    const fileName = size.toString() + "_" + pathParts.pop();
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
    const scale = maxWidth <= 200 ? 1.25 : 1.1;
    maxWidth = Math.ceil(scale*maxWidth);
    maxHeight = Math.ceil(scale*maxHeight);
    await invoke('resize-image', {
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
        await invoke('rename-dir', oldPath, newPath);
      } catch (e) {
        console.error('rename scene error:', e);
      }
    }
    for (const imgDir of maskDirList) {
      const oldPath = imgDir + '/' + session.name + '/' + oldName + '.png';
      const newPath = imgDir + '/' + session.name + '/' + newName + '.png';
      try {
        await invoke('rename-file', oldPath, newPath);
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

  getInPaints(session: Session, scene: InPaintScene) {
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

  getInPaintDir(session: Session, scene: InPaintScene) {
    return 'inpaints/' + session.name + '/' + scene.name;
  }

  async refresh(session: Session, scene: GenericScene, emitEvent: boolean = true) {
    const target = scene.type === 'scene' ? this.images : this.inpaints;
    if (!(session.name in target)) {
      target[session.name] = {};
    }
    let files = await invoke('list-files', this.getOutputDir(session, scene));
    files = files.filter((x: string) => x.endsWith('.png'));
    files = files.map(
      (x: string) => this.getOutputDir(session, scene) + '/' + x,
    );
    files.sort(naturalSort);
    target[session.name][scene.name] = files;
    if (scene.type === 'scene') {
      const names = files.map((x: string) => x.split('/').pop());
      scene.mains = scene.mains.filter((x) => names.includes(x));
    }
    if (emitEvent)
      this.dispatchEvent(new CustomEvent('updated', { detail: { batch: false, session, scene } }));
  }

  async refreshBatch(session: Session) {
    for (const scene of Object.values(session.scenes)) {
      await this.refresh(session, scene, false);
    }
    for (const scene of Object.values(session.inpaints)) {
      await this.refresh(session, scene, false);
    }
    this.dispatchEvent(new CustomEvent('updated', { detail: {batch: true, session}}));
  }

  onAddImage(session: Session, scene: string, path: string) {
    if (!(session.name in this.images)) {
      this.images[session.name] = {};
    }
    if (!(scene in this.images[session.name])) {
      this.images[session.name][scene] = [];
    }
    this.images[session.name][scene] = this.images[session.name][scene].concat([path]);
    this.images[session.name][scene].sort(naturalSort);
    this.dispatchEvent(new CustomEvent('updated', { detail: { batch: false, session, scene: session.scenes[scene] }}));
  }

  onAddInPaint(session: Session, scene: string, path: string) {
    if (!(session.name in this.inpaints)) {
      this.inpaints[session.name] = {};
    }
    if (!(scene in this.inpaints[session.name])) {
      this.inpaints[session.name][scene] = [];
    }
    this.inpaints[session.name][scene] = this.inpaints[session.name][scene].concat([path]);
    this.inpaints[session.name][scene].sort(naturalSort);
    this.dispatchEvent(new CustomEvent('updated', { detail: { batch: false, session, scene: session.inpaints[scene] }}));
  }
}

export const imageService = new ImageService();

export class PromptService extends ResourceSyncService<PieceLibrary> {
  running: boolean;
  constructor() {
    super('pieces', PROMPT_SERVICE_INTERVAL);
    this.running = true;
  }

  async getHook(rc: PieceLibrary, name: string) {}

  createDefault(name: string): PieceLibrary {
    return {
      description: name,
      pieces: {},
      multi: {}
    };
  }

  tryExpandPiece(
    p: string,
    session: Session,
    scene: InPaintScene | Scene | undefined = undefined,
  ) {
    const errorInfo =
      'project:' +
      (session?.name ?? '') +
      ', scene:' +
      (scene?.name ?? '') +
      '[' +
      (scene?.type === 'inpaint' ? 'inpaint' : '') +
      ']';
    if (p.charAt(0) === '<' && p.charAt(p.length - 1) === '>') {
      p = p.substring(1, p.length - 1);
      const parts = p.split('.');
      if (parts.length !== 2) {
        throw new Error(
          '올바르지 않은 조각 문법 "' + p + '" (' + errorInfo + ')',
        );
      }
      const lib = session.library[parts[0]];
      if (!lib) {
        throw new Error(
          '존재하지 않는 조각 모음 "' + p + '" (' + errorInfo + ')',
        );
      }
      if (!(parts[1] in lib.pieces)) {
        throw new Error('존재하지 않는 조각 "' + p + '" (' + errorInfo + ')');
      }
      return lib.pieces[parts[1]];
    }
    throw new Error('조각이 아닙니다 "' + p + '" (' + errorInfo + ')');
  }

  isMulti(p: string, session: Session) {
    if (p.charAt(0) !== '<' || p.charAt(p.length - 1) !== '>') {
      return false;
    }
    p = p.substring(1, p.length - 1);
    const parts = p.split('.');
    if (parts.length !== 2) {
      return false;
    }
    const lib = session.library[parts[0]];
    if (!lib) {
      return false;
    }
    return lib.multi[parts[1]] ?? false;
  }

  parseWord(
    word: string,
    session: Session,
    scene: InPaintScene | Scene | undefined = undefined,
    visited: { [key: string]: boolean } | undefined = undefined,
  ): PromptNode {
    if (!visited) {
      visited = {};
    }
    if (word.charAt(0) === '<' && word.charAt(word.length - 1) === '>') {
      const res: PromptGroupNode = {
        type: 'group',
        children: [],
      };
      if (visited[word]) {
        throw new Error('Cyclic detected at ' + word);
      }
      visited[word] = true;
      if (this.isMulti(word, session)) {
        const expanded = this.tryExpandPiece(word, session, scene);
        const lines = expanded.split('\n');
        const randNode : PromptRandomNode = {
          type: 'random',
          options: [],
        };
        for (const line of lines) {
          const parr = toPARR(line);
          const newNode : PromptGroupNode = {
            type: 'group',
            children: [],
          };
          for (const p of parr) {
            newNode.children.push(this.parseWord(p, session, scene, visited));
          }
          randNode.options.push(newNode);
        }
        res.children.push(randNode);
      } else {
        let newp = toPARR(this.tryExpandPiece(word, session, scene));
        for (const p of newp) {
          res.children.push(this.parseWord(p, session, scene, visited));
        }
      }
      return res;
    } else {
      return {
        type: 'text',
        text: word
      };
    }
  }

  showPromptTooltip(piece: string, e: any) {
    try {
      let txt = '';
      if (piece !== '|') {
        const expanded = this.tryExpandPiece(piece, window.curSession);
        if (this.isMulti(piece, window.curSession)) {
          txt = '이 중 한 줄 랜덤 선택:\n' + expanded.split('\n').slice(0, 32).join('\n');
        } else {
          txt = expanded;
        }
      } else {
        txt = "프롬프트를 교차합니다.\n예시:\n상위 프롬프트: 1girl, |, 캐릭터 \n중위 프롬프트: 그림체, |, 포즈\n이렇게 세팅되어 있으면 1girl, 캐릭터, 그림체, 포즈 순으로 교차됩니다."
      }
      this.dispatchEvent(
        new CustomEvent('prompt-tooltip', {
          detail: { text: txt, x: e.clientX, y: e.clientY },
        }),
      );
    } catch (e: any) {
      console.error(e);
    }
  }

  clearPromptTooltip() {
    this.dispatchEvent(
      new CustomEvent('prompt-tooltip', { detail: { text: '' } }),
    );
  }
}

export const promptService = new PromptService();
promptService.run();

interface TaskStats {
  done: number;
  total: number;
}

class TaskTimeEstimator {
  samples: (number | undefined)[];
  cursor: number;
  maxSamples: number;
  defaultEstimate: number;
  constructor(maxSamples: number, defaultEstimate: number) {
    this.samples = new Array(maxSamples);
    this.maxSamples = maxSamples;
    this.cursor = 0;
    this.defaultEstimate = defaultEstimate;
  }

  addSample(time: number) {
    this.samples[this.cursor] = time;
    this.cursor = (this.cursor + 1) % this.maxSamples;
  }

  estimateMedian() {
    const smp = this.samples.filter((x) => x != undefined);
    smp.sort();
    if (smp.length) return smp[smp.length >> 1]!;
    return this.defaultEstimate;
  }

  estimateMean() {
    const smp = this.samples.filter((x) => x != undefined);
    smp.sort();
    if (smp.length) return (smp.reduce((x, y) => x! + y!, 0) ?? 0) / smp.length;
    return this.defaultEstimate;
  }
}

interface TaskQueueRun {
  stopped: boolean;
  delayCnt: number;
}

interface TaskHandler {
  createTimeEstimator(): TaskTimeEstimator;
  handleTask(task: Task): Promise<boolean>;
  getNumTries(task: Task): number;
  handleDelay(task: Task, numTry: number): Promise<void>;
  getSceneKey(task: Task): string;
}

export interface GenerateImageTaskParams {
  preset: BakedPreSet;
  outPath: string;
  session: Session;
  scene: string;
  image?: string;
  mask?: string;
  originalImage?: boolean;
  onComplete?: (path: string) => void;
}

export function getSceneKey(session: Session, sceneName: string) {
  return session.name + '-' + sceneName;
}

async function handleNAIDelay(numTry: number, fast: boolean) {
  if (numTry === 0 && fast) {
    await sleep(1000);
  } else if (numTry <= 2 && fast) {
    await sleep(
      (1 + Math.random() * RANDOM_DELAY_STD) * 1000,
    );
  } else {
    console.log("slow delay");
    if (numTry === 0 && Math.random() > 0.98) {
      await sleep(
        (Math.random() * LARGE_RANDOM_DELAY_STD + LARGE_RANDOM_DELAY_BIAS) * 1000,
      );
    } else {
      await sleep(
        (Math.random() * RANDOM_DELAY_STD + RANDOM_DELAY_BIAS) * 1000,
      );
    }
  }
}

export interface Task {
  type: TaskType;
  id: string | undefined;
  params: any;
  done: number;
  total: number;
}

export type TaskHandlerMap = { [key: string]: TaskHandler };

class GenerateImageTaskHandler implements TaskHandler {
  inpaint: boolean;
  fast: boolean;
  constructor(fast: boolean, inpaint: boolean) {
    this.fast = fast;
    this.inpaint = inpaint;
  }

  createTimeEstimator() {
    if (this.fast)
      return new TaskTimeEstimator(FAST_TASK_TIME_ESTIMATOR_SAMPLE_COUNT, FAST_TASK_DEFAULT_ESTIMATE);
    else
      return new TaskTimeEstimator(TASK_TIME_ESTIMATOR_SAMPLE_COUNT, TASK_DEFAULT_ESTIMATE);
  }

  async handleDelay(task: Task, numTry: number): Promise<void> {
    await handleNAIDelay(numTry, this.fast);
  }

  async handleTask(task: Task) {
    const params: GenerateImageTaskParams = task.params;
    let prompt = lowerPromptNode(params.preset.prompt);
    prompt = prompt.replace(String.fromCharCode(160), ' ');
    console.log("lowered prompt: " + prompt);
    const uc = params.preset.uc.replace(String.fromCharCode(160), ' ');
    const outputFilePath = params.outPath + '/' + Date.now().toString() + '.png';
    if (prompt === '') {
      prompt = '1girl';
    }
    const arg: ImageGenInput = {
      prompt: prompt,
      uc: uc,
      model: Model.Anime,
      resolution: params.preset.resolution,
      sampling: params.preset.sampling,
      sm: params.preset.smea,
      dyn: params.preset.dyn,
      vibes: params.preset.vibes,
      steps: params.preset.steps,
      promptGuidance: params.preset.promptGuidance,
      outputFilePath: outputFilePath,
      seed: params.preset.seed,
    };
    if (this.inpaint) {
      arg.model = Model.Inpaint;
      arg.image = params.image;
      arg.mask = params.mask;
      arg.originalImage = params.originalImage;
      arg.imageStrength = 0.7;
      arg.vibes = [];
    }
    console.log(arg);
    await invoke('image-gen', arg);

    if (params.preset.seed) {
      params.preset.seed = stepSeed(params.preset.seed);
    }

    if (params.onComplete) {
      params.onComplete(outputFilePath);
    }

    if (this.inpaint) {
      imageService.onAddInPaint(params.session, params.scene, outputFilePath);
    } else {
      imageService.onAddImage(params.session, params.scene, outputFilePath);
    }

    return true;
  }

  getNumTries(task: Task) {
    return 512;
  }

  getSceneKey(task: Task) {
    const params: GenerateImageTaskParams = task.params;
    return getSceneKey(params.session, params.scene);
  }
}

export interface RemoveBgTaskParams {
  session: Session;
  scene: string;
  image: string;
  ouputPath: string;
  onComplete?: (path: string) => void;
}

class RemoveBgTaskHandler implements TaskHandler {
  createTimeEstimator() {
    return new TaskTimeEstimator(TASK_TIME_ESTIMATOR_SAMPLE_COUNT, TASK_DEFAULT_ESTIMATE);
  }

  async handleDelay(task: Task, numTry: number): Promise<void> {
    return;
  }

  async handleTask(task: Task) {
    const params: RemoveBgTaskParams = task.params;
    const outputFilePath = params.ouputPath + '/' + Date.now().toString() + '.png';
    await localAIService.removeBg(params.image, outputFilePath);
    if (params.onComplete)
      params.onComplete(outputFilePath);
    imageService.onAddImage(params.session, params.scene, outputFilePath);
    return true;
  }

  getNumTries(task: Task) {
    return 1;
  }

  getSceneKey(task: Task) {
    const params: GenerateImageTaskParams = task.params;
    return getSceneKey(params.session, params.scene);
  }
}

export type TaskType = 'generate' | 'generate-fast' | 'inpaint' | 'remove-bg';

export class TaskQueueService extends EventTarget {
  queue: CircularQueue<Task>;
  handlers: TaskHandlerMap;
  timeEstimators: { [key: string]: TaskTimeEstimator };
  groupStats: { [key: string]: TaskStats };
  sceneStats: { [key: string]: { [sceneKey: string]: TaskStats } };
  currentRun: TaskQueueRun | undefined;
  taskSet: { [key: string]: boolean };
  constructor(handlers: TaskHandlerMap) {
    super();
    this.handlers = handlers;
    this.timeEstimators = {};
    this.groupStats = {};
    this.sceneStats = {};
    for (const key of Object.keys(this.handlers)) {
      this.timeEstimators[key] = this.handlers[key].createTimeEstimator();
      this.groupStats[key] = { done: 0, total: 0 };
      this.sceneStats[key] = {};
    }
    this.queue = new CircularQueue();
    this.taskSet = {};
  }

  removeAllTasks() {
    while (!this.queue.isEmpty()) {
      const task = this.queue.peek();
      this.removeTaskInternal(task);
      this.queue.dequeue();
    }
    this.dispatchProgress();
  }

  removeTasksFromScene(type: TaskType, sceneKey: string) {
    const oldQueue = this.queue;
    this.queue = new CircularQueue<Task>();
    while (!oldQueue.isEmpty()) {
      const task = oldQueue.peek();
      oldQueue.dequeue();
      this.removeTaskInternal(task);
      if (!(task.type === type && this.handlers[type].getSceneKey(task) === sceneKey)) {
        this.addTaskInternal(task);
      }
    }
    this.dispatchProgress();
  }

  addTask(type: TaskType, numExec: number, params: any) {
    const task: Task = {
      type: type,
      id: uuidv4(),
      params: params,
      done: 0,
      total: numExec,
    };
    this.addTaskInternal(task);
  }

  addTaskInternal(task: Task) {
    this.queue.enqueue(task);
    this.taskSet[task.id!] = true;
    this.groupStats[task.type].total += task.total;
    this.groupStats[task.type].done += task.done;
    const sceneKey = this.handlers[task.type].getSceneKey(task);
    if (!(sceneKey in this.sceneStats[task.type])) {
      this.sceneStats[task.type][sceneKey] = { done: 0, total: 0 };
    }
    this.sceneStats[task.type][sceneKey].done += task.done;
    this.sceneStats[task.type][sceneKey].total += task.total;
    this.dispatchProgress();
  }

  isEmpty() {
    return this.queue.isEmpty();
  }

  isRunning() {
    return this.currentRun != undefined;
  }

  stop() {
    if (this.currentRun) {
      this.currentRun.stopped = true;
      this.currentRun = undefined;
      this.dispatchEvent(new CustomEvent('stop', {}));
    }
  }

  getDelayCnt() {
    return Math.floor(LARGE_WAIT_INTERVAL_BIAS + Math.random() * LARGE_WAIT_INTERVAL_STD)
  }

  run() {
    if (!this.currentRun) {
      this.currentRun = {
        stopped: false,
        delayCnt: this.getDelayCnt()
      };
      this.runInternal(this.currentRun);
      this.dispatchEvent(new CustomEvent('start', {}));
    }
  }

  statsAllTasks(): TaskStats {
    let done = 0;
    let total = 0;
    for (const key of Object.keys(this.handlers)) {
      done += this.groupStats[key].done;
      total += this.groupStats[key].total;
    }
    return { done, total };
  }

  estimateTopTaskTime(type: 'median' | 'mean'): number {
    if (this.queue.isEmpty()) {
      return 0;
    }
    const task = this.queue.peek();
    if (type === 'mean') {
      return this.timeEstimators[task.type].estimateMean();
    }
    return this.timeEstimators[task.type].estimateMedian();
  }

  estimateTime(type: 'median' | 'mean'): number {
    let res = 0;
    for (const key of Object.keys(this.handlers)) {
      if (type === 'mean') {
        res += this.timeEstimators[key].estimateMean() * (this.groupStats[key].total - this.groupStats[key].done);
      } else {
        res += this.timeEstimators[key].estimateMedian() * (this.groupStats[key].total - this.groupStats[key].done);
      }
    }
    return res;
  }

  statsTasksFromScene(type: TaskType, sceneKey: string): TaskStats {
    let done = 0;
    let total = 0;
    if (sceneKey in this.sceneStats[type]) {
      done += this.sceneStats[type][sceneKey].done;
      total += this.sceneStats[type][sceneKey].total;
    }
    return { done, total };
  }

  dispatchProgress() {
    this.dispatchEvent(new CustomEvent('progress', {}));
  }

  removeTaskInternal(task: Task) {
    this.groupStats[task.type].done -= task.done;
    this.groupStats[task.type].total -= task.total;
    const sceneKey = this.handlers[task.type].getSceneKey(task);
    if (sceneKey in this.sceneStats[task.type]) {
      this.sceneStats[task.type][sceneKey].done -= task.done;
      this.sceneStats[task.type][sceneKey].total -= task.total;
    }
    delete this.taskSet[task.id!];
  }

  async runInternal(cur: TaskQueueRun) {
    this.dispatchProgress();
    while (!this.queue.isEmpty()) {
      const task = this.queue.peek();
      if (task.done >= task.total) {
        this.removeTaskInternal(task);
        this.queue.dequeue();
        continue;
      }
      let done = false;
      const before = Date.now();
      const handler = this.handlers[task.type];
      const numTries = handler.getNumTries(task);
      for (let i = 0; i < numTries; i++) {
        if (cur.stopped) {
          this.dispatchProgress();
          return;
        }
        try {
          await handler.handleDelay(task, i);
          await handler.handleTask(task);
          const after = Date.now();
          this.timeEstimators[task.type].addSample(after - before);
          done = true;
          cur.delayCnt --;
          if (cur.delayCnt === 0) {
            await sleep((Math.random() * LARGE_WAIT_DELAY_STD + LARGE_WAIT_DELAY_BIAS) * 1000);
            cur.delayCnt = this.getDelayCnt();
          }
          if (!cur.stopped) {
            task.done++;
            if (task.id! in this.taskSet) {
              this.groupStats[task.type].done++;
              const sceneKey = handler.getSceneKey(task);
              this.sceneStats[task.type][sceneKey].done++;
            }
          }
          this.dispatchEvent(new CustomEvent('complete', {}));
          this.dispatchProgress();
        } catch (e: any) {
          this.dispatchEvent(
            new CustomEvent('error', { detail: { error: e.message, task: task } }),
          );
          console.error(e);
        }
        if (done) {
          break;
        }
      }
      if (!done) {
        console.log('FATAL ERROR');
        if (cur == this.currentRun) {
          this.dispatchEvent(new CustomEvent('stop', {}));
          this.currentRun = undefined;
        }
        this.dispatchProgress();
        return;
      }
    }
    if (cur == this.currentRun) {
      this.dispatchEvent(new CustomEvent('stop', {}));
      this.currentRun = undefined;
    }
    this.dispatchProgress();
  }
}

export interface PromptGroupNode {
  type: 'group';
  children: PromptNode[];
}

export interface PromptTextNode {
  type: 'text';
  text: string;
}

export interface PromptRandomNode {
  type: 'random';
  options: PromptNode[];
}

export type PromptNode = PromptGroupNode | PromptTextNode | PromptRandomNode;

export function pickRandom<T>(arr: T[]): T {
  return arr[Math.floor(Math.random() * arr.length)];
}

export function reformat(text: string) {
  return toPARR(text).join(', ');
}

export function lowerPromptNode(node: PromptNode): string {
  if (node.type === 'text') {
    return node.text;
  }
  if (node.type === 'random') {
    return lowerPromptNode(pickRandom(node.options));
  }
  return reformat(node.children.map(lowerPromptNode).join(','));
}

const tasksHandlerMap = {
  'generate': new GenerateImageTaskHandler(false, false),
  'generate-fast': new GenerateImageTaskHandler(true, false),
  'inpaint': new GenerateImageTaskHandler(false, true),
  'remove-bg': new RemoveBgTaskHandler(),
}

export const taskQueueService = new TaskQueueService(tasksHandlerMap);

export const createPrompts = async (
  session: Session,
  preset: PreSet,
  scene: Scene,
) => {
  const promptComb: string[] = [];
  const res: PromptNode[] = [];
  const dfs = async () => {
    if (promptComb.length === scene.slots.length) {
      const front = toPARR(preset.frontPrompt);
      let middle: string[] = [];
      for (const comb of promptComb) {
        middle = middle.concat(toPARR(comb));
      }
      let left = 0, right = 0;
      let cur: string[] = [];
      let currentInsert = 0;
      while (left < front.length && right < middle.length) {
        if (currentInsert === 0) {
          if (front[left] === '|') {
            currentInsert = 1;
            left++;
            continue;
          }
          cur.push(front[left]);
          left++;
        } else {
          if (middle[right] === '|') {
            currentInsert = 0;
            right++;
            continue;
          }
          cur.push(middle[right]);
          right++;
        }
      }
      while (left < front.length) {
        if (front[left] !== '|')
          cur.push(front[left]);
        left++;
      }
      while (right < middle.length) {
        if (middle[right] !== '|')
          cur.push(middle[right]);
        right++
      }
      cur = cur.concat(toPARR(preset.backPrompt));
      const newNode: PromptNode = {
        type: 'group',
        children: [],
      }
      for (const word of cur) {
        newNode.children.push(promptService.parseWord(word, session, scene));
      }
      res.push(newNode);
      return;
    }
    const level = promptComb.length;
    for (const piece of scene.slots[level]) {
      if (piece.enabled == undefined || piece.enabled) {
        promptComb.push(piece.prompt);
        await dfs();
        promptComb.pop();
      }
    }
  };
  await dfs();
  return res;
};

const mouth = ['<', '>', '(', ')', '{', '}', ')', '('];
const eyes = [':', ';'];
const expressions = mouth.map((m) => eyes.map((e) => e + m)).flat();
expressions.push('><');

function trimUntouch(word: string) {
  let leftTrimPos = 0;
  while (leftTrimPos < word.length && isWhitespace(word[leftTrimPos])) {
    leftTrimPos++;
  }
  let rightTrimPos = word.length - 1;
  while (rightTrimPos >= 0 && isWhitespace(word[rightTrimPos])) {
    rightTrimPos--;
  }
  if (leftTrimPos > rightTrimPos) {
    return undefined;
  }
  return [leftTrimPos, rightTrimPos];
}

function parenCheck(str: string): [boolean, number] {
  str = str
    .split(',')
    .map((x) => {
      const trimmed = trimUntouch(x);
      if (trimmed) {
        const [leftTirmPos, rightTrimPos] = trimmed;
        const y = x.substring(leftTirmPos, rightTrimPos + 1);
        for (const exp of expressions) {
          if (y === exp) {
            return (
              x.substring(0, leftTirmPos) +
              'xx' +
              x.substring(rightTrimPos + 1, x.length)
            );
          }
        }
        return x;
      } else {
        return x;
      }
    })
    .join(',');
  const stack = [];
  const parens = ['(', ')', '[', ']', '{', '}', '<', '>'];
  for (let i = 0; i < str.length; i++) {
    const c = str[i];
    if (parens.includes(c)) {
      if (parens.indexOf(c) % 2 === 0) {
        stack.push([c, i]);
      } else {
        if (stack.length === 0) {
          return [false, i];
        }
        const last = stack.pop()!;
        if (parens.indexOf(c) - 1 !== parens.indexOf(last[0] as string)) {
          return [false, last[1] as number];
        }
      }
    }
  }
  if (stack.length > 0) {
    return [false, stack.pop()![1] as number];
  }
  return [true, -1];
}

const nbsp = String.fromCharCode(160);
const isWhitespace = (c: string) => {
  return c === ' ' || nbsp === c;
};

export const highlightPrompt = (session: Session, text: string, lineHighlight: boolean = false) => {
  let [parenFine, lastPos] = parenCheck(text);
  let offset = 0;
  const words = text
    .split(/([,\n])/)
    .map((word: string, index) => {
      if (word === '\n'){
        return word + (lineHighlight ? '<span class="syntax-line"></span>' : '');
      }
      if (word === ',') {
        return word;
      }
      const classNames = ['syntax-word'];
      let leftTrimPos = 0;
      while (leftTrimPos < word.length && isWhitespace(word[leftTrimPos])) {
        leftTrimPos++;
      }
      let rightTrimPos = word.length - 1;
      while (rightTrimPos >= 0 && isWhitespace(word[rightTrimPos])) {
        rightTrimPos--;
      }
      if (leftTrimPos > rightTrimPos) {
        let res = `<span class="syntax-word">`;
        res += nbsp.repeat(word.length) + '</span>';
        offset += word.length + 1;
        return res;
      }
      if (!parenFine && offset <= lastPos && lastPos < offset + word.length) {
        const originalWordLength = word.length;
        const left = word
          .substring(0, lastPos - offset)
          .replace('<', '&lt;')
          .replace('>', '&gt');
        const mid = word[lastPos - offset]
          .replace('<', '&lt;')
          .replace('>', '&gt');
        const right = word
          .substring(lastPos - offset + 1, word.length)
          .replace('<', '&lt;')
          .replace('>', '&gt');
        word = `${left}<span class="syntax-error">${mid}</span>${right}`;
        let res = `<span class="syntax-word">`;
        res += word + '</span>';
        offset += originalWordLength + 1;
        return res;
      }
      let js = '';
      let pword = word.substring(leftTrimPos, rightTrimPos + 1);
      if (pword === '|') {
        classNames.push('syntax-split');
        js =
          'onmousemove="window.promptService.showPromptTooltip(\'' +
          pword +
          '\', event)" onmouseout="window.promptService.clearPromptTooltip()"';
      }
      if (pword.startsWith('[') && pword.endsWith(']')) {
        classNames.push('syntax-weak');
      }
      if (pword.startsWith('{') && pword.endsWith('}')) {
        classNames.push('syntax-strong');
      }
      if (pword.startsWith('<') && pword.endsWith('>')) {
        try {
          promptService.tryExpandPiece(pword, session);
          if (promptService.isMulti(pword, session))
            classNames.push('syntax-multi-wildcard');
          else
            classNames.push('syntax-wildcard');

          js =
            'onmousemove="window.promptService.showPromptTooltip(\'' +
            pword +
            '\', event)" onmouseout="window.promptService.clearPromptTooltip()"';
        } catch (e: any) {
          classNames.push('syntax-error');
        }
      }
      pword = pword.replace('<', '&lt;').replace('>', '&gt');
      let res = `<span ${js} class="${classNames.join(' ')}">`;
      res += `${word.substring(0, leftTrimPos)}${pword}${word.substring(rightTrimPos + 1, word.length)}</span>`;
      offset += word.length + 1;
      return res;
    })
    .join('');
  return `${words}`;
};

export const queueScenePrompt = (
  session: Session,
  preset: PreSet,
  scene: Scene,
  prompt: PromptNode,
  samples: number,
  nodelay: boolean = false,
  onComplete: ((path: string) => void) | undefined = undefined,
) => {
  const params: GenerateImageTaskParams = {
    preset: {
      prompt,
      uc: preset.uc,
      vibes: preset.vibes,
      resolution: scene.resolution as Resolution,
      smea: preset.smeaOff ? false : true,
      dyn: preset.dynOn ? true : false,
      steps: preset.steps ?? 28,
      promptGuidance: preset.promptGuidance ?? 5,
      sampling: preset.sampling ?? Sampling.KEulerAncestral,
      seed: preset.seed,
    },
    outPath: imageService.getImageDir(session, scene),
    session,
    scene: scene.name,
    onComplete,
  };
  if (nodelay) {
    taskQueueService.addTask('generate-fast', samples, params);
  } else {
    taskQueueService.addTask('generate', samples, params);
  }
}

export const queueRemoveBg = async (
  session: Session,
  scene: Scene,
  image: string,
  onComplete?: (path:string) => void
) => {
  const params: RemoveBgTaskParams = {
    session,
    scene: scene.name,
    image,
    ouputPath: imageService.getImageDir(session, scene),
    onComplete
  };
  taskQueueService.addTask('remove-bg', 1, params);
}

export const queueScene = async (
  session: Session,
  preset: PreSet,
  scene: Scene,
  samples: number,
) => {
  const prompts = await createPrompts(session, preset, scene);
  for (const prompt of prompts) {
    queueScenePrompt(session, preset, scene, prompt, samples);
  }
};

export const createInPaintPrompt = async (
  session: Session,
  preset: PreSet,
  scene: InPaintScene,
) => {
  let parr = toPARR(scene.prompt);
  const newNode: PromptNode = {
    type: 'group',
    children: [],
  }
  for (const word of parr) {
    newNode.children.push(promptService.parseWord(word, session, scene));
  }
  return newNode;
};

export const queueInPaint = async (
  session: Session,
  preset: PreSet,
  scene: InPaintScene,
  samples: number,
) => {
  const prompt = await createInPaintPrompt(session, preset, scene);
  let image = await imageService.fetchImage(sessionService.getInpaintOrgPath(session, scene));
  image = dataUriToBase64(image);
  let mask = await imageService.fetchImage(sessionService.getInpaintMaskPath(session, scene));
  mask = dataUriToBase64(mask);
  const params: GenerateImageTaskParams = {
    preset: {
      prompt,
      uc: scene.uc,
      vibes: preset.vibes,
      resolution: scene.resolution as Resolution,
      smea: false,
      dyn: false,
      steps: preset.steps ?? 28,
      promptGuidance: preset.promptGuidance ?? 5,
      sampling: preset.sampling ?? Sampling.KEulerAncestral,
    },
    outPath: imageService.getInPaintDir(session, scene),
    session,
    scene: scene.name,
    image: image,
    mask: mask,
    originalImage: scene.originalImage ?? false,
  };
  console.log(params)
  taskQueueService.addTask('inpaint', samples, params);
};

class LoginService extends EventTarget {
  loggedIn: boolean;
  constructor() {
    super();
    this.loggedIn = false;
    this.refresh();
  }

  async login(email: string, password: string) {
    await invoke('login', email, password);
    await this.refresh();
  }

  async refresh() {
    try {
      await invoke('read-file', 'TOKEN.txt');
      this.loggedIn = true;
    } catch (e: any) {
      this.loggedIn = false;
    }
    this.dispatchEvent(new CustomEvent('change', {}));
  }
}
export const loginService = new LoginService();

function changeFilename(path: string, newFilename: string) {
  const lastSlashIndex = path.lastIndexOf('/');
  if (lastSlashIndex === -1) {
    return newFilename;
  }
  const directoryPath = path.substring(0, lastSlashIndex + 1);
  return directoryPath + newFilename;
}

export const sortGame = (game: Game) => {
  game.sort((a, b) => {
    if (a.rank !== b.rank) {
      return a.rank - b.rank;
    } else {
      if (a.path < b.path) return -1;
      if (a.path > b.path) return 1;
      return 0;
    }
  });
};

export const renameImage = async (oldPath: string, newPath: string) => {
  await imageService.renameImage(oldPath, newPath);
};

export const swapImages = async (a: string, b: string) => {
  const tmp = changeFilename(a, a.split('/').pop() + uuidv4() + '.png');
  await renameImage(a, tmp);
  await renameImage(b, a);
  await renameImage(tmp, b);
};

export type SceneType = 'scene' | 'inpaint';

export interface Round {
  players: Player[];
  winMask: boolean[];
  curPlayer: number;
}

export class GameService extends EventTarget {
  outputList: { [type: string]: {[key: string]: {[key2: string]: string[]}}}
  constructor() {
    super();
    this.outputList = {
      'scene': {},
      'inpaint': {}
    };
    imageService.addEventListener('updated', (e)=>{this.onImageUpdated(e);});
  }

  gameUpdated(session: Session, scene: GenericScene) {
    this.refreshList(session, scene);
    this.dispatchEvent(new CustomEvent('updated', {}));
  }

  onImageUpdated(e:any) {
    if (e.detail.batch) {
      for (const type of ['scene', 'inpaint']) {
        const session = e.detail.session;
        for (const scene of Object.values(session[type + 's'])) {
          this.refreshList(session, scene as GenericScene);
        }
      }
    } else {
      this.refreshList(e.detail.session, e.detail.scene);
    }
    this.dispatchEvent(new CustomEvent('updated', {}));
  }

  getOutputs(session: Session, scene: GenericScene) {
    if (!(scene.type in this.outputList)) {
      return [];
    }
    if (!(session.name in this.outputList[scene.type])) {
      return [];
    }
    if (!(scene.name in this.outputList[scene.type][session.name])) {
      return [];
    }
    return this.outputList[scene.type][session.name][scene.name];
  }

  refreshList(session: Session, scene: GenericScene) {
    const type = scene.type;
    const list = this.outputList[type];
    if (!(session.name in list)) {
      list[session.name] = {};
    }
    list[session.name][scene.name] = imageService.getOutputs(session, scene);
    const sortByGameAndNatural = (a: [string,number|undefined], b: [string,number|undefined]) => {
      if (a[1] == null && b[1] == null) {
        return naturalSort(a[0], b[0]);
      }
      if (a[1] == null) {
        return -1;
      }
      if (b[1] == null) {
        return 1;
      }
      return a[1] - b[1];
    }

    const cvtMap: any = {};
    if (scene.game) {
      for (const player of scene.game) {
        cvtMap[player.path] = player.rank;
      }
      const files = list[session.name][scene.name].map((x: string) => [x, cvtMap[x]] as [string, number|undefined]);
      files.sort(sortByGameAndNatural);
      list[session.name][scene.name] = files.map((x: [string, number|undefined]) => x[0]);
    }
    if (scene.type === 'scene') {
      const nameToPrior: any = {};
      list[session.name][scene.name].forEach((x: string, i: number) => {
        nameToPrior[x.split('/').pop()!] = i;
      });
      scene.mains.sort((a: string, b: string) => {
        return nameToPrior[a] - nameToPrior[b];
      });
    }
  }

  async createGame(path: string) {
    let files = await invoke('list-files', path);
    files = files.filter((x: string) => x.endsWith('.png'));
    return files.map((x: string) => ({
      path: path + '/' + x,
      rank: files.length - 1,
    }));
  };

  nextRound(game: Game): [number, Round | undefined] {
    sortGame(game);
    let matchRank = -1;
    for (let i = 0; i < game.length - 1; i++) {
      if (game[i].rank === game[i + 1].rank) {
        matchRank = game[i].rank;
        break;
      }
    }
    if (matchRank === -1) {
      return [game.length, undefined];
    }
    let matchPlayers = game.filter((x) => x.rank === matchRank);
    shuffleArray(matchPlayers);
    for (let i = 0; i < game.length - 1; i++) {
      if (game[i].rank != i) {
        const round: Round = {
          players: matchPlayers,
          winMask: matchPlayers.map(() => false),
          curPlayer: 0,
        };
        return [i, round];
      }
    }
    throw new Error('should not be reached here');
  }
}

export function shuffleArray<T>(arr: T[]) {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
}

export const gameService = new GameService();

export const renameScene = async (
  session: Session,
  oldName: string,
  newName: string,
) => {
  const scene = session.scenes[oldName];
  taskQueueService.removeTasksFromScene('generate', getSceneKey(session, oldName));
  taskQueueService.removeTasksFromScene('generate-fast', getSceneKey(session, oldName));
  if (scene.game) {
    const oldDir = 'outs/' + session.name + '/' + oldName;
    const newDir = 'outs/' + session.name + '/' + newName;
    for (const player of scene.game) {
      player.path = player.path.replace(oldDir, newDir);
    }
  }
  scene.name = newName;
  imageService.onRenameScene(session, oldName, newName);
};

window.promptService = promptService;
window.sessionService = sessionService;
window.imageService = imageService;
window.taskQueueService = taskQueueService;
window.loginService = loginService;

export type GenericScene = Scene | InPaintScene;

export const getResultDirectory = (session: Session, scene: GenericScene) => {
  if (scene.type === 'scene') {
    return imageService.getImageDir(session, scene);
  }
  return imageService.getInPaintDir(session, scene);
};

export const getResultImages = (session: Session, scene: GenericScene) => {
  if (scene.type === 'scene') {
    return imageService.getImages(session, scene as Scene);
  }
  return imageService.getInPaints(session, scene as InPaintScene);
};

export const getCollection = (session: Session, type: 'scene' | 'inpaint') => {
  if (type === 'scene') {
    return session.scenes;
  }
  return session.inpaints;
};

export const setCollection = (
  session: Session,
  type: 'scene' | 'inpaint',
  collection: { [key: string]: Scene | InPaintScene },
) => {
  if (type === 'scene') {
    session.scenes = collection as { [key: string]: Scene };
  } else {
    session.inpaints = collection as { [key: string]: InPaintScene };
  }
};

export const queueGenericScene = async (
  session: Session,
  preset: PreSet,
  scene: GenericScene,
  samples: number,
) => {
  if (scene.type === 'scene') {
    return queueScene(session, preset, scene as Scene, samples);
  }
  return queueInPaint(session, preset, scene as InPaintScene, samples);
};

export const removeTaskFromGenericScene = (session: Session, scene: GenericScene) => {
  if (scene.type === 'scene') {
    return taskQueueService.removeTasksFromScene('generate', getSceneKey(session, scene.name));
  }
  return taskQueueService.removeTasksFromScene('inpaint', getSceneKey(session, scene.name));
};

export const statsGenericSceneTasks = (session: Session, scene: GenericScene) => {
  if (scene.type === 'scene') {
    const stats = taskQueueService.statsTasksFromScene('generate', getSceneKey(session, scene.name));
    const stats2 = taskQueueService.statsTasksFromScene('remove-bg', getSceneKey(session, scene.name));
    return { done: stats.done + stats2.done, total: stats.total + stats2.total };
  }
  return taskQueueService.statsTasksFromScene('inpaint', getSceneKey(session, scene.name));
};

window.electron.ipcRenderer.onClose(() => {
  (async () => {
    await sessionService.saveAll();
    await invoke('close');
  })();
});

function base64ToArrayBuffer(base64: string) {
  const binaryString = atob(base64);
  const len = binaryString.length;

  const bytes = new Uint8Array(len);
  for (let i = 0; i < len; i++) {
    bytes[i] = binaryString.charCodeAt(i);
  }

  return bytes.buffer;
}

export async function extractExifFromBase64(base64: string) {
  const arrayBuffer = base64ToArrayBuffer(base64);
  const exif = ExifReader.load(arrayBuffer);
  return exif;
}

export async function extractPromptDataFromBase64(base64: string) {
  const exif = await extractExifFromBase64(base64);
  const comment = exif['Comment'];
  if (comment && comment.value) {
    const data = JSON.parse(comment.value as string);
    if (data['prompt']) {
      return [data['prompt'], data['seed'], data['scale'], data['sampler'], data['steps'], data['uc']];
    }
  }
  throw new Error("No prompt data found");
}

export async function extractMiddlePrompt(preset: PreSet, prompt: string) {
  if (!prompt) return '';
  const fprompt = toPARR(preset.frontPrompt).join(', ');
  const bprompt = toPARR(preset.backPrompt).join(', ');
  let last = toPARR(prompt).join(', ') ?? '';
  if (last.startsWith(fprompt)) {
    last = last.slice(fprompt.length);
  }
  if (last.endsWith(bprompt)) {
    last = last.slice(0, -bprompt.length);
  }
  last = toPARR(last).join(', ');
  return last;
}

export function base64ToDataUri(data: string) {
  return 'data:image/png;base64,' + data;
}

export function dataUriToBase64(dataUri: string) {
  return dataUri.split(',')[1];
}

export async function getMainImage(session: Session, scene: Scene, size: number) {
  if (scene.mains.length) {
    const path =
      imageService.getImageDir(session, scene) + '/' + scene.mains[0];
    const base64 = await imageService.fetchImageSmall(path, size);
    return base64;
  }
  const images = gameService.getOutputs(session, scene);
  if (images.length) {
    return await imageService.fetchImageSmall(images[0], size);
  }
  return undefined;
}

class AppUpdateNoticeService extends EventTarget {
  current: string;
  outdated: boolean;
  constructor() {
    super();
    this.current = '';
    this.outdated = false;
    this.run();
  }
  async getLatestRelease(repoOwner: string, repoName: string) {
    const url = `https://api.github.com/repos/${repoOwner}/${repoName}/releases/latest`;

    try {
      const response = await fetch(url, {
        headers: {
          'Accept': 'application/vnd.github.v3+json'
        }
      });

      if (!response.ok) {
        throw new Error(`Error fetching release: ${response.statusText}`);
      }

      const data = await response.json();
      return data.tag_name;
    } catch (error) {
      console.error('Failed to fetch latest release:', error);
    }
  }

  async run() {
    while (true) {
      try {
        if (this.current === '') this.current = await invoke('get-version');
        let latest = await this.getLatestRelease('sunho', 'SDStudio');
        console.log("latest", this.current, latest);
        if (this.isOutdated(this.current, latest)) {
          this.outdated = true;
          this.dispatchEvent(new CustomEvent('updated', { detail: { } }));
        }
      } catch (e: any) {
        console.error(e);
      }
      await sleep(UPDATE_SERVICE_INTERVAL);
    }
  }

  isOutdated(current: string, latest: string): boolean {
    const currentParts = current.split('.').map(Number);
    const latestParts = latest.split('.').map(Number);

    for (let i = 0; i < Math.max(currentParts.length, latestParts.length); i++) {
      const currentPart = currentParts[i] || 0;
      const latestPart = latestParts[i] || 0;

      if (currentPart < latestPart) {
        return true;
      } else if (currentPart > latestPart) {
        return false;
      }
    }

    return false; // they are equal
  }
}

export const appUpdateNoticeService = new AppUpdateNoticeService();

export const deleteImageFiles = async (curSession: Session, paths: string[]) => {
  for (const path of paths) {
    await invoke('trash-file', path);
    await imageService.invalidateCache(path);
  }
  await imageService.refreshBatch(curSession);
}

export interface ImageContextAlt {
  type: 'image';
  path: string;
  scene?: string;
  starable?: boolean;
}

export interface SceneContextAlt {
  type: 'scene';
  sceneType: SceneType;
  name: string;
}

export type ContextAlt = ImageContextAlt | SceneContextAlt;

export const encodeContextAlt = (x: ContextAlt) => JSON.stringify(x)!;
export const decodeContextAlt = JSON.parse as (x: string) => ContextAlt;

export interface WordTag {
  normalized: string;
  word: string;
  redirect: string;
  freq: number;
  priority: number;
  category: number;
}

export const inf = 1e9|0;

export function normalize(word: string) {
  let result = '';
  let mapping = [];
  let complexMedials: any = {
    "ㅘ": "ㅗㅏ", "ㅙ": "ㅗㅐ", "ㅚ": "ㅗㅣ", "ㅝ": "ㅜㅓ",
    "ㅞ": "ㅜㅔ", "ㅟ": "ㅜㅣ", "ㅢ": "ㅡㅣ"
  };

  let initialJamos = [
    "ㄱ", "ㄲ", "ㄴ", "ㄷ", "ㄸ", "ㄹ", "ㅁ", "ㅂ", "ㅃ", "ㅅ",
    "ㅆ", "ㅇ", "ㅈ", "ㅉ", "ㅊ", "ㅋ", "ㅌ", "ㅍ", "ㅎ"
  ];
  let medialJamos = [
    "ㅏ", "ㅐ", "ㅑ", "ㅒ", "ㅓ", "ㅔ", "ㅕ", "ㅖ", "ㅗ", "ㅘ",
    "ㅙ", "ㅚ", "ㅛ", "ㅜ", "ㅝ", "ㅞ", "ㅟ", "ㅠ", "ㅡ", "ㅢ", "ㅣ"
  ];
  let finalJamos = [
    "", "ㄱ", "ㄲ", "ㄳ", "ㄴ", "ㄵ", "ㄶ", "ㄷ", "ㄹ", "ㄺ",
    "ㄻ", "ㄼ", "ㄽ", "ㄾ", "ㄿ", "ㅀ", "ㅁ", "ㅂ", "ㅄ", "ㅅ",
    "ㅆ", "ㅇ", "ㅈ", "ㅊ", "ㅋ", "ㅌ", "ㅍ", "ㅎ"
  ];

  for (let i = 0; i < word.length; i++) {
    let code = word.codePointAt(i)!;
    let originalIndex = i;

    if (code > 0xFFFF) {
      i++;
    }

    if (code >= 0x41 && code <= 0x5A) {
      result += String.fromCharCode(code + 0x20);
      mapping.push(originalIndex);
    } else if ((code >= 0x61 && code <= 0x7A) || (code >= 0x30 && code <= 0x39)) { // 'a' to 'z' or '0' to '9'
      result += String.fromCharCode(code);
      mapping.push(originalIndex);
    } else if (code >= 0xAC00 && code <= 0xD7A3) {
      let code_offset = code - 0xAC00;
      let initial = Math.floor(code_offset / (21 * 28));
      let medial = Math.floor((code_offset % (21 * 28)) / 28);
      let final = code_offset % 28;

      result += initialJamos[initial];
      mapping.push(originalIndex);

      let medialJamo = medialJamos[medial];
      if (complexMedials[medialJamo]) {
        for (let char of complexMedials[medialJamo]) {
          result += char;
          mapping.push(originalIndex);
        }
      } else {
        result += medialJamo;
        mapping.push(originalIndex);
      }

      if (final !== 0) {
        result += finalJamos[final];
        mapping.push(originalIndex);
      }
    } else {
      result += String.fromCodePoint(code);
      mapping.push(originalIndex);
    }
  }

  return [ result, mapping ];
}

export function calcGapMatch(small: string, large: string) {
  const [smallN, smallMapping] = normalize(small);
  const [largeN, largeMapping] = normalize(large);
  const m = smallN.length;
  const n = largeN.length;
  const dp = Array.from({ length: m + 1 }, () =>
    Array.from({ length: n + 1 }, () => [inf, inf])
  );
  const backtrack:any = Array.from({ length: m + 1 }, () =>
    Array.from({ length: n + 1 }, () => [null, null])
  );

  dp[0][0][0] = 0;

  for (let i = 0; i <= m; i++) {
    for (let j = 0; j < n; j++) {
      if (i < m && smallN[i] === largeN[j]) {
        if (dp[i][j][0] + 1 < dp[i + 1][j + 1][1]) {
          dp[i + 1][j + 1][1] = dp[i][j][0] + 1;
          backtrack[i + 1][j + 1][1] = [i, j, 0];
        }
        if (dp[i][j][1] < dp[i + 1][j + 1][1]) {
          dp[i + 1][j + 1][1] = dp[i][j][1];
          backtrack[i + 1][j + 1][1] = [i, j, 1];
        }
      }
      if (dp[i][j][0] < dp[i][j + 1][0]) {
        dp[i][j + 1][0] = dp[i][j][0];
        backtrack[i][j + 1][0] = [i, j, 0];
      }
      if (dp[i][j][1] < dp[i][j + 1][0]) {
        dp[i][j + 1][0] = dp[i][j][1];
        backtrack[i][j + 1][0] = [i, j, 1];
      }
    }
  }

  const result = Math.min(dp[m][n][0], dp[m][n][1]);
  if (result === inf) {
    return { result, path: [] };
  }
  let path = [];
  let i = m, j = n, k = dp[m][n][0] < dp[m][n][1] ? 0 : 1;

  while (i !== 0 || j !== 0) {
    const [prevI, prevJ, prevK] = backtrack[i][j][k];
    if (i - 1 === prevI && j - 1 === prevJ) {
      path.push(largeMapping[j - 1]);
    }
    i = prevI;
    j = prevJ;
    k = prevK;
  }

  path.reverse();
  return { result, path };
}

async function getPlatform() {
  const platform = window.navigator.platform;
  if (platform.startsWith('Win')) return 'windows';
  const arch = await navigator.userAgentData.getHighEntropyValues(['architecture'])
  if (arch.architecture === 'arm64') return 'mac-arm64';
  return 'mac-x64';
}

async function getLocalAIDownloadLink() {
  const platform = await getPlatform();
  const version = await invoke('get-version');
  return `https://huggingface.co/mathneko/localai/resolve/main/LocalAI-${platform}.zip?download=true`
}
const QUALITY_DOWNLOAD_LINK = 'https://github.com/sunho/BiRefNet/releases/download/sdstudio/quality';

class LocalAIService extends EventTarget {
  downloading: boolean;
  modelLoaded: boolean;
  ready: boolean;
  constructor() {
    super();
    this.downloading = false;
    this.modelLoaded = false;
    this.ready = false;
  }

  notifyDownloadProgress(percent: number) {
    this.dispatchEvent(new CustomEvent('progress', { detail: { percent } }));
  }

  modelChanged() {
    this.modelLoaded = false;
  }

  async download() {
    this.downloading = true;
    try {
     await invoke('delete-file', 'tmp/localai.zip');
    } catch(e) {
    }
    try {
      await invoke('delete-dir', 'localai');
    } catch(e) {
    }
    try {
      await invoke('delete-dir', 'models');
    } catch(e) {
    }
    try {
      let ldl = await getLocalAIDownloadLink();
      this.dispatchEvent(new CustomEvent('stage', { detail: { stage: 0 } }));
      await invoke('download', ldl, 'tmp', 'localai.zip');
      this.dispatchEvent(new CustomEvent('stage', { detail: { stage: 1 } }));
      await invoke('download', QUALITY_DOWNLOAD_LINK, 'models', 'quality');
      this.dispatchEvent(new CustomEvent('stage', { detail: { stage: 2 } }));
      await invoke('extract-zip', 'tmp/localai.zip', '');
      await this.statsModels();
    } catch (e: any) {
      console.error(e);
    } finally {
      this.downloading = false;
    }
  }

  async spawnLocalAI() {
    const running = await invoke('is-local-ai-running');
    if (running) {
      return;
    }
    await invoke('spawn-local-ai');
  }

  async statsModels() {
    const avail: any = {
      'fast': false,
      'quality': false,
    }
    let availExec = false;
    try {
      availExec = await invoke('exist-file', "localai");
    } catch (e: any) {
      console.error(e);
    }
    for (const model of ['fast', 'quality']) {
      try {
        avail[model] = await invoke('exist-file', "models/" + model);
      } catch (e: any) {
        console.error(e);
      }
    }
    if (availExec && avail.quality) {
      this.ready = true;
      this.spawnLocalAI();
    } else {
      this.ready = false;
    }
    this.dispatchEvent(new CustomEvent('updated', {}));
  }

  async loadModel() {
    const running = await invoke('is-local-ai-running');
    if (!this.ready || !running)
      throw new Error('Local AI not ready');
    const modelType = 'quality';
    this.modelLoaded = false;
    await invoke('load-model', 'models/' + modelType);
    this.modelLoaded = true;
  }


  async removeBg(image: string, outputFilePath: string) {
    if (!this.modelLoaded)
      await this.loadModel();
    await invoke('remove-bg', image, outputFilePath);
  }
}

export const localAIService = new LocalAIService();
localAIService.statsModels();
