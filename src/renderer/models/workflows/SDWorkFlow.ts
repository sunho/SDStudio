import { NoiseSchedule, Sampling } from '../../backends/imageGen';
import {
  WFDefBuilder,
  wfiGroup,
  wfiInlineInput,
  wfiMiddlePlaceholderInput,
  wfiPresetSelect,
  wfiProfilePresetSelect,
  wfiPush,
  wfiStack,
  WFVarBuilder,
} from './WorkFlow';
import {
  Session,
  GenericScene,
  SDJob,
  Scene,
  SDAbstractJob,
  PromptNode,
  SDInpaintJob,
  SDI2IJob,
} from '../types';
import {
  createSDPrompts,
  defaultBPrompt,
  defaultFPrompt,
  defaultUC,
} from '../PromptService';
import { imageService, taskQueueService, workFlowService } from '..';
import { TaskParam } from '../TaskQueueService';
import { dataUriToBase64 } from '../ImageService';

const SDImageGenPreset = new WFVarBuilder()
  .addIntVar('cfgRescale', 0, 1, 0.01, 0)
  .addIntVar('steps', 1, 50, 1, 28)
  .addIntVar('promptGuidance', 0, 10, 0.1, 5)
  .addBoolVar('smea', false)
  .addBoolVar('dyn', false)
  .addSamplingVar('sampling', Sampling.KEulerAncestral)
  .addPromptVar('frontPrompt', defaultFPrompt)
  .addPromptVar('backPrompt', defaultBPrompt)
  .addPromptVar('uc', defaultUC)
  .addNoiseScheduleVar('noiseSchedule', NoiseSchedule.Native);

const SDImageGenShared = new WFVarBuilder()
  .addVibeSetVar('vibes')
  .addNullIntVar('seed');

const SDImageGenUI = wfiStack([
  wfiPresetSelect(),
  wfiInlineInput('상위 프롬프트', 'frontPrompt', 'preset', 'flex-1'),
  wfiMiddlePlaceholderInput('중간 프롬프트 (이 씬에만 적용됨)'),
  wfiInlineInput('하위 프롬프트', 'backPrompt', 'preset', 'flex-1'),
  wfiInlineInput('네거티브 프롬프트', 'uc', 'preset', 'flex-1'),
  wfiInlineInput('시드', 'seed', 'shared', 'flex-none'),
  wfiGroup('샘플링 설정', [
    wfiPush('top'),
    wfiInlineInput('스탭 수', 'steps', 'preset', 'flex-none'),
    wfiInlineInput('프롬프트 가이던스', 'promptGuidance', 'preset', 'flex-none'),
    wfiInlineInput('SMEA', 'smea', 'preset', 'flex-none'),
    wfiInlineInput('DYN', 'dyn', 'preset', 'flex-none'),
    wfiInlineInput('샘플링', 'sampling', 'preset', 'flex-none'),
    wfiInlineInput('노이즈 스케줄', 'noiseSchedule', 'preset', 'flex-none'),
    wfiInlineInput('CFG 리스케일', 'cfgRescale', 'preset', 'flex-none'),
  ]),
  wfiInlineInput('바이브 설정', 'vibes', 'shared', 'flex-none'),
]);

const SDImageGenEasyShared = SDImageGenShared.clone()
  .addPromptVar('characterPrompt', '')
  .addPromptVar('backgroundPrompt', '')
  .addPromptVar('uc', '');

const SDImageGenEasyUI = wfiStack([
  wfiProfilePresetSelect(),
  wfiInlineInput('캐릭터 관련 태그', 'characterPrompt', 'shared', 'flex-1'),
  wfiMiddlePlaceholderInput('중간 프롬프트 (이 씬에만 적용됨)'),
  wfiInlineInput('배경 관련 태그', 'backgroundPrompt', 'shared', 'flex-1'),
  wfiInlineInput('태그 밴 리스트', 'uc', 'shared', 'flex-1'),
  wfiInlineInput('시드', 'seed', 'shared', 'flex-none'),
  wfiInlineInput('바이브 설정', 'vibes', 'shared', 'flex-none'),
]);

const SDImageGenEasyInnerUI = wfiStack([
  wfiInlineInput('상위 프롬프트', 'frontPrompt', 'preset', 'flex-1'),
  wfiMiddlePlaceholderInput('중간 프롬프트 (이 창에만 적용됨)'),
  wfiInlineInput('하위 프롬프트', 'backPrompt', 'preset', 'flex-1'),
  wfiInlineInput('네거티브 프롬프트', 'uc', 'preset', 'flex-1'),
  wfiGroup('샘플링 설정', [
    wfiPush('top'),
    wfiInlineInput('스탭 수', 'steps', 'preset', 'flex-none'),
    wfiInlineInput('프롬프트 가이던스', 'promptGuidance', 'preset', 'flex-none'),
    wfiInlineInput('SMEA', 'smea', 'preset', 'flex-none'),
    wfiInlineInput('DYN', 'dyn', 'preset', 'flex-none'),
    wfiInlineInput('샘플링', 'sampling', 'preset', 'flex-none'),
    wfiInlineInput('노이즈 스케줄', 'noiseSchedule', 'preset', 'flex-none'),
    wfiInlineInput('CFG 리스케일', 'cfgRescale', 'preset', 'flex-none'),
  ]),
]);

const SDImageGenHandler = async (
  session: Session,
  scene: GenericScene,
  prompt: PromptNode,
  preset: any,
  shared: any,
  samples: number,
  meta?: any,
  onComplete?: (img: string) => void,
  nodelay?: boolean,
) => {
  const job: SDJob = {
    type: 'sd',
    cfgRescale: preset.cfgRescale,
    steps: preset.steps,
    promptGuidance: preset.promptGuidance,
    smea: preset.smea,
    dyn: preset.dyn,
    prompt: prompt,
    sampling: preset.sampling,
    uc: preset.uc,
    noiseSchedule: preset.noiseSchedule,
    backend: preset.backend,
    vibes: shared.vibes,
    seed: shared.seed,
  };
  const param: TaskParam = {
    session: session,
    job: job,
    scene: scene,
    nodelay: nodelay,
    outputPath: imageService.getOutputDir(session, scene),
    onComplete: onComplete,
  };
  taskQueueService.addTask(param, samples);
};

const SDCreatePrompt = async (
  session: Session,
  scene: GenericScene,
  preset: any,
  shared: any,
) => {
  return await createSDPrompts(session, preset, shared, scene as Scene);
};

export const SDImageGenDef = new WFDefBuilder('SDImageGen')
  .setTitle('이미지 생성')
  .setBackendType('image')
  .setI2I(false)
  .setPresetVars(SDImageGenPreset.build())
  .setSharedVars(SDImageGenShared.build())
  .setEditor(SDImageGenUI)
  .setHandler(SDImageGenHandler)
  .setCreatePrompt(SDCreatePrompt)
  .build();

export const SDImageGenEasyDef = new WFDefBuilder('SDImageGenEasy')
  .setTitle('이미지 생성 (이지모드)')
  .setBackendType('image')
  .setI2I(false)
  .setPresetVars(SDImageGenPreset.build())
  .setSharedVars(SDImageGenEasyShared.build())
  .setEditor(SDImageGenEasyUI)
  .setInnerEditor(SDImageGenEasyInnerUI)
  .setHandler(SDImageGenHandler)
  .setCreatePrompt(SDCreatePrompt)
  .build();

const SDInpaintPreset = new WFVarBuilder()
  .addImageVar('image')
  .addImageVar('mask')
  .addIntVar('strength', 0, 1, 0.01, 0.7)
  .addIntVar('cfgRescale', 0, 1, 0.01, 0)
  .addIntVar('steps', 1, 50, 1, 28)
  .addIntVar('promptGuidance', 0, 10, 0.1, 5)
  .addBoolVar('smea', false)
  .addBoolVar('dyn', false)
  .addBoolVar('originalImage', true)
  .addSamplingVar('sampling', Sampling.KEulerAncestral)
  .addPromptVar('prompt', '')
  .addPromptVar('uc', '')
  .addNoiseScheduleVar('noiseSchedule', NoiseSchedule.Native)
  .addVibeSetVar('vibes')
  .addNullIntVar('seed');

const SDInpaintUI = wfiStack([
  wfiInlineInput('이미지', 'image', 'preset', 'flex-none'),
  wfiInlineInput('인페인트 강도', 'strength', 'preset', 'flex-none'),
  wfiInlineInput('비마스크 영역 편집 방지', 'originalImage', 'preset', 'flex-none'),
  wfiInlineInput('프롬프트', 'prompt', 'preset', 'flex-1'),
  wfiInlineInput('네거티브 프롬프트', 'uc', 'preset', 'flex-1'),
  wfiGroup('샘플링 설정', [
    wfiPush('top'),
    wfiInlineInput('스탭 수', 'steps', 'preset', 'flex-none'),
    wfiInlineInput('프롬프트 가이던스', 'promptGuidance', 'preset', 'flex-none'),
    wfiInlineInput('SMEA', 'smea', 'preset', 'flex-none'),
    wfiInlineInput('DYN', 'dyn', 'preset', 'flex-none'),
    wfiInlineInput('샘플링', 'sampling', 'preset', 'flex-none'),
    wfiInlineInput('노이즈 스케줄', 'noiseSchedule', 'preset', 'flex-none'),
    wfiInlineInput('CFG 리스케일', 'cfgRescale', 'preset', 'flex-none'),
  ]),
  wfiInlineInput('바이브 설정', 'vibes', 'preset', 'flex-none'),
  // wfiInlineInput('시드', 'seed', true, 'flex-none'),
]);

const createSDI2IHandler = (type: string) => {
  const handler = async (
    session: Session,
    scene: GenericScene,
    prompt: PromptNode,
    preset: any,
    shared: any,
    samples: number,
    onComplete?: (img: string) => void,
  ) => {
    const image = preset.image.endsWith('.png') ? dataUriToBase64(
      (await imageService.fetchVibeImage(session, preset.image))!,
    ) : preset.image;
    const isInpaint = type === 'SDInpaint';
    const getMask = async () => dataUriToBase64(
      (await imageService.fetchVibeImage(session, preset.mask))!,
    );
    const job: SDInpaintJob | SDI2IJob = {
      type: isInpaint ? 'sd_inpaint' : 'sd_i2i',
      cfgRescale: preset.cfgRescale,
      steps: preset.steps,
      promptGuidance: preset.promptGuidance,
      smea: preset.smea,
      dyn: preset.dyn,
      prompt: { type: 'text', text: preset.prompt },
      sampling: preset.sampling,
      uc: preset.uc,
      noiseSchedule: preset.noiseSchedule,
      backend: preset.backend,
      vibes: preset.vibes,
      strength: preset.strength,
      overrideResolution: preset.overrideResolution,
      originalImage: isInpaint ? preset.originalImage : true,
      image: image,
      mask: isInpaint ? await getMask() : '',
      noise: isInpaint ? undefined : preset.noise,
    };
    const param: TaskParam = {
      session: session,
      job: job,
      scene: scene,
      outputPath: imageService.getOutputDir(session, scene),
      onComplete: onComplete,
    };
    taskQueueService.addTask(param, samples);
  };
  return handler;
};

export function createInpaintPreset(
  job: SDAbstractJob<string>,
  image?: string,
  mask?: string,
): any {
  const preset = workFlowService.buildPreset('SDInpaint');
  preset.image = image;
  preset.mask = mask;
  preset.cfgRescale = job.cfgRescale;
  preset.promptGuidance = job.promptGuidance;
  preset.smea = job.smea;
  preset.dyn = job.dyn;
  preset.sampling = job.sampling;
  preset.noiseSchedule = job.noiseSchedule;
  preset.prompt = job.prompt;
  preset.uc = job.uc;
  return preset;
}

export const SDInpaintDef = new WFDefBuilder('SDInpaint')
  .setTitle('인페인트')
  .setBackendType('image')
  .setEmoji('🖌️')
  .setI2I(true)
  .setHasMask(true)
  .setPresetVars(SDInpaintPreset.build())
  .setSharedVars(new WFVarBuilder().build())
  .setEditor(SDInpaintUI)
  .setHandler(createSDI2IHandler('SDInpaint'))
  .setCreatePreset(createInpaintPreset)
  .build();

const SDI2IPreset = SDInpaintPreset.clone()
  .addIntVar('noise', 0, 1, 0.01, 0)
  .addStringVar('overrideResolution', '');

const SDI2IUI = wfiStack([
  wfiInlineInput('이미지', 'image', 'preset', 'flex-none'),
  wfiInlineInput('강도', 'strength', 'preset', 'flex-none'),
  wfiInlineInput('노이즈', 'noise', 'preset', 'flex-none'),
  wfiInlineInput('프롬프트', 'prompt', 'preset', 'flex-1'),
  wfiInlineInput('네거티브 프롬프트', 'uc', 'preset', 'flex-1'),
  wfiGroup('샘플링 설정', [
    wfiPush('top'),
    wfiInlineInput('스탭 수', 'steps', 'preset', 'flex-none'),
    wfiInlineInput('프롬프트 가이던스', 'promptGuidance', 'preset', 'flex-none'),
    wfiInlineInput('SMEA', 'smea', 'preset', 'flex-none'),
    wfiInlineInput('DYN', 'dyn', 'preset', 'flex-none'),
    wfiInlineInput('샘플링', 'sampling', 'preset', 'flex-none'),
    wfiInlineInput('노이즈 스케줄', 'noiseSchedule', 'preset', 'flex-none'),
    wfiInlineInput('CFG 리스케일', 'cfgRescale', 'preset', 'flex-none'),
  ]),
  wfiInlineInput('바이브 설정', 'vibes', 'preset', 'flex-none'),
  // wfiInlineInput('시드', 'seed', true, 'flex-none'),
]);

export function createI2IPreset(
  job: SDAbstractJob<string>,
  image?: string,
  mask?: string,
): any {
  const preset = workFlowService.buildPreset('SDI2I');
  preset.image = image;
  preset.mask = mask;
  preset.cfgRescale = job.cfgRescale;
  preset.promptGuidance = job.promptGuidance;
  preset.smea = job.smea;
  preset.dyn = job.dyn;
  preset.sampling = job.sampling;
  preset.noiseSchedule = job.noiseSchedule;
  preset.prompt = job.prompt;
  preset.uc = job.uc;
  return preset;
}

export const SDI2IDef = new WFDefBuilder('SDI2I')
  .setTitle('이미지 투 이미지')
  .setBackendType('image')
  .setEmoji('🔄')
  .setI2I(true)
  .setPresetVars(SDI2IPreset.build())
  .setSharedVars(new WFVarBuilder().build())
  .setEditor(SDI2IUI)
  .setHandler(createSDI2IHandler('SDI2I'))
  .setCreatePreset(createI2IPreset)
  .build();
