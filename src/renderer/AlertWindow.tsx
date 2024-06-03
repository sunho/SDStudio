import { useContext, useEffect } from 'react';
import { AppContext } from './App';

interface Props {
  setMessages: (messages: string[]) => void;
}

const AlertWindow = ({ setMessages }: Props) => {
  const { messages } = useContext(AppContext)!;

  useEffect(() => {
    const interval = setInterval(() => {
      if (messages.length > 0) {
        setMessages(messages.slice(0, messages.length - 1));
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
              setMessages(messages.slice(0, messages.length - 1));
            }}
          >
            X
          </button>
        </div>
      )}
    </div>
  );
};

export default AlertWindow;
