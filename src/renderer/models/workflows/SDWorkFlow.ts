import { NoiseSchedule, Sampling } from "../../backends/imageGen";
import { WFDefBuilder, wfiGroup, wfiInlineInput, wfiStack, WFVarBuilder } from "./WorkFlow";

const SDImageGenPreset = new WFVarBuilder()
  .addIntVar('cfgRescale', 0, 1, 0.01, 0)
  .addIntVar('steps', 1, 50, 28, 1)
  .addIntVar('promptGuidance', 0, 10, 5, 0.1)
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
  wfiInlineInput('상위 프롬프트', 'frontPrompt', true, 'flex-1'),
  wfiInlineInput('하위 프롬프트', 'backPrompt', true, 'flex-1'),
  wfiInlineInput('네거티브 프롬프트', 'uc', true, 'flex-1'),
  wfiInlineInput('시드', 'seed', false, 'flex-none'),
  wfiGroup('샘플링 설정', [
    wfiInlineInput('SMEA', 'smea', true, 'flex-none'),
    wfiInlineInput('DYN', 'dyn', true, 'flex-none'),
    wfiInlineInput('샘플링', 'sampling', true, 'flex-none'),
    wfiInlineInput('노이즈 스케줄', 'noiseSchedule', true, 'flex-none'),
  ]),
  wfiInlineInput('바이브 설정', 'vibes', false, 'flex-none'),
])

const SDImageGenHandler = async () => {

}

const SDImageGenDef = new WFDefBuilder('SDImageGen')
  .setBackendType('image')
  .setI2I(false)
  .setPresetVars(SDImageGenPreset.build())
  .setSharedVars(SDImageGenShared.build())
  .setEditor(SDImageGenUI)
  .setHandler(SDImageGenHandler)
  .build()
