import { useContext, useEffect, useRef, useState } from 'react';
import BrushTool, {
  BrushToolRef,
  base64ToDataUri,
  getImageDimensions,
} from './BrushTool';
import { DropdownSelect, FileUploadBase64 } from './UtilComponents';
import { AppContext } from './App';
import PromptEditTextArea from './PromptEditTextArea';
import { Resolution, resolutionMap } from './backends/imageGen';
import { FaArrowsAlt, FaBrush, FaPaintBrush, FaUndo } from 'react-icons/fa';
import { TransformWrapper, TransformComponent } from 'react-zoom-pan-pinch';
import { isMobile, imageService, sessionService, backend } from './models';
import { dataUriToBase64 } from './models/ImageService';
import { InPaintScene } from './models/types';
import { extractPromptDataFromBase64 } from './models/util';

interface Props {
  editingScene: InPaintScene;
  onConfirm: () => void;
  onDelete: () => void;
}

let brushSizeSaved = 10;

const InPaintEditor = ({ editingScene, onConfirm, onDelete }: Props) => {
  const { pushMessage, curSession, selectedPreset, pushDialog } =
    useContext(AppContext)!;

  const resolutionOptions = Object.entries(resolutionMap)
    .map(([key, value]) => {
      return { label: `${value.width}x${value.height}`, value: key };
    })
    .filter((x) => !x.value.startsWith('small'));

  const [image, setImage] = useState('');
  const [width, setWidth] = useState(0);
  const [height, setHeight] = useState(0);
  const [mask, setMask] = useState<string | undefined>(undefined);
  const [resolution, setResolution] = useState('portrait');
  const [taskName, setTaskName] = useState('');
  const [brushSize, setBrushSize] = useState(brushSizeSaved);
  const [currentPrompt, setCurrentPrompt] = useState('');
  const [currentUC, setCurrentUC] = useState('');
  const [originalImage, setOriginalImage] = useState(false);
  const [sceneName, setSceneName] = useState('');
  const [brushing, setBrushing] = useState(true);
  useEffect(() => {
    if (isMobile) {
      setBrushing(false);
    }
    if (!editingScene) {
      setImage('');
      setMask(undefined);
      setTaskName('');
      setCurrentPrompt('');
      setResolution('portrait');
      setCurrentUC('');
      setOriginalImage(false);
      setSceneName('');
      return;
    }
    setImage('');
    setMask(undefined);
    setTaskName(editingScene.name);
    setResolution(editingScene.resolution);
    setCurrentPrompt(editingScene.prompt);
    setCurrentUC(editingScene.uc);
    setOriginalImage(editingScene.originalImage ?? false);
    setSceneName(editingScene.name);
    async function loadImage() {
      try {
        const data = await imageService.fetchImage(
          sessionService.getInpaintOrgPath(
            curSession!,
            editingScene as InPaintScene,
          ),
        );
        setImage(dataUriToBase64(data!));
      } catch (e) {
        pushMessage('인페인트 이미지를 불러오는데 실패했습니다.');
      }
    }
    async function loadMask() {
      try {
        const data = await imageService.fetchImage(
          sessionService.getInpaintMaskPath(
            curSession!,
            editingScene as InPaintScene,
          ),
        );
        setMask(dataUriToBase64(data!));
      } catch (e) {}
    }
    loadImage();
    loadMask();
    imageService.addEventListener('image-cache-invalidated', loadImage);
    return () => {
      imageService.removeEventListener('image-cache-invalidated', loadImage);
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

  const handleTaskNameChange = (event: any) => {
    setTaskName(event.target.value);
  };

  const deleteScene = () => {
    pushDialog({
      type: 'confirm',
      text: '정말로 해당 씬을 삭제하시겠습니까?',
      callback: () => {
        delete curSession!.inpaints[editingScene!.name];
        sessionService.markUpdated(curSession!.name);
        onConfirm();
        onDelete();
      },
    });
  };

  const confirm = async () => {
    if (image === '') {
      pushMessage('이미지를 넣어주세요.');
      return;
    }
    const mask = brushTool.current!.getMaskBase64();
    if (editingScene) {
      editingScene.resolution = resolution;
      editingScene.prompt = currentPrompt;
      editingScene.uc = currentUC;
      editingScene.originalImage = originalImage;
      await sessionService.saveInpaintImages(
        curSession!,
        editingScene,
        image,
        mask,
      );
      sessionService.markUpdated(curSession!.name);
      onConfirm();
    } else {
      if (!taskName || taskName === '') return;
      if (taskName in curSession!.inpaints) {
        pushMessage('이미 존재하는 씬 이름입니다.');
        return;
      }

      const newScene: InPaintScene = {
        type: 'inpaint',
        name: taskName,
        prompt: currentPrompt,
        uc: currentUC,
        resolution: resolution,
        imageMap: [],
        round: undefined,
        game: undefined,
      };
      curSession!.inpaints[taskName] = newScene;
      await sessionService.saveInpaintImages(
        curSession!,
        newScene,
        image,
        mask,
      );
      sessionService.markUpdated(curSession!.name);
      onConfirm();
    }
  };

  const brushTool = useRef<BrushToolRef | null>(null);
  return (
    <div className="md:flex py-4 h-full w-full overflow-hidden">
      <div className="px-3 flex flex-col grow-0 h-1/2 md:h-auto md:w-1/2 xl:w-1/3 gap-2 overflow-hidden">
        <div className="flex flex-wrap gap-2">
          <div className="mb-1 flex items-center gap-3 flex-none">
            <label className="gray-label">씬 이름: </label>
            <input
              type="text"
              className="gray-input flex-1"
              value={taskName}
              disabled={!!editingScene}
              onChange={handleTaskNameChange}
            />
            {editingScene && (
              <button className={`round-button back-red`} onClick={deleteScene}>
                삭제
              </button>
            )}
            <button className={`round-button back-sky`} onClick={confirm}>
              저장
            </button>
          </div>
          <div className="inline-flex md:flex gap-3 items-center flex-none text-eplsis overflow-hidden gap-3 mb-1">
            <span className="gray-label">이미지: </span>
            <div className="w-24 md:w-48">
              <FileUploadBase64
                onFileSelect={async (file: string) => {
                  try {
                    const [prompt, seed, scale, sampler, steps, uc] =
                      await extractPromptDataFromBase64(file);
                    setImage(file);
                    setCurrentPrompt(prompt);
                    setCurrentUC(uc);
                  } catch (e) {
                    pushMessage('NAI 에서 생성된 이미지가 아닙니다.');
                    setImage(file);
                  }
                }}
              ></FileUploadBase64>
            </div>
            {!isMobile && (
              <button
                className={`round-button back-sky`}
                onClick={() => {
                  const path = sessionService.getInpaintOrgPath(
                    curSession!,
                    editingScene as InPaintScene,
                  );
                  backend.openImageEditor(path);
                  backend.watchImage(path);
                }}
              >
                이미지 편집
              </button>
            )}
          </div>
          <div className="flex-none inline-flex md:flex whitespace-nowrap gap-3 items-center">
            {!isMobile && <span className="gray-label">해상도:</span>}
            <div className="w-36">
              <DropdownSelect
                options={resolutionOptions}
                menuPlacement="bottom"
                selectedOption={resolution}
                onSelect={(opt) => {
                  if (
                    opt.value.startsWith('large') ||
                    opt.value.startsWith('wallpaper')
                  ) {
                    pushDialog({
                      type: 'confirm',
                      text: '해당 해상도는 Anlas를 소모합니다 (유로임) 계속하시겠습니까?',
                      callback: () => {
                        setResolution(opt.value as Resolution);
                      },
                    });
                  } else {
                    setResolution(opt.value as Resolution);
                  }
                }}
              />
            </div>
          </div>
          <div className="flex-none flex whitespace-nowrap gap-3 items-center">
            <span className="gray-label">비마스크영역 편집 방지:</span>
            <input
              type="checkbox"
              checked={originalImage}
              onChange={(e) => {
                setOriginalImage(e.target.checked);
              }}
            />
          </div>
        </div>
        <div className="mt-auto flex-1 md:flex-none flex flex-col md:block overflow-hidden">
          <div className={'flex-none pt-2 pb-1 gray-label'}>프롬프트</div>
          <div className="flex-1 md:h-36 mb-2 overflow-hidden">
            <PromptEditTextArea
              value={currentPrompt}
              key={sceneName}
              onChange={(txt) => {
                setCurrentPrompt(txt);
              }}
            />
          </div>

          <div className={'flex-none pt-2 pb-1 gray-label'}>
            네거티브 프롬프트
          </div>
          <div className="flex-1 md:h-36 mb-2 overflow-hidden">
            <PromptEditTextArea
              value={currentUC}
              key={sceneName}
              onChange={(txt) => {
                setCurrentUC(txt);
              }}
            />
          </div>
        </div>
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
      </div>
      <TransformWrapper disabled={brushing} centerOnInit={true}>
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
        {!isMobile && (
          <div className="canvas-tooltip dark:text-white dark:bg-gray-600">
            ctrl+z 로 실행 취소 가능
          </div>
        )}
      </TransformWrapper>
    </div>
  );
};

export default InPaintEditor;
