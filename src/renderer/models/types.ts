import {
  AugmentMethod,
  NoiseSchedule,
  Resolution,
  Sampling,
} from '../backends/imageGen';
import {
  types,
  Instance,
  cast,
  SnapshotIn,
  SnapshotOut,
} from 'mobx-state-tree';
import { action, observable, makeObservable } from 'mobx';
import { Serealizable } from './ResourceSyncService';
import { workFlowService } from '.';
import { WFWorkFlow, WorkFlowDef } from './workflows/WorkFlow';

export type PARR = string[];

export interface IVibeItem {
  path: string;
  info: number;
  strength: number;
}

export class VibeItem implements IVibeItem {
  @observable accessor path: string = '';
  @observable accessor info: number = 0;
  @observable accessor strength: number = 0;

  static fromJSON(json: IVibeItem): VibeItem {
    const item = new VibeItem();
    Object.assign(item, json);
    return item;
  }

  toJSON(): IVibeItem {
    return {
      path: this.path,
      info: this.info,
      strength: this.strength,
    };
  }
}

export interface ModelBackend {
  type: 'NAI' | 'SD';
  model?: string;
}

export interface AbstractJob {}

export interface SDAbstractJob<T> extends AbstractJob {
  cfgRescale: number;
  steps: number;
  promptGuidance: number;
  smea: boolean;
  dyn: boolean;
  sampling: string;
  prompt: T;
  uc: string;
  noiseSchedule: string;
  backend: ModelBackend;
  vibes: IVibeItem[];
  overrideResolution?: Resolution;
  seed?: number;
}

export interface SDJob extends SDAbstractJob<PromptNode> {
  type: 'sd';
}

export interface SDInpaintJob extends SDAbstractJob<PromptNode> {
  type: 'sd_inpaint';
  mask: string;
  image: string;
  strength: number;
  originalImage?: boolean;
}

export interface SDI2IJob extends SDAbstractJob<PromptNode> {
  type: 'sd_i2i';
  image: string;
  strength: number;
  noise: number;
}

export interface AugmentJob extends AbstractJob {
  type: 'augment';
  image: string;
  method: AugmentMethod;
  prompt?: PromptNode;
  weaken?: number;
  emotion?: string;
  backend: ModelBackend;
}

export interface UpscaleJob extends AbstractJob {
  type: 'upscale';
  image: string;
  resolution: string;
}

export type Job = SDJob | SDInpaintJob | AugmentJob | UpscaleJob | SDI2IJob;

export interface IPiece {
  name: string;
  prompt: string;
  multi?: boolean;
}

export class Piece implements IPiece {
  @observable accessor name: string = '';
  @observable accessor prompt: string = '';
  @observable accessor multi: boolean | undefined = undefined;

  static fromJSON(json: IPiece): Piece {
    const piece = new Piece();
    Object.assign(piece, json);
    return piece;
  }

  toJSON(): IPiece {
    return {
      name: this.name,
      prompt: this.prompt,
      multi: this.multi,
    };
  }
}

export interface IPieceLibrary {
  version: number;
  name: string;
  pieces: IPiece[];
}

export class PieceLibrary implements IPieceLibrary {
  @observable accessor version: number = 1;
  @observable accessor name: string = '';
  @observable accessor pieces: Piece[] = [];

  static fromJSON(json: IPieceLibrary): PieceLibrary {
    const library = new PieceLibrary();
    library.version = json.version;
    library.name = json.name;
    library.pieces = json.pieces.map((piece) => Piece.fromJSON(piece));
    return library;
  }

  toJSON(): IPieceLibrary {
    return {
      name: this.name,
      version: this.version,
      pieces: this.pieces.map((piece) => piece.toJSON()),
    };
  }
}

export interface IPromptPiece {
  prompt: string;
  id: string;
  enabled?: boolean;
}

export class PromptPiece implements IPromptPiece {
  @observable accessor prompt: string = '';
  @observable accessor id: string = '';
  @observable accessor enabled: boolean | undefined = undefined;

  static fromJSON(json: IPromptPiece): PromptPiece {
    const promptPiece = new PromptPiece();
    Object.assign(promptPiece, json);
    return promptPiece;
  }

  toJSON(): IPromptPiece {
    return {
      prompt: this.prompt,
      id: this.id,
      enabled: this.enabled,
    };
  }
}

export type IPromptPieceSlot = IPromptPiece[];
export type PromptPieceSlot = PromptPiece[];

export interface Player {
  rank: number;
  path: string;
}

export type Game = Player[];

export interface Round {
  players: string[];
  winMask: boolean[];
  curPlayer: number;
}

export interface IAbstractScene {
  name: string;
  resolution: string;
  game?: Game;
  round?: Round;
  imageMap: string[];
  mains: string[];
}

export class AbstractScene implements IAbstractScene {
  @observable accessor name: string = '';
  @observable accessor resolution: string = '';
  @observable.shallow accessor game: Game | undefined = undefined;
  @observable.ref accessor round: Round | undefined = undefined;
  @observable.shallow accessor imageMap: string[] = [];
  @observable accessor mains: string[] = [];

  static fromJSON(json: IAbstractScene): AbstractScene {
    const scene = new AbstractScene();
    scene.name = json.name;
    scene.resolution = json.resolution;
    scene.game = json.game;
    scene.round = json.round;
    scene.imageMap = json.imageMap;
    scene.mains = json.mains;
    return scene;
  }

  toJSON(): IAbstractScene {
    return {
      name: this.name,
      resolution: this.resolution,
      game: this.game,
      round: this.round,
      imageMap: this.imageMap,
      mains: this.mains,
    };
  }
}

export interface IScene extends IAbstractScene {
  type: 'scene';
  slots: IPromptPieceSlot[];
  meta: Record<string, any>;
}

export class Scene extends AbstractScene implements IScene {
  @observable accessor type: 'scene' = 'scene';
  @observable accessor slots: PromptPieceSlot[] = [];
  @observable accessor meta: Map<string, any> = new Map();

  static fromJSON(json: IScene): Scene {
    const scene = new Scene();
    Object.assign(scene, json);
    scene.type = 'scene';
    scene.slots = json.slots.map((slot) =>
      slot.map((piece) => PromptPiece.fromJSON(piece)),
    );
    scene.meta = new Map(Object.entries(json.meta??{}));
    return scene;
  }

  toJSON(): IScene {
    return {
      ...super.toJSON(),
      type: this.type,
      slots: this.slots.map((slot) => slot.map((piece) => piece.toJSON())),
      meta: Object.fromEntries(this.meta.entries()),
    };
  }
}

export interface IInpaintScene extends IAbstractScene {
  type: 'inpaint';
  workflowType: string;
  preset?: any;
  sceneRef?: string;
}

export class InpaintScene extends AbstractScene implements IInpaintScene {
  @observable accessor type: 'inpaint' = 'inpaint';
  @observable accessor workflowType: string = '';
  @observable accessor preset: any | undefined = undefined;
  @observable accessor sceneRef: string | undefined = undefined;

  static fromJSON(json: IInpaintScene): InpaintScene {
    const scene = new InpaintScene();
    Object.assign(scene, json);
    scene.type = 'inpaint';
    scene.preset = json.preset && workFlowService.presetFromJSON(json.preset);
    return scene;
  }

  toJSON(): IInpaintScene {
    return {
      ...super.toJSON(),
      type: this.type,
      workflowType: this.workflowType,
      preset: this.preset?.toJSON(),
      sceneRef: this.sceneRef,
    };
  }
}

export function genericSceneFromJSON(json: IGenericScene): GenericScene {
  if (json.type === 'scene') {
    return Scene.fromJSON(json);
  }
  return InpaintScene.fromJSON(json);
}

export type IGenericScene = IScene | IInpaintScene;
export type GenericScene = Scene | InpaintScene;

export interface SelectedWorkflow {
  workflowType: string;
  presetName?: string;
}

export interface ISession {
  version: number;
  name: string;
  selectedWorkflow?: SelectedWorkflow;
  presets: Record<string, any[]>;
  inpaints: Record<string, IInpaintScene>;
  scenes: Record<string, IScene>;
  library: Record<string, IPieceLibrary>;
  presetShareds: Record<string, any>;
}

export class Session implements Serealizable {
  @observable accessor version: number = 1;
  @observable accessor name: string = '';
  @observable accessor selectedWorkflow: SelectedWorkflow | undefined =
    undefined;
  @observable accessor presets: Map<string, any[]> = new Map();
  @observable accessor inpaints: Map<string, InpaintScene> = new Map();
  @observable accessor scenes: Map<string, Scene> = new Map();
  @observable accessor library: Map<string, PieceLibrary> = new Map();
  @observable accessor presetShareds: Map<string, any> = new Map();

  constructor() {
    makeObservable(this);
  }

  hasScene(type: 'scene' | 'inpaint', name: string): boolean {
    if (type === 'scene') {
      return this.scenes.has(name);
    }
    return this.inpaints.has(name);
  }

  @action
  addScene(scene: GenericScene): void {
    console.log('name', scene.name);
    if (scene.type === 'scene') {
      this.scenes.set(scene.name, scene);
    } else {
      this.inpaints.set(scene.name, scene);
    }
  }

  getScene(type: 'scene' | 'inpaint', name: string): GenericScene | undefined {
    if (type === 'scene') {
      return this.scenes.get(name);
    }
    return this.inpaints.get(name);
  }

  @action
  removeScene(type: 'scene' | 'inpaint', name: string): void {
    if (type === 'scene') {
      this.scenes.delete(name);
    } else {
      this.inpaints.delete(name);
    }
  }

  moveScene(targetScene: GenericScene, index: number) {
    const scenes = this.getScenes(targetScene.type);
    const reorderedScenes = scenes.filter((scene) => scene !== targetScene);
    reorderedScenes.splice(index, 0, targetScene);
    const final = reorderedScenes.reduce((acc, scene) => {
      acc.set(scene.name, scene);
      return acc;
    }, new Map()) as any;
    if (targetScene.type === 'scene') {
      this.scenes = final;
    } else {
      this.inpaints = final;
    }
  }

  hasPreset(type: string, name: string): boolean {
    return (
      this.presets.get(type)?.some((preset) => preset.name === name) ?? false
    );
  }

  getPreset(type: string, name: string): any | undefined {
    return this.presets.get(type)?.find((preset) => preset.name === name);
  }

  @action
  addPreset(preset: any): void {
    const presets = this.presets.get(preset.type) || [];
    if (presets.find((p) => p.name === preset.name)) {
      let i = 1;
      while (
        presets.find((p) => p.name === preset.name + i.toString())
      ) {
        i++;
      }
      preset.name = preset.name + i.toString();
    }
    presets.push(preset);
    this.presets.set(preset.type, presets);
  }

  @action
  removePreset(type: string, name: string): void {
    const presets = this.presets.get(type) || [];
    this.presets.set(
      type,
      presets.filter((preset) => preset.name !== name),
    );
  }

  getScenes(type: 'scene' | 'inpaint'): GenericScene[] {
    if (type === 'scene') {
      return Array.from(this.scenes.values());
    }
    return Array.from(this.inpaints.values());
  }

  getCommonSetup(flow: SelectedWorkflow): [string, any, any, WorkFlowDef] {
    const type = flow.workflowType;
    const preset = flow.presetName && this.getPreset(type, flow.presetName);
    const shared = this.presetShareds.get(type);
    const def = workFlowService.getDef(type);
    return [type, preset, shared, def];
  }

  static fromJSON(json: ISession): Session {
    const session = new Session();
    session.name = json.name;
    session.version = json.version;
    session.selectedWorkflow = json.selectedWorkflow;
    session.presets = new Map(
      Object.entries(json.presets).map(([key, value]) => [
        key,
        value.map((preset) => workFlowService.presetFromJSON(preset)),
      ]),
    );
    session.inpaints = new Map(
      Object.entries(json.inpaints).map(([key, value]) => [
        key,
        InpaintScene.fromJSON(value),
      ]),
    );
    session.scenes = new Map(
      Object.entries(json.scenes).map(([key, value]) => [
        key,
        Scene.fromJSON(value),
      ]),
    );
    session.library = new Map(
      Object.entries(json.library).map(([key, value]) => [
        key,
        PieceLibrary.fromJSON(value),
      ]),
    );
    session.presetShareds = new Map(
      Object.entries(json.presetShareds).map(([key, value]) => [
        key,
        workFlowService.sharedFromJSON(value),
      ]),
    );
    return session;
  }

  fromJSON(json: ISession): Session {
    return Session.fromJSON(json);
  }

  toJSON(): ISession {
    return {
      name: this.name,
      version: this.version,
      selectedWorkflow: this.selectedWorkflow,
      presets: Object.fromEntries(
        Array.from(this.presets.entries()).map(([key, value]) => [
          key,
          value.map((preset) => preset.toJSON()),
        ]),
      ),
      inpaints: Object.fromEntries(
        Array.from(this.inpaints.entries()).map(([key, value]) => [
          key,
          value.toJSON(),
        ]),
      ),
      scenes: Object.fromEntries(
        Array.from(this.scenes.entries()).map(([key, value]) => [
          key,
          value.toJSON(),
        ]),
      ),
      library: Object.fromEntries(
        Array.from(this.library.entries()).map(([key, value]) => [
          key,
          value.toJSON(),
        ]),
      ),
      presetShareds: Object.fromEntries(
        Array.from(this.presetShareds.entries()).map(([key, value]) => [
          key,
          value.toJSON(),
        ]),
      ),
    };
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

export enum ContextMenuType {
  GallaryImage = 'gallary_image',
  Image = 'image',
  Scene = 'scene',
  Style = 'style',
}

export interface ImageContextAlt {
  type: 'image';
  path: string;
  scene?: GenericScene;
  starable?: boolean;
}

export interface GallaryImageContextAlt {
  type: 'gallary_image';
  path: string[];
  scene?: GenericScene;
  starable?: boolean;
}

export interface SceneContextAlt {
  type: 'scene';
  scene: GenericScene;
}

export interface StyleContextAlt {
  type: 'style';
  preset: any;
  container: any;
  session: Session;
}

export type ContextAlt = ImageContextAlt | SceneContextAlt | StyleContextAlt;

export const encodeContextAlt = (x: ContextAlt) => JSON.stringify(x)!;
export const decodeContextAlt = JSON.parse as (x: string) => ContextAlt;

export const isValidSession = (session: any) => {
  return (
    typeof session.name === 'string' &&
    typeof session.presets === 'object' &&
    typeof session.inpaints === 'object' &&
    typeof session.scenes === 'object' &&
    typeof session.library === 'object'
  );
};

export const isValidPieceLibrary = (library: any) => {
  return typeof library.name === 'string' && Array.isArray(library.pieces);
};
