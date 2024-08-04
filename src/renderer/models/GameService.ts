import { backend, imageService } from '.';
import { Game, GenericScene, Round, Session } from './types';

export const sortGame = (game: Game) => {
  game.sort((a, b) => {
    if (a.rank !== b.rank) {
      return a.rank - b.rank;
    } else {
      if (a.path < b.path) return -1;
      if (a.path > b.path) return 1;
      return 0;
    }
  });
};

export class GameService extends EventTarget {
  outputList: {
    [type: string]: { [key: string]: { [key2: string]: string[] } };
  };
  constructor() {
    super();
    this.outputList = {
      scene: {},
      inpaint: {},
    };
    imageService.addEventListener('updated', (e) => {
      this.onImageUpdated(e);
    });
  }

  gameUpdated(session: Session, scene: GenericScene) {
    this.refreshList(session, scene);
    this.dispatchEvent(new CustomEvent('updated', {}));
  }

  onImageUpdated(e: any) {
    if (e.detail.batch) {
      for (const type of ['scene', 'inpaint']) {
        const session = e.detail.session;
        for (const scene of session.getScenes(type)) {
          this.refreshList(session, scene as GenericScene);
        }
      }
    } else {
      this.refreshList(e.detail.session, e.detail.scene);
    }
    this.dispatchEvent(new CustomEvent('updated', {}));
  }

  getOutputs(session: Session, scene: GenericScene) {
    if (!(scene.type in this.outputList)) {
      return [];
    }
    if (!(session.name in this.outputList[scene.type])) {
      return [];
    }
    if (!(scene.name in this.outputList[scene.type][session.name])) {
      return [];
    }
    return this.outputList[scene.type][session.name][scene.name];
  }

  refreshList(session: Session, scene: GenericScene) {
    const type = scene.type;
    const list = this.outputList[type];
    if (!(session.name in list)) {
      list[session.name] = {};
    }
    let images = imageService.getOutputs(session, scene);
    const invImageMap: any = {};
    for (let i = 0; i < scene.imageMap.length; i++) {
      invImageMap[scene.imageMap[i]] = i;
    }
    images = images.filter((x: string) => x in invImageMap);
    const sortByGameAndNatural = (
      a: [number, number | undefined],
      b: [number, number | undefined],
    ) => {
      if (a[1] == null && b[1] == null) {
        return a[0] - b[0];
      }
      if (a[1] == null) {
        return 1;
      }
      if (b[1] == null) {
        return -1;
      }
      if (b[1] === a[1]) {
        return a[0] - b[0];
      }
      return b[1] - a[1];
    };
    const cvtMap: any = {};
    if (scene.game) {
      for (const player of scene.game) {
        cvtMap[player.path] = player.rank;
      }
      const files = images.map(
        (x: string) =>
          [invImageMap[x], cvtMap[x]] as [number, number | undefined],
      );
      files.sort(sortByGameAndNatural);
      files.reverse();
      list[session.name][scene.name] = files.map(
        (x: [number, number | undefined]) => scene.imageMap[x[0]],
      );
    } else {
      images.reverse();
      list[session.name][scene.name] = images;
    }
    if (scene.type === 'scene') {
      const nameToPrior: any = {};
      list[session.name][scene.name].forEach((x: string, i: number) => {
        nameToPrior[x] = i;
      });
      scene.mains.sort((a: string, b: string) => {
        return nameToPrior[a] - nameToPrior[b];
      });
    }
  }

  async createGame(path: string) {
    let files = await backend.listFiles(path);
    files = files.filter((x: string) => x.endsWith('.png'));
    return files.map((x: string) => ({
      path: x,
      rank: files.length - 1,
    }));
  }

  cleanGame(game: Game) {
    sortGame(game);
    let curRank = game.length - 1;
    let prev = -1;
    let cnt = 0;
    for (let i = game.length - 1; i >= 0; i--) {
      if (game[i].rank !== prev) {
        prev = game[i].rank;
        curRank -= cnt;
        cnt = 0;
      }
      game[i].rank = curRank;
      cnt++;
    }
  }

  nextRound(game: Game): [number, Round | undefined] {
    sortGame(game);
    let matchRank = -1;
    for (let i = 0; i < game.length - 1; i++) {
      if (game[i].rank === game[i + 1].rank) {
        matchRank = game[i].rank;
        break;
      }
    }
    if (matchRank === -1) {
      return [game.length, undefined];
    }
    let matchPlayers = game.filter((x) => x.rank === matchRank);
    shuffleArray(matchPlayers);
    for (let i = 0; i < game.length - 1; i++) {
      if (game[i].rank != i) {
        const round: Round = {
          players: matchPlayers.map(x => x.path),
          winMask: matchPlayers.map(() => false),
          curPlayer: 0,
        };
        return [i, round];
      }
    }
    throw new Error('should not be reached here');
  }
}

export function shuffleArray<T>(arr: T[]) {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
}
