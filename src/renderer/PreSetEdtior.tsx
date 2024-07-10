import * as React from 'react';
import { useContext, useEffect, useState } from 'react';
import {
  TextAreaWithUndo,
  NumberSelect,
  Collapsible,
  FileUploadBase64,
  DropdownSelect,
} from './UtilComponents';
import { Sampling } from './backends/imageGen';
import { CommonSetup, NAIPreSet, PreSet, backend, imageService, sessionService } from './models';
import { Context, AppContext } from './App';
import { base64ToDataUri } from './BrushTool';
import { grayInput, grayLabel, primaryColor, roundButton } from './styles';
import PromptEditTextArea from './PromptEditTextArea';
import { FaImage, FaTrash } from 'react-icons/fa';
import { FloatView } from './FloatView';
import { v4 } from 'uuid';

export const defaultFPrompt = `1girl, {artist:ixy}`;
export const defaultBPrompt = `{best quality, amazing quality, very aesthetic, highres, incredibly absurdres}`;
export const defaultUC = `worst quality, bad quality, displeasing, very displeasing, lowres, bad anatomy, bad perspective, bad proportions, bad aspect ratio, bad face, long face, bad teeth, bad neck, long neck, bad arm, bad hands, bad ass, bad leg, bad feet, bad reflection, bad shadow, bad link, bad source, wrong hand, wrong feet, missing limb, missing eye, missing tooth, missing ear, missing finger, extra faces, extra eyes, extra eyebrows, extra mouth, extra tongue, extra teeth, extra ears, extra breasts, extra arms, extra hands, extra legs, extra digits, fewer digits, cropped head, cropped torso, cropped shoulders, cropped arms, cropped legs, mutation, deformed, disfigured, unfinished, chromatic aberration, text, error, jpeg artifacts, watermark, scan, scan artifacts`;

export function getDefaultPreset(): NAIPreSet {
  return {
    name: '',
    type: 'preset',
    frontPrompt: defaultFPrompt,
    backPrompt: defaultBPrompt,
    uc: defaultUC,
    sampling: Sampling.KEulerAncestral,
    promptGuidance: 5.0,
    steps: 28,
  };
}

export function useCommonSetup(): CommonSetup {
  const { curSession, selectedPreset } = useContext(AppContext)!;
  return {
    type: curSession!.presetMode,
    preset: selectedPreset!,
    shared: curSession!.presetShareds[curSession!.presetMode]!
   }
}

const PreSetSelect = ({ selectedPreset, setSelectedPreset, onChange }: { selectedPreset: PreSet; setSelectedPreset: (preset: PreSet) => void, onChange: () => void; }) => {
  const { curSession, pushDialog, pushMessage } = useContext(AppContext)!;
  const presets = curSession!.presets.filter(x=>x.type === 'preset');
  return <div className="w-full h-full">
    <p className="text-xl font-bold mb-3">이미지 생성 프리셋</p>
    <div className="flex gap-2 pr-2">
      <DropdownSelect
        selectedOption={selectedPreset}
        menuPlacement="bottom"
        options={presets.map(x => ({
          label: x.name,
          value: x,
        }))}
        onSelect={(opt) => {
          setSelectedPreset(opt.value);
        }}
      />
      <button
        className={`${roundButton} ${primaryColor} w-20`}
        onClick={() => {
          pushDialog({
            type: 'input-confirm',
            text: '프리셋 이름을 입력하세요.',
            callback: (name) => {
              if (!name) return;
              if (name && presets.find(x => x.name === name)) {
                pushMessage('중복되는 프리셋 이름입니다');
              }
              if (name) {
                const newPreset = getDefaultPreset();
                newPreset.name = name;
                curSession!.presets.push(newPreset);
                setSelectedPreset(newPreset);
                sessionService.markUpdated(curSession!.name);
                onChange();
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
          if (length <= 1) {
            pushMessage('프리셋은 최소 한 개 이상이어야 합니다');
            return;
          }
          pushDialog({
            type: 'confirm',
            text: '정말로 이 프리셋을 삭제하시겠습니까?',
            callback: () => {
              curSession!.presets = curSession!.presets.filter(x => x !== selectedPreset);
              setSelectedPreset(presets.find(x => x !== selectedPreset)!);
              sessionService.markUpdated(curSession!.name);
              onChange();
            },
          });
        }}
      >
        삭제
      </button>
    </div>
  </div>
}

const VibeImage = ({ path, onClick, className }: { path: string; onClick?: () => void; className: string}) => {
  const [image, setImage] = useState<string | null>(null);
  useEffect(() => {
    (async ()=>{
      const data = await imageService.fetchImage(path);
      setImage(data);
    })();
  }, [path]);
  return (
    <>
    {image && <img
      className={className}
      src={image}
      onClick={onClick}
    />}
    {!image && <div className={className} onClick={onClick}></div>}
    </>
  );
}

interface VibeEditorProps {
  closeEditor: () => void;
  disabled: boolean;
}

export const VibeEditor = ({ disabled, closeEditor }: VibeEditorProps) => {
  const { curSession } = useContext(AppContext)!;
  const commonSetup = useCommonSetup();
  const [_, rerender] = useState<{}>({});
  const updatePresets = () => {
    sessionService.markUpdated(curSession!.name);
    rerender({});
  }
  const vibeChange = async (vibe: string) => {
    if (!vibe) return;
    const path = imageService.getVibesDir(curSession!) + '/' + v4() + '.png';
    await backend.writeDataFile(path, vibe);
    commonSetup.shared.vibes.push({ path: path, info: 1.0, strength: 0.6 });
    updatePresets();
  };

  return <div className="w-full h-full overflow-hidden">
      <div className="flex-1 overflow-hidden">
        <div className="h-full overflow-auto">
        {commonSetup.shared.vibes.map(vibe => (
          <div className="border border-gray-300 mt-2 p-2 flex gap-2 items-begin">
            <VibeImage path={vibe.path} className="flex-none w-28 h-28 object-cover"/>
            <div className="flex flex-col gap-2 w-full">
              <div className="flex w-full items-center md:flex-row flex-col">
                <div className={"whitespace-nowrap flex-none mr-auto md:mr-0" + grayLabel}>정보 추출률 (IS):</div>
                <div className="flex flex-1 md:w-auto w-full gap-1">
                  <input className="flex-1" type="range" step="0.01" min="0" max="1" value={vibe.info} onChange={(e) => {
                    vibe.info = parseFloat(e.target.value);
                    updatePresets();
                  }}
                  disabled={disabled}
                    />
                  <div className="w-11 flex-none text-lg text-center">{vibe.info}</div>
                </div>
              </div>
              <div className="flex w-full md:flex-row flex-col items-center">
                <div className={"whitepace-nowrap flex-none mr-auto md:mr-0" + grayLabel}>레퍼런스 강도 (RS):</div>
                <div className="flex flex-1 md:w-auto w-full gap-1">
                  <input className="flex-1" type="range" step="0.01" min="0" max="1" value={vibe.strength} onChange={(e) => {
                    vibe.strength = parseFloat(e.target.value);
                    updatePresets();
                  }}
                  disabled={disabled}
                  />
                  <div className="w-11 flex-none text-lg text-center">{vibe.strength}</div>
                </div>
              </div>
              <div className="flex-none flex ml-auto mt-auto">
                <button className={`${roundButton} h-8 px-8 ml-auto ` + ((disabled) ? 'bg-gray-400' : 'bg-red-500')} onClick={() => {
                  if (disabled) return;
                  commonSetup.shared.vibes = commonSetup.shared.vibes.filter(x => x !== vibe);
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
      <FileUploadBase64 notext disabled={disabled} onFileSelect={vibeChange}></FileUploadBase64>
      <button className={`${roundButton} bg-gray-500 h-8 w-full`} onClick={closeEditor}>
        바이브 설정 닫기
      </button>
    </div>
  </div>
}

export const VibeButton = ({ onClick }: { onClick: () => void }) => {
  const { curSession } = useContext(AppContext)!;
  const commonSetup = useCommonSetup();

  return <>
    {commonSetup.shared.vibes.length === 0 &&
    <button className={`${roundButton} bg-gray-500 h-8 w-full flex`} onClick={onClick}>
      <div className="flex-1">바이브 이미지 설정 열기</div>
    </button>
    }
    {commonSetup.shared.vibes.length > 0 &&
    <div className="w-full flex items-center">
      <div className={"flex-none mr-2 " + grayLabel}>바이브 설정:</div>
      <VibeImage path={commonSetup.shared.vibes[0].path} className="flex-1 h-14 rounded-xl object-cover cursor-pointer hover:brightness-95 active:brightness-90" onClick={onClick}/>
    </div>
    }
  </>
}

interface Props {
  selectedPreset: PreSet;
  setSelectedPreset: (preset: PreSet) => void;
  middlePromptMode: boolean;
  getMiddlePrompt?: () => string;
  onMiddlePromptChange?: (txt: string) => void;
}

const PreSetEditor: React.FC<Props> = ({ selectedPreset, setSelectedPreset, middlePromptMode, getMiddlePrompt, onMiddlePromptChange }) => {
  const ctx = useContext(AppContext)!;
  const curSession = ctx.curSession!;
  const [_, rerender] = useState<{}>({});
  const [presetEditLock, setPresetEditLock] = useState(true);
  const updatePresets = () => {
    sessionService.markUpdated(curSession.name);
    rerender({});
  };
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

  useEffect(() => {
    rerender({});
  }, [selectedPreset])

  const [samplerSetting, setSamplerSetting] = useState(false);
  const [vibeSetting, setVibeSetting] = useState(false);
  const commonSetup = useCommonSetup();

  return (
    <div
      key={selectedPreset.name}
      className="p-3 flex flex-col h-full relative"
    >
      {!middlePromptMode && <div className="flex-none z-10">
      <PreSetSelect selectedPreset={selectedPreset} setSelectedPreset={(preset) => {
        setSelectedPreset(preset);
      }} onChange={updatePresets}
      /></div>}

      {middlePromptMode && (
        <span className="font-bold">프리셋 편집 잠금: {' '}<input type="checkbox" checked={presetEditLock} onChange={() => setPresetEditLock(!presetEditLock)}></input></span>
      )}
      <div className={"pt-2 pb-1 " + grayLabel}>
        상위 프롬프트
      </div>
      <div className="flex-1 min-h-0">
        <PromptEditTextArea
          value={selectedPreset.frontPrompt}
          disabled={middlePromptMode && presetEditLock}
          onChange={frontPromptChange}
        ></PromptEditTextArea>
      </div>
      {middlePromptMode && ( <>
        <div className="pt-2 pb-1">
          <b> 중위 프롬프트 (이 씬에만 적용됨)</b>
        </div>
        <div className="flex-1 min-h-0">
          <PromptEditTextArea
            value={getMiddlePrompt ? getMiddlePrompt() : ''}
            onChange={(txt) => {
              if (onMiddlePromptChange) onMiddlePromptChange(txt);
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
          disabled={middlePromptMode && presetEditLock}
          onChange={backPromptChange}
        ></PromptEditTextArea>
      </div>

      <div className={"pt-2 pb-1 " + grayLabel}>
        네거티브 프롬프트
      </div>
      <div className="flex-1 min-h-0">
        <PromptEditTextArea
          value={selectedPreset.uc}
          disabled={middlePromptMode && presetEditLock}
          onChange={ucPromptChange}
        ></PromptEditTextArea>
      </div>
      {!samplerSetting && !vibeSetting &&
        <div className="flex-none mt-3">
      <div className="mt-auto flex gap-2 items-center">
        <span className={"flex-none " + grayLabel}>시드: </span>
        <input
          className={`w-full ${grayInput}`}
          disabled={middlePromptMode && presetEditLock}
          value={commonSetup.shared.seed ?? ''}
          onChange={(e) => {
            try {
              const num = parseInt(e.target.value);
              if (e.target.value === '') throw new Error('No seed');
              if (isNaN(num)) throw new Error('Invalid seed');
              if (!Number.isInteger(num))
                throw new Error('Seed must be an integer');
              if (num <= 0) throw new Error('Seed must be positive');
              commonSetup.shared.seed = num;
            } catch (e) {
              commonSetup.shared.seed = undefined;
            }
            updatePresets();
          }}
        />
      </div>
      <div className="flex-none mt-3 flex gap-2 items-center">
        <VibeButton onClick={()=>setVibeSetting(true)}/>
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
          disabled={middlePromptMode && presetEditLock}
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
        }} disabled={middlePromptMode && presetEditLock}
            />
        <span className={"flex-none " + grayLabel}>DYN: </span>
        <input type="checkbox" checked={selectedPreset.dynOn} onChange={(e) => {
          selectedPreset.dynOn = e.target.checked;
          updatePresets();
        }}
              disabled={middlePromptMode && presetEditLock}
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
          disabled={middlePromptMode && presetEditLock}
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
          disabled={middlePromptMode && presetEditLock}
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
        <VibeEditor closeEditor={() => setVibeSetting(false)} disabled={middlePromptMode && presetEditLock}/>
      </div>
      }
    </div>
  );
};

export default PreSetEditor;
