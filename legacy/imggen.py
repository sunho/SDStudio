import asyncio
import base64
from pathlib import Path
import argparse
import sys
import os
import json

from novelai_api import NovelAIAPI
from novelai_api.GlobalSettings import GlobalSettings
from novelai_api.ImagePreset import ImageResolution, ImageSampler, ImageGenerationType, ImageModel, ImagePreset, UCPreset

with open('NAI_TOKEN.txt', 'r') as file:
    TOKEN = file.read().strip()

async def single_vibe(prompt, uc, output_file_path, landscape, seed, vibe_image):
    output_file = Path(output_file_path)
    output_dir = output_file.parent
    output_dir.mkdir(parents=True, exist_ok=True)

    # try:
    api = NovelAIAPI()
    await api.high_level.login_with_token(TOKEN)
    globalsettings = GlobalSettings(num_logprobs=GlobalSettings.NO_LOGPROBS)

    model = ImageModel.Anime_v3
    preset = ImagePreset.from_default_config(model)
    if vibe_image:
        preset.reference_image = vibe_image
        preset.reference_strength = 0.6
        preset.reference_information_extracted = 1.0
    if seed:
        preset.seed = seed
    preset.smea = True
    preset.sampler = ImageSampler.k_euler_ancestral
    preset.uc = uc
    if landscape:
        preset.resolution = ImageResolution.Normal_Landscape_v3
    preset.uc_preset = UCPreset.Preset_None

    async for _, img in api.high_level.generate_image(prompt, model, preset):
        output_file.write_bytes(img)
    # except Exception as e:
    #     print(f"An error occurred: {e}", file=sys.stderr)
    #     sys.exit(1)


def main():
    input_data = json.load(sys.stdin)
    print(input_data["prompt"], input_data["output_file_path"])
    prompt = input_data['prompt']
    uc = input_data['uc']
    landscape = input_data['landscape']
    seed = input_data.get('seed')
    output_file_path = input_data['output_file_path']
    vibe_image = input_data.get('vibe')
    asyncio.run(single_vibe(prompt, uc, output_file_path, landscape, seed, vibe_image))


if __name__ == "__main__":
    main()
