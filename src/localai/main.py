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

parser = argparse.ArgumentParser(description='Process input image and model paths.')
parser.add_argument('--input_image', type=str, required=True, help='Path to the input image')
parser.add_argument('--output_path', type=str, required=True, help='Path to the output image')
parser.add_argument('--model_path', type=str, required=True, help='Path to the model file')
parser.add_argument('--box_size', type=int, required=True, help='Size of the intermediate image size')
args = parser.parse_args()

model = BiRefNet(bb_pretrained=False)
state_dict = torch.load(
    args.model_path,
    map_location='cpu'
)
state_dict = check_state_dict(state_dict)
model.load_state_dict(state_dict)
model.eval()
# model = model.to('cuda')

torch.set_float32_matmul_precision(['high', 'highest'][0])

transform_image = transforms.Compose([
    transforms.Resize((args.box_size, args.box_size)),
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

    secondimage.putalpha(output)
    return secondimage

orig = Image.open(args.input_image)
image = orig.resize((args.box_size, args.box_size))
output = singleImageoutput(image).resize(orig.size)
mask = output.split()[3].resize(orig.size)
mask.save(args.output_path + '_mask.png')
orig.putalpha(mask)
orig.save(args.output_path + '.png')
