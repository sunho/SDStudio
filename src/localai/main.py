import os
import argparse
from glob import glob
from tqdm import tqdm
import cv2
import torch
from torch import nn
from BiRefNet.models.birefnet import BiRefNet
from BiRefNet.utils import save_tensor_img, check_state_dict , path_to_image
import requests
from PIL import Image
from io import BytesIO
from torchvision import transforms
from flask import Flask, request, jsonify
from threading import Lock
import base64
import io

is_cuda = False
model = None

def load_model(path, cuda):
    global model
    global is_cuda
    model = BiRefNet(bb_pretrained=False)
    state_dict = torch.load(
        path,
        map_location='cpu'
    )
    state_dict = check_state_dict(state_dict)
    model.load_state_dict(state_dict)
    model.eval()
    is_cuda = cuda
    if is_cuda:
        model = model.to('cuda')

def run_model(image, box_size):
  if model is None:
    raise Exception("Model is not loaded")
  transform_image = transforms.Compose([
      transforms.Resize((box_size, box_size)),
      transforms.ToTensor(),
      transforms.Normalize([0.485, 0.456, 0.406], [0.229, 0.224, 0.225])
  ])
  def tensor_to_pil(tenor_im):
      im = tenor_im.cpu().clone()
      im = im.squeeze(0)
      tensor2pil = transforms.ToPILImage()
      im = tensor2pil(im)
      return im

  def singleImageoutput(image):
      secondimage = image.copy()
      input_images = transform_image(image).unsqueeze(0)
      if is_cuda:
          input_images = input_images.to('cuda')
      with torch.no_grad():
          scaled_preds = model(input_images)[-1].sigmoid()
      for idx_sample in range(scaled_preds.shape[0]):
          res = nn.functional.interpolate(
              scaled_preds[idx_sample].unsqueeze(0),
              size=secondimage.size,
              mode='bilinear',
              align_corners=True
          )
      output=tensor_to_pil(res)   # test set dir + file name
      return output
  if image.mode in ('RGBA', 'LA'):
      image = image.convert('RGB')
  mask = singleImageoutput(image.resize((box_size, box_size))).resize(image.size)
  image.putalpha(mask)
  return image

torch.set_float32_matmul_precision(['high', 'highest'][0])

app = Flask(__name__)
lock = Lock()

@app.route('/load_model', methods=['POST'])
def load_model_route():
    global model, model_path, is_cuda
    data = request.json
    model_path = data.get('model_path')
    is_cuda = data.get('is_cuda', False)

    if not model_path:
        return jsonify({"error": "Model path is required"}), 400

    try:
        with lock:
            load_model(model_path, is_cuda)
    except Exception as e:
        return jsonify({"error": str(e)}), 500

    return jsonify({"message": "Model loaded successfully"})

@app.route('/run_model', methods=['POST'])
def run_model_route():
    global model
    if model is None:
        return jsonify({"error": "Model is not loaded"}), 400

    data = request.json
    input_image_base64 = data.get('input_image_base64')
    box_size = data.get('box_size')
    output_path = data.get('output_path')

    if not input_image_base64 or not box_size or not output_path:
        return jsonify({"error": "input_image_base64, box_size, and output_path are required"}), 400

    try:
        # Decode base64 image to PIL image
        image_data = base64.b64decode(input_image_base64)
        image = Image.open(io.BytesIO(image_data))
    except Exception as e:
        return jsonify({"error": f"Invalid image data: {str(e)}"}), 400

    try:
      with lock:
          result = run_model(image, box_size)
          result.save(output_path)
    except Exception as e:
        return jsonify({"error": str(e)}), 500

    return jsonify({"message": "Model run successfully"})

if __name__ == '__main__':
    parser = argparse.ArgumentParser(description='Flask service for model loading and running.')
    parser.add_argument('--port', type=int, default=5000, help='Port number to listen on')
    args = parser.parse_args()

    app.run(debug=True, port=args.port)
