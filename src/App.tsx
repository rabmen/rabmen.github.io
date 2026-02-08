import { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import {
  Plus, Search, Copy, Check, Star, Edit3, Trash2, X, Download, Upload,
  ChevronDown, FolderOpen, Zap, Menu, Hash, Shield, ShieldCheck,
  Sparkles, Clock, ArrowUpDown, Heart, BookOpen, Filter,
  FileText, Archive, Layers, Lock, Eye, EyeOff, RefreshCw,
  Cloud, CloudOff, Settings, LogOut, AlertTriangle, Loader2,
  KeyRound, Github
} from 'lucide-react';
import { cn } from './utils/cn';
import { encrypt, decrypt, createPinVerifier, verifyPin } from './lib/crypto';
import { validateToken, findVaultGist, loadFromGist, saveToGist } from './lib/gist';
import type { Prompt, VaultData, SyncStatus, SortBy, AppScreen } from './types';

// ═══════════════════ CONSTANTS ═══════════════════
const LS_PIN_VERIFIER = 'pv_pin_verifier';
const LS_ENCRYPTED_TOKEN = 'pv_encrypted_token';
const LS_ENCRYPTED_CACHE = 'pv_encrypted_cache';
const LS_GIST_ID = 'pv_gist_id';
const LS_USERNAME = 'pv_username';

// ═══════════════════ HELPERS ═══════════════════
const genId = () => crypto.randomUUID?.() ?? Math.random().toString(36).slice(2) + Date.now().toString(36);

function extractVariables(text: string): string[] {
  const matches = text.match(/\{\{([^}]+)\}\}/g);
  if (!matches) return [];
  return [...new Set(matches.map(m => m.slice(2, -2).trim()))];
}

function timeAgo(ts: number): string {
  const diff = Date.now() - ts;
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return 'только что';
  if (mins < 60) return `${mins} мин назад`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs} ч назад`;
  const days = Math.floor(hrs / 24);
  if (days < 30) return `${days} дн назад`;
  const months = Math.floor(days / 30);
  return `${months} мес назад`;
}

function getDefaultData(): VaultData {
  return {
    prompts: [
      {
        id: genId(), title: 'Универсальный системный промпт',
        content: 'Ты — эксперт в области {{область}}. Отвечай структурированно, используя маркированные списки и подзаголовки. Давай практичные, действенные советы. Избегай воды и общих фраз. Если нужно — приводи примеры.',
        category: 'Системные', tags: ['система', 'базовый'], isFavorite: true,
        createdAt: Date.now() - 86400000 * 5, updatedAt: Date.now() - 86400000 * 5, usageCount: 23,
      },
      {
        id: genId(), title: 'Рефакторинг кода',
        content: 'Проанализируй этот код и предложи улучшения:\n\n```{{язык}}\n{{код}}\n```\n\nУлучши:\n1. Читаемость\n2. Производительность\n3. Обработку ошибок\n4. Следование best practices\n\nОбъясни каждое изменение.',
        category: 'Код', tags: ['рефакторинг', 'код', 'review'], isFavorite: true,
        createdAt: Date.now() - 86400000 * 3, updatedAt: Date.now() - 86400000 * 2, usageCount: 15,
      },
      {
        id: genId(), title: 'Написание статьи',
        content: 'Напиши статью на тему "{{тема}}" для {{аудитория}}.\n\nТребования:\n- Длина: {{длина}} слов\n- Тон: {{тон}}\n- Включи введение, основную часть и заключение\n- Добавь 3-5 подзаголовков\n- Используй примеры и аналогии',
        category: 'Контент', tags: ['статья', 'копирайтинг'], isFavorite: false,
        createdAt: Date.now() - 86400000 * 2, updatedAt: Date.now() - 86400000, usageCount: 8,
      },
    ],
    version: 1,
    lastSync: 0,
  };
}

// ═══════════════════ LOCK SCREEN ═══════════════════
function LockScreen({ onUnlock }: { onUnlock: (pin: string) => void }) {
  const [pin, setPin] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [showPin, setShowPin] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  const handleSubmit = async () => {
    if (pin.length < 4) {
      setError('PIN минимум 4 символа');
      return;
    }
    setLoading(true);
    setError('');
    const verifier = localStorage.getItem(LS_PIN_VERIFIER);
    if (!verifier) {
      setError('Данные повреждены. Сбросьте хранилище.');
      setLoading(false);
      return;
    }
    const ok = await verifyPin(pin, verifier);
    if (ok) {
      onUnlock(pin);
    } else {
      setError('Неверный PIN-код');
      setPin('');
      inputRef.current?.focus();
    }
    setLoading(false);
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') handleSubmit();
  };

  const handleReset = () => {
    if (confirm('Это удалит ВСЕ данные (токен, промпты). Вы уверены?')) {
      localStorage.removeItem(LS_PIN_VERIFIER);
      localStorage.removeItem(LS_ENCRYPTED_TOKEN);
      localStorage.removeItem(LS_ENCRYPTED_CACHE);
      localStorage.removeItem(LS_GIST_ID);
      localStorage.removeItem(LS_USERNAME);
      window.location.reload();
    }
  };

  return (
    <div className="min-h-screen bg-gray-950 flex items-center justify-center p-4">
      <div className="absolute inset-0 overflow-hidden">
        <div className="absolute top-1/4 left-1/4 w-96 h-96 bg-vault-600/5 rounded-full blur-3xl" />
        <div className="absolute bottom-1/4 right-1/4 w-96 h-96 bg-purple-600/5 rounded-full blur-3xl" />
      </div>

      <div className="relative w-full max-w-sm animate-fade-in">
        <div className="text-center mb-8">
          <div className="inline-flex h-20 w-20 items-center justify-center rounded-3xl bg-gradient-to-br from-vault-500 to-vault-700 shadow-2xl shadow-vault-500/25 mb-4">
            <Lock className="h-10 w-10 text-white" />
          </div>
          <h1 className="text-2xl font-bold text-white mb-1">PromptVault</h1>
          <p className="text-gray-500 text-sm">Введите PIN для доступа</p>
        </div>

        <div className="bg-gray-900 border border-gray-800 rounded-2xl p-6">
          <div className="relative mb-4">
            <input
              ref={inputRef}
              type={showPin ? 'text' : 'password'}
              value={pin}
              onChange={e => { setPin(e.target.value); setError(''); }}
              onKeyDown={handleKeyDown}
              placeholder="Введите PIN-код"
              maxLength={32}
              className="w-full bg-gray-800 border border-gray-700 rounded-xl px-4 py-3.5 text-center text-lg tracking-[0.3em] text-white placeholder:text-gray-600 placeholder:tracking-normal outline-none focus:border-vault-600 transition-colors"
              autoComplete="off"
            />
            <button
              type="button"
              onClick={() => setShowPin(!showPin)}
              className="absolute right-3 top-1/2 -translate-y-1/2 p-1 text-gray-600 hover:text-gray-400 transition-colors"
            >
              {showPin ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
            </button>
          </div>

          {error && (
            <div className="flex items-center gap-2 text-red-400 text-sm mb-4 px-1 animate-fade-in">
              <AlertTriangle className="h-4 w-4 shrink-0" />
              {error}
            </div>
          )}

          <button
            onClick={handleSubmit}
            disabled={loading || pin.length < 4}
            className={cn(
              'w-full py-3.5 rounded-xl font-medium text-white transition-all flex items-center justify-center gap-2',
              pin.length >= 4
                ? 'bg-gradient-to-r from-vault-600 to-vault-700 hover:from-vault-500 hover:to-vault-600 shadow-lg shadow-vault-600/25'
                : 'bg-gray-800 cursor-not-allowed opacity-50'
            )}
          >
            {loading ? <Loader2 className="h-5 w-5 animate-spin" /> : <ShieldCheck className="h-5 w-5" />}
            {loading ? 'Проверка...' : 'Разблокировать'}
          </button>
        </div>

        <div className="text-center mt-4">
          <button onClick={handleReset} className="text-xs text-gray-700 hover:text-gray-500 transition-colors">
            Забыли PIN? Сбросить всё
          </button>
        </div>
      </div>
    </div>
  );
}

// ═══════════════════ SETUP SCREEN ═══════════════════
function SetupScreen({ onComplete }: { onComplete: (pin: string) => void }) {
  const [step, setStep] = useState(1);
  const [pin, setPin] = useState('');
  const [pinConfirm, setPinConfirm] = useState('');
  const [token, setToken] = useState('');
  const [showPin, setShowPin] = useState(false);
  const [showToken, setShowToken] = useState(false);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [username, setUsername] = useState('');

  const handlePinStep = () => {
    if (pin.length < 4) {
      setError('PIN минимум 4 символа');
      return;
    }
    if (pin !== pinConfirm) {
      setError('PIN-коды не совпадают');
      return;
    }
    setError('');
    setStep(2);
  };

  const handleTokenStep = async () => {
    if (!token.trim()) {
      setError('Введите GitHub Token');
      return;
    }
    setLoading(true);
    setError('');

    // Validate token
    const validation = await validateToken(token.trim());
    if (!validation.valid) {
      setError('Невалидный токен. Убедитесь что у него есть scope "gist"');
      setLoading(false);
      return;
    }

    setUsername(validation.username || '');

    try {
      // Create PIN verifier
      const verifier = await createPinVerifier(pin);
      localStorage.setItem(LS_PIN_VERIFIER, verifier);

      // Encrypt and store token
      const encryptedToken = await encrypt(token.trim(), pin);
      localStorage.setItem(LS_ENCRYPTED_TOKEN, encryptedToken);

      // Store username
      if (validation.username) {
        localStorage.setItem(LS_USERNAME, validation.username);
      }

      // Try to find existing vault gist
      const existingGistId = await findVaultGist(token.trim());
      if (existingGistId) {
        localStorage.setItem(LS_GIST_ID, existingGistId);
      }

      setStep(3);
    } catch {
      setError('Ошибка при настройке шифрования');
    }
    setLoading(false);
  };

  const handleFinish = () => {
    onComplete(pin);
  };

  return (
    <div className="min-h-screen bg-gray-950 flex items-center justify-center p-4">
      <div className="absolute inset-0 overflow-hidden">
        <div className="absolute top-1/4 left-1/4 w-96 h-96 bg-vault-600/5 rounded-full blur-3xl" />
        <div className="absolute bottom-1/4 right-1/4 w-96 h-96 bg-purple-600/5 rounded-full blur-3xl" />
      </div>

      <div className="relative w-full max-w-md animate-fade-in">
        <div className="text-center mb-8">
          <div className="inline-flex h-20 w-20 items-center justify-center rounded-3xl bg-gradient-to-br from-vault-500 to-vault-700 shadow-2xl shadow-vault-500/25 mb-4">
            <Sparkles className="h-10 w-10 text-white" />
          </div>
          <h1 className="text-2xl font-bold text-white mb-1">Добро пожаловать в PromptVault</h1>
          <p className="text-gray-500 text-sm">Настроим безопасное хранилище за 2 шага</p>
        </div>

        {/* Progress */}
        <div className="flex items-center justify-center gap-2 mb-6">
          {[1, 2, 3].map(s => (
            <div key={s} className={cn(
              'h-2 rounded-full transition-all duration-500',
              s <= step ? 'bg-vault-500' : 'bg-gray-800',
              s === step ? 'w-8' : 'w-2'
            )} />
          ))}
        </div>

        <div className="bg-gray-900 border border-gray-800 rounded-2xl p-6">
          {/* Step 1: PIN */}
          {step === 1 && (
            <div className="animate-fade-in">
              <div className="flex items-center gap-3 mb-4">
                <div className="h-10 w-10 rounded-xl bg-vault-500/15 flex items-center justify-center">
                  <KeyRound className="h-5 w-5 text-vault-400" />
                </div>
                <div>
                  <h2 className="font-bold text-white">Создайте PIN-код</h2>
                  <p className="text-xs text-gray-500">Для защиты доступа к промптам</p>
                </div>
              </div>

              <div className="space-y-3 mb-4">
                <div className="relative">
                  <input
                    type={showPin ? 'text' : 'password'}
                    value={pin}
                    onChange={e => { setPin(e.target.value); setError(''); }}
                    placeholder="PIN-код (минимум 4 символа)"
                    maxLength={32}
                    className="w-full bg-gray-800 border border-gray-700 rounded-xl px-4 py-3 text-white placeholder:text-gray-600 outline-none focus:border-vault-600 transition-colors pr-10"
                    autoComplete="off"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPin(!showPin)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 p-1 text-gray-600 hover:text-gray-400"
                  >
                    {showPin ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                  </button>
                </div>
                <input
                  type={showPin ? 'text' : 'password'}
                  value={pinConfirm}
                  onChange={e => { setPinConfirm(e.target.value); setError(''); }}
                  placeholder="Повторите PIN-код"
                  maxLength={32}
                  className="w-full bg-gray-800 border border-gray-700 rounded-xl px-4 py-3 text-white placeholder:text-gray-600 outline-none focus:border-vault-600 transition-colors"
                  autoComplete="off"
                  onKeyDown={e => e.key === 'Enter' && handlePinStep()}
                />
              </div>

              {error && (
                <div className="flex items-center gap-2 text-red-400 text-sm mb-4 animate-fade-in">
                  <AlertTriangle className="h-4 w-4 shrink-0" />
                  {error}
                </div>
              )}

              <button
                onClick={handlePinStep}
                disabled={pin.length < 4}
                className={cn(
                  'w-full py-3 rounded-xl font-medium text-white transition-all',
                  pin.length >= 4
                    ? 'bg-gradient-to-r from-vault-600 to-vault-700 hover:from-vault-500 hover:to-vault-600 shadow-lg shadow-vault-600/25'
                    : 'bg-gray-800 cursor-not-allowed opacity-50'
                )}
              >
                Далее →
              </button>

              <div className="mt-4 p-3 rounded-xl bg-gray-800/50 border border-gray-800">
                <p className="text-xs text-gray-500 leading-relaxed">
                  <Shield className="h-3.5 w-3.5 inline mr-1 text-vault-400" />
                  PIN шифрует все данные с помощью AES-256-GCM. Даже при доступе к localStorage — только зашифрованная каша.
                </p>
              </div>
            </div>
          )}

          {/* Step 2: GitHub Token */}
          {step === 2 && (
            <div className="animate-fade-in">
              <div className="flex items-center gap-3 mb-4">
                <div className="h-10 w-10 rounded-xl bg-vault-500/15 flex items-center justify-center">
                  <Github className="h-5 w-5 text-vault-400" />
                </div>
                <div>
                  <h2 className="font-bold text-white">GitHub Token</h2>
                  <p className="text-xs text-gray-500">Для синхронизации через секретный Gist</p>
                </div>
              </div>

              <div className="relative mb-3">
                <input
                  type={showToken ? 'text' : 'password'}
                  value={token}
                  onChange={e => { setToken(e.target.value); setError(''); }}
                  placeholder="ghp_xxxxxxxxxxxxxxxxxxxx"
                  className="w-full bg-gray-800 border border-gray-700 rounded-xl px-4 py-3 text-white font-mono text-sm placeholder:text-gray-600 outline-none focus:border-vault-600 transition-colors pr-10"
                  autoComplete="off"
                  onKeyDown={e => e.key === 'Enter' && handleTokenStep()}
                />
                <button
                  type="button"
                  onClick={() => setShowToken(!showToken)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 p-1 text-gray-600 hover:text-gray-400"
                >
                  {showToken ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </button>
              </div>

              {error && (
                <div className="flex items-center gap-2 text-red-400 text-sm mb-3 animate-fade-in">
                  <AlertTriangle className="h-4 w-4 shrink-0" />
                  {error}
                </div>
              )}

              <button
                onClick={handleTokenStep}
                disabled={loading || !token.trim()}
                className={cn(
                  'w-full py-3 rounded-xl font-medium text-white transition-all flex items-center justify-center gap-2',
                  token.trim()
                    ? 'bg-gradient-to-r from-vault-600 to-vault-700 hover:from-vault-500 hover:to-vault-600 shadow-lg shadow-vault-600/25'
                    : 'bg-gray-800 cursor-not-allowed opacity-50'
                )}
              >
                {loading ? <Loader2 className="h-5 w-5 animate-spin" /> : <ShieldCheck className="h-5 w-5" />}
                {loading ? 'Проверяю токен...' : 'Подключить'}
              </button>

              <div className="mt-4 p-3 rounded-xl bg-gray-800/50 border border-gray-800 space-y-2">
                <p className="text-xs text-gray-400 font-medium">Как получить токен:</p>
                <ol className="text-xs text-gray-500 space-y-1 list-decimal list-inside leading-relaxed">
                  <li>Откройте <a href="https://github.com/settings/tokens?type=beta" target="_blank" rel="noopener noreferrer" className="text-vault-400 hover:text-vault-300 underline">GitHub → Settings → Tokens</a></li>
                  <li>Generate new token (Classic)</li>
                  <li>Выберите scope: <code className="text-vault-400 bg-gray-800 px-1 rounded">gist</code></li>
                  <li>Скопируйте токен сюда</li>
                </ol>
                <p className="text-xs text-gray-600 mt-2">
                  <Lock className="h-3 w-3 inline mr-1" />
                  Токен шифруется вашим PIN и не хранится в открытом виде
                </p>
              </div>

              <button onClick={() => { setStep(1); setError(''); }} className="w-full mt-3 py-2 text-sm text-gray-500 hover:text-gray-400 transition-colors">
                ← Назад
              </button>
            </div>
          )}

          {/* Step 3: Done */}
          {step === 3 && (
            <div className="animate-fade-in text-center">
              <div className="h-16 w-16 rounded-2xl bg-emerald-500/15 flex items-center justify-center mx-auto mb-4">
                <Check className="h-8 w-8 text-emerald-400" />
              </div>
              <h2 className="text-xl font-bold text-white mb-2">Всё готово!</h2>
              <p className="text-sm text-gray-400 mb-2">
                Подключён как <span className="text-vault-400 font-medium">@{username}</span>
              </p>
              <div className="space-y-2 text-left mb-6 p-4 rounded-xl bg-gray-800/50 border border-gray-800">
                <div className="flex items-center gap-2 text-sm text-gray-300">
                  <ShieldCheck className="h-4 w-4 text-emerald-400" /> PIN-код установлен
                </div>
                <div className="flex items-center gap-2 text-sm text-gray-300">
                  <ShieldCheck className="h-4 w-4 text-emerald-400" /> Токен зашифрован (AES-256-GCM)
                </div>
                <div className="flex items-center gap-2 text-sm text-gray-300">
                  <ShieldCheck className="h-4 w-4 text-emerald-400" /> GitHub Gist подключён
                </div>
              </div>
              <button
                onClick={handleFinish}
                className="w-full py-3 rounded-xl font-medium text-white bg-gradient-to-r from-vault-600 to-vault-700 hover:from-vault-500 hover:to-vault-600 shadow-lg shadow-vault-600/25 transition-all"
              >
                Начать работу 🚀
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// ═══════════════════ MAIN APP ═══════════════════
// ═══════════════════ SECURE CONTEXT CHECK ═══════════════════
function InsecureContextScreen() {
  return (
    <div className="min-h-screen bg-gray-950 flex items-center justify-center p-4">
      <div className="absolute inset-0 overflow-hidden">
        <div className="absolute top-1/4 left-1/4 w-96 h-96 bg-red-600/5 rounded-full blur-3xl" />
        <div className="absolute bottom-1/4 right-1/4 w-96 h-96 bg-orange-600/5 rounded-full blur-3xl" />
      </div>
      <div className="relative w-full max-w-lg animate-fade-in">
        <div className="text-center mb-8">
          <div className="inline-flex h-20 w-20 items-center justify-center rounded-3xl bg-gradient-to-br from-red-500 to-orange-600 shadow-2xl shadow-red-500/25 mb-4">
            <AlertTriangle className="h-10 w-10 text-white" />
          </div>
          <h1 className="text-2xl font-bold text-white mb-2">Требуется HTTPS</h1>
          <p className="text-gray-400 text-sm leading-relaxed max-w-md mx-auto">
            PromptVault использует Web Crypto API (AES-256-GCM) для шифрования данных. 
            Эта технология работает только через <span className="text-vault-400 font-medium">HTTPS</span> или <span className="text-vault-400 font-medium">localhost</span>.
          </p>
        </div>

        <div className="bg-gray-900 border border-gray-800 rounded-2xl p-6 space-y-4">
          <h3 className="font-semibold text-white flex items-center gap-2">
            <Sparkles className="h-5 w-5 text-vault-400" />
            Как запустить правильно:
          </h3>
          
          <div className="space-y-3">
            <div className="p-4 rounded-xl bg-gray-800/50 border border-gray-800">
              <div className="flex items-center gap-2 mb-2">
                <div className="h-6 w-6 rounded-full bg-emerald-500/20 flex items-center justify-center text-xs font-bold text-emerald-400">1</div>
                <span className="font-medium text-emerald-400 text-sm">GitHub Pages (рекомендуется)</span>
              </div>
              <p className="text-xs text-gray-400 leading-relaxed">
                Залейте на GitHub → Settings → Pages → выберите ветку. 
                Сайт будет доступен по <code className="text-vault-400 bg-gray-800 px-1.5 py-0.5 rounded">https://username.github.io/repo</code>
              </p>
            </div>

            <div className="p-4 rounded-xl bg-gray-800/50 border border-gray-800">
              <div className="flex items-center gap-2 mb-2">
                <div className="h-6 w-6 rounded-full bg-blue-500/20 flex items-center justify-center text-xs font-bold text-blue-400">2</div>
                <span className="font-medium text-blue-400 text-sm">Локальный сервер</span>
              </div>
              <div className="text-xs text-gray-400 leading-relaxed space-y-1">
                <p>Запустите локальный HTTP-сервер в папке с файлом:</p>
                <code className="block bg-gray-800 text-vault-400 px-3 py-2 rounded-lg mt-1 font-mono">
                  npx serve dist
                </code>
                <p className="mt-1">Или через Python:</p>
                <code className="block bg-gray-800 text-vault-400 px-3 py-2 rounded-lg mt-1 font-mono">
                  python -m http.server 3000
                </code>
                <p className="text-gray-500 mt-2">Затем откройте <code className="text-vault-400">http://localhost:3000</code></p>
              </div>
            </div>
          </div>

          <div className="p-3 rounded-xl bg-amber-500/10 border border-amber-500/20">
            <p className="text-xs text-amber-400 leading-relaxed">
              <AlertTriangle className="h-3.5 w-3.5 inline mr-1" />
              Открытие через <code className="bg-gray-800 px-1 rounded">file:///</code> не поддерживается браузерами для криптографических операций — это ограничение безопасности, а не баг.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}

export function App() {
  // Check for secure context (HTTPS or localhost)
  const isSecure = typeof window !== 'undefined' && (
    window.isSecureContext || 
    window.location.protocol === 'https:' || 
    window.location.hostname === 'localhost' || 
    window.location.hostname === '127.0.0.1'
  );
  
  const hasCrypto = typeof crypto !== 'undefined' && typeof crypto.subtle !== 'undefined';

  const [screen, setScreen] = useState<AppScreen>(() => {
    const hasVerifier = !!localStorage.getItem(LS_PIN_VERIFIER);
    return hasVerifier ? 'lock' : 'setup';
  });
  const [currentPin, setCurrentPin] = useState<string | null>(null);

  if (!isSecure || !hasCrypto) {
    return <InsecureContextScreen />;
  }

  const handleSetupComplete = (pin: string) => {
    setCurrentPin(pin);
    setScreen('main');
  };

  const handleUnlock = (pin: string) => {
    setCurrentPin(pin);
    setScreen('main');
  };

  const handleLock = () => {
    setCurrentPin(null);
    setScreen('lock');
  };

  if (screen === 'setup') return <SetupScreen onComplete={handleSetupComplete} />;
  if (screen === 'lock') return <LockScreen onUnlock={handleUnlock} />;
  if (!currentPin) return <LockScreen onUnlock={handleUnlock} />;

  return <MainApp pin={currentPin} onLock={handleLock} />;
}

// ═══════════════════ MAIN APP CONTENT ═══════════════════
function MainApp({ pin, onLock }: { pin: string; onLock: () => void }) {
  const [prompts, setPrompts] = useState<Prompt[]>([]);
  const [search, setSearch] = useState('');
  const [activeCategory, setActiveCategory] = useState('Все');
  const [activeTag, setActiveTag] = useState<string | null>(null);
  const [showFavorites, setShowFavorites] = useState(false);
  const [sortBy, setSortBy] = useState<SortBy>('newest');
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [editingPrompt, setEditingPrompt] = useState<Prompt | null>(null);
  const [isCreating, setIsCreating] = useState(false);
  const [variablePrompt, setVariablePrompt] = useState<Prompt | null>(null);
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [showSortMenu, setShowSortMenu] = useState(false);
  const [deleteConfirm, setDeleteConfirm] = useState<string | null>(null);
  const [showImportExport, setShowImportExport] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const [syncStatus, setSyncStatus] = useState<SyncStatus>('idle');
  const [syncMessage, setSyncMessage] = useState('');
  const [dataLoaded, setDataLoaded] = useState(false);
  const [githubUser, setGithubUser] = useState(localStorage.getItem(LS_USERNAME) || '');

  const fileInputRef = useRef<HTMLInputElement>(null);
  const sortRef = useRef<HTMLDivElement>(null);
  const saveTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const tokenRef = useRef<string | null>(null);

  // ─── Initial load ───
  useEffect(() => {
    let cancelled = false;
    async function init() {
      try {
        // Decrypt token
        const encToken = localStorage.getItem(LS_ENCRYPTED_TOKEN);
        if (encToken) {
          const tok = await decrypt(encToken, pin);
          tokenRef.current = tok;
        }

        // Try to load from encrypted cache first
        const encCache = localStorage.getItem(LS_ENCRYPTED_CACHE);
        if (encCache) {
          try {
            const cacheJson = await decrypt(encCache, pin);
            const cacheData: VaultData = JSON.parse(cacheJson);
            if (!cancelled) {
              setPrompts(cacheData.prompts);
              setDataLoaded(true);
            }
          } catch {
            // Cache corrupted, ignore
          }
        }

        // Then sync from Gist
        if (tokenRef.current) {
          if (!cancelled) setSyncStatus('syncing');
          const gistId = localStorage.getItem(LS_GIST_ID);

          if (gistId) {
            const gistData = await loadFromGist(tokenRef.current, gistId);
            if (!cancelled && gistData) {
              setPrompts(gistData.prompts);
              // Update cache
              const encrypted = await encrypt(JSON.stringify(gistData), pin);
              localStorage.setItem(LS_ENCRYPTED_CACHE, encrypted);
              setSyncStatus('synced');
              setSyncMessage('Синхронизировано');
              setDataLoaded(true);
              return;
            }
          }

          // No gist found or no data — try to find one
          if (!gistId) {
            const foundId = await findVaultGist(tokenRef.current);
            if (!cancelled && foundId) {
              localStorage.setItem(LS_GIST_ID, foundId);
              const gistData = await loadFromGist(tokenRef.current, foundId);
              if (gistData) {
                setPrompts(gistData.prompts);
                const encrypted = await encrypt(JSON.stringify(gistData), pin);
                localStorage.setItem(LS_ENCRYPTED_CACHE, encrypted);
                setSyncStatus('synced');
                setDataLoaded(true);
                return;
              }
            }
          }

          // No gist at all — use defaults and create gist
          if (!cancelled && !dataLoaded) {
            const defaults = getDefaultData();
            setPrompts(defaults.prompts);
            setDataLoaded(true);

            // Create gist with defaults
            const newGistId = await saveToGist(tokenRef.current, null, defaults);
            if (newGistId) {
              localStorage.setItem(LS_GIST_ID, newGistId);
              const encrypted = await encrypt(JSON.stringify(defaults), pin);
              localStorage.setItem(LS_ENCRYPTED_CACHE, encrypted);
            }
            setSyncStatus('synced');
          }
        } else {
          // No token — just use defaults
          if (!cancelled && !dataLoaded) {
            setPrompts(getDefaultData().prompts);
            setDataLoaded(true);
          }
          setSyncStatus('offline');
        }
      } catch (err) {
        console.error('Init error:', err);
        if (!cancelled) {
          setSyncStatus('error');
          setSyncMessage('Ошибка загрузки');
          if (!dataLoaded) {
            setPrompts(getDefaultData().prompts);
            setDataLoaded(true);
          }
        }
      }
    }
    init();
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pin]);

  // ─── Auto-save to Gist (debounced) ───
  const saveToCloud = useCallback(async (promptsToSave: Prompt[]) => {
    if (!tokenRef.current) return;
    setSyncStatus('syncing');
    try {
      const data: VaultData = {
        prompts: promptsToSave,
        version: 1,
        lastSync: Date.now(),
      };
      const gistId = localStorage.getItem(LS_GIST_ID);
      const resultId = await saveToGist(tokenRef.current, gistId, data);
      if (resultId) {
        localStorage.setItem(LS_GIST_ID, resultId);
        const encrypted = await encrypt(JSON.stringify(data), pin);
        localStorage.setItem(LS_ENCRYPTED_CACHE, encrypted);
        setSyncStatus('synced');
        setSyncMessage('Сохранено в облако');
      } else {
        setSyncStatus('error');
        setSyncMessage('Ошибка сохранения');
      }
    } catch {
      setSyncStatus('error');
      setSyncMessage('Ошибка сохранения');
    }
  }, [pin]);

  const debouncedSave = useCallback((newPrompts: Prompt[]) => {
    if (saveTimeoutRef.current) clearTimeout(saveTimeoutRef.current);
    saveTimeoutRef.current = setTimeout(() => saveToCloud(newPrompts), 1500);
  }, [saveToCloud]);

  // ─── Close sort menu on outside click ───
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (sortRef.current && !sortRef.current.contains(e.target as Node)) {
        setShowSortMenu(false);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  // ─── Derived data ───
  const categories = useMemo(() => {
    const cats = new Set(prompts.map(p => p.category));
    return ['Все', ...Array.from(cats).sort()];
  }, [prompts]);

  const allTags = useMemo(() => {
    const tags = new Map<string, number>();
    prompts.forEach(p => p.tags.forEach(t => tags.set(t, (tags.get(t) || 0) + 1)));
    return Array.from(tags.entries()).sort((a, b) => b[1] - a[1]);
  }, [prompts]);

  const filtered = useMemo(() => {
    let result = prompts;
    if (showFavorites) result = result.filter(p => p.isFavorite);
    if (activeCategory !== 'Все') result = result.filter(p => p.category === activeCategory);
    if (activeTag) result = result.filter(p => p.tags.includes(activeTag));
    if (search.trim()) {
      const q = search.toLowerCase().trim();
      result = result.filter(p =>
        p.title.toLowerCase().includes(q) ||
        p.content.toLowerCase().includes(q) ||
        p.tags.some(t => t.toLowerCase().includes(q)) ||
        p.category.toLowerCase().includes(q)
      );
    }
    switch (sortBy) {
      case 'newest': result = [...result].sort((a, b) => b.createdAt - a.createdAt); break;
      case 'oldest': result = [...result].sort((a, b) => a.createdAt - b.createdAt); break;
      case 'most-used': result = [...result].sort((a, b) => b.usageCount - a.usageCount); break;
      case 'alphabetical': result = [...result].sort((a, b) => a.title.localeCompare(b.title)); break;
      case 'recently-updated': result = [...result].sort((a, b) => b.updatedAt - a.updatedAt); break;
    }
    return result;
  }, [prompts, search, activeCategory, activeTag, showFavorites, sortBy]);

  // ─── Actions ───
  const modifyPrompts = useCallback((fn: (prev: Prompt[]) => Prompt[]) => {
    setPrompts(prev => {
      const next = fn(prev);
      debouncedSave(next);
      return next;
    });
  }, [debouncedSave]);

  const addPrompt = useCallback((p: Omit<Prompt, 'id' | 'createdAt' | 'updatedAt' | 'usageCount'>) => {
    const now = Date.now();
    modifyPrompts(prev => [...prev, { ...p, id: genId(), createdAt: now, updatedAt: now, usageCount: 0 }]);
  }, [modifyPrompts]);

  const updatePrompt = useCallback((id: string, updates: Partial<Prompt>) => {
    modifyPrompts(prev => prev.map(p => p.id === id ? { ...p, ...updates, updatedAt: Date.now() } : p));
  }, [modifyPrompts]);

  const deletePrompt = useCallback((id: string) => {
    modifyPrompts(prev => prev.filter(p => p.id !== id));
    setDeleteConfirm(null);
  }, [modifyPrompts]);

  const toggleFavorite = useCallback((id: string) => {
    modifyPrompts(prev => prev.map(p => p.id === id ? { ...p, isFavorite: !p.isFavorite } : p));
  }, [modifyPrompts]);

  const copyToClipboard = useCallback(async (prompt: Prompt, filledContent?: string) => {
    const text = filledContent ?? prompt.content;
    try {
      await navigator.clipboard.writeText(text);
    } catch {
      const ta = document.createElement('textarea');
      ta.value = text;
      document.body.appendChild(ta);
      ta.select();
      document.execCommand('copy');
      document.body.removeChild(ta);
    }
    setCopiedId(prompt.id);
    modifyPrompts(prev => prev.map(p => p.id === prompt.id ? { ...p, usageCount: p.usageCount + 1 } : p));
    setTimeout(() => setCopiedId(null), 1500);
  }, [modifyPrompts]);

  const handleCopyClick = useCallback((prompt: Prompt) => {
    const vars = extractVariables(prompt.content);
    if (vars.length > 0) {
      setVariablePrompt(prompt);
    } else {
      copyToClipboard(prompt);
    }
  }, [copyToClipboard]);

  const forceSync = useCallback(async () => {
    if (!tokenRef.current) return;
    setSyncStatus('syncing');
    try {
      const gistId = localStorage.getItem(LS_GIST_ID);
      if (gistId) {
        const data = await loadFromGist(tokenRef.current, gistId);
        if (data) {
          setPrompts(data.prompts);
          const encrypted = await encrypt(JSON.stringify(data), pin);
          localStorage.setItem(LS_ENCRYPTED_CACHE, encrypted);
          setSyncStatus('synced');
          setSyncMessage('Обновлено из облака');
          return;
        }
      }
      setSyncStatus('error');
      setSyncMessage('Не удалось загрузить');
    } catch {
      setSyncStatus('error');
      setSyncMessage('Ошибка синхронизации');
    }
  }, [pin]);

  const exportData = useCallback(() => {
    const data = JSON.stringify(prompts, null, 2);
    const blob = new Blob([data], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `promptvault-backup-${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    URL.revokeObjectURL(url);
  }, [prompts]);

  const importData = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => {
      try {
        const data = JSON.parse(ev.target?.result as string);
        if (Array.isArray(data)) {
          modifyPrompts(prev => {
            const existingIds = new Set(prev.map(p => p.id));
            const newPrompts = data.filter((p: Prompt) => !existingIds.has(p.id));
            return [...prev, ...newPrompts];
          });
          setShowImportExport(false);
        }
      } catch { /* invalid json */ }
    };
    reader.readAsText(file);
    if (fileInputRef.current) fileInputRef.current.value = '';
  }, [modifyPrompts]);

  // Stats
  const stats = useMemo(() => ({
    total: prompts.length,
    favorites: prompts.filter(p => p.isFavorite).length,
    totalUsage: prompts.reduce((s, p) => s + p.usageCount, 0),
  }), [prompts]);

  const sortLabels: Record<SortBy, string> = {
    newest: 'Сначала новые',
    oldest: 'Сначала старые',
    'most-used': 'Часто используемые',
    alphabetical: 'По алфавиту',
    'recently-updated': 'Недавно обновлённые',
  };

  const syncIcon = () => {
    switch (syncStatus) {
      case 'syncing': return <Loader2 className="h-4 w-4 animate-spin text-vault-400" />;
      case 'synced': return <Cloud className="h-4 w-4 text-emerald-400" />;
      case 'error': return <CloudOff className="h-4 w-4 text-red-400" />;
      case 'offline': return <CloudOff className="h-4 w-4 text-gray-600" />;
      default: return <Cloud className="h-4 w-4 text-gray-600" />;
    }
  };

  if (!dataLoaded) {
    return (
      <div className="min-h-screen bg-gray-950 flex items-center justify-center">
        <div className="text-center animate-fade-in">
          <Loader2 className="h-10 w-10 text-vault-500 animate-spin mx-auto mb-4" />
          <p className="text-gray-400">Расшифровка хранилища...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-950 text-gray-100 transition-colors duration-300">
      {/* Mobile sidebar overlay */}
      {sidebarOpen && (
        <div className="fixed inset-0 z-40 bg-black/50 md:hidden animate-overlay-in" onClick={() => setSidebarOpen(false)} />
      )}

      <div className="flex min-h-screen">
        {/* ═══════ SIDEBAR ═══════ */}
        <aside className={cn(
          'fixed md:sticky top-0 left-0 z-50 md:z-auto h-screen w-72 shrink-0 overflow-y-auto border-r transition-transform duration-300 bg-gray-900 border-gray-800',
          sidebarOpen ? 'translate-x-0' : '-translate-x-full md:translate-x-0'
        )}>
          <div className="p-5">
            {/* Logo */}
            <div className="flex items-center gap-3 mb-6">
              <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-to-br from-vault-500 to-vault-700 shadow-lg shadow-vault-500/25">
                <Sparkles className="h-5 w-5 text-white" />
              </div>
              <div>
                <h1 className="text-lg font-bold tracking-tight">PromptVault</h1>
                <p className="text-xs text-gray-500">🔒 Зашифровано</p>
              </div>
              <button onClick={() => setSidebarOpen(false)} className="ml-auto md:hidden p-1 rounded-lg hover:bg-gray-800">
                <X className="h-5 w-5" />
              </button>
            </div>

            {/* User & Sync */}
            <div className="flex items-center gap-2 mb-6 p-3 rounded-xl bg-gray-800/50">
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-1.5">
                  <Github className="h-3.5 w-3.5 text-gray-500" />
                  <span className="text-sm font-medium text-gray-300 truncate">@{githubUser || '...'}</span>
                </div>
                <div className="flex items-center gap-1.5 mt-0.5">
                  {syncIcon()}
                  <span className="text-[10px] text-gray-500">{syncMessage || (syncStatus === 'synced' ? 'Синхронизировано' : syncStatus === 'offline' ? 'Офлайн' : '')}</span>
                </div>
              </div>
              <button
                onClick={forceSync}
                disabled={syncStatus === 'syncing' || !tokenRef.current}
                className="p-2 rounded-lg hover:bg-gray-700 text-gray-500 hover:text-gray-300 transition-colors disabled:opacity-30"
                title="Обновить из облака"
              >
                <RefreshCw className={cn('h-4 w-4', syncStatus === 'syncing' && 'animate-spin')} />
              </button>
            </div>

            {/* Quick stats */}
            <div className="grid grid-cols-2 gap-2 mb-6 p-3 rounded-xl bg-gray-800/50">
              <div className="text-center">
                <div className="text-xl font-bold text-vault-500">{stats.total}</div>
                <div className="text-[10px] uppercase tracking-wider text-gray-500">промптов</div>
              </div>
              <div className="text-center">
                <div className="text-xl font-bold text-vault-500">{stats.totalUsage}</div>
                <div className="text-[10px] uppercase tracking-wider text-gray-500">копий</div>
              </div>
            </div>

            {/* New prompt button */}
            <button
              onClick={() => { setIsCreating(true); setEditingPrompt(null); setSidebarOpen(false); }}
              className="w-full flex items-center justify-center gap-2 py-2.5 px-4 rounded-xl bg-gradient-to-r from-vault-600 to-vault-700 text-white font-medium hover:from-vault-500 hover:to-vault-600 transition-all shadow-lg shadow-vault-600/25 active:scale-[0.98] mb-6"
            >
              <Plus className="h-4 w-4" />
              Новый промпт
            </button>

            {/* Favorites */}
            <button
              onClick={() => { setShowFavorites(!showFavorites); setActiveCategory('Все'); setActiveTag(null); setSidebarOpen(false); }}
              className={cn(
                'w-full flex items-center gap-3 px-3 py-2.5 rounded-xl mb-1 transition-all text-sm font-medium',
                showFavorites ? 'bg-amber-500/15 text-amber-500' : 'text-gray-400 hover:text-gray-200 hover:bg-gray-800'
              )}
            >
              <Heart className={cn('h-4 w-4', showFavorites && 'fill-current')} />
              Избранное
              {stats.favorites > 0 && (
                <span className={cn('ml-auto text-xs px-2 py-0.5 rounded-full', showFavorites ? 'bg-amber-500/20' : 'bg-gray-800 text-gray-500')}>
                  {stats.favorites}
                </span>
              )}
            </button>

            {/* All */}
            <button
              onClick={() => { setShowFavorites(false); setActiveCategory('Все'); setActiveTag(null); setSidebarOpen(false); }}
              className={cn(
                'w-full flex items-center gap-3 px-3 py-2.5 rounded-xl mb-4 transition-all text-sm font-medium',
                !showFavorites && activeCategory === 'Все' && !activeTag
                  ? 'bg-vault-500/15 text-vault-400'
                  : 'text-gray-400 hover:text-gray-200 hover:bg-gray-800'
              )}
            >
              <Layers className="h-4 w-4" />
              Все промпты
              <span className={cn('ml-auto text-xs px-2 py-0.5 rounded-full', !showFavorites && activeCategory === 'Все' && !activeTag ? 'bg-vault-500/20' : 'bg-gray-800 text-gray-500')}>
                {stats.total}
              </span>
            </button>

            {/* Categories */}
            <div className="mb-4">
              <h3 className="text-xs font-semibold uppercase tracking-wider mb-2 px-3 text-gray-600">Категории</h3>
              <div className="space-y-0.5">
                {categories.filter(c => c !== 'Все').map(cat => {
                  const count = prompts.filter(p => p.category === cat).length;
                  const isActive = !showFavorites && activeCategory === cat && !activeTag;
                  return (
                    <button
                      key={cat}
                      onClick={() => { setActiveCategory(cat); setShowFavorites(false); setActiveTag(null); setSidebarOpen(false); }}
                      className={cn(
                        'w-full flex items-center gap-3 px-3 py-2 rounded-xl transition-all text-sm',
                        isActive ? 'bg-vault-500/15 text-vault-400 font-medium' : 'text-gray-400 hover:text-gray-200 hover:bg-gray-800'
                      )}
                    >
                      <FolderOpen className="h-4 w-4" />
                      <span className="truncate">{cat}</span>
                      <span className={cn('ml-auto text-xs px-2 py-0.5 rounded-full', isActive ? 'bg-vault-500/20' : 'bg-gray-800 text-gray-500')}>{count}</span>
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Tags */}
            {allTags.length > 0 && (
              <div className="mb-4">
                <h3 className="text-xs font-semibold uppercase tracking-wider mb-2 px-3 text-gray-600">Теги</h3>
                <div className="flex flex-wrap gap-1.5 px-1">
                  {allTags.slice(0, 15).map(([tag, count]) => (
                    <button
                      key={tag}
                      onClick={() => { setActiveTag(activeTag === tag ? null : tag); setShowFavorites(false); setActiveCategory('Все'); setSidebarOpen(false); }}
                      className={cn(
                        'inline-flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs font-medium transition-all',
                        activeTag === tag
                          ? 'bg-vault-500/20 text-vault-400 ring-1 ring-vault-500/30'
                          : 'bg-gray-800 text-gray-400 hover:text-gray-200 hover:bg-gray-700'
                      )}
                    >
                      <Hash className="h-3 w-3" />{tag}
                      <span className="opacity-50">({count})</span>
                    </button>
                  ))}
                </div>
              </div>
            )}

            {/* Bottom actions */}
            <div className="border-t border-gray-800 pt-4 mt-4 space-y-0.5">
              <button
                onClick={() => setShowImportExport(true)}
                className="w-full flex items-center gap-3 px-3 py-2.5 rounded-xl transition-all text-sm text-gray-400 hover:text-gray-200 hover:bg-gray-800"
              >
                <Archive className="h-4 w-4" /> Импорт / Экспорт
              </button>
              <button
                onClick={() => setShowSettings(true)}
                className="w-full flex items-center gap-3 px-3 py-2.5 rounded-xl transition-all text-sm text-gray-400 hover:text-gray-200 hover:bg-gray-800"
              >
                <Settings className="h-4 w-4" /> Настройки
              </button>
              <button
                onClick={onLock}
                className="w-full flex items-center gap-3 px-3 py-2.5 rounded-xl transition-all text-sm text-gray-400 hover:text-red-400 hover:bg-red-500/10"
              >
                <LogOut className="h-4 w-4" /> Заблокировать
              </button>
            </div>
          </div>
        </aside>

        {/* ═══════ MAIN CONTENT ═══════ */}
        <main className="flex-1 min-w-0">
          {/* Top bar */}
          <header className="sticky top-0 z-30 border-b backdrop-blur-xl bg-gray-950/80 border-gray-800">
            <div className="flex items-center gap-3 px-4 md:px-6 py-3">
              <button onClick={() => setSidebarOpen(true)} className="md:hidden p-2 rounded-xl hover:bg-gray-800">
                <Menu className="h-5 w-5" />
              </button>

              {/* Search */}
              <div className="flex-1 flex items-center gap-2 px-4 py-2.5 rounded-xl max-w-xl bg-gray-900 border border-gray-800 focus-within:border-vault-600 transition-colors">
                <Search className="h-4 w-4 shrink-0 text-gray-500" />
                <input
                  type="text"
                  placeholder="Поиск по промптам, тегам..."
                  value={search}
                  onChange={e => setSearch(e.target.value)}
                  className="flex-1 bg-transparent outline-none text-sm placeholder:text-gray-500"
                />
                {search && (
                  <button onClick={() => setSearch('')} className="p-0.5 rounded hover:bg-gray-700">
                    <X className="h-3.5 w-3.5 text-gray-500" />
                  </button>
                )}
              </div>

              {/* Sort */}
              <div ref={sortRef} className="relative">
                <button
                  onClick={() => setShowSortMenu(!showSortMenu)}
                  className="flex items-center gap-2 px-3 py-2.5 rounded-xl text-sm hover:bg-gray-800 text-gray-400 transition-colors"
                >
                  <ArrowUpDown className="h-4 w-4" />
                  <span className="hidden sm:inline">{sortLabels[sortBy]}</span>
                  <ChevronDown className="h-3 w-3" />
                </button>
                {showSortMenu && (
                  <div className="absolute right-0 top-full mt-1 w-56 rounded-xl border shadow-xl py-1 z-50 animate-fade-in bg-gray-900 border-gray-700">
                    {(Object.entries(sortLabels) as [SortBy, string][]).map(([key, label]) => (
                      <button
                        key={key}
                        onClick={() => { setSortBy(key); setShowSortMenu(false); }}
                        className={cn(
                          'w-full text-left px-4 py-2.5 text-sm transition-colors',
                          sortBy === key ? 'text-vault-400 bg-vault-500/10' : 'text-gray-300 hover:bg-gray-800'
                        )}
                      >
                        {label}
                      </button>
                    ))}
                  </div>
                )}
              </div>

              {/* Sync indicator */}
              <button
                onClick={forceSync}
                disabled={syncStatus === 'syncing'}
                className="p-2.5 rounded-xl hover:bg-gray-800 transition-colors"
                title={syncMessage || 'Синхронизация'}
              >
                {syncIcon()}
              </button>
            </div>

            {/* Active filters */}
            {(showFavorites || activeCategory !== 'Все' || activeTag || search) && (
              <div className="flex items-center gap-2 px-4 md:px-6 pb-3 flex-wrap">
                <Filter className="h-3.5 w-3.5 text-gray-600" />
                {showFavorites && (
                  <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs font-medium bg-amber-500/15 text-amber-500">
                    <Heart className="h-3 w-3 fill-current" /> Избранное
                    <button onClick={() => setShowFavorites(false)} className="ml-1 hover:text-amber-300"><X className="h-3 w-3" /></button>
                  </span>
                )}
                {activeCategory !== 'Все' && (
                  <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs font-medium bg-vault-500/15 text-vault-400">
                    <FolderOpen className="h-3 w-3" /> {activeCategory}
                    <button onClick={() => setActiveCategory('Все')} className="ml-1 hover:text-vault-300"><X className="h-3 w-3" /></button>
                  </span>
                )}
                {activeTag && (
                  <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs font-medium bg-vault-500/15 text-vault-400">
                    <Hash className="h-3 w-3" /> {activeTag}
                    <button onClick={() => setActiveTag(null)} className="ml-1 hover:text-vault-300"><X className="h-3 w-3" /></button>
                  </span>
                )}
                {search && (
                  <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs font-medium bg-gray-800 text-gray-400">
                    <Search className="h-3 w-3" /> &quot;{search}&quot;
                    <button onClick={() => setSearch('')} className="ml-1"><X className="h-3 w-3" /></button>
                  </span>
                )}
                <span className="text-xs text-gray-600">{filtered.length} из {prompts.length}</span>
              </div>
            )}
          </header>

          {/* Content */}
          <div className="p-4 md:p-6">
            {filtered.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-20 animate-fade-in">
                <div className="h-20 w-20 rounded-2xl flex items-center justify-center mb-4 bg-gray-900">
                  <BookOpen className="h-10 w-10 text-gray-700" />
                </div>
                <h3 className="text-lg font-medium mb-1 text-gray-400">
                  {search || activeTag || activeCategory !== 'Все' || showFavorites ? 'Ничего не найдено' : 'Пока пусто'}
                </h3>
                <p className="text-sm mb-4 text-gray-600">
                  {search ? 'Попробуйте изменить поисковый запрос' : 'Создайте свой первый промпт'}
                </p>
                {!search && (
                  <button
                    onClick={() => { setIsCreating(true); setEditingPrompt(null); }}
                    className="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-vault-600 text-white font-medium hover:bg-vault-500 transition-colors"
                  >
                    <Plus className="h-4 w-4" /> Создать промпт
                  </button>
                )}
              </div>
            ) : (
              <div className="grid gap-4 grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4">
                {filtered.map((prompt, i) => (
                  <PromptCard
                    key={prompt.id}
                    prompt={prompt}
                    copiedId={copiedId}
                    deleteConfirm={deleteConfirm}
                    index={i}
                    onCopy={() => handleCopyClick(prompt)}
                    onEdit={() => { setEditingPrompt(prompt); setIsCreating(true); }}
                    onDelete={() => setDeleteConfirm(prompt.id)}
                    onDeleteConfirm={() => deletePrompt(prompt.id)}
                    onDeleteCancel={() => setDeleteConfirm(null)}
                    onToggleFavorite={() => toggleFavorite(prompt.id)}
                    onTagClick={(tag) => { setActiveTag(tag); setActiveCategory('Все'); setShowFavorites(false); }}
                  />
                ))}
              </div>
            )}
          </div>
        </main>
      </div>

      {/* ═══════ MODALS ═══════ */}
      {isCreating && (
        <PromptEditorModal
          prompt={editingPrompt}
          existingCategories={categories.filter(c => c !== 'Все')}
          onSave={(data) => {
            if (editingPrompt) updatePrompt(editingPrompt.id, data);
            else addPrompt(data as Omit<Prompt, 'id' | 'createdAt' | 'updatedAt' | 'usageCount'>);
            setIsCreating(false);
            setEditingPrompt(null);
          }}
          onClose={() => { setIsCreating(false); setEditingPrompt(null); }}
        />
      )}

      {variablePrompt && (
        <VariableFillModal
          prompt={variablePrompt}
          onCopy={(filled) => { copyToClipboard(variablePrompt, filled); setVariablePrompt(null); }}
          onClose={() => setVariablePrompt(null)}
        />
      )}

      {showImportExport && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 animate-overlay-in" onClick={() => setShowImportExport(false)}>
          <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" />
          <div className="relative w-full max-w-md rounded-2xl border p-6 animate-modal-in bg-gray-900 border-gray-700" onClick={e => e.stopPropagation()}>
            <h2 className="text-lg font-bold mb-4 flex items-center gap-2">
              <Archive className="h-5 w-5 text-vault-500" /> Импорт / Экспорт
            </h2>
            <div className="space-y-3">
              <button onClick={exportData} className="w-full flex items-center gap-3 p-4 rounded-xl border border-gray-700 hover:bg-gray-800 transition-colors">
                <Download className="h-5 w-5 text-vault-500" />
                <div className="text-left">
                  <div className="font-medium text-sm">Экспорт в JSON</div>
                  <div className="text-xs text-gray-500">Скачать все {prompts.length} промптов</div>
                </div>
              </button>
              <button onClick={() => fileInputRef.current?.click()} className="w-full flex items-center gap-3 p-4 rounded-xl border border-gray-700 hover:bg-gray-800 transition-colors">
                <Upload className="h-5 w-5 text-vault-500" />
                <div className="text-left">
                  <div className="font-medium text-sm">Импорт из JSON</div>
                  <div className="text-xs text-gray-500">Добавить промпты из файла</div>
                </div>
              </button>
              <input ref={fileInputRef} type="file" accept=".json" className="hidden" onChange={importData} />
            </div>
            <button onClick={() => setShowImportExport(false)} className="mt-4 w-full py-2.5 rounded-xl text-sm font-medium bg-gray-800 hover:bg-gray-700 text-gray-300 transition-colors">
              Закрыть
            </button>
          </div>
        </div>
      )}

      {showSettings && (
        <SettingsModal
          pin={pin}
          githubUser={githubUser}
          setGithubUser={setGithubUser}
          onClose={() => setShowSettings(false)}
          onLock={onLock}
        />
      )}
    </div>
  );
}

// ═══════════════════ PROMPT CARD ═══════════════════
interface PromptCardProps {
  prompt: Prompt;
  copiedId: string | null;
  deleteConfirm: string | null;
  index: number;
  onCopy: () => void;
  onEdit: () => void;
  onDelete: () => void;
  onDeleteConfirm: () => void;
  onDeleteCancel: () => void;
  onToggleFavorite: () => void;
  onTagClick: (tag: string) => void;
}

function PromptCard({ prompt, copiedId, deleteConfirm, index, onCopy, onEdit, onDelete, onDeleteConfirm, onDeleteCancel, onToggleFavorite, onTagClick }: PromptCardProps) {
  const isCopied = copiedId === prompt.id;
  const isDeleting = deleteConfirm === prompt.id;
  const vars = extractVariables(prompt.content);

  return (
    <div
      className={cn(
        'group relative rounded-2xl border transition-all duration-200 animate-fade-in bg-gray-900/80 border-gray-800 hover:border-gray-700 hover:bg-gray-900',
        isCopied && 'ring-2 ring-emerald-500/50'
      )}
      style={{ animationDelay: `${index * 30}ms`, animationFillMode: 'both' }}
    >
      <div className="p-4">
        <div className="flex items-start gap-2 mb-3">
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 mb-1">
              <h3 className="font-semibold text-sm truncate">{prompt.title}</h3>
              {prompt.isFavorite && <Star className="h-3.5 w-3.5 text-amber-500 fill-amber-500 shrink-0" />}
            </div>
            <div className="flex items-center gap-2 flex-wrap">
              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[11px] font-medium bg-vault-500/15 text-vault-400">
                <FolderOpen className="h-3 w-3" />{prompt.category}
              </span>
              {vars.length > 0 && (
                <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[11px] font-medium bg-purple-500/15 text-purple-400">
                  <Zap className="h-3 w-3" />{vars.length} перем.
                </span>
              )}
              <span className="inline-flex items-center gap-1 text-[11px] text-gray-600">
                <Clock className="h-3 w-3" />{timeAgo(prompt.updatedAt)}
              </span>
            </div>
          </div>
        </div>

        <div className="text-sm leading-relaxed mb-3 prompt-content line-clamp-4 text-gray-400">
          {prompt.content}
        </div>

        {prompt.tags.length > 0 && (
          <div className="flex flex-wrap gap-1.5 mb-3">
            {prompt.tags.map(tag => (
              <button
                key={tag}
                onClick={(e) => { e.stopPropagation(); onTagClick(tag); }}
                className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[11px] font-medium bg-gray-800 text-gray-500 hover:text-gray-300 hover:bg-gray-700 transition-colors"
              >
                <Hash className="h-2.5 w-2.5" />{tag}
              </button>
            ))}
          </div>
        )}

        <div className="flex items-center gap-1">
          <button
            onClick={onCopy}
            className={cn(
              'flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-all',
              isCopied ? 'bg-emerald-500/20 text-emerald-400' : 'bg-vault-500/15 text-vault-400 hover:bg-vault-500/25'
            )}
          >
            {isCopied ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}
            {isCopied ? 'Скопировано!' : vars.length > 0 ? 'Заполнить' : 'Копировать'}
          </button>

          {prompt.usageCount > 0 && (
            <span className="text-[11px] px-2 text-gray-600">{prompt.usageCount}×</span>
          )}

          <div className="flex-1" />

          <div className="flex items-center gap-0.5 md:opacity-0 md:group-hover:opacity-100 transition-opacity">
            <button onClick={onToggleFavorite} className={cn('p-1.5 rounded-lg transition-colors', prompt.isFavorite ? 'text-amber-500 hover:bg-amber-500/15' : 'text-gray-600 hover:text-gray-300 hover:bg-gray-800')} title={prompt.isFavorite ? 'Убрать из избранного' : 'В избранное'}>
              <Star className={cn('h-4 w-4', prompt.isFavorite && 'fill-current')} />
            </button>
            <button onClick={onEdit} className="p-1.5 rounded-lg text-gray-600 hover:text-gray-300 hover:bg-gray-800 transition-colors" title="Редактировать">
              <Edit3 className="h-4 w-4" />
            </button>
            {isDeleting ? (
              <div className="flex items-center gap-1 animate-fade-in">
                <button onClick={onDeleteConfirm} className="p-1.5 rounded-lg text-red-400 bg-red-500/15 hover:bg-red-500/25 transition-colors" title="Подтвердить"><Check className="h-4 w-4" /></button>
                <button onClick={onDeleteCancel} className="p-1.5 rounded-lg text-gray-500 hover:bg-gray-800 transition-colors" title="Отмена"><X className="h-4 w-4" /></button>
              </div>
            ) : (
              <button onClick={onDelete} className="p-1.5 rounded-lg text-gray-600 hover:text-red-400 hover:bg-red-500/15 transition-colors" title="Удалить">
                <Trash2 className="h-4 w-4" />
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

// ═══════════════════ EDITOR MODAL ═══════════════════
function PromptEditorModal({ prompt, existingCategories, onSave, onClose }: {
  prompt: Prompt | null;
  existingCategories: string[];
  onSave: (data: Partial<Prompt>) => void;
  onClose: () => void;
}) {
  const [title, setTitle] = useState(prompt?.title ?? '');
  const [content, setContent] = useState(prompt?.content ?? '');
  const [category, setCategory] = useState(prompt?.category ?? '');
  const [newCategory, setNewCategory] = useState('');
  const [showNewCategory, setShowNewCategory] = useState(false);
  const [tagsInput, setTagsInput] = useState(prompt?.tags.join(', ') ?? '');
  const [isFavorite, setIsFavorite] = useState(prompt?.isFavorite ?? false);

  const vars = extractVariables(content);

  const handleSave = () => {
    if (!title.trim() || !content.trim()) return;
    const finalCategory = showNewCategory && newCategory.trim() ? newCategory.trim() : (category || 'Без категории');
    const tags = tagsInput.split(',').map(t => t.trim()).filter(Boolean);
    onSave({ title: title.trim(), content: content.trim(), category: finalCategory, tags, isFavorite });
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 animate-overlay-in" onClick={onClose}>
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" />
      <div className="relative w-full max-w-2xl max-h-[90vh] overflow-y-auto rounded-2xl border animate-modal-in bg-gray-900 border-gray-700" onClick={e => e.stopPropagation()}>
        <div className="p-6">
          <div className="flex items-center justify-between mb-6">
            <h2 className="text-xl font-bold flex items-center gap-2">
              <FileText className="h-5 w-5 text-vault-500" />
              {prompt ? 'Редактировать промпт' : 'Новый промпт'}
            </h2>
            <button onClick={onClose} className="p-2 rounded-xl hover:bg-gray-800 transition-colors"><X className="h-5 w-5" /></button>
          </div>

          <div className="mb-4">
            <label className="block text-sm font-medium mb-1.5 text-gray-300">Название</label>
            <input type="text" value={title} onChange={e => setTitle(e.target.value)} placeholder="Например: Рефакторинг кода"
              className="w-full px-4 py-2.5 rounded-xl border text-sm outline-none bg-gray-800 border-gray-700 focus:border-vault-600 placeholder:text-gray-600 transition-colors" />
          </div>

          <div className="mb-4">
            <label className="block text-sm font-medium mb-1.5 text-gray-300">
              Промпт
              {vars.length > 0 && <span className="ml-2 text-xs font-normal text-purple-400">Переменные: {vars.map(v => `{{${v}}}`).join(', ')}</span>}
            </label>
            <textarea value={content} onChange={e => setContent(e.target.value)}
              placeholder={'Напишите ваш промпт...\n\nИспользуйте {{переменная}} для шаблонных переменных'}
              rows={10}
              className="w-full px-4 py-3 rounded-xl border text-sm outline-none resize-y font-mono leading-relaxed bg-gray-800 border-gray-700 focus:border-vault-600 placeholder:text-gray-600 transition-colors" />
          </div>

          <div className="mb-4">
            <label className="block text-sm font-medium mb-1.5 text-gray-300">Категория</label>
            {!showNewCategory ? (
              <div className="flex gap-2">
                <select value={category} onChange={e => setCategory(e.target.value)}
                  className="flex-1 px-4 py-2.5 rounded-xl border text-sm outline-none appearance-none bg-gray-800 border-gray-700 focus:border-vault-600 transition-colors">
                  <option value="">Выберите категорию...</option>
                  {existingCategories.map(c => <option key={c} value={c}>{c}</option>)}
                </select>
                <button onClick={() => setShowNewCategory(true)} className="px-3 py-2.5 rounded-xl border border-gray-700 hover:bg-gray-800 text-gray-400 transition-colors">
                  <Plus className="h-4 w-4" />
                </button>
              </div>
            ) : (
              <div className="flex gap-2">
                <input type="text" value={newCategory} onChange={e => setNewCategory(e.target.value)} placeholder="Новая категория..." autoFocus
                  className="flex-1 px-4 py-2.5 rounded-xl border text-sm outline-none bg-gray-800 border-gray-700 focus:border-vault-600 placeholder:text-gray-600 transition-colors" />
                <button onClick={() => { setShowNewCategory(false); setNewCategory(''); }} className="px-3 py-2.5 rounded-xl border border-gray-700 hover:bg-gray-800 text-gray-400 transition-colors">
                  <X className="h-4 w-4" />
                </button>
              </div>
            )}
          </div>

          <div className="mb-4">
            <label className="block text-sm font-medium mb-1.5 text-gray-300">
              Теги <span className="text-xs font-normal text-gray-600">(через запятую)</span>
            </label>
            <input type="text" value={tagsInput} onChange={e => setTagsInput(e.target.value)} placeholder="код, рефакторинг, python"
              className="w-full px-4 py-2.5 rounded-xl border text-sm outline-none bg-gray-800 border-gray-700 focus:border-vault-600 placeholder:text-gray-600 transition-colors" />
          </div>

          <label className="flex items-center gap-3 mb-6 px-4 py-3 rounded-xl cursor-pointer bg-gray-800/50 hover:bg-gray-800 transition-colors">
            <input type="checkbox" checked={isFavorite} onChange={e => setIsFavorite(e.target.checked)} className="sr-only" />
            <div className={cn('h-5 w-5 rounded-md border-2 flex items-center justify-center transition-colors', isFavorite ? 'bg-amber-500 border-amber-500' : 'border-gray-600')}>
              {isFavorite && <Check className="h-3 w-3 text-white" />}
            </div>
            <Star className={cn('h-4 w-4', isFavorite ? 'text-amber-500 fill-amber-500' : 'text-gray-500')} />
            <span className="text-sm">Добавить в избранное</span>
          </label>

          <div className="flex gap-3">
            <button onClick={onClose} className="flex-1 py-2.5 rounded-xl text-sm font-medium bg-gray-800 hover:bg-gray-700 text-gray-300 transition-colors">Отмена</button>
            <button onClick={handleSave} disabled={!title.trim() || !content.trim()}
              className={cn('flex-1 py-2.5 rounded-xl text-sm font-medium text-white transition-all',
                title.trim() && content.trim()
                  ? 'bg-gradient-to-r from-vault-600 to-vault-700 hover:from-vault-500 hover:to-vault-600 shadow-lg shadow-vault-600/25'
                  : 'bg-gray-700 cursor-not-allowed opacity-50'
              )}>
              {prompt ? 'Сохранить' : 'Создать'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

// ═══════════════════ VARIABLE FILL MODAL ═══════════════════
function VariableFillModal({ prompt, onCopy, onClose }: {
  prompt: Prompt;
  onCopy: (filledContent: string) => void;
  onClose: () => void;
}) {
  const vars = extractVariables(prompt.content);
  const [values, setValues] = useState<Record<string, string>>(() => {
    const init: Record<string, string> = {};
    vars.forEach(v => { init[v] = ''; });
    return init;
  });

  const preview = useMemo(() => {
    let text = prompt.content;
    Object.entries(values).forEach(([key, val]) => {
      text = text.replace(new RegExp(`\\{\\{${key.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\}\\}`, 'g'), val || `{{${key}}}`);
    });
    return text;
  }, [prompt.content, values]);

  const allFilled = vars.every(v => values[v]?.trim());

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 animate-overlay-in" onClick={onClose}>
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" />
      <div className="relative w-full max-w-2xl max-h-[90vh] overflow-y-auto rounded-2xl border animate-modal-in bg-gray-900 border-gray-700" onClick={e => e.stopPropagation()}>
        <div className="p-6">
          <div className="flex items-center justify-between mb-6">
            <h2 className="text-xl font-bold flex items-center gap-2">
              <Zap className="h-5 w-5 text-purple-400" /> Заполнить переменные
            </h2>
            <button onClick={onClose} className="p-2 rounded-xl hover:bg-gray-800 transition-colors"><X className="h-5 w-5" /></button>
          </div>

          <p className="text-sm mb-4 text-gray-400">
            Заполните переменные в промпте <strong>&quot;{prompt.title}&quot;</strong>
          </p>

          <div className="space-y-3 mb-6">
            {vars.map((v, i) => (
              <div key={v}>
                <label className="block text-sm font-medium mb-1 text-gray-300">
                  <span className="text-purple-400">{'{{'}</span>{v}<span className="text-purple-400">{'}}'}</span>
                </label>
                <input type="text" value={values[v]} onChange={e => setValues(prev => ({ ...prev, [v]: e.target.value }))}
                  placeholder={`Введите значение для "${v}"...`} autoFocus={i === 0}
                  className="w-full px-4 py-2.5 rounded-xl border text-sm outline-none bg-gray-800 border-gray-700 focus:border-purple-600 placeholder:text-gray-600 transition-colors" />
              </div>
            ))}
          </div>

          <div className="mb-6">
            <label className="block text-sm font-medium mb-1.5 text-gray-300">Предпросмотр</label>
            <div className="p-4 rounded-xl border text-sm leading-relaxed prompt-content max-h-48 overflow-y-auto font-mono bg-gray-800/50 border-gray-700 text-gray-300">
              {preview}
            </div>
          </div>

          <div className="flex gap-3">
            <button onClick={onClose} className="flex-1 py-2.5 rounded-xl text-sm font-medium bg-gray-800 hover:bg-gray-700 text-gray-300 transition-colors">Отмена</button>
            <button onClick={() => onCopy(preview)}
              className="flex-1 flex items-center justify-center gap-2 py-2.5 rounded-xl text-sm font-medium text-white bg-gradient-to-r from-purple-600 to-vault-600 hover:from-purple-500 hover:to-vault-500 transition-all shadow-lg shadow-purple-600/25">
              <Copy className="h-4 w-4" />
              {allFilled ? 'Скопировать' : 'Скопировать как есть'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

// ═══════════════════ SETTINGS MODAL ═══════════════════
function SettingsModal({ pin, githubUser, setGithubUser, onClose, onLock }: {
  pin: string;
  githubUser: string;
  setGithubUser: (u: string) => void;
  onClose: () => void;
  onLock: () => void;
}) {
  const [newToken, setNewToken] = useState('');
  const [showToken, setShowToken] = useState(false);
  const [tokenStatus, setTokenStatus] = useState<'idle' | 'checking' | 'success' | 'error'>('idle');
  const [tokenMessage, setTokenMessage] = useState('');

  const handleUpdateToken = async () => {
    if (!newToken.trim()) return;
    setTokenStatus('checking');
    const validation = await validateToken(newToken.trim());
    if (!validation.valid) {
      setTokenStatus('error');
      setTokenMessage('Невалидный токен');
      return;
    }
    try {
      const encryptedToken = await encrypt(newToken.trim(), pin);
      localStorage.setItem(LS_ENCRYPTED_TOKEN, encryptedToken);
      if (validation.username) {
        localStorage.setItem(LS_USERNAME, validation.username);
        setGithubUser(validation.username);
      }
      setTokenStatus('success');
      setTokenMessage(`Подключён как @${validation.username}`);
      setNewToken('');
    } catch {
      setTokenStatus('error');
      setTokenMessage('Ошибка шифрования');
    }
  };

  const handleFullReset = () => {
    if (confirm('Удалить ВСЕ данные? Промпты в Gist останутся, но локальный доступ будет утерян.')) {
      localStorage.removeItem(LS_PIN_VERIFIER);
      localStorage.removeItem(LS_ENCRYPTED_TOKEN);
      localStorage.removeItem(LS_ENCRYPTED_CACHE);
      localStorage.removeItem(LS_GIST_ID);
      localStorage.removeItem(LS_USERNAME);
      onLock();
      window.location.reload();
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 animate-overlay-in" onClick={onClose}>
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" />
      <div className="relative w-full max-w-md max-h-[90vh] overflow-y-auto rounded-2xl border animate-modal-in bg-gray-900 border-gray-700" onClick={e => e.stopPropagation()}>
        <div className="p-6">
          <div className="flex items-center justify-between mb-6">
            <h2 className="text-xl font-bold flex items-center gap-2">
              <Settings className="h-5 w-5 text-vault-500" /> Настройки
            </h2>
            <button onClick={onClose} className="p-2 rounded-xl hover:bg-gray-800 transition-colors"><X className="h-5 w-5" /></button>
          </div>

          {/* Security info */}
          <div className="mb-6 p-4 rounded-xl bg-gray-800/50 border border-gray-800">
            <h3 className="text-sm font-semibold mb-3 flex items-center gap-2">
              <Shield className="h-4 w-4 text-vault-400" /> Безопасность
            </h3>
            <div className="space-y-2 text-sm text-gray-400">
              <div className="flex items-center gap-2">
                <ShieldCheck className="h-4 w-4 text-emerald-400 shrink-0" />
                <span>Шифрование: <span className="text-gray-300">AES-256-GCM</span></span>
              </div>
              <div className="flex items-center gap-2">
                <ShieldCheck className="h-4 w-4 text-emerald-400 shrink-0" />
                <span>Ключ: <span className="text-gray-300">PBKDF2 (100,000 итераций)</span></span>
              </div>
              <div className="flex items-center gap-2">
                <Github className="h-4 w-4 text-gray-500 shrink-0" />
                <span>Аккаунт: <span className="text-vault-400">@{githubUser || 'не подключён'}</span></span>
              </div>
            </div>
          </div>

          {/* Update token */}
          <div className="mb-6">
            <h3 className="text-sm font-semibold mb-2 text-gray-300">Обновить GitHub Token</h3>
            <div className="flex gap-2">
              <div className="relative flex-1">
                <input
                  type={showToken ? 'text' : 'password'}
                  value={newToken}
                  onChange={e => { setNewToken(e.target.value); setTokenStatus('idle'); }}
                  placeholder="ghp_..."
                  className="w-full bg-gray-800 border border-gray-700 rounded-xl px-3 py-2.5 text-sm font-mono text-white placeholder:text-gray-600 outline-none focus:border-vault-600 transition-colors pr-9"
                />
                <button onClick={() => setShowToken(!showToken)} className="absolute right-2.5 top-1/2 -translate-y-1/2 text-gray-600 hover:text-gray-400">
                  {showToken ? <EyeOff className="h-3.5 w-3.5" /> : <Eye className="h-3.5 w-3.5" />}
                </button>
              </div>
              <button onClick={handleUpdateToken} disabled={!newToken.trim() || tokenStatus === 'checking'}
                className="px-4 py-2.5 rounded-xl bg-vault-600 hover:bg-vault-500 text-white text-sm font-medium transition-colors disabled:opacity-50">
                {tokenStatus === 'checking' ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Обновить'}
              </button>
            </div>
            {tokenMessage && (
              <p className={cn('text-xs mt-2', tokenStatus === 'error' ? 'text-red-400' : 'text-emerald-400')}>
                {tokenMessage}
              </p>
            )}
          </div>

          {/* Danger zone */}
          <div className="border-t border-gray-800 pt-4">
            <h3 className="text-sm font-semibold mb-2 text-red-400 flex items-center gap-2">
              <AlertTriangle className="h-4 w-4" /> Опасная зона
            </h3>
            <button onClick={handleFullReset}
              className="w-full py-2.5 rounded-xl text-sm font-medium border border-red-900/50 text-red-400 hover:bg-red-500/10 transition-colors">
              Сбросить всё (удалить локальные данные)
            </button>
            <p className="text-[11px] text-gray-600 mt-2">
              Промпты в GitHub Gist останутся. При повторной настройке с тем же токеном — данные восстановятся.
            </p>
          </div>

          <button onClick={onClose} className="mt-4 w-full py-2.5 rounded-xl text-sm font-medium bg-gray-800 hover:bg-gray-700 text-gray-300 transition-colors">
            Закрыть
          </button>
        </div>
      </div>
    </div>
  );
}
