import { ImageService } from './models/ImageService';
import { LoginService } from './models/LoginService';
import { PromptService } from './models/PromptService';
import { SessionService } from './models/SessionService';
import { TaskQueueService } from './models/TaskQueueService';
import { Session } from './models/types';

declare module '*.png';

declare module '*.scss';

declare global {
  interface Window {
    curSession?: Session;
    promptService: PromptService;
    sessionService: SessionService;
    imageService: ImageService;
    taskQueueService: TaskQueueService;
    loginService: LoginService;
  }
}
