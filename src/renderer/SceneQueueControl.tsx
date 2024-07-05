import { memo, useContext, useEffect, useMemo, useRef, useState } from 'react';
import {
  Session,
  Scene,
  imageService,
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
  extractPromptDataFromBase64,
  extractMiddlePrompt,
  getMainImage,
  gameService,
  encodeContextAlt,
  dataUriToBase64,
  queueRemoveBg,
  localAIService,
  backend,
  isMobile,
  deleteImageFiles,
} from './models';
import { AppContext } from './App';
import { FloatView } from './FloatView';
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
  getImage: (scene: GenericScene) => Promise<string | null>;
  rerender: (obj: {}) => void;
  draggingScene: GenericScene | undefined;
  curSession: Session;
  refreshSceneImageFuncs: { [key: string]: () => void };
  cellSize: number;
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
  cellSize
}: SceneCellProps) => {
  const ctx = useContext(AppContext)!;
  const [image, setImage] = useState<string | undefined>(undefined);

  const cellSizes = ['w-48 h-48', 'w-36 h-36 md:w-64 md:h-64', 'w-96 h-96']
  const cellSizes2 = ['max-w-48 max-h-48', ' max-w-36 max-h-36 md:max-w-64 md:max-h-64', 'max-w-96 max-h-96']
  const cellSizes3 = ['w-48', 'w-36 md:w-64', ' w-96']

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
    removeTaskFromGenericScene(curSession!, scene);
  };

  const getSceneQueueCount = (scene: GenericScene) => {
    const stats = statsGenericSceneTasks(curSession!, scene);
    return stats.total - stats.done;
  };

  useEffect(() => {
    const refreshImage = async () => {
      try {
        const base64 = await getImage(scene);
        setImage(base64!);
      } catch (e: any) {
        setImage(undefined);
      }
    };
    refreshImage();
    gameService.addEventListener('updated', refreshImage);
    sessionService.addEventListener('main-image-updated', refreshImage);
    refreshSceneImageFuncs[scene.name] = refreshImage;
    return () => {
      gameService.removeEventListener('updated', refreshImage);
      sessionService.removeEventListener('main-image-updated', refreshImage);
      delete refreshSceneImageFuncs[scene.name];
    };
  }, [scene]);

  return (
    <div
      className={"relative m-2 p-1 bg-white border border-gray-300 " }
      draggable
      onDragStart={() => handleDragStart(scene)}
      onDragOver={handleDragOver}
      onDrop={(event) => handleDrop(event, scene)}
      title={encodeContextAlt({
        type: 'scene',
        sceneType: scene.type,
        name: scene.name,
      })}
    >
      {getSceneQueueCount(scene) > 0 && (
        <span className="absolute right-0 bg-yellow-400 inline-block mr-3 px-2 py-1 text-center align-middle rounded-md font-bold text-white">
          {getSceneQueueCount(scene)}
        </span>
      )}
      <div className="-z-10 active:brightness-90 hover:brightness-95 cursor-pointer bg-white"
      onClick={(event) => {
        setDisplayScene(scene);
      }}
      >
        <div className={"p-2 text-lg text-black truncate " + cellSizes3[cellSize]}
          title={encodeContextAlt({
            type: 'scene',
            sceneType: scene.type,
            name: scene.name,
          })}
        >
          {scene.name}
        </div>
      <div className={"relative image-cell flex-none overflow-hidden " + (cellSizes[cellSize])}
        title={encodeContextAlt({
          type: 'scene',
          sceneType: scene.type,
          name: scene.name,
        })}
      >

        {image && (
          <img
            src={image}
            alt={encodeContextAlt({
              type: 'scene',
              sceneType: scene.type,
              name: scene.name,
            })}
            className={"w-auto h-auto object-scale-down z-0 bg-checkboard " + cellSizes2[cellSize]}
          />
        )}
      </div>
      </div>
      <div className="w-full flex mt-auto justify-center items-center gap-2 p-2">
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
  );
};

interface QueueControlProps {
  type: 'scene' | 'inpaint';
  filterFunc?: (scene: GenericScene) => boolean;
  onClose?: (x: number) => void;
  showPannel?: boolean;
  className?: string;
}

const QueueControl = memo(({ type, className, showPannel, filterFunc, onClose }: QueueControlProps) => {
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
  const [cellSize, setCellSize] = useState(1);
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
    sessionService.addEventListener('scene-order-changed', onProgressUpdated);
    return () => {
      if (type === 'inpaint') {
        sessionService.removeEventListener(
          'inpaint-updated',
          onProgressUpdated,
        );
      }
      taskQueueService.removeEventListener('progress', onProgressUpdated);
      imageService.removeEventListener('updated', updateScenes);
      sessionService.removeEventListener(
        'scene-order-changed',
        onProgressUpdated,
      );
    };
  }, []);
  useEffect(() => {
    imageService.refreshBatch(curSession!);
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
                  resolution: 'portrait',
                  locked: false,
                  slots: [[{ prompt: '', enabled: true }]],
                  mains: [],
                  round: undefined,
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
      const image = await getMainImage(curSession!, scene as Scene, 500);
      if (!image)
        throw new Error('No image available');
      return image;
    } else {
      return await imageService.fetchImageSmall(sessionService.getInpaintOrgPath(curSession!, scene as InPaintScene), 500);
    }
  };

  const cellSizes = ['스몰뷰', '미디엄뷰', '라지뷰'];

  const buttons =
    type === 'scene'
      ? [
          {
            text: (path: string) => {
              return isMainImage(path) ? '즐겨찾기 해제' : '즐겨찾기 지정';
            },
            className: 'bg-orange-400',
            onClick: async (scene: Scene, path: string, close: () => void) => {
              const filename = path.split('/').pop()!;
              if (isMainImage(path)) {
                scene.mains = scene.mains.filter((x) => x !== filename);
              } else {
                scene.mains.push(filename);
              }
              updateScenes();
              refreshSceneImageFuncs.current[scene.name]();
              sessionService.mainImageUpdated();
            },
          },
          {
            text: '인페인팅 씬 생성',
            className: 'bg-green-500',
            onClick: async (scene: Scene, path: string, close: () => void) => {
              let image = await imageService.fetchImage(path);
              image = dataUriToBase64(image!);
              let cnt = 0;
              const newName = () => (scene.name + '_inpaint_' + cnt);
              while (newName() in curSession!.inpaints) {
                cnt++;
              }
              const name = newName();
              let prompt, uc;
              try {
                const [prompt_, seed, scale, sampler, steps, uc_] = await extractPromptDataFromBase64(image);
                prompt = prompt_;
                uc = uc_;
              } catch(e) {
                prompt = '';
                uc = '';
              }
              const newScene: InPaintScene = {
                type: 'inpaint',
                name: name,
                prompt,
                uc,
                resolution: scene.resolution,
                sceneRef: scene.name,
                round: undefined,
                game: undefined,
              };
              await sessionService.saveInpaintImages(curSession!, newScene, image, '');
              curSession!.inpaints[name] = newScene;
              close();
              updateScenes();
              setInpaintEditScene(newScene);
              sessionService.inPaintHook();
            },
          },
        ]
      : [

          {
            text: '해당 이미지로 인페인트',
            className: 'bg-orange-400',
            onClick: async (scene: InPaintScene, path: string, close: () => void) => {
              let image = await imageService.fetchImage(path);
              image = dataUriToBase64(image!);
              let mask =  await imageService.fetchImage(sessionService.getInpaintMaskPath(curSession!, scene as InPaintScene));
              mask = dataUriToBase64(mask!);
              await sessionService.saveInpaintImages(curSession!, scene, image, mask);
              close();
              updateScenes();
              setInpaintEditScene(scene as InPaintScene);
              sessionService.inPaintHook();
            },
          },
          {
            text: '원본 씬으로 이미지 복사',
            className: 'bg-green-500',
            onClick: async (scene: InPaintScene, path: string, close: () => void) => {
              if (!scene.sceneRef) {
                ctx.pushMessage('원본 씬이 없습니다.');
                return;
              }
              const orgScene = curSession!.scenes[scene.sceneRef];
              if (!orgScene) {
                ctx.pushMessage('원본 씬이 삭제되었거나 이동했습니다.');
                return;
              }
              await backend.copyFile(
                path,
                imageService.getImageDir(curSession!, orgScene) +
                  '/' +
                  Date.now().toString() +
                  '.png',
              );
              imageService.refresh(curSession!, orgScene);
              setDisplayScene(undefined);
              if (onClose) onClose(0);
              close();
            },
          },
        ];
  if (type === 'scene' && !isMobile) {
    buttons.push({
      text: '배경 제거 예약',
      className: 'bg-gray-500',
      // @ts-ignore
      onClick: async (scene: Scene, path: string, close: () => void) => {
        if (!localAIService.ready) {
          ctx.pushMessage('환경설정에서 배경 제거 기능을 활성화해주세요');
          return;
        }
        let image = await imageService.fetchImage(path);
        image = dataUriToBase64(image!);
        queueRemoveBg(curSession!, scene, image);
      }
    });
  }

  const [adding, setAdding] = useState<boolean>(false);
  const panel = useMemo(() => {
    if (type === 'scene') {
      return (
        <>
          {inpaintEditScene && (
            <FloatView priority={3} onEscape={() => setInpaintEditScene(undefined)}>
              <InPaintEditor
                editingScene={inpaintEditScene}
                onConfirm={() => {
                  if (resultViewerRef.current) resultViewerRef.current.setInpaintTab();
                  setInpaintEditScene(undefined);
                }}
                onDelete={() => {
                }}
              />
            </FloatView>
          )}
          {editingScene && (
            <FloatView priority={2} onEscape={() => setEditingScene(undefined)}>
              <SceneEditor
                scene={editingScene as Scene}
                onClosed={() => {
                  setEditingScene(undefined);
                }}
                onDeleted={() => {
                  if (showPannel) {
                    setDisplayScene(undefined);
                  }
                }}
              />
            </FloatView>
          )}
        </>
      );
    } else {
      return (
        <>
          {inpaintEditScene && (
            <FloatView priority={3} onEscape={() => setInpaintEditScene(undefined)}>
              <InPaintEditor
                editingScene={inpaintEditScene}
                onConfirm={() => {
                  setInpaintEditScene(undefined);
                }}
                onDelete={() => {
                }}
              />
            </FloatView>
          )}
          {(editingScene || adding) && (
            <FloatView priority={2} onEscape={() => {
              setEditingScene(undefined);
              setAdding(false);
            }}>
              <InPaintEditor
                editingScene={editingScene as InPaintScene}
                onConfirm={() => {
                  setEditingScene(undefined);
                  setAdding(false);
                }}
                onDelete={() => {
                  setDisplayScene(undefined);
                }}
              />
            </FloatView>
          )}
        </>
      );
    }
  }, [editingScene, inpaintEditScene, adding]);

  const onEdit = async (scene: GenericScene) => {
    setEditingScene(scene);
  };

  const isMainImage = (path: string) => {
    if (type === 'inpaint') return false;
    const filename = path.split('/').pop()!;
    return !!(displayScene && (displayScene as Scene).mains.includes(filename));
  };

  const onFilenameChange = (src: string, dst: string) => {
    if (type === 'scene') {
      const scene = displayScene as Scene;
      src = src.split('/').pop()!;
      dst = dst.split('/').pop()!;
      if (scene.mains.includes(src) && !scene.mains.includes(dst)) {
        scene.mains = scene.mains.map((x) => (x === src ? dst : x));
      } else if (!scene.mains.includes(src) && scene.mains.includes(dst)) {
        scene.mains = scene.mains.map((x) => (x === dst ? src : x));
      }
    }
    updateScenes();
    sessionService.mainImageUpdated();
  };
  const exportPackage = async () => {
    const exportImpl = async (prefix: string, fav: boolean) => {
      const paths = [];
      await imageService.refreshBatch(curSession!);
      for (const scene of Object.values(curSession!.scenes)) {
        await gameService.refreshList(curSession!, scene);
        const cands = imageService.getImages(curSession!, scene);
        const imageMap: any = {};
        cands.map((x) => x.split('/').pop()!).forEach((x) => {
          imageMap[x] = true;
        });
        const images = [];
        if (fav) {
          if (scene.mains.length) {
            for (const main of scene.mains) {
              if (imageMap[main])
                images.push(imageService.getImageDir(curSession!, scene) + '/' + main);
            }
          } else {
            if (cands.length) {
              images.push(cands[0]);
            }
          }
        } else {
          for (const cand of cands) {
            images.push(cand);
          }
        }
        for (let i=0;i<images.length;i++) {
          const path = images[i];
          if (images.length === 1) {
            paths.push({ path, name: prefix + scene.name });
          } else {
            paths.push({ path, name: prefix + scene.name + '.' + (i+1).toString() });
          }
        }
      }
      const outFilePath =
        'exports/' +
        curSession!.name +
        '_main_images_' +
        Date.now().toString() +
        '.zip';
      await backend.zipFiles(paths, outFilePath);
      await backend.showFile(outFilePath);
    }
    ctx.pushDialog({
      type: 'select',
      text: '내보낼 이미지를 선택해주세요',
      items: [
        { text: '즐겨찾기 이미지만 내보내기', value: 'fav'},
        { text: '모든 이미지 전부 내보내기', value: 'all'}
      ],
      callback: async (menu) => {
        ctx.pushDialog({
          type: 'select',
          text: '파일 이름 형식을 선택해주세요',
          items: [
            { text: '(씬이름).(이미지 번호).png', value: 'normal' },
            { text: '(캐릭터 이름).(씬이름).(이미지 번호)', value: 'prefix' },
          ],
          callback: async (format) => {
            if (!format) return;
            if (format === 'normal') {
              await exportImpl('', menu === 'fav');
            } else {
              ctx.pushDialog({
                type: 'input-confirm',
                text: '캐릭터 이름을 입력해주세요',
                callback: async (prefix) => {
                  if (!prefix) return;
                  await exportImpl(prefix + '.', menu === 'fav');
                }
              });
            }
          }
        });
      },
    });
  };

  const removeBg = async () => {
    if (!localAIService.ready) {
      ctx.pushMessage('환경설정에서 배경 제거 기능을 활성화해주세요');
      return;
    }
    for (const scene of Object.values(curSession!.scenes)) {
      if (scene.mains.length === 0) {
        const images = gameService.getOutputs(curSession!, scene);
        if (!images.length)
          continue;
        let image = await imageService.fetchImage(images[0]);
        image = dataUriToBase64(image!);
        queueRemoveBg(curSession!, scene, image);
      } else {
        const mains = scene.mains;
        for (const main of mains) {
          const path = imageService.getImageDir(curSession!, scene) + '/' + main;
          let image = await imageService.fetchImage(path);
          image = dataUriToBase64(image!);
          queueRemoveBg(curSession!, scene, image, (newPath: string) => {
            for (let j = 0; scene.mains.length; j++) {
              if (scene.mains[j] === main) {
                scene.mains[j] = newPath.split('/').pop()!;
                break;
              }
            }
            updateScenes();
            sessionService.mainImageUpdated();
          });
        }
      }
    }
  }

  const resultViewerRef = useRef<any>(null);
  const resultViewer = useMemo(() => {
    if (displayScene) return <FloatView
          priority={2}
          showToolbar
          onEscape={() => {
            gameService.refreshList(curSession!, displayScene);
            sessionService.mainImageUpdated();
            setDisplayScene(undefined);
          }}
        >
          <ResultViewer
            ref={resultViewerRef}
            scene={displayScene}
            isMainImage={isMainImage}
            onFilenameChange={onFilenameChange}
            onEdit={onEdit}
            buttons={buttons}
          />
        </FloatView>
    return <></>
  },[displayScene]);

  const openMenu = () => {
    ctx.pushDialog({
      type: 'select',
      text: '일괄 작업을 선택해주세요',
      items: [
        {'text': '모든 씬 즐겨찾기 배경 제거', 'value': 'removeBg'},
        {'text': '모든 씬 이미지 전부 삭제', 'value': 'removeAll'},
        {'text': '모든 씬 즐겨찾기 제외 n등 이하 이미지 삭제', 'value': 'removeAllExcept'},
      ],
      callback: async (value) => {
        if (value === 'removeAll') {
          ctx.pushDialog({
            type: 'confirm',
            text: '정말로 모든 이미지를 삭제하시겠습니까?',
            callback: async () => {
              for (const scene of Object.values(curSession!.scenes)) {
                const paths = imageService.getImages(curSession, scene);
                await deleteImageFiles(curSession!, paths);
              }
            }
          });
        } else if (value === 'removeAllExcept') {
          ctx.pushDialog({
            type: 'input-confirm',
            text: '몇등 이하 이미지를 삭제할지 입력해주세요.',
            callback: async (value) => {
              if (value) {
                for (const scene of Object.values(curSession!.scenes)) {
                  const paths = imageService.getImages(curSession, scene);
                  const n = parseInt(value);
                  await deleteImageFiles(curSession!, paths.slice(n).filter((x) => !isMainImage || !isMainImage(x)));
                }
              }
            }
          });
        } else {
          removeBg();
        }
      }
    })
  }

  return (
    <div className={"flex flex-col h-full " + (className ?? '')}>
      {resultViewer}
      {panel}
      {!!showPannel &&
      <div className="flex flex-none pb-2">
        <div className="flex gap-1 md:gap-2">
          <button className={`${roundButton} ${primaryColor}`} onClick={addScene}>
            씬 추가
          </button>
          <button
            className={`${roundButton} bg-gray-400`}
            onClick={addAllToQueue}
          >
            모두 예약추가
          </button>
          {type === 'scene' && (
            <button
              className={`${roundButton} bg-gray-400`}
              onClick={exportPackage}
            >
              모두 내보내기
            </button>
          )}
          {!isMobile && type === 'scene' && (
          <button
            className={`${roundButton} ${primaryColor}`}
            onClick={openMenu}
          >
            다른 일괄 작업
          </button>)}
        </div>
        <div className="ml-auto mr-2 hidden md:block">
          <button onClick={() => setCellSize((cellSize + 1) % 3)} className={`${roundButton} bg-gray-400`}>
            {cellSizes[cellSize]}
          </button>
        </div>
      </div>
      }
      <div className="flex flex-1 overflow-hidden">
        <div className="flex flex-wrap overflow-auto justify-start items-start content-start">
          {Object.values(getCollection(curSession!, type)).filter(x => {
            if (!filterFunc) return true;
            return filterFunc(x);
          }).map((scene) => (
            <SceneCell
              cellSize={(showPannel || isMobile) ? cellSize : 2}
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
});

export default QueueControl;
