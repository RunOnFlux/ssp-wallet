import { message as staticMessage } from 'antd';
import type {
  MessageInstance,
  ArgsProps,
  MessageType,
} from 'antd/es/message/interface';
import type { ReactNode } from 'react';

/**
 * Centralized toast (message) service.
 *
 * A single antd message instance is provided by <ToastBridge /> (rendered
 * inside the antd <App> wrapper in App.tsx, so it picks up the active theme).
 * All components use this `toast` object instead of per-component
 * message.useMessage() + contextHolder plumbing.
 *
 * Falls back to antd's static message API until the bridge mounts.
 */

let api: MessageInstance = staticMessage;

export function setToastInstance(instance: MessageInstance): void {
  api = instance;
}

type JointContent = ReactNode | ArgsProps;

export const toast = {
  open: (args: ArgsProps): MessageType => api.open(args),
  success: (content: JointContent, duration?: number): MessageType =>
    api.success(content, duration),
  error: (content: JointContent, duration?: number): MessageType =>
    api.error(content, duration),
  info: (content: JointContent, duration?: number): MessageType =>
    api.info(content, duration),
  warning: (content: JointContent, duration?: number): MessageType =>
    api.warning(content, duration),
  loading: (content: JointContent, duration?: number): MessageType =>
    api.loading(content, duration),
  destroy: (key?: string | number): void => {
    api.destroy(key);
  },
};
