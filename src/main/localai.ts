class LocalAIService {
  public port: number;
  private baseUrl: string;

  constructor(baseUrl: string) {
    this.port = 5353;
    this.baseUrl = baseUrl;
  }

  async loadModel(modelPath: string, isCuda: boolean = false): Promise<void> {
    const response = await fetch(`${this.baseUrl}:${this.port}/load_model`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ model_path: modelPath, is_cuda: isCuda }),
    });

    if (!response.ok) {
      const error: any = await response.json();
      throw new Error(`Error loading model: ${error.error}`);
    }
  }

  async runModel(
    inputImageBase64: string,
    boxSize: number,
    outputPath: string,
  ): Promise<any> {
    const response = await fetch(`${this.baseUrl}:${this.port}/run_model`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        input_image_base64: inputImageBase64,
        box_size: boxSize,
        output_path: outputPath,
      }),
    });

    if (!response.ok) {
      const error: any = await response.json();
      throw new Error(`Error running model: ${error.error}`);
    }

    return await response.json();
  }
}

export default LocalAIService;
