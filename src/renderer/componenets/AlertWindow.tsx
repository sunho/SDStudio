import { observer } from 'mobx-react-lite';
import { useContext, useEffect } from 'react';
import { appState } from '../models/AppService';

const AlertWindow = observer(() => {
  const { messages } = appState;

  useEffect(() => {
    const interval = setInterval(() => {
      if (messages.length > 0) {
        appState.messages.splice(0, 1);
      }
    }, 5000);
    return () => {
      clearInterval(interval);
    };
  }, [messages]);

  return (
    <div className="fixed flex justify-center w-full alert-window">
      {messages.length > 0 && (
        <div className="flex justify-between m-4 p-4 rounded-md shadow-xl bg-red-600	text-white w-3/4">
          <div>{messages[messages.length - 1]}</div>
          <button
            onClick={() => {
              appState.messages.splice(0, 1);
            }}
          >
            X
          </button>
        </div>
      )}
    </div>
  );
});

export default AlertWindow;
