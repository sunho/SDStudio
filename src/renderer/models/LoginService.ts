import { backend } from '.';

export class LoginService extends EventTarget {
  loggedIn: boolean;
  constructor() {
    super();
    this.loggedIn = false;
    this.refresh();
  }

  async login(email: string, password: string) {
    await backend.login(email, password);
    await this.refresh();
  }

  async refresh() {
    try {
      await backend.readFile('TOKEN.txt');
      this.loggedIn = true;
    } catch (e: any) {
      this.loggedIn = false;
    }
    this.dispatchEvent(new CustomEvent('change', {}));
  }
}
