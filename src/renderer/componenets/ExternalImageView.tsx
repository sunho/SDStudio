import { observer } from "mobx-react-lite";
import { useEffect, useState } from "react";
import { SDAbstractJob } from "../models/types";
import { base64ToDataUri } from "./BrushTool";
import { PromptHighlighter } from "./SceneEditor";
import { extractPromptDataFromBase64 } from "../models/util";
import { appState } from "../models/AppService";
import { workFlowService } from "../models";
import { Sampling } from "../backends/imageGen";

interface ExternalImageViewProps {
  image: string;
  onClose: () => void;
}
export const ExternalImageView = observer(
  ({
    image,
    onClose,
  }: ExternalImageViewProps) => {
    const [showPrompt, setShowPrompt] = useState(false);
    const [job, setJob] = useState<SDAbstractJob<string>|undefined>(undefined);
    useEffect(() => {
      (async ()=>{
        if (!image) return;
        const newJob = await extractPromptDataFromBase64(image);
        if (!newJob) return;
        newJob.prompt = newJob.prompt ?? '';
        newJob.uc = newJob.uc ?? '';
        setJob(newJob);
      })();
    },[image]);
    const importPreset = async () => {
      if (!job) {
        appState.pushDialog({
          type: 'yes-only',
          text: '이미지에서 프롬프트 정보를 추출할 수 없습니다.',
        });
        return;
      }
      const opt = await appState.pushDialogAsync({
        type: 'select',
        text: '사전 설정 종류를 선택해주세요.',
        items: [ {
            text: '일반 사전 설정으로 임포트',
            value: 'normal',
          },
          {
            text: '이지 모드 그림체로 임포트',
            value: 'easy',
          }
        ],
      });
      if (!opt) return;
      let preset = workFlowService.buildPreset('SDImageGen');
      if (opt === 'easy') {
        preset = workFlowService.buildPreset('SDImageGenEasy');
      }
      preset.name = 'external image';
      preset.frontPrompt = job.prompt ?? '';
      preset.backPrompt = '';
      preset.uc = job.uc ?? '';
      preset.smea = job.smea ?? false;
      preset.dyn = job.dyn ?? false;
      preset.sampling = job.sampling ?? Sampling.KEulerAncestral;
      preset.steps = job.steps ?? 28;
      preset.noiseSchedule = job.noiseSchedule ?? 'native';
      preset.promptGuidance = job.promptGuidance ?? 5;
      preset.cfgRescale =  job.cfgRescale ?? 0;
      appState.curSession!.addPreset(preset);
      appState.curSession!.selectedWorkflow = {
        workflowType: preset.type,
        presetName: preset.name
      };
      onClose();
    };
    return (
      <div className="z-10 bg-white dark:bg-slate-900 w-full h-full flex overflow-hidden flex-col md:flex-row">
        <div className="flex-none md:w-1/3 p-2 md:p-4">
          <div className="flex gap-2 md:gap-3 mb-2 md:mb-6 flex-wrap w-full">
            <button
              className={`round-button back-sky`}
              onClick={() => {
                importPreset();
              }}
            >
              사전설정으로 임포트
            </button>
          </div>
          <button
            className={`round-button back-gray md:hidden`}
            onClick={() => setShowPrompt(!showPrompt)}
          >
            {!showPrompt ? '자세한 정보 보기' : '자세한 정보 숨기기'}
          </button>
          <div
            className={
              'mt-2 md:mt-0 md:block ' + (showPrompt ? 'block' : 'hidden')
            }
          >
            {job && <>
            <div className="w-full mb-2">
              <div className="gray-label">프롬프트 </div>
              <PromptHighlighter
                text={job.prompt}
                className="w-full h-24 overflow-auto"
              />
            </div>
            <div className="w-full mb-2">
              <div className="gray-label">네거티브 프롬프트 </div>
              <PromptHighlighter
                text={job.uc}
                className="w-full h-24 overflow-auto"
              />
            </div>
            <div className="w-full mb-2 text-sub">
              <span className="gray-label">시드: </span>
              {job.seed}
            </div>
            <div className="w-full mb-2 text-sub">
              <span className="gray-label">프롬프트 가이던스: </span>
              {job.promptGuidance}
            </div>
            <div className="w-full mb-2 text-sub">
              <span className="gray-label">샘플러: </span>
              {job.sampling}
            </div>
            <div className="w-full mb-2 text-sub">
              <span className="gray-label">스텝: </span>
              {job.steps}
            </div>
            <div className="w-full mb-2 text-sub">
              <span className="gray-label">노이즈 스케줄: </span>
              {job.noiseSchedule}
            </div>
            <div className="w-full mb-2 text-sub">
              <span className="gray-label">CFG 리스케일: </span>
              {job.cfgRescale}
            </div>
            <div className="w-full mb-2 text-sub">
              <span className="gray-label">SMEA: </span>
              {job.smea ? 'O' : 'X'}
            </div>
            <div className="w-full mb-2 text-sub">
              <span className="gray-label">DYN: </span>
              {job.dyn ? 'O' : 'X'}
            </div>
            </>}
          </div>
        </div>
        <div className="flex-1 overflow-hidden">
          {image && <img
            src={base64ToDataUri(image)}
            draggable={false}
            className="w-full h-full object-contain bg-checkboard"
          />}
        </div>
      </div>
    );
  },
);
