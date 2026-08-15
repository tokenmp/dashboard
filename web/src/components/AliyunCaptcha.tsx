import { useEffect, useRef } from 'react';

interface AliyunCaptchaProps {
  sceneId: string;
  prefix: string;
  region: string;
  mode?: 'popup' | 'embed';
  slideStyle?: { width: number; height: number };
  elementId: string;
  buttonId: string;
  onSuccess: (captchaVerifyParam: string) => void;
  onFail?: () => void;
  onError?: (errorInfo: { code: string; msg: string }) => void;
  onClose?: () => void;
}

interface CaptchaInstance {
  show: () => void;
  hide: () => void;
}

declare global {
  interface Window {
    AliyunCaptchaConfig?: { region: string; prefix: string };
    initAliyunCaptcha: (options: {
      SceneId: string;
      mode: string;
      element: string;
      button: string;
      success: (captchaVerifyParam: string) => void;
      fail: (failInfo: unknown) => void;
      getInstance: (instance: unknown) => void;
      slideStyle?: { width: number; height: number };
      language?: string;
      onError?: (errorInfo: { code: string; msg: string }) => void;
      onClose?: () => void;
    }) => void;
  }
}

/** 阿里云验证码 SDK 脚本地址（模块级单例避免重复注入） */
const SCRIPT_SRC = 'https://o.alicdn.com/captcha-frontend/aliyunCaptcha/AliyunCaptcha.js';

/** 脚本加载 Promise 单例；失败置 null 允许重试 */
let scriptLoadPromise: Promise<void> | null = null;

function loadScript(): Promise<void> {
  if (scriptLoadPromise) return scriptLoadPromise;
  scriptLoadPromise = new Promise((resolve, reject) => {
    const existing = document.querySelector(`script[src="${SCRIPT_SRC}"]`);
    if (existing) {
      resolve();
      return;
    }
    const script = document.createElement('script');
    script.src = SCRIPT_SRC;
    script.onload = () => resolve();
    script.onerror = () => {
      scriptLoadPromise = null;
      reject(new Error('Failed to load Aliyun CAPTCHA SDK'));
    };
    document.head.appendChild(script);
  });
  return scriptLoadPromise;
}

/**
 * 阿里云滑块验证码组件（自旧栈 web 移植）：
 * 加载 SDK → 初始化实例 → popup 模式 show() → 回调验证结果。
 * ref 持有最新回调，避免 effect 依赖变化导致 SDK 重复初始化。
 */
export function AliyunCaptcha({
  sceneId,
  prefix,
  region,
  mode = 'popup',
  slideStyle = { width: 360, height: 40 },
  elementId,
  buttonId,
  onSuccess,
  onFail,
  onError,
  onClose,
}: AliyunCaptchaProps) {
  const mountedRef = useRef(true);
  const onSuccessRef = useRef(onSuccess);
  const onFailRef = useRef(onFail);
  const onErrorRef = useRef(onError);
  const onCloseRef = useRef(onClose);

  onSuccessRef.current = onSuccess;
  onFailRef.current = onFail;
  onErrorRef.current = onError;
  onCloseRef.current = onClose;

  useEffect(() => {
    mountedRef.current = true;
    let cancelled = false; // 防 StrictMode 双挂载重复初始化

    window.AliyunCaptchaConfig = { region, prefix };

    loadScript()
      .then(() => {
        if (!mountedRef.current || cancelled) return;
        if (!window.initAliyunCaptcha) {
          onErrorRef.current?.({ code: 'SDK_NOT_FOUND', msg: 'initAliyunCaptcha not available' });
          return;
        }

        window.initAliyunCaptcha({
          SceneId: sceneId,
          mode,
          element: `#${elementId}`,
          button: `#${buttonId}`,
          success: (captchaVerifyParam: string) => {
            if (mountedRef.current) onSuccessRef.current(captchaVerifyParam);
          },
          fail: () => {
            if (mountedRef.current) onFailRef.current?.();
          },
          getInstance: (instance: unknown) => {
            if (!mountedRef.current || cancelled) return;
            (instance as CaptchaInstance).show();
          },
          slideStyle,
          language: 'cn',
          onError: (errorInfo: { code: string; msg: string }) => {
            if (mountedRef.current) onErrorRef.current?.(errorInfo);
          },
          onClose: () => {
            if (mountedRef.current) onCloseRef.current?.();
          },
        });
      })
      .catch(() => {
        if (mountedRef.current) {
          onErrorRef.current?.({ code: 'SDK_LOAD_FAILED', msg: 'Failed to load Aliyun CAPTCHA SDK' });
        }
      });

    return () => {
      mountedRef.current = false;
      cancelled = true;
    };
  }, [sceneId, prefix, region, mode, elementId, buttonId, slideStyle]);

  // SDK 需要真实 DOM 挂载点，隐藏占位
  return (
    <>
      <div id={elementId} className="hidden" />
      <button id={buttonId} type="button" className="hidden" />
    </>
  );
}
