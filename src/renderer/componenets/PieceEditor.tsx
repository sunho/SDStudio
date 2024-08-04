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
import { PieceLibrary } from '../models/types';
import { appState } from '../models/AppService';
import { observer } from 'mobx-react-lite';

interface PieceCellProps {
  pieceName: string;
  value: string;
  name: string;
  curPieceLibrary: PieceLibrary;
  onUpdated?: () => void;
  width?: number;
  style?: React.CSSProperties;
  movePiece?: (fromIndex: string, toIndex: string) => void;
}
export const PieceCell = ({
  pieceName,
  value,
  name,
  curPieceLibrary,
  onUpdated,
  movePiece,
  width,
  style,
}: PieceCellProps) => {
  const { curSession, pushDialog, pushMessage } = appState;

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
      item: { pieceName, curPieceLibrary, name, value, width: curWidth },
      canDrag: () => true,
      collect: (monitor) => ({
        isDragging: monitor.isDragging(),
      }),
    },
    [curWidth, pieceName],
  );

  const [, drop] = useDrop(
    {
      accept: 'piece',
      hover: (draggedItem: any) => {
        if (draggedItem.pieceName !== pieceName) {
          movePiece!(draggedItem.pieceName, pieceName);
          onUpdated!();
        }
      },
    },
    [curWidth, pieceName],
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
            pushDialog({
              type: 'input-confirm',
              text: '조각의 이름을 변경합니다',
              callback: (name) => {
                if (!name) return;
                if (name in curPieceLibrary.pieces) {
                  pushMessage('조각이 이미 존재합니다');
                  return;
                }
                curPieceLibrary.pieces[name] =
                  curPieceLibrary!.pieces[pieceName];
                curPieceLibrary.multi[name] = curPieceLibrary!.multi[pieceName];
                delete curPieceLibrary!.pieces[pieceName];
                delete curPieceLibrary!.multi[pieceName];
                onUpdated!();
                sessionService.reloadPieceLibraryDB(curSession!);
              },
            });
          }}
        >
          {pieceName}
        </div>
        <button
          className="ml-auto text-red-500 dark:text-white"
          onClick={() => {
            if (!movePiece) return;
            delete curPieceLibrary.pieces[pieceName];
            delete curPieceLibrary.multi[pieceName];
            onUpdated!();
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
          value={value}
          onChange={(txt) => {
            curPieceLibrary.pieces[pieceName] = txt;
            sessionService.markUpdated(curSession!.name);
          }}
        />
      </div>
      <div className={'mt-1 gray-label'}>
        랜덤 줄 선택 모드:{' '}
        <input
          checked={curPieceLibrary.multi[pieceName]}
          type="checkbox"
          onChange={(e) => {
            if (!movePiece) return;
            curPieceLibrary.multi[pieceName] = e.target.checked;
            onUpdated!();
          }}
        />
      </div>
    </div>
  );
};

const PieceEditor = observer(() => {
  const { curSession, pushMessage, pushDialog } = appState;
  const [selectedPieceLibrary, setSelectedPieceLibrary] = useState<
    string | null
  >(null);
  const [curPieceLibrary, setCurPieceLibrary] = useState<PieceLibrary | null>(
    null,
  );
  const [_, rerender] = useState<{}>({});
  const onUpdated = () => {
    sessionService.markUpdated(curSession!.name);
    rerender({});
  };

  useEffect(() => {
    setCurPieceLibrary(
      selectedPieceLibrary ? curSession!.library.get(selectedPieceLibrary)! : null,
    );
  }, [selectedPieceLibrary]);

  const movePiece = (from: string, to: string) => {
    const newPieces = { ...curPieceLibrary!.pieces };
    const keys = Object.keys(newPieces);
    const fromIndex = keys.indexOf(from);
    const toIndex = keys.indexOf(to);
    const [movedKey] = keys.splice(fromIndex, 1);
    keys.splice(toIndex, 0, movedKey);

    const reorderedPieces: any = {};
    keys.forEach((key) => {
      reorderedPieces[key] = newPieces[key];
    });
    curPieceLibrary!.pieces = reorderedPieces;
    onUpdated();
  };

  return (
    <div className="flex flex-col h-full">
      <div className="flex gap-2 flex-0 pb-2 items-center">
        <DropdownSelect
          selectedOption={selectedPieceLibrary}
          menuPlacement="bottom"
          options={Object.entries(curSession!.library).map(([name, lib]) => ({
            label: name,
            value: name,
          }))}
          onSelect={(opt) => {
            setSelectedPieceLibrary(opt.value);
          }}
        />

        <button
          className={`icon-button h-8 px-4 ml-auto`}
          onClick={async () => {
            pushDialog({
              type: 'input-confirm',
              text: '조각그룹의 이름을 입력하세요',
              callback: async (name) => {
                if (!name) return;
                if (name in curSession!.library) {
                  pushMessage('조각그룹이 이미 존재합니다');
                  return;
                }
                curSession!.library[name] = {
                  pieces: {},
                  description: name,
                  multi: {},
                };
                setSelectedPieceLibrary(name);
                sessionService.reloadPieceLibraryDB(curSession!);
                onUpdated();
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
            pushDialog({
              type: 'confirm',
              text: '정말로 삭제하시겠습니까?',
              callback: async () => {
                delete curSession!.library[selectedPieceLibrary!];
                setSelectedPieceLibrary(null);
                onUpdated();
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
          {Object.entries(curPieceLibrary.pieces).map(([key, value]) => (
            <PieceCell
              key={curPieceLibrary.description! + ' ' + key}
              pieceName={key}
              value={value}
              name={curPieceLibrary.description}
              curPieceLibrary={curPieceLibrary}
              onUpdated={onUpdated}
              movePiece={movePiece}
            />
          ))}
          <button
            className="py-2 px-8 rounded-xl back-lllgray"
            onClick={async () => {
              pushDialog({
                type: 'input-confirm',
                text: '조각의 이름을 입력하세요',
                callback: (name) => {
                  if (!name) return;
                  if (name in curPieceLibrary.pieces) {
                    pushMessage('조각이 이미 존재합니다');
                    return;
                  }
                  curPieceLibrary!.pieces[name] = '';
                  onUpdated();
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
