export enum Model {
  Anime = 'anime',
  Inpaint = 'inpaint',
}

export enum Resolution {
  Landscape = 'landscape',
  Portrait = 'portrait',
  Square = 'square',
}

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
