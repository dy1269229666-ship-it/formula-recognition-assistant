import React, { useState, useEffect } from 'react';
import { getSettings, saveSettings, testSimpleTex, testSiliconFlow, getSfBalance, openExternalUrl } from '../services/tauriService';

interface SimpleTexModel {
  id: string;
  name: string;
  freePerDay: number;
}

interface SettingsModalProps {
  open: boolean;
  onClose: () => void;
}

export const SettingsModal: React.FC<SettingsModalProps> = ({ open, onClose }) => {
  const [apiKey, setApiKey] = useState('');
  const [hasKey, setHasKey] = useState(false);
  const [simpletexToken, setSimpletexToken] = useState('');
  const [hasSimpleTex, setHasSimpleTex] = useState(false);
  const [simpletexModel, setSimpletexModel] = useState('latex_ocr');
  const [simpletexModels, setSimpletexModels] = useState<SimpleTexModel[]>([]);
  const [simpletexUsageByModel, setSimpletexUsageByModel] = useState<Record<string, number>>({});
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState('');
  const [sfBalance, setSfBalance] = useState<string | null>(null);
  const [sfChargeBalance, setSfChargeBalance] = useState<string | null>(null);
  const [sfBalanceLoading, setSfBalanceLoading] = useState(false);
  const [stTest, setStTest] = useState<{ loading: boolean; result: null | { ok: boolean; error?: string } }>({ loading: false, result: null });
  const [sfTest, setSfTest] = useState<{ loading: boolean; result: null | { ok: boolean; error?: string; balance?: string } }>({ loading: false, result: null });
  const [voucherText, setVoucherText] = useState('');
  const [showVoucher, setShowVoucher] = useState(false);

  useEffect(() => {
    if (!open) return;
    getSettings().then(data => {
      setApiKey('');
      setHasKey(data.has_key);
      setSimpletexToken('');
      setHasSimpleTex(data.has_simpletex);
      setSimpletexModel(data.simpletex_model || 'latex_ocr');
      setSimpletexModels((data.simpletex_models || []).map(m => ({ id: m.id, name: m.name, freePerDay: m.free_per_day })));
      setSimpletexUsageByModel(data.simpletex_usage_by_model || {});
      if (data.sf_balance) setSfBalance(data.sf_balance);
      if (data.sf_charge_balance) setSfChargeBalance(data.sf_charge_balance);
      if (data.voucher_models && data.voucher_models.length > 0) {
        setVoucherText(data.voucher_models.join('\n'));
        setShowVoucher(true);
      }
    });
  }, [open]);

  const refreshSfBalance = async () => {
    setSfBalanceLoading(true);
    try {
      const data = await getSfBalance();
      if (data.total_balance) setSfBalance(data.total_balance);
      if (data.charge_balance) setSfChargeBalance(data.charge_balance);
    } catch {}
    setSfBalanceLoading(false);
  };

  const handleSave = async () => {
    setSaving(true);
    setMessage('');
    try {
      const opts: any = { simpletex_model: simpletexModel };
      if (apiKey) opts.siliconflow_key = apiKey;
      if (simpletexToken) opts.simpletex_token = simpletexToken;
      opts.voucher_models_text = voucherText;
      const result: any = await saveSettings(opts);
      if (result.ok) {
        setMessage('保存成功');
        if (apiKey) setHasKey(true);
        if (simpletexToken) setHasSimpleTex(true);
        setTimeout(() => { setMessage(''); onClose(); }, 800);
      } else {
        const errs: string[] = result.errors || ['保存失败'];
        setMessage(errs.join('；'));
        // Update state: if token/key was invalid, it's been cleared
        if (errs.some((e: string) => e.includes('SimpleTex'))) setHasSimpleTex(false);
        if (errs.some((e: string) => e.includes('硅基流动'))) setHasKey(false);
      }
    } catch {
      setMessage('保存失败');
    } finally {
      setSaving(false);
    }
  };

  const currentSTModel = simpletexModels.find(m => m.id === simpletexModel);
  const displayLimit = currentSTModel?.freePerDay || 500;
  const currentUsage = simpletexUsageByModel[simpletexModel] || 0;

  const handleTestSimpleTex = async () => {
    setStTest({ loading: true, result: null });
    try {
      const data = await testSimpleTex(simpletexToken || undefined);
      setStTest({ loading: false, result: data });
    } catch {
      setStTest({ loading: false, result: { ok: false, error: '网络错误' } });
    }
  };

  const handleTestSiliconFlow = async () => {
    setSfTest({ loading: true, result: null });
    try {
      const data = await testSiliconFlow(apiKey || undefined);
      setSfTest({ loading: false, result: data });
      if (data.ok && data.balance) setSfBalance(data.balance);
    } catch {
      setSfTest({ loading: false, result: { ok: false, error: '网络错误' } });
    }
  };

  if (!open) return null;

  return (
    <div className="fixed inset-0 bg-black/40 backdrop-blur-sm z-50 flex items-center justify-center p-4" onClick={onClose}>
      <div className="bg-white dark:bg-slate-900 rounded-2xl shadow-2xl w-full max-w-md p-6 space-y-4 max-h-[90vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-bold text-slate-800 dark:text-white flex items-center gap-2">
            <span className="material-icons text-primary">settings</span>
            AI 设置
          </h2>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-600 p-1 rounded-lg hover:bg-slate-100">
            <span className="material-icons text-[20px]">close</span>
          </button>
        </div>

        {/* SimpleTex Section */}
        <div className="border border-indigo-100 dark:border-indigo-900/50 rounded-xl p-4 space-y-3 bg-indigo-50/30 dark:bg-indigo-950/20">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <span className="text-base font-bold text-indigo-700 dark:text-indigo-300">SimpleTex</span>
            </div>
          </div>

          <div className="space-y-1.5">
            <label className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Token (UAT)</label>
            <input
              type="password"
              value={simpletexToken}
              onChange={e => setSimpletexToken(e.target.value)}
              placeholder={hasSimpleTex ? '已配置 (留空保持不变)' : '输入 SimpleTex Token'}
              className="w-full px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-base focus:outline-none focus:ring-2 focus:ring-indigo-500/50"
            />
            <p className="text-xs text-slate-400">
              从 <span onClick={() => openExternalUrl('https://simpletex.net/user/center')} className="text-primary hover:underline cursor-pointer">simpletex.net</span> 用户中心获取
              （<span onClick={() => openExternalUrl('https://simpletex.net/user/register?code=AV24vCJq')} className="text-amber-500 hover:underline cursor-pointer">注册链接</span>）
            </p>
            <button
              type="button"
              onClick={handleTestSimpleTex}
              disabled={stTest.loading || (!simpletexToken && !hasSimpleTex)}
              className="text-sm px-2.5 py-1 rounded-md border border-indigo-200 dark:border-indigo-800 text-indigo-600 dark:text-indigo-400 hover:bg-indigo-50 dark:hover:bg-indigo-950 transition-colors disabled:opacity-40"
            >
              {stTest.loading ? '测试中...' : '测试连接'}
            </button>
            {stTest.result && (
              <span className={`text-sm ${stTest.result.ok ? (stTest.result.error ? 'text-amber-500' : 'text-green-600') : 'text-red-500'}`}>
                {stTest.result.ok
                  ? (stTest.result.error ? `⚠ ${stTest.result.error}` : '✓ 连接成功')
                  : `✗ ${stTest.result.error}`}
              </span>
            )}
          </div>

          <div className="space-y-1.5">
            <label className="text-xs font-semibold text-slate-500 uppercase tracking-wider">识别模型</label>
            <select
              value={simpletexModel}
              onChange={e => setSimpletexModel(e.target.value)}
              className="w-full px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-base focus:outline-none focus:ring-2 focus:ring-indigo-500/50"
            >
              {simpletexModels.map(m => (
                <option key={m.id} value={m.id}>
                  {m.name} (每日免费 {m.freePerDay} 次)
                </option>
              ))}
            </select>
          </div>

          <div className="flex items-center justify-between text-sm">
            <span className="text-slate-500">今日已用 (本地统计)</span>
            <span className={`font-mono font-medium ${currentUsage >= displayLimit ? 'text-red-500' : 'text-indigo-600 dark:text-indigo-400'}`}>
              {currentUsage} / {displayLimit}
            </span>
          </div>
          <div className="w-full bg-slate-200 dark:bg-slate-700 rounded-full h-1.5">
            <div
              className={`h-1.5 rounded-full transition-all ${currentUsage >= displayLimit ? 'bg-red-500' : 'bg-indigo-500'}`}
              style={{ width: `${Math.min(100, (currentUsage / displayLimit) * 100)}%` }}
            />
          </div>
          <p className="text-xs text-slate-400">
            实际用量请查看 <span onClick={() => openExternalUrl('https://simpletex.net/user/center')} className="text-primary hover:underline cursor-pointer">simpletex.net 用户中心</span>
          </p>

          {/* Per-model usage summary */}
          <div className="space-y-1 pt-1 border-t border-indigo-100 dark:border-indigo-900/30">
            <span className="text-xs font-semibold text-slate-500">各模型今日用量</span>
            {simpletexModels.map(m => {
              const u = simpletexUsageByModel[m.id] || 0;
              return (
                <div key={m.id} className="flex items-center justify-between text-xs">
                  <span className="text-slate-400">{m.name}</span>
                  <span className={`font-mono ${u >= m.freePerDay ? 'text-red-500' : 'text-slate-500'}`}>{u}/{m.freePerDay}</span>
                </div>
              );
            })}
          </div>
        </div>

        {/* SiliconFlow Section */}
        <div className="border border-slate-200 dark:border-slate-800 rounded-xl p-4 space-y-3">
          <div className="flex items-center gap-2">
            <span className="text-base font-bold text-slate-700 dark:text-slate-300">硅基流动</span>
          </div>

          <div className="space-y-1.5">
            <label className="text-xs font-semibold text-slate-500 uppercase tracking-wider">API Key</label>
            <input
              type="password"
              value={apiKey}
              onChange={e => setApiKey(e.target.value)}
              placeholder={hasKey ? '已配置 (留空保持不变)' : '输入 SiliconFlow API Key'}
              className="w-full px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-base focus:outline-none focus:ring-2 focus:ring-primary/50"
            />
            <p className="text-xs text-slate-400">
              从 <span onClick={() => openExternalUrl('https://cloud.siliconflow.cn/account/ak')} className="text-primary hover:underline cursor-pointer">cloud.siliconflow.cn</span> 获取
              （<span onClick={() => openExternalUrl('https://cloud.siliconflow.cn/i/jAYUyU8w')} className="text-amber-500 hover:underline cursor-pointer">注册链接</span>）
            </p>
            <button
              type="button"
              onClick={handleTestSiliconFlow}
              disabled={sfTest.loading || (!apiKey && !hasKey)}
              className="text-sm px-2.5 py-1 rounded-md border border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-400 hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors disabled:opacity-40"
            >
              {sfTest.loading ? '测试中...' : '测试连接'}
            </button>
            {sfTest.result && (
              <span className={`text-sm ${sfTest.result.ok ? 'text-green-600' : 'text-red-500'}`}>
                {sfTest.result.ok ? '✓ 连接成功' : `✗ ${sfTest.result.error}`}
              </span>
            )}
          </div>

          {/* Balance display */}
          {hasKey && (
            <div className="space-y-1.5 pt-1 border-t border-slate-100 dark:border-slate-800">
              <div className="flex items-center justify-between text-sm">
                <span className="text-slate-500">充值余额</span>
                <div className="flex items-center gap-1.5">
                  <span className="font-mono font-medium text-slate-600 dark:text-slate-300">
                    ¥{sfChargeBalance || '0'}
                  </span>
                  <button
                    type="button"
                    onClick={refreshSfBalance}
                    disabled={sfBalanceLoading}
                    className="text-slate-400 hover:text-primary transition-colors disabled:opacity-40"
                    title="刷新余额"
                  >
                    <span className={`material-icons text-[16px] ${sfBalanceLoading ? 'animate-spin' : ''}`}>refresh</span>
                  </button>
                </div>
              </div>
              {sfBalance && sfChargeBalance && parseFloat(sfBalance) > parseFloat(sfChargeBalance) && (
                <div className="flex items-center justify-between text-sm">
                  <span className="text-slate-500">代金券余额</span>
                  <span className="font-mono font-medium text-amber-600 dark:text-amber-400">
                    ¥{(parseFloat(sfBalance) - parseFloat(sfChargeBalance)).toFixed(4)}
                  </span>
                </div>
              )}
              <div className="flex items-center justify-between text-sm">
                <span className="text-slate-500">总余额</span>
                <span className="font-mono font-medium text-slate-600 dark:text-slate-300">
                  ¥{sfBalance || '0'}
                </span>
              </div>
            </div>
          )}

          {/* Voucher models config */}
          {hasKey && (
            <div className="space-y-1.5">
              <button
                type="button"
                onClick={() => setShowVoucher(!showVoucher)}
                className="text-xs flex items-center gap-1 text-amber-600 dark:text-amber-400 hover:text-amber-700 transition-colors"
              >
                <span className="material-icons text-[14px]">confirmation_number</span>
                代金券适用模型配置
                <span className="material-icons text-[12px]">{showVoucher ? 'expand_less' : 'expand_more'}</span>
              </button>
              {showVoucher && (
                <>
                  <textarea
                    value={voucherText}
                    onChange={e => setVoucherText(e.target.value)}
                    placeholder="粘贴代金券适用模型列表，每行一个模型ID，如：&#10;Qwen/Qwen3-VL-8B-Instruct&#10;Pro/Qwen/Qwen2.5-VL-7B-Instruct"
                    className="w-full px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-xs font-mono focus:outline-none focus:ring-2 focus:ring-amber-500/30 h-28 resize-y"
                  />
                  <p className="text-xs text-slate-400">
                    从硅基流动代金券详情页复制模型列表粘贴到这里，模型下拉框会标注"券"
                  </p>
                </>
              )}
            </div>
          )}

        </div>

        {message && (
          <div className={`text-base px-3 py-2 rounded-lg ${message.includes('成功') ? 'bg-green-50 text-green-600' : 'bg-red-50 text-red-600'}`}>
            {message}
          </div>
        )}

        <button
          onClick={handleSave}
          disabled={saving}
          className="w-full py-2.5 bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg font-medium text-base transition-colors disabled:opacity-50"
        >
          {saving ? '保存中...' : '保存设置'}
        </button>
      </div>
    </div>
  );
};
