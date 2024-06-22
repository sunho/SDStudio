import React, { useEffect, useState } from 'react';
import { invoke } from './models';

interface ConfigScreenProps {
  onSave: () => void;
}

const ConfigScreen = ({ onSave }: ConfigScreenProps) => {
  const [imageEditor, setImageEditor] = useState('');
  useEffect(() => {
    (async () => {
      const config = await invoke('get-config');
      setImageEditor(config.imageEditor ?? 'photoshop');
    })();
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
        <button
          className="w-full bg-sky-500 text-white py-2 rounded hover:brightness-95 active:brightness-90"
          onClick={() => {
            invoke('set-config', { imageEditor });
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
