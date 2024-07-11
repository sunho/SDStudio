import {
  createRef,
  useContext,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
} from 'react';
import {
  PreSet,
    PreSetMode,
    PromptNode,
  PromptPiece,
  PromptPieceSlot,
  Scene,
  Session,
  backend,
  createPrompts,
  getMainImage,
  getMainImagePath,
  highlightPrompt,
  imageService,
  isMobile,
  lowerPromptNode,
  promptService,
  queueScenePrompt,
  renameScene,
  sessionService,
  taskQueueService,
} from './models';
import { CustomScrollbars, DropdownSelect, TabComponent, TextAreaWithUndo } from './UtilComponents';
import { FaImages, FaPlay, FaPlus, FaPuzzlePiece, FaSearch, FaStar, FaStop, FaTimes } from 'react-icons/fa';
import { FaTrash } from 'react-icons/fa';
import { AppContext } from './App';
import Denque from 'denque';
import { writeFileSync } from 'original-fs';
import { grayInput, primaryColor, roundButton } from './styles';
import { windowsStore } from 'process';
import Scrollbars from 'react-custom-scrollbars-2';
import PromptEditTextArea from './PromptEditTextArea';
import PreSetEditor from './PreSetEdtior';
import { TaskProgressBar } from './TaskQueueControl';
import { Resolution, resolutionMap } from './backends/imageGen';
import { FloatView } from './FloatView';
import { v4 as uuidv4 } from 'uuid';
import { useDrag, useDrop } from 'react-dnd';
import { getEmptyImage } from 'react-dnd-html5-backend';

interface Props {
  scene: Scene;
  onClosed: () => void;
  onDeleted?: () => void;
}
interface PromptHighlighterProps {
  text: string;
  className?: string;
}

export const PromptHighlighter = ({
  className,
  text,
}: PromptHighlighterProps) => {
  const { curSession } = useContext(AppContext)!;
  return (
    <div
      className={'max-w-full break-words bg-gray-200 ' + (className ?? '')}
      dangerouslySetInnerHTML={{ __html: highlightPrompt(curSession!, text) }}
    ></div>
  );
};

interface SlotEditorProps {
  scene: Scene;
  big?: boolean;
  onChanged?: () => void;
}

interface BigPromptEditorProps {
  selectedPreset: PreSet;
  sceneMode: boolean;
  presetMode: PreSetMode;
  getMiddlePrompt: () => string;
  setMiddlePrompt: (txt: string) => void;
  queuePrompt: (middle: string, callback: (path: string) => void) => void;
  setMainImage?: (path: string) => void;
  initialImagePath?: string;
}

export const BigPromptEditor = ({ sceneMode, selectedPreset, presetMode, getMiddlePrompt, setMiddlePrompt, initialImagePath, queuePrompt, setMainImage }: BigPromptEditorProps) => {
  const { curSession, pushMessage, setSelectedPreset } = useContext(AppContext)!;
  const [image, setImage] = useState<string | undefined>(undefined);
  const [path, setPath] = useState<string | undefined>(initialImagePath);
  const [_, rerender] = useState<{}>({});
  useEffect(() => {
    setImage(undefined);
    (async () => {
      if (path) {
        const dataUri = await imageService.fetchImage(path);
        setImage(dataUri!);
      }
    })();
  }, [path]);
  useEffect(() => {
    const handleProgress = () => {
      rerender({});
    };
    taskQueueService.addEventListener('start', handleProgress);
    taskQueueService.addEventListener('stop', handleProgress);
    taskQueueService.addEventListener('progress', handleProgress);
    return () => {
      taskQueueService.removeEventListener('start', handleProgress);
      taskQueueService.removeEventListener('stop', handleProgress);
      taskQueueService.removeEventListener('progress', handleProgress);
    };
  });

  const [promptOpen, setPromptOpen] = useState(false);
  const [editDisabled, setEditDisabled] = useState(true);

  useEffect(() => {
    const timer = setTimeout(() => {
      setEditDisabled(false);
    }, 100);
    return () => {
      clearTimeout(timer);
    };
  },[]);

  return <div className="flex h-full flex-col md:flex-row">
    {promptOpen && <FloatView priority={0} onEscape={()=>{setPromptOpen(false)}}>
      <PreSetEditor
        middlePromptMode={true}
        type={presetMode}
        selectedPreset={selectedPreset!}
        styleEditMode={!sceneMode}
        getMiddlePrompt={getMiddlePrompt}
        onMiddlePromptChange={setMiddlePrompt}
        setSelectedPreset={setSelectedPreset} />
    </FloatView>}
    <div className={"overflow-auto flex-none h-1/3 md:h-auto md:w-1/3 md:h-full"}>
      <div className={"hidden md:block h-full "}>
        <PreSetEditor
          middlePromptMode={true}
          selectedPreset={selectedPreset!}
          type={presetMode}
          styleEditMode={!sceneMode}
          getMiddlePrompt={getMiddlePrompt}
          onMiddlePromptChange={setMiddlePrompt}
          setSelectedPreset={setSelectedPreset} />
      </div>
      <div className="h-full flex flex-col p-2 overflow-hidden block md:hidden">
        <div className="flex-none font-bold">중위 프롬프트 (이 씬에만 적용됨):</div>
        <div className="flex-1 p-2 overflow-hidden"><PromptEditTextArea disabled={editDisabled} onChange={setMiddlePrompt} value={getMiddlePrompt()}/></div>
        <div className="flex-none"><button className={`${roundButton} ${primaryColor}`} onClick={() => setPromptOpen(true)}>상세설정</button></div>
      </div>
    </div>
    <div className="flex-none h-2/3 md:h-auto md:w-2/3 overflow-hidden">
      <div className="flex flex-col h-full">
        <div className="flex-1 overflow-hidden">
      {image && <img className="w-full h-full object-contain"
        src={image} />}
        </div>
        <div className="ml-auto flex-none flex gap-4 pt-2 mb-2 md:mb-0">
        {path && <button className={`${roundButton} bg-orange-400 h-8 md:w-36 flex items-center justify-center`}
          onClick={()=>{
            setMainImage && setMainImage(path);
          }}
        >
          {sceneMode?(!isMobile?"즐겨찾기 지정":<FaStar/>):"프로필 지정"}
        </button>}
        <TaskProgressBar fast/>
        {!taskQueueService.isRunning() ? (
          <button
            className={`${roundButton} bg-green-500 h-8 w-16 md:w-36 flex items-center justify-center`}
            onClick={()=>{
              queuePrompt(getMiddlePrompt(), (path: string) => {
                setPath(path);
              });
            }}
          >
            <FaPlay size={15} />
          </button>
        ) : (
          <button
            className={`${roundButton} bg-red-500 h-8 w-16 md:w-36 flex items-center justify-center`}
            onClick={() => {
              taskQueueService.removeAllTasks();
              taskQueueService.stop();
            }}
          >
            <FaStop size={15} />
          </button>
        )}
        </div>
      </div>
    </div>
  </div>
};

interface SlotPieceProps {
  scene: Scene;
  piece: PromptPiece;
  onChanged?: () => void;
  removePiece?: (piece: PromptPiece) => void;
  moveSlotPiece?: (from: string, to: string) => void;
  style?: React.CSSProperties;
}

export const SlotPiece = ({ scene, piece, onChanged, removePiece, moveSlotPiece, style }: SlotPieceProps) => {
  const [{ isDragging }, drag, preview] = useDrag(
    () => ({
      type: 'slot',
      item: { scene, piece },
      collect: (monitor) => {
        return {
          isDragging: monitor.isDragging(),
        }
      },
    }),
    [scene, piece],
  )

  const [{ isOver }, drop] = useDrop(
    () => ({
      accept: 'slot',
      canDrop: () => true,
      collect: (monitor) => {
        if (monitor.isOver()) {
          return {
            isOver: true,
          }
        }
        return { isOver: false }
      },
      drop: async (item: any, monitor) => {
        if (!moveSlotPiece) return;
        moveSlotPiece(item.piece.id, piece.id!);
      },
    }), [scene, piece],
  )

  useEffect(() => {
    preview(getEmptyImage(), { captureDraggingState: true });
  }, [preview]);

  return <div
    key={piece.id!}
    ref={(node) => drag(drop(node))}
    style={style}
    className={'p-3 m-2 bg-gray-200 rounded-xl ' + (isDragging ? 'opacity-0' : '') + (isOver ? ' outline outline-sky-500' : '')}
  >
    <div className={"mb-3 h-12 w-28 md:h-24 md:w-48"}>
    <PromptEditTextArea
      whiteBg
      disabled={!moveSlotPiece}
      value={piece.prompt}
      onChange={(s) => {
        if (!moveSlotPiece) return;
        piece.prompt = s;
        onChanged && onChanged();
      }}
    />
    </div>
    <div className="flex gap-2 select-none">
      <label>활성화</label>
      <input
        type="checkbox"
        checked={piece.enabled}
        onChange={(e) => {
          if (!moveSlotPiece) return;
          piece.enabled = e.currentTarget.checked;
          onChanged && onChanged();
        }}
      />
      <button
        className="active:brightness-90 hover:brightness-95 ml-auto"
        onClick={() => {
          if (!moveSlotPiece) return;
          removePiece && removePiece(piece);
        }}
      >
        <FaTrash size={20} color="#ef4444" />
      </button>
    </div>
  </div>
}

const SlotEditor = ({ scene, big, onChanged }: SlotEditorProps) => {
  const textAreaRef = useRef<any>([]);
  const [_, rerender] = useState<{}>({});
  const { curSession, selectedPreset, pushMessage } = useContext(AppContext)!;
  useEffect(() => {
    for (const slot of scene.slots) {
      for (const piece of slot) {
        if (!piece.id) {
          piece.id = uuidv4();
        }
      }
    }
  },[scene]);

  useEffect(() => {
    let dirty = false;
    for (let i = 0; i < scene.slots.length; i++) {
      if (i >= textAreaRef.current.length) {
        textAreaRef.current.push([]);
        dirty = true;
      }
      if (textAreaRef.current[i].length !== scene.slots[i].length) {
        textAreaRef.current[i] = Array(scene.slots[i].length)
          .fill(0)
          .map((x) => createRef());
        dirty = true;
      }
    }
    if (dirty) {
      rerender({});
    }
  });

  const removePiece = (slot: PromptPieceSlot, pieceIndex: number) => {
    slot.splice(pieceIndex, 1);
    if (slot.length === 0) {
      scene.slots.splice(scene.slots.indexOf(slot), 1);
    }
    onChanged && onChanged();
    rerender({});
  };

  const moveSlotPiece = (
    from: string,
    to: string,
  ) => {
    if (from === to)
      return;
    const fromSlotIndex = scene.slots.findIndex((slot) =>
      slot.some((piece) => piece.id === from),
    );
    const fromPieceIndex = scene.slots[fromSlotIndex].findIndex(
      (piece) => piece.id === from,
    );
    const toSlotIndex = scene.slots.findIndex((slot) =>
      slot.some((piece) => piece.id === to),
    );
    const toPieceIndex = scene.slots[toSlotIndex].findIndex(
      (piece) => piece.id === to,
    );

    const piece = scene.slots[fromSlotIndex][fromPieceIndex];
    scene.slots[fromSlotIndex].splice(fromPieceIndex, 1);
    scene.slots[toSlotIndex].splice(toPieceIndex, 0, piece);
    if (scene.slots[fromSlotIndex].length === 0) {
      scene.slots.splice(fromSlotIndex, 1);
    }

    onChanged && onChanged();
  };

  return (
    <div className="flex w-full">
      {scene.slots.map((slot, slotIndex) => (
        <div key={slotIndex}>
          {slot.map((piece, pieceIndex) => (
            <SlotPiece key={piece.id!} scene={scene} piece={piece} onChanged={onChanged} removePiece={(piece: PromptPiece) => removePiece(slot, slot.indexOf(piece)!)} moveSlotPiece={moveSlotPiece}/>
          ))}
          <button
            className="p-2 m-2 w-14 bg-gray-200 rounded-xl flex justify-center"
            onClick={() => {
              slot.push({ prompt: '', enabled: true, id: uuidv4()});
              onChanged && onChanged();
            }}
          >
            <FaPlus />
          </button>
        </div>
      ))}
      <button
        className="p-2 m-2 h-14 flex items-center bg-gray-200 rounded-xl"
        onClick={() => {
          scene.slots.push([{ prompt: '', enabled: true, id: uuidv4() }]);
          onChanged && onChanged();
        }}
      >
        <FaPlus />
      </button>
    </div>
  );
};

const SceneEditor = ({ scene, onClosed, onDeleted }: Props) => {
  const [_, rerender] = useState<{}>({});
  const { curSession, selectedPreset, pushMessage, pushDialog } =
    useContext(AppContext)!;
  const [curName, setCurName] = useState('');

  useEffect(() => {
    setCurName(scene.name);
  }, [scene]);

  const updateScene = () => {
    sessionService.markUpdated(curSession!.name);
    rerender({});
  };

  const getMiddlePrompt = () => {
    if (scene.slots.length === 0 || scene.slots[0].length === 0) {
      return '';
    }
    return scene.slots[0][0].prompt
  };

  const onMiddlePromptChange = (txt: string) => {
    if (scene.slots.length === 0 || scene.slots[0].length === 0) {
      return;
    }
    scene.slots[0][0].prompt = txt;
  }

  const queuePrompt = async (middle: string, callback: (path: string) => void) => {
    try {
      const prompts = await createPrompts(curSession!, selectedPreset!, scene);
      queueScenePrompt(curSession!, selectedPreset!, scene, prompts[0], 1, true, async (path: string) => {
        callback(path);
      });
      taskQueueService.run();
    } catch (e: any) {
      pushMessage(e.message);
      return;
    }
  };

  const setMainImage = (path: string) => {
    const filename = path.split('/').pop()!;
    if (!(filename in scene.mains)) {
      scene.mains.push(filename);
    }
    sessionService.mainImageUpdated();
  };

  const [previews, setPreviews] = useState<PromptNode[]>([]);
  const [previewError, setPreviewError] = useState<string | null>(null);
  const PromptPreview = previewError ? (
    <div className="bg-red-500 p-2 m-2">{previewError}</div>
  ) : (
    <div>
      {previews.map((preview, index) => (
        <PromptHighlighter
          className="inline-block word-breaks p-2 m-2"
          key={index}
          text={lowerPromptNode(preview)}
        />
      ))}
    </div>
  );

  const SmallSlotEditor = (
    <SlotEditor scene={scene} big={false} onChanged={updateScene} />
  );

  const BigEditor = (
    <BigPromptEditor sceneMode={true}
      presetMode={curSession!.presetMode}
      selectedPreset={selectedPreset!}
      getMiddlePrompt={getMiddlePrompt}
      setMiddlePrompt={onMiddlePromptChange}
      queuePrompt={queuePrompt}
      setMainImage={setMainImage}
      initialImagePath={getMainImagePath(curSession!, scene)} />
  );

  const resolutionOptions = Object.entries(resolutionMap).map(([key, value]) => {
    return { label: `${value.width}x${value.height}`, value: key};
  }).filter(x=>(!x.value.startsWith('small')));

  return (
    <div className="w-full h-full overflow-hidden">
      <div className="flex flex-col overflow-hidden h-full w-full">
      <div className="grow-0 pt-2 px-3 flex gap-3 items-center text-nowrap flex-wrap mb-2 md:mb-0">
        <div className="flex items-center gap-2">
        <label>씬 이름:</label>
        <input
          className={grayInput}
          type="text"
          value={curName}
          onChange={(e) => {
            setCurName(e.currentTarget.value);
          }}
        />
        </div>
        <div className="flex items-center gap-2 ">
        <label>해상도:</label>
        <div className="md:w-36">
          <DropdownSelect
            options={resolutionOptions}
            menuPlacement='bottom'
            selectedOption={scene.resolution}
            onSelect={(opt) => {
              if (opt.value.startsWith('large') || opt.value.startsWith('wallpaper')) {
                pushDialog({
                  type: 'confirm',
                  text: '해당 해상도는 Anlas를 소모합니다 (유로임) 계속하시겠습니까?',
                  callback: () => {
                    scene.resolution = opt.value as Resolution;
                    updateScene();
                  },
                });
              } else {
                scene.resolution = opt.value as Resolution;
                updateScene();
              }
            }}
          />
        </div>
        </div>

        <button
          className={`${roundButton} ${primaryColor}`}
          onClick={async () => {
            if (curName in curSession!.scenes) {
              pushMessage('해당 이름의 씬이 이미 존재합니다');
              return;
            }
            const oldName = scene.name;
            await renameScene(curSession!, scene.name, curName);
            updateScene();
          }}
        >
          이름 변경
        </button>
        <button
          className={`${roundButton} bg-red-500`}
          onClick={() => {
            pushDialog({
              type: 'confirm',
              text: '정말로 해당 씬을 삭제하시겠습니까?',
              callback: async () => {
                delete curSession!.scenes[scene.name];
                updateScene();
                onClosed();
                if (onDeleted) {
                  onDeleted();
                }
                await backend.trashFile(imageService.getOutputDir(curSession!, scene));
              },
            });
          }}
        >
          삭제
        </button>
      </div>
      <div className="flex-1 overflow-hidden">
        <TabComponent
          tabs={[
            { label: '프롬프트 에디터', content: BigEditor, emoji: <FaImages/>},
            { label: '조합 에디터', content: SmallSlotEditor, emoji: <FaPuzzlePiece/>},
            {
              label: '최종 프롬프트 미리보기',
              content: PromptPreview,
              emoji: <FaSearch/>,
              onClick: () => {
                (async () => {
                  try {
                    const prompts = await createPrompts(
                      curSession!,
                      selectedPreset!,
                      scene,
                    );
                    setPreviews(prompts);
                  } catch (e: any) {
                    setPreviewError(e.message);
                  }
                })();
              },
            },
          ]}
        />
      </div>
    </div>
  </div>
  );
};

export default SceneEditor;
