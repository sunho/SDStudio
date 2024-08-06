import { NoiseSchedule, Sampling } from "../../backends/imageGen";
import { WFDefBuilder, wfiGroup, wfiInlineInput, wfiPresetSelect, wfiPush, wfiStack, WFVarBuilder } from "./WorkFlow";
import { Session, GenericScene, SDJob, Scene } from "../types";
import { createPrompts } from "../PromptService";
import { imageService, taskQueueService } from "..";
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
  .addNoiseScheduleVar('noiseSchedule', NoiseSchedule.Native)

const SDImageGenShared = new WFVarBuilder()
  .addVibeSetVar('vibes')
  .addNullIntVar('seed')

const SDImageGenUI = wfiStack([
  wfiPresetSelect(),
  wfiInlineInput('상위 프롬프트', 'frontPrompt', true, 'flex-1'),
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
])

const SDImageGenHandler = async (session: Session, scene: GenericScene, preset: any, shared: any, samples: number, onComplete?: (img: string) => string) => {
  const prompts = await createPrompts(session, preset, shared, scene as Scene);
  for (const prompt of prompts) {
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
      outputPath: imageService.getOutputDir(session, scene)
    };
    taskQueueService.addTask(param, samples);
  }
}

export const SDImageGenDef = new WFDefBuilder('SDImageGen')
  .setTitle('이미지 생성')
  .setBackendType('image')
  .setI2I(false)
  .setPresetVars(SDImageGenPreset.build())
  .setSharedVars(SDImageGenShared.build())
  .setEditor(SDImageGenUI)
  .setHandler(SDImageGenHandler)
  .build()
