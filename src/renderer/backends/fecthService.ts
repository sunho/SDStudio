import { registerPlugin } from '@capacitor/core';

export interface FetchServicePlugin {
  fetchData(options: { url: string, body: string, headers: string }): Promise<{ data: string }>;
}

const FetchService = registerPlugin<FetchServicePlugin>('FetchService');

export default FetchService;
