import * as React from 'react';
import { useContext, useEffect, useState } from 'react';
import {
  TextAreaWithUndo,
  NumberSelect,
  ToggleFloat,
  Collapsible,
  FileUploadBase64,
  DropdownSelect,
} from './UtilComponents';
import { Sampling } from '../main/imageGen';
import { PreSet, getDefaultPreset, sessionService } from './models';
import { Context, AppContext } from './App';
import { base64ToDataUri } from './BrushTool';
import { grayInput, primaryColor, roundButton } from './styles';
import { PromptEditTextArea } from './SceneEditor';
import { FaImage } from 'react-icons/fa';
import { FloatView } from './FloatView';

interface Props {
  setSelectedPreset: (preset: PreSet) => void;
  middlePromptMode: boolean;
  getMiddlePrompt?: () => string;
  onMiddlePromptChange?: (txt: string) => void;
}

const PreSetEditor: React.FC<Props> = (props: Props) => {
  const ctx = useContext(AppContext)!;
  const curSession = ctx.curSession!;
  const [_, rerender] = useState<{}>({});
  const [presetEditLock, setPresetEditLock] = useState(true);
  const updatePresets = () => {
    sessionService.markUpdated(curSession.name);
    rerender({});
  };
  const getPresetName = (preset: PreSet) => {
    return Object.keys(curSession.presets)[
      Object.values(curSession.presets).indexOf(preset)
    ];
  };
  const selectedPreset: PreSet =
    ctx.selectedPreset ?? Object.values(curSession.presets)[0];
  const frontPromptChange = (txt: string) => {
    selectedPreset.frontPrompt = txt;
    console.log(selectedPreset.frontPrompt);
    updatePresets();
  };
  const backPromptChange = (txt: string) => {
    selectedPreset.backPrompt = txt;
    updatePresets();
  };
  const ucPromptChange = (txt: string) => {
    selectedPreset.uc = txt;
    updatePresets();
  };
  const vibeChange = (vibe: string) => {
    selectedPreset.vibe = vibe;
    updatePresets();
  };
  useEffect(() => {
    props.setSelectedPreset(Object.values(curSession.presets)[0]);
    rerender({});
  }, [curSession]);


  const [isVibeImageShow, setIsVibeImageShow] = useState(false);
  const [samplerSetting, setSamplerSetting] = useState(false);
  const vibeImageShow = (
    <button className={`${roundButton} bg-gray-500 h-8`}>
      <FaImage size={18} />{' '}
    </button>
  );
  return (
    <div
      key={selectedPreset ? getPresetName(selectedPreset) : ''}
      className="p-3 flex flex-col h-full relative"
    >
      {props.middlePromptMode && (
        <span className="font-bold">프리셋 편집 잠금: {' '}<input type="checkbox" checked={presetEditLock} onChange={() => setPresetEditLock(!presetEditLock)}></input></span>
      )}
      {!props.middlePromptMode && (
        <p className="text-xl font-bold mb-3">이미지 생성 프리셋</p>
      )}
      {!props.middlePromptMode && (
      <div className="flex gap-2 pr-2">
        <DropdownSelect
          selectedOption={selectedPreset}
          menuPlacement="bottom"
          options={Object.entries(curSession.presets).map(([name, preset]) => ({
            label: name,
            value: preset,
          }))}
          onSelect={(opt) => {
            props.setSelectedPreset(opt.value);
          }}
        />
        <button
          className={`${roundButton} ${primaryColor} w-20`}
          onClick={() => {
            ctx.pushDialog({
              type: 'input-confirm',
              text: '프리셋 이름을 입력하세요.',
              callback: (name) => {
                if (!name) return;
                if (name && name in curSession.presets) {
                  ctx.pushMessage('중복되는 프리셋 이름입니다');
                }
                if (name) {
                  curSession.presets[name] = getDefaultPreset();
                  updatePresets();
                }
              },
            });
          }}
        >
          추가
        </button>
        <button
          className={`${roundButton} bg-red-500 w-20`}
          onClick={() => {
            if (Object.keys(curSession.presets).length <= 1) {
              ctx.pushMessage('프리셋은 최소 한 개 이상이어야 합니다');
              return;
            }
            ctx.pushDialog({
              type: 'confirm',
              text: '정말로 이 프리셋을 삭제하시겠습니까?',
              callback: () => {
                delete curSession.presets[getPresetName(selectedPreset)];
                props.setSelectedPreset(Object.values(curSession.presets)[0]);
                updatePresets();
              },
            });
          }}
        >
          삭제
        </button>
      </div>)}
      <div className="py-2">
        <b> 상위 프롬프트:</b>
      </div>
      <div className="flex-1 min-h-0">
        <PromptEditTextArea
          className="w-full h-full bg-gray-200"
          value={selectedPreset.frontPrompt}
          disabled={props.middlePromptMode && presetEditLock}
          onChange={frontPromptChange}
        ></PromptEditTextArea>
      </div>
      {props.middlePromptMode && ( <>
        <div className="py-2">
          <b> 중위 프롬프트 (이 씬에만 적용됨):</b>
        </div>
        <div className="flex-1 min-h-0">
          <PromptEditTextArea
            className="w-full h-full bg-gray-200"
            value={props.getMiddlePrompt ? props.getMiddlePrompt() : ''}
            onChange={(txt) => {
              if (props.onMiddlePromptChange) props.onMiddlePromptChange(txt);
            }}
          ></PromptEditTextArea>
        </div>
        </>
      )}
      <div className="py-2">
        <b> 하위 프롬프트:</b>
      </div>
      <div className="flex-1 min-h-0">
        <PromptEditTextArea
          className="w-full h-full bg-gray-200"
          value={selectedPreset.backPrompt}
          disabled={props.middlePromptMode && presetEditLock}
          onChange={backPromptChange}
        ></PromptEditTextArea>
      </div>
      <div className="py-2">
        <b> 네거티브 프롬프트:</b>
      </div>
      <div className="flex-1 min-h-0">
        <PromptEditTextArea
          className="w-full h-full bg-gray-200"
          value={selectedPreset.uc}
          disabled={props.middlePromptMode && presetEditLock}
          onChange={ucPromptChange}
        ></PromptEditTextArea>
      </div>
      {!samplerSetting &&
        <div className="flex-none">
      <div className="mt-auto pt-2 flex gap-2 items-center">
        <span className="font-bold flex-none">시드: </span>
        <input
          className={`w-full ${grayInput}`}
          disabled={props.middlePromptMode && presetEditLock}
          value={selectedPreset.seed ?? ''}
          onChange={(e) => {
            try {
              const num = parseInt(e.target.value);
              if (e.target.value === '') throw new Error('No seed');
              if (isNaN(num)) throw new Error('Invalid seed');
              if (!Number.isInteger(num))
                throw new Error('Seed must be an integer');
              if (num <= 0) throw new Error('Seed must be positive');
              selectedPreset.seed = num;
            } catch (e) {
              selectedPreset.seed = undefined;
            }
            updatePresets();
          }}
        />
      </div>
      <div className="mt-auto pt-2 flex gap-2 items-center">
        <span className="font-bold flex-none">바이브: </span>
        <div className="flex-1 overflow-hidden">
          <FileUploadBase64 disabled={props.middlePromptMode && presetEditLock} onFileSelect={vibeChange}></FileUploadBase64>
        </div>
        <span className="flex-none ml-auto">
          <button className={`${roundButton} bg-gray-500 h-8`} onClick={() => setIsVibeImageShow(!isVibeImageShow)}>
            보기
          </button>
          {isVibeImageShow && <FloatView priority={3} onEscape={() => setIsVibeImageShow(false)}>
            <img
              className="imageSmall"
              src={base64ToDataUri(selectedPreset.vibe)}
            />
          </FloatView>}
        </span>
      </div>
      <div className="mt-auto pt-2 flex gap-2 items-center">
        <button className={`${roundButton} bg-gray-500 h-8 w-full`} onClick={() => setSamplerSetting(true)}>
          샘플링 설정 열기
        </button>
      </div>
      </div>}
      {samplerSetting &&
       <div className="flex-none">
      <div className="mt-auto pt-2 flex gap-2 items-center">
        <span className="font-bold flex-none">샘플러 </span>
        <DropdownSelect
          selectedOption={selectedPreset.sampling}
          disabled={props.middlePromptMode && presetEditLock}
          menuPlacement="top"
          options={Object.values(Sampling).map((x) => ({ label: x, value: x }))}
          onSelect={(opt) => {
            selectedPreset.sampling = opt.value;
            updatePresets();
          }}
        />
      </div>
      <div className="mt-auto pt-2 flex gap-2 items-center pr-1">
        <span className="font-bold flex-none">SMEA: </span>
        <input type="checkbox" checked={!selectedPreset.smeaOff} onChange={(e) => {
          selectedPreset.smeaOff = !e.target.checked;
          updatePresets();
        }} />
        <span className="font-bold flex-none">DYN: </span>
        <input type="checkbox" checked={selectedPreset.dynOn} onChange={(e) => {
          selectedPreset.dynOn = e.target.checked;
          updatePresets();
        }} />
      </div>
      <div className="mt-auto pt-2 flex gap-2 items-center pr-1">
        <span className="font-bold flex-none">프롬프트 가이던스: </span>
        <span className="flex-none w-6">{selectedPreset.promptGuidance ?? 5}</span>
        <input
        className="flex-1"
          type="range"
          step="0.1"
          min="0"
          max="10"
          value={selectedPreset.promptGuidance ?? 5}
          onChange={(e) => {
            selectedPreset.promptGuidance = parseFloat(e.target.value);
            updatePresets();
          }}
        />
      </div>
      <div className="relative mt-auto pt-2 flex gap-2 items-center pr-1">
        <span className="font-bold flex-none">스탭: </span>
        {selectedPreset!.steps && selectedPreset!.steps > 28 &&<span className="absolute text-white bg-red-700 right-0 bottom-16 px-4">Anlas가 소모되는 세팅입니다 (유료임)</span>}
        <span className="flex-none w-6">{selectedPreset!.steps ?? 28}</span>
        <input
        className="flex-1"
          type="range"
          step="1"
          min="1"
          max="50"
          value={selectedPreset.steps ?? 28}
          onChange={(e) => {
            selectedPreset.steps = parseInt(e.target.value);
            updatePresets();
          }}
        />
      </div>
      <div className="mt-auto pt-2 flex gap-2 items-center">
        <button className={`${roundButton} bg-gray-500 h-8 w-full`} onClick={() => setSamplerSetting(false)}>
          샘플링 설정 닫기
        </button>
      </div>
      </div>
      }
    </div>
  );
};

export default PreSetEditor;
