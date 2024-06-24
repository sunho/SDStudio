import React, { useEffect, useState } from 'react';
import { invoke, localAIService } from './models';
import { Config, ImageEditor, ModelType, RemoveBgQuality } from '../main/config';

interface ConfigScreenProps {
  onSave: () => void;
}

const ConfigScreen = ({ onSave }: ConfigScreenProps) => {
  const [imageEditor, setImageEditor] = useState('');
  const [useGPU, setUseGPU] = useState(false);
  const [ready, setReady] = useState(false);
  const [quality, setQuality] = useState('');
  const [progress, setProgress] = useState(0);
  useEffect(() => {
    (async () => {
      const config = await invoke('get-config');
      setImageEditor(config.imageEditor ?? 'photoshop');
      setUseGPU(config.useCUDA ?? false);
      setQuality(config.removeBgQuality ?? 'normal');
    })();
    const checkReady = () => {
      setReady(localAIService.ready);
    }
    const onProgress = (e: any) => {
      console.log(e);
      setProgress(e.detail.percent);
    }
    checkReady();
    localAIService.addEventListener('updated', checkReady);
    localAIService.addEventListener('progress', onProgress);
    return () => {
      localAIService.removeEventListener('updated', checkReady);
      localAIService.removeEventListener('progress', onProgress);
    };
  }, []);
  return (
    <div className="min-h-screen bg-gray-100 flex items-center justify-center">
      <div className="bg-white p-6 rounded shadow-md w-full max-w-md">
        <h1 className="text-2xl font-bold mb-4">환경설정</h1>
        <div className="mb-4">
          <label htmlFor="imageEditor" className="block text-sm font-medium text-gray-700">
            선호 이미지 편집기
          </label>
          <select
            id="imageEditor"
            className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-indigo-500 focus:ring-indigo-500 sm:text-sm"
            value={imageEditor}
            onChange={(e) => setImageEditor(e.target.value)}
          >
            <option value="photoshop">포토샵</option>
            <option value="gimp">GIMP</option>
            <option value="mspaint">그림판</option>
          </select>
        </div>
        {!ready && <div className="mt-4">
          <button
            className="w-full bg-green-500 text-white py-2 rounded"
            onClick={() => {
              if (!localAIService.downloading)
                localAIService.download();
            }}
          >
            {!localAIService.downloading ? "배경 제거 기능 활성화 (배경 제거 모델을 다운받습니다)" : `배경 제거 모델 다운로드 중... (${(progress*100).toFixed(2)}%)`}:
          </button>
        </div>
        }
        {ready && <>
        <div className="flex gap-2 mt-4">
          <label htmlFor="imageEditor" className="block text-sm font-medium text-gray-700">
            배경 제거 시 GPU 사용 (CUDA를 다운 받야아합니다
          </label>
          <input
            type="checkbox"
            checked={useGPU}
            onChange={(e) => setUseGPU(e.target.checked)}
            />
        </div>
        <div className="mt-4">
          <label htmlFor="bgQuality" className="block text-sm font-medium text-gray-700">
            배경 제거 퀄리티
          </label>
          <select
            id="bgQuality"
            className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-indigo-500 focus:ring-indigo-500 sm:text-sm"
            value={quality}
            onChange={(e) => setQuality(e.target.value)}
          >
            <option value="low">낮음</option>
            <option value="normal">보통</option>
            <option value="high">높음</option>
            <option value="veryhigh">매우높음</option>
          </select>
        </div>
        </>}
        <button
          className="mt-4 w-full bg-sky-500 text-white py-2 rounded hover:brightness-95 active:brightness-90"
          onClick={async () => {
            const old = await invoke('get-config');
            const config: Config = {
              imageEditor: imageEditor as ImageEditor,
              useCUDA: useGPU,
              modelType: 'quality',
              removeBgQuality: quality as RemoveBgQuality
            };
            invoke('set-config', config);
            if (old.useCUDA !== useGPU)
              localAIService.modelChanged();
            onSave();
          }}
        >
          저장
        </button>
      </div>
    </div>
  );
};

export default ConfigScreen;
