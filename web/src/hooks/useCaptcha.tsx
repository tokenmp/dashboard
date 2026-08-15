import { useState, useEffect, useCallback, useRef } from 'react';
import { toast } from 'sonner';
import { AliyunCaptcha } from '@/components/AliyunCaptcha';
import { getCaptchaConfigApi, type CaptchaConfig } from '@/api/auth';

export type CaptchaSceneType = 'login' | 'register';

/** SDK 加载失败时的自动重试次数（超过则降级直连提交，走后端严限流） */
const MAX_RETRIES = 1;

/**
 * 阿里云滑块验证码 hook（自旧栈 web 移植，适配本项目 api 封装）。
 *
 * 用法：
 *   const { triggerCaptcha, captchaMount } = useCaptcha('register');
 *   const onSubmit = () => triggerCaptcha((captchaParam) => doSubmit(captchaParam));
 *   // 渲染处放 {captchaMount}；scene 未配置时 triggerCaptcha 直连执行 action。
 *
 * 行为：
 *   - 后端 scene_id 为空 → 该场景未启用人机验证，action 不带 param 直接执行；
 *   - 验证通过 → action 收到 captchaVerifyParam，随请求提交给后端核验；
 *   - SDK 加载失败 → 重试一次后降级直连（后端按 IP 严限流兜底）。
 */
export function useCaptcha(sceneType: CaptchaSceneType) {
  const elementId = `captcha-element-${sceneType}`;
  const buttonId = `captcha-trigger-${sceneType}`;
  const [captchaConfig, setCaptchaConfig] = useState<CaptchaConfig | null>(null);
  const [captchaKey, setCaptchaKey] = useState(0);
  const [captchaError, setCaptchaError] = useState<string | null>(null);
  const [captchaActive, setCaptchaActive] = useState(false);
  const pendingActionRef = useRef<((param?: string) => void) | null>(null);
  const retryCountRef = useRef(0);

  useEffect(() => {
    getCaptchaConfigApi().then(setCaptchaConfig).catch(() => {});
  }, []);

  const sceneId =
    sceneType === 'login' ? captchaConfig?.login_scene_id : captchaConfig?.register_scene_id;

  const isCaptchaEnabled = !!sceneId;

  const triggerCaptcha = useCallback(
    (action: (captchaParam?: string) => void) => {
      setCaptchaError(null);
      if (!sceneId) {
        action();
        return;
      }
      pendingActionRef.current = action;
      retryCountRef.current = 0;
      setCaptchaKey((k) => k + 1);
      setCaptchaActive(true);
    },
    [sceneId],
  );

  const handleSuccess = useCallback((captchaVerifyParam: string) => {
    const action = pendingActionRef.current;
    pendingActionRef.current = null;
    setCaptchaActive(false);
    setCaptchaKey(0);
    action?.(captchaVerifyParam);
  }, []);

  const handleFail = useCallback(() => {
    setCaptchaError('验证码验证失败，请重试');
    setCaptchaActive(false);
    setCaptchaKey(0);
  }, []);

  const handleError = useCallback(() => {
    if (retryCountRef.current < MAX_RETRIES) {
      retryCountRef.current += 1;
      setCaptchaKey((k) => k + 1);
      return;
    }
    const action = pendingActionRef.current;
    pendingActionRef.current = null;
    setCaptchaActive(false);
    setCaptchaKey(0);
    setCaptchaError(null);
    toast.warning('验证码暂时不可用，已跳过验证');
    action?.();
  }, []);

  const handleClose = useCallback(() => {
    pendingActionRef.current = null;
    setCaptchaActive(false);
    setCaptchaKey(0);
  }, []);

  const captchaMount =
    captchaActive && captchaConfig && sceneId ? (
      <AliyunCaptcha
        key={captchaKey}
        sceneId={sceneId}
        prefix={captchaConfig.prefix}
        region={captchaConfig.region}
        mode="popup"
        elementId={elementId}
        buttonId={buttonId}
        onSuccess={handleSuccess}
        onFail={handleFail}
        onError={handleError}
        onClose={handleClose}
      />
    ) : null;

  return {
    triggerCaptcha,
    captchaMount,
    isCaptchaEnabled,
    isCaptchaActive: captchaActive,
    captchaError,
  };
}
