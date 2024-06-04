import { useContext, useEffect, useRef, useState } from 'react';
import {
  Session,
  Scene,
  imageService,
  invoke,
  promptService,
  queueScene,
  sessionService,
  taskQueueService,
  toPARR,
  GenericScene,
  getCollection,
  setCollection,
  queueGenericScene,
  removeTaskFromGenericScene,
  statsGenericSceneTasks,
  InPaintScene,
  extractPromptFromBase64,
  extractMiddlePrompt,
} from './models';
import { AppContext } from './App';
import { FloatView, ToggleFloat } from './UtilComponents';
import SceneEditor from './SceneEditor';
import { primaryColor, roundButton } from './styles';
import {
  FaCalendarPlus,
  FaEdit,
  FaImages,
  FaPlus,
  FaRegCalendarPlus,
  FaRegCalendarTimes,
} from 'react-icons/fa';
import Tournament from './Tournament';
import ResultViewer from './ResultViewer';
import InPaintEditor from './InPaintEditor';
import { base64ToDataUri } from './BrushTool';

interface SceneCellProps {
  scene: GenericScene;
  setDisplayScene: (scene: GenericScene) => void;
  setEditingScene: (scene: GenericScene) => void;
  setDraggingScene: (scene: GenericScene | undefined) => void;
  getImage: (scene: GenericScene) => Promise<string | undefined>;
  rerender: (obj: {}) => void;
  draggingScene: GenericScene | undefined;
  curSession: Session;
  refreshSceneImageFuncs: { [key: string]: () => void };
}

const SceneCell = ({
  scene,
  refreshSceneImageFuncs,
  getImage,
  setDisplayScene,
  setEditingScene,
  setDraggingScene,
  rerender,
  draggingScene,
  curSession,
}: SceneCellProps) => {
  const ctx = useContext(AppContext)!;
  const [image, setImage] = useState<string | undefined>(undefined);

  const handleDragStart = (scene: GenericScene) => {
    setDraggingScene(scene);
  };

  const handleDragOver = (event: React.DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    event.dataTransfer.dropEffect = 'move';
  };

  const handleDrop = (
    event: React.DragEvent<HTMLDivElement>,
    targetScene: GenericScene,
  ) => {
    event.preventDefault();
    if (draggingScene && draggingScene !== targetScene) {
      const scenes = Object.values(getCollection(curSession, scene.type));
      const draggingIndex = scenes.indexOf(draggingScene);
      const targetIndex = scenes.indexOf(targetScene);

      const reorderedScenes = scenes.filter((scene) => scene !== draggingScene);
      reorderedScenes.splice(targetIndex, 0, draggingScene);

      setCollection(
        curSession,
        scene.type,
        reorderedScenes.reduce((acc, scene, index) => {
          acc[scene.name] = scene;
          return acc;
        }, {}) as any,
      );

      sessionService.markUpdated(curSession.name);
      rerender({});
    }
    setDraggingScene(undefined);
  };

  const addToQueue = async (scene: GenericScene) => {
    try {
      await queueGenericScene(
        curSession,
        ctx.selectedPreset!,
        scene,
        ctx.samples,
      );
    } catch (e: any) {
      ctx.pushMessage('프롬프트 에러: ' + e.message);
    }
  };

  const removeFromQueue = (scene: GenericScene) => {
    removeTaskFromGenericScene(scene);
  };

  const getSceneQueueCount = (scene: GenericScene) => {
    const stats = statsGenericSceneTasks(scene);
    return stats.total - stats.done;
  };

  useEffect(() => {
    const refreshImage = async () => {
      try {
        const base64 = await getImage(scene);
        setImage(base64);
      } catch (e: any) {
        setImage(undefined);
      }
    };
    refreshImage();
    imageService.addEventListener('updated', refreshImage);
    refreshSceneImageFuncs[scene.name] = refreshImage;
    return () => {
      imageService.removeEventListener('updated', refreshImage);
      delete refreshSceneImageFuncs[scene.name];
    };
  }, [scene]);

  return (
    <div
      className="active:brightness-90 hover:brightness-95 cursor-pointer relative m-2 p-4 w-48 h-48 bg-white border border-gray-300 "
      draggable
      onDragStart={() => handleDragStart(scene)}
      onDragOver={handleDragOver}
      onDrop={(event) => handleDrop(event, scene)}
      onClick={(event) => {
        setDisplayScene(scene);
      }}
    >
      <div className="relative flex flex-col w-full h-full z-10">
        {getSceneQueueCount(scene) > 0 && (
          <span className="absolute right-0 bg-yellow-400 inline-block mr-3 px-2 py-1 text-center align-middle rounded-md font-bold text-white">
            {getSceneQueueCount(scene)}
          </span>
        )}
        <span className="text-lg overflow-auto no-scrollbars">{scene.name}</span>
        <div className="w-full flex mt-auto justify-center items-center gap-2">
          <button
            className={`${roundButton} bg-green-500`}
            onClick={(e) => {
              e.stopPropagation();
              addToQueue(scene);
            }}
          >
            <FaPlus />
          </button>
          <button
            className={`${roundButton} bg-gray-500`}
            onClick={(e) => {
              e.stopPropagation();
              removeFromQueue(scene);
            }}
          >
            <FaRegCalendarTimes />
          </button>
          <button
            className={`${roundButton} bg-orange-400`}
            onClick={(e) => {
              e.stopPropagation();
              setEditingScene(scene);
            }}
          >
            <FaEdit />
          </button>
        </div>
      </div>
      {image && (
        <img
          src={image}
          alt={`Image ${scene.name}`}
          className="top-0 left-0 absolute w-full h-full object-cover z-0"
        />
      )}
    </div>
  );
};

interface QueueControlProps {
  type: 'scene' | 'inpaint';
}

const QueueControl = ({ type }: QueueControlProps) => {
  const ctx = useContext(AppContext)!;
  const curSession = ctx.curSession!;
  const [_, rerender] = useState<{}>({});
  const [editingScene, setEditingScene] = useState<GenericScene | undefined>(
    undefined,
  );
  const [inpaintEditScene, setInpaintEditScene] = useState<
    InPaintScene | undefined
  >(undefined);
  const [displayScene, setDisplayScene] = useState<GenericScene | undefined>(
    undefined,
  );
  const [draggingScene, setDraggingScene] = useState<GenericScene | undefined>(
    undefined,
  );
  const refreshSceneImageFuncs = useRef<{ [key: string]: () => void }>({});
  const updateScenes = () => {
    sessionService.markUpdated(curSession.name);
    rerender({});
  };
  useEffect(() => {
    const onProgressUpdated = () => {
      rerender({});
    };
    if (type === 'inpaint') {
      sessionService.addEventListener('inpaint-updated', onProgressUpdated);
    }
    taskQueueService.addEventListener('progress', onProgressUpdated);
    imageService.addEventListener('updated', updateScenes);
    return () => {
      if (type === 'inpaint') {
        sessionService.removeEventListener(
          'inpaint-updated',
          onProgressUpdated,
        );
      }
      taskQueueService.removeEventListener('progress', onProgressUpdated);
      imageService.removeEventListener('updated', updateScenes);
    };
  }, []);
  useEffect(() => {
    imageService.refresh(curSession);
  }, [curSession]);
  const addAllToQueue = async () => {
    try {
      for (const scene of Object.values(getCollection(curSession, type))) {
        await queueGenericScene(
          curSession,
          ctx.selectedPreset!,
          scene,
          ctx.samples,
        );
      }
    } catch (e: any) {
      ctx.pushMessage('프롬프트 에러: ' + e.message);
    }
  };
  const addScene = () => {
    if (type === 'scene') {
      (async () => {
        ctx.pushDialog({
          type: 'input-confirm',
          text: '신규 씬 이름을 입력해주세요',
          callback: async (inputValue) => {
            if (inputValue) {
              const scenes = getCollection(curSession, type);
              if (inputValue in scenes) {
                ctx.pushMessage('이미 존재하는 씬 이름입니다.');
                return;
              }

              if (inputValue) {
                if (inputValue in curSession.scenes) {
                  ctx.pushMessage('이미 존재하는 씬 이름입니다.');
                  return;
                }
                scenes[inputValue] = {
                  type: 'scene',
                  name: inputValue,
                  landscape: false,
                  locked: false,
                  slots: [[{ prompt: '', enabled: true }]],
                  game: undefined,
                };
                updateScenes();
              }
            }
          },
        });
      })();
    } else {
      setAdding(true);
    }
  };

  const getImage = async (scene: GenericScene) => {
    if (scene.type === 'scene') {
      if (scene.main) {
        const path =
          imageService.getImageDir(curSession!, scene) + '/' + scene.main;
        const base64 = await imageService.fetchImage(path);
        return base64;
      }
      const images = imageService.getImages(curSession, scene);
      if (images.length) {
        return await imageService.fetchImage(images[images.length - 1]);
      }
      throw new Error('No image available');
    } else {
      return base64ToDataUri(scene.image);
    }
  };

  const buttons =
    type === 'scene'
      ? [
          {
            text: '인페인팅 씬 생성',
            className: 'bg-green-500',
            onClick: async (scene, path, close) => {
              let image = await imageService.fetchImage(path);
              image = image.replace(/^data:image\/(png|jpeg);base64,/, '');
              const name =
                scene.name +
                '_inpaint_' +
                (Number.MAX_SAFE_INTEGER - Date.now()).toString();
              const prompt = await extractPromptFromBase64(image);
              const middle = await extractMiddlePrompt(
                ctx.selectedPreset!,
                prompt,
              );
              const newScene: InPaintScene = {
                type: 'inpaint',
                name: name,
                image: image,
                middlePrompt: middle,
                landscape: false,
                mask: '',
                sceneRef: scene.name,
                game: undefined,
              };
              curSession!.inpaints[name] = newScene;
              updateScenes();
              close();
              setInpaintEditScene(newScene);
              sessionService.inPaintHook();
            },
          },
          {
            text: '메인 이미지 지정',
            className: 'bg-orange-400',
            onClick: async (scene, path, close) => {
              scene.main = path.split('/').pop();
              updateScenes();
              refreshSceneImageFuncs.current[scene.name]();
              close();
            },
          },
        ]
      : [
          {
            text: '원본 씬으로 이미지 복사',
            className: 'bg-green-500',
            onClick: async (scene: InPaintScene, path, close) => {
              if (!scene.sceneRef) {
                ctx.pushMessage('원본 씬이 없습니다.');
                return;
              }
              const orgScene = curSession!.scenes[scene.sceneRef];
              if (!orgScene) {
                ctx.pushMessage('원본 씬이 삭제되었거나 이동했습니다.');
                return;
              }
              await invoke(
                'copy-file',
                path,
                imageService.getImageDir(curSession!, orgScene) +
                  '/_inpaint_' +
                  Date.now().toString() +
                  '.png',
              );
              imageService.refresh(curSession);
              close();
            },
          },
        ];

  const [adding, setAdding] = useState<boolean>(false);
  let panel = <div></div>;
  if (type === 'scene') {
    panel = (
      <>
        {inpaintEditScene && (
          <InPaintEditor
            editingScene={inpaintEditScene}
            onConfirm={() => {
              setInpaintEditScene(undefined);
            }}
          />
        )}
        {editingScene && (
          <SceneEditor
            scene={editingScene as Scene}
            onClosed={() => {
              setEditingScene(undefined);
            }}
          />
        )}
      </>
    );
  } else {
    panel = (
      <>
        {(editingScene || adding) && (
          <InPaintEditor
            editingScene={editingScene as InPaintScene}
            onConfirm={() => {
              setEditingScene(undefined);
              setAdding(false);
            }}
          />
        )}
      </>
    );
  }
  const isMainImage = (path: string) => {
    if (type === 'inpaint') return false;
    const scene = displayScene as Scene;
    if (scene.main) {
      return path.split('/').pop() === scene.main;
    }
    return false;
  };

  const onFilenameChange = (path: string) => {
    if (type === 'scene') {
      const scene = displayScene as Scene;
      if (scene.main && scene.main === path.split('/').pop()) {
        scene.main = undefined;
        updateScenes();
      }
    }
  };
  const exportPackage = async () => {
    const paths = [];
    for (const scene of Object.values(curSession!.scenes)) {
      let path = undefined;
      if (scene.main) {
        path = imageService.getImageDir(curSession!, scene) + '/' + scene.main;
      } else {
        const images = imageService.getImages(curSession, scene);
        if (images.length) {
          path = images[images.length - 1];
        }
      }
      if (path) paths.push({ path, name: scene.name });
    }
    const outFilePath =
      'exports/' +
      curSession!.name +
      '_main_images_' +
      Date.now().toString() +
      '.zip';
    await invoke('zip-files', paths, outFilePath);
    await invoke('show-file', outFilePath);
  };
  return (
    <div className="flex flex-col h-full">
      {displayScene && (
        <FloatView
          onClose={() => {
            setDisplayScene(undefined);
          }}
        >
          <ResultViewer
            scene={displayScene}
            isMainImage={isMainImage}
            onFilenameChange={onFilenameChange}
            buttons={buttons}
          />
        </FloatView>
      )}
      {panel}
      <div className="flex flex-none pb-2 gap-2">
        <button className={`${roundButton} ${primaryColor}`} onClick={addScene}>
          씬 추가
        </button>
        <button
          className={`${roundButton} ${primaryColor}`}
          onClick={addAllToQueue}
        >
          모든 씬 예약추가
        </button>
        {type === 'scene' && (
          <button
            className={`${roundButton} ${primaryColor}`}
            onClick={exportPackage}
          >
            모든 메인 이미지 내보내기
          </button>
        )}
      </div>
      <div className="flex flex-1 overflow-hidden">
        <div className="flex flex-wrap overflow-auto justify-start items-start content-start">
          {Object.values(getCollection(curSession!, type)).map((scene) => (
            <SceneCell
              key={scene.name}
              scene={scene}
              getImage={getImage}
              setDisplayScene={setDisplayScene}
              setEditingScene={setEditingScene}
              setDraggingScene={setDraggingScene}
              rerender={rerender}
              draggingScene={draggingScene}
              curSession={curSession}
              refreshSceneImageFuncs={refreshSceneImageFuncs.current}
            />
          ))}
        </div>
      </div>
    </div>
  );
};

export default QueueControl;
