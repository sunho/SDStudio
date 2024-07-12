import React, {
  useState,
  useEffect,
  useCallback,
  useContext,
  useRef,
  useMemo,
  memo,
  useImperativeHandle,
  forwardRef,
} from 'react';
import {
  ContextMenuType,
  GenericScene,
  InPaintScene,
  Scene,
  backend,
  dataUriToBase64,
  deleteImageFiles,
  encodeContextAlt,
  extractExifFromBase64,
  extractMiddlePrompt,
  extractPromptDataFromBase64,
  gameService,
  getResultDirectory,
  getSceneKey,
  imageService,
  isMobile,
  queueGenericScene,
  removeTaskFromGenericScene,
  sessionService,
  taskQueueService,
} from './models';
import { BiBrush, BiImage } from "react-icons/bi";
import { FixedSizeGrid as Grid, GridChildComponentProps, areEqual } from 'react-window';
import ResizeObserver from 'resize-observer-polyfill';
import { AppContext } from './App';
import { userInfo } from 'os';
import { CustomScrollbars } from './UtilComponents';
import Tournament from './Tournament';
import { grayLabel, roundButton } from './styles';
import { FaCalendarTimes, FaEdit, FaFolder, FaPaintBrush, FaStar, FaTrash } from 'react-icons/fa';
import { PromptHighlighter } from './SceneEditor';
import QueueControl from './SceneQueueControl';
import { FloatView } from './FloatView';
import memoizeOne from 'memoize-one';
import { FaPlus } from 'react-icons/fa6';
import { useContextMenu } from 'react-contexify';
import { useDrag, useDrop } from 'react-dnd';
import { getEmptyImage } from 'react-dnd-html5-backend';

interface ImageGalleryProps {
  scene: GenericScene;
  filePaths: string[];
  imageSize: number;
  onSelected?: (index: number) => void;
  isMainImage?: (path: string) => boolean;
  onFilenameChange?: (src: string, dst: string) => void;
  pageSize?: number;
  isHidden?: boolean;
}

interface ImageGalleryRef {
  refresh: () => void;
}

export const CellPreview = ({path, cellSize, imageSize, style} : {path: string, cellSize: number, imageSize: number, style: React.CSSProperties}) => {
  const [image, setImage] = useState<string | undefined>(undefined);
  useEffect(() => {
    const fetchImage = async () => {
      try {
        const base64Image = await imageService.fetchImageSmall(path, imageSize)!;
        setImage(base64Image!);
      } catch (e: any) {
        setImage(undefined);
      }
    };
    fetchImage();
  }, [path, imageSize]);

  return (
    <div className="relative" style={style}>
      {image && <img
        src={image}
        style={{
          maxWidth: cellSize,
          maxHeight: cellSize,
        }}
        className="image-anime relative bg-checkboard w-auto h-auto"
      />}
    </div>
  );
};

const Cell = memo(({
  columnIndex,
  rowIndex,
  style,
  data,
}: GridChildComponentProps) => {
  const {
    scene,
    filePaths,
    onSelected,
    columnCount,
    refreshImageFuncs,
    isMainImage,
    onFilenameChange,
    imageSize,
  } = data as any;

  const { curSession } = useContext(AppContext)!;
  const index = rowIndex * columnCount + columnIndex;
  const path = filePaths[index];

  const [image, setImage] = useState<string | undefined>(undefined);
  const [_, forceUpdate] = useState<{}>({});
  useEffect(() => {
    if (!path) {
      setImage(undefined);
      return;
    }
    const refreshImage = async () => {
      try {
        const base64Image = await imageService.fetchImageSmall(path, imageSize)!;
        setImage(base64Image!);
      } catch (e: any) {
        setImage(undefined);
      }
    };
    const refreshMainImage = () => {
      forceUpdate({});
    };
    refreshImageFuncs.current.set(path, refreshImage);

    sessionService.addEventListener('main-image-updated', refreshMainImage);
    refreshImage();
    return () => {
      refreshImageFuncs.current.delete(path);
      sessionService.removeEventListener('main-image-updated', refreshMainImage);
    };
  }, [data, imageSize]);

  const isMain = !!(isMainImage && path && isMainImage(path));
  let cellSize = isMobile ? imageSize/2.5 : imageSize;
  if (isMobile && imageSize === 500) {
    cellSize = style.width;
  }

  const { show, hideAll } = useContextMenu({
    id: ContextMenuType.Image,
  });

  const [{ isDragging }, drag, preview] = useDrag(
    () => ({
      type: 'image',
      item: { scene, path, cellSize, imageSize, index },
      canDrag: () => (index < filePaths.length),
      collect: (monitor) => {
        const diff = monitor.getDifferenceFromInitialOffset();
        if (diff){
          const dist = Math.sqrt(diff.x ** 2 + diff.y ** 2);
          if (dist > 20) {
            hideAll();
          }
        }
        return {
          isDragging: monitor.isDragging(),
        }
      },
    }),
    [path, imageSize, index],
  )

  const [{ isOver }, drop] = useDrop(
    () => ({
      accept: 'image',
      canDrop: () => (index < filePaths.length),
      collect: (monitor) => {
        if (monitor.isOver()) {
          return {
            isOver: true,
          }
        }
        return { isOver: false }
      },
      drop: async (item: any, monitor) => {
        const mscene = scene as GenericScene;
        let { path: draggedPath, index: draggedIndex } = item
        draggedPath = draggedPath.split('/').pop()!;
        const dropPath = path.split('/').pop()!;

        if (draggedPath !== dropPath) {
          const getPlayer = (path: string) => {
            if (mscene.game) {
              for (const player of mscene.game) {
                if (player.path === path) {
                  return player;
                }
              }
            }
            return undefined;
          };
          const draggedPlayer = getPlayer(draggedPath);
          const dropPlayer = getPlayer(dropPath);
          if (draggedPlayer) {
            mscene.game!.splice(mscene.game!.indexOf(draggedPlayer), 1);
          }
          if (dropPlayer) {
            mscene.game!.push({
              path: draggedPath,
              rank: dropPlayer.rank,
            });
          }
          if (draggedPlayer || dropPlayer) {
            gameService.cleanGame(mscene.game!);
            mscene.round = undefined;
          }
          const draggedImageIndex = mscene.imageMap.indexOf(draggedPath);
          mscene.imageMap.splice(draggedImageIndex, 1);
          const dropImageIndex = mscene.imageMap.indexOf(dropPath);
          if (draggedIndex < index) {
            mscene.imageMap.splice(dropImageIndex, 0, draggedPath);
          } else {
            mscene.imageMap.splice(dropImageIndex+1, 0, draggedPath);
          }
          console.log(dropPlayer, draggedPlayer, dropImageIndex, draggedImageIndex);
          console.log(mscene.game);
          console.log(mscene.imageMap);
          await imageService.refresh(curSession!, mscene);
        }
      },
    }), [path, imageSize, index],
  )

  useEffect(() => {
    preview(getEmptyImage(), { captureDraggingState: true });
  }, [preview]);

  return (
    <div
      key={index.toString() + path + imageSize.toString()}
      style={style}
      className={"image-cell relative hover:brightness-95 active:brightness-90 bg-white cursor-pointer " + (isDragging ? "opacity-0" : "") + (isOver ? " border-2 border-sky-500" : "")}
      draggable
      onClick={() => {
        if (path) {
          if (onSelected) {
            onSelected(index);
          }
        }
      }}
      ref={(node) => drag(drop(node))}
    >
      {path && image && (
        <>
          <div className="relative">
            <img
              src={image}
              style={{
                maxWidth: cellSize,
                maxHeight: cellSize,
              }}
              onContextMenu={(e) => {
                show({
                  event: e,
                  props: {
                    ctx: {
                      type: 'image',
                      path,
                      scene: scene.name,
                      starable: true,
                    }
                  }
                });
              }}
              className={
                'image-anime relative bg-checkboard w-auto h-auto ' +
                (isMain ? 'border-2 border-yellow-400' : '')
              }
            />
            {isMain && (
              <div className="absolute left-0 top-0 z-10 text-yellow-400 m-2 text-md ">
                <FaStar/>
              </div>
            )}
          </div>
        </>
      )}
    </div>
  );
}, areEqual);

const CustomScrollbarsVirtualGrid = memo(forwardRef((props, ref) => (
  <CustomScrollbars {...props} forwardedRef={ref} />
)));

const createItemData = memoizeOne((
            scene,
            filePaths,
            onSelected,
            columnCount,
            refreshImageFuncs,
            draggedIndex,
            isMainImage,
            onFilenameChange,
            imageSize) => {
    return {
      scene,
      filePaths,
      onSelected,
      columnCount,
      refreshImageFuncs,
      draggedIndex,
      isMainImage,
      onFilenameChange,
      imageSize
    };
});

const ImageGallery = forwardRef<ImageGalleryRef, ImageGalleryProps>(
  ({ scene, isHidden, imageSize, filePaths, isMainImage, onSelected, onFilenameChange }, ref) => {
    const { curSession } = useContext(AppContext)!;
    const [containerWidth, setContainerWidth] = useState(0);
    const [containerHeight, setContainerHeight] = useState(0);
    const refreshImageFuncs = useRef(new Map<string, () => void>());
    const draggedIndex = useRef<number | null>(null);
    const containerRef = useRef<HTMLDivElement>(null);

    useImperativeHandle(ref, () => ({
      refresh: () => {
        refreshImageFuncs.current.forEach((refresh) => refresh());
      },
    }));

    useEffect(() => {
      const resizeObserver = new ResizeObserver((entries) => {
        for (let entry of entries) {
          setContainerWidth(entry.contentRect.width);
          setContainerHeight(entry.contentRect.height);
        }
      });
      if (containerRef.current) {
        resizeObserver.observe(containerRef.current);
      }
      return () => resizeObserver.disconnect();
    }, []);

    let columnWidth = isMobile ? imageSize/2.5 : imageSize;
    let rowHeight = isMobile ? imageSize/2.5 : imageSize;
    if (isMobile && imageSize === 500) {
      columnWidth = containerWidth - 10;
      rowHeight = containerWidth - 10;
    }
    const columnCount = Math.max(1, Math.floor(containerWidth / columnWidth));
    // preload 4 pages
    const overcountCounts = isMobile ? [undefined, undefined, undefined] : [32, 16, 8];

    return (
      <div
        ref={containerRef}
        style={{ width: '100%', height: '100%'}}
        className={"flex justify-center " + (isHidden ? 'hidden' : '')}
      >
        <Grid
          columnCount={columnCount}
          columnWidth={columnWidth}
          height={containerHeight}
          className={"bg-gray-100 " + (isHidden ? 'hidden' : '')}
          rowCount={Math.ceil(filePaths.length / columnCount)}
          rowHeight={rowHeight}
          width={columnCount * columnWidth}
          itemData={createItemData(
            scene,
            filePaths,
            onSelected,
            columnCount,
            refreshImageFuncs,
            draggedIndex,
            isMainImage,
            onFilenameChange,
            imageSize
          )}
          outerElementType={CustomScrollbarsVirtualGrid}
          overscanRowCount={overcountCounts[Math.ceil(imageSize/200)-1]}
        >
          {Cell}
        </Grid>
      </div>
    );
  },
);

interface ResultDetailViewButton {
  text: string | ((path: string) => string);
  className: string;
  onClick: (scene: GenericScene, path: string, close: () => void) => void;
}

interface ResultDetailViewProps {
  scene: GenericScene;
  getPaths: ()=>string[];
  initialSelectedIndex: number;
  buttons: ResultDetailViewButton[];
  onClose: () => void;
}
const ResultDetailView = ({
  scene,
  buttons,
  getPaths,
  initialSelectedIndex,
  onClose,
}: ResultDetailViewProps) => {
  const { curSession, selectedPreset, pushDialog } = useContext(AppContext)!;
  const [selectedIndex, setSelectedIndex] = useState<number>(initialSelectedIndex);
  const [paths, setPaths] = useState<string[]>(getPaths());
  const [filename, setFilename] = useState<string>(paths[selectedIndex].split('/').pop()!);
  const filenameRef = useRef<string>(filename);
  const [image, setImage] = useState<string | undefined>(undefined);
  const watchedImages = useRef(new Set<string>());
  const [middlePrompt, setMiddlePrompt] = useState<string>('');
  const [seed, setSeed] = useState<string>('');
  const [scale, setScale] = useState<string>('');
  const [sampler, setSampler] = useState<string>('');
  const [steps, setSteps] = useState<string>('');
  const [uc, setUc] = useState<string>('');
  const [_, forceUpdate] = useState<{}>({});
  useEffect(() => {
    const fetchImage = async () => {
      try {
        let base64Image = await imageService.fetchImage(paths[selectedIndex])!;
        setImage(base64Image!);
        base64Image = dataUriToBase64(base64Image!);
        try {
          const [prompt, seed, scale, sampler, steps, uc] = await extractPromptDataFromBase64(base64Image);
          setMiddlePrompt(prompt);
          setSeed(seed.toString());
          setScale(scale.toString());
          setSampler(sampler);
          setSteps(steps.toString());
          setUc(uc);
        } catch(e) {
          setMiddlePrompt('');
          setSeed('');
          setScale('');
          setSampler('');
          setSteps('');
          setUc('');
        }
        setFilename(paths[selectedIndex].split('/').pop()!);
      } catch (e: any) {
        console.log(e);
        setImage(undefined);
        setMiddlePrompt('');
        setSeed('');
        setScale('');
        setSampler('');
        setSteps('');
        setUc('');
        setFilename('');
      }
    };
    const rerender = () => {
      forceUpdate({});
    };
    fetchImage();
    filenameRef.current = paths[selectedIndex].split('/').pop()!;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'ArrowLeft') {
        setSelectedIndex((selectedIndex - 1 + paths.length) % paths.length);
      } else if (e.key === 'ArrowRight') {
        setSelectedIndex((selectedIndex + 1) % paths.length);
      } else if (e.key === 'Delete' || e.key === 'Backspace') {
        pushDialog({
          type: 'confirm',
          text: '정말로 파일을 삭제하시겠습니까?',
          callback: async () => {
            await deleteImageFiles(curSession!, [paths[selectedIndex]], scene);
          },
        });
      }
    };
    const refreshPaths = () => {
      const newPaths = getPaths();
      if (newPaths.length === 0)
        onClose();
      else {
        let newIndex = newPaths.indexOf(imageService.getOutputDir(curSession!, scene) + '/' + filenameRef.current)
        if (newIndex !== -1) {
          setSelectedIndex(newIndex);
        }
        setPaths(newPaths);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    sessionService.addEventListener('main-image-updated', rerender);
    imageService.addEventListener('image-cache-invalidated', fetchImage);
    gameService.addEventListener('updated', refreshPaths);
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      sessionService.removeEventListener('main-image-updated', rerender);
      imageService.removeEventListener('image-cache-invalidated', fetchImage);
      gameService.removeEventListener('updated', refreshPaths);
    };
  }, [selectedIndex, paths]);

  useEffect(() => {
    return () => {
      watchedImages.current.forEach((path) => {
        // invoke('unwatch-image', path);
      });
    }
  });

  const [showPrompt, setShowPrompt] = useState<boolean>(false);
  const { show, hideAll } = useContextMenu({
    id: ContextMenuType.Image,
  });


  return (
      <div className="z-10 bg-white w-full h-full flex overflow-hidden flex-col md:flex-row">
        <div className="flex-none md:w-1/3 p-2 md:p-4">
          <div className="flex gap-2 md:gap-3 mb-2 md:mb-6 flex-wrap w-full">
            <button
              className={`${roundButton} bg-sky-500`}
              onClick={async () => {
                await backend.showFile(paths[selectedIndex]);
              }}
            >
              파일 위치 열기
            </button>
            {!isMobile &&
            <button
              className={`${roundButton} bg-sky-500`}
              onClick={async () => {
                await backend.openImageEditor(paths[selectedIndex]);
                watchedImages.current.add(paths[selectedIndex]);
                backend.watchImage(paths[selectedIndex]);
              }}
            >이미지 편집</button>
            }
            <button
              className={`${roundButton} bg-red-500`}
              onClick={() => {
                pushDialog({
                  type: 'confirm',
                  text: '정말로 파일을 삭제하시겠습니까?',
                  callback: async () => {
                    await deleteImageFiles(curSession!, [paths[selectedIndex]]);
                  },
                })
              }}
            >파일 삭제
            </button>
            {buttons.map((button, index) => (
              <button
                key={index}
                className={`${roundButton} ${button.className}`}
                onClick={() => {
                  button.onClick(scene, paths[selectedIndex], onClose);
                }}
              >
                {button.text instanceof Function ? button.text(paths[selectedIndex]) : button.text}
              </button>
            ))}
          </div>
          <button className={`${roundButton} bg-gray-500 md:hidden`} onClick={() => setShowPrompt(!showPrompt)}>
            {!showPrompt ? '자세한 정보 보기' : '자세한 정보 숨기기'}
          </button>
          <div className={"mt-2 md:mt-0 md:block " + (showPrompt?"block":"hidden")}>
            <div className="max-w-full mb-2">
              <span className={grayLabel}>파일이름: </span>
              <span>{filename}</span>
            </div>
            <div className="w-full mb-2">
              <div className={grayLabel}>프롬프트 </div>
              <PromptHighlighter text={middlePrompt} className="w-full h-24 overflow-auto"/>
            </div>
            <div className="w-full mb-2">
              <div className={grayLabel}>네거티브 프롬프트 </div>
              <PromptHighlighter text={uc} className="w-full h-24 overflow-auto"/>
            </div>
            <div className="w-full mb-2">
              <span className={grayLabel}>시드: </span>
              {seed}
            </div>
            <div className="w-full mb-2">
              <span className={grayLabel}>프롬프트 가이던스: </span>
              {scale}
            </div>
            <div className="w-full mb-2">
              <span className={grayLabel}>샘플러: </span>
              {sampler}
            </div>
            <div className="w-full mb-2">
              <span className={grayLabel}>스텝: </span>
              {steps}
            </div>
          </div>
        </div>
        <div className="flex-1 overflow-hidden">
          {image && (
            <img
              src={image}
              onContextMenu={(e) => {
                show({
                  event: e,
                  props: {
                    ctx: {
                      type: 'image',
                      path: paths[selectedIndex],
                      scene: scene.name,
                      starable: true,
                    }
                  }
                });
              }}
              className="w-full h-full object-contain bg-checkboard"
            />
          )}
          <div className="absolute bottom-0 md:bottom-auto right-0 md:top-10 flex gap-3 p-4 w-full md:w-auto">
            <button
              className={`${roundButton} ml-0 md:ml-auto h-10 md:h-auto w-20 md:w-auto bg-gray-500 mr-auto md:mr-0 text-lg md:text-base`}
              onClick={() => {
                setSelectedIndex((selectedIndex - 1 + paths.length) % paths.length);
              }}
            >
              이전
            </button>
            <button
              className={`${roundButton} h-10 md:h-auto w-20 md:w-auto bg-gray-500 text-lg md:text-base`}
              onClick={() => {
                setSelectedIndex((selectedIndex + 1) % paths.length);
              }}
            >
              다음
            </button>
          </div>
        </div>
      </div>
  );
};

interface ResultVieweRef {
  setImageTab: () => void;
  setInpaintTab: () => void;
}

interface ResultViewerProps {
  scene: GenericScene;
  buttons: any[];
  onFilenameChange: (src: string, dst: string) => void;
  onEdit: (scene: GenericScene) => void;
  isMainImage?: (path: string) => boolean;
  starScene?: Scene;
}

const ResultViewer = forwardRef<ResultVieweRef, ResultViewerProps>(({
  scene,
  onFilenameChange,
  onEdit,
  starScene,
  isMainImage,
  buttons,
}: ResultViewerProps, ref) => {
  const { curSession, selectedPreset, samples, pushDialog } = useContext(AppContext)!;
  const [_, forceUpdate] = useState<{}>({});
  const [tournament, setTournament] = useState<boolean>(false);
  const [selectedImageIndex, setSelectedImageIndex] = useState<number | undefined>(
    undefined,
  );
  const imagesSizes = [{ name: 'S', size: 200 }, { name: 'M', size: 400 }, { name: 'L', size: 500}]
  const [imageSize, setImageSize] = useState<number>(1);
  const [selectedTab, setSelectedTab] = useState<number>(0);
  const tabNames = ['이미지', '인페인트 씬', '즐겨찾기'];
  useEffect(() => {
    imageService.refresh(curSession!, scene);
  }, []);

  useImperativeHandle(ref, () => ({
    setImageTab: () => {
      setSelectedTab(0);
    },
    setInpaintTab: () => {
      setSelectedTab(1);
    },
  }));

  useEffect(() => {
    const handleGameChanged = () => {
      if (!tournament)
        forceUpdate({});
    };
    gameService.addEventListener('updated', handleGameChanged);
    return () => {
      gameService.removeEventListener('updated', handleGameChanged);
    };
  }, [tournament]);

  const paths = gameService.getOutputs(curSession!, scene).map((path) => imageService.getOutputDir(curSession!, scene) + '/' + path);
  const onSelected = useCallback((index: any) => {
    setSelectedImageIndex(index);
  },[]);
  const onDeleteImages = async (scene: GenericScene) => {
    pushDialog({
      type: 'select',
      text: '이미지를 삭제합니다. 원하시는 작업을 선택해주세요.',
      items: [
        {
          text: '모든 이미지 삭제',
          value: 'all'
        },
        {
          text: '즐겨찾기 제외 n등 이하 이미지 삭제',
          value: 'n'
        },
        {
          text: '즐겨찾기 제외 모든 이미지 삭제',
          value: 'fav'
        }
      ],
      callback: (value) => {
        if (value === 'all') {
          pushDialog({
            type: 'confirm',
            text: '정말로 모든 이미지를 삭제하시겠습니까?',
            callback: async () => {
              await deleteImageFiles(curSession!, paths);
            }
          });
        } else if (value === 'n') {
          pushDialog({
            type: 'input-confirm',
            text: '몇등 이하 이미지를 삭제할지 입력해주세요.',
            callback: async (value) => {
              if (value) {
                const n = parseInt(value);
                await deleteImageFiles(curSession!, paths.slice(n).filter((x) => !isMainImage || !isMainImage(x)));
              }
            }
          });
        } else {
          pushDialog({
            type: 'confirm',
            text: '정말로 즐겨찾기 외 모든 이미지를 삭제하시겠습니까?',
            callback: async () => {
              await deleteImageFiles(curSession!, paths.filter((x) => !isMainImage || !isMainImage(x)));
            }
          });

        }
      }
    })
  };

  const getPaths = () => {
    const paths = gameService.getOutputs(curSession!, scene).map((path) => (imageService.getOutputDir(curSession!, scene) + '/' + path));
    return selectedTab === 2 ? paths.filter((path) => isMainImage && isMainImage(path)) : paths;
  }

  return (
    <div className="w-full h-full flex flex-col">
      {tournament && (
        <FloatView
          priority={2}
          onEscape={() => {
            setTournament(false);
          }}
        >
          <Tournament
            onFilenameChange={onFilenameChange}
            scene={scene}
            path={getResultDirectory(curSession!, scene)}
          />
        </FloatView>
      )}
      <div className="flex-none p-2 md:p-4 border-b border-gray-300">
        <div className="mb-2 md:mb-4 flex items-center">
          <span className="font-bold text-lg md:text-2xl">
            {
              !isMobile ? (scene.type === "inpaint" ? <span className="inline-flex items-center gap-1">🖌️ 인페인트 씬 {scene.name}의 생성된 이미지</span> : <span className="inline-flex items-center gap-1">🖼️ 일반 씬 {scene.name}의 생성된 이미지</span>)
              : (scene.type === "inpaint" ? <span className="inline-flex items-center gap-1">🖌️ 인페인트 씬 {scene.name}</span> : <span className="inline-flex items-center gap-1">🖼️ 일반 씬 {scene.name}</span>)
            }
          </span>
        </div>
        <div className="md:flex justify-between items-center mt-2 md:mt-4">
          <div className="flex gap-2 md:gap-3">
            <button
              className={`${roundButton} bg-sky-500`}
              onClick={() => setTournament(true)}
            >
              이상형 월드컵
            </button>
            <button
              className={`${roundButton} bg-green-500`}
              onClick={async () => {
                await queueGenericScene(curSession!, selectedPreset!, scene, samples);
              }}>
              {!isMobile?"예약 추가":<FaPlus/>}
            </button>
            <button
              className={`${roundButton} bg-gray-500`}
              onClick={() => {
                removeTaskFromGenericScene(curSession!, scene);
              }}>
              {!isMobile?"예약 제거":<FaCalendarTimes/>}
            </button>
            <button
              className={`${roundButton} bg-orange-400`}
              onClick={() => {
                onEdit(scene);
              }}>
              {!isMobile?"씬 편집":<FaEdit/>}
            </button>
            {!isMobile && <button
              className={`${roundButton} bg-sky-500`}
              onClick={async () => {
                await backend.showFile(getResultDirectory(curSession!, scene));
              }}
            >
              <FaFolder/>
            </button>}
            <button
              className={`${roundButton} bg-red-500`}
              onClick={() => {
                onDeleteImages(scene);
              }}>
              <FaTrash/>
            </button>
          </div>
          {scene.type === 'scene' && <span className="flex ml-auto gap-1 md:gap-2 mt-2 md:mt-0">
            {tabNames.map((tabName, index) => (
            <button className={`${roundButton} ` + (selectedTab === index ? 'bg-sky-500' : 'bg-gray-400')} onClick={() => setSelectedTab(index)}>
              {tabName}
            </button>
            ))}
          </span>}
        </div>
      </div>
      <div className="flex-1 pt-2 relative h-full overflow-hidden">
        <ImageGallery
          scene={scene}
          onFilenameChange={onFilenameChange}
          isMainImage={isMainImage}
          filePaths={paths}
          imageSize={imagesSizes[imageSize].size}
          isHidden={selectedTab !== 0}
          onSelected={onSelected}
        />
        <QueueControl type='inpaint' className={selectedTab === 1 ? 'px-1 md:px-4 ' : 'hidden'}
          onClose={(x)=>{setSelectedTab(x)}}
          filterFunc={(x: any) => {
            return !!(x.sceneRef && x.sceneRef === scene.name);
          }}
        >
        </QueueControl>
        {selectedImageIndex != null && (
          <FloatView priority={1} onEscape={() => setSelectedImageIndex(undefined)}>
            <ResultDetailView
              buttons={buttons}
              onClose={() => {
                setSelectedImageIndex(undefined);
              }}
              scene={scene}
              getPaths={getPaths}
              initialSelectedIndex={selectedImageIndex}
            />
          </FloatView>
        )}
        <ImageGallery
          scene={scene}
          onFilenameChange={onFilenameChange}
          isMainImage={isMainImage}
          filePaths={paths.filter((path) => isMainImage && isMainImage(path))}
          imageSize={imagesSizes[imageSize].size}
          isHidden={selectedTab !== 2}
          onSelected={onSelected}
        />
      </div>
      <div className="absolute gap-1 m-2 bottom-0 bg-white p-1 right-0 opacity-30 hover:opacity-100 transition-all flex">
      {selectedTab !== 1 && imagesSizes.map((size, index) => (
        <button
          key={index}
          className={`text-white w-8 h-8 hover:brightness-95 active:brightness-90 cursor-pointer
          ${
            imageSize === index ? 'bg-gray-500' : 'bg-gray-400'
          }`}
          onClick={() => {
            setImageSize(index);
          }}
        >
          {size.name}
        </button>
      ))}
      </div>
    </div>
  );
});

export default ResultViewer;
