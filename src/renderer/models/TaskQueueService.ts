import { v4 } from 'uuid';
import {
  ImageGenInput,
  Model,
  NoiseSchedule,
  Resolution,
  Sampling,
} from '../backends/imageGen';
import { CircularQueue } from '../circularQueue';
import {
  backend,
  imageService,
  isMobile,
  localAIService,
  promptService,
  sessionService,
  taskQueueService,
} from '.';
import {
  BakedPreSet,
  GenericScene,
  InPaintScene,
  StylePreSet,
  StylePreSetShared,
  PreSet,
  PromptNode,
  Scene,
  Session,
} from './types';
import { sleep } from './util';
import { createPrompts, lowerPromptNode, toPARR } from './PromptService';
import { dataUriToBase64 } from './ImageService';

const FAST_TASK_TIME_ESTIMATOR_SAMPLE_COUNT = 16;
const TASK_TIME_ESTIMATOR_SAMPLE_COUNT = 128;
const TASK_DEFAULT_ESTIMATE = 22 * 1000;
const RANDOM_DELAY_BIAS = 6.0;
const RANDOM_DELAY_STD = 3.0;
const LARGE_RANDOM_DELAY_BIAS = RANDOM_DELAY_BIAS * 2;
const LARGE_RANDOM_DELAY_STD = RANDOM_DELAY_STD * 2;
const LARGE_WAIT_DELAY_BIAS = 5 * 60;
const LARGE_WAIT_DELAY_STD = 2.5 * 60;
const LARGE_WAIT_INTERVAL_BIAS = 500;
const LARGE_WAIT_INTERVAL_STD = 100;
const FAST_TASK_DEFAULT_ESTIMATE =
  TASK_DEFAULT_ESTIMATE -
  RANDOM_DELAY_BIAS * 1000 -
  (RANDOM_DELAY_STD * 1000) / 2 +
  1000;

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

async function fetchIPAddress(uuid: string) {
  const url = 'https://ip.sunho.kim';

  try {
    const response = await fetch(url, {
      headers: {
        Authorization: 'yuzu',
        uuid: uuid,
      },
    });

    if (!response.ok) {
      console.error('Failed to fetch IP address:', response.statusText);
      return undefined;
    }

    const ipAddress = await response.text();
    return ipAddress;
  } catch (error) {
    return undefined;
  }
}

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
  lastIp?: string;
}

interface TaskHandler {
  createTimeEstimator(): TaskTimeEstimator;
  handleTask(task: Task, run: TaskQueueRun): Promise<boolean>;
  getNumTries(task: Task): number;
  handleDelay(task: Task, numTry: number): Promise<void>;
  getSceneKey(task: Task): string;
}

export interface GenerateImageTaskParams {
  preset: BakedPreSet;
  outPath: string;
  session: Session;
  scene?: string;
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
    await sleep((1 + Math.random() * RANDOM_DELAY_STD) * 1000);
  } else {
    console.log('slow delay');
    if (numTry === 0 && Math.random() > 0.98) {
      await sleep(
        (Math.random() * LARGE_RANDOM_DELAY_STD + LARGE_RANDOM_DELAY_BIAS) *
          1000,
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
      return new TaskTimeEstimator(
        FAST_TASK_TIME_ESTIMATOR_SAMPLE_COUNT,
        FAST_TASK_DEFAULT_ESTIMATE,
      );
    else
      return new TaskTimeEstimator(
        TASK_TIME_ESTIMATOR_SAMPLE_COUNT,
        TASK_DEFAULT_ESTIMATE,
      );
  }

  async handleDelay(task: Task, numTry: number): Promise<void> {
    await handleNAIDelay(numTry, this.fast);
  }

  async handleTask(task: Task, run: TaskQueueRun) {
    const params: GenerateImageTaskParams = task.params;
    let prompt = lowerPromptNode(params.preset.prompt);
    prompt = prompt.replace(String.fromCharCode(160), ' ');
    console.log('lowered prompt: ' + prompt);
    const uc = params.preset.uc.replace(String.fromCharCode(160), ' ');
    const outputFilePath =
      params.outPath + '/' + Date.now().toString() + '.png';
    if (prompt === '') {
      prompt = '1girl';
    }
    const vibes = await Promise.all(
      params.preset.vibes.map(async (x: any) => ({
        image: dataUriToBase64(
          (await imageService.fetchImage(
            imageService.getVibesDir(params.session) +
              '/' +
              x.path.split('/').pop()!,
          ))!,
        ),
        info: x.info,
        strength: x.strength,
      })),
    );
    const arg: ImageGenInput = {
      prompt: prompt,
      uc: uc,
      model: Model.Anime,
      resolution: params.preset.resolution,
      sampling: params.preset.sampling,
      sm: params.preset.smea,
      dyn: params.preset.dyn,
      vibes: vibes,
      steps: params.preset.steps,
      cfgRescale: params.preset.cfgRescale,
      noiseSchedule: params.preset.noiseSchedule,
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
    const config = await backend.getConfig();
    if (!config.uuid) {
      config.uuid = v4();
      await backend.setConfig(config);
    }
    const ip = await fetchIPAddress(config.uuid);
    if (isMobile) {
      if (run.lastIp == undefined) {
        run.lastIp = ip;
      } else {
        if (run.lastIp !== ip) {
          run.lastIp = ip;
          if (!config.noIpCheck) {
            throw new Error('IP');
          }
        }
      }
    }
    await backend.generateImage(arg);

    if (params.preset.seed) {
      params.preset.seed = stepSeed(params.preset.seed);
    }

    if (params.onComplete) {
      params.onComplete(outputFilePath);
    }

    if (params.scene != null) {
      if (this.inpaint) {
        imageService.onAddInPaint(params.session, params.scene, outputFilePath);
      } else {
        imageService.onAddImage(params.session, params.scene, outputFilePath);
      }
    }

    return true;
  }

  getNumTries(task: Task) {
    return 40;
  }

  getSceneKey(task: Task) {
    const params: GenerateImageTaskParams = task.params;
    if (!params.scene) return '';
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
    return new TaskTimeEstimator(
      TASK_TIME_ESTIMATOR_SAMPLE_COUNT,
      TASK_DEFAULT_ESTIMATE,
    );
  }

  async handleDelay(task: Task, numTry: number): Promise<void> {
    return;
  }

  async handleTask(task: Task, run: TaskQueueRun) {
    const params: RemoveBgTaskParams = task.params;
    const outputFilePath =
      params.ouputPath + '/' + Date.now().toString() + '.png';
    await localAIService.removeBg(params.image, outputFilePath);
    if (params.onComplete) params.onComplete(outputFilePath);
    imageService.onAddImage(params.session, params.scene, outputFilePath);
    return true;
  }

  getNumTries(task: Task) {
    return 1;
  }

  getSceneKey(task: Task) {
    const params: GenerateImageTaskParams = task.params;
    if (!params.scene) {
      return '';
    }
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
      if (
        !(
          task.type === type &&
          this.handlers[type].getSceneKey(task) === sceneKey
        )
      ) {
        this.addTaskInternal(task);
      }
    }
    this.dispatchProgress();
  }

  addTask(type: TaskType, numExec: number, params: any) {
    const task: Task = {
      type: type,
      id: v4(),
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
    return Math.floor(
      LARGE_WAIT_INTERVAL_BIAS + Math.random() * LARGE_WAIT_INTERVAL_STD,
    );
  }

  run() {
    if (!this.currentRun) {
      this.currentRun = {
        stopped: false,
        delayCnt: this.getDelayCnt(),
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
        res +=
          this.timeEstimators[key].estimateMean() *
          (this.groupStats[key].total - this.groupStats[key].done);
      } else {
        res +=
          this.timeEstimators[key].estimateMedian() *
          (this.groupStats[key].total - this.groupStats[key].done);
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
          await handler.handleTask(task, cur);
          const after = Date.now();
          this.timeEstimators[task.type].addSample(after - before);
          done = true;
          cur.delayCnt--;
          if (cur.delayCnt === 0) {
            await sleep(
              (Math.random() * LARGE_WAIT_DELAY_STD + LARGE_WAIT_DELAY_BIAS) *
                1000,
            );
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
          if (e.message === 'IP') {
            this.dispatchEvent(new CustomEvent('ip-check-fail', {}));
            this.stop();
            return;
          }
          this.dispatchEvent(
            new CustomEvent('error', {
              detail: { error: e.message, task: task },
            }),
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

export const tasksHandlerMap = {
  generate: new GenerateImageTaskHandler(false, false),
  'generate-fast': new GenerateImageTaskHandler(true, false),
  inpaint: new GenerateImageTaskHandler(false, true),
  'remove-bg': new RemoveBgTaskHandler(),
};

export const queueDummyPrompt = (
  session: Session,
  preset: StylePreSet,
  outPath: string,
  prompt: PromptNode,
  resolution: Resolution,
  onComplete: ((path: string) => void) | undefined = undefined,
) => {
  const shared = session.presetShareds[session.presetMode];
  const params: GenerateImageTaskParams = {
    preset: {
      prompt,
      uc: preset.uc,
      vibes: [],
      resolution: resolution,
      smea: preset.smeaOff ? false : true,
      dyn: preset.dynOn ? true : false,
      steps: preset.steps ?? 28,
      promptGuidance: preset.promptGuidance ?? 5,
      sampling: preset.sampling ?? Sampling.KEulerAncestral,
      cfgRescale: preset.cfgRescale ?? 0,
      noiseSchedule: preset.noiseSchedule ?? NoiseSchedule.Native,
    },
    outPath: outPath,
    session,
    onComplete,
  };
  taskQueueService.addTask('generate-fast', 1, params);
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
  const shared = session.presetShareds[session.presetMode];
  let uc = toPARR(preset.uc);
  if (session.presetMode === 'style') {
    uc = uc.concat(toPARR((shared as StylePreSetShared).uc));
  }
  const params: GenerateImageTaskParams = {
    preset: {
      prompt,
      uc: uc.join(', '),
      vibes: shared.vibes,
      resolution: scene.resolution as Resolution,
      smea: preset.smeaOff ? false : true,
      dyn: preset.dynOn ? true : false,
      steps: preset.steps ?? 28,
      promptGuidance: preset.promptGuidance ?? 5,
      sampling: preset.sampling ?? Sampling.KEulerAncestral,
      seed: shared.seed,
      cfgRescale: preset.cfgRescale ?? 0,
      noiseSchedule: preset.noiseSchedule ?? NoiseSchedule.Native,
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
};

export const queueRemoveBg = async (
  session: Session,
  scene: Scene,
  image: string,
  onComplete?: (path: string) => void,
) => {
  const params: RemoveBgTaskParams = {
    session,
    scene: scene.name,
    image,
    ouputPath: imageService.getImageDir(session, scene),
    onComplete,
  };
  taskQueueService.addTask('remove-bg', 1, params);
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
  let parr = toPARR(scene.prompt);
  const newNode: PromptNode = {
    type: 'group',
    children: [],
  };
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
  let image = await imageService.fetchImage(
    sessionService.getInpaintOrgPath(session, scene),
  );
  image = dataUriToBase64(image!);
  let mask = await imageService.fetchImage(
    sessionService.getInpaintMaskPath(session, scene),
  );
  mask = dataUriToBase64(mask!);
  let sampling = preset.sampling ?? Sampling.KEulerAncestral;
  if (sampling === Sampling.DDIM) sampling = Sampling.KEulerAncestral;
  const params: GenerateImageTaskParams = {
    preset: {
      prompt,
      uc: scene.uc,
      vibes: session.presetShareds[session.presetMode].vibes,
      resolution: scene.resolution as Resolution,
      smea: false,
      dyn: false,
      steps: preset.steps ?? 28,
      promptGuidance: preset.promptGuidance ?? 5,
      sampling: sampling,
      cfgRescale: preset.cfgRescale ?? 0,
      noiseSchedule: preset.noiseSchedule ?? NoiseSchedule.Native,
    },
    outPath: imageService.getInPaintDir(session, scene),
    session,
    scene: scene.name,
    image: image,
    mask: mask,
    originalImage: scene.originalImage ?? false,
  };
  console.log(params);
  taskQueueService.addTask('inpaint', samples, params);
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

export const removeTaskFromGenericScene = (
  session: Session,
  scene: GenericScene,
) => {
  if (scene.type === 'scene') {
    return taskQueueService.removeTasksFromScene(
      'generate',
      getSceneKey(session, scene.name),
    );
  }
  return taskQueueService.removeTasksFromScene(
    'inpaint',
    getSceneKey(session, scene.name),
  );
};

export const statsGenericSceneTasks = (
  session: Session,
  scene: GenericScene,
) => {
  if (scene.type === 'scene') {
    const stats = taskQueueService.statsTasksFromScene(
      'generate',
      getSceneKey(session, scene.name),
    );
    const stats2 = taskQueueService.statsTasksFromScene(
      'remove-bg',
      getSceneKey(session, scene.name),
    );
    return {
      done: stats.done + stats2.done,
      total: stats.total + stats2.total,
    };
  }
  return taskQueueService.statsTasksFromScene(
    'inpaint',
    getSceneKey(session, scene.name),
  );
};
