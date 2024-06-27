import { useContext, useEffect, useRef, useState } from 'react';
import {
  Scene,
  InPaintScene,
  Match,
  imageService,
  gameService,
  sessionService,
  invoke,
  shuffleArray,
  encodeContextAlt,
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
  const [players, setPlayers] = useState<string[]>([]);
  const lock = useRef(false);
  const [finalRank, setFinalRank] = useState(-1);
  const loadRoundInitial = () => {
    const [finalizedRank, newRound] = gameService.nextRound(scene.game!);
    if (!scene.round) {
      scene.round = newRound;
      sessionUpdated();
    }
    if (newRound) {
      const round = scene.round!;
      setPlayers([round.players[round.curPlayer].path, round.players[round.curPlayer+1].path]);
    }
    setFinalRank(finalizedRank);
  };
  const finalizeMatch = () => {
    let wins = 0;
    let loses = 0;
    const round = scene.round!;
    if (round.players.length % 2 === 1) {
      round.winMask[round.players.length - 1] = true;
    }
    for (let i = 0; i < round.players.length; i++) {
      if (round.winMask[i]) {
        wins++;
      } else {
        loses++;
      }
    }
    const roundRank = round.players[0].rank;
    const winRank = roundRank - loses;
    for (let i = 0; i < round.players.length; i++) {
      if (round.winMask[i]) {
        round.players[i].rank = winRank;
      }
    }
    if (winRank === 0) {
      pushDialog({
        type: 'yes-only',
        text: '1위가 결정되었습니다. 여기서 멈춰도 됩니다.',
      });
    }
    gameUpdated();
  };
  const nextMatch = () => {
    if (lock.current)
      return;
    setPlayers([]);
    lock.current = true;
    const round = scene.round!;
    round.curPlayer += 2;
    if (round.curPlayer + 1 >= round.players.length) {
      finalizeMatch();
      const [finalizedRank, newRound] = gameService.nextRound(scene.game!);
      if (newRound) {
        scene.round = newRound;
        setPlayers([newRound.players[0].path, newRound.players[1].path]);
      }
      setFinalRank(finalizedRank);
      sessionUpdated();
      lock.current = false;
      return;
    }
    setPlayers([round.players[round.curPlayer].path, round.players[round.curPlayer+1].path]);
    sessionUpdated();
    lock.current = false;
  };
  const gameUpdated = () => {
    gameService.gameUpdated(curSession!, scene);
    sessionUpdated();
  };
  const sessionUpdated = () => {
    sessionService.markUpdated(curSession!.name);
  };
  useEffect(() => {
    setPlayers([]);
    setImages([]);
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
        loadRoundInitial();
      } catch (e: any) {
        pushMessage('Error: ' + e.message);
      }
    })();
  }, [scene]);
  useEffect(() => {
    const round = scene.round!;
    if (players.length) {
      (async () => {
        try {
          const p0 = await imageService.fetchImage(players[0]);
          const p1 = await imageService.fetchImage(players[1]);
          setImages([p0, p1]);
        } catch (e: any) {
          pushMessage('Image load error: ' + e.message);
          setImages([]);
        }
      })();
    } else if (scene.game && scene.game.length && players.length === 0) {
      const first = scene.game.find((p) => p.rank === 0);
      if (first) {
        (async () => {
          try {
            const p0 = await imageService.fetchImage(first.path);
            setImages([p0]);
          } catch (e: any) {
            pushMessage('Image load error: ' + e.message);
            setImages([]);
          }
        })();
      } else {
        setImages([]);
      }
    } else {
      setImages([]);
    }
  }, [players]);
  const resetRanks = () => {
    pushDialog({
      type: 'confirm',
      text: '정말로 순위를 초기화하시겠습니까?',
      callback: async () => {
        setPlayers([]);
        setFinalRank(-1);
        try {
          scene.game = await gameService.createGame(path);
          scene.round = undefined;
          loadRoundInitial();
        } catch (e: any) {
          pushMessage('Error: ' + e.message);
        }
      },
    });
  };
  const reroll = () => {
    const round = scene.round!;
    if (round.players.length <= 1) {
      return;
    }
    const players = round.players.slice(round.curPlayer);
    shuffleArray(players);
    round.players = round.players.slice(0, round.curPlayer).concat(players);
    setPlayers([players[round.curPlayer].path, players[round.curPlayer+1].path]);
    sessionUpdated();
  };
  const getCurWinRank = () => {
    const round = scene.round!;
    if (round.players.length === 2) {
      return '결승전';
    }
    if (round.players.length <= 5) {
      return '준결승전';
    }
    return `${Math.floor(round.players.length/2)}강`;
  };
  const showFolder = async () => {
    await invoke('show-file', path);
  };
  const round = scene.round!;
  return (
    <div className="flex flex-col w-full h-full">
      <div className="p-4 flex flex-none gap-2 items-center">
        {!!players.length ? (
          <span className="font-bold text-xl">
            {finalRank + 1}위 결정 이상형 월드컵 {getCurWinRank()} ({Math.floor(round.curPlayer/2) + 1}/
            {Math.floor(round.players.length/2)})
          </span>
        ) : (
          <span className="font-bold text-xl">모든 순위가 확정되었습니다</span>
        )}
      </div>
      <div className="px-4 pb-4 flex flex-none gap-2 w-full border-b border-gray-300 pb-2">
        <button className={`${roundButton} bg-sky-500`} onClick={showFolder}>
          결과 폴더 열기
        </button>
        <button className={`${roundButton} bg-red-500`} onClick={resetRanks}>
          순위 초기화
        </button>
        <button
          onClick={() => {
            if (!lock.current && round.curPlayer !== 0) {
              setPlayers([]);
              round.curPlayer -= 2;
              setPlayers([round.players[round.curPlayer].path, round.players[round.curPlayer+1].path]);
            }
          }}
          className={`${roundButton} bg-gray-500`}
        >
          실행취소
        </button>
        <button className={`${roundButton} bg-orange-400`} onClick={reroll}>
          대진 리롤
        </button>
        <button className={`${roundButton} bg-orange-400`} onClick={() => {
          if (!lock.current){
            round.winMask[round.curPlayer] = false;
            round.winMask[round.curPlayer+1] = false;
            nextMatch();
          }
        }}>
          둘다 패배 처리
        </button>
        <button className={`${roundButton} bg-orange-400`} onClick={() => {
          if (!lock.current){
            round.winMask[round.curPlayer] = true;
            round.winMask[round.curPlayer+1] = true;
            nextMatch();
          }
        }}>
          둘다 승리 처리
        </button>
      </div>
      <div className="flex-1 w-full overflow-hidden">
        {!!(players.length && images.length) && (
          <div className="h-full float-view-comp-width flex">
            <div className="flex-1 justify-center items-center flex">
              <img
                onClick={() => {
                  if (!lock.current){
                    round.winMask[round.curPlayer] = true;
                    round.winMask[round.curPlayer+1] = false;
                    nextMatch();
                  }
                }}
                className={
                  'active:brightness-90 hover:brightness-95 cursor-pointer imageSmall '
                }
                src={images[0]}
                alt={encodeContextAlt({
                  type: 'image',
                  path: players[0]
                })}
              />
            </div>
            <div className="bg-gray-300 w-px h-full flex-none"></div>
            <div className="flex-1 justify-center items-cetner flex">
              <img
                onClick={() => {
                  if (!lock.current){
                    round.winMask[round.curPlayer] = false;
                    round.winMask[round.curPlayer+1] = true;
                    nextMatch();
                  }
                }}
                className={
                  'active:brightness-90 hover:brightness-95 cursor-pointer imageSmall flex-1 '
                }
                src={images[1]}
                alt={encodeContextAlt({
                  type: 'image',
                  path: players[1]
                })}
              />
            </div>
          </div>
        )}
        {!!(
          scene.game &&
          scene.game.length &&
          players.length === 0 &&
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
