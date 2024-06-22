import { createRef, useContext, useEffect, useRef, useState } from 'react';
import { AppContext } from './App';
import { PieceLibrary, invoke, promptService, sessionService } from './models';
import { DropdownSelect } from './UtilComponents';
import PromptEditTextArea from './PromptEditTextArea';
import { grayLabel, primaryColor, roundButton } from './styles';
import {
  FaArrowCircleUp,
  FaFileExport,
  FaPlus,
  FaShare,
  FaTrashAlt,
} from 'react-icons/fa';
import { FaTrash } from 'react-icons/fa';

const PieceEditor = () => {
  const { curSession, pushMessage, pushDialog } = useContext(AppContext)!;
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
      selectedPieceLibrary ? curSession!.library[selectedPieceLibrary] : null,
    );
  }, [selectedPieceLibrary]);

  const draggedItem = useRef<string | null>(null);
  const elementsRef = useRef<{[key: string] : any}>({});

  useEffect(() => {
    if (curPieceLibrary) {
      for (const key in curPieceLibrary.pieces) {
        elementsRef.current[key] = createRef();
      }
    }
  }, [curPieceLibrary]);

  const handleDragStart = (e: any, key: string) => {
    const eleRef = elementsRef.current[key]?.current;
    if (eleRef) {
      const rect = eleRef.getBoundingClientRect();
      const isWithinElement =
        e.clientX >= rect.left &&
        e.clientX <= rect.right &&
        e.clientY >= rect.top &&
        e.clientY <= rect.bottom;
      if (isWithinElement) {
        e.preventDefault();
        return;
      }
    }
    draggedItem.current = key;
    e.dataTransfer.effectAllowed = 'move';
  };

  const handleDragOver = (e: React.DragEvent<HTMLDivElement>, key: string) => {
    e.preventDefault();
  };

  const handleDrop = (e: any , key: string) => {
    e.preventDefault();
    if (draggedItem.current !== key) {
      const reorderedPieces: any = {};
      const keys = Object.keys(curPieceLibrary!.pieces);
      const draggedIndex = keys.indexOf(draggedItem.current!);
      const targetIndex = keys.indexOf(key);
      const [removed] = keys.splice(draggedIndex, 1);
      keys.splice(targetIndex, 0, removed);
      keys.forEach(k => {
        reorderedPieces[k] = curPieceLibrary!.pieces[k];
      });
      curPieceLibrary!.pieces = reorderedPieces;
      onUpdated();
    }
    draggedItem.current = null;
  };

  const handleDragEnd = () => {
    draggedItem.current = null;
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
          className={`${roundButton} ${primaryColor} h-8 px-4 ml-auto`}
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
                curSession!.library[name] = { pieces: {}, description: name, multi: {} };
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
          className={`${roundButton} bg-orange-500 h-8 px-4`}
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
            await invoke(
              'write-file',
              outPath,
              JSON.stringify(curPieceLibrary),
            );
            await invoke('show-file', outPath);
          }}
        >
          <FaShare />
        </button>
        <button
          className={`${roundButton} bg-red-500 h-8 px-4`}
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
            <div
              draggable
              onDragStart={(e) => handleDragStart(e, key)}
              onDragOver={(e) => {handleDragOver(e,key);}}
              onDragEnd={handleDragEnd}
              onDrop={(e) => handleDrop(e, key)}
              key={curPieceLibrary.description + " " + key}
              className="p-3 bg-white border border-gray-300 my-2">
              <div className="flex pb-2">
                <div className="font-bold">{key}</div>
                <button
                  className="ml-auto"
                  onClick={() => {
                    delete curPieceLibrary.pieces[key];
                    delete curPieceLibrary.multi[key];
                    onUpdated();
                    sessionService.reloadPieceLibraryDB(curSession!);
                  }}
                >
                  <FaTrash size={20} color="#ef4444" />
                </button>
              </div>
              <div className="h-20">
              <PromptEditTextArea
                innerRef={elementsRef.current[key]}
                lineHighlight
                value={value}
                onChange={(txt) => {
                  curPieceLibrary.pieces[key] = txt;
                  sessionService.markUpdated(curSession!.name);
                }}
              />
              </div>
              <div className={"mt-1 " + grayLabel}>
              랜덤 줄 선택 모드: <input checked={curPieceLibrary.multi[key]} type="checkbox"
                  onChange={(e) => {
                    curPieceLibrary.multi[key] = e.target.checked;
                    onUpdated();
                  }}
                />
              </div>
            </div>
          ))}
          <button
            className="py-2 px-8 bg-gray-200 rounded-xl"
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
                  elementsRef.current[name] = createRef();
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
};

export default PieceEditor;
