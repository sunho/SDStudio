import { useContext, useEffect, useRef, useState } from 'react';
import BrushTool, {
  BrushToolRef,
  base64ToDataUri,
  getImageDimensions,
} from './BrushTool';
import { FileUploadBase64, FloatView, ToggleFloat } from './UtilComponents';
import {
  InPaintScene,
  createInPaintPrompt,
  extractMiddlePrompt,
  extractPromptFromBase64,
  promptService,
  sessionService,
  toPARR,
} from './models';
import { AppContext } from './App';
import { grayInput, primaryColor, roundButton } from './styles';
import { PromptEditTextArea, PromptHighlighter } from './SceneEditor';

interface Props {
  editingScene: InPaintScene | undefined;
  onConfirm: () => void;
}

const InPaintEditor = ({ editingScene, onConfirm }: Props) => {
  const { pushMessage, curSession, selectedPreset, pushDialog } =
    useContext(AppContext)!;

  const [image, setImage] = useState('');
  const [width, setWidth] = useState(0);
  const [height, setHeight] = useState(0);
  const [mask, setMask] = useState<string | undefined>(undefined);
  const [isLandscape, setIsLandscape] = useState(false);
  const [taskName, setTaskName] = useState('');
  const [brushSize, setBrushSize] = useState(10);
  const [middlePrompt, setMiddlePrompt] = useState('');
  const [preview, setPreview] = useState('');
  useEffect(() => {
    if (editingScene) {
      setImage(editingScene.image);
      setTaskName(editingScene.name);
      setIsLandscape(editingScene.landscape);
      setMiddlePrompt(editingScene.middlePrompt);
      setMask(editingScene.mask);
    } else {
      setImage('');
      setTaskName('');
      setMiddlePrompt('');
      setIsLandscape(false);
      setMask(undefined);
    }
  }, [editingScene]);
  useEffect(() => {
    getImageDimensions(image)
      .then(({ width, height }) => {
        setWidth(width);
        setHeight(height);
      })
      .catch(() => {});
  }, [image]);

  const handleLandscapeChange = (event) => {
    setIsLandscape(event.target.checked);
  };

  const handleTaskNameChange = (event) => {
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
      },
    });
  };

  const confirm = async () => {
    if (editingScene) {
      editingScene.image = image;
      editingScene.landscape = isLandscape;
      editingScene.middlePrompt = middlePrompt;
      editingScene.mask = brushTool.current!.getMaskBase64();
      sessionService.markUpdated(curSession!.name);
    } else {
      if (!taskName || taskName === '') return;
      if (taskName in curSession!.inpaints) {
        pushMessage('이미 존재하는 씬 이름입니다.');
        return;
      }

      const newScene: InPaintScene = {
        type: 'inpaint',
        name: taskName,
        image: image,
        middlePrompt: '',
        landscape: isLandscape,
        mask: brushTool.current!.getMaskBase64(),
        game: undefined,
      };
      curSession!.inpaints[taskName] = newScene;
      sessionService.markUpdated(curSession!.name);
    }
    onConfirm();
  };
  const createPrompt = async () => {
    let prompt = toPARR(selectedPreset!.frontPrompt);
    prompt = prompt.concat(toPARR(middlePrompt));
    prompt = prompt.concat(toPARR(selectedPreset!.backPrompt));
    const expanded = await promptService.expandPARR(
      prompt,
      curSession!,
      editingScene,
    );
    return expanded.join(', ');
  };

  useEffect(() => {
    (async () => {
      try {
        setPreview(await createPrompt());
      } catch (e: any) {
        setPreview('error: ' + e.message);
      }
    })();
  }, [middlePrompt]);

  const brushTool = useRef<BrushToolRef | null>(null);
  return (
    <FloatView onClose={onConfirm}>
      <div className="flex h-full w-full">
        <div className="px-3 flex flex-col grow-0 w-1/2 xl:w-1/3 gap-2">
          <div className="mb-2 flex items-center gap-3 flex-none">
            <label>
              씬 이름:{' '}
              <input
                type="text"
                className={grayInput}
                value={taskName}
                disabled={!!editingScene}
                onChange={handleTaskNameChange}
              />
            </label>

            {editingScene && (
              <button
                className={`${roundButton} bg-red-500`}
                onClick={deleteScene}
              >
                삭제
              </button>
            )}
            <button
              className={`${roundButton} ${primaryColor}`}
              onClick={confirm}
            >
              저장
            </button>
          </div>
          <div className="flex gap-3 items-center flex-none text-eplsis overflow-hidden ">
            <div className="flex gap-2 items-center">
              <span>이미지: </span>
              <div className="w-48">
                <FileUploadBase64
                  onFileSelect={async (file: string) => {
                    const prompt = await extractPromptFromBase64(file);
                    console.log(prompt);
                    const middle = await extractMiddlePrompt(
                      selectedPreset!,
                      prompt,
                    );
                    setImage(file);
                    setMiddlePrompt(middle);
                  }}
                ></FileUploadBase64>
              </div>
              <span className="ml-3">
                가로해상도:{' '}
                <input
                  type="checkbox"
                  checked={isLandscape}
                  onChange={handleLandscapeChange}
                />
              </span>
            </div>
          </div>
          <div className="mt-auto flex-none">
            <div className="text-xl mb-2">중간 프롬프트:</div>
            <PromptEditTextArea
              value={middlePrompt}
              onChange={(txt) => {
                setMiddlePrompt(txt);
              }}
              className="bg-gray-200 h-48 mb-2"
            />
            <div className="text-xl mb-2">최종 프롬프트 미리보기:</div>
            <div>
              <PromptHighlighter
                text={preview}
                className="bg-gray-200 h-48 overflow-auto"
              />
            </div>
          </div>
          <div className="flex items-center gap-4 ml-auto pb-2">
            <label htmlFor="brushSize">브러시 크기: {brushSize}</label>
            <input
              id="brushSize"
              type="range"
              min="1"
              max="100"
              value={brushSize}
              onChange={(e) => setBrushSize(e.target.value)}
            />
            <button
              className={`${roundButton} ${primaryColor}`}
              onClick={() => brushTool.current!.clear()}
            >
              마스크 초기화
            </button>
          </div>
        </div>
        <div className="w-1/2 xl:w-2/3 h-full overflow-hidden flex relative justify-center items-center">
          <BrushTool
            brushSize={brushSize}
            mask={mask ? base64ToDataUri(mask) : undefined}
            ref={brushTool}
            image={base64ToDataUri(image)}
            imageWidth={width}
            imageHeight={height}
          />
          <div className="canvas-tooltip">ctrl+z 로 실행 취소 가능</div>
        </div>
      </div>
    </FloatView>
  );
};

export default InPaintEditor;
