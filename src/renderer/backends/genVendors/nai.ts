import {
  Model,
  Resolution,
  Sampling,
  ImageGenInput,
  ImageGenService,
} from '../imageGen';

import path from 'path';
import JSZip from 'jszip';

const TIMEOUT_SECONDS = 120;

import FetchService from '../fecthService';

import axios from 'axios';
import libsodium_wrappers_sumo_1 from 'libsodium-wrappers-sumo';
import { connect } from 'http2';
import { CapacitorHttp } from '@capacitor/core';

export class NovelAiImageGenService implements ImageGenService {
  constructor() {
    this.apiEndpoint = 'https://api.novelai.net';
    this.headers = {
      'Content-Type': 'application/json',
    };
  }

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
      const reponse =  await fetch(
        url + '/user/login',
        {
          method: 'POST',
          headers: this.headers,
          body: JSON.stringify({
            key: token,
          }),
        },
      );
      if (!reponse.ok) {
        throw new Error('Login failed: ' + reponse.statusText);
      }
      return await reponse.json();
    } catch (error: any) {
      throw new Error(`login Error: ${error.message}`);
    }
  }

  public async generateImage(authorization: string, params: ImageGenInput) {
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
        add_original_image: params.originalImage ? true : false,
      },
    };
    if (params.vibes.length) {
      body.parameters.reference_image_multiple = params.vibes.map((v) => v.image);
      body.parameters.reference_information_extracted_multiple = params.vibes.map((v) => v.info);
      body.parameters.reference_strength_multiple = params.vibes.map((v) => v.strength);
    }
    if (params.image) {
      body.parameters.image = params.image;
      body.parameters.mask = params.mask;
    }
    console.log(body);


    const options = {
      data: body,
      cache:  "no-cache",
      responseType: 'arraybuffer',
      readTimeout: TIMEOUT_SECONDS * 1000,
      connectTimeout: TIMEOUT_SECONDS * 1000,
      url: url + '/ai/generate-image',
    };

    const headers = {
      'Authorization': `Bearer ${authorization}`,
      'Content-Type': 'application/json',
    };
    const response = await FetchService.fetchData({
      url: url+'/ai/generate-image',
      body: JSON.stringify(body),
      headers: JSON.stringify(headers),
    });

    // const response = await fetch(url + '/ai/generate-image', {
    //   method: 'POST',
    //   headers: {
    //     ...this.headers,
    //     'Content-Type': 'application/json',
    //     'Authorization': `Bearer ${authorization}`,
    //   },
    //   body: JSON.stringify(body),
    //   signal: controller.signal,
    // });

    // const response = await CapacitorHttp.post(options);

    // Clear the timeout if the request completes in time

    // if (response.status !== 200) {
    //   throw new Error(`HTTP error! status: ${response.status}`);
    // }

    // base64 to arraybuf do it
    function base64ToArrayBuffer(base64) {
      // Decode the base64 string
      const binaryString = atob(base64);

      // Create a new ArrayBuffer with the same length as the binary string
      const len = binaryString.length;
      const bytes = new Uint8Array(len);

      // Write the decoded binary string to the array buffer
      for (let i = 0; i < len; i++) {
          bytes[i] = binaryString.charCodeAt(i);
      }

      return bytes.buffer;
  }
    const arrayBuffer = base64ToArrayBuffer(response.data);
    function buf2hex(buffer) { // buffer is an ArrayBuffer
      return [...new Uint8Array(buffer)]
          .map(x => x.toString(16).padStart(2, '0'))
          .join('');
    }
    function hex2buf(hex) {
      if (hex.length % 2 !== 0) {
        throw new Error("Invalid hex string");
      }
      const buffer = new Uint8Array(hex.length / 2);
      for (let i = 0; i < hex.length; i += 2) {
        buffer[i / 2] = parseInt(hex.substr(i, 2), 16);
      }
      return buffer.buffer;
    }
    const zip = await JSZip.loadAsync(Buffer.from(arrayBuffer));
    const zipEntries = Object.keys(zip.files);
    if (zipEntries.length === 0) {
      throw new Error('No entries found in the ZIP file');
    }

    const imageEntry = zip.file(zipEntries[0])!;
    return await imageEntry.async('base64');
  }
}
