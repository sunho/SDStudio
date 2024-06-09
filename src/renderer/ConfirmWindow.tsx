import { useContext, useEffect, useState } from 'react';
import { AppContext } from './App';
import { grayInput } from './styles';

export interface Dialog {
  text: string;
  callback?: ((value?: string) => void) | ((value?: string) => Promise<void>);
  type: 'confirm' | 'yes-only' | 'input-confirm' | 'select';
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
    if (currentDialog && currentDialog.callback) {
      currentDialog.callback(
        currentDialog.type === 'input-confirm' ? inputValue : undefined,
      );
    }
    setDialogs(dialogs.slice(0, dialogs.length - 1));
    setInputValue('');
  };

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Enter') {
        handleConfirm();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [inputValue, dialogs]);

  return (
    <>
      {dialogs.length > 0 && (
        <div className="fixed flex justify-center w-full confirm-window">
          <div className="flex flex-col justify-between m-4 p-4 rounded-md shadow-xl bg-white text-black w-96">
            <div className="break-keep text-center">
              {dialogs[dialogs.length - 1].text}
            </div>
            {dialogs[dialogs.length - 1].type === 'input-confirm' && (
              <input
                type="text"
                value={inputValue}
                onChange={(e) => setInputValue(e.target.value)}
                className={`${grayInput} mt-4 mb-4`}
              />
            )}
            <div className={"justify-end mt-4 " + (dialogs[dialogs.length - 1].type === 'select' ? 'flex flex-col gap-2' : 'flex')}>
              {dialogs[dialogs.length - 1].type === 'confirm' && (
                <>
                  <button
                    className={"mr-2 px-4 py-2 rounded text-white " + (dialogs[dialogs.length-1].green ? "bg-sky-500" : "bg-red-500")}
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
              {dialogs[dialogs.length - 1].type === 'yes-only' && (
                <button
                  className="px-4 py-2 rounded bg-sky-500 text-white"
                  onClick={handleConfirm}
                >
                  확인
                </button>
              )}
              {dialogs[dialogs.length - 1].type === 'input-confirm' && (
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
              {dialogs[dialogs.length - 1].type === 'select' && (
                <>
                  {dialogs[dialogs.length - 1].items!.map((item, idx) => (
                    <button
                      key={idx}
                      className="w-full px-4 py-2 rounded bg-sky-500 text-white mr-2"
                      onClick={() => {
                        if (dialogs[dialogs.length - 1].callback) {
                          dialogs[dialogs.length - 1].callback!(item.value);
                        }
                        setDialogs(dialogs.slice(0, dialogs.length - 1));
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
            </div>
          </div>
        </div>
      )}
    </>
  );
};

export default ConfirmWindow;
