import { invoke } from '@tauri-apps/api/core';

export interface RecognizeResponse {
  text: string;
  model: string;
  verified?: boolean;
  corrected?: boolean;
  original_text?: string;
}

export async function recognizeImage(base64Image: string, mode: string = 'formula', modelId?: string): Promise<{
  text: string;
  model: string;
  verified?: boolean;
  corrected?: boolean;
  originalText?: string;
}> {
  const res = await invoke<RecognizeResponse>('recognize', {
    image: base64Image,
    mode,
    model_id: modelId || '',
  });
  return {
    text: res.text,
    model: res.model,
    verified: res.verified,
    corrected: res.corrected,
    originalText: res.original_text,
  };
}

export interface SettingsData {
  has_key: boolean;
  has_simpletex: boolean;
  simpletex_model: string;
  simpletex_models: { id: string; name: string; free_per_day: number }[];
  simpletex_usage_by_model: Record<string, number>;
  sf_balance?: string;
  sf_charge_balance?: string;
  voucher_models: string[];
}

export async function getSettings(): Promise<SettingsData> {
  return invoke<SettingsData>('get_settings');
}

export async function saveSettings(opts: {
  simpletex_token?: string;
  siliconflow_key?: string;
  simpletex_model?: string;
  voucher_models_text?: string;
}): Promise<{ ok: boolean }> {
  return invoke('save_settings', opts);
}

export async function testSimpleTex(token?: string): Promise<{ ok: boolean; error?: string }> {
  return invoke('test_simpletex', { token: token || null });
}

export async function testSiliconFlow(apiKey?: string): Promise<{ ok: boolean; error?: string; balance?: string }> {
  return invoke('test_siliconflow', { api_key: apiKey || null });
}

export interface AvailableModelsData {
  models: any[];
  sf_balance?: string;
  sf_charge_balance?: string;
  voucher_balance?: string;
}

export async function getAvailableModels(): Promise<AvailableModelsData> {
  return invoke<AvailableModelsData>('get_available_models');
}

export async function getSfBalance(): Promise<{ charge_balance?: string; total_balance?: string; voucher_balance?: string }> {
  return invoke('get_sf_balance');
}

export async function openExternalUrl(url: string): Promise<void> {
  return invoke('open_external_url', { url });
}
