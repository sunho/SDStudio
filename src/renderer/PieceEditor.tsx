import { useContext, useEffect, useState } from 'react';
import { AppContext } from './App';
import { PieceLibrary, invoke, promptService, sessionService } from './models';
import { DropdownSelect } from './UtilComponents';
import { PromptEditTextArea } from './SceneEditor';
import { primaryColor, roundButton } from './styles';
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
                curSession!.library[name] = { pieces: {}, description: name };
                setSelectedPieceLibrary(name);
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
              key={curPieceLibrary.description + " " + key}
              className="p-3 border border-gray-300 my-2">
              <div className="flex pb-2">
                <div className="font-bold">{key}</div>
                <button
                  className="ml-auto"
                  onClick={() => {
                    delete curPieceLibrary.pieces[key];
                    onUpdated();
                  }}
                >
                  <FaTrash size={20} color="#ef4444" />
                </button>
              </div>
              <PromptEditTextArea
                className="bg-gray-200 h-20"
                value={value}
                onChange={(txt) => {
                  curPieceLibrary.pieces[key] = txt;
                  sessionService.markUpdated(curSession!.name);
                }}
              />
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
                  onUpdated();
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
