import { DEVICE_TYPES, type DeviceType } from './types.ts';

/**
 * Eén grove klasse uit de user-agent. De user-agent zelf wordt niet bewaard.
 * Geen versies, geen schermmaten en geen uniek apparaatprofiel.
 */
export function classificeerApparaat(userAgent: string | null | undefined): DeviceType {
  const ua = (userAgent ?? '').trim();
  if (!ua) return 'unknown';
  if (/ipad|tablet|kindle|silk|playbook/i.test(ua)) return 'tablet';
  if (/android/i.test(ua) && !/mobile/i.test(ua)) return 'tablet';
  if (/mobi|iphone|ipod|phone|webos|blackberry|iemobile|opera mini/i.test(ua)) return 'mobile';
  if (/android/i.test(ua)) return 'mobile';
  return 'desktop';
}

export function isDeviceType(waarde: string): waarde is DeviceType {
  return (DEVICE_TYPES as readonly string[]).includes(waarde);
}
