import { useContext, useEffect, useState } from 'react';
import { AppContext } from './App';
import { FloatView } from './FloatView';
import ConfigScreen from './ConfigScreen';
import SessionSelect from './SessionSelect';
import { PreSet, Session } from './models/types';
import { loginService, backend, taskQueueService } from './models';

interface Props {
  setCurSession: (session: Session | undefined) => void;
  setSelectedPreset: (presets: PreSet) => void;
}

const TobBar = ({ setCurSession, setSelectedPreset }: Props) => {
  const ctx = useContext(AppContext)!;
  const [loggedIn, setLoggedIn] = useState(false);
  const [credits, setCredits] = useState(0);

  useEffect(() => {
    const onChange = () => {
      setLoggedIn(loginService.loggedIn);
      (async () => {
        try {
          const credits = await backend.getRemainCredits();
          setCredits(credits);
        } catch (e) {}
      })();
    };
    onChange();
    loginService.addEventListener('change', onChange);
    taskQueueService.addEventListener('complete', onChange);
    return () => {
      loginService.removeEventListener('change', onChange);
      taskQueueService.removeEventListener('complete', onChange);
    };
  }, []);

  const [settings, setSettings] = useState(false);

  return (
    <div className={'flex border-b line-color px-2 py-2 items-center'}>
      <div className="gap-3 hidden md:flex text-sky-500 font-bold dark:text-white">
        SDStudio
      </div>
      <p className="ml-auto mr-2 hidden md:block">
        {!loggedIn ? (
          <span className={`round-tag back-red`}>
            환경설정에서 로그인하세요
          </span>
        ) : (
          <>
            <span className="text-sub">Anlas: </span>{' '}
            <span className={`round-tag back-yellow`}>{credits}</span>
          </>
        )}
      </p>
      <button
        className={`round-button back-sky`}
        onClick={() => {
          setSettings(true);
        }}
      >
        환경설정
      </button>
      <p className="md:hidden ml-2">
        {!loggedIn ? (
          <span className={`round-tag back-red`}>로그인 필요</span>
        ) : (
          <>
            <span className={`round-tag back-yellow mr-2`}>{credits}</span>
          </>
        )}
      </p>
      <div className="ml-auto block md:hidden">
        <SessionSelect
          setCurSession={setCurSession}
          setSelectedPreset={setSelectedPreset}
        />
      </div>
      {settings && (
        <FloatView
          priority={1}
          onEscape={() => {
            setSettings(false);
          }}
        >
          <ConfigScreen
            onSave={() => {
              setSettings(false);
            }}
          />
        </FloatView>
      )}
    </div>
  );
};

export default TobBar;
