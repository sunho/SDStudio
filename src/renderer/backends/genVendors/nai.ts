import {
  Model,
  Resolution,
  Sampling,
  ImageGenInput,
  ImageGenService,
  ImageAugmentInput,
} from '../imageGen';

import JSZip from 'jszip';
import { Buffer } from 'buffer';

import libsodium_wrappers_sumo_1 from 'libsodium-wrappers-sumo';
import { getImageDimensions } from '../../componenets/BrushTool';
import { backend } from '../../models';

export interface NovelAiFetcher {
  fetchArrayBuffer(url: string, body: any, headers: any): Promise<ArrayBuffer>;
}

export class NovelAiImageGenService implements ImageGenService {
  constructor(fetcher: NovelAiFetcher) {
    this.apiEndpoint = 'https://api.novelai.net';
    this.apiEndpoint2 = 'https://image.novelai.net';
    this.headers = {
      'Content-Type': 'application/json',
    };
    this.fetcher = fetcher;
  }

  private translateModel(model: Model): string {
    const modelMap = {
      anime: 'nai-diffusion-3',
      inpaint: 'nai-diffusion-3-inpainting',
      i2i: 'nai-diffusion-3',
    } as const;
    return modelMap[model];
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
  private apiEndpoint2: string;
  private headers: any;
  private fetcher: NovelAiFetcher;

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
      const reponse = await fetch(url + '/user/login', {
        method: 'POST',
        headers: this.headers,
        body: JSON.stringify({
          key: token,
        }),
      });
      if (!reponse.ok) {
        throw new Error('HTTP error:' + reponse.status);
      }
      return await reponse.json();
    } catch (error: any) {
      throw new Error(`${error.message}`);
    }
  }

  public async generateImage(authorization: string, params: ImageGenInput) {
    let modelValue = this.translateModel(params.model);
    const resolutionValue = params.resolution;
    const samplingValue = this.translateSampling(params.sampling);

    const config = await backend.getConfig();
    if (config.useAnimalModel) {
      if (params.model === Model.Anime) {
        modelValue = 'nai-diffusion-furry-3';
      }
    }

    const seed = params.seed ?? this.getRandomInt(1, 2100000000);
    let action = undefined;
    switch (params.model) {
    case Model.Anime:
      break;
    case Model.Inpaint:
      action = 'infill';
      break;
    case Model.I2I:
      action = 'img2img'
      break;
    }
    const url = this.apiEndpoint;
    const body: any = {
      input: params.prompt,
      model: modelValue,
      action: action,
      parameters: {
        width: resolutionValue.width,
        height: resolutionValue.height,
        noise_schedule: params.noiseSchedule,
        controlnet_strength: 1,
        dynamic_thresholding: false,
        scale: params.promptGuidance,
        uncond_scale: 1,
        sampler: samplingValue,
        steps: params.steps,
        noise: params.noise,
        seed: seed,
        extra_noise_seed: seed,
        n_samples: 1,
        ucPreset: 3,
        sm: params.sampling === Sampling.DDIM ? false : params.sm,
        sm_dyn: params.sampling === Sampling.DDIM ? false : params.dyn,
        negative_prompt: params.uc,
        params_version: 1,
        strength: params.imageStrength,
        qualityToggle: config.disableQuality ? false : true,
        reference_image_multiple: [],
        reference_information_extracted_multiple: [],
        reference_strength_multiple: [],
        legacy: false,
        legacy_v3_extend: false,
        cfg_rescale: params.cfgRescale,
        add_original_image: params.originalImage ? true : false,
      },
    };
    if (params.vibes.length) {
      body.parameters.reference_image_multiple = params.vibes.map(
        (v) => v.image,
      );
      body.parameters.reference_information_extracted_multiple =
        params.vibes.map((v) => v.info);
      body.parameters.reference_strength_multiple = params.vibes.map(
        (v) => v.strength,
      );
    }
    if (params.image) {
      body.parameters.image = params.image;
    }
    if (params.mask) {
      body.parameters.mask = params.mask;
    }
    if (params.model === Model.Inpaint) {
      body.parameters.sm = false;
      body.parameters.sm_dyn = false;
      if (params.sampling === Sampling.DDIM) {
        body.parameters.sampler = this.translateSampling(Sampling.KEulerAncestral);
      }
    }

    const headers = {
      Authorization: `Bearer ${authorization}`,
      'Content-Type': 'application/json',
    };

    const arrayBuffer = await this.fetcher.fetchArrayBuffer(
      this.apiEndpoint2 + '/ai/generate-image',
      body,
      headers,
    );
    const zip = await JSZip.loadAsync(Buffer.from(arrayBuffer));
    const zipEntries = Object.keys(zip.files);
    if (zipEntries.length === 0) {
      throw new Error('No entries found in the ZIP file');
    }

    const imageEntry = zip.file(zipEntries[0])!;
    return await imageEntry.async('base64');
  }

  async getRemainCredits(token: string) {
    const url = this.apiEndpoint;
    const headers = {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    };
    const reponse = await fetch(url + '/user/data', {
      method: 'GET',
      headers: headers,
    });
    if (!reponse.ok) {
      throw new Error('HTTP error:' + reponse.status);
    }
    const res = await reponse.json();
    const steps = res['subscription']['trainingStepsLeft'];
    return steps['fixedTrainingStepsLeft'] + steps['purchasedTrainingSteps'];
  }

  async augmentImage(authorization: string, params: ImageAugmentInput) {
    const url = this.apiEndpoint;
    const {width, height} = await getImageDimensions(params.image);
    const body: any = {
      image: params.image,
      prompt: params.prompt,
      defry: params.weaken,
      req_type: params.method,
      width: width,
      height: height,
    };
    if (params.method !== 'emotion' && params.method !== 'colorize') {
      body.defry = undefined;
      body.prompt = undefined;
    }
    if (params.method === 'emotion') {
      body.prompt = params.emotion! + ';;' + body.prompt;
    }
    console.log(body);
    const headers = {
      Authorization: `Bearer ${authorization}`,
      'Content-Type': 'application/json',
    };

    const arrayBuffer = await this.fetcher.fetchArrayBuffer(
      this.apiEndpoint2 + '/ai/augment-image',
      body,
      headers,
    );
    const zip = await JSZip.loadAsync(Buffer.from(arrayBuffer));
    const zipEntries = Object.keys(zip.files);
    if (zipEntries.length === 0) {
      throw new Error('No entries found in the ZIP file');
    }

    const imageEntry = zip.file(zipEntries[zipEntries.length-1])!;
    return await imageEntry.async('base64');
  }
}
