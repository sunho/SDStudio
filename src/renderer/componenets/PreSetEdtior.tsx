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
  VibeItem,
} from '../models/types';
import {
  sessionService,
  imageService,
  backend,
  promptService,
  taskQueueService,
  workFlowService,
  isMobile,
} from '../models';
import {
  toPARR,
} from '../models/PromptService';
import { appState } from '../models/AppService';
import { observer } from 'mobx-react-lite';
import { WFAbstractVar, WFIElement, WFIGroup, WFIInlineInput, WFIMiddlePlaceholderInput, WFIPush, WFIStack, WFVar, WorkFlowDef } from '../models/workflows/WorkFlow';
import { StackFixed, StackGrow, VerticalStack } from './LayoutComponents';

const ImageSelect = observer(({
 input
}: {
  input: WFIInlineInput;
}) => {
  const { curSession } = appState;
  const { type, preset, shared, editVibe } = useContext(WFElementContext)!;
  const getField = () => {
    if (input.preset)
      return preset[input.field];
    return shared[input.field];
  };
  const setField = (val: any) => {
    if (input.preset)
      preset[input.field] = val;
    else
      shared[input.field] = val;
  };
  return <div className="inline-flex md:flex gap-3 items-center flex-none text-eplsis overflow-hidden gap-3 mb-1">
    <span className="gray-label">{input.label}: </span>
    <div className="w-24 md:w-48">
      <FileUploadBase64
        onFileSelect={async (file: string) => {
          if (!getField()) {
            const path = await imageService.storeVibeImage(curSession!, file);
            setField(path);
          } else {
            await imageService.writeVibeImage(curSession!, getField(), file);
          }
        }}
      ></FileUploadBase64>
    </div>
    {!isMobile && (
      <button
        className={`round-button back-sky`}
        onClick={() => {
          if (!getField()) return;
          const path = imageService.getVibeImagePath(curSession!, getField());
          backend.openImageEditor(path);
          backend.watchImage(path);
        }}
      >
        {input.label} 편집
      </button>
    )}
  </div>
});

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
  disabled: boolean;
}

export const VibeEditor = observer(({ disabled }: VibeEditorProps) => {
  const { curSession } = appState;
  const { preset, shared, editVibe, setEditVibe } = useContext(WFElementContext)!;

  const getField = () => {
    if (editVibe!.preset)
      return preset[editVibe!.field];
    return shared[editVibe!.field];
  }
  const setField = (val: any) => {
    if (editVibe!.preset)
      preset[editVibe!.field] = val;
    shared[editVibe!.field] = val;
  }
  const vibeChange = async (vibe: string) => {
    if (!vibe) return;
    const path = imageService.storeVibeImage(curSession!, vibe);
    getField().push({ path: path, info: 1.0, strength: 0.6 });
  };

  return (
    editVibe && <div className="w-full h-full overflow-hidden flex flex-col">
      <div className="flex-1 overflow-hidden">
        <div className="h-full overflow-auto">
          {getField().map((vibe: VibeItem) => (
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
                      setField(getField().filter((x:any) => x !== vibe));
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
          onClick={()=>{
            setEditVibe(undefined);
          }}
        >
          바이브 설정 닫기
        </button>
      </div>
    </div>
  );
});

export const VibeButton = ({ input }: {
  input: WFIInlineInput;
 }) => {
  const { editVibe, setEditVibe, preset, shared } = useContext(WFElementContext)!;
  const getField = () => {
    console.log(input.field);
    if (input.preset)
      return preset[input.field];
    return shared[input.field];
  };
  const onClick = () => {
    setEditVibe(input);
  };
  return (
    <>
      {editVibe == undefined && getField().length === 0 && (
        <button
          className={`round-button back-gray h-8 w-full flex mt-2`}
          onClick={onClick}
        >
          <div className="flex-1">바이브 이미지 설정 열기</div>
        </button>
      )}
      {editVibe == undefined && getField().length > 0 && (
        <div className="w-full flex items-center mt-2">
          <div className={'flex-none mr-2 gray-label'}>바이브 설정:</div>
          <VibeImage
            path={getField()[0].path}
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

interface InnerEditorProps {
  type: string;
  shared: any;
  preset: any,
}

const InnerEditor: React.FC<InnerEditorProps> = ({
  type,
  shared,
  preset,
}) => {
  const { curSession, pushMessage } = appState;
  const prompt = React.useRef<string>('');
  const getPrompt = () => prompt.current;
  const setPrompt = (txt: string) => {
    prompt.current = txt;
  };
  const queueprompt = (middle: string, callback: (path: string) => void) => {

  };
  const setMainImage = async (path: string) => {
    const newPath = imageService.getVibesDir(curSession!) + '/' + v4() + '.png';
    await backend.copyFile(path, newPath);
    preset.profile = newPath.split('/').pop()!;
  };
  return (
    <div className="flex flex-col h-full">
      <div className="grow-0 pt-2 px-3 flex gap-3 items-center text-nowrap flex-wrap mb-2 md:mb-0">
        <div className="flex items-center gap-2">
          <label className="gray-label">그림체 이름:</label>
          <input
            className="gray-input"
            type="text"
            value={preset.name}
            onChange={(e) => {
              preset.name = e.currentTarget.value;
            }}
          />
        </div>
          <button
            className={`round-button back-sky`}
            onClick={async () => {
            }}
          >
            이름변경
          </button>
      </div>
      <div className="flex-1 overflow-hidden p-2">
        <BigPromptEditor
          key="bigprompt"
          general={false}
          type={type}
          preset={preset}
          shared={shared}
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

const ProfilePreSetSelect = observer(({}) => {
  const { curSession } = appState;
  const { preset, type, shared, middlePromptMode } = useContext(WFElementContext)!;
  const presets = curSession!.presets.get(type)!;
  const [selected, setSelected] = useState<any | undefined>(undefined);
  const { show, hideAll } = useContextMenu({
    id: ContextMenuType.Style,
  });
  const containerRef = React.useRef<HTMLDivElement>(null);
  useEffect(() => {
    const onStyleEdit = (e: any) => {
      if (e.detail.container !== containerRef.current) return;
      setSelected(e.detail.preset);
    };
    sessionService.addEventListener('style-edit', onStyleEdit);
    return () => {
      sessionService.removeEventListener('style-edit', onStyleEdit);
    };
  });

  return <div
    ref={containerRef}
    className={
      'mt-2 overflow-hidden min-h-0 ' +
      (middlePromptMode ? 'h-1/5' : 'h-1/3')
    }
  >
    {selected && <FloatView priority={1}
        onEscape={() => {
          setSelected(undefined);
        }}
    >
      <InnerEditor
        type={type}
        shared={shared}
        preset={selected}
      />
    </FloatView>}
    <div className="h-full w-full flex overflow-auto gap-2">
      {presets
        .map((x) => (
          <div
            className={
              'h-full relative flex-none hover:brightness-95 active:brightness-90 cursor-pointer ' +
              (x == preset
                ? 'border-2 border-sky-500'
                : 'border-2 line-color')
            }
            key={x.name}
            onContextMenu={(e) => {
              show({
                event: e,
                props: {
                  ctx: {
                    type: 'style',
                    preset: preset,
                    session: curSession!,
                    container: containerRef.current!
                  },
                },
              });
            }}
            onClick={() => {
              curSession!.selectedWorkflow = {
                workflowType: type,
                presetName: x.name
              };
            }}
          >
            {preset.profile && <VibeImage
              path={
                imageService.getVibesDir(curSession!) +
                '/' +
                preset.profile.split('/').pop()!
              }
              className="w-auto h-full"
            />}
            {!x.profile && <div className="w-40 h-full"></div>}
            <div
              className="absolute bottom-0 right-0 bg-gray-700 opacity-80 text-sm text-white p-1 rounded-xl m-2 truncate select-none"
              style={{ maxWidth: '90%' }}
            >
              {x.name}
            </div>
          </div>
        ))}
      <div className="h-full relative flex-none flex flex-col">
        <div
          className="flex-1 w-10 flex m-4 items-center justify-center rounded-xl clickable back-lllgray"
          onClick={async () => {
            const name = await appState.pushDialogAsync({
              type: 'input-confirm',
              text: '그림체 이름을 입력하세요',
            });
            if (!name) return;
            if (presets.find((x) => x.name === name)) {
              appState.pushMessage('이미 존재하는 그림체 이름입니다');
              return;
            }
            const newPreset = workFlowService.buildPreset(type);
            newPreset.name = name;
            presets.push(newPreset);
          }}
        >
          <FaPlus />
        </div>
      </div>
    </div>
  </div>
});

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
  editVibe: WFIInlineInput | undefined;
  setEditVibe: (vibe: WFIInlineInput | undefined) => void;
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
  case 'profilePresetSelect':
    return <WFRProfilePresetSelect element={element} />;
  case 'push':
    return <WFRPush element={element} />;
  case 'middlePlaceholder':
    return <WFRMiddlePlaceholder element={element} />;
  }
});

const WFRMiddlePlaceholder = observer(({element}:WFElementProps) => {
  const { editVibe, showGroup, getMiddlePrompt, onMiddlePromptChange } = useContext(WFElementContext)!;
  const input = element as WFIMiddlePlaceholderInput;
  if (!getMiddlePrompt || !onMiddlePromptChange) { return <></> }
  if (showGroup || editVibe) { return <></>}
  return <EditorField label={input.label} full={true} bold>
    <PromptEditTextArea
      value={getMiddlePrompt!()}
      disabled={false}
      onChange={onMiddlePromptChange!}
    ></PromptEditTextArea>
  </EditorField>
});

const WFRProfilePresetSelect = observer(({element}:WFElementProps) => {
  const { type } = useContext(WFElementContext)!;
  return <ProfilePreSetSelect />;
});

const WFRPresetSelect = observer(({element}:WFElementProps) => {
  const { type } = useContext(WFElementContext)!;
  return <PreSetSelect workflowType={type} />;
});

const WFRGroup = observer(({element}:WFElementProps) => {
  const grp = element as WFIGroup;
  const { type, setShowGroup, showGroup, editVibe } = useContext(WFElementContext)!;
  const { curGroup } = useContext(WFGroupContext)!;
  if (editVibe != undefined) {
    return <></>
  }
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
  const { showGroup, editVibe } = useContext(WFElementContext)!;
  const { curGroup } = useContext(WFGroupContext)!;
  const push = element as WFIPush;
  if (curGroup !== showGroup || editVibe != undefined) {
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
  const { editVibe, type, showGroup, preset, shared } = useContext(WFElementContext)!;
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
  if (curGroup !== showGroup || editVibe != undefined) {
    return <></>
  }
  const key = `${type}_${preset.name}_${input.field}`;
  switch (field.type) {
  case 'prompt':
    return <EditorField label={input.label} full={input.flex === 'flex-1'}>
        <PromptEditTextArea
          key={key}
          value={getField()}
          disabled={false}
          onChange={setField}
        ></PromptEditTextArea>
      </EditorField>
  case 'nullInt':
    return <InlineEditorField label={input.label}>
      <NullIntInput label={input.label} value={getField()} disabled={false} onChange={
        (val) => setField(val)
      }
          key={key}
      />
    </InlineEditorField>
  case 'vibeSet':
    return <VibeButton input={input} key={key}/>
  case 'bool':
    return <InlineEditorField label={input.label} >
      <input
        key={key}
        type="checkbox"
        checked={getField()}
        onChange={(e) => setField(e.target.checked)}
      />
    </InlineEditorField>
  case 'int':
    return <IntSliderInput label={input.label} value={getField()} onChange={setField} disabled={false} min={field.min} max={field.max} step={field.step} key={key}/>
  case 'sampling':
    return  <InlineEditorField label={input.label}>
      <DropdownSelect
        key={key}
        selectedOption={getField()}
        disabled={false}
        menuPlacement="top"
        options={Object.values(Sampling).map((x) => ({
          label: x,
          value: x,
        }))}
        onSelect={(opt) => {
          setField(opt.value);
        }}
      />
    </InlineEditorField>
  case 'noiseSchedule':
    return <InlineEditorField label={input.label}>
      <DropdownSelect
        key={key}
        selectedOption={getField()}
        disabled={false}
        menuPlacement="top"
        options={Object.values(NoiseSchedule).map((x) => ({
          label: x,
          value: x,
        }))}
        onSelect={(opt) => {
          setField(opt.value);
        }}
      />
    </InlineEditorField>
  case 'image':
    return <ImageSelect input={input} key={key}/>
  }
  return <InlineEditorField label={input.label}>
    asdf
  </InlineEditorField>
});

interface ImplProps {
  type: string;
  shared: any;
  preset: any;
  middlePromptMode: boolean;
  element: WFIElement;
  getMiddlePrompt?: () => string;
  onMiddlePromptChange?: (txt: string) => void;
}

export const PreSetEditorImpl = observer(({type, shared, preset, element, middlePromptMode, getMiddlePrompt, onMiddlePromptChange }: ImplProps) => {
  const [editVibe, setEditVibe] = useState<WFIInlineInput|undefined>(undefined);
  const [showGroup, setShowGroup] = useState<string | undefined>(undefined);
  useEffect(() => {
    setShowGroup(undefined);
  }, [type]);
  return  <StackGrow>
      <WFElementContext.Provider value={{
        preset: preset,
        shared: shared,
        showGroup: showGroup,
        editVibe: editVibe,
        setEditVibe: setEditVibe,
        setShowGroup: setShowGroup,
        type: type,
        middlePromptMode,
        getMiddlePrompt,
        onMiddlePromptChange,
      }}>
        <WFGroupContext.Provider value={{}}>
          <VibeEditor disabled={false}/>
          <WFRenderElement
            element={element}
          />
        </WFGroupContext.Provider>
      </WFElementContext.Provider>
  </StackGrow>
});

interface InnerProps {
  type: string;
  shared: any;
  preset: any;
  element: WFIElement;
  middlePromptMode: boolean;
  nopad?: boolean;
  getMiddlePrompt?: () => string;
  onMiddlePromptChange?: (txt: string) => void;
}

interface UnionProps {
  general: boolean;
  type?: string;
  shared?: any;
  preset?: any;
  middlePromptMode: boolean;
  getMiddlePrompt?: () => string;
  onMiddlePromptChange?: (txt: string) => void;
}

export const InnerPreSetEditor = observer(({type, shared, preset, element, middlePromptMode, getMiddlePrompt, onMiddlePromptChange, nopad}: InnerProps) => {
  return <VerticalStack className={nopad ? "" : "p-3"}>
    <PreSetEditorImpl
      type={type}
      shared={shared}
      preset={preset}
      element={element}
      middlePromptMode={middlePromptMode}
      getMiddlePrompt={getMiddlePrompt}
      onMiddlePromptChange={onMiddlePromptChange}
      />
  </VerticalStack>
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
      curSession.presetShareds.set(workflowType, workFlowService.buildShared(workflowType));
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
        }}
      />
    </StackFixed>
    <PreSetEditorImpl
      type={workflowType}
      shared={shared}
      preset={presets!.find(x=>x.name === curSession.selectedWorkflow!.presetName)!}
      middlePromptMode={middlePromptMode}
      element={workFlowService.getGeneralEditor(workflowType)}
      getMiddlePrompt={getMiddlePrompt}
      onMiddlePromptChange={onMiddlePromptChange}
      />
  </VerticalStack>
});

export const UnionPreSetEditor = observer(({
  general,
  type,
  shared,
  preset,
  middlePromptMode,
  getMiddlePrompt,
  onMiddlePromptChange,
}: UnionProps) => {
  return general ? <PreSetEditor
    middlePromptMode={middlePromptMode}
    getMiddlePrompt={getMiddlePrompt}
    onMiddlePromptChange={onMiddlePromptChange}/> :
    <InnerPreSetEditor
      type={type!}
      shared={shared!}
      preset={preset!}
      element={workFlowService.getInnerEditor(type!)}
      middlePromptMode={middlePromptMode}
      getMiddlePrompt={getMiddlePrompt}
      onMiddlePromptChange={onMiddlePromptChange}/>
});

export default PreSetEditor;
