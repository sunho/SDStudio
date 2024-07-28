import { getDefaultPreset } from './PromptService';
import { Scene, Session } from './types';

export interface DenDenPrePrompt {
  name: string;
  text: string;
  position: number;
}

export interface DenDenPreset {
  id: number;
  name: string;
  beforePrePrompt: string;
  presetPrompt: string;
  afterPrePrompt: string;
}

export interface DenDenDataFormat {
  prePrompts: DenDenPrePrompt[];
  presets: DenDenPreset[];
}

function isValidDenDenPrePrompt(prePrompt: any): prePrompt is DenDenPrePrompt {
  return (
    typeof prePrompt.name === 'string' &&
    typeof prePrompt.text === 'string' &&
    typeof prePrompt.position === 'number'
  );
}

function isValidDenDenPreset(preset: any): preset is DenDenPreset {
  return (
    typeof preset.id === 'number' &&
    typeof preset.name === 'string' &&
    typeof preset.beforePrePrompt === 'string' &&
    typeof preset.presetPrompt === 'string' &&
    typeof preset.afterPrePrompt === 'string'
  );
}

export function isValidDenDenDataFormat(data: any): data is DenDenDataFormat {
  return (
    Array.isArray(data.prePrompts) &&
    data.prePrompts.every(isValidDenDenPrePrompt) &&
    Array.isArray(data.presets) &&
    data.presets.every(isValidDenDenPreset)
  );
}

export function convertDenDenData(
  name: string,
  data: DenDenDataFormat,
): Session {
  const scenes: { [name: string]: Scene } = {};
  const preset = getDefaultPreset();
  for (const pre of data.prePrompts) {
    if (pre.name === 'After_default') {
      preset.backPrompt = pre.text;
    }
    if (pre.name === 'Before_default') {
      preset.frontPrompt = pre.text;
    }
  }

  for (const preset of data.presets) {
    const scene: Scene = {
      type: 'scene',
      name: preset.name,
      landscape: false,
      locked: false,
      slots: [[{ enabled: true, prompt: preset.presetPrompt }]],
      resolution: 'portrait',
      mains: [],
      imageMap: [],
      round: undefined,
      game: undefined,
    };
    scenes[preset.name] = scene;
  }
  return {
    name,
    presets: { default: preset },
    scenes,
    library: {},
    inpaints: {},
  } as any;
}
