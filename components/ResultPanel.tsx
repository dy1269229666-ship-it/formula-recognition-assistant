import React, { useState, useMemo, useRef, useEffect } from 'react';
import { exportToWord } from '../utils/exportWord';

declare const katex: { renderToString: (tex: string, opts?: any) => string };

interface ResultPanelProps {
  resultText: string;
  mode: string;
  verified?: boolean | null;
  corrected?: boolean;
  originalText?: string | null;
  showingOriginal?: boolean;
  onUseOriginal?: () => void;
  onUseCorrected?: () => void;
}

function renderLatex(tex: string): string {
  try {
    if (typeof katex !== 'undefined') {
      return katex.renderToString(tex, { throwOnError: false, displayMode: true });
    }
  } catch {}
  return `<code>${tex}</code>`;
}

function latexToMathML(tex: string): string {
  try {
    if (typeof katex !== 'undefined') {
      const html = katex.renderToString(tex, { throwOnError: false, displayMode: true, output: 'mathml' });
      const match = html.match(/<math[\s\S]*<\/math>/);
      if (match) return match[0];
    }
  } catch {}
  return '';
}

function latexToAsciiMath(tex: string): string {
  let s = tex;
  s = s.replace(/\\frac\{([^}]*)\}\{([^}]*)\}/g, '($1)/($2)');
  s = s.replace(/\\sqrt\{([^}]*)\}/g, 'sqrt($1)');
  s = s.replace(/\\left\(/g, '(').replace(/\\right\)/g, ')');
  s = s.replace(/\\left\[/g, '[').replace(/\\right\]/g, ']');
  s = s.replace(/\^{([^}]*)}/g, '^($1)');
  s = s.replace(/_{([^}]*)}/g, '_($1)');
  s = s.replace(/\\(alpha|beta|gamma|delta|epsilon|theta|lambda|mu|pi|sigma|omega|phi|psi|rho|tau|eta|xi|zeta|nu|kappa|iota|chi)/g, '$1');
  s = s.replace(/\\(sum|prod|int|lim|inf|sin|cos|tan|log|ln|exp|max|min)/g, '$1');
  s = s.replace(/\\cdot/g, '*').replace(/\\times/g, 'xx').replace(/\\div/g, '-:');
  s = s.replace(/\\pm/g, '+-').replace(/\\mp/g, '-+');
  s = s.replace(/\\leq/g, '<=').replace(/\\geq/g, '>=').replace(/\\neq/g, '!=');
  s = s.replace(/\\infty/g, 'oo');
  s = s.replace(/\\[a-zA-Z]+/g, '');
  return s.trim();
}

function latexToTypst(tex: string): string {
  let s = tex;
  s = s.replace(/\\frac\{([^}]*)\}\{([^}]*)\}/g, '($1) / ($2)');
  s = s.replace(/\\sqrt\{([^}]*)\}/g, 'sqrt($1)');
  s = s.replace(/\^{([^}]*)}/g, '^($1)');
  s = s.replace(/_{([^}]*)}/g, '_($1)');
  s = s.replace(/\\(alpha|beta|gamma|delta|epsilon|theta|lambda|mu|pi|sigma|omega|phi|psi)/g, '$1');
  s = s.replace(/\\cdot/g, 'dot').replace(/\\times/g, 'times');
  s = s.replace(/\\infty/g, 'infinity');
  s = s.replace(/\\leq/g, '<=').replace(/\\geq/g, '>=').replace(/\\neq/g, '!=');
  s = s.replace(/\\left|\\right/g, '');
  s = s.replace(/\\[a-zA-Z]+/g, '');
  return `$${s.trim()}$`;
}

async function copyText(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    const ta = document.createElement('textarea');
    ta.value = text;
    ta.style.cssText = 'position:fixed;opacity:0';
    document.body.appendChild(ta);
    ta.select();
    document.execCommand('copy');
    document.body.removeChild(ta);
    return true;
  }
}


interface DropdownItem {
  label: string;
  icon?: string;
  action: () => void;
}

function DropdownButton({ icon, label, items, disabled }: {
  icon: string;
  label: string;
  items: DropdownItem[];
  disabled?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [feedback, setFeedback] = useState('');
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  const handleItemClick = (item: DropdownItem) => {
    item.action();
    setFeedback(item.label);
    setTimeout(() => setFeedback(''), 1500);
    setOpen(false);
  };

  return (
    <div className="relative" ref={ref}>
      <button
        onClick={() => !disabled && setOpen(!open)}
        disabled={disabled}
        className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-medium transition-all
          ${disabled
            ? 'bg-slate-100 text-slate-300 cursor-not-allowed'
            : feedback
              ? 'bg-emerald-500 text-white shadow-sm shadow-emerald-500/20'
              : 'bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300 hover:border-indigo-300 hover:text-indigo-600 dark:hover:border-indigo-600 dark:hover:text-indigo-400 shadow-sm'
          }`}
      >
        <span className="material-icons text-[14px]">{feedback ? 'check' : icon}</span>
        {feedback || label}
        {!feedback && !disabled && <span className="material-icons text-[12px] opacity-50">expand_more</span>}
      </button>
      {open && (
        <div className="absolute bottom-full left-0 mb-1.5 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl shadow-lg shadow-slate-200/50 dark:shadow-black/20 z-50 min-w-[200px] py-1 overflow-hidden">
          {items.map((item, i) => (
            <button
              key={i}
              onClick={() => handleItemClick(item)}
              className="w-full text-left px-3.5 py-2 text-sm text-slate-600 dark:text-slate-300 hover:bg-indigo-50 dark:hover:bg-slate-700/50 transition-colors flex items-center gap-2"
            >
              {item.icon && <span className="material-icons text-[16px] text-slate-400">{item.icon}</span>}
              {item.label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

function CopyButton({ label, icon, text }: { label: string; icon: string; text: string }) {
  const [copied, setCopied] = useState(false);
  const handleClick = async () => {
    await copyText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  };
  return (
    <button
      onClick={handleClick}
      className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-medium transition-all shadow-sm ${
        copied
          ? 'bg-emerald-500 text-white shadow-emerald-500/20'
          : 'bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300 hover:border-indigo-300 hover:text-indigo-600'
      }`}
    >
      <span className="material-icons text-[16px]">{copied ? 'check' : icon}</span>
      {copied ? '已复制' : label}
    </button>
  );
}

export const ResultPanel: React.FC<ResultPanelProps> = ({ resultText, mode, verified, corrected, originalText, showingOriginal, onUseOriginal, onUseCorrected }) => {
  const latex = useMemo(() => {
    return resultText.trim();
  }, [resultText]);

  const hasResult = !!resultText;

  // Render markdown with inline KaTeX for document mode
  const renderedMarkdown = useMemo(() => {
    if (mode !== 'document' || !resultText) return '';
    let html = resultText;
    html = html.replace(/\$\$([\s\S]*?)\$\$/g, (_m: string, tex: string) => {
      try {
        if (typeof katex !== 'undefined') {
          return `<div class="my-2 text-center">${katex.renderToString(tex.trim(), { throwOnError: false, displayMode: true })}</div>`;
        }
      } catch {}
      return `<pre>${tex}</pre>`;
    });
    html = html.replace(/\$([^\$\n]+?)\$/g, (_m: string, tex: string) => {
      try {
        if (typeof katex !== 'undefined') {
          return katex.renderToString(tex.trim(), { throwOnError: false, displayMode: false });
        }
      } catch {}
      return `<code>${tex}</code>`;
    });
    html = html.replace(/^### (.+)$/gm, '<h3 class="text-sm font-bold mt-3 mb-1">$1</h3>');
    html = html.replace(/^## (.+)$/gm, '<h2 class="text-base font-bold mt-3 mb-1">$1</h2>');
    html = html.replace(/^# (.+)$/gm, '<h1 class="text-lg font-bold mt-3 mb-1">$1</h1>');
    html = html.replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>');
    html = html.replace(/\n/g, '<br/>');
    return html;
  }, [resultText, mode]);


  const latexItems: DropdownItem[] = [
    { label: '复制 LaTeX', icon: 'code', action: () => copyText(latex) },
    { label: '$ ... $ 行内格式', icon: 'wrap_text', action: () => copyText(`$${latex}$`) },
    { label: '$$ ... $$ 块级格式', icon: 'view_day', action: () => copyText(`$$${latex}$$`) },
    { label: '\\[ ... \\] 格式', icon: 'data_array', action: () => copyText(`\\[${latex}\\]`) },
    { label: '\\( ... \\) 格式', icon: 'data_array', action: () => copyText(`\\(${latex}\\)`) },
    { label: '\\begin{equation} 格式', icon: 'integration_instructions', action: () => copyText(`\\begin{equation}\n${latex}\n\\end{equation}`) },
  ];

  const mathmlItems: DropdownItem[] = [
    { label: '复制 MathML (Word)', icon: 'description', action: () => copyText(latexToMathML(latex)) },
    { label: '复制 AsciiMath', icon: 'text_snippet', action: () => copyText(latexToAsciiMath(latex)) },
    { label: '复制 Typst', icon: 'edit_note', action: () => copyText(latexToTypst(latex)) },
    { label: '导出 Docx (Word/WPS)', icon: 'file_download', action: async () => {
      try { await exportToWord(latex || resultText, mode); } catch(e) { console.error(e); }
    }},
  ];

  if (!hasResult) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center rounded-xl bg-gradient-to-b from-slate-50 to-white dark:from-slate-800/30 dark:to-slate-900 min-h-[140px] border border-slate-100 dark:border-slate-800">
        <span className="material-icons text-3xl text-slate-200 dark:text-slate-700 mb-2">science</span>
        <span className="text-sm text-slate-300 dark:text-slate-600">识别结果将显示在这里</span>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-3 flex-1">
      {/* Live Preview */}
      <div className="rounded-xl overflow-hidden bg-gradient-to-b from-white to-slate-50/50 dark:from-slate-800 dark:to-slate-800/50 min-h-[90px] flex items-center justify-center p-5 border border-slate-100 dark:border-slate-700/50 shadow-sm">
        {mode === 'formula' && latex ? (
          <div className="text-2xl text-slate-800 dark:text-slate-100" dangerouslySetInnerHTML={{ __html: renderLatex(latex) }} />
        ) : mode === 'document' ? (
          <div className="text-base text-slate-700 dark:text-slate-200 w-full leading-relaxed" dangerouslySetInnerHTML={{ __html: renderedMarkdown }} />
        ) : (
          <pre className="text-base text-slate-700 dark:text-slate-200 whitespace-pre-wrap w-full font-sans">{resultText}</pre>
        )}
      </div>

      {/* Verification badge */}
      {verified === true && (
        <div className="flex items-center gap-1.5 text-xs text-emerald-600 dark:text-emerald-400 bg-emerald-50 dark:bg-emerald-950/20 border border-emerald-200/50 dark:border-emerald-800/30 rounded-lg px-2.5 py-1.5">
          <span className="material-icons text-[14px]">verified</span>
          AI 双重验证通过，结果一致
        </div>
      )}
      {corrected && !showingOriginal && (
        <div className="flex items-center justify-between text-xs bg-amber-50 dark:bg-amber-950/20 border border-amber-200/50 dark:border-amber-800/30 rounded-lg px-2.5 py-1.5">
          <div className="flex items-center gap-1.5 text-amber-600 dark:text-amber-400">
            <span className="material-icons text-[14px]">edit_note</span>
            AI 校验后已修正结果
          </div>
          {originalText && onUseOriginal && (
            <button onClick={onUseOriginal} className="text-amber-500 hover:text-amber-700 underline ml-2">
              查看原始结果
            </button>
          )}
        </div>
      )}
      {corrected && showingOriginal && (
        <div className="flex items-center justify-between text-xs bg-slate-50 dark:bg-slate-800/50 border border-slate-200/50 dark:border-slate-700/30 rounded-lg px-2.5 py-1.5">
          <div className="flex items-center gap-1.5 text-slate-500 dark:text-slate-400">
            <span className="material-icons text-[14px]">history</span>
            当前显示原始识别结果
          </div>
          {onUseCorrected && (
            <button onClick={onUseCorrected} className="text-amber-500 hover:text-amber-700 underline ml-2">
              查看修正结果
            </button>
          )}
        </div>
      )}

      {/* Action Buttons */}
      <div className="flex flex-wrap items-center gap-2">
        {mode === 'formula' ? (
          <>
            <DropdownButton icon="content_copy" label="LaTeX" items={latexItems} />
            <DropdownButton icon="functions" label="MathML" items={mathmlItems} />
          </>
        ) : mode === 'document' ? (
          <>
            <CopyButton label="复制 Markdown" icon="content_copy" text={resultText} />
            <CopyButton label="复制纯文本" icon="text_snippet" text={resultText.replace(/\$\$[\s\S]*?\$\$/g, '').replace(/\$[^\$\n]+?\$/g, '').replace(/[#*`]/g, '').trim()} />
          </>
        ) : (
          <CopyButton label="复制文本" icon="content_copy" text={resultText} />
        )}
      </div>
    </div>
  );
};
