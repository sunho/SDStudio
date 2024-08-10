export enum Model {
  Anime = 'anime',
  Inpaint = 'inpaint',
  I2I = 'i2i',
}

export enum Resolution {
  SmallLandscape = 'small_landscape',
  SmallPortrait = 'small_portrait',
  SmallSquare = 'small_square',
  Landscape = 'landscape',
  Portrait = 'portrait',
  Square = 'square',
  LargeLandscape = 'large_landscape',
  LargePortrait = 'large_portrait',
  LargeSquare = 'large_square',
  WallpaperPortrait = 'wallpaper_portrait',
  WallpaperLandscape = 'wallpaper_landscape',
}

export const upscaleReoslution = (resolution: Resolution) => {
  switch (resolution) {
    case Resolution.SmallLandscape:
      return Resolution.Landscape;
    case Resolution.SmallPortrait:
      return Resolution.Portrait;
    case Resolution.SmallSquare:
      return Resolution.Square;
    case Resolution.Landscape:
      return Resolution.LargeLandscape;
    case Resolution.Portrait:
      return Resolution.LargePortrait;
    case Resolution.Square:
      return Resolution.LargeSquare;
    case Resolution.WallpaperPortrait:
      return Resolution.WallpaperPortrait;
    case Resolution.WallpaperLandscape:
      return Resolution.WallpaperLandscape;
    default:
      return resolution;
  }
}

export const resolutionMap = {
  small_landscape: { height: 512, width: 768 },
  small_portrait: { height: 768, width: 512 },
  small_square: { height: 640, width: 640 },
  landscape: { height: 832, width: 1216 },
  portrait: { height: 1216, width: 832 },
  square: { height: 1024, width: 1024 },
  large_landscape: { height: 1024, width: 1536 },
  large_portrait: { height: 1536, width: 1024 },
  large_square: { height: 1472, width: 1472 },
  wallpaper_portrait: { height: 1088, width: 1920 },
  wallpaper_landscape: { height: 1920, width: 1088 },
} as const;

export enum Sampling {
  KEulerAncestral = 'k_euler_ancestral',
  KEuler = 'k_euler',
  KDPMPP2SAncestral = 'k_dpmpp_2s_ancestral',
  KDPMPP2M = 'k_dpmpp_2m',
  KDPMPPSDE = 'k_dpmpp_sde',
  DDIM = 'ddim_v3',
}

export enum NoiseSchedule {
  Native = 'native',
  Karras = 'karras',
  Exponential = 'exponential',
  Polyexponential = 'polyexponential',
}

export interface Vibe {
  image: string;
  info: number;
  strength: number;
}

export interface ImageGenInput {
  model: Model;
  prompt: string;
  uc: string;
  resolution: Resolution;
  sampling: Sampling;
  outputFilePath: string;
  sm: boolean;
  dyn: boolean;
  steps: number;
  promptGuidance: number;
  cfgRescale: number;
  noiseSchedule: NoiseSchedule;
  vibes: Vibe[];
  image?: string;
  mask?: string;
  noise?: number;
  imageStrength?: number;
  seed?: number;
  originalImage?: boolean;
}

export type AugmentMethod =
  | 'lineart'
  | 'colorize'
  | 'bg-removal'
  | 'declutter'
  | 'emotion'
  | 'sketch';

export interface ImageAugmentInput {
  method: AugmentMethod;
  outputFilePath: string;
  emotion?: string;
  prompt?: string;
  weaken?: number;
  image: string;
  resolution: Resolution;
}

export interface ImageGenService {
  login(email: string, password: string): Promise<{ accessToken: string }>;
  generateImage(token: string, params: ImageGenInput): Promise<string>;
  augmentImage(token: string, params: ImageAugmentInput): Promise<string>;
  getRemainCredits(token: string): Promise<number>;
}
