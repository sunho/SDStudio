import * as React from 'react';
import { useContext, useEffect, useState } from 'react';
import {
  TextAreaWithUndo,
  NumberSelect,
  Collapsible,
  FileUploadBase64,
  DropdownSelect,
} from './UtilComponents';
import { Sampling } from '../main/imageGen';
import { PreSet, getDefaultPreset, sessionService } from './models';
import { Context, AppContext } from './App';
import { base64ToDataUri } from './BrushTool';
import { grayInput, grayLabel, primaryColor, roundButton } from './styles';
import PromptEditTextArea from './PromptEditTextArea';
import { FaImage, FaTrash } from 'react-icons/fa';
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
    if (!vibe) return;
    selectedPreset.vibes.push({ image: vibe, info: 1.0, strength: 0.6 });
    updatePresets();
  };
  useEffect(() => {
    props.setSelectedPreset(Object.values(curSession.presets)[0]);
    rerender({});
  }, [curSession]);

  const [displayVibe, setDisplayVibe] = useState<string|undefined>(undefined);
  const [samplerSetting, setSamplerSetting] = useState(false);
  const [vibeSetting, setVibeSetting] = useState(false);

  return (
    <div
      key={selectedPreset ? getPresetName(selectedPreset) : ''}
      className="p-3 flex flex-col h-full relative"
    >
      {displayVibe && <FloatView priority={3} onEscape={() => setDisplayVibe(undefined)}>
        <img
          className="imageSmall"
          src={base64ToDataUri(displayVibe)}
        />
      </FloatView>}
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
      <div className={"pt-2 pb-1 " + grayLabel}>
        상위 프롬프트
      </div>
      <div className="flex-1 min-h-0">
        <PromptEditTextArea
          value={selectedPreset.frontPrompt}
          disabled={props.middlePromptMode && presetEditLock}
          onChange={frontPromptChange}
        ></PromptEditTextArea>
      </div>
      {props.middlePromptMode && ( <>
        <div className="pt-2 pb-1">
          <b> 중위 프롬프트 (이 씬에만 적용됨)</b>
        </div>
        <div className="flex-1 min-h-0">
          <PromptEditTextArea
            value={props.getMiddlePrompt ? props.getMiddlePrompt() : ''}
            onChange={(txt) => {
              if (props.onMiddlePromptChange) props.onMiddlePromptChange(txt);
            }}
          ></PromptEditTextArea>
        </div>
        </>
      )}

      <div className={"pt-2 pb-1 " + grayLabel}>
        하위 프롬프트
      </div>
      <div className="flex-1 min-h-0">
        <PromptEditTextArea
          value={selectedPreset.backPrompt}
          disabled={props.middlePromptMode && presetEditLock}
          onChange={backPromptChange}
        ></PromptEditTextArea>
      </div>

      <div className={"pt-2 pb-1 " + grayLabel}>
        네거티브 프롬프트
      </div>
      <div className="flex-1 min-h-0">
        <PromptEditTextArea
          value={selectedPreset.uc}
          disabled={props.middlePromptMode && presetEditLock}
          onChange={ucPromptChange}
        ></PromptEditTextArea>
      </div>
      {!samplerSetting && !vibeSetting &&
        <div className="flex-none mt-3">
      <div className="mt-auto flex gap-2 items-center">
        <span className={"flex-none " + grayLabel}>시드: </span>
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
      <div className="flex-none mt-3 flex gap-2 items-center">
        {selectedPreset.vibes.length === 0 &&
        <button className={`${roundButton} bg-gray-500 h-8 w-full flex`} onClick={() => setVibeSetting(true)}>
          <div className="flex-1">바이브 이미지 설정 열기</div>
        </button>
        }
        {selectedPreset.vibes.length > 0 &&
        <div className="w-full flex items-center">
          <div className={"flex-none mr-2 " + grayLabel}>바이브 설정:</div>
          <img src={base64ToDataUri(selectedPreset.vibes[0].image)} className="flex-1 h-14 rounded-xl object-cover cursor-pointer hover:brightness-95 active:brightness-90" onClick={()=>{setVibeSetting(true)}}/>
        </div>
        }
      </div>
      <div className="flex-none mt-3 flex gap-2 items-center">
        <button className={`${roundButton} bg-gray-500 h-8 w-full`} onClick={() => setSamplerSetting(true)}>
          샘플링 설정 열기
        </button>
      </div>
      </div>}
      {samplerSetting &&
       <div className="flex-none">
      <div className="mt-auto pt-2 flex gap-2 items-center">
        <span className={"flex-none " + grayLabel}>샘플러: </span>
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
        <span className={"flex-none " + grayLabel}>SMEA: </span>
        <input  type="checkbox" checked={!selectedPreset.smeaOff} onChange={(e) => {
          selectedPreset.smeaOff = !e.target.checked;
          updatePresets();
        }} disabled={props.middlePromptMode && presetEditLock}
            />
        <span className={"flex-none " + grayLabel}>DYN: </span>
        <input type="checkbox" checked={selectedPreset.dynOn} onChange={(e) => {
          selectedPreset.dynOn = e.target.checked;
          updatePresets();
        }}
              disabled={props.middlePromptMode && presetEditLock}
            />
      </div>
      <div className="mt-auto pt-2 flex gap-2 items-center pr-1">
        <span className={"flex-none " + grayLabel}>프롬프트 가이던스: </span>
        <span className="bg-gray-100 p-1 flex-none w-8 text-center">{selectedPreset.promptGuidance ?? 5}</span>
        <input
        className="flex-1"
          type="range"
          step="0.1"
          min="0"
          max="10"
          disabled={props.middlePromptMode && presetEditLock}
          value={selectedPreset.promptGuidance ?? 5}
          onChange={(e) => {
            selectedPreset.promptGuidance = parseFloat(e.target.value);
            updatePresets();
          }}
        />
      </div>
      <div className="relative mt-auto pt-2 flex gap-2 items-center pr-1">
        <span className={"flex-none " + grayLabel}>스탭: </span>
        {selectedPreset!.steps && selectedPreset!.steps > 28 &&<span className="absolute text-white bg-red-700 right-0 bottom-16 px-4">Anlas가 소모되는 세팅입니다 (유료임)</span>}
        <span className="bg-gray-100 p-1 flex-none w-8 text-center">{selectedPreset.steps ?? 28}</span>
        <input
        className="flex-1"
          type="range"
          step="1"
          min="1"
          max="50"
          disabled={props.middlePromptMode && presetEditLock}
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
      {vibeSetting &&
       <div className="flex-none h-2/3 flex flex-col overflow-hidden">
          <div className="flex-1 overflow-hidden">
            <div className="h-full overflow-auto">
            {selectedPreset!.vibes.map(vibe => (
              <div className="border border-gray-300 mt-2 p-2 flex gap-2 items-begin">
                <img src={base64ToDataUri(vibe.image)} className="flex-none w-28 h-28 object-cover"/>
                <div className="flex gap-2 flex-col w-full">
                  <div className="flex items-cente">
                    <div className={"w-36 " + grayLabel}>정보 추출률 (IS):</div>
                    <input className="flex-1" type="range" step="0.01" min="0" max="1" value={vibe.info} onChange={(e) => {
                      vibe.info = parseFloat(e.target.value);
                      updatePresets();
                    }}
                    disabled={props.middlePromptMode && presetEditLock}
                      />
                    <div className="w-11 text-lg text-center">{vibe.info}</div>
                  </div>
                  <div className="flex items-center">
                    <div className={"w-36 flex-none " + grayLabel}>레퍼런스 강도 (RS):</div>
                    <input className="flex-1" type="range" step="0.01" min="0" max="1" value={vibe.strength} onChange={(e) => {
                      vibe.strength = parseFloat(e.target.value);
                      updatePresets();
                    }}
                    disabled={props.middlePromptMode && presetEditLock}
                    />
                    <div className="w-11 text-lg text-center">{vibe.strength}</div>
                  </div>
                  <div className="flex-none flex ml-auto mt-auto">
                    <button className={`${roundButton} h-8 px-8 ml-auto ` + ((props.middlePromptMode && presetEditLock) ? 'bg-gray-400' : 'bg-red-500')} onClick={() => {
                      if (props.middlePromptMode && presetEditLock) return;
                      selectedPreset.vibes = selectedPreset.vibes.filter(x => x !== vibe);
                      updatePresets();
                    }}>
                    <FaTrash/>
                    </button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      <div className="flex-none mt-auto pt-2 flex gap-2 items-center">
        <FileUploadBase64 notext disabled={props.middlePromptMode && presetEditLock} onFileSelect={vibeChange}></FileUploadBase64>
        <button className={`${roundButton} bg-gray-500 h-8 w-full`} onClick={() => setVibeSetting(false)}>
          바이브 설정 닫기
        </button>
      </div>
      </div>
      }
    </div>
  );
};

export default PreSetEditor;
