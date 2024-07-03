import { useContext, useEffect, useState } from 'react';
import { loginService } from './models';
import { AppContext } from './App';
import { grayInput, primaryColor, roundButton } from './styles';
import { FloatView } from './FloatView';
import ConfigScreen from './ConfigScreen';
import SessionSelect from './SessionSelect';

interface Props {
  setCurSession: (session: string) => void;
}

const NAILogin = ({ setCurSession } : Props) => {
  const ctx = useContext(AppContext)!;
  const [loggedIn, setLoggedIn] = useState(false);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');

  useEffect(() => {
    const onChange = () => {
      setLoggedIn(loginService.loggedIn);
    };
    onChange();
    loginService.addEventListener('change', onChange);
    return () => {
      loginService.removeEventListener('change', onChange);
    };
  }, []);

  const login = () => {
    (async () => {
      try {
        await loginService.login(email, password);
      } catch (err: any) {
        ctx.pushMessage('로그인 실패:' + err.message);
      }
    })();
  };

  const roundTag = 'text-white px-3 py-1 rounded-full';

  const [settings, setSettings] = useState(false);

  return (
    <div className={"flex border-b border-gray-200 px-2 py-2 items-center"}>
      <div className="gap-3 hidden md:flex">
        <input
          className={`${grayInput}`}
          type="text"
          placeholder="이메일"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
        />
        <input
          className={`${grayInput}`}
          type="password"
          placeholder="암호"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
        />
        <button className={`${roundButton} ${primaryColor}`} onClick={login}>
          로그인
        </button>
      </div>
      <p className="ml-auto mr-2 hidden md:block">
        <span className="text-black">로그인 상태:</span>{' '}
        {loggedIn ? (
          <span className={`${roundTag} bg-green-500`}>Yes</span>
        ) : (
          <span className={`${roundTag} bg-red-500`}>No</span>
        )}
      </p>
      <button className={`${roundButton} bg-sky-500`} onClick={
        () => {
          setSettings(true);
        }
      }>
        환경설정
      </button>
      <div className="ml-auto block md:hidden">
      <SessionSelect
        setCurSession={setCurSession}/>
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
