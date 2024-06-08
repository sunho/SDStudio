export enum Model {
  Anime = 'anime',
  Inpaint = 'inpaint',
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

export const resolutionMap = {
    small_landscape: { height: 512, width: 768 },
    small_portrait: { height: 768, width: 512 },
    small_square: { height: 640, width: 640},
    landscape: { height: 832, width: 1216 },
    portrait: { height: 1216, width: 832 },
    square: { height: 1024, width: 1024 },
    large_landscape: { height: 1024, width: 1536 },
    large_portrait: { height: 1536, width: 1024 },
    large_square: { height: 1472, width: 1472},
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
  vibe?: string;
  image?: string;
  mask?: string;
  imageStrength?: number;
  seed?: number;
}

export interface ImageGenService {
  login(email: string, password: string): Promise<{ accessToken: string }>;
  generateImage(token: string, params: ImageGenInput): Promise<void>;
}
