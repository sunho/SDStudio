import { spawn } from 'child_process';
import {
  Model,
  Resolution,
  Sampling,
  ImageGenInput,
  ImageGenService,
} from '../imageGen';

const TIMEOUT_SECONDS = 120;

export class PythonNAIImageGenService implements ImageGenService {
  constructor() {}

  public async login(
    email: string,
    password: string,
  ): Promise<{ accessToken: string }> {
    throw new Error('Method not implemented.');
  }

  private translateModel(model: Model): string {
    const modelMap = {
      anime: 'nai-diffusion-3',
      inpaint: 'nai-diffusion-3-inpainting',
    } as const;
    return modelMap[model];
  }

  private translateResolution(resolution: Resolution): string {
    return resolution as string;
  }

  private translateSampling(sampling: Sampling): string {
    const samplingMap = {
      k_euler_ancestral: 'k_euler_ancestral',
      k_euler: 'k_euler',
      k_lms: 'k_lms',
      plms: 'plms',
      ddim: 'ddim',
    } as const;
    return samplingMap[sampling];
  }

  public async generateImage(
    authorization: string,
    params: ImageGenInput,
  ): Promise<void> {
    const inputData = {
      ...params,
      model: this.translateModel(params.model),
      resolution: this.translateResolution(params.resolution),
      sampling: this.translateSampling(params.sampling),
    };
    return new Promise((resolve, reject) => {
      const pythonProcess = spawn('python', ['legacy/imggen.py'], {
        timeout: TIMEOUT_SECONDS * 1000,
      });

      pythonProcess.stdin.write(JSON.stringify(inputData));
      pythonProcess.stdin.end();

      pythonProcess.stdout.on('data', (data) => {
        console.log(`stdout: ${data}`);
      });

      pythonProcess.stderr.on('data', (data) => {
        console.error(`stderr: ${data}`);
      });

      pythonProcess.on('close', (code) => {
        if (code !== 0) {
          reject(`Python script exited with code ${code}`);
        } else {
          resolve();
        }
      });
    });
  }
}
