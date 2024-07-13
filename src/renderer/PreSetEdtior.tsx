import * as React from 'react';
import { useContext, useEffect, useState } from 'react';
import {
  TextAreaWithUndo,
  NumberSelect,
  Collapsible,
  FileUploadBase64,
  DropdownSelect,
} from './UtilComponents';
import { Resolution, Sampling } from './backends/imageGen';
import { CommonSetup, ContextMenuType, NAIPreSet, NAIStylePreSet, NAIStylePreSetShared, PreSet, PreSetMode, PromptNode, backend, getDefaultPreset, getDefaultStylePreset, imageService, promptService, queueDummyPrompt, queueScenePrompt, sessionService, taskQueueService, toPARR } from './models';
import { Context, AppContext } from './App';
import { base64ToDataUri } from './BrushTool';
import { grayInput, grayLabel, primaryColor, roundButton } from './styles';
import PromptEditTextArea from './PromptEditTextArea';
import { FaImage, FaPlus, FaTrash } from 'react-icons/fa';
import { FloatView } from './FloatView';
import { v4 } from 'uuid';
import { BigPromptEditor } from './SceneEditor';
import { useContextMenu } from 'react-contexify';

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
    <div className="flex items-center mb-3">
      <p className="text-xl font-bold ">이미지 생성 프리셋</p>
    <button className={`${roundButton} bg-gray-400 ml-auto text-sm h-8 `} onClick={() => {
      curSession!.presetMode = 'style';
      setSelectedPreset(curSession!.presets.filter(x=>x.type==='style')[0]);
      sessionService.markUpdated(curSession!.name);
      }}>이지모드</button>
      </div>

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
      const data = await imageService.fetchImageSmall(path, 400);
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

const EditorField = ({ label, full, children, bold }: { label: string; children: React.ReactNode; full: boolean; bold?: boolean; }) => {
  return <>
    <div className={"pt-2 pb-1 " + grayLabel}>
      {bold ? <b>{label}</b> : label}
    </div>
    <div className={full ? "flex-1 min-h-0" : "flex-none mt-3"}>
      {children}
    </div>
  </>
};

const InlineEditorField = ({ label, children }: { label: string; children: React.ReactNode; }) => {
  return <div className="flex gap-2 items-center">
    <span className={"flex-none " + grayLabel}>{label}:</span>
    {children}
  </div>
}

const NAIPreSetEditor: React.FC<Props> = ({ selectedPreset, setSelectedPreset, middlePromptMode, getMiddlePrompt, onMiddlePromptChange, styleEditMode }) => {
  const ctx = useContext(AppContext)!;
  const curSession = ctx.curSession!;
  const [_, rerender] = useState<{}>({});
  const [presetEditLock, setPresetEditLock] = useState(!styleEditMode);
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
      {!styleEditMode && middlePromptMode &&
      <InlineEditorField label="프리셋 편집 잠금">
        <input type="checkbox" checked={presetEditLock} onChange={() => setPresetEditLock(!presetEditLock)}></input>
      </InlineEditorField>}
      <EditorField label="상위 프롬프트" full={true}>
        <PromptEditTextArea
          value={selectedPreset.frontPrompt}
          disabled={middlePromptMode && presetEditLock}
          onChange={frontPromptChange}
        ></PromptEditTextArea>
      </EditorField>
      {middlePromptMode &&
        <EditorField label="중위 프롬프트 (이 씬에만 적용됨)" full={true} bold>
          <PromptEditTextArea
            value={getMiddlePrompt ? getMiddlePrompt() : ''}
            onChange={(txt) => {
              if (onMiddlePromptChange) onMiddlePromptChange(txt);
            }}
          ></PromptEditTextArea>
        </EditorField>
      }
      <EditorField label="하위 프롬프트" full={true}>
        <PromptEditTextArea
          value={selectedPreset.backPrompt}
          disabled={middlePromptMode && presetEditLock}
          onChange={backPromptChange}
        ></PromptEditTextArea>
      </EditorField>
      <EditorField label="네거티브 프롬프트" full={true}>
        <PromptEditTextArea
          value={selectedPreset.uc}
          disabled={middlePromptMode && presetEditLock}
          onChange={ucPromptChange}
        ></PromptEditTextArea>
      </EditorField>
      {!samplerSetting && !vibeSetting && <div className="flex-none mt-3">
      {!styleEditMode && <div className="mt-auto flex gap-2 items-center">
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
      </div>}
      {!styleEditMode && <div className="flex-none mt-3 flex gap-2 items-center">
        <VibeButton onClick={()=>setVibeSetting(true)}/>
      </div>}
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

interface StyleEditorProps {
  selectedPreset?: NAIStylePreSet;
  onClose: () => void;
}

const StyleEditor: React.FC<StyleEditorProps> = ({ selectedPreset, onClose }) => {
  const { curSession, pushMessage } = useContext(AppContext)!;
  const [_,rerender] = useState<{}>({});
  const prompt = React.useRef<string>('');
  const presetRef = React.useRef<NAIStylePreSet>(selectedPreset ?? getDefaultStylePreset());
  const getPrompt = () => prompt.current;
  const setPrompt = (txt: string) => {
    prompt.current = txt;
  }
  const queueprompt = (middle: string, callback: (path: string) => void) => {
    try {
      const cur = toPARR(presetRef.current.frontPrompt).concat(toPARR(middle)).concat(toPARR(presetRef.current.backPrompt));
      const promptNode: PromptNode = {
        type: 'group',
        children: [],
      }
      for (const word of cur) {
        promptNode.children.push(promptService.parseWord(word));
      }
      queueDummyPrompt(curSession!, presetRef.current, '/tmp', promptNode, Resolution.Portrait, callback);
      taskQueueService.run();
    } catch (e: any) {
      pushMessage(e.message);
      return;
    }
  }
  const setMainImage = async (path: string) => {
    const newPath = imageService.getVibesDir(curSession!) + '/' + v4() + '.png';
    await backend.copyFile(path, newPath);
    presetRef.current.profile = newPath.split('/').pop()!;
  };
  return <div className="flex flex-col h-full">
    <div className="grow-0 pt-2 px-3 flex gap-3 items-center text-nowrap flex-wrap mb-2 md:mb-0">
      <div className="flex items-center gap-2">
      <label>그림체 이름:</label>
      <input
        className={grayInput}
        type="text"
        disabled={selectedPreset != undefined}
        value={presetRef.current.name}
        onChange={(e) => {
          presetRef.current.name = e.currentTarget.value;
          rerender({});
        }}
      />
      </div>
      {!selectedPreset && <button
          className={`${roundButton} ${primaryColor}`}
          onClick={async () => {
            if (!presetRef.current.name) {
              pushMessage('이름을 입력하세요');
              return;
            }
            if (curSession!.presets.filter(x=>x.type==='style').find(x=>x.name === presetRef.current.name)) {
              pushMessage('이미 존재하는 그림체 이름 입니다');
              return;
            }
            if (presetRef.current.profile === '') {
              pushMessage('프로필 이미지를 선택하세요');
              return;
            }
            curSession!.presets.push(presetRef.current);
            onClose();
          }}
        >
          저장
        </button>}
    </div>
    <div className="flex-1 overflow-hidden">
      <BigPromptEditor
        key="bigprompt"
        sceneMode={false}
        presetMode='preset'
        selectedPreset={presetRef.current}
        getMiddlePrompt={getPrompt}
        setMiddlePrompt={setPrompt}
        queuePrompt={queueprompt}
        setMainImage={setMainImage}
        initialImagePath={undefined} />
    </div>
  </div>
}

const NAIStylePreSetEditor: React.FC<Props> = ({ globalMode, selectedPreset, setSelectedPreset, middlePromptMode, getMiddlePrompt, onMiddlePromptChange }) => {
  const { curSession } = useContext(AppContext)!;
  const [_, rerender] = useState<{}>({});
  const [presetEditLock, setPresetEditLock] = useState(true);
  const updatePresets = () => {
    sessionService.markUpdated(curSession!.name);
    rerender({});
  };
  const frontPromptChange = (txt: string) => {
    shared.characterPrompt = txt;
    updatePresets();
  };
  const backPromptChange = (txt: string) => {
    shared.backgroundPrompt = txt;
    updatePresets();
  };
  const ucPromptChange = (txt: string) => {
    shared.uc = txt;
    updatePresets();
  };

  useEffect(() => {
    rerender({});
  }, [selectedPreset])

  useEffect(() => {
    const handleEditStart = (e: any) => {
      if (globalMode) {
        return;
      }
      setEditingPreset(e.detail.preset);
      setShowStyleEditor(true);
    };
    if (!middlePromptMode) {
      sessionService.addEventListener('style-edit-start', handleEditStart);
    }
    return () => {
      if (!middlePromptMode) {
        sessionService.removeEventListener('style-edit-start', handleEditStart);
      }
    }
  },[]);

  const [samplerSetting, setSamplerSetting] = useState(false);
  const [vibeSetting, setVibeSetting] = useState(false);
  const commonSetup = useCommonSetup();
  const shared = commonSetup.shared as NAIStylePreSetShared;
  const presets = curSession!.presets;
  const [showStyleEditor, setShowStyleEditor] = useState(false);
  const stylePreset = selectedPreset as NAIStylePreSet;
  const [editingPreset, setEditingPreset] = useState<NAIStylePreSet | undefined>(undefined);
  const { show, hideAll } = useContextMenu({
    id: ContextMenuType.Style,
  });

  return (
    <div
      className="p-3 flex flex-col h-full relative"
    >
      {!middlePromptMode&&<div className="flex items-center mb-3">
        <p className="text-xl font-bold">이미지 생성</p>
          <button className={`${roundButton} bg-gray-400 ml-auto text-sm h-8`} onClick={() => {
            curSession!.presetMode = 'preset';
            setSelectedPreset(curSession!.presets.filter(x=>x.type==='preset')[0]);
            sessionService.markUpdated(curSession!.name);
          }}>NAI모드</button>
      </div>}
      {showStyleEditor && <FloatView onEscape={() => setShowStyleEditor(false)} priority={0}>
        <StyleEditor selectedPreset={editingPreset} onClose={()=>setShowStyleEditor(false)}/>
      </FloatView>}
      {!vibeSetting && <><span className={"flex-none pb-2 " + grayLabel}>그림체</span>
      <div className={"overflow-hidden min-h-0 " + (middlePromptMode ? "h-1/5" : "h-1/3")}>
        <div className="h-full w-full flex overflow-auto gap-2">
          {presets.filter(x=>x.type === 'style').map((preset) => (
            <div
              className={"h-full relative flex-none hover:brightness-95 active:brightness-90 cursor-pointer " + (preset == stylePreset ? "border-2 border-sky-500":"border-2 border-white")}
              key={preset.name}
              onContextMenu={e => {
                show({
                  event: e,
                  props: {
                    ctx: {
                      type: 'style',
                      preset: preset,
                      session: curSession!
                    }
                  }
                });
              }}
              onClick={() => setSelectedPreset(preset)}
            >
              <VibeImage path={imageService.getVibesDir(curSession!) + '/' + preset.profile.split('/').pop()!} className="w-auto h-full" />
              <div className="absolute bottom-0 right-0 bg-gray-700 opacity-80 text-sm text-white p-1 rounded-xl m-2 truncate select-none" style={{maxWidth: "90%"}}>
                {preset.name}
              </div>
            </div>
          ))}
          <div className="h-full relative flex-none flex flex-col">
            <div
              className="flex-1 w-10 flex m-4 items-center justify-center rounded-xl bg-gray-300 text-gray-600 cursor-pointer hover:brightness-95 active:brightness-90"
              onClick={()=>{
                setEditingPreset(undefined);
                setShowStyleEditor(true);
              }}
            >
              <FaPlus/>
            </div>
          </div>
        </div>
      </div></>}
      <EditorField label="캐릭터 관련 태그" full={true}>
        <PromptEditTextArea
          value={shared.characterPrompt}
          disabled={false}
          onChange={frontPromptChange}
        ></PromptEditTextArea>
      </EditorField>
      {middlePromptMode &&
        <EditorField label="씬 프롬프트 (이 씬에만 적용됨)" full={true} bold>
          <PromptEditTextArea
            value={getMiddlePrompt ? getMiddlePrompt() : ''}
            onChange={(txt) => {
              if (onMiddlePromptChange) onMiddlePromptChange(txt);
            }}
          ></PromptEditTextArea>
        </EditorField>
      }
      <EditorField label="배경 관련 태그" full={true}>
        <PromptEditTextArea
          value={shared.backgroundPrompt}
          disabled={false}
          onChange={backPromptChange}
        ></PromptEditTextArea>
      </EditorField>
      <EditorField label="태그 밴 리스트 (네거티브)" full={true}>
        <PromptEditTextArea
          value={shared.uc}
          disabled={false}
          onChange={ucPromptChange}
        ></PromptEditTextArea>
      </EditorField>
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
      </div>
      }
      {vibeSetting &&
       <div className="flex-none h-2/3 flex flex-col overflow-hidden">
        <VibeEditor closeEditor={() => setVibeSetting(false)} disabled={middlePromptMode && presetEditLock}/>
      </div>
      }

    </div>
  );
}

interface Props {
  selectedPreset: PreSet;
  setSelectedPreset: (preset: PreSet) => void;
  middlePromptMode: boolean;
  globalMode?: boolean;
  getMiddlePrompt?: () => string;
  onMiddlePromptChange?: (txt: string) => void;
  type?: PreSetMode;
  styleEditMode?: boolean;
}

const PreSetEditor = ({type, globalMode, setSelectedPreset, selectedPreset, middlePromptMode, getMiddlePrompt, onMiddlePromptChange, styleEditMode} : Props) => {
  const ctx = useContext(AppContext)!;
  const selPreset = globalMode ? ctx.selectedPreset! : selectedPreset;
  const type2 = globalMode ? ctx.curSession!.presetMode : type;
  if (type2 === 'preset') {
    return <NAIPreSetEditor globalMode={globalMode} selectedPreset={selPreset} setSelectedPreset={setSelectedPreset} middlePromptMode={middlePromptMode} styleEditMode={styleEditMode} getMiddlePrompt={getMiddlePrompt} onMiddlePromptChange={onMiddlePromptChange}/>
  } else {
    return <NAIStylePreSetEditor globalMode={globalMode} selectedPreset={selPreset} setSelectedPreset={setSelectedPreset} middlePromptMode={middlePromptMode} styleEditMode={styleEditMode} getMiddlePrompt={getMiddlePrompt} onMiddlePromptChange={onMiddlePromptChange}/>
  }
};

export default PreSetEditor;
