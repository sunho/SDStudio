import { watchFile } from 'fs';
import { ImageGenInput, Model, Resolution, Sampling } from '../main/imageGen';
import { CircularQueue } from './circularQueue';

import { v4 as uuidv4 } from 'uuid';
import ExifReader from 'exifreader';
import { setInterval } from 'timers/promises';

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
  prompt: string;
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

export type Task = GenerateTask | InPaintTask;

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

  expandPARR(
    parr: PARR,
    session: Session,
    scene: InPaintScene | Scene | undefined = undefined,
    visited: { [key: string]: boolean } | undefined = undefined,
  ): PARR {
    if (!visited) {
      visited = {};
    }
    const res: PARR = [];
    for (let p of parr) {
      if (p.charAt(0) === '<' && p.charAt(p.length - 1) === '>') {
        let newp = this.tryExpandPiece(p, session, scene).split(',');
        newp = cleanPARR(newp);
        for (const x of newp) {
          res.push(x);
        }
      } else {
        res.push(p);
      }
    }
    let found = false;
    for (const p of res) {
      if (p.charAt(0) === '<' && p.charAt(p.length - 1) === '>') {
        if (visited[p]) {
          throw new Error('Cyclic detected at ' + p);
        }
        visited[p] = true;
      }
    }
    for (const p of res) {
      if (p.charAt(0) === '<' && p.charAt(p.length - 1) === '>') {
        visited[p] = true;
      }
    }
    if (found) return this.expandPARR(res, session, scene, visited);
    else return res;
  }

  showPromptTooltip(piece: string, e: any) {
    try {
      const expanded = this.tryExpandPiece(piece, window.curSession);
      this.dispatchEvent(
        new CustomEvent('prompt-tooltip', {
          detail: { text: expanded, x: e.clientX, y: e.clientY },
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
    if (smp.length) return smp[smp.length >> 1];
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

export class TaskQueueService extends EventTarget {
  queue: CircularQueue<Task>;
  timeEstimator: TaskTimeEstimator;
  fastTimeEstimator: TaskTimeEstimator;
  sceneStats: { [key: string]: TaskStats };
  inpaintStats: { [key: string]: TaskStats };
  totalStats: TaskStats;
  currentRun: TaskQueueRun | undefined;
  taskSet: { [key: string]: boolean };
  constructor() {
    super();
    this.queue = new CircularQueue();
    this.timeEstimator = new TaskTimeEstimator(
      TASK_TIME_ESTIMATOR_SAMPLE_COUNT,
      TASK_DEFAULT_ESTIMATE,
    );
    this.fastTimeEstimator = new TaskTimeEstimator(
      FAST_TASK_TIME_ESTIMATOR_SAMPLE_COUNT,
      FAST_TASK_DEFAULT_ESTIMATE,
    );
    this.sceneStats = {};
    this.inpaintStats = {};
    this.totalStats = {
      done: 0,
      total: 0,
    };
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

  removeTasksFromInPaintScene(scene: InPaintScene) {
    const oldQueue = this.queue;
    this.queue = new CircularQueue<Task>();
    while (!oldQueue.isEmpty()) {
      const task = oldQueue.peek();
      oldQueue.dequeue();
      this.removeTaskInternal(task);
      if (!(task.type === 'inpaint' && task.scene === scene.name)) {
        this.addTask(task);
      }
    }
    this.dispatchProgress();
  }

  removeTasksFromScene(scene: Scene) {
    const oldQueue = this.queue;
    this.queue = new CircularQueue<Task>();
    while (!oldQueue.isEmpty()) {
      const task = oldQueue.peek();
      oldQueue.dequeue();
      this.removeTaskInternal(task);
      if (!(task.type === 'generate' && task.scene === scene.name)) {
        this.addTask(task);
      }
    }
    this.dispatchProgress();
  }

  removeTaskFromGenericScene(scene: GenericScene) {
    if (scene.type === 'scene') {
      this.removeTasksFromScene(scene);
    } else {
      this.removeTasksFromInPaintScene(scene);
    }
  }

  addTask(task: Task) {
    this.queue.enqueue(task);
    task.id = uuidv4();
    this.taskSet[task.id!] = true;
    this.totalStats.done += task.done;
    this.totalStats.total += task.total;
    if (task.type === 'generate') {
      if (!(task.scene in this.sceneStats)) {
        this.sceneStats[task.scene] = {
          done: 0,
          total: 0,
        };
      }
      this.sceneStats[task.scene].done += task.done;
      this.sceneStats[task.scene].total += task.total;
    } else if (task.type === 'inpaint') {
      if (!(task.scene in this.inpaintStats)) {
        this.inpaintStats[task.scene] = {
          done: 0,
          total: 0,
        };
      }
      this.inpaintStats[task.scene].done += task.done;
      this.inpaintStats[task.scene].total += task.total;
    }
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

  statsSceneTasks(scene: Scene) {
    return (
      this.sceneStats[scene.name] ?? {
        done: 0,
        total: 0,
      }
    );
  }

  statsInPaintTasks(scene: InPaintScene) {
    return (
      this.inpaintStats[scene.name] ?? {
        done: 0,
        total: 0,
      }
    );
  }

  async genImage(task: GenerateTask, outPath: string) {
    const prompt = task.preset.prompt.replace(String.fromCharCode(160), ' ');
    const uc = task.preset.uc.replace(String.fromCharCode(160), ' ');
    const arg: ImageGenInput = {
      prompt: prompt,
      uc: uc,
      model: Model.Anime,
      resolution: task.preset.resolution,
      sampling: task.preset.sampling,
      sm: task.preset.smea,
      dyn: task.preset.dyn,
      vibes: task.preset.vibes,
      steps: task.preset.steps,
      promptGuidance: task.preset.promptGuidance,
      outputFilePath: outPath,
      seed: task.preset.seed,
    };
    await invoke('image-gen', arg);
  }

  async inPaintImage(task: InPaintTask, outPath: string) {
    const prompt = task.preset.prompt.replace(String.fromCharCode(160), ' ');
    const uc = task.preset.uc.replace(String.fromCharCode(160), ' ');
    const arg: ImageGenInput = {
      prompt: prompt,
      uc: uc,
      model: Model.Inpaint,
      resolution: task.preset.resolution,
      sampling: task.preset.sampling,
      sm: false,
      dyn: false,
      steps: task.preset.steps,
      promptGuidance: task.preset.promptGuidance,
      imageStrength: 0.7,
      vibes: [],
      image: task.image,
      mask: task.mask,
      outputFilePath: outPath,
      seed: task.preset.seed,
      originalImage: task.originalImage,
    };
    await invoke('image-gen', arg);
  }

  dispatchProgress() {
    this.dispatchEvent(new CustomEvent('progress', {}));
  }

  removeTaskInternal(task: Task) {
    if (task.type === 'generate') {
      this.sceneStats[task.scene].done -= task.done;
      this.sceneStats[task.scene].total -= task.total;
    } else if (task.type === 'inpaint') {
      this.inpaintStats[task.scene].done -= task.done;
      this.inpaintStats[task.scene].total -= task.total;
    }
    this.totalStats.done -= task.done;
    this.totalStats.total -= task.total;
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
      for (let i = 0; i < 1000; i++) {
        if (cur.stopped) {
          this.dispatchProgress();
          return;
        }
        try {
          if (i === 0 && task.nodelay) {
            await sleep(1000);
          } else if (i <= 2 && task.nodelay) {
            await sleep(
              (1 + Math.random() * RANDOM_DELAY_STD) * 1000,
            );
          } else {
            if (i === 0 && Math.random() > 0.98) {
              await sleep(
                (Math.random() * LARGE_RANDOM_DELAY_STD + LARGE_RANDOM_DELAY_BIAS) * 1000,
              );
            } else {
              await sleep(
                (Math.random() * RANDOM_DELAY_STD + RANDOM_DELAY_BIAS) * 1000,
              );
            }
          }

          const outputFilePath = task.outPath + '/' + Date.now().toString() + '.png';
          if (task.type === 'generate') {
            await this.genImage(task, outputFilePath);
          } else if (task.type === 'inpaint') {
            await this.inPaintImage(task, outputFilePath);
          }
          const after = Date.now();
          if (task.nodelay) {
            this.fastTimeEstimator.addSample(after - before);
          } else {
            this.timeEstimator.addSample(after - before);
          }
          done = true;
          cur.delayCnt --;
          if (cur.delayCnt === 0) {
            await sleep((Math.random() * LARGE_WAIT_DELAY_STD + LARGE_WAIT_DELAY_BIAS) * 1000);
            cur.delayCnt = this.getDelayCnt();
          }
          if (!cur.stopped) {
            task.done++;
            if (task.preset.seed) {
              task.preset.seed = stepSeed(task.preset.seed);
            }
            if (task.id! in this.taskSet) {
              if (task.type === 'generate') {
                this.sceneStats[task.scene].done++;
              } else if (task.type === 'inpaint') {
                this.inpaintStats[task.scene].done++;
              }
              this.totalStats.done++;
            }
          }
          if (task.type === 'generate') {
            imageService.onAddImage(task.session, task.scene, outputFilePath);
          } else {
            imageService.onAddInPaint(task.session, task.scene, outputFilePath);
          }
          if (task.onComplete) {
            task.onComplete(outputFilePath);
          }
          this.dispatchEvent(new CustomEvent('complete', {}));
          this.dispatchProgress();
        } catch (e: any) {
          this.dispatchEvent(
            new CustomEvent('error', { detail: { error: e.message } }),
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

export const taskQueueService = new TaskQueueService();

export const createPrompts = async (
  session: Session,
  preset: PreSet,
  scene: Scene,
) => {
  const promptComb: string[] = [];
  const res: string[] = [];
  const dfs = async () => {
    if (promptComb.length === scene.slots.length) {
      let cur = toPARR(preset.frontPrompt);
      for (const comb of promptComb) {
        cur = cur.concat(toPARR(comb));
      }
      cur = cur.concat(toPARR(preset.backPrompt));
      cur = promptService.expandPARR(cur, session, scene);
      cur = cur.filter((x) => x.length > 0);
      const prompt = cur.join(', ');
      res.push(prompt);
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

export const highlightPrompt = (session: Session, text: string) => {
  let [parenFine, lastPos] = parenCheck(text);
  let offset = 0;
  const words = text
    .split(',')
    .map((word: string, index) => {
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
      if (pword.startsWith('[') && pword.endsWith(']')) {
        classNames.push('syntax-weak');
      }
      if (pword.startsWith('{') && pword.endsWith('}')) {
        classNames.push('syntax-strong');
      }
      if (pword.startsWith('<') && pword.endsWith('>')) {
        try {
          promptService.tryExpandPiece(pword, session);
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
    .join(',');
  return `${words}`;
};

export const queueScenePrompt = (
  session: Session,
  preset: PreSet,
  scene: Scene,
  prompt: string,
  samples: number,
  nodelay: boolean = false,
  onComplete: ((path: string) => void) | undefined = undefined,
) => {
  taskQueueService.addTask({
    type: 'generate',
    session: session,
    scene: scene.name,
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
    done: 0,
    total: samples,
    id: undefined,
    nodelay,
    onComplete,
  });
};

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
  let prompt = toPARR(scene.prompt);
  const expanded = promptService.expandPARR(prompt, session, scene);
  return expanded.join(', ');
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
  taskQueueService.addTask({
    type: 'inpaint',
    session: session,
    scene: scene.name,
    preset: {
      prompt,
      uc: scene.uc,
      vibes: preset.vibes,
      resolution: scene.resolution as Resolution,
      smea: preset.smeaOff ? false : true,
      dyn: preset.dynOn ? true : false,
      steps: preset.steps ?? 28,
      promptGuidance: preset.promptGuidance ?? 5,
      sampling: preset.sampling ?? Sampling.KEulerAncestral,
      seed: preset.seed,
    },
    image: image,
    mask: mask,
    outPath: imageService.getInPaintDir(session, scene),
    originalImage: scene.originalImage,
    done: 0,
    total: samples,
    id: undefined,
  });
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

export interface Match {
  players: Player[];
  winRank: number;
  loseRank: number;
}

export type SceneType = 'scene' | 'inpaint';

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

  nextMatch(game: Game): [number, Match[] | undefined] {
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
    const winRank = matchRank - (matchPlayers.length >> 1);
    if (matchPlayers.length % 2 === 1) {
      matchPlayers[matchPlayers.length - 1].rank = winRank;
    }
    const newMatches: Match[] = [];
    for (let i = 0; i + 1 < matchPlayers.length; i += 2) {
      newMatches.push({
        players: [matchPlayers[i], matchPlayers[i + 1]],
        winRank: winRank,
        loseRank: matchRank,
      });
    }
    for (let i = 0; i < game.length - 1; i++) {
      if (game[i].rank != i) {
        return [i, newMatches];
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
  taskQueueService.removeTasksFromScene(scene);
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

export const removeTaskFromGenericScene = (scene: GenericScene) => {
  if (scene.type === 'scene') {
    return taskQueueService.removeTasksFromScene(scene as Scene);
  }
  return taskQueueService.removeTasksFromInPaintScene(scene as InPaintScene);
};

export const statsGenericSceneTasks = (scene: GenericScene) => {
  if (scene.type === 'scene') {
    return taskQueueService.statsSceneTasks(scene as Scene);
  }
  return taskQueueService.statsInPaintTasks(scene as InPaintScene);
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

        const latest = await this.getLatestRelease('sunho', 'SDStudio');
        if (this.current !== latest) {
          this.outdated = true;
          this.current = latest;
          this.dispatchEvent(new CustomEvent('updated', { detail: { } }));
        }
      } catch (e: any) {
        console.error(e);
      }
      await sleep(UPDATE_SERVICE_INTERVAL);
    }
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

export function calcGapMatch(small: string, large: string) {
  const m = small.length;
  const n = large.length;
  const dp = Array.from({ length: m + 1 }, () =>
    Array.from({ length: n + 1 }, () => [inf, inf])
  );
  const backtrack:any = Array.from({ length: m + 1 }, () =>
    Array.from({ length: n + 1 }, () => [null, null])
  );

  dp[0][0][0] = 0;

  for (let i = 0; i <= m; i++) {
    for (let j = 0; j < n; j++) {
      if (i < m && small[i] === large[j]) {
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
      path.push(j - 1);
    }
    i = prevI;
    j = prevJ;
    k = prevK;
  }

  path.reverse();
  return { result, path };
}

