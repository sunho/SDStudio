import { useContext, useEffect, useState } from 'react';
import { DropdownSelect } from './UtilComponents';
import { appState } from '../models/AppService';
import { observer } from 'mobx-react-lite';

export interface Dialog {
  text: string;
  callback?:
    | ((value?: string, text?: string) => void)
    | ((value?: string, text?: string) => Promise<void>);
  onCancel?: () => void;
  type: 'confirm' | 'yes-only' | 'input-confirm' | 'select' | 'dropdown';
  inputValue?: string;
  green?: boolean;
  graySelect?: boolean;
  items?: { text: string; value: string }[];
}

const ConfirmWindow = observer(() => {
  const [inputValue, setInputValue] = useState<string>('');
  console.log('DIAG', appState.dialogs);

  const handleConfirm = () => {
    console.log('confirm');
    const currentDialog = appState.dialogs[appState.dialogs.length - 1];
    if (appState.dialogs.length > 0) appState.dialogs.pop();
    if (currentDialog && currentDialog.callback) {
      currentDialog.callback(
        currentDialog.type === 'input-confirm' ||
          currentDialog.type === 'dropdown'
          ? inputValue
          : undefined,
        currentDialog.text,
      );
    }
    setInputValue('');
  };

  const curDialog = appState.dialogs[appState.dialogs.length - 1];
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Enter') {
        if (curDialog) e.preventDefault();
        handleConfirm();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [inputValue, appState.dialogs]);

  return (
    <>
      {appState.dialogs.length > 0 && (
        <div className="fixed flex justify-center w-full confirm-window">
          <div className="flex flex-col justify-between m-4 p-4 rounded-md shadow-xl bg-white dark:bg-slate-800 text-black w-96">
            <div className="break-keep text-center text-default">
              {curDialog.text}
            </div>
            {curDialog.type === 'input-confirm' && (
              <input
                type="text"
                value={inputValue}
                onChange={(e) => setInputValue(e.target.value)}
                className={`gray-input mt-4 mb-4`}
              />
            )}
            <div
              className={
                'justify-end mt-4 ' +
                (curDialog.type === 'select' || curDialog.type === 'dropdown'
                  ? 'flex flex-col gap-2'
                  : 'flex')
              }
            >
              {curDialog.type === 'confirm' && (
                <>
                  <button
                    className={
                      'mr-2 px-4 py-2 rounded clickable ' +
                      (curDialog.green ? 'back-sky' : 'back-red')
                    }
                    onClick={handleConfirm}
                  >
                    확인
                  </button>
                  <button
                    className="px-4 py-2 rounded back-gray clickable "
                    onClick={() => {
                      if (curDialog.onCancel) curDialog.onCancel();
                      appState.dialogs.pop();
                      setInputValue('');
                    }}
                  >
                    취소
                  </button>
                </>
              )}
              {curDialog.type === 'yes-only' && (
                <button
                  className="px-4 py-2 rounded back-sky clickable"
                  onClick={handleConfirm}
                >
                  확인
                </button>
              )}
              {curDialog.type === 'input-confirm' && (
                <>
                  <button
                    className="mr-2 px-4 py-2 rounded back-sky clickable"
                    onClick={handleConfirm}
                  >
                    확인
                  </button>
                  <button
                    className="px-4 py-2 rounded back-gray clickable"
                    onClick={() => {
                      if (curDialog.onCancel) curDialog.onCancel();
                      appState.dialogs.pop();
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
                      className={
                        'w-full px-4 py-2 rounded mr-2 clickable ' +
                        (curDialog.graySelect ? 'back-lgray' : 'back-sky')
                      }
                      onClick={() => {
                        appState.dialogs.pop();
                        if (curDialog.callback) {
                          curDialog.callback!(item.value, item.text);
                        }
                      }}
                    >
                      {item.text}
                    </button>
                  ))}
                  <button
                    className="w-full px-4 py-2 clickable rounded back-gray"
                    onClick={() => {
                      if (curDialog.onCancel) curDialog.onCancel();
                      appState.dialogs.pop();
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
                      selectedOption={curDialog.items!.find(
                        (item) => item.value === inputValue,
                      )}
                      menuPlacement="bottom"
                      options={curDialog.items!.map((item: any) => ({
                        label: item.text,
                        value: item.value,
                      }))}
                      onSelect={(opt: any) => {
                        setInputValue(opt.value);
                      }}
                    />
                  </div>
                  <div className="flex gap-2 ml-auto mt-5">
                    <button
                      className="flex-1 px-4 py-2 block rounded back-sky clickable"
                      onClick={handleConfirm}
                    >
                      확인
                    </button>
                    <button
                      className="flex-1 px-4 py-2 block rounded back-gray clickable"
                      onClick={() => {
                        if (curDialog.onCancel) curDialog.onCancel();
                        appState.dialogs.pop();
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
});

export default ConfirmWindow;
