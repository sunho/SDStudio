import {
  createRef,
  useContext,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
} from 'react';
import { backend, promptService, sessionService } from '../models';
import { DropdownSelect } from './UtilComponents';
import PromptEditTextArea from './PromptEditTextArea';
import {
  FaArrowCircleUp,
  FaFileExport,
  FaPlus,
  FaShare,
  FaTrashAlt,
} from 'react-icons/fa';
import { FaTrash } from 'react-icons/fa';
import { useDrag, useDrop } from 'react-dnd';
import { getEmptyImage } from 'react-dnd-html5-backend';
import { Piece, PieceLibrary } from '../models/types';
import { appState } from '../models/AppService';
import { observer } from 'mobx-react-lite';

interface PieceCellProps {
  piece: Piece;
  name: string;
  curPieceLibrary: PieceLibrary;
  width?: number;
  style?: React.CSSProperties;
  movePiece?: (fromIndex: string, toIndex: string) => void;
}
export const PieceCell = observer(
  ({
    piece,
    name,
    curPieceLibrary,
    movePiece,
    width,
    style,
  }: PieceCellProps) => {
    const { curSession } = appState;

    const containerRef = useRef<any>();
    const elementRef = createRef<any>();

    const [curWidth, setCurWidth] = useState<number>(0);

    useLayoutEffect(() => {
      const measure = () => {
        if (!containerRef.current) return;
        setCurWidth(containerRef.current.getBoundingClientRect().width);
      };

      measure();
      window.addEventListener('resize', measure);
      return () => {
        window.removeEventListener('resize', measure);
      };
    }, []);

    const [{ isDragging }, drag, preview] = useDrag(
      {
        type: 'piece',
        item: { piece, curPieceLibrary, name, width: curWidth },
        canDrag: () => true,
        collect: (monitor) => ({
          isDragging: monitor.isDragging(),
        }),
      },
      [curWidth, piece],
    );

    const [, drop] = useDrop(
      {
        accept: 'piece',
        hover: (draggedItem: any) => {
          if (draggedItem.piece !== piece) {
            movePiece!(draggedItem.pieceName, piece.name);
          }
        },
      },
      [curWidth, piece],
    );

    useEffect(() => {
      preview(getEmptyImage(), { captureDraggingState: true });
    }, [preview]);

    return (
      <div
        className={
          'p-3 bg-white dark:bg-slate-800 border border-gray-300 dark:border-slate-500 my-2 ' +
          (isDragging ? 'opacity-0' : '')
        }
        style={style ? { ...style, width: width } : {}}
        ref={(node) => {
          if (movePiece) {
            drag(drop(node));
            containerRef.current = node;
          }
          return null;
        }}
      >
        <div className="flex pb-2">
          <div
            className="font-bold text-default"
            onDoubleClick={() => {
              if (!movePiece) return;
              appState.pushDialog({
                type: 'input-confirm',
                text: '조각의 이름을 변경합니다',
                callback: (name) => {
                  if (!name) return;
                  if (curPieceLibrary.pieces.find((p) => p.name === name)) {
                    appState.pushMessage('조각이 이미 존재합니다');
                    return;
                  }
                  piece!.name = name;
                  sessionService.reloadPieceLibraryDB(curSession!);
                },
              });
            }}
          >
            {piece.name}
          </div>
          <button
            className="ml-auto text-red-500 dark:text-white"
            onClick={() => {
              if (!movePiece) return;
              const index = curPieceLibrary.pieces.indexOf(piece);
              curPieceLibrary.pieces.splice(index, 1);
              sessionService.reloadPieceLibraryDB(curSession!);
            }}
          >
            <FaTrash size={20} />
          </button>
        </div>
        <div className="h-20">
          <PromptEditTextArea
            innerRef={elementRef}
            disabled={!movePiece}
            lineHighlight
            value={piece.prompt}
            onChange={(txt) => {
              piece.prompt = txt;
            }}
          />
        </div>
        <div className={'mt-1 gray-label'}>
          랜덤 줄 선택 모드:{' '}
          <input
            checked={piece.multi}
            type="checkbox"
            onChange={(e) => {
              if (!movePiece) return;
              piece.multi = e.target.checked;
            }}
          />
        </div>
      </div>
    );
  },
);

const PieceEditor = observer(() => {
  const { curSession } = appState;
  const [selectedPieceLibrary, setSelectedPieceLibrary] = useState<
    string | null
  >(null);
  const [curPieceLibrary, setCurPieceLibrary] = useState<PieceLibrary | null>(
    null,
  );

  useEffect(() => {
    setCurPieceLibrary(
      selectedPieceLibrary
        ? curSession!.library.get(selectedPieceLibrary)!
        : null,
    );
  }, [selectedPieceLibrary]);

  const movePiece = (from: string, to: string) => {
    const fromIndex = curPieceLibrary!.pieces.findIndex((p) => p.name === from);
    const toIndex = curPieceLibrary!.pieces.findIndex((p) => p.name === to);
    const [movedKey] = curPieceLibrary!.pieces.splice(fromIndex, 1);
    curPieceLibrary!.pieces.splice(toIndex, 0, movedKey);
  };

  return (
    <div className="flex flex-col h-full">
      <div className="flex gap-2 flex-0 pb-2 items-center">
        <DropdownSelect
          selectedOption={selectedPieceLibrary}
          menuPlacement="bottom"
          options={Array.from(curSession!.library.entries()).map(
            ([name, lib]) => ({
              label: name,
              value: name,
            }),
          )}
          onSelect={(opt) => {
            setSelectedPieceLibrary(opt.value);
          }}
        />

        <button
          className={`icon-button h-8 px-4 ml-auto`}
          onClick={async () => {
            appState.pushDialog({
              type: 'input-confirm',
              text: '조각그룹의 이름을 입력하세요',
              callback: async (name) => {
                if (!name) return;
                if (curSession!.library.has(name)) {
                  appState.pushMessage('조각그룹이 이미 존재합니다');
                  return;
                }
                curSession!.library.set(
                  name,
                  PieceLibrary.fromJSON({
                    pieces: [],
                    name: name,
                  }),
                );
                setSelectedPieceLibrary(name);
                sessionService.reloadPieceLibraryDB(curSession!);
              },
            });
          }}
        >
          <FaPlus />
        </button>
        <button
          className={`icon-button h-8 px-4`}
          onClick={async () => {
            if (!curPieceLibrary) return;
            const outPath =
              'exports/' +
              curSession!.name +
              '_' +
              selectedPieceLibrary +
              '_' +
              Date.now().toString() +
              '.json';
            await backend.writeFile(outPath, JSON.stringify(curPieceLibrary));
            await backend.showFile(outPath);
          }}
        >
          <FaShare />
        </button>
        <button
          className={`icon-button h-8 px-4`}
          onClick={async () => {
            if (!selectedPieceLibrary) return;
            appState.pushDialog({
              type: 'confirm',
              text: '정말로 삭제하시겠습니까?',
              callback: async () => {
                curSession!.library.delete(selectedPieceLibrary!);
                setSelectedPieceLibrary(null);
                sessionService.reloadPieceLibraryDB(curSession!);
              },
            });
          }}
        >
          <FaTrashAlt />
        </button>
      </div>
      {curPieceLibrary && (
        <div className="h-min-0 flex-1 overflow-auto">
          {Array.from(curPieceLibrary.pieces.values()).map((piece) => (
            <PieceCell
              key={curPieceLibrary.name + ' ' + piece.name}
              piece={piece}
              name={curPieceLibrary.name}
              curPieceLibrary={curPieceLibrary}
              movePiece={movePiece}
            />
          ))}
          <button
            className="py-2 px-8 rounded-xl back-lllgray"
            onClick={async () => {
              appState.pushDialog({
                type: 'input-confirm',
                text: '조각의 이름을 입력하세요',
                callback: (name) => {
                  if (!name) return;
                  if (curPieceLibrary.pieces.find((p) => p.name === name)) {
                    appState.pushMessage('조각이 이미 존재합니다');
                    return;
                  }
                  curPieceLibrary!.pieces.push(
                    Piece.fromJSON({
                      name: name,
                      prompt: '',
                      multi: false,
                    }),
                  );
                  sessionService.reloadPieceLibraryDB(curSession!);
                },
              });
            }}
          >
            <FaPlus />
          </button>
        </div>
      )}
    </div>
  );
});

export default PieceEditor;
