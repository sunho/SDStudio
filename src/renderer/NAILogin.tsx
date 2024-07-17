import { useContext, useEffect, useState } from 'react';
import { PreSet, Session, backend, loginService, taskQueueService } from './models';
import { AppContext } from './App';
import { grayInput, primaryColor, roundButton } from './styles';
import { FloatView } from './FloatView';
import ConfigScreen from './ConfigScreen';
import SessionSelect from './SessionSelect';

interface Props {
  setCurSession: (session: Session|undefined) => void;
  setSelectedPreset: (presets: PreSet) => void;
}

const NAILogin = ({ setCurSession, setSelectedPreset } : Props) => {
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
        } catch(e){}
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

  const roundTag = 'text-white px-3 py-1 rounded-full';

  const [settings, setSettings] = useState(false);

  return (
    <div className={"flex border-b border-gray-200 px-2 py-2 items-center"}>
      <div className="gap-3 hidden md:flex text-sky-500 font-bold">
        SDStudio
      </div>
      <p className="ml-auto mr-2 hidden md:block">
        {!loggedIn ? <span className={`${roundTag} bg-red-500`}>환경설정에서 로그인하세요</span> : <>
        <span className='text-black'>Anlas: </span>{' '}
        <span className={`${roundTag} bg-yellow-500`}>{credits}</span></>}
      </p>
      <button className={`${roundButton} bg-sky-500`} onClick={
        () => {
          setSettings(true);
        }
      }>
        환경설정
      </button>
      <p className="md:hidden ml-2">
        {!loggedIn ? <span className={`${roundTag} bg-red-500`}>로그인 필요</span> : <>
        <span className={`${roundTag} bg-yellow-500 mr-2`}>{credits}</span></>}
      </p>
      <div className="ml-auto block md:hidden">
      <SessionSelect
        setCurSession={setCurSession}
        setSelectedPreset={setSelectedPreset}
        />
      </div>
      {settings &&<FloatView
        priority={1}
        onEscape={()=>{setSettings(false);}}
      >
        <ConfigScreen
          onSave={()=>{
            setSettings(false);
          }}
        />
      </FloatView>}
    </div>
  );
};

export default NAILogin;
