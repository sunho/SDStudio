import { useContext, useEffect, useRef, useState } from 'react';
import {
  Scene,
  InPaintScene,
  Match,
  imageService,
  gameService,
  sessionService,
  invoke,
} from './models';
import { AppContext } from './App';
import { roundButton } from './styles';

interface TournamentProps {
  scene: Scene | InPaintScene;
  onFilenameChange: (path: string) => void;
  path: string;
}

const Tournament = ({ scene, path, onFilenameChange }: TournamentProps) => {
  const { curSession, pushMessage, pushDialog } = useContext(AppContext)!;
  const [images, setImages] = useState<string[]>([]);
  const [matches, setMatches] = useState<Match[]>([]);
  const matchRes = useRef<number[]>([]);
  const [winner, setWinner] = useState(-1);
  const lock = useRef(false);
  const [finalRank, setFinalRank] = useState(-1);
  const [fastmode, setFastmode] = useState(false);
  const [mi, setMi] = useState(0);
  const setNextMatch = () => {
    const [finalizedRank, newMatches] = gameService.nextMatch(scene.game!);
    setMi(0);
    if (newMatches) {
      setMatches(newMatches);
      setFinalRank(finalizedRank);
    } else {
      setMatches([]);
      setFinalRank(finalizedRank);
    }
  };
  const gameUpdated = () => {
    gameService.gameUpdated(curSession!, scene);
    sessionService.markUpdated(curSession!.name);
  };
  useEffect(() => {
    setMatches([]);
    setFinalRank(-1);
    (async () => {
      try {
        if (!scene.game) {
          scene.game = await gameService.createGame(path);
        }
        let files = await invoke('list-files', path);
        files = files.filter((f: string) => f.endsWith('.png'));
        if (scene.game!.length !== files.length) {
          pushDialog({
            type: 'yes-only',
            text: '새로운 이미지가 추가되었습니다. 순위를 초기화 해주세요.',
          });
        }
        setNextMatch();
      } catch (e: any) {
        pushMessage('Error: ' + e.message);
      }
    })();
  }, [scene]);
  const finalizeMatch = () => {
    for (let i = 0; i < matches.length; i++) {
      matches[i].players[matchRes.current[i]].rank = matches[i].winRank;
    }
  };
  useEffect(() => {
    setImages([]);
    if (matches.length) {
      (async () => {
        try {
          const p0 = await imageService.fetchImage(matches[mi].players[0].path);
          const p1 = await imageService.fetchImage(matches[mi].players[1].path);
          setImages([p0, p1]);
        } catch (e: any) {
          pushMessage('Image load error: ' + e.message);
        }
      })();
    } else if (scene.game && scene.game.length && matches.length === 0) {
      const first = scene.game.find((p) => p.rank === 0);
      if (first) {
        (async () => {
          try {
            const p0 = await imageService.fetchImage(first.path);
            setImages([p0]);
          } catch (e: any) {
            pushMessage('Image load error: ' + e.message);
          }
        })();
      }
    }
  }, [matches, mi]);
  const selectPlayer = (index: any) => {
    if (lock.current)
      return;
    lock.current = true;
    const goNext= async () => {
      try {
        matchRes.current[mi] = index;
        if (mi == matches.length - 1) {
          finalizeMatch();
          gameUpdated();
          if (matches[mi].winRank === 0) {
            pushDialog({
              type: 'yes-only',
              text: '1위가 결정되었습니다. 여기서 멈춰도 됩니다.',
            });
          }
          setNextMatch();
          setWinner(-1);
        } else {
          setMi(mi + 1);
          setWinner(-1);
        }
      } catch (e: any) {
        pushMessage('Error: ' + e.message);
      } finally {
        lock.current = false;
      }
    };
    if (fastmode) {
      goNext();
    } else {
      setTimeout(goNext, 1000);
    }
  };
  const resetRanks = async () => {
    try {
      scene.game = await gameService.createGame(path);
      setNextMatch();
    } catch (e: any) {
      pushMessage('Error: ' + e.message);
    }
  };
  const getCurWinRank = () => {
    if (matches[mi].winRank === 0) {
      return '결승전';
    }
    if (matches[mi].winRank === 1) {
      return '준결승전';
    }
    return `${matches[mi].winRank + 1}강`;
  };
  const showFolder = async () => {
    await invoke('show-file', path);
  };
  return (
    <div className="flex flex-col w-full h-full">
      <div className="p-4 flex flex-none gap-2 items-center">
        {!!matches.length ? (
          <span className="font-bold text-xl">
            {finalRank + 1}위 결정 이상형 월드컵 {getCurWinRank()} ({mi + 1}/
            {matches.length})
          </span>
        ) : (
          <span className="font-bold text-xl">모든 순위가 확정되었습니다</span>
        )}
      </div>
      <div className="px-4 pb-4 flex flex-none gap-2 w-full border-b border-gray-300 pb-2">
        <button className={`${roundButton} bg-sky-500`} onClick={showFolder}>
          결과 폴더 열기
        </button>
        <button
          onClick={() => {
            if (winner === -1 && !lock.current)
              setMi(mi - 1);
          }}
          className={`${roundButton} bg-gray-500`}
        >
          실행취소
        </button>
        <button className={`${roundButton} bg-red-500`} onClick={resetRanks}>
          순위 초기화
        </button>
        <button
          className={`${roundButton} ${fastmode ? 'bg-orange-400' : 'bg-green-500'}`}
          onClick={() => {
            setFastmode(!fastmode);
          }}
        >
          {fastmode ? '일반모드 켜기' : '페스트모드 켜기'}
        </button>
      </div>
      <div className="flex-1 w-full overflow-hidden">
        {!!(matches.length && images.length) && (
          <div className="h-full float-view-comp-width flex">
            <div className="flex-1 justify-center items-center flex">
              <img
                onClick={() => {
                  if (winner === -1)
                    selectPlayer(0);
                }}
                className={
                  'active:brightness-90 hover:brightness-95 cursor-pointer imageSmall ' +
                  (!fastmode && winner !== -1 && winner !== 0 ? 'hidden' : '')
                }
                src={images[0]}
              />
            </div>
            <div className="bg-gray-300 w-px h-full flex-none"></div>
            <div className="flex-1 justify-center items-cetner flex">
              <img
                onClick={() => {
                  if (winner === -1)
                    selectPlayer(1);
                }}
                className={
                  'active:brightness-90 hover:brightness-95 cursor-pointer imageSmall flex-1 ' +
                  (!fastmode && winner !== -1 && winner !== 1 ? 'hidden' : '')
                }
                src={images[1]}
              />
            </div>
          </div>
        )}
        {!!(
          scene.game &&
          scene.game.length &&
          matches.length === 0 &&
          images.length
        ) && (
          <div className="h-full w-full">
            <img
              className="imageSmall"
              src={images[0]}
            />
          </div>
        )}
      </div>
    </div>
  );
};

export default Tournament;
