import { NoiseSchedule, Resolution, Sampling } from '../backends/imageGen';

export type PARR = string[];

export interface VibeItem {
  path: string;
  info: number;
  strength: number;
}

export interface CommonSetup {
  type: 'preset' | 'style';
  preset: PreSet;
  shared: PreSetShared;
}

export interface NAIPreSet {
  type: 'preset';
  name: string;
  frontPrompt: string;
  backPrompt: string;
  uc: string;
  steps?: number;
  promptGuidance?: number;
  smeaOff?: boolean;
  dynOn?: boolean;
  sampling?: Sampling;
  cfgRescale?: number;
  noiseSchedule?: NoiseSchedule;
}

export interface NAIStylePreSet {
  type: 'style';
  name: string;
  frontPrompt: string;
  backPrompt: string;
  uc: string;
  steps?: number;
  promptGuidance?: number;
  smeaOff?: boolean;
  dynOn?: boolean;
  sampling?: Sampling;
  profile: string;
  cfgRescale?: number;
  noiseSchedule?: NoiseSchedule;
}

export interface NAIPreSetShared {
  type: 'preset';
  vibes: VibeItem[];
  seed?: number;
}

export interface NAIStylePreSetShared {
  type: 'style';
  vibes: VibeItem[];
  characterPrompt: string;
  backgroundPrompt: string;
  uc: string;
  seed?: number;
}

export type PreSet = NAIPreSet | NAIStylePreSet;
export type PreSetShared = NAIPreSetShared | NAIStylePreSetShared;
export type PreSetMode = 'preset' | 'style';

export interface PieceLibrary {
  description: string;
  pieces: { [key: string]: string };
  multi: { [key: string]: boolean };
}

export interface PromptPiece {
  prompt: string;
  id?: string;
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
  imageMap: string[];
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
  imageMap: string[];
  landscape?: boolean;
  sceneRef?: string;
  image?: string;
  mask?: string;
  originalImage?: boolean;
}

export interface Session {
  name: string;
  presets: PreSet[];
  presetMode: PreSetMode;
  inpaints: { [key: string]: InPaintScene };
  scenes: { [key: string]: Scene };
  library: { [key: string]: PieceLibrary };
  presetShareds: { [key: string]: PreSetShared };
}

export type SceneType = 'scene' | 'inpaint';

export interface Round {
  players: Player[];
  winMask: boolean[];
  curPlayer: number;
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
  cfgRescale: number;
  noiseSchedule: NoiseSchedule;
  seed?: number;
}

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
  sceneType: SceneType;
  name: string;
}

export interface StyleContextAlt {
  type: 'style';
  preset: NAIStylePreSet;
  session: Session;
}

export type ContextAlt = ImageContextAlt | SceneContextAlt | StyleContextAlt;

export const encodeContextAlt = (x: ContextAlt) => JSON.stringify(x)!;
export const decodeContextAlt = JSON.parse as (x: string) => ContextAlt;

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

export type GenericScene = Scene | InPaintScene;
