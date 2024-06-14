import {
  createRef,
  useContext,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
} from 'react';
import {
  PromptPiece,
  PromptPieceSlot,
  Scene,
  Session,
  createPrompts,
  getMainImage,
  highlightPrompt,
  imageService,
  promptService,
  queueScenePrompt,
  renameScene,
  sessionService,
  taskQueueService,
} from './models';
import { CustomScrollbars, DropdownSelect, TabComponent, TextAreaWithUndo } from './UtilComponents';
import { FaPlay, FaPlus, FaStop, FaTimes } from 'react-icons/fa';
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
import { Resolution, resolutionMap } from '../main/imageGen';

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

const BigPromptEditor = ({ scene, onChanged }: SlotEditorProps) => {
  const { curSession, selectedPreset, pushMessage } = useContext(AppContext)!;
  const [image, setImage] = useState<string | null>(null);
  const [path, setPath] = useState<string | null>(null);
  const [_, rerender] = useState<{}>({});
  useEffect(() => {
    setPath(null);
    setImage(null);
    (async () => {
      const dataUri = await getMainImage(curSession!, scene, -1);
      setImage(dataUri);
    })();
  }, [scene]);
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

  return <div className="flex h-full">
    <div className="w-1/3 g-full">
      <PreSetEditor
        middlePromptMode={true}
        getMiddlePrompt={() => {
          if (scene.slots.length === 0 || scene.slots[0].length === 0) {
            return '';
          }
          return scene.slots[0][0].prompt
        }}
        onMiddlePromptChange={(txt) => {
          if (scene.slots.length === 0 || scene.slots[0].length === 0) {
            return;
          }
          scene.slots[0][0].prompt = txt;
          onChanged && onChanged();
        }}
        setSelectedPreset={() => {}} />
    </div>
    <div className="w-2/3 h-full">
      <div className="flex flex-col h-full">
        <div className="flex-1 overflow-hidden">
      {image && <img className="w-full h-full object-contain"
        src={image} />}
        </div>
        <div className="ml-auto flex-none flex gap-4 pt-2">
        {path && <button className={`${roundButton} bg-orange-400 h-8 w-36 flex items-center justify-center`}
          onClick={()=>{
            scene.main = path.split('/').pop()!;
            sessionService.mainImageUpdated();
            onChanged && onChanged();
          }}
        >메인이미지 지정
        </button>}
        <TaskProgressBar fast/>
        {!taskQueueService.isRunning() ? (
          <button
            className={`${roundButton} bg-green-500 h-8 w-36 flex items-center justify-center`}
            onClick={() => {
              (async () => {
                try {
                  const prompts = await createPrompts(curSession!, selectedPreset!, scene);
                  queueScenePrompt(curSession!, selectedPreset!, scene, prompts[0], 1, true, async (path: string) => {
                    const dataUri = await imageService.fetchImage(path);
                    setPath(path);
                    setImage(dataUri);
                  });
                  taskQueueService.run();
                } catch (e: any) {
                  pushMessage(e.message);
                  return;
                }
              })();
            }}
          >
            <FaPlay size={15} />
          </button>
        ) : (
          <button
            className={`${roundButton} bg-red-500 h-8 w-36 flex items-center justify-center`}
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

const SlotEditor = ({ scene, big, onChanged }: SlotEditorProps) => {
  const textAreaRef = useRef<any>([]);
  const [_, rerender] = useState<{}>({});
  const { curSession, selectedPreset, pushMessage } = useContext(AppContext)!;
  const dragItem = useRef<{
    piece: PromptPiece;
    slotIndex: number;
    pieceIndex: number;
  } | null>(null);

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

  const onDragStart = (
    e: any,
    piece: PromptPiece,
    slotIndex: number,
    pieceIndex: number,
  ) => {
    const eleRef = textAreaRef.current[slotIndex]?.[pieceIndex]?.current;
    if (eleRef) {
      const rect = eleRef.getBoundingClientRect();
      const isWithinElement =
        e.clientX >= rect.left &&
        e.clientX <= rect.right &&
        e.clientY >= rect.top &&
        e.clientY <= rect.bottom;
      if (isWithinElement) {
        e.preventDefault();
        return;
      }
    }
    dragItem.current = { piece, slotIndex, pieceIndex };
    e.dataTransfer.effectAllowed = 'move';
  };

  const onDragOver = (e: any) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
  };

  const onDrop = (
    e: any,
    targetSlotIndex: number,
    targetPieceIndex: number,
  ) => {
    e.preventDefault();
    const { piece, slotIndex, pieceIndex } = dragItem.current!;

    if (slotIndex === targetSlotIndex && pieceIndex === targetPieceIndex) {
      dragItem.current = null;
      return;
    }

    scene.slots[slotIndex].splice(pieceIndex, 1);
    scene.slots[targetSlotIndex].splice(targetPieceIndex, 0, piece);
    if (scene.slots[slotIndex].length === 0) {
      scene.slots.splice(slotIndex, 1);
    }

    onChanged && onChanged();

    dragItem.current = null;
  };

  return (
    <div className="flex w-full">
      {scene.slots.map((slot, slotIndex) => (
        <div key={slotIndex}>
          {slot.map((piece, pieceIndex) => (
            <div
              key={pieceIndex}
              draggable
              onDragStart={(e) => onDragStart(e, piece, slotIndex, pieceIndex)}
              onDragOver={onDragOver}
              onDrop={(e) => onDrop(e, slotIndex, pieceIndex)}
              className={'p-3 m-2 bg-gray-200 rounded-xl'}
            >
              <PromptEditTextArea
                innerRef={textAreaRef.current[slotIndex]?.[pieceIndex]}
                className={
                  'bg-gray-100 mb-3' + (big ? ' h-56 w-96' : ' h-24 w-48')
                }
                value={scene.slots[slotIndex][pieceIndex].prompt}
                onChange={(s) => {
                  scene.slots[slotIndex][pieceIndex].prompt = s;
                  onChanged && onChanged();
                }}
              />
              <div className="flex gap-2">
                <label>활성화</label>
                <input
                  type="checkbox"
                  checked={piece.enabled}
                  onChange={(e) => {
                    piece.enabled = e.currentTarget.checked;
                    onChanged && onChanged();
                  }}
                />
                <button
                  className="active:brightness-90 hover:brightness-95 ml-auto"
                  onClick={() => {
                    slot.splice(pieceIndex, 1);
                    if (slot.length === 0) {
                      scene.slots.splice(scene.slots.indexOf(slot), 1);
                    }
                    onChanged && onChanged();
                  }}
                >
                  <FaTrash size={big ? 25 : 20} color="#ef4444" />
                </button>
              </div>
            </div>
          ))}
          <button
            className="p-2 m-2 w-14 bg-gray-200 rounded-xl flex justify-center"
            onClick={() => {
              slot.push({ prompt: '', enabled: true });
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
          scene.slots.push([{ prompt: '', enabled: true }]);
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

  const [previews, setPreviews] = useState<string[]>([]);
  const [previewError, setPreviewError] = useState<string | null>(null);
  const PromptPreview = previewError ? (
    <div className="bg-red-500 p-2 m-2">{previewError}</div>
  ) : (
    <div>
      {previews.map((preview, index) => (
        <PromptHighlighter
          className="inline-block word-breaks p-2 m-2"
          key={index}
          text={preview}
        />
      ))}
    </div>
  );

  const SmallSlotEditor = (
    <SlotEditor scene={scene} big={false} onChanged={updateScene} />
  );

  const BigEditor = (
    <BigPromptEditor scene={scene} onChanged={updateScene} />
  );

  const resolutionOptions = Object.entries(resolutionMap).map(([key, value]) => {
    return { label: `${value.width}x${value.height}`, value: key};
  }).filter(x=>(!x.value.startsWith('small')));

  return (
    <div className="w-full h-full overflow-hidden">
      <div className="flex flex-col overflow-hidden flex-1 h-full">
      <div className="grow-0 pt-2 px-3 flex gap-3 items-center">
        <label>씬 이름:</label>
        <input
          className={grayInput}
          type="text"
          value={curName}
          onChange={(e) => {
            setCurName(e.currentTarget.value);
          }}
        />
        <label>해상도:</label>
        <div className="w-36">
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

        <button
          className={`${roundButton} ${primaryColor}`}
          onClick={async () => {
            if (curName in curSession!.scenes) {
              pushMessage('해당 이름의 씬이 이미 존재합니다');
              return;
            }
            const oldName = scene.name;
            await renameScene(curSession!, scene.name, curName);
            delete curSession!.scenes[oldName];
            curSession!.scenes[curName] = scene;
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
              callback: () => {
                delete curSession!.scenes[scene.name];
                updateScene();
                onClosed();
                if (onDeleted) {
                  onDeleted();
                }
              },
            });
          }}
        >
          삭제
        </button>
      </div>
      <div className="flex-1 overflow-hidden">
        <TabComponent
          left
          tabs={[
            { label: '프롬프트 에디터', content: BigEditor},
            { label: '조합 에디터', content: SmallSlotEditor },
            {
              label: '최종 프롬프트 미리보기',
              content: PromptPreview,
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
