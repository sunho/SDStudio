import { backend } from '.';
import { sleep } from './util';

const UPDATE_SERVICE_INTERVAL = 240 * 1000;

export class AppUpdateNoticeService extends EventTarget {
  current: string;
  outdated: boolean;
  constructor() {
    super();
    this.current = '';
    this.outdated = false;
    this.run();
  }
  async getLatestRelease(repoOwner: string, repoName: string) {
    const url = `https://api.github.com/repos/${repoOwner}/${repoName}/releases/latest`;

    try {
      const response = await fetch(url, {
        headers: {
          Accept: 'application/vnd.github.v3+json',
        },
      });

      if (!response.ok) {
        throw new Error(`Error fetching release: ${response.statusText}`);
      }

      const data = await response.json();
      return data.tag_name;
    } catch (error) {
      console.error('Failed to fetch latest release:', error);
    }
  }

  async run() {
    while (true) {
      try {
        if (this.current === '') this.current = await backend.getVersion();
        let latest = await this.getLatestRelease('sunho', 'SDStudio');
        if (this.isOutdated(this.current, latest)) {
          this.outdated = true;
          this.dispatchEvent(new CustomEvent('updated', { detail: {} }));
        }
      } catch (e: any) {
        console.error(e);
      }
      await sleep(UPDATE_SERVICE_INTERVAL);
    }
  }

  isOutdated(current: string, latest: string): boolean {
    const currentParts = current.split('.').map(Number);
    const latestParts = latest.split('.').map(Number);

    for (
      let i = 0;
      i < Math.max(currentParts.length, latestParts.length);
      i++
    ) {
      const currentPart = currentParts[i] || 0;
      const latestPart = latestParts[i] || 0;

      if (currentPart < latestPart) {
        return true;
      } else if (currentPart > latestPart) {
        return false;
      }
    }

    return false; // they are equal
  }
}
