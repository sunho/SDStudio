import {
  Model,
  Resolution,
  Sampling,
  ImageGenInput,
  ImageGenService,
} from '../imageGen';

import path from 'path';
const fs = require('fs').promises;
const AdmZip = require('adm-zip');

const TIMEOUT_SECONDS = 120;

import axios from 'axios';
const libsodium_wrappers_sumo_1 = require('libsodium-wrappers-sumo');

export class NovelAiImageGenService implements ImageGenService {
  private translateModel(model: Model): string {
    const modelMap = {
      anime: 'nai-diffusion-3',
      inpaint: 'nai-diffusion-3-inpainting',
    } as const;
    return modelMap[model];
  }

  private translateResolution(resolution: Resolution): {
    height: number;
    width: number;
  } {
    const resolutionMap = {
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
    return resolutionMap[resolution];
  }

  private translateSampling(sampling: Sampling): string {
    const samplingMap = {
      k_euler_ancestral: 'k_euler_ancestral',
      k_euler: 'k_euler',
      k_dpmpp_2s_ancestral: 'k_dpmpp_2s_ancestral',
      k_dpmpp_2m: 'k_dpmpp_2m',
      k_dpmpp_sde: 'k_dpmpp_sde',
      ddim_v3: 'ddim_v3',
    } as const;
    return samplingMap[sampling];
  }

  private apiEndpoint: string;
  private headers: any;

  constructor() {
    this.apiEndpoint = 'https://api.novelai.net';
    this.headers = {
      'Content-Type': 'application/json',
    };
  }

  private getRandomInt(min: number, max: number): number {
    min = Math.ceil(min);
    max = Math.floor(max);
    return Math.floor(Math.random() * (max - min)) + min;
  }

  public async login(
    email: string,
    password: string,
  ): Promise<{ accessToken: string }> {
    try {
      await libsodium_wrappers_sumo_1.ready;
      const token = (0, libsodium_wrappers_sumo_1.crypto_pwhash)(
        64,
        new Uint8Array(Buffer.from(password)),
        (0, libsodium_wrappers_sumo_1.crypto_generichash)(
          libsodium_wrappers_sumo_1.crypto_pwhash_SALTBYTES,
          password.slice(0, 6) + email + 'novelai_data_access_key',
        ),
        2,
        2e6,
        libsodium_wrappers_sumo_1.crypto_pwhash_ALG_ARGON2ID13,
        'base64',
      ).slice(0, 64);
      const url = this.apiEndpoint;
      const response = await axios.post(
        url + '/user/login',
        {
          key: token,
        },
        {
          headers: this.headers,
        },
      );
      return response.data;
    } catch (error: any) {
      throw new Error(`login Error: ${error.message}`);
    }
  }

  public async generateImage(authorization: string, params: ImageGenInput) {
    try {
      const modelValue = this.translateModel(params.model);
      const resolutionValue = this.translateResolution(params.resolution);
      const samplingValue = this.translateSampling(params.sampling);

      const url = this.apiEndpoint;
      const body: any = {
        input: params.prompt,
        model: modelValue,
        action: params.model == Model.Inpaint ? 'infill' : undefined,
        parameters: {
          width: resolutionValue.width,
          height: resolutionValue.height,
          noise_schedule: 'native',
          controlnet_strength: 1,
          dynamic_thresholding: false,
          scale: params.promptGuidance,
          uncond_scale: 1,
          sampler: samplingValue,
          steps: params.steps,
          noise: 0,
          seed: params.seed ?? this.getRandomInt(1, 2100000000),
          extra_noise_seed: this.getRandomInt(1, 2100000000),
          n_samples: 1,
          ucPreset: 3,
          sm: params.sampling === Sampling.DDIM ? false : params.sm,
          sm_dyn: params.sampling === Sampling.DDIM ? false : params.dyn,
          negative_prompt: params.uc,
          params_version: 1,
          strength: params.imageStrength,
          qualityToggle: true,
          reference_image_multiple: [],
          reference_information_extracted_multiple: [],
          reference_strength_multiple: [],
          legacy: false,
          legacy_v3_extend: false,
          cfg_rescale: 0,
          add_original_image: false,
        },
      };
      if (params.vibe) {
        body.parameters.reference_image_multiple = [params.vibe!];
        body.parameters.reference_information_extracted_multiple = [1.0];
        body.parameters.reference_strength_multiple = [0.6];
      }
      if (params.image) {
        body.parameters.image = params.image;
        body.parameters.mask = params.mask;
      }
      console.log(body);

      const response = await axios.post(url + '/ai/generate-image', body, {
        headers: {
          ...this.headers,
          authorization: `Bearer ${authorization}`,
        },
        responseType: 'arraybuffer',
        signal: AbortSignal.timeout(TIMEOUT_SECONDS * 1000),
      });
      const zip = new AdmZip(response.data);
      const image = zip.getEntries()[0];
      const dir = path.dirname(params.outputFilePath);
      await fs.mkdir(dir, { recursive: true });
      await fs.writeFile(params.outputFilePath, image.getData());
    } catch (error: any) {
      throw new Error(`generateImage Error: ${error.message}`);
    }
  }
}
