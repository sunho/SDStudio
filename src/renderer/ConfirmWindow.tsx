import { useContext, useEffect, useState } from 'react';
import { AppContext } from './App';
import { grayInput } from './styles';
import { DropdownSelect } from './UtilComponents';

export interface Dialog {
  text: string;
  callback?: ((value?: string, text?: string) => void) | ((value?: string, text?:string) => Promise<void>);
  type: 'confirm' | 'yes-only' | 'input-confirm' | 'select' | 'dropdown';
  inputValue?: string;
  green?: boolean;
  items?: { text: string; value: string }[];
}

interface Props {
  setDialogs: (dialogs: Dialog[]) => void;
}

const ConfirmWindow = ({ setDialogs }: Props) => {
  const { dialogs } = useContext(AppContext)!;
  const [inputValue, setInputValue] = useState<string>('');

  const handleConfirm = () => {
    const currentDialog = dialogs[dialogs.length - 1];
    setDialogs(dialogs.slice(0, dialogs.length - 1));
    if (currentDialog && currentDialog.callback) {
      currentDialog.callback(
        (currentDialog.type === 'input-confirm' || currentDialog.type === 'dropdown') ? inputValue : undefined,
        currentDialog.text
      );
    }
    setInputValue('');
  };

  const curDialog = dialogs[dialogs.length - 1];
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Enter') {
        e.preventDefault();
        handleConfirm();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [inputValue, dialogs, setDialogs]);

  return (
    <>
      {dialogs.length > 0 && (
        <div className="fixed flex justify-center w-full confirm-window">
          <div className="flex flex-col justify-between m-4 p-4 rounded-md shadow-xl bg-white text-black w-96">
            <div className="break-keep text-center">
              {curDialog.text}
            </div>
            {curDialog.type === 'input-confirm' && (
              <input
                type="text"
                value={inputValue}
                onChange={(e) => setInputValue(e.target.value)}
                className={`${grayInput} mt-4 mb-4`}
              />
            )}
            <div className={"justify-end mt-4 " + ((curDialog.type === 'select' || curDialog.type === 'dropdown') ? 'flex flex-col gap-2' : 'flex')}>
              {curDialog.type === 'confirm' && (
                <>
                  <button
                    className={"mr-2 px-4 py-2 rounded text-white " + (curDialog.green ? "bg-sky-500" : "bg-red-500")}
                    onClick={handleConfirm}
                  >
                    확인
                  </button>
                  <button
                    className="px-4 py-2 rounded bg-gray-500 text-white"
                    onClick={() => {
                      setDialogs(dialogs.slice(0, dialogs.length - 1));
                      setInputValue('');
                    }}
                  >
                    취소
                  </button>
                </>
              )}
              {curDialog.type === 'yes-only' && (
                <button
                  className="px-4 py-2 rounded bg-sky-500 text-white"
                  onClick={handleConfirm}
                >
                  확인
                </button>
              )}
              {curDialog.type === 'input-confirm' && (
                <>
                  <button
                    className="mr-2 px-4 py-2 rounded bg-sky-500 text-white"
                    onClick={handleConfirm}
                  >
                    확인
                  </button>
                  <button
                    className="px-4 py-2 rounded bg-gray-500 text-white"
                    onClick={() => {
                      setDialogs(dialogs.slice(0, dialogs.length - 1));
                      setInputValue('');
                    }}
                  >
                    취소
                  </button>
                </>
              )}
              {curDialog.type === 'select' && (
                <>
                  {curDialog.items!.map((item, idx) => (
                    <button
                      key={idx}
                      className="w-full px-4 py-2 rounded bg-sky-500 text-white mr-2"
                      onClick={() => {
                        setDialogs(dialogs.slice(0, dialogs.length - 1));
                        if (curDialog.callback) {
                          curDialog.callback!(item.value, item.text);
                        }
                      }}
                    >
                      {item.text}
                    </button>
                  ))}
                  <button
                    className="w-full px-4 py-2 rounded bg-gray-500 text-white"
                    onClick={() => {
                      setDialogs(dialogs.slice(0, dialogs.length - 1));
                    }}
                  >
                    취소
                  </button>
                </>
              )}
              {curDialog.type === 'dropdown' && (
                <>
                  <div className="w-full mt-4">
                  <DropdownSelect
                    className="z-20 w-full"
                    selectedOption={curDialog.items!.find((item) => item.value === inputValue)}
                    menuPlacement="bottom"
                    options={curDialog.items!.map((item) => ({
                      label: item.text,
                      value: item.value,
                    }))}
                    onSelect={(opt) => {
                      setInputValue(opt.value);
                    }}
                  />
                  </div>
                  <div className="flex gap-2 ml-auto mt-5">
                    <button
                      className="flex-1 px-4 py-2 block rounded bg-sky-500 text-white"
                      onClick={handleConfirm}
                    >
                      확인
                    </button>
                    <button
                      className="flex-1 px-4 py-2 block rounded bg-gray-500 text-white"
                      onClick={() => {
                        setDialogs(dialogs.slice(0, dialogs.length - 1));
                        setInputValue('');
                      }}
                    >
                      취소
                    </button>
                  </div>
                </>
              )}
            </div>
          </div>
        </div>
      )}
    </>
  );
};

export default ConfirmWindow;
