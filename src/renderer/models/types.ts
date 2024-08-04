import { NoiseSchedule, Resolution, Sampling } from '../backends/imageGen';
import { types, Instance, cast, SnapshotIn, SnapshotOut } from "mobx-state-tree"
import { action, observable } from 'mobx';
import { Serealizable } from './ResourceSyncService';

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

export interface IAbstractPreset {
  name: string;
  profile?: string;
}

export class AbstractPreset implements IAbstractPreset {
  @observable accessor name: string = '';
  @observable accessor profile: string | undefined = undefined;

  static fromJSON(json: IAbstractPreset): AbstractPreset {
    const preset = new AbstractPreset();
    Object.assign(preset, json);
    return preset;
  }

  toJSON(): IAbstractPreset {
    return {
      name: this.name,
      profile: this.profile,
    };
  }
}

export interface ISDAbstractPreset extends IAbstractPreset {
  cfgRescale: number;
  steps: number;
  promptGuidance: number;
  smea: boolean;
  dyn: boolean;
  sampling: string;
  uc: string;
  noiseSchedule: string;
  backend: ModelBackend;
}

export class SDAbstractPreset extends AbstractPreset implements ISDAbstractPreset {
  @observable accessor cfgRescale: number = 0;
  @observable accessor steps: number = 0;
  @observable accessor promptGuidance: number = 0;
  @observable accessor smea: boolean = false;
  @observable accessor dyn: boolean = false;
  @observable accessor sampling: string = '';
  @observable accessor noiseSchedule: string = '';
  @observable accessor backend: ModelBackend = { type: 'NAI' };
  @observable accessor uc: string = '';

  static fromJSON(json: ISDAbstractPreset): SDAbstractPreset {
    const preset = new SDAbstractPreset();
    Object.assign(preset, json);
    return preset;
  }

  toJSON(): ISDAbstractPreset {
    return {
      ...super.toJSON(),
      cfgRescale: this.cfgRescale,
      steps: this.steps,
      promptGuidance: this.promptGuidance,
      smea: this.smea,
      dyn: this.dyn,
      sampling: this.sampling,
      noiseSchedule: this.noiseSchedule,
      backend: this.backend,
      uc: this.uc,
    };
  }
}

export interface ISDPreset extends ISDAbstractPreset {
  type: 'sd';
  frontPrompt: string;
  backPrompt: string;
}

export class SDPreset extends SDAbstractPreset implements ISDPreset {
  type: 'sd' = 'sd';
  @observable accessor frontPrompt: string = '';
  @observable accessor backPrompt: string = '';

  static fromJSON(json: ISDPreset): SDPreset {
    const preset = new SDPreset();
    Object.assign(preset, json);
    return preset;
  }

  toJSON(): ISDPreset {
    return {
      ...super.toJSON(),
      type: this.type,
      frontPrompt: this.frontPrompt,
      backPrompt: this.backPrompt,
    };
  }
}

export interface ISDInpaintPreset extends ISDAbstractPreset {
  type: 'sd_inpaint';
  prompt: string;
  mask: string;
  strength: number;
  originalImage?: boolean;
}

export class SDInpaintPreset extends SDAbstractPreset implements ISDInpaintPreset {
  type: 'sd_inpaint' = 'sd_inpaint';
  @observable accessor prompt: string = '';
  @observable accessor mask: string = '';
  @observable accessor strength: number = 0.7;
  @observable accessor originalImage: boolean | undefined = undefined;

  constructor() {
    super();
  }

  static fromJSON(json: ISDInpaintPreset): SDInpaintPreset {
    const preset = new SDInpaintPreset();
    Object.assign(preset, json);
    return preset;
  }

  toJSON(): ISDInpaintPreset {
    return {
      ...super.toJSON(),
      type: this.type,
      prompt: this.prompt,
      mask: this.mask,
      originalImage: this.originalImage,
      strength: this.strength,
    };
  }
}

export interface IAugmentPreset extends IAbstractPreset {
  type: 'augment';
  method: string;
  prompt: string;
  weaken: number;
  backend: ModelBackend;
}

export class AugmentPreset extends AbstractPreset implements IAugmentPreset {
  type: 'augment' = 'augment';
  @observable accessor method: string = '';
  @observable accessor prompt: string = '';
  @observable accessor weaken: number = 0;
  @observable accessor backend: ModelBackend = { type: 'NAI' };

  constructor() {
    super();
  }

  static fromJSON(json: IAugmentPreset): AugmentPreset {
    const preset = new AugmentPreset();
    Object.assign(preset, json);
    return preset;
  }

  toJSON(): IAugmentPreset {
    return {
      ...super.toJSON(),
      type: this.type,
      method: this.method,
      prompt: this.prompt,
      weaken: this.weaken,
      backend: this.backend,
    };
  }
}

export interface ISDAbstractShared {
  vibes: IVibeItem[];
  seed?: number;
}

export class SDAbstractShared implements ISDAbstractShared {
  @observable accessor vibes: VibeItem[] = [];
  @observable accessor seed: number | undefined = undefined;

  static fromJSON(json: ISDAbstractShared): SDAbstractShared {
    const shared = new SDAbstractShared();
    Object.assign(shared, json);
    shared.vibes = json.vibes.map(VibeItem.fromJSON);
    return shared;
  }

  toJSON(): ISDAbstractShared {
    return {
      vibes: this.vibes.map(vibe => vibe.toJSON()),
      seed: this.seed,
    };
  }
}

export interface ISDShared extends ISDAbstractShared {
  type: 'sd';
}

export class SDShared extends SDAbstractShared implements ISDShared {
  type: 'sd' = 'sd';

  static fromJSON(json: ISDShared): SDShared {
    const shared = new SDShared();
    Object.assign(shared, json);
    shared.vibes = json.vibes.map(VibeItem.fromJSON);
    return shared;
  }

  toJSON(): ISDShared {
    return {
      ...super.toJSON(),
      type: this.type,
    };
  }
}

export interface ISDInpaintShared extends ISDAbstractShared {
  type: 'sd_inpaint';
  image?: string;
}

export class SDInpaintShared extends SDAbstractShared implements ISDInpaintShared {
  type: 'sd_inpaint' = 'sd_inpaint';
  @observable accessor vibes: IVibeItem[] = [];
  @observable accessor image: string | undefined = undefined;
  @observable accessor seed: number | undefined = undefined;

  static fromJSON(json: ISDInpaintShared): SDInpaintShared {
    const shared = new SDInpaintShared();
    Object.assign(shared, json);
    shared.vibes = json.vibes.map(VibeItem.fromJSON);
    return shared;
  }

  toJSON(): ISDInpaintShared {
    return {
      ...super.toJSON(),
      type: this.type,
      image: this.image,
    };
  }
}

export interface ISDStyleShared extends ISDAbstractShared {
  type: 'sd_style';
  characterPrompt: string;
  backgroundPrompt: string;
  uc: string;
}

export class SDStyleShared extends SDAbstractShared implements ISDStyleShared {
  type: 'sd_style' = 'sd_style';
  @observable accessor characterPrompt: string = '';
  @observable accessor backgroundPrompt: string = '';
  @observable accessor uc: string = '';

  static fromJSON(json: ISDStyleShared): SDStyleShared {
    const styleShared = new SDStyleShared();
    Object.assign(styleShared, json);
    styleShared.vibes = json.vibes.map(VibeItem.fromJSON);
    return styleShared;
  }

  toJSON(): ISDStyleShared {
    return {
      ...super.toJSON(),
      type: this.type,
      characterPrompt: this.characterPrompt,
      backgroundPrompt: this.backgroundPrompt,
      uc: this.uc,
    };
  }
}

export interface IAugmentShared {
  type: 'augment';
  image?: string;
}

export class AugmentShared implements IAugmentShared {
  type: 'augment' = 'augment';
  @observable accessor image: string | undefined = undefined;

  static fromJSON(json: IAugmentShared): AugmentShared {
    const augmentShared = new AugmentShared();
    Object.assign(augmentShared, json);
    return augmentShared;
  }

  toJSON(): IAugmentShared {
    return {
      type: this.type,
      image: this.image,
    };
  }
}

export type IPreSetShared = ISDShared | ISDInpaintShared | ISDStyleShared | IAugmentShared;
export type PreSetShared = SDShared | SDInpaintShared | SDStyleShared | AugmentShared;

export interface IUpscalePreset extends IAbstractPreset {
  type: 'upscale';
  resolution: string;
}

export class UpscalePreset extends AbstractPreset implements IUpscalePreset {
  type: 'upscale' = 'upscale';
  @observable accessor resolution: string = '';

  static fromJSON(json: IUpscalePreset): UpscalePreset {
    const preset = new UpscalePreset();
    Object.assign(preset, json);
    return preset;
  }

  toJSON(): IUpscalePreset {
    return {
      ...super.toJSON(),
      type: this.type,
      resolution: this.resolution,
    };
  }
}

export type IPreset = ISDPreset | ISDInpaintPreset | IUpscalePreset | IAugmentPreset;
export type Preset = SDPreset | SDInpaintPreset | UpscalePreset | AugmentPreset;

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
  name: string;
  pieces: IPiece[];
}

export class PieceLibrary implements IPieceLibrary {
  @observable accessor name: string = '';
  @observable accessor pieces: Piece[] = [];

  static fromJSON(json: IPieceLibrary): PieceLibrary {
    const library = new PieceLibrary();
    library.name = json.name;
    library.pieces = json.pieces.map(piece => Piece.fromJSON(piece));
    return library;
  }

  toJSON(): IPieceLibrary {
    return {
      name: this.name,
      pieces: this.pieces.map(piece => piece.toJSON()),
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
}

export class Scene extends AbstractScene implements IScene {
  @observable accessor type: 'scene' = 'scene';
  @observable accessor slots: PromptPieceSlot[] = [];

  static fromJSON(json: IScene): Scene {
    const scene = new Scene();
    Object.assign(scene, json);
    scene.type = 'scene';
    scene.slots = json.slots.map(slot => slot.map(piece => PromptPiece.fromJSON(piece)));
    return scene;
  }

  toJSON(): IScene {
    return {
      ...super.toJSON(),
      type: this.type,
      slots: this.slots.map(slot => slot.map(piece => piece.toJSON())),
    };
  }
}

export interface IInpaintScene extends IAbstractScene {
  type: 'inpaint';
  workflowType: string;
  image: string;
  preset?: IPreset;
  shared?: IPreSetShared;
  sceneRef?: string;
}

export const PresetFromJSON = (json: IPreset): Preset => {
  if (json.type === 'sd') {
    return SDPreset.fromJSON(json);
  } else if (json.type === 'sd_inpaint') {
    return SDInpaintPreset.fromJSON(json);
  } else if (json.type === 'augment') {
    return AugmentPreset.fromJSON(json);
  } else if (json.type === 'upscale') {
    return UpscalePreset.fromJSON(json);
  } else {
    throw new Error('Invalid preset type');
  }
}

export const PresetSharedFromJSON = (json: IPreSetShared): PreSetShared => {
  if (json.type === 'sd') {
    return SDShared.fromJSON(json);
  } else if (json.type === 'sd_style') {
    return SDStyleShared.fromJSON(json);
  } else if (json.type === 'augment') {
    return AugmentShared.fromJSON(json);
  } else {
    throw new Error('Invalid shared type');
  }
}

export class InpaintScene extends AbstractScene implements IInpaintScene {
  @observable accessor type: 'inpaint' = 'inpaint';
  @observable accessor workflowType: string = '';
  @observable accessor preset: Preset | undefined = undefined;
  @observable accessor shared: PreSetShared | undefined = undefined;
  @observable accessor image: string = '';
  @observable accessor sceneRef: string | undefined = undefined;

  static fromJSON(json: IInpaintScene): InpaintScene {
    const scene = new InpaintScene();
    Object.assign(scene, AbstractScene.fromJSON(json));
    scene.type = 'inpaint';
    scene.workflowType = json.workflowType;
    scene.preset = json.preset && PresetFromJSON(json.preset);
    scene.shared = json.shared && PresetSharedFromJSON(json.shared);
    scene.image = json.image;
    scene.sceneRef = json.sceneRef;
    return scene;
  }

  toJSON(): IInpaintScene {
    return {
      ...super.toJSON(),
      type: this.type,
      workflowType: this.workflowType,
      preset: this.preset?.toJSON(),
      shared: this.shared?.toJSON(),
      image: this.image,
      sceneRef: this.sceneRef,
    };
  }
}

export type IGenericScene = IScene | IInpaintScene;
export type GenericScene = Scene | InpaintScene;

export interface SelectedWorkflow {
  workflowType: string;
  presetName: string;
}

export interface ISession {
  name: string;
  selectedWorkflow?: SelectedWorkflow;
  presets: Record<string, IPreset[]>;
  inpaints: Record<string, IInpaintScene>;
  scenes: Record<string, IScene>;
  library: Record<string, IPieceLibrary>;
  presetShareds: Record<string, IPreSetShared>;
}

export class Session implements Serealizable {
  @observable accessor name: string = '';
  @observable accessor selectedWorkflow: SelectedWorkflow | undefined = undefined;
  @observable accessor presets: Map<string, Preset[]> = new Map();
  @observable accessor inpaints: Map<string, InpaintScene> = new Map();
  @observable accessor scenes: Map<string, Scene> = new Map();
  @observable accessor library: Map<string, PieceLibrary> = new Map();
  @observable accessor presetShareds: Map<string, PreSetShared> = new Map();

  hasScene(type: 'scene' | 'inpaint', name: string): boolean {
    if (type === 'scene') {
      return this.scenes.has(name);
    }
    return this.inpaints.has(name);
  }

  @action
  addScene(scene: GenericScene): void {
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

  hasPreset(type: string, name: string): boolean {
    return this.presets.get(type)?.some(preset => preset.name === name) ?? false;
  }

  getPreset(type: string, name: string): Preset | undefined {
    return this.presets.get(type)?.find(preset => preset.name === name);
  }

  @action
  addPreset(preset: Preset): void {
    const presets = this.presets.get(preset.type) || [];
    presets.push(preset);
    this.presets.set(preset.type, presets);
  }

  @action
  removePreset(type: string, name: string): void {
    const presets = this.presets.get(type) || [];
    this.presets.set(type, presets.filter(preset => preset.name !== name));
  }

  getScenes(type: 'scene' | 'inpaint'): GenericScene[] {
    if (type === 'scene') {
      return Array.from(this.scenes.values());
    }
    return Array.from(this.inpaints.values());
  }

  static fromJSON(json: ISession): Session {
    const session = new Session();
    session.name = json.name;
    session.selectedWorkflow = json.selectedWorkflow;
    session.presets = new Map(
      Object.entries(json.presets).map(([key, value]) => [key, value.map(preset => PresetFromJSON(preset))])
    );
    session.inpaints = new Map(
      Object.entries(json.inpaints).map(([key, value]) => [key, InpaintScene.fromJSON(value)])
    );
    session.scenes = new Map(
      Object.entries(json.scenes).map(([key, value]) => [key, Scene.fromJSON(value)])
    );
    session.library = new Map(
      Object.entries(json.library).map(([key, value]) => [key, PieceLibrary.fromJSON(value)])
    );
    session.presetShareds = new Map(
      Object.entries(json.presetShareds).map(([key, value]) => [key, PresetSharedFromJSON(value)])
    );
    return session;
  }

  fromJSON(json: ISession): Session {
    return Session.fromJSON(json);
  }

  toJSON(): ISession {
    return {
      name: this.name,
      selectedWorkflow: this.selectedWorkflow,
      presets: Object.fromEntries(
        Array.from(this.presets.entries()).map(([key, value]) => [key, value.map(preset => preset.toJSON())])
      ),
      inpaints: Object.fromEntries(
        Array.from(this.inpaints.entries()).map(([key, value]) => [key, value.toJSON()])
      ),
      scenes: Object.fromEntries(
        Array.from(this.scenes.entries()).map(([key, value]) => [key, value.toJSON()])
      ),
      library: Object.fromEntries(
        Array.from(this.library.entries()).map(([key, value]) => [key, value.toJSON()])
      ),
      presetShareds: Object.fromEntries(
        Array.from(this.presetShareds.entries()).map(([key, value]) => [key, value.toJSON()])
      ),
    };
  }
};

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
  Image = 'image',
  Scene = 'scene',
  Style = 'style',
}

export interface ImageContextAlt {
  type: 'image';
  path: string;
  scene?: string;
  starable?: boolean;
}

export interface SceneContextAlt {
  type: 'scene';
  scene: GenericScene;
}

export interface StyleContextAlt {
  type: 'style';
  preset: SDPreset;
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
  return (
    typeof library.name === 'string' &&
    Array.isArray(library.pieces)
  );
}
