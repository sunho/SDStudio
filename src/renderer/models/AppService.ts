
import { backend, gameService, imageService, isMobile, localAIService, sessionService, taskQueueService, zipService } from '.';
import { Dialog } from '../componenets/ConfirmWindow';
import { convertDenDenData, isValidDenDenDataFormat } from './compat';
import { dataUriToBase64, deleteImageFiles } from './ImageService';
import { importStyle } from './SessionService';
import { action, observable } from 'mobx';
import { types, Instance } from 'mobx-state-tree';
import { isValidPieceLibrary, isValidSession, PieceLibrary, Scene, Session } from './types';
import { getFirstFile } from './util';
import { ImageOptimizeMethod } from '../backend';
import { v4 } from 'uuid';
import { RemoveBgTaskParams } from './TaskQueueService';
import { Resolution, resolutionMap } from '../backends/imageGen';

export interface SceneSelectorItem {
  text: string;
  callback: (scenes: Scene[]) => void;
}

export class AppState {
  @observable accessor curSession: Session | undefined = undefined;
  @observable accessor messages: string[] = [];
  @observable accessor dialogs: Dialog[] = [];
  @observable accessor samples: number = 10;

  @action
  addMessage(message: string): void {
    this.messages.push(message);
  }

  @action
  addDialog(dialog: Dialog): void {
    this.dialogs.push(dialog);
  }

  @action
  setSamples(samples: number): void {
    this.samples = samples;
  }

  pushMessage(msg: string) {
    this.messages.push(msg);
  }

  pushDialog(dialog: Dialog) {
    this.dialogs.push(dialog);
  }

  pushDialogAsync(dialog: Dialog) {
    return new Promise<string | undefined>((resolve, reject) => {
      dialog.callback = (value?: string, text?: string) => {
        resolve(value);
      };
      dialog.onCancel = () => {
        resolve(undefined);
      };
      this.dialogs.push(dialog);
    });
  }

  setProgressDialog(dialog: any) {
    this.dialogs.push(dialog);
  }

  handleFile(file: File) {
    if (file.type === 'application/json') {
      const reader = new FileReader();
      reader.onload = (e: any) => {
          try {
              const json = JSON.parse(e.target.result);
              handleJSONContent(file.name, json);
          } catch (err) {
              console.error(err);
          }
      };
      reader.readAsText(file);
      } else if (file.type === 'image/png') {
      if (!this.curSession) {
          return;
      }
      try {
          const reader = new FileReader();
          reader.onload = async (e: any) => {
          try {
              const base64 = dataUriToBase64(e.target.result);
              const preset = await importStyle(this.curSession!, base64);
              if (preset) {
              // setSelectedPreset(preset);
              sessionService.markUpdated(this.curSession!.name);
              this.pushDialog({
                  type: 'yes-only',
                  text: '그림체를 임포트 했습니다',
              });
              }
          } catch (e) {}
          };
          reader.readAsDataURL(file);
      } catch (err) {
          console.error(err);
      }
      }
      const handleJSONContent = async (name: string, json: any) => {
      if (name.endsWith('.json')) {
          name = name.slice(0, -5);
      }
      const handleAddSession = async (json: Session) => {
          const importCool = async () => {
          const sess = await sessionService.get(json.name);
          if (!sess) {
              await sessionService.importSessionShallow(json, json.name);
              const newSession = (await sessionService.get(json.name))!;
              this.curSession = newSession;
              this.pushDialog({
              type: 'yes-only',
              text: '프로젝트를 임포트 했습니다',
              });
          } else {
              this.pushDialog({
              type: 'input-confirm',
              text: '프로젝트를 임포트 합니다. 새 프로젝트 이름을 입력하세요.',
              callback: async (value) => {
                  if (!value || value === '') {
                  return;
                  }
                  try {
                  await sessionService.importSessionShallow(json, value);
                  const newSession = (await sessionService.get(value))!;
                  this.curSession = newSession;
                  } catch (e) {
                      this.pushMessage('이미 존재하는 프로젝트 이름입니다.');
                  }
              },
              });
          }
          };
          if (!this.curSession) {
              await importCool();
          } else {
          this.pushDialog({
              type: 'select',
              text: '프로젝트를 임포트 합니다. 원하시는 방식을 선택해주세요.',
              items: [
              {
                  text: '새 프로젝트로 임포트',
                  value: 'new-project',
              },
              {
                  text: '현재 프로젝트에 씬만 임포트 (⚠️! 씬이 덮어씌워짐)',
                  value: 'cur-project',
              },
              ],
              callback: async (option?: string) => {
              if (option === 'new-project') {
                  await importCool();
              } else if (option === 'cur-project') {
                  // const cur = this.curSession!;
                  // await sessionService.migrateSession(json);
                  // for (const key in json.scenes) {
                  // if (key in cur.scenes) {
                  //     cur.scenes[key].slots = json.scenes[key].slots;
                  //     cur.scenes[key].resolution = json.scenes[key].resolution;
                  // } else {
                  //     cur.scenes[key] = json.scenes[key];
                  //     cur.scenes[key].mains = [];
                  //     cur.scenes[key].game = undefined;
                  // }
                  // }
                  // sessionService.markUpdated(cur.name);
                  // sessionService.mainImageUpdated();
                  // pushDialog({
                  // type: 'yes-only',
                  // text: '씬을 임포트 했습니다',
                  //});
              }
              },
          });
          }
      };
      if (isValidSession(json)) {
          handleAddSession(json as Session);
      } else if (isValidPieceLibrary(json)) {
          if (!this.curSession) {
              this.pushMessage('세션을 먼저 선택해주세요.');
              return;
          }
          if (!(json.name in this.curSession.library)) {
          this.curSession.library.set(json.name, PieceLibrary.fromJSON(json));
          sessionService.markUpdated(this.curSession.name);
          sessionService.pieceLibraryImported();
          sessionService.reloadPieceLibraryDB(this.curSession);
          this.pushDialog({
              type: 'yes-only',
              text: '조각모음을 임포트 했습니다',
          });
          return;
          }
          this.pushDialog({
          type: 'input-confirm',
          text: '조각그룹을 임포트 합니다. 새 조각그룹 이름을 입력하세요.',
          callback: (value) => {
              if (!value || value === '') {
              return;
              }
              if (this.curSession!.library.has(value)){
              this.pushMessage('이미 존재하는 조각그룹 이름입니다.');
              return;
              }
              json.name = value;
              this.curSession!.library.set(value, PieceLibrary.fromJSON(json));
              sessionService.markUpdated(this.curSession!.name);
              sessionService.pieceLibraryImported();
          },
          });
      } else if (isValidDenDenDataFormat(json)) {
          const converted = convertDenDenData(name, json);
          handleAddSession(converted);
      }
      };
    }

    @action
    projectBackupMenu() {
      appState.pushDialog({
        type: 'select',
        text: '메뉴를 선택해주세요',
        items: [
          {
            text: '파일 불러오기',
            value: 'load',
          },
          {
            text: '프로젝트 백업 불러오기',
            value: 'loadDeep',
          },
          {
            text: '프로젝트 파일 내보내기 (이미지 미포함)',
            value: 'save',
          },
          {
            text: '프로젝트 백업 내보내기 (이미지 포함)',
            value: 'saveDeep',
          },
        ],

        callback: async (value) => {
          if (value === 'save') {
            if (appState.curSession) {
              const proj = await sessionService.exportSessionShallow(
                appState.curSession,
              );
              const path = 'exports/' + appState.curSession.name + '.json';
              await backend.writeFile(path, JSON.stringify(proj));
              await backend.showFile(path);
            }
          } else if (value === 'saveDeep') {
            if (appState.curSession) {
              const path = 'exports/' + appState.curSession.name + '.tar';
              if (zipService.isZipping) {
                appState.pushMessage('이미 내보내기 작업이 진행중입니다.');
                return;
              }
              appState.setProgressDialog({
                text: '압축 파일 생성중..',
                done: 0,
                total: 1,
              });
              try {
                await sessionService.exportSessionDeep(
                  appState.curSession,
                  path,
                );
              } catch (e: any) {
                appState.setProgressDialog(undefined);
                return;
              }
              appState.setProgressDialog(undefined);
              appState.pushDialog({
                type: 'yes-only',
                text: '백업이 완료되었습니다.',
              });
              await backend.showFile(path);
              appState.setProgressDialog(undefined);
            }
          } else if (value === 'load') {
            const file = await getFirstFile();
            appState.handleFile(file as any);
          } else {
            appState.pushDialog({
              type: 'input-confirm',
              text: '새로운 프로젝트 이름을 입력해주세요',
              callback: async (inputValue) => {
                if (inputValue) {
                  if (inputValue in sessionService.list()) {
                    appState.pushMessage('이미 존재하는 프로젝트 이름입니다.');
                    return;
                  }
                  const tarPath = await backend.selectFile();
                  if (tarPath) {
                    appState.setProgressDialog({
                      text: '프로젝트 백업을 불러오는 중입니다...',
                      done: 0,
                      total: 1,
                    });
                    try {
                      await sessionService.importSessionDeep(
                        tarPath,
                        inputValue,
                      );
                    } catch (e: any) {
                      appState.setProgressDialog(undefined);
                      appState.pushMessage(e.message);
                      return;
                    }
                    appState.setProgressDialog(undefined);
                    appState.pushDialog({
                      type: 'yes-only',
                      text: '프로젝트 백업을 불러왔습니다.',
                    });
                    const sess = await sessionService.get(inputValue);
                    this.curSession = sess;
                  }
                }
              },
            });
          }
        },
      });
    }

    @action
    openBatchProcessMenu(setSceneSelector: (item: SceneSelectorItem | undefined) => void) {
      const exportPackage = async (selected?: Scene[]) => {
        const exportImpl = async (
          prefix: string,
          fav: boolean,
          opt: string,
          imageSize: number,
        ) => {
          const paths = [];
          await imageService.refreshBatch(this.curSession!);
          const scenes = selected ?? Object.values(this.curSession!.scenes);
          for (const scene of scenes) {
            await gameService.refreshList(this.curSession!, scene);
            const cands = gameService.getOutputs(this.curSession!, scene);
            const imageMap: any = {};
            cands.forEach((x) => {
              imageMap[x] = true;
            });
            const images = [];
            if (fav) {
              if (scene.mains.length) {
                for (const main of scene.mains) {
                  if (imageMap[main]) images.push(main);
                }
              } else {
                if (cands.length) {
                  images.push(cands[0]);
                }
              }
            } else {
              for (const cand of cands) {
                images.push(cand);
              }
            }
            for (let i = 0; i < images.length; i++) {
              const path = images[i];
              if (images.length === 1) {
                paths.push({
                  path: imageService.getImageDir(this.curSession!, scene) + '/' + path,
                  name: prefix + scene.name + '.png',
                });
              } else {
                paths.push({
                  path: imageService.getImageDir(this.curSession!, scene) + '/' + path,
                  name: prefix + scene.name + '.' + (i + 1).toString() + '.png',
                });
              }
            }
          }
          if (opt !== 'original') {
            try {
              let done = 0;
              for (const item of paths) {
                const outputPath = 'tmp/' + v4() + '.webp';
                appState.setProgressDialog({
                  text: '이미지 크기 최적화 중..',
                  done: done,
                  total: paths.length,
                });
                await backend.resizeImage({
                  inputPath: item.path,
                  outputPath: outputPath,
                  maxHeight: imageSize,
                  maxWidth: imageSize,
                  optimize:
                    opt === 'lossy'
                      ? ImageOptimizeMethod.LOSSY
                      : ImageOptimizeMethod.LOSSLESS,
                });
                item.path = outputPath;
                item.name =
                  item.name.substring(0, item.name.length - 4) + '.webp';
                done++;
              }
            } catch (e: any) {
              appState.pushMessage(e.message);
              appState.setProgressDialog(undefined);
              return;
            }
          }
          appState.setProgressDialog({
            text: '이미지 압축파일 생성중..',
            done: 0,
            total: 1,
          });
          const outFilePath =
            'exports/' +
            this.curSession!.name +
            '_main_images_' +
            Date.now().toString() +
            '.tar';
          if (zipService.isZipping) {
            appState.pushDialog({
              type: 'yes-only',
              text: '이미 다른 이미지 내보내기가 진행중입니다',
            });
            return;
          }
          try {
            await zipService.zipFiles(paths, outFilePath);
          } catch (e: any) {
            appState.pushMessage(e.message);
            appState.setProgressDialog(undefined);
            return;
          }
          appState.setProgressDialog(undefined);
          appState.pushDialog({
            type: 'yes-only',
            text: '이미지 내보내기가 완료되었습니다',
          });
          await backend.showFile(outFilePath);
          appState.setProgressDialog(undefined);
        };
        const menu = await appState.pushDialogAsync({
          type: 'select',
          text: '내보낼 이미지를 선택해주세요',
          items: [
            { text: '즐겨찾기 이미지만 내보내기', value: 'fav' },
            { text: '모든 이미지 전부 내보내기', value: 'all' },
          ],
        });
        if (!menu) return;
        const format = await appState.pushDialogAsync({
          type: 'select',
          text: '파일 이름 형식을 선택해주세요',
          items: [
            { text: '(씬이름).(이미지 번호).png', value: 'normal' },
            { text: '(캐릭터 이름).(씬이름).(이미지 번호)', value: 'prefix' },
          ],
        });
        if (!format) return;

        const optItems = [
          { text: '원본', value: 'original' },
          { text: '저손실 webp 최적화 (에셋용 권장)', value: 'lossy' },
        ];
        if (!isMobile) {
          optItems.push({ text: '무손실 webp 최적화', value: 'lossless' });
        }
        const opt = await appState.pushDialogAsync({
          type: 'select',
          text: '이미지 크기 최적화 방법을 선택해주세요',
          items: optItems,
        });
        if (!opt) return;
        let imageSize = 0;
        if (opt !== 'original') {
          const inputImageSize = await appState.pushDialogAsync({
            type: 'input-confirm',
            text: '이미지 픽셀 크기를 결정해주세요 (추천값 1024)',
          });
          if (!inputImageSize) return;
          try {
            imageSize = parseInt(inputImageSize);
          } catch (error) {
            return;
          }
        }
        if (format === 'normal') {
          await exportImpl('', menu === 'fav', opt, imageSize);
        } else {
          appState.pushDialog({
            type: 'input-confirm',
            text: '캐릭터 이름을 입력해주세요',
            callback: async (prefix) => {
              if (!prefix) return;
              await exportImpl(prefix + '.', menu === 'fav', opt, imageSize);
            },
          });
        }
      };

    const queueRemoveBg = async (
      session: Session,
      scene: Scene,
      image: string,
      onComplete?: (path: string) => void,
    ) => {
      const params: RemoveBgTaskParams = {
        session,
        scene: scene.name,
        image,
        ouputPath: imageService.getImageDir(session, scene),
        onComplete,
      };
      taskQueueService.addTask('remove-bg', 1, params);
    };

      const removeBg = async (selected: Scene[]) => {
        if (!localAIService.ready) {
          appState.pushMessage('환경설정에서 배경 제거 기능을 활성화해주세요');
          return;
        }
        for (const scene of selected) {
          if (scene.mains.length === 0) {
            const images = gameService.getOutputs(this.curSession!, scene);
            if (!images.length) continue;
            let image = await imageService.fetchImage(
              imageService.getImageDir(this.curSession!, scene) + '/' + images[0],
            );
            image = dataUriToBase64(image!);
            queueRemoveBg(this.curSession!, scene, image);
          } else {
            const mains = scene.mains;
            for (const main of mains) {
              const path =
                imageService.getImageDir(this.curSession!, scene) + '/' + main;
              let image = await imageService.fetchImage(path);
              image = dataUriToBase64(image!);
              queueRemoveBg(this.curSession!, scene, image, (newPath: string) => {
                for (let j = 0; scene.mains.length; j++) {
                  if (scene.mains[j] === main) {
                    scene.mains[j] = newPath.split('/').pop()!;
                    break;
                  }
                }
              });
            }
          }
        }
      };
      const handleBatchProcess = async (value: string, selected: Scene[]) => {
        const isMain = (scene: Scene, path: string) => {
          const filename = path.split('/').pop()!;
          return !!(scene && scene.mains.includes(filename));
        };
        if (value === 'removeImage') {
          appState.pushDialog({
            type: 'select',
            text: '이미지를 삭제합니다. 원하시는 작업을 선택해주세요.',
            items: [
              {
                text: '모든 이미지 삭제',
                value: 'all',
              },
              {
                text: '즐겨찾기 제외 모든 이미지 삭제',
                value: 'fav',
              },
              {
                text: '즐겨찾기 제외 n등 이하 이미지 삭제',
                value: 'n',
              },
            ],
            callback: async (menu) => {
              if (menu === 'all') {
                appState.pushDialog({
                  type: 'confirm',
                  text: '정말로 모든 이미지를 삭제하시겠습니까?',
                  callback: async () => {
                    for (const scene of selected) {
                      const paths = gameService
                        .getOutputs(this.curSession!, scene)
                        .map(
                          (x) =>
                            imageService.getImageDir(this.curSession!, scene!) +
                            '/' +
                            x,
                        );
                      await deleteImageFiles(this.curSession!, paths);
                    }
                  },
                });
              } else if (menu === 'n') {
                appState.pushDialog({
                  type: 'input-confirm',
                  text: '몇등 이하 이미지를 삭제할지 입력해주세요.',
                  callback: async (value) => {
                    if (value) {
                      for (const scene of selected) {
                        const paths = gameService
                          .getOutputs(this.curSession!, scene)
                          .map(
                            (x) =>
                              imageService.getImageDir(this.curSession!, scene!) +
                              '/' +
                              x,
                          );
                        const n = parseInt(value);
                        await deleteImageFiles(
                          this.curSession!,
                          paths.slice(n).filter((x) => !isMain(scene, x)),
                        );
                      }
                    }
                  },
                });
              } else if (menu === 'fav') {
                appState.pushDialog({
                  type: 'confirm',
                  text: '정말로 즐겨찾기 외 모든 이미지를 삭제하시겠습니까?',
                  callback: async () => {
                    for (const scene of selected) {
                      const paths = gameService
                        .getOutputs(this.curSession!, scene)
                        .map(
                          (x) =>
                            imageService.getImageDir(this.curSession!, scene!) +
                            '/' +
                            x,
                        );
                      await deleteImageFiles(
                        this.curSession!,
                        paths.filter((x) => !isMain(scene, x)),
                      );
                    }
                  },
                });
              }
            },
          });
        } else if (value === 'changeResolution') {
          const options = Object.entries(resolutionMap)
            .filter((x) => !x[0].includes('small'))
            .map(([key, value]) => {
              return {
                text: `${value.width}x${value.height}`,
                value: key,
              };
            });
          appState.pushDialog({
            type: 'dropdown',
            text: '변경할 해상도를 선택해주세요',
            items: options,
            callback: async (value?: string) => {
              if (!value) return;
              const action = () => {
                for (const scene of selected) {
                  scene.resolution = value as Resolution;
                }
              };
              if (value.includes('large') || value.includes('wallpaper')) {
                appState.pushDialog({
                  text: 'Anlas를 소모하는 해상도 입니다. 계속하겠습니까?',
                  type: 'confirm',
                  callback: () => {
                    action();
                  },
                });
              } else {
                action();
              }
            },
          });
        } else if (value === 'removeAllFav') {
          appState.pushDialog({
            type: 'confirm',
            text: '정말로 모든 즐겨찾기를 해제하겠습니까?',
            callback: () => {
              for (const scene of selected) {
                scene.mains = [];
              }
            },
          });
        } else if (value === 'setFav') {
          appState.pushDialog({
            type: 'input-confirm',
            text: '몇등까지 즐겨찾기로 지정할지 입력해주세요',
            callback: async (value) => {
              if (value) {
                const n = parseInt(value);
                for (const scene of selected) {
                  const cands = gameService
                    .getOutputs(this.curSession!, scene)
                    .slice(0, n);
                  scene.mains = scene.mains
                    .concat(cands)
                    .filter((x, i, self) => self.indexOf(x) === i);
                }
              }
            },
          });
        } else if (value === 'removeBg') {
          removeBg(selected);
        } else if (value === 'export') {
          exportPackage(selected);
        } else {
          console.log('Not implemented');
        }
      };

      const openMenu = () => {
        let items = [
          { text: '📁 이미지 내보내기', value: 'export' },
          { text: '🔪 즐겨찾기 이미지 배경 제거', value: 'removeBg' },
          { text: '🗑️ 이미지 삭제', value: 'removeImage' },
          { text: '🖥️ 해상도 변경 ', value: 'changeResolution' },
          { text: '❌ 즐겨찾기 전부 해제', value: 'removeAllFav' },
          { text: '⭐ 상위 n등 즐겨찾기 지정', value: 'setFav' },
        ];
        if (isMobile) {
          items = items.filter((x) => x.value !== 'removeBg');
        }
        appState.pushDialog({
          type: 'select',
          text: '선택할 씬들에 적용할 대량 작업을 선택해주세요',
          graySelect: true,
          items: items,
          callback: (value, text) => {
            setSceneSelector({
              text: text!,
              callback: (selected) => {
                setSceneSelector(undefined);
                handleBatchProcess(value!, selected);
              },
            });
          },
        });
      };
      openMenu();
    }
}

export const appState = new AppState();
