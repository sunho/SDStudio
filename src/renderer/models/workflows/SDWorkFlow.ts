import { NoiseSchedule, Sampling } from "../../backends/imageGen";
import { WFDefBuilder, wfiGroup, wfiInlineInput, wfiMiddlePlaceholderInput, wfiPresetSelect, wfiProfilePresetSelect, wfiPush, wfiStack, WFVarBuilder } from "./WorkFlow";
import { Session, GenericScene, SDJob, Scene, SDAbstractJob, PromptNode } from "../types";
import { createSDPrompts } from "../PromptService";
import { imageService, taskQueueService, workFlowService } from "..";
import { TaskParam } from "../TaskQueueService";

const SDImageGenPreset = new WFVarBuilder()
  .addIntVar('cfgRescale', 0, 1, 0.01, 0)
  .addIntVar('steps', 1, 50, 1, 28)
  .addIntVar('promptGuidance', 0, 10, 0.1, 5)
  .addBoolVar('smea', false)
  .addBoolVar('dyn', false)
  .addSamplingVar('sampling', Sampling.KEulerAncestral)
  .addPromptVar('frontPrompt', '')
  .addPromptVar('backPrompt', '')
  .addPromptVar('uc', '')
  .addNoiseScheduleVar('noiseSchedule', NoiseSchedule.Native);

const SDImageGenShared = new WFVarBuilder()
  .addVibeSetVar('vibes')
  .addNullIntVar('seed');

const SDImageGenUI = wfiStack([
  wfiPresetSelect(),
  wfiInlineInput('상위 프롬프트', 'frontPrompt', true, 'flex-1'),
  wfiMiddlePlaceholderInput('중간 프롬프트 (이 씬에만 적용됨)'),
  wfiInlineInput('하위 프롬프트', 'backPrompt', true, 'flex-1'),
  wfiInlineInput('네거티브 프롬프트', 'uc', true, 'flex-1'),
  wfiInlineInput('시드', 'seed', false, 'flex-none'),
  wfiGroup('샘플링 설정', [
    wfiPush('top'),
    wfiInlineInput('CFG 리스케일', 'cfgRescale', true, 'flex-none'),
    wfiInlineInput('프롬프트 가이던스', 'promptGuidance', true, 'flex-none'),
    wfiInlineInput('SMEA', 'smea', true, 'flex-none'),
    wfiInlineInput('DYN', 'dyn', true, 'flex-none'),
    wfiInlineInput('샘플링', 'sampling', true, 'flex-none'),
    wfiInlineInput('노이즈 스케줄', 'noiseSchedule', true, 'flex-none'),
  ]),
  wfiInlineInput('바이브 설정', 'vibes', false, 'flex-none'),
]);

const SDImageGenEasyShared = SDImageGenShared.clone()
  .addPromptVar('characterPrompt', '')
  .addPromptVar('backgroundPrompt', '')
  .addPromptVar('uc', '');

const SDImageGenEasyUI = wfiStack([
  wfiProfilePresetSelect(),
  wfiInlineInput('캐릭터 관련 태그', 'characterPrompt', false, 'flex-1'),
  wfiMiddlePlaceholderInput('중간 프롬프트 (이 씬에만 적용됨)'),
  wfiInlineInput('배경 관련 태그', 'backgroundPrompt', false, 'flex-1'),
  wfiInlineInput('태그 밴 리스트', 'uc', false, 'flex-1'),
  wfiInlineInput('시드', 'seed', false, 'flex-none'),
  wfiInlineInput('바이브 설정', 'vibes', false, 'flex-none'),
]);

const SDImageGenEasyInnerUI = wfiStack([
  wfiInlineInput('상위 프롬프트', 'frontPrompt', true, 'flex-1'),
  wfiInlineInput('하위 프롬프트', 'backPrompt', true, 'flex-1'),
  wfiInlineInput('네거티브 프롬프트', 'uc', true, 'flex-1'),
  wfiGroup('샘플링 설정', [
    wfiPush('top'),
    wfiInlineInput('CFG 리스케일', 'cfgRescale', true, 'flex-none'),
    wfiInlineInput('프롬프트 가이던스', 'promptGuidance', true, 'flex-none'),
    wfiInlineInput('SMEA', 'smea', true, 'flex-none'),
    wfiInlineInput('DYN', 'dyn', true, 'flex-none'),
    wfiInlineInput('샘플링', 'sampling', true, 'flex-none'),
    wfiInlineInput('노이즈 스케줄', 'noiseSchedule', true, 'flex-none'),
  ]),
]);

const SDImageGenHandler = async (session: Session, scene: GenericScene, prompt: PromptNode, preset: any, shared: any, samples: number, onComplete?: (img: string) => void) => {
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
    outputPath: imageService.getOutputDir(session, scene),
    onComplete: onComplete,
  };
  taskQueueService.addTask(param, samples);
};

const SDCreatePrompt = async (session: Session, scene: GenericScene, preset: any, shared: any) => {
  return await createSDPrompts(session, preset, shared, scene as Scene);
}

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
  wfiInlineInput('이미지', 'image', true, 'flex-none'),
  wfiInlineInput('프롬프트', 'prompt', true, 'flex-1'),
  wfiInlineInput('네거티브 프롬프트', 'uc', true, 'flex-1'),
  wfiInlineInput('비마스크 영역 편집 방지', 'originalImage', true, 'flex-none'),
  wfiInlineInput('인페인트 강도', 'strength', true, 'flex-none'),
  wfiGroup('샘플링 설정', [
    wfiPush('top'),
    wfiInlineInput('CFG 리스케일', 'cfgRescale', true, 'flex-none'),
    wfiInlineInput('프롬프트 가이던스', 'promptGuidance', true, 'flex-none'),
    wfiInlineInput('SMEA', 'smea', true, 'flex-none'),
    wfiInlineInput('DYN', 'dyn', true, 'flex-none'),
    wfiInlineInput('샘플링', 'sampling', true, 'flex-none'),
    wfiInlineInput('노이즈 스케줄', 'noiseSchedule', true, 'flex-none'),
  ]),
  wfiInlineInput('바이브 설정', 'vibes', true, 'flex-none'),
  wfiInlineInput('시드', 'seed', true, 'flex-none'),
]);

export const SDInpaintDef = new WFDefBuilder('SDInpaint')
  .setTitle('인페인트')
  .setBackendType('image')
  .setI2I(true)
  .setPresetVars(SDInpaintPreset.build())
  .setSharedVars(new WFVarBuilder().build())
  .setEditor(SDInpaintUI)
  .setHandler(SDImageGenHandler)
  .build();

export function createInpaintPreset(image: string, mask: string, job: SDAbstractJob<string>): any {
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
