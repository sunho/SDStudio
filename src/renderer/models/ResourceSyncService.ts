import { backend } from '.';
import { sleep } from './util';
import { reaction } from 'mobx';

export interface Serealizable {
  fromJSON(json: any): any;
  toJSON(): any;
}

export abstract class ResourceSyncService<T extends Serealizable> extends EventTarget {
  resources: { [name: string]: T };
  dirty: { [name: string]: boolean };
  resourceList: string[];
  disposes: { [name: string]: () => void };
  resourceDir: string;
  updateInterval: number;
  running: boolean;
  dummy: T | undefined;
  constructor(resourceDir: string, interval: number) {
    super();
    this.resources = {};
    this.dirty = {};
    this.disposes = {};
    this.resourceDir = resourceDir;
    this.resourceList = [];
    this.updateInterval = interval;
    this.running = true;
    (async ()=> {
      this.dummy = await this.createDefault('dummy');
    })();
  }

  abstract createDefault(name: string): T | Promise<T>;
  abstract getHook(rc: T, name: string): Promise<void>;

  async add(name: string) {
    if (name in this.resources) {
      throw new Error('Resource already exists');
    }
    this.resources[name] = await this.createDefault(name);
    await this.getHook(this.resources[name], name);
    this.#markUpdated(name);
    await this.update();
  }

  list() {
    return this.resourceList;
  }

  getPath(name: string) {
    return this.resourceDir + '/' + name + '.json';
  }

  async delete(name: string) {
    if (name in this.resources) {
      delete this.resources[name];
      this.disposes[name]();
      await backend.renameFile(
        this.resourceDir + '/' + name + '.json',
        this.resourceDir + '/' + name + '.deleted',
      );
      await this.update();
    }
  }

  getFast(name: string) {
    const rc = this.resources[name];
    if (!rc) {
      this.get(name);
    }
    return rc;
  }

  async get(name: string): Promise<T | undefined> {
    if (!(name in this.resources)) {
      try {
        const str = await backend.readFile(
          this.resourceDir + '/' + name + '.json',
        );
        this.resources[name] = this.dummy!.fromJSON(JSON.parse(str));
        const resource = this.resources[name];
        await this.getHook(this.resources[name], name);
        const dispose = reaction(() => resource.toJSON(), _ => {
          this.#markUpdated(name);
        }, {
          delay: this.updateInterval,
        });
        this.disposes[name] = dispose;
        this.dispatchEvent(
          new CustomEvent<{ name: string }>('fetched', { detail: { name } }),
        );
      } catch (e: any) {
        console.error('get library error:', e);
        return undefined;
      }
    }
    return this.resources[name];
  }

  async update() {
    for (const name of Object.keys(this.dirty)) {
      if (!(name in this.resources))
        continue;
      const l = this.getFast(name);
      if (l) {
        await backend.writeFile(
          this.resourceDir + '/' + name + '.json',
          JSON.stringify(l.toJSON()),
        );
      }
    }
    this.dirty = {};
    this.resourceList = await this.getList();
    this.dispatchEvent(new CustomEvent('listupdated', {}));
  }

  async saveAll() {
    for (const name of Object.keys(this.resources)) {
      const l = this.resources[name];
      await backend.writeFile(
        this.resourceDir + '/' + name + '.json',
        JSON.stringify(l.toJSON()),
      );
    }
  }

  async createFrom(name: string, value: T) {
    if (name in this.resources) {
      throw new Error('Resource already exists');
    }
    this.resources[name] = value.fromJSON(value);
    await this.getHook(this.resources[name], name);
    this.#markUpdated(name);
    await this.update();
  }

  async run() {
    while (this.running) {
      await this.update();
      await sleep(this.updateInterval);
    }
  }

  #markUpdated(name: string) {
    this.dirty[name] = true;
    this.dispatchEvent(
      new CustomEvent<{ name: string }>('updated', { detail: { name } }),
    );
  }

  private async getList() {
    const sessions = await backend.listFiles(this.resourceDir);
    return sessions
      .filter((x: string) => x.endsWith('.json'))
      .map((x: string) => x.substring(0, x.length - 5));
  }
}
