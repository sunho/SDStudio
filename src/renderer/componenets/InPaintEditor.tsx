import { useContext, useEffect, useRef, useState } from 'react';
import BrushTool, {
  BrushToolRef,
  base64ToDataUri,
  getImageDimensions,
} from './BrushTool';
import { DropdownSelect, } from './UtilComponents';
import { Resolution, resolutionMap } from '../backends/imageGen';
import { FaArrowAltCircleLeft, FaArrowLeft, FaArrowsAlt, FaPaintBrush, FaPlay, FaStop, FaUndo } from 'react-icons/fa';
import { TransformWrapper, TransformComponent } from 'react-zoom-pan-pinch';
import {
  isMobile,
  imageService,
  workFlowService,
  taskQueueService,
} from '../models';
import { dataUriToBase64 } from '../models/ImageService';
import { InpaintScene } from '../models/types';
import { extractPromptDataFromBase64 } from '../models/util';
import { appState } from '../models/AppService';
import { observer } from 'mobx-react-lite';
import { InnerPreSetEditor } from './PreSetEdtior';
import { reaction } from 'mobx';
import { FloatView } from './FloatView';
import { TaskProgressBar } from './TaskQueueControl';
import { queueI2IWorkflow } from '../models/TaskQueueService';

interface Props {
  editingScene: InpaintScene;
  onConfirm: () => void;
  onDelete: () => void;
}

let brushSizeSaved = 10;

const InPaintEditor = observer(
  ({ editingScene, onConfirm, onDelete }: Props) => {
    const [_, rerender] = useState({});
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
    const { curSession } = appState;
    const resolutionOptions = Object.entries(resolutionMap)
      .map(([key, value]) => {
        const resolVal = (editingScene.resolutionWidth ?? '') + 'x' + (editingScene.resolutionHeight ?? '');
        if (key === 'custom') return { label: '커스텀 (' + resolVal + ')', value: key };
        return { label: `${value.width}x${value.height}`, value: key };
      })
      .filter((x) => !x.value.startsWith('small'));

    const [image, setImage] = useState('');
    const [width, setWidth] = useState(0);
    const [height, setHeight] = useState(0);
    const [mask, setMask] = useState<string | undefined>(undefined);
    const [brushSize, setBrushSize] = useState(brushSizeSaved);
    const [brushing, setBrushing] = useState(true);
    const [open, setOpen] = useState(false);
    const def = workFlowService.getDef(editingScene.workflowType);
    useEffect(() => {
      if (isMobile) {
        setBrushing(false);
      }
      if (!editingScene) {
        setImage('');
        setMask(undefined);
        return;
      }
      setImage('');
      setMask(undefined);
      async function loadImage() {
        try {
          const data = await imageService.fetchVibeImage(
            curSession!,
            editingScene.preset.image,
          );
          setImage(dataUriToBase64(data!));
        } catch (e) {
          appState.pushMessage('인페인트 이미지를 불러오는데 실패했습니다.');
        }
      }
      async function loadMask() {
        try {
          const data = await imageService.fetchVibeImage(
            curSession!,
            editingScene.preset.mask,
          );
          setMask(dataUriToBase64(data!));
        } catch (e) {}
      }
      const dispose = reaction(
        () => editingScene.preset.image,
        () => {
          loadImage();
        }
      );
      loadImage();
      if (def.hasMask) loadMask();
      else setBrushing(false);
      imageService.addEventListener('image-cache-invalidated', loadImage);
      return () => {
        imageService.removeEventListener('image-cache-invalidated', loadImage);
        dispose();
      };
    }, [editingScene]);
    useEffect(() => {
      if (brushing) {
        brushTool.current!.startBrushing();
      } else {
        brushTool.current!.stopBrushing();
      }
    }, [brushing]);
    useEffect(() => {
      getImageDimensions(image)
        .then(({ width, height }) => {
          setWidth(width);
          setHeight(height);
        })
        .catch(() => {});
    }, [image]);

    const deleteScene = () => {
      appState.pushDialog({
        type: 'confirm',
        text: '정말로 해당 씬을 삭제하시겠습니까?',
        callback: () => {
          curSession!.inpaints.delete(editingScene!.name);
          onConfirm();
          onDelete();
        },
      });
    };

    const saveMask = async () => {
      if (def.hasMask) {
        const mask = await brushTool.current!.getMaskBase64();
        if (!editingScene.preset.mask) {
          editingScene.preset.mask = await imageService.storeVibeImage(
            curSession!,
            mask,
          );
        } else {
          await imageService.writeVibeImage(
            curSession!,
            editingScene.preset.mask,
            mask,
          );
        }
      }
    };

    const confirm = async () => {
      await saveMask();
      onConfirm();
    };

    const brushTool = useRef<BrushToolRef | null>(null);
    return (
      <div className="flex flex-col md:flex-row py-3 h-full w-full overflow-hidden">
        <div className="px-3 flex flex-col flex-none md:h-auto md:w-1/2 xl:w-1/3 gap-2 overflow-hidden">
          <div className="flex flex-wrap gap-2">
            <div className="mb-1 flex items-center gap-3 flex-none">
              <label className="gray-label">씬 이름: </label>
              <input
                type="text"
                className="gray-input flex-1"
                value={editingScene.name}
                onChange={(e) => {
                  editingScene.name = e.target.value;
                }}
              />
              {editingScene && (
                <button
                  className={`round-button back-red`}
                  onClick={deleteScene}
                >
                  삭제
                </button>
              )}
              <button className={`round-button back-sky`} onClick={confirm}>
                저장
              </button>
            </div>
            <div className="flex-none inline-flex md:flex whitespace-nowrap gap-3 items-center">
              {!isMobile && <span className="gray-label">해상도:</span>}
              <div className="w-36">
                <DropdownSelect
                  options={resolutionOptions}
                  menuPlacement="bottom"
                  selectedOption={editingScene.resolution}
                  onSelect={async (opt) => {
                    if (
                      opt.value.startsWith('large') ||
                      opt.value.startsWith('wallpaper')
                    ) {
                      appState.pushDialog({
                        type: 'confirm',
                        text: '해당 해상도는 Anlas를 소모합니다 (유로임) 계속하시겠습니까?',
                        callback: () => {
                          editingScene.resolution = opt.value as Resolution;
                        },
                      });
                    } else if (opt.value === 'custom') {
                      const width = await appState.pushDialogAsync({
                        type: 'input-confirm',
                        text: '해상도 너비를 입력해주세요'
                      });
                      if (width == null) return;
                      const height = await appState.pushDialogAsync({
                        type: 'input-confirm',
                        text: '해상도 높이를 입력해주세요'
                      });
                      if (height == null) return;
                      try {
                        const customResolution = { width: parseInt(width), height: parseInt(height) };
                        editingScene.resolution = opt.value as Resolution;
                        editingScene.resolutionWidth = (customResolution.width + 63) & ~63;
                        editingScene.resolutionHeight = (customResolution.height + 63) & ~63;
                      } catch (e: any) {
                        appState.pushMessage(e.message);
                      }
                    } else {
                      editingScene.resolution = opt.value as Resolution;
                    }
                  }}
                />
              </div>
            </div>
          </div>
          {open && <FloatView priority={1} onEscape={() => setOpen(false)}>
            <InnerPreSetEditor
              type={editingScene.workflowType}
              preset={editingScene.preset}
              shared={undefined}
              element={workFlowService.getI2IEditor(editingScene.workflowType)}
              middlePromptMode={false}
            />
          </FloatView>}
          <div className="flex-none md:hidden mb-2">
            <button className="round-button back-sky w-full" onClick={() => setOpen(true)}>
              씬 세팅 열기
            </button>
          </div>
          <div className="flex-1 hidden md:block overflow-hidden">
            <InnerPreSetEditor
              nopad
              type={editingScene.workflowType}
              preset={editingScene.preset}
              shared={undefined}
              element={workFlowService.getI2IEditor(editingScene.workflowType)}
              middlePromptMode={false}
            />
          </div>
          {def.hasMask && (
            <div className="flex items-center gap-2 md:gap-4 md:ml-auto pb-2 overflow-hidden w-full">
              {
                <button
                  className={`rounded-full h-8 w-8 back-gray flex-none flex items-center justify-center clickable`}
                  onClick={() => {
                    setBrushing(!brushing);
                  }}
                >
                  {brushing ? <FaArrowsAlt /> : <FaPaintBrush />}
                </button>
              }
              {isMobile && (
                <button
                  className={`rounded-full h-8 w-8 back-gray flex-none flex items-center justify-center clickable`}
                  onClick={() => {
                    brushTool.current!.undo();
                  }}
                >
                  <FaUndo />
                </button>
              )}
              <label className="flex-none gray-label" htmlFor="brushSize">
                {isMobile ? '' : '브러시 크기:'}{' '}
                <span className="inline-block w-4">{brushSize}</span>
              </label>
              <input
                id="brushSize"
                type="range"
                min="1"
                max="100"
                value={brushSize}
                className="inline-block flex-1 min-w-0 md:max-w-40"
                onChange={(e: any) => {
                  setBrushSize(e.target.value);
                  brushSizeSaved = e.target.value;
                }}
              />
              <button
                className={`round-button back-sky flex-none`}
                onClick={() => brushTool.current!.clear()}
              >
                {isMobile ? '' : '마스크'}초기화
              </button>
            </div>
          )}
        </div>
        <div className="flex flex-col flex-1 overflow-hidden">
          <div className="flex-1 overflow-hidden">
            <TransformWrapper
              disabled={def.hasMask && brushing}
              minScale={0.7}
              initialScale={0.7}
              centerOnInit={true}
            >
              <TransformComponent wrapperClass="wrapper flex-none items-center justify-center">
                <BrushTool
                  brushSize={brushSize}
                  mask={mask ? base64ToDataUri(mask) : undefined}
                  ref={brushTool}
                  image={base64ToDataUri(image)}
                  imageWidth={width}
                  imageHeight={height}
                />
              </TransformComponent>
              {!isMobile && def.hasMask && (
                <div className="canvas-tooltip dark:text-white dark:bg-gray-600">
                  ctrl+z 로 실행 취소 가능
                </div>
              )}
            </TransformWrapper>
          </div>
          <div className="flex-none flex ml-auto gap-2 items-center mr-2 mt-2">
            <button className={`round-button back-gray h-8 w-16 flex items-center justify-center`} onClick={async () => {
              if (!image || !editingScene.preset.image) return;
              await imageService.writeVibeImage(curSession!, editingScene.preset.image, image);
            }}><FaArrowLeft size={20}/></button>
            <TaskProgressBar fast />
            {!taskQueueService.isRunning() ? (
              <button
                className={`round-button back-green h-8 w-16 md:w-36 flex items-center justify-center`}
                onClick={async () => {
                  await saveMask();
                  await queueI2IWorkflow(curSession!, editingScene.workflowType, editingScene.preset, editingScene, 1, (path: string) => {
                    (async () => {
                      const data = await imageService.fetchImage(path);
                      setImage(dataUriToBase64(data!));
                    })();
                  });
                  taskQueueService.run();
                }}
              >
                <FaPlay size={15} />
              </button>
            ) : (
              <button
                className={`round-button back-red h-8 w-16 md:w-36 flex items-center justify-center`}
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
    );
  },
);

export default InPaintEditor;
