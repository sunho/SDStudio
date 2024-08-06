import * as React from 'react';
import { useContext, useEffect, useState } from 'react';
import * as mobx from 'mobx'
import {
  TextAreaWithUndo,
  NumberSelect,
  Collapsible,
  FileUploadBase64,
  DropdownSelect,
} from './UtilComponents';
import { NoiseSchedule, Resolution, Sampling } from '../backends/imageGen';
import PromptEditTextArea from './PromptEditTextArea';
import { FaImage, FaPlus, FaTrash, FaTrashAlt } from 'react-icons/fa';
import { FloatView } from './FloatView';
import { v4 } from 'uuid';
import { BigPromptEditor } from './SceneEditor';
import { useContextMenu } from 'react-contexify';
import {
  ContextMenuType,
  PromptNode,
} from '../models/types';
import {
  sessionService,
  imageService,
  backend,
  promptService,
  taskQueueService,
  workFlowService,
} from '../models';
import {
  toPARR,
} from '../models/PromptService';
import { queueDummyPrompt } from '../models/TaskQueueService';
import { appState } from '../models/AppService';
import { observer } from 'mobx-react-lite';
import { WFAbstractVar, WFIElement, WFIGroup, WFIInlineInput, WFIPush, WFIStack, WorkFlowDef } from '../models/workflows/WorkFlow';
import { StackFixed, StackGrow, VerticalStack } from './LayoutComponents';

const VibeImage = ({
  path,
  onClick,
  className,
}: {
  path: string;
  onClick?: () => void;
  className: string;
}) => {
  const [image, setImage] = useState<string | null>(null);
  useEffect(() => {
    (async () => {
      const data = await imageService.fetchImageSmall(path, 400);
      setImage(data);
    })();
  }, [path]);
  return (
    <>
      {image && <img className={className} src={image} onClick={onClick} />}
      {!image && <div className={className} onClick={onClick}></div>}
    </>
  );
};

interface VibeEditorProps {
  closeEditor: () => void;
  disabled: boolean;
}

export const VibeEditor = ({ disabled, closeEditor }: VibeEditorProps) => {
  const updatePresets = () => {
    sessionService.markUpdated(curSession!.name);
  };
  const vibeChange = async (vibe: string) => {
    if (!vibe) return;
    const path = imageService.getVibesDir(curSession!) + '/' + v4() + '.png';
    await backend.writeDataFile(path, vibe);
    commonSetup.shared.vibes.push({ path: path, info: 1.0, strength: 0.6 });
    updatePresets();
  };

  return (
    <div className="w-full h-full overflow-hidden flex flex-col">
      <div className="flex-1 overflow-hidden">
        <div className="h-full overflow-auto">
          {false && commonSetup.shared.vibes.map((vibe) => (
            <div className="border border-gray-300 mt-2 p-2 flex gap-2 items-begin">
              <VibeImage
                path={vibe.path}
                className="flex-none w-28 h-28 object-cover"
              />
              <div className="flex flex-col gap-2 w-full">
                <div className="flex w-full items-center md:flex-row flex-col">
                  <div
                    className={
                      'whitespace-nowrap flex-none mr-auto md:mr-0 gray-label'
                    }
                  >
                    정보 추출률 (IS):
                  </div>
                  <div className="flex flex-1 md:w-auto w-full gap-1">
                    <input
                      className="flex-1"
                      type="range"
                      step="0.01"
                      min="0"
                      max="1"
                      value={vibe.info}
                      onChange={(e) => {
                        vibe.info = parseFloat(e.target.value);
                        updatePresets();
                      }}
                      disabled={disabled}
                    />
                    <div className="w-11 flex-none text-lg text-center back-lllgray">
                      {vibe.info}
                    </div>
                  </div>
                </div>
                <div className="flex w-full md:flex-row flex-col items-center">
                  <div
                    className={
                      'whitepace-nowrap flex-none mr-auto md:mr-0 gray-label'
                    }
                  >
                    레퍼런스 강도 (RS):
                  </div>
                  <div className="flex flex-1 md:w-auto w-full gap-1">
                    <input
                      className="flex-1"
                      type="range"
                      step="0.01"
                      min="0"
                      max="1"
                      value={vibe.strength}
                      onChange={(e) => {
                        vibe.strength = parseFloat(e.target.value);
                        updatePresets();
                      }}
                      disabled={disabled}
                    />
                    <div className="w-11 flex-none text-lg text-center back-lllgray">
                      {vibe.strength}
                    </div>
                  </div>
                </div>
                <div className="flex-none flex ml-auto mt-auto">
                  <button
                    className={
                      `round-button h-8 px-8 ml-auto ` +
                      (disabled ? 'back-gray' : 'back-red')
                    }
                    onClick={() => {
                      if (disabled) return;
                      commonSetup.shared.vibes =
                        commonSetup.shared.vibes.filter((x) => x !== vibe);
                      updatePresets();
                    }}
                  >
                    <FaTrash />
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>
      <div className="flex-none mt-auto pt-2 flex gap-2 items-center">
        <FileUploadBase64
          notext
          disabled={disabled}
          onFileSelect={vibeChange}
        ></FileUploadBase64>
        <button
          className={`round-button back-gray h-8 w-full`}
          onClick={closeEditor}
        >
          바이브 설정 닫기
        </button>
      </div>
    </div>
  );
};

export const VibeButton = ({ onClick }: { onClick: () => void }) => {
  return (
    <>
      {(
        <button
          className={`round-button back-gray h-8 w-full flex mt-2`}
          onClick={onClick}
        >
          <div className="flex-1">바이브 이미지 설정 열기</div>
        </button>
      )}
      {false && commonSetup.shared.vibes.length > 0 && (
        <div className="w-full flex items-center">
          <div className={'flex-none mr-2 gray-label'}>바이브 설정:</div>
          <VibeImage
            path={commonSetup.shared.vibes[0].path}
            className="flex-1 h-14 rounded-xl object-cover cursor-pointer hover:brightness-95 active:brightness-90"
            onClick={onClick}
          />
        </div>
      )}
    </>
  );
};

const EditorField = ({
  label,
  full,
  children,
  bold,
}: {
  label: string;
  children: React.ReactNode;
  full: boolean;
  bold?: boolean;
}) => {
  return (
    <>
      <div className={'pt-2 pb-1 gray-label'}>
        {bold ? <b>{label}</b> : label}
      </div>
      <div className={full ? 'flex-1 min-h-0' : 'flex-none mt-3'}>
        {children}
      </div>
    </>
  );
};

const InlineEditorField = ({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) => {
  return (
    <div className="pt-2 flex gap-2 items-center">
      <span className={'flex-none gray-label'}>{label}:</span>
      {children}
    </div>
  );
};

const NAIPreSetEditor: React.FC<Props> = ({
  selectedPreset,
  setSelectedPreset,
  middlePromptMode,
  getMiddlePrompt,
  onMiddlePromptChange,
  styleEditMode,
}) => {
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
  }, [selectedPreset]);

  const [samplerSetting, setSamplerSetting] = useState(false);
  const [vibeSetting, setVibeSetting] = useState(false);
  const commonSetup = useCommonSetup();

  return (
    <div
      key={selectedPreset.name}
      className="p-3 flex flex-col h-full relative"
    >
      {!middlePromptMode && (
        <div className="flex-none z-10">
          <PreSetSelect
            selectedPreset={selectedPreset}
            setSelectedPreset={(preset) => {
              setSelectedPreset(preset);
            }}
            onChange={updatePresets}
          />
        </div>
      )}
      {!styleEditMode && middlePromptMode && (
        <InlineEditorField label="프리셋 편집 잠금">
          <input
            type="checkbox"
            checked={presetEditLock}
            onChange={() => setPresetEditLock(!presetEditLock)}
          ></input>
        </InlineEditorField>
      )}
      <EditorField label="상위 프롬프트" full={true}>
        <PromptEditTextArea
          value={selectedPreset.frontPrompt}
          disabled={middlePromptMode && presetEditLock}
          onChange={frontPromptChange}
        ></PromptEditTextArea>
      </EditorField>
      {middlePromptMode && (
        <EditorField label="중위 프롬프트 (이 씬에만 적용됨)" full={true} bold>
          <PromptEditTextArea
            value={getMiddlePrompt ? getMiddlePrompt() : ''}
            onChange={(txt) => {
              if (onMiddlePromptChange) onMiddlePromptChange(txt);
            }}
          ></PromptEditTextArea>
        </EditorField>
      )}
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
      {!samplerSetting && !vibeSetting && (
        <div className="flex-none mt-3">
          {!styleEditMode && (
            <div className="mt-auto flex gap-2 items-center">
              <span className={'flex-none gray-label'}>시드: </span>
              <input
                className={`w-full gray-input`}
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
                    commonSetup.shared.seed = null;
                  }
                  updatePresets();
                }}
              />
            </div>
          )}
          {!styleEditMode && (
            <div className="flex-none mt-3 flex gap-2 items-center">
              <VibeButton onClick={() => setVibeSetting(true)} />
            </div>
          )}
          <div className="flex-none mt-3 flex gap-2 items-center">
            <button
              className={`round-button back-gray h-8 w-full`}
              onClick={() => setSamplerSetting(true)}
            >
              샘플링 설정 열기
            </button>
          </div>
        </div>
      )}
      {samplerSetting && (
        <div className="flex-none">
          <div className="mt-auto pt-2 flex gap-2 items-center">
            <span className={'flex-none gray-label'}>샘플러: </span>
            <DropdownSelect
              selectedOption={selectedPreset.sampling}
              disabled={middlePromptMode && presetEditLock}
              menuPlacement="top"
              options={Object.values(Sampling).map((x) => ({
                label: x,
                value: x,
              }))}
              onSelect={(opt) => {
                selectedPreset.noiseSchedule = NoiseSchedule.Native;
                selectedPreset.sampling = opt.value;
                updatePresets();
              }}
            />
          </div>
          <div className="mt-auto pt-2 flex gap-2 items-center pr-1">
            <span className={'flex-none gray-label'}>SMEA: </span>
            <input
              type="checkbox"
              checked={!selectedPreset.smeaOff}
              onChange={(e) => {
                selectedPreset.smeaOff = !e.target.checked;
                updatePresets();
              }}
              disabled={middlePromptMode && presetEditLock}
            />
            <span className={'flex-none gray-label'}>DYN: </span>
            <input
              type="checkbox"
              checked={selectedPreset.dynOn}
              onChange={(e) => {
                selectedPreset.dynOn = e.target.checked;
                updatePresets();
              }}
              disabled={middlePromptMode && presetEditLock}
            />
          </div>
          <div className="mt-auto pt-2 flex gap-2 items-center pr-1">
            <span className={'flex-none gray-label'}>프롬프트 가이던스: </span>
            <span className="back-lllgray p-1 flex-none w-8 text-center">
              {selectedPreset.promptGuidance ?? 5}
            </span>
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
            <span className={'flex-none gray-label'}>스탭: </span>
            {selectedPreset!.steps && selectedPreset!.steps > 28 && (
              <span className="absolute text-white bg-red-700 right-0 bottom-16 px-4">
                Anlas가 소모되는 세팅입니다 (유료임)
              </span>
            )}
            <span className="back-lllgray p-1 flex-none w-8 text-center">
              {selectedPreset.steps ?? 28}
            </span>
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
          <div className="mt-auto pt-2 flex gap-2 items-center pr-1">
            <span className={'flex-none gray-label'}>CFG 리스케일: </span>
            <span className="back-lllgray p-1 flex-none w-8 text-center">
              {selectedPreset.cfgRescale ?? 0}
            </span>
            <input
              className="flex-1"
              type="range"
              step="0.01"
              min="0"
              max="1"
              disabled={middlePromptMode && presetEditLock}
              value={selectedPreset.cfgRescale ?? 0}
              onChange={(e) => {
                selectedPreset.cfgRescale = parseFloat(e.target.value);
                updatePresets();
              }}
            />
          </div>
          <div className="mt-auto pt-2 flex gap-2 items-center">
            <span className={'flex-none gray-label'}>노이즈 스케줄: </span>
            <DropdownSelect
              selectedOption={
                selectedPreset.noiseSchedule ?? NoiseSchedule.Native
              }
              disabled={middlePromptMode && presetEditLock}
              menuPlacement="top"
              options={Object.values(NoiseSchedule).map((x) => ({
                label: x,
                value: x,
              }))}
              onSelect={(opt) => {
                const sampling =
                  selectedPreset.sampling ?? Sampling.KEulerAncestral;
                if (sampling === Sampling.DDIM) {
                  ctx.pushMessage(
                    '해당 샘플링은 노이즈 스케줄을 사용할 수 없습니다',
                  );
                  return;
                }
                if (opt.value === NoiseSchedule.Karras) {
                  if (
                    sampling === Sampling.KEulerAncestral ||
                    sampling === Sampling.KDPMPP2SAncestral
                  ) {
                    ctx.pushMessage(
                      '해당 샘플링은 karras를 사용할 수 없습니다',
                    );
                    return;
                  }
                }
                selectedPreset.noiseSchedule = opt.value;
                updatePresets();
              }}
            />
          </div>
          <div className="mt-auto pt-2 flex gap-2 items-center">
            <button
              className={`round-button back-gray h-8 w-full`}
              onClick={() => setSamplerSetting(false)}
            >
              샘플링 설정 닫기
            </button>
          </div>
        </div>
      )}
      {vibeSetting && (
        <div className="flex-none h-2/3 flex flex-col overflow-hidden">
          <VibeEditor
            closeEditor={() => setVibeSetting(false)}
            disabled={middlePromptMode && presetEditLock}
          />
        </div>
      )}
    </div>
  );
};

interface StyleEditorProps {
  selectedPreset?: StylePreSet;
  onClose: () => void;
}

const StyleEditor: React.FC<StyleEditorProps> = ({
  selectedPreset,
  onClose,
}) => {
  const { curSession, pushMessage } = useContext(AppContext)!;
  const [_, rerender] = useState<{}>({});
  const prompt = React.useRef<string>('');
  const presetRef = React.useRef<StylePreSet>(
    selectedPreset ?? getDefaultStylePreset(),
  );
  const getPrompt = () => prompt.current;
  const setPrompt = (txt: string) => {
    prompt.current = txt;
  };
  const queueprompt = (middle: string, callback: (path: string) => void) => {
    try {
      const cur = toPARR(presetRef.current.frontPrompt)
        .concat(toPARR(middle))
        .concat(toPARR(presetRef.current.backPrompt));
      const promptNode: PromptNode = {
        type: 'group',
        children: [],
      };
      for (const word of cur) {
        promptNode.children.push(promptService.parseWord(word));
      }
      queueDummyPrompt(
        curSession!,
        presetRef.current,
        '/tmp',
        promptNode,
        Resolution.Portrait,
        callback,
      );
      taskQueueService.run();
    } catch (e: any) {
      pushMessage(e.message);
      return;
    }
  };
  const setMainImage = async (path: string) => {
    const newPath = imageService.getVibesDir(curSession!) + '/' + v4() + '.png';
    await backend.copyFile(path, newPath);
    presetRef.current.profile = newPath.split('/').pop()!;
  };
  return (
    <div className="flex flex-col h-full">
      <div className="grow-0 pt-2 px-3 flex gap-3 items-center text-nowrap flex-wrap mb-2 md:mb-0">
        <div className="flex items-center gap-2">
          <label className="gray-label">그림체 이름:</label>
          <input
            className="gray-input"
            type="text"
            value={presetRef.current.name}
            onChange={(e) => {
              presetRef.current.name = e.currentTarget.value;
              rerender({});
            }}
          />
        </div>
        {!selectedPreset && (
          <button
            className={`round-button back-sky`}
            onClick={async () => {
              if (!presetRef.current.name) {
                pushMessage('이름을 입력하세요');
                return;
              }
              if (
                curSession!.presets
                  .filter((x) => x.type === 'style')
                  .find((x) => x.name === presetRef.current.name)
              ) {
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
          </button>
        )}
      </div>
      <div className="flex-1 overflow-hidden p-2">
        <BigPromptEditor
          key="bigprompt"
          sceneMode={false}
          presetMode="preset"
          selectedPreset={presetRef.current}
          getMiddlePrompt={getPrompt}
          setMiddlePrompt={setPrompt}
          queuePrompt={queueprompt}
          setMainImage={setMainImage}
          initialImagePath={undefined}
        />
      </div>
    </div>
  );
};

const NAIStylePreSetEditor: React.FC<Props> = ({
  globalMode,
  selectedPreset,
  setSelectedPreset,
  middlePromptMode,
  getMiddlePrompt,
  onMiddlePromptChange,
}) => {
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
  }, [selectedPreset]);

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
    };
  }, []);

  const [samplerSetting, setSamplerSetting] = useState(false);
  const [vibeSetting, setVibeSetting] = useState(false);
  const commonSetup = useCommonSetup();
  const shared = commonSetup.shared as StylePreSetShared;
  const presets = curSession!.presets;
  const [showStyleEditor, setShowStyleEditor] = useState(false);
  const stylePreset = selectedPreset as StylePreSet;
  const [editingPreset, setEditingPreset] = useState<
    StylePreSet | undefined
  >(undefined);
  const { show, hideAll } = useContextMenu({
    id: ContextMenuType.Style,
  });

  return (
    <div className="p-3 flex flex-col h-full relative">
      {!middlePromptMode && (
        <div className="flex items-center mb-3">
          <p className="text-xl font-bold text-default">이미지 생성</p>
          <button
            className={`round-button back-llgray ml-auto text-sm h-8`}
            onClick={() => {
              curSession!.presetMode = 'preset';
              setSelectedPreset(
                curSession!.presets.filter((x) => x.type === 'preset')[0],
              );
              sessionService.markUpdated(curSession!.name);
            }}
          >
            NAI모드
          </button>
        </div>
      )}
      {showStyleEditor && (
        <FloatView onEscape={() => setShowStyleEditor(false)} priority={0}>
          <StyleEditor
            selectedPreset={editingPreset}
            onClose={() => setShowStyleEditor(false)}
          />
        </FloatView>
      )}
      {!vibeSetting && (
        <>
          <span className={'flex-none pb-2 gray-label'}>그림체</span>
          <div
            className={
              'overflow-hidden min-h-0 ' +
              (middlePromptMode ? 'h-1/5' : 'h-1/3')
            }
          >
            <div className="h-full w-full flex overflow-auto gap-2">
              {presets
                .filter((x) => x.type === 'style')
                .map((preset) => (
                  <div
                    className={
                      'h-full relative flex-none hover:brightness-95 active:brightness-90 cursor-pointer ' +
                      (preset == stylePreset
                        ? 'border-2 border-sky-500'
                        : 'border-2 line-color')
                    }
                    key={preset.name}
                    onContextMenu={(e) => {
                      show({
                        event: e,
                        props: {
                          ctx: {
                            type: 'style',
                            preset: preset,
                            session: curSession!,
                          },
                        },
                      });
                    }}
                    onClick={() => setSelectedPreset(preset)}
                  >
                    <VibeImage
                      path={
                        imageService.getVibesDir(curSession!) +
                        '/' +
                        preset.profile.split('/').pop()!
                      }
                      className="w-auto h-full"
                    />
                    <div
                      className="absolute bottom-0 right-0 bg-gray-700 opacity-80 text-sm text-white p-1 rounded-xl m-2 truncate select-none"
                      style={{ maxWidth: '90%' }}
                    >
                      {preset.name}
                    </div>
                  </div>
                ))}
              <div className="h-full relative flex-none flex flex-col">
                <div
                  className="flex-1 w-10 flex m-4 items-center justify-center rounded-xl clickable back-lllgray"
                  onClick={() => {
                    setEditingPreset(undefined);
                    setShowStyleEditor(true);
                  }}
                >
                  <FaPlus />
                </div>
              </div>
            </div>
          </div>
        </>
      )}
      <EditorField label="캐릭터 관련 태그" full={true}>
        <PromptEditTextArea
          value={shared.characterPrompt}
          disabled={false}
          onChange={frontPromptChange}
        ></PromptEditTextArea>
      </EditorField>
      {middlePromptMode && (
        <EditorField label="씬 프롬프트 (이 씬에만 적용됨)" full={true} bold>
          <PromptEditTextArea
            value={getMiddlePrompt ? getMiddlePrompt() : ''}
            onChange={(txt) => {
              if (onMiddlePromptChange) onMiddlePromptChange(txt);
            }}
          ></PromptEditTextArea>
        </EditorField>
      )}
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
      {!samplerSetting && !vibeSetting && (
        <div className="flex-none mt-3">
          <div className="mt-auto flex gap-2 items-center">
            <span className={'flex-none gray-label'}>시드: </span>
            <input
              className={`w-full gray-input`}
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
            <VibeButton onClick={() => setVibeSetting(true)} />
          </div>
        </div>
      )}
      {vibeSetting && (
        <div className="flex-none h-2/3 flex flex-col overflow-hidden">
          <VibeEditor
            closeEditor={() => setVibeSetting(false)}
            disabled={middlePromptMode && presetEditLock}
          />
        </div>
      )}
    </div>
  );
};

const IntSliderInput = ({
  label,
  value,
  onChange,
  disabled,
  step,
  min,
  max
}: {
  label: string;
  value: number;
  onChange: (val: number) => void;
  disabled: boolean;
  step: number;
  min: number;
  max: number;
}) => {
  return (
    <div className="flex w-full items-center md:flex-row flex-col mt-2 gap-2">
      <div
        className={
          'whitespace-nowrap flex-none mr-auto md:mr-0 gray-label'
        }
      >
        {label}:
      </div>
      <div className="flex flex-1 md:w-auto w-full gap-1">
        <input
          className="flex-1"
          type="range"
          step={step}
          min={min}
          max={max}
          value={value}
          onChange={(e) => {
            onChange(parseFloat(e.target.value));
          }}
          disabled={disabled}
        />
        <div className="w-11 flex-none text-lg text-center back-lllgray">
          {value}
        </div>
      </div>
    </div>
  );
}

const PreSetSelect = observer(({
  workflowType
}: {
  workflowType: string;
}) => {
  const curSession = appState.curSession!;
  return (
    <div className="flex gap-2 mt-2 items-center">
      <div className="flex-none gray-label">사전세팅선택:</div>
      <div className="round-button back-gray h-9 w-full"></div>
      <button
        className={`icon-button`}
      >
        <FaPlus />
      </button>
    </div>
  );
});


interface NullIntInputProps {
  label: string;
  value: number|null;
  disabled: boolean;
  onChange: (val: number | undefined) => void;
}

const NullIntInput = ({ label, value, onChange, disabled }: NullIntInputProps) => {
  return <input
    className={`w-full gray-input`}
    disabled={disabled}
    value={value ? value.toString() : ''}
    onChange={(e) => {
      try {
        const num = parseInt(e.target.value);
        if (e.target.value === '') throw new Error('No seed');
        if (isNaN(num)) throw new Error('Invalid seed');
        if (!Number.isInteger(num))
          throw new Error('Seed must be an integer');
        if (num <= 0) throw new Error('Seed must be positive');
        onChange(num);
      } catch (e) {
        onChange(undefined);
      }
    }}
  />
};

interface IWFElementContext {
  preset: any;
  shared: any;
  type: string;
  middlePromptMode: boolean;
  showGroup?: string;
  setShowGroup: (group: string | undefined) => void;
  getMiddlePrompt?: () => string;
  onMiddlePromptChange?: (txt: string) => void;
}

interface WFElementProps {
  element: WFIElement;
}

const WFElementContext = React.createContext<IWFElementContext | null>(null);

interface IWFGroupContext {
  curGroup?: string;
}

const WFGroupContext = React.createContext<IWFGroupContext | null>(null);

const WFRenderElement = observer(({
  element,
}: WFElementProps) => {
  switch (element.type) {
  case 'stack':
    return <WFRStack element={element} />;
  case 'inline':
    return <WFRInline element={element} />;
  case 'group':
    return <WFRGroup element={element} />;
  case 'presetSelect':
    return <WFRPresetSelect element={element} />;
  case 'push':
    return <WFRPush element={element} />;
  }
});

const WFRPresetSelect = observer(({element}:WFElementProps) => {
  const { type } = useContext(WFElementContext)!;
  return <PreSetSelect workflowType={type} />;
});

const WFRGroup = observer(({element}:WFElementProps) => {
  const grp = element as WFIGroup;
  const { type, setShowGroup, showGroup } = useContext(WFElementContext)!;
  const { curGroup } = useContext(WFGroupContext)!;
  return <>
    {grp.label !== showGroup && <button
      className={`round-button back-gray h-8 w-full mt-2`}
      onClick={() => {setShowGroup(grp.label)}}
    >
      {grp.label} 열기
    </button>}
    {grp.label === showGroup && <WFGroupContext.Provider value={{curGroup: grp.label}}>
        <VerticalStack>
        {grp.inputs.map(x => <WFRenderElement element={x} />)}
        <button
              className={`round-button back-gray h-8 w-full mt-2`}
              onClick={() => {setShowGroup(undefined)}}
            >
              {grp.label} 닫기
            </button>
      </VerticalStack>
    </WFGroupContext.Provider>}
  </>
});

const WFRStack = observer(({element}:WFElementProps) => {
  const stk = element as WFIStack;
  return <VerticalStack>
    {stk.inputs.map(x => <WFRenderElement element={x} />)}
  </VerticalStack>
});

const WFRPush = observer(({element}:WFElementProps) => {
  const { showGroup } = useContext(WFElementContext)!;
  const { curGroup } = useContext(WFGroupContext)!;
  const push = element as WFIPush;
  if (curGroup !== showGroup) {
    return <></>
  }

  if (push.direction === 'top') {
    return <div className="mt-auto"></div>
  } else if (push.direction === 'bottom') {
    return <div className="mb-auto"></div>
  } else if (push.direction === 'left') {
    return <div className="ml-auto"></div>
  } else if (push.direction === 'right') {
    return <div className="mr-auto"></div>
  }
});

const WFRInline = observer(({element}:WFElementProps) => {
  const { type, showGroup, preset, shared } = useContext(WFElementContext)!;
  const { curGroup } = useContext(WFGroupContext)!;
  const input = element as WFIInlineInput;
  const field = workFlowService.getVarDef(type, input.preset, input.field)!;
  const getField = () => {
    if (input.preset) {
      return preset[input.field];
    } else {
      return shared[input.field];
    }
  };
  const setField = (val: any) => {
    if (input.preset) {
      preset[input.field] = val;
    } else {
      shared[input.field] = val;
    }
  };
  if (curGroup !== showGroup) {
    return <></>
  }
  switch (field.type) {
  case 'prompt':
    return <EditorField label={input.label} full={input.flex === 'flex-1'}>
        <PromptEditTextArea
          value={getField()}
          disabled={false}
          onChange={setField}
        ></PromptEditTextArea>
      </EditorField>
  case 'nullInt':
    return <InlineEditorField label={input.label}>
      <NullIntInput label={input.label} value={getField()} disabled={false} onChange={
        (val) => setField(val)
      }/>
    </InlineEditorField>
  case 'vibeSet':
    return <VibeButton/>
  case 'bool':
    return <InlineEditorField label={input.label}>
      <input
        type="checkbox"
        checked={getField()}
        onChange={(e) => setField(e.target.checked)}
      />
    </InlineEditorField>
  case 'int':
    return <IntSliderInput label={input.label} value={getField()} onChange={setField} disabled={false} min={field.min} max={field.max} step={field.step} />
  }
  return <InlineEditorField label={input.label}>
    asdf
  </InlineEditorField>
});

interface Props {
  middlePromptMode: boolean;
  getMiddlePrompt?: () => string;
  onMiddlePromptChange?: (txt: string) => void;
}

const PreSetEditor = observer(({
  middlePromptMode,
  getMiddlePrompt,
  onMiddlePromptChange,
}: Props) => {
  const [_, rerender] = useState<{}>({});
  const [showGroup, setShowGroup] = useState<string | undefined>(undefined);
  const curSession = appState.curSession!;
  const workflowType = curSession.selectedWorkflow?.workflowType;
  const shared = curSession.presetShareds?.get(workflowType!);
  const presets = curSession.presets?.get(workflowType!);
  if (!workflowType) {
    curSession.selectedWorkflow = {
      workflowType: workFlowService.generalFlows[0].getType(),
    }
    rerender({});
  } else {
    if (!presets) {
      const preset = workFlowService.buildPreset(workflowType);
      preset.name = 'default';
      curSession.presets.set(workflowType, [
        preset
      ]);
      rerender({});
    } else if (!shared) {
      curSession.presetShareds.set(workflowType, {});
      rerender({});
    } else if (!curSession.selectedWorkflow!.presetName) {
      curSession.selectedWorkflow!.presetName = presets[0].name;
      rerender({});
    }
  }
  return workflowType && shared && curSession.selectedWorkflow!.presetName && <VerticalStack className="p-3">
    <StackFixed className="flex gap-2 items-center">
      <span className={'flex-none gray-label'}>작업모드: </span>
      <DropdownSelect
        selectedOption={workflowType}
        menuPlacement="bottom"
        options={workFlowService.generalFlows.map(x=>({
          value: x.getType(),
          label: x.getTitle()
        }))}
        onSelect={(opt) => {
          curSession.selectedWorkflow = {
            workflowType: opt.value
          }
          setShowGroup(undefined);
        }}
      />
    </StackFixed>
    <StackGrow>
      <WFElementContext.Provider value={{
        preset: curSession.getPreset(workflowType, curSession.selectedWorkflow!.presetName),
        shared: shared,
        showGroup: showGroup,
        setShowGroup: setShowGroup,
        type: workflowType,
        middlePromptMode,
        getMiddlePrompt,
        onMiddlePromptChange,
      }}>
        <WFGroupContext.Provider value={{}}>
          <WFRenderElement
            element={workFlowService.getGeneralEditor(workflowType)}
          />
        </WFGroupContext.Provider>
      </WFElementContext.Provider>
    </StackGrow>
  </VerticalStack>
});

export default PreSetEditor;
