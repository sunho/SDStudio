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
  Scene,
  getResultDirectory,
  getResultImages,
  imageService,
  invoke,
  swapImages,
} from './models';
import { FixedSizeGrid as Grid, GridChildComponentProps } from 'react-window';
import ResizeObserver from 'resize-observer-polyfill';
import { AppContext } from './App';
import { userInfo } from 'os';
import { FloatView } from './UtilComponents';
import Tournament from './Tournament';
import { roundButton } from './styles';
import { FaStar } from 'react-icons/fa';

interface ImageGalleryProps {
  filePaths: string[];
  onSelected?: (path: string) => void;
  isMainImage?: (path: string) => boolean;
  onFilenameChange?: (path: string) => void;
  pageSize?: number;
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
        const base64Image = await imageService.fetchImageSmall(path)!;
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
  }, [path]);

  const isMain = !!(isMainImage && path && isMainImage(path));

  return (
    <div
      key={index}
      style={style}
      className="image-cell relative"
      draggable
      onClick={() => {
        if (path) {
          if (onSelected) {
            onSelected(path);
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

const ImageGallery = forwardRef<ImageGalleryRef, ImageGalleryProps>(
  ({ filePaths, isMainImage, onSelected, onFilenameChange }, ref) => {
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

    const columnWidth = 200; // Adjust this value as needed
    const rowHeight = (columnWidth * 4) / 4; // 4x3 aspect ratio
    const columnCount = Math.max(1, Math.floor(containerWidth / columnWidth));

    return (
      <div
        ref={containerRef}
        style={{ width: '100%', height: '100%' }}
        className="flex justify-center"
      >
        <Grid
          columnCount={columnCount}
          columnWidth={columnWidth}
          height={containerHeight}
          className="bg-gray-100"
          rowCount={Math.ceil(filePaths.length / columnCount)}
          rowHeight={rowHeight}
          width={columnCount * columnWidth}
          itemData={{
            filePaths,
            onSelected,
            columnCount,
            refreshImageFuncs,
            draggedIndex,
            isMainImage,
            onFilenameChange,
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
}
const ResultDetailView = ({
  scene,
  buttons,
  path,
  onClose,
}: ResultDetailViewProps) => {
  const [image, setImage] = useState<string | undefined>(undefined);
  useEffect(() => {
    const fetchImage = async () => {
      try {
        const base64Image = await imageService.fetchImage(path)!;
        setImage(base64Image);
      } catch (e: any) {
        console.log(e);
        setImage(undefined);
      }
    };
    fetchImage();
  }, [path]);

  return (
    <div className="absolute top-0 left-0 flex w-full h-full overflow-hidden justify-center items-center">
      <div className="z-10 bg-white w-5/6 h-5/6 flex shadow-lg overflow-hidden">
        <div className="flex-none w-1/3 p-8">
          <div className="flex flex-col">
            <span>
              <span className="font-bold">파일 이름: </span>
              {path}
            </span>
          </div>
          <div className="flex gap-3 mt-4 flex-wrap w-full">
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
        </div>
        <div className="flex-1 overflow-hidden">
          {image && (
            <img
              src={image}
              alt="Result"
              className="w-full h-full object-contain"
            />
          )}
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
  const { curSession } = useContext(AppContext)!;
  const [_, forceUpdate] = useState<{}>({});
  const [tournament, setTournament] = useState<boolean>(false);
  const [selectedImage, setSelectedImage] = useState<string | undefined>(
    undefined,
  );

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

  return (
    <div className="w-full h-full flex flex-col">
      {tournament && (
        <FloatView
          onClose={() => {
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
        </div>
      </div>
      <div className="flex-1 pt-8 pb-8 relative overflow-hidden">
        <ImageGallery
          onFilenameChange={onFilenameChange}
          isMainImage={isMainImage}
          filePaths={paths}
          onSelected={(path) => {
            setSelectedImage(path);
          }}
        />
        {selectedImage && (
          <ResultDetailView
            buttons={buttons}
            onClose={() => {
              setSelectedImage(undefined);
            }}
            scene={scene}
            path={selectedImage}
          />
        )}
      </div>
    </div>
  );
};

export default ResultViewer;
