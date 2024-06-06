import React, {
  useState,
  useEffect,
  useCallback,
  useContext,
  useRef,
  useMemo,
  useImperativeHandle,
  forwardRef,
} from 'react';
import {
  GenericScene,
  InPaintScene,
  Scene,
  dataUriToBase64,
  extractExifFromBase64,
  extractMiddlePrompt,
  extractPromptDataFromBase64,
  getResultDirectory,
  getResultImages,
  imageService,
  invoke,
  queueGenericScene,
  swapImages,
} from './models';
import { FixedSizeGrid as Grid, GridChildComponentProps } from 'react-window';
import ResizeObserver from 'resize-observer-polyfill';
import { AppContext } from './App';
import { userInfo } from 'os';
import { CustomScrollbars } from './UtilComponents';
import Tournament from './Tournament';
import { roundButton } from './styles';
import { FaStar } from 'react-icons/fa';
import { PromptHighlighter } from './SceneEditor';
import QueueControl from './SceneQueueControl';
import { FloatView } from './FloatView';

interface ImageGalleryProps {
  filePaths: string[];
  imageSize: number;
  onSelected?: (index: number) => void;
  isMainImage?: (path: string) => boolean;
  onFilenameChange?: (path: string) => void;
  pageSize?: number;
  isHidden?: boolean;
}

interface ImageGalleryRef {
  refresh: () => void;
}

const Cell = ({
  columnIndex,
  rowIndex,
  style,
  data,
}: GridChildComponentProps) => {
  const {
    filePaths,
    onSelected,
    columnCount,
    refreshImageFuncs,
    draggedIndex,
    isMainImage,
    onFilenameChange,
    imageSize,
  } = data as any;

  const index = rowIndex * columnCount + columnIndex;
  const path = filePaths[index];

  const handleDragStart = (index: number) => {
    draggedIndex.current = index;
  };

  const handleDrop = async (index: number) => {
    if (
      draggedIndex.current !== null &&
      draggedIndex.current !== index &&
      index < filePaths.length
    ) {
      if (onFilenameChange) {
        onFilenameChange(filePaths[index]);
        onFilenameChange(filePaths[draggedIndex.current]);
      }
      await swapImages(filePaths[draggedIndex.current], filePaths[index]);
      await refreshImageFuncs.current.get(filePaths[draggedIndex.current])?.();
      await refreshImageFuncs.current.get(filePaths[index])?.();
      draggedIndex.current = null;
    }
  };

  const handleDragOver = (event: React.DragEvent) => {
    event.preventDefault();
    event.dataTransfer.dropEffect = 'move';
  };

  const [image, setImage] = useState<string | undefined>(undefined);
  useEffect(() => {
    if (!path) {
      setImage(undefined);
      return;
    }
    const refreshImage = async () => {
      try {
        const base64Image = await imageService.fetchImageSmall(path, imageSize)!;
        setImage(base64Image);
      } catch (e: any) {
        console.log(e);
        setImage(undefined);
      }
    };
    refreshImageFuncs.current.set(path, refreshImage);
    refreshImage();
    return () => {
      refreshImageFuncs.current.delete(path);
    };
  }, [path, imageSize]);

  const isMain = !!(isMainImage && path && isMainImage(path));

  return (
    <div
      key={index.toString() + path + imageSize.toString()}
      style={style}
      className="image-cell relative"
      draggable
      onClick={() => {
        if (path) {
          if (onSelected) {
            onSelected(index);
          }
        }
      }}
      onDragStart={() => handleDragStart(index)}
      onDrop={() => handleDrop(index)}
      onDragOver={handleDragOver}
    >
      {path && image && (
        <>
          <img
            src={image}
            alt={`Image ${index}`}
            className={
              'image relative cursor-pointer hover:brightness-95 active:brightness-90 ' +
              (isMain ? 'border-2 border-yellow-400' : '')
            }
          />
          {isMain && (
            <div className="absolute left-0 top-0 z-10 text-yellow-400 m-2">
              <FaStar size={30} />
            </div>
          )}
        </>
      )}
    </div>
  );
};

const CustomScrollbarsVirtualGrid = forwardRef((props, ref) => (
  <CustomScrollbars {...props} forwardedRef={ref} />
));


const ImageGallery = forwardRef<ImageGalleryRef, ImageGalleryProps>(
  ({ isHidden, imageSize, filePaths, isMainImage, onSelected, onFilenameChange }, ref) => {
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

    const columnWidth = imageSize;
    const rowHeight = imageSize;
    const columnCount = Math.max(1, Math.floor(containerWidth / columnWidth));

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
          outerElementType={CustomScrollbarsVirtualGrid}
          itemData={{
            filePaths,
            onSelected,
            columnCount,
            refreshImageFuncs,
            draggedIndex,
            isMainImage,
            onFilenameChange,
            imageSize
          }}
        >
          {Cell}
        </Grid>
      </div>
    );
  },
);

interface ResultDetailViewButton {
  text: string;
  className: string;
  onClick: (scene: GenericScene, path: string, close: () => void) => void;
}

interface ResultDetailViewProps {
  scene: GenericScene;
  path: string;
  buttons: ResultDetailViewButton[];
  onClose: () => void;
  onNext: () => void;
  onPrev: () => void;
}
const ResultDetailView = ({
  scene,
  buttons,
  path,
  onClose,
  onNext,
  onPrev
}: ResultDetailViewProps) => {
  const { selectedPreset } = useContext(AppContext)!;
  const [middlePrompt, setMiddlePrompt] = useState<string>('');
  const [seed, setSeed] = useState<string>('');
  const [image, setImage] = useState<string | undefined>(undefined);
  useEffect(() => {
    const fetchImage = async () => {
      try {
        const base64Image = await imageService.fetchImage(path)!;
        const [prompt, seed] = await extractPromptDataFromBase64(dataUriToBase64(base64Image));
        setImage(base64Image);
        setMiddlePrompt(prompt);
        setSeed(seed.toString());
      } catch (e: any) {
        console.log(e);
        setImage(undefined);
        setMiddlePrompt('');
        setSeed('');
      }
    };
    fetchImage();
  }, [path]);

  return (
    <div className="absolute top-0 left-0 flex w-full h-full overflow-hidden justify-center items-center">
      <div className="z-10 bg-white w-full h-full flex shadow-lg overflow-hidden">
        <div className="flex-none w-1/3 p-4">
          <div className="flex gap-3 mb-6 flex-wrap w-full">
            <button
              className={`${roundButton} bg-gray-500`}
              onClick={() => {
                onClose();
              }}
            >
              닫기
            </button>
            <button
              className={`${roundButton} bg-sky-500`}
              onClick={async () => {
                await invoke('show-file', path);
              }}
            >
              파일 위치 열기
            </button>
            {buttons.map((button, index) => (
              <button
                key={index}
                className={`${roundButton} ${button.className}`}
                onClick={() => {
                  button.onClick(scene, path, onClose);
                }}
              >
                {button.text}
              </button>
            ))}
          </div>
          <div className="w-full mb-2">
            <div className="font-bold">프롬프트: </div>
            <PromptHighlighter text={middlePrompt} className="w-full h-24 overflow-auto"/>
          </div>
          <div className="w-full mb-2">
            <span className="font-bold">시드: </span>
            {seed}
          </div>
          <div className="max-w-full">
            <span className="font-bold">파일이름: </span>
            <span>{path.split('/').pop()}</span>
          </div>
        </div>
        <div className="flex-1 overflow-hidden">
          {image && (
            <img
              src={image}
              alt="Result"
              className="w-full h-full object-contain"
            />
          )}
          <div className="absolute top-0 right-0 flex gap-3 p-4">
            <button
              className={`${roundButton} bg-gray-500`}
              onClick={() => {
                onPrev();
              }}
            >
              이전
            </button>
            <button
              className={`${roundButton} bg-gray-500`}
              onClick={() => {
                onNext();
              }}
            >
              다음
            </button>
          </div>
        </div>
      </div>
      <div className="absolute w-full top-0 h-full bg-black opacity-50"></div>
    </div>
  );
};

interface ResultViewerProps {
  scene: GenericScene;
  buttons: ResultDetailViewButton[];
  onFilenameChange: (path: string) => void;
  isMainImage?: (path: string) => boolean;
  starScene?: Scene;
}

const ResultViewer = ({
  scene,
  onFilenameChange,
  starScene,
  isMainImage,
  buttons,
}: ResultViewerProps) => {
  const { curSession, selectedPreset, samples } = useContext(AppContext)!;
  const [_, forceUpdate] = useState<{}>({});
  const [tournament, setTournament] = useState<boolean>(false);
  const [selectedImageIndex, setSelectedImageIndex] = useState<number | undefined>(
    undefined,
  );
  const imagesSizes = [{ name: '스몰', size: 200 }, { name: '미디엄', size: 400 }, { name: '라지', size: 500}]
  const [imageSize, setImageSize] = useState<number>(1);
  const [isInpaintList, setIsInpaintList] = useState<boolean>(false);

  useEffect(() => {
    const onUpdated = () => {
      forceUpdate({});
    };
    imageService.refresh(curSession!);
    imageService.addEventListener('updated', onUpdated);
    return () => {
      imageService.removeEventListener('updated', onUpdated);
    };
  }, []);

  const paths = getResultImages(curSession!, scene);
  const onSelected = useCallback((index) => {
    setSelectedImageIndex(index);
  },[]);

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
      <div className="flex-none p-4 border-b border-gray-300">
        <div className="mb-4">
          <span className="font-bold text-xl">
            씬 {scene.name}의 생성된 이미지
          </span>
        </div>
        <div className="flex justify-between items-center mt-4">
          <div className="flex gap-3">
            <button
              className={`${roundButton} bg-sky-500`}
              onClick={() => setTournament(true)}
            >
              이상형 월드컵
            </button>
            <button
              className={`${roundButton} bg-sky-500`}
              onClick={async () => {
                await invoke('show-file', getResultDirectory(curSession!, scene));
              }}
            >
              결과 폴더 열기
            </button>
            <button
              className={`${roundButton} bg-sky-500`}
              onClick={async () => {
                await queueGenericScene(curSession!, selectedPreset!, scene, samples);
              }}>
              예약 추가
            </button>
          </div>
          <div className="flex gap-3">
            {!isInpaintList && imagesSizes.map((size, index) => (
              <button
                key={index}
                className={`${roundButton} ${
                  imageSize === index ? 'bg-sky-500' : 'bg-gray-400'
                }`}
                onClick={() => {
                  setImageSize(index);
                }}
              >
                {size.name}
              </button>
            ))}
            {scene.type === 'scene' && <button className={`${roundButton} bg-sky-500`} onClick={() => setIsInpaintList(!isInpaintList)}>
              {!isInpaintList ? '인페인트 리스트' : '이미지 리스트'}
            </button>}
          </div>
        </div>
      </div>
      <div className="flex-1 pt-4 pb-4 relative h-full overflow-hidden">
        <QueueControl type='inpaint' className={isInpaintList ? 'px-4 ' : 'hidden'}
          filterFunc={(x: InPaintScene) => {
            return x.sceneRef && x.sceneRef === scene.name;
          }}
        >
        </QueueControl>
        <ImageGallery
          onFilenameChange={onFilenameChange}
          isMainImage={isMainImage}
          filePaths={paths}
          imageSize={imagesSizes[imageSize].size}
          isHidden={isInpaintList}
          onSelected={onSelected}
        />
        {selectedImageIndex != null && (
          <ResultDetailView
            buttons={buttons}
            onClose={() => {
              setSelectedImageIndex(undefined);
            }}
            scene={scene}
            path={paths[selectedImageIndex]}
            onNext={() => {
              setSelectedImageIndex((selectedImageIndex + 1) % paths.length);
            }}
            onPrev={() => {
              setSelectedImageIndex((selectedImageIndex - 1 + paths.length) % paths.length);
            }}
          />
        )}
      </div>
    </div>
  );
};

export default ResultViewer;
