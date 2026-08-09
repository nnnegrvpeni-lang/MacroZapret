import { useState, useEffect, useRef } from 'react';

declare global {
  interface Window {
    electronAPI: {
      checkZapretVersion: () => Promise<{ current: string; latest: string; downloadUrl?: string; updateAvailable: boolean; error?: string }>;
      downloadZapret: () => Promise<{ success: boolean; version?: string; error?: string }>;
      getStrategies: () => Promise<string[]>;
      startStrategy: (strategyName: string) => Promise<{ success: boolean; mode?: string; error?: string }>;
      stopStrategy: () => Promise<{ success: boolean }>;
      getStatus: () => Promise<{ status: 'stopped' | 'starting' | 'running' | 'stopping'; strategy: string }>;
      getListContent: (listName: string) => Promise<string>;
      saveListContent: (listName: string, content: string) => Promise<{ success: boolean; error?: string }>;
      getSettings: () => Promise<any>;
      saveSettings: (settings: any) => Promise<{ success: boolean; error?: string }>;
      checkAdminPrivileges: () => Promise<boolean>;
      onLog: (callback: (msg: string) => void) => () => void;
      onSettingsUpdated: (callback: (settings: any) => void) => () => void;
      testStrategy: (strategyName: string) => Promise<{ success: boolean; working: boolean; youtube: boolean; discord: boolean; error?: string }>;

      // App Auto-Updater (GitHub Releases)
      getAppVersion?: () => Promise<string>;
      checkAppUpdate?: () => Promise<{ updateAvailable?: boolean; version?: string; error?: string }>;
      downloadAppUpdate?: () => void;
      installAppUpdate?: () => void;
      onAppUpdateAvailable?: (callback: (info: { version: string; releaseNotes?: string }) => void) => () => void;
      onAppUpdateProgress?: (callback: (percent: number) => void) => () => void;
      onAppUpdateDownloaded?: (callback: () => void) => () => void;
      onAppUpdateError?: (callback: (err: string) => void) => () => void;
    };
  }
}

type View = 'dashboard' | 'lists' | 'checker' | 'logs' | 'customization' | 'settings';
type ListName = 'list-general-user.txt' | 'list-exclude-user.txt' | 'list-general.txt' | 'list-exclude.txt';

export default function App() {
  const [activeView, setActiveView] = useState<View>('dashboard');
  
  // Status and Strategies
  const [zapretStatus, setZapretStatus] = useState<'stopped' | 'starting' | 'running' | 'stopping'>('stopped');
  const [strategies, setStrategies] = useState<string[]>([]);
  const [selectedStrategy, setSelectedStrategy] = useState<string>('');
  const [logs, setLogs] = useState<string>('');
  const [isAdmin, setIsAdmin] = useState<boolean>(true);
  
  // Custom dropdowns states
  const [isDropdownOpen, setIsDropdownOpen] = useState<boolean>(false);
  const [isAutostartDropdownOpen, setIsAutostartDropdownOpen] = useState<boolean>(false);

  // Lists
  const [activeList, setActiveList] = useState<ListName>('list-general-user.txt');
  const [listContent, setListContent] = useState<string>('');
  const [isSavingList, setIsSavingList] = useState<boolean>(false);
  const [saveStatus, setSaveStatus] = useState<'success' | 'error' | null>(null);
  const [saveMessage, setSaveMessage] = useState<string>('');
  
  // Settings & Versioning
  const [settings, setSettings] = useState({
    autostart: 'none',
    autostartStrategy: '',
    lastUsedStrategy: '',
    zapretVersion: 'none',
    closeToTray: true
  });
  
  const [versionInfo, setVersionInfo] = useState<{
    current: string;
    latest: string;
    updateAvailable: boolean;
  } | null>(null);
  
  const [isCheckingVersion, setIsCheckingVersion] = useState(false);
  const [isUpdating, setIsUpdating] = useState(false);
  const [isAutoInstalling, setIsAutoInstalling] = useState<boolean>(false);
  const [isLoadingSettings, setIsLoadingSettings] = useState<boolean>(true);

  // Strategy testing states
  const [testResults, setTestResults] = useState<Record<string, {
    status: 'untested' | 'testing' | 'working' | 'failed' | 'error';
    youtube?: boolean;
    discord?: boolean;
    error?: string;
  }>>({});
  const [isTestingAll, setIsTestingAll] = useState(false);

  // App Auto-Updater state
  const [appVersion, setAppVersion] = useState<string>('1.0.0');
  const [appUpdateVersion, setAppUpdateVersion] = useState<string>('');
  const [appUpdateProgress, setAppUpdateProgress] = useState<number>(0);
  const [appUpdateStatus, setAppUpdateStatus] = useState<'idle' | 'available' | 'downloading' | 'downloaded' | 'error'>('idle');
  const [appUpdateError, setAppUpdateError] = useState<string>('');
  const [isCheckingAppUpdate, setIsCheckingAppUpdate] = useState<boolean>(false);

  // Log console states
  const [logFilter, setLogFilter] = useState<'all' | 'error' | 'success'>('all');
  const [logSearchQuery, setLogSearchQuery] = useState<string>('');
  const [autoScrollLogs, setAutoScrollLogs] = useState<boolean>(true);
  const [copiedLogs, setCopiedLogs] = useState<boolean>(false);

  // MacroSortirovka Customization Theme state
  const defaultColors = {
    primary: '#3b82f6',
    bgApp: '#070a13',
    bgSidebar: '#0b0f19',
    bgCard: '#161e34',
    textMain: '#f3f4f6'
  };

  const [themeColors, setThemeColors] = useState(() => {
    try {
      const saved = localStorage.getItem('macrozapret_theme');
      return saved ? JSON.parse(saved) : defaultColors;
    } catch {
      return defaultColors;
    }
  });

  const [activePreset, setActivePreset] = useState<string>('space');
  const [enableGlow, setEnableGlow] = useState<boolean>(true);
  const [showAmbientOrbs, setShowAmbientOrbs] = useState<boolean>(true);
  const [themeSavedToast, setThemeSavedToast] = useState<boolean>(false);

  // Apply theme to CSS Root variables
  useEffect(() => {
    const root = document.documentElement;
    root.style.setProperty('--primary', themeColors.primary);
    root.style.setProperty('--bg-app', themeColors.bgApp);
    root.style.setProperty('--bg-sidebar', themeColors.bgSidebar);
    root.style.setProperty('--bg-card', themeColors.bgCard);
    root.style.setProperty('--text-main', themeColors.textMain);

    const hexToRgb = (hex: string) => {
      const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
      return result ? `${parseInt(result[1], 16)}, ${parseInt(result[2], 16)}, ${parseInt(result[3], 16)}` : '59, 130, 246';
    };
    const rgb = hexToRgb(themeColors.primary);
    root.style.setProperty('--primary-rgb', rgb);
    root.style.setProperty('--primary-glow', `rgba(${rgb}, 0.25)`);

    localStorage.setItem('macrozapret_theme', JSON.stringify(themeColors));
  }, [themeColors]);

  const presets = {
    space: { primary: '#3b82f6', bgApp: '#070a13', bgSidebar: '#0b0f19', bgCard: '#161e34', textMain: '#f3f4f6' },
    emerald: { primary: '#10b981', bgApp: '#051510', bgSidebar: '#082119', bgCard: '#0d3326', textMain: '#f3f4f6' },
    purple: { primary: '#8b5cf6', bgApp: '#0b0714', bgSidebar: '#120b21', bgCard: '#1c1233', textMain: '#f3f4f6' },
    amber: { primary: '#f59e0b', bgApp: '#140d05', bgSidebar: '#1f1408', bgCard: '#33220c', textMain: '#f3f4f6' },
    crimson: { primary: '#ef4444', bgApp: '#140507', bgSidebar: '#21080b', bgCard: '#330d12', textMain: '#f3f4f6' },
  };

  const handleApplyPreset = (presetKey: keyof typeof presets) => {
    setActivePreset(presetKey);
    setThemeColors(presets[presetKey]);
  };

  const consoleRef = useRef<HTMLDivElement>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);
  const autostartDropdownRef = useRef<HTMLDivElement>(null);

  // Auto install function
  const triggerAutoInstall = async () => {
    setIsUpdating(true);
    setLogs('Подключение к GitHub...\n');
    try {
      const res = await window.electronAPI.downloadZapret();
      if (res.success) {
        setLogs((prev) => prev + '\n=== Ядро успешно установлено! ===\n');
        const loaded = await window.electronAPI.getSettings();
        setSettings(loaded);
        await loadStrategies(loaded.zapretVersion, loaded.lastUsedStrategy);
        await checkVersion();
        setTimeout(() => {
          setIsAutoInstalling(false);
        }, 1500);
      } else {
        setLogs((prev) => prev + `\n❌ Ошибка установки: ${res.error}\n`);
      }
    } catch (e: any) {
      setLogs((prev) => prev + `\n❌ Исключение: ${e.message}\n`);
    } finally {
      setIsUpdating(false);
    }
  };

  // Initialize
  useEffect(() => {
    window.electronAPI.checkAdminPrivileges().then(setIsAdmin);

    window.electronAPI.getSettings().then(async (loaded) => {
      setSettings(loaded);
      
      // Load strategies and check if folders exist
      await loadStrategies(loaded.zapretVersion, loaded.lastUsedStrategy);
      
      if (loaded.zapretVersion === 'none') {
        setIsAutoInstalling(true);
        setIsLoadingSettings(false);
        await triggerAutoInstall();
      } else {
        setIsLoadingSettings(false);
        
        // Auto check for updates on startup
        try {
          const res = await window.electronAPI.checkZapretVersion();
          if (!res.error) {
            setVersionInfo({
              current: res.current,
              latest: res.latest,
              updateAvailable: res.updateAvailable
            });
            
            if (res.updateAvailable) {
              // Trigger auto-update
              setIsAutoInstalling(true);
              setIsUpdating(true);
              setLogs(`Обнаружено новое ядро Zapret: ${res.latest} (текущее: ${res.current}).\nЗапускаем автоматическое обновление...\n`);
              
              const updateRes = await window.electronAPI.downloadZapret();
              if (updateRes.success) {
                setLogs((prev) => prev + '\n=== Ядро успешно обновлено! ===\n');
                const newLoaded = await window.electronAPI.getSettings();
                setSettings(newLoaded);
                await loadStrategies(newLoaded.zapretVersion, newLoaded.lastUsedStrategy);
                setVersionInfo({
                  current: updateRes.version || newLoaded.zapretVersion,
                  latest: updateRes.version || newLoaded.zapretVersion,
                  updateAvailable: false
                });
              } else {
                setLogs((prev) => prev + `\n❌ Ошибка автообновления: ${updateRes.error}\n`);
              }
              setIsUpdating(false);
              setTimeout(() => {
                setIsAutoInstalling(false);
              }, 1500);
            }
          }
        } catch (err) {
          console.error('Auto-update check failed:', err);
        }
      }
    });

    checkVersion();

    const unsubscribe = window.electronAPI.onLog((msg) => {
      setLogs((prev) => prev + msg);
    });

    const unsubscribeSettings = window.electronAPI.onSettingsUpdated((newSettings) => {
      setSettings(newSettings);
    });

    const interval = setInterval(async () => {
      const res = await window.electronAPI.getStatus();
      setZapretStatus(res.status);
      if (res.status === 'running' && res.strategy) {
        setSelectedStrategy(prev => prev !== res.strategy ? res.strategy : prev);
      }
    }, 1500);

    // App Auto-Updater listeners
    if (window.electronAPI.getAppVersion) {
      window.electronAPI.getAppVersion().then(v => {
        if (v) setAppVersion(v);
      });
    }

    let unsubAvailable: (() => void) | undefined;
    let unsubProgress: (() => void) | undefined;
    let unsubDownloaded: (() => void) | undefined;
    let unsubError: (() => void) | undefined;

    if (window.electronAPI.onAppUpdateAvailable) {
      unsubAvailable = window.electronAPI.onAppUpdateAvailable((info) => {
        setAppUpdateVersion(info.version);
        setAppUpdateStatus('available');
      });
      unsubProgress = window.electronAPI.onAppUpdateProgress?.((percent) => {
        setAppUpdateProgress(percent);
        setAppUpdateStatus('downloading');
      });
      unsubDownloaded = window.electronAPI.onAppUpdateDownloaded?.(() => {
        setAppUpdateStatus('downloaded');
      });
      unsubError = window.electronAPI.onAppUpdateError?.((err) => {
        setAppUpdateStatus('error');
        setAppUpdateError(err);
      });
    }

    return () => {
      unsubscribe();
      unsubscribeSettings();
      clearInterval(interval);
      unsubAvailable?.();
      unsubProgress?.();
      unsubDownloaded?.();
      unsubError?.();
    };
  }, []);

  // Close custom dropdowns on clicking outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setIsDropdownOpen(false);
      }
      if (autostartDropdownRef.current && !autostartDropdownRef.current.contains(event.target as Node)) {
        setIsAutostartDropdownOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  // Smart auto-scroll for terminal logs
  useEffect(() => {
    if (!autoScrollLogs) return;
    const el = consoleRef.current;
    if (el) {
      const isNearBottom = el.scrollHeight - el.scrollTop - el.clientHeight < 140;
      if (isNearBottom || logs === '' || logs.split('\n').length <= 2) {
        el.scrollTop = el.scrollHeight;
      }
    }
  }, [logs, autoScrollLogs]);

  // Log line color classifier
  const getLogLineClass = (text: string) => {
    if (text.includes('❌') || text.includes('Error') || text.includes('Ошибка') || text.includes('failed')) return 'log-line-error';
    if (text.includes('===') || text.includes('успешно') || text.includes('Successfully') || text.includes('complete')) return 'log-line-success';
    if (text.includes('⚠️') || text.includes('Внимание') || text.includes('Warning')) return 'log-line-warning';
    if (text.includes('Starting strategy') || text.includes('Проверяем') || text.includes('Подключение') || text.includes('Checking')) return 'log-line-info';
    return 'log-line-default';
  };

  const handleCopyLogs = () => {
    navigator.clipboard.writeText(logs);
    setCopiedLogs(true);
    setTimeout(() => setCopiedLogs(false), 2000);
  };


  // Load strategies
  const loadStrategies = async (_version?: string, lastUsed?: string) => {
    const list = await window.electronAPI.getStrategies();
    setStrategies(list);
    
    // If no strategies exist, trigger download (even if settings.zapretVersion says installed)
    if (list.length === 0) {
      setIsAutoInstalling(true);
      triggerAutoInstall();
      return;
    }
    
    if (list.length > 0 && !selectedStrategy) {
      const active = lastUsed || settings.lastUsedStrategy;
      setSelectedStrategy(active && list.includes(active) ? active : list[0]);
    }
  };

  // App Auto-Update Actions
  const handleCheckAppUpdate = async () => {
    if (!window.electronAPI.checkAppUpdate) return;
    setIsCheckingAppUpdate(true);
    setAppUpdateError('');
    try {
      const res = await window.electronAPI.checkAppUpdate();
      if (res.updateAvailable && res.version) {
        setAppUpdateVersion(res.version);
        setAppUpdateStatus('available');
      } else if (res.error) {
        setAppUpdateError(res.error);
      } else {
        setAppUpdateStatus('idle');
      }
    } catch (e: any) {
      setAppUpdateError(e.message || 'Ошибка проверки обновления');
    } finally {
      setIsCheckingAppUpdate(false);
    }
  };

  const handleDownloadAppUpdate = () => {
    setAppUpdateStatus('downloading');
    setAppUpdateProgress(0);
    window.electronAPI.downloadAppUpdate?.();
  };

  const handleInstallAppUpdate = () => {
    window.electronAPI.installAppUpdate?.();
  };

  // Check Zapret Version
  const checkVersion = async () => {
    setIsCheckingVersion(true);
    try {
      const res = await window.electronAPI.checkZapretVersion();
      if (!res.error) {
        setVersionInfo({
          current: res.current,
          latest: res.latest,
          updateAvailable: res.updateAvailable
        });
      }
    } catch (e) {
      console.error(e);
    } finally {
      setIsCheckingVersion(false);
    }
  };

  // Perform Update / Initial Install
  const handleUpdate = async () => {
    if (isUpdating) return;
    setIsUpdating(true);
    setLogs((prev) => prev + '\n=== Запуск обновления zapret ===\n');
    try {
      const res = await window.electronAPI.downloadZapret();
      if (res.success) {
        setLogs((prev) => prev + '\n=== Обновление успешно завершено! ===\n');
        const loaded = await window.electronAPI.getSettings();
        setSettings(loaded);
        await loadStrategies();
        await checkVersion();
      } else {
        setLogs((prev) => prev + `\n❌ Ошибка обновления: ${res.error}\n`);
      }
    } catch (e: any) {
      setLogs((prev) => prev + `\n❌ Исключение: ${e.message}\n`);
    } finally {
      setIsUpdating(false);
    }
  };

  // Start strategy
  const handleStart = async (stratName?: string) => {
    const targetStrat = stratName || selectedStrategy;
    if (!targetStrat) return;
    setLogs('');
    setZapretStatus('starting');
    try {
      const res = await window.electronAPI.startStrategy(targetStrat);
      if (!res.success) {
        setLogs(`❌ Ошибка запуска: ${res.error}\n`);
        setZapretStatus('stopped');
      }
    } catch (err: any) {
      setLogs(`❌ Ошибка запуска: ${err.message}\n`);
      setZapretStatus('stopped');
    }
  };

  // Stop strategy
  const handleStop = async () => {
    setZapretStatus('stopping');
    await window.electronAPI.stopStrategy();
    setZapretStatus('stopped');
  };

  // Switch strategy on the fly
  const handleStrategyChange = async (strat: string) => {
    setSelectedStrategy(strat);
    setIsDropdownOpen(false);
    
    if (zapretStatus === 'running') {
      setZapretStatus('stopping');
      await window.electronAPI.stopStrategy();
      await handleStart(strat);
    }
  };

  // Load list content
  useEffect(() => {
    if (activeView === 'lists') {
      window.electronAPI.getListContent(activeList).then(setListContent);
    }
  }, [activeList, activeView]);

  // Save list content
  const handleSaveList = async () => {
    setIsSavingList(true);
    setSaveStatus(null);
    setSaveMessage('');
    try {
      const res = await window.electronAPI.saveListContent(activeList, listContent);
      if (res.success) {
        setSaveStatus('success');
        setSaveMessage('Список успешно сохранен!');
        setTimeout(() => {
          setSaveStatus(null);
          setSaveMessage('');
        }, 3000);
      } else {
        setSaveStatus('error');
        setSaveMessage(`Ошибка: ${res.error}`);
      }
    } catch (err: any) {
      setSaveStatus('error');
      setSaveMessage(`Ошибка: ${err.message}`);
    } finally {
      setIsSavingList(false);
    }
  };

  const handleSaveSettings = async (updatedSettings: Partial<typeof settings>) => {
    const newSettings = { ...settings, ...updatedSettings };
    setSettings(newSettings);
    await window.electronAPI.saveSettings(newSettings);
  };

  // Test a single strategy
  const handleTestStrategy = async (strat: string) => {
    setTestResults(prev => ({
      ...prev,
      [strat]: { status: 'testing' }
    }));
    
    try {
      const res = await window.electronAPI.testStrategy(strat);
      if (res.success) {
        setTestResults(prev => ({
          ...prev,
          [strat]: {
            status: res.working ? 'working' : 'failed',
            youtube: res.youtube,
            discord: res.discord
          }
        }));
        return res.working;
      } else {
        setTestResults(prev => ({
          ...prev,
          [strat]: { status: 'error', error: res.error }
        }));
        return false;
      }
    } catch (err: any) {
      setTestResults(prev => ({
        ...prev,
        [strat]: { status: 'error', error: err.message }
      }));
      return false;
    }
  };

  // Test all strategies sequentially
  const handleTestAll = async () => {
    if (isTestingAll) return;
    setIsTestingAll(true);
    
    // Reset all results
    const initialResults: typeof testResults = {};
    strategies.forEach(strat => {
      initialResults[strat] = { status: 'untested' };
    });
    setTestResults(initialResults);

    for (const strat of strategies) {
      await handleTestStrategy(strat);
    }
    
    setIsTestingAll(false);
  };

  // SVG Geometric Shield Logo
  const BrandLogo = () => (
    <svg className="brand-logo-svg" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
      <path d="M12 22C12 22 20 18 20 12V5L12 2L4 5V12C4 18 12 22 12 22Z" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
      <path d="M12 8V16" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
      <path d="M8 12H16" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
    </svg>
  );

  if (isLoadingSettings) {
    return (
      <div className="installer-screen">
        <div className="installer-card" style={{ padding: '30px' }}>
          <div className="brand" style={{ marginBottom: '0' }}>
            <BrandLogo />
            <span className="brand-title" style={{ fontSize: '1.25rem' }}>MacroZapret</span>
          </div>
          <div className="spinner-container" style={{ width: '48px', height: '48px', marginTop: '12px' }}>
            <div className="spinner-ring" style={{ width: '36px', height: '36px' }}></div>
          </div>
        </div>
      </div>
    );
  }

  if (isAutoInstalling) {
    return (
      <div className="installer-screen">
        <div className="installer-card">
          <div className="brand" style={{ marginBottom: '4px' }}>
            <BrandLogo />
            <span className="brand-title" style={{ fontSize: '1.25rem' }}>MacroZapret</span>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '6px', width: '100%' }}>
            <div className="installer-title">Первоначальная настройка</div>
            <div className="installer-desc">
              Скачиваем и подготавливаем файлы обхода. Это займет несколько секунд, пожалуйста, не закрывайте приложение.
            </div>
          </div>
          <div className="spinner-container">
            <div className="spinner-ring"></div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="app-container" id="main_layout">
      {/* Ambient Aurora Background Orbs */}
      {showAmbientOrbs && (
        <div className="ambient-bg">
          <div className="aurora-orb aurora-orb-1" style={{ background: `radial-gradient(circle, ${themeColors.primary} 0%, #6366f1 100%)` }}></div>
          <div className="aurora-orb aurora-orb-2"></div>
        </div>
      )}

      {/* Sidebar Navigation */}
      <nav className="sidebar" id="sidebar_menu">
        <div className="brand" id="brand_header">
          <BrandLogo />
          <span className="brand-title">MacroZapret</span>
        </div>
        
        <ul className="nav-menu" id="nav_links">
          <li 
            id="nav_dashboard"
            className={`nav-item ${activeView === 'dashboard' ? 'active' : ''}`}
            onClick={() => setActiveView('dashboard')}
          >
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <rect x="3" y="3" width="7" height="7" />
              <rect x="14" y="3" width="7" height="7" />
              <rect x="14" y="14" width="7" height="7" />
              <rect x="3" y="14" width="7" height="7" />
            </svg>
            Панель управления
          </li>
          <li 
            id="nav_lists"
            className={`nav-item ${activeView === 'lists' ? 'active' : ''}`}
            onClick={() => setActiveView('lists')}
          >
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <line x1="8" y1="6" x2="21" y2="6" />
              <line x1="8" y1="12" x2="21" y2="12" />
              <line x1="8" y1="18" x2="21" y2="18" />
              <line x1="3" y1="6" x2="3.01" y2="6" />
              <line x1="3" y1="12" x2="3.01" y2="12" />
              <line x1="3" y1="18" x2="3.01" y2="18" />
            </svg>
            Редактор списков
          </li>
          <li 
            id="nav_checker"
            className={`nav-item ${activeView === 'checker' ? 'active' : ''}`}
            onClick={() => setActiveView('checker')}
          >
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14" />
              <polyline points="22 4 12 14.01 9 11.01" />
            </svg>
            Проверка режимов
          </li>
          <li 
            id="nav_logs"
            className={`nav-item ${activeView === 'logs' ? 'active' : ''}`}
            onClick={() => setActiveView('logs')}
          >
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <polyline points="4 17 10 11 4 5" />
              <line x1="12" y1="19" x2="20" y2="19" />
            </svg>
            Консоль логов
          </li>
          <li 
            id="nav_customization"
            className={`nav-item ${activeView === 'customization' ? 'active' : ''}`}
            onClick={() => setActiveView('customization')}
          >
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M12 22C17.5228 22 22 17.5228 22 12C22 9.273 20.9 6.802 19.122 5C17.2 3.12 14.73 2 12 2C6.47715 2 2 6.47715 2 12C2 14.725 3.12 17.2 5 19.122C6.802 20.9 9.273 22 12 22Z"></path>
              <circle cx="7.5" cy="10.5" r="1.5" fill="currentColor"></circle>
              <circle cx="11.5" cy="7.5" r="1.5" fill="currentColor"></circle>
              <circle cx="16.5" cy="9.5" r="1.5" fill="currentColor"></circle>
              <circle cx="15.5" cy="14.5" r="1.5" fill="currentColor"></circle>
            </svg>
            Кастомизация
          </li>
          <li 
            id="nav_settings"
            className={`nav-item ${activeView === 'settings' ? 'active' : ''}`}
            onClick={() => setActiveView('settings')}
          >
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <circle cx="12" cy="12" r="3" />
              <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" />
            </svg>
            Настройки
          </li>
        </ul>

        <div className="sidebar-footer" id="sidebar_foot">
          {!isAdmin && (
            <div className="admin-warning" style={{ fontSize: '0.7rem', padding: '6px', margin: '0 0 8px 0', display: 'flex', alignItems: 'center' }}>
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ width: '12px', height: '12px', marginRight: '6px', flexShrink: 0, color: '#ef4444' }}><path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"></path><line x1="12" y1="9" x2="12" y2="13"></line><line x1="12" y1="17" x2="12.01" y2="17"></line></svg>
              <span>Нет прав Администратора.</span>
            </div>
          )}
          <div className="version-info">
            <span>Клиент:</span>
            <span className="version-badge" id="app_ver_badge">v{appVersion}</span>
          </div>
          <div className="version-info" style={{ marginTop: '2px' }}>
            <span>Ядро:</span>
            <span className="version-badge" id="zapret_ver_badge">{settings.zapretVersion}</span>
          </div>
        </div>
      </nav>

      {/* Main Content Area */}
      <main className="main-content" id="main_container">
        
        {/* VIEW 1: DASHBOARD */}
        {activeView === 'dashboard' && (
          <>
            <header className="header" id="dashboard_header_section" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '32px' }}>
              <h1 className="page-title">Панель управления</h1>

              {/* COMPACT UPDATE BADGE IN HEADER */}
              {appUpdateStatus !== 'idle' && (
                <div className="app-update-compact-banner">
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" style={{ width: '16px', height: '16px', color: '#60a5fa' }}>
                      <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
                      <polyline points="7 10 12 15 17 10" />
                      <line x1="12" y1="15" x2="12" y2="3" />
                    </svg>
                    <span style={{ fontSize: '0.82rem', fontWeight: 600, color: '#fff' }} title={appUpdateError}>
                      {appUpdateStatus === 'available' && `Доступно обновление v${appUpdateVersion}`}
                      {appUpdateStatus === 'downloading' && `Загрузка... ${appUpdateProgress}%`}
                      {appUpdateStatus === 'downloaded' && `Версия v${appUpdateVersion} готова!`}
                      {appUpdateStatus === 'error' && (appUpdateError ? `Ошибка: ${appUpdateError}` : `Ошибка обновления`)}
                    </span>
                  </div>

                  <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                    {appUpdateStatus === 'available' && (
                      <button className="btn-primary" onClick={handleDownloadAppUpdate} style={{ padding: '5px 12px', fontSize: '0.78rem' }}>
                        Обновить
                      </button>
                    )}
                    {appUpdateStatus === 'downloaded' && (
                      <button className="btn-primary" onClick={handleInstallAppUpdate} style={{ padding: '5px 12px', fontSize: '0.78rem', background: 'var(--success)' }}>
                        Перезапустить
                      </button>
                    )}
                    <button 
                      className="btn-secondary" 
                      onClick={() => setAppUpdateStatus('idle')} 
                      style={{ padding: '5px', borderRadius: '6px', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
                      title="Закрыть"
                    >
                      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" style={{ width: '12px', height: '12px' }}>
                        <line x1="18" y1="6" x2="6" y2="18"></line>
                        <line x1="6" y1="6" x2="18" y2="18"></line>
                      </svg>
                    </button>
                  </div>
                </div>
              )}
            </header>

            {!isAdmin && (
              <div className="admin-warning" id="admin_privilege_alert" style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ width: '18px', height: '18px', flexShrink: 0, color: '#f59e0b' }}>
                  <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"></path>
                  <line x1="12" y1="9" x2="12" y2="13"></line>
                  <line x1="12" y1="17" x2="12.01" y2="17"></line>
                </svg>
                <span>Внимание: Приложение запущено без прав администратора. WinDivert требует административные привилегии для установки драйвера перехвата пакетов. Пожалуйста, перезапустите MacroZapret от имени Администратора.</span>
              </div>
            )}

            <div className="hero-dashboard-container" id="dashboard_grid_layout">
              {/* Main Hero Card: Power Switch & Strategy Dropdown */}
              <section className="hero-status-card">
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', width: '100%' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '0.75rem', fontWeight: 600, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '1px' }}>
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" style={{ width: '14px', height: '14px', color: '#60a5fa' }}><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/></svg>
                    Фильтр трафика WinDivert
                  </div>
                  <div className={`status-badge ${zapretStatus}`} id="status_text_badge">
                    <span className="status-badge-dot"></span>
                    {zapretStatus === 'running' && 'Обход активен'}
                    {zapretStatus === 'stopped' && 'Выключен'}
                    {zapretStatus === 'starting' && 'Подключение...'}
                    {zapretStatus === 'stopping' && 'Отключение...'}
                  </div>
                </div>

                {/* Animated Power Button Container */}
                <div className="power-btn-container">
                  <button 
                    id="toggle_zapret_btn"
                    className={`power-btn ${zapretStatus}`}
                    onClick={zapretStatus === 'running' ? handleStop : () => handleStart()}
                    disabled={zapretStatus === 'starting' || zapretStatus === 'stopping'}
                    title={zapretStatus === 'running' ? 'Отключить обход' : 'Включить обход'}
                  >
                    <svg viewBox="0 0 24 24">
                      <path d="M18.36 6.64a9 9 0 1 1-12.73 0M12 2v10" strokeLinecap="round" strokeLinejoin="round"/>
                    </svg>
                  </button>

                  {/* Pulsating Ripple Rings for running state */}
                  {enableGlow && (
                    <>
                      <div className="power-ripple-ring"></div>
                      <div className="power-ripple-ring"></div>
                      <div className="power-ripple-ring"></div>
                    </>
                  )}

                  {/* Rotating Arc Ring for starting/stopping state */}
                  <div className="power-spin-ring"></div>
                </div>

                {/* Strategy Selector Dropdown */}
                <div ref={dropdownRef} className="control-group" style={{ maxWidth: '100%' }}>
                  <label className="form-label" htmlFor="strategy_select" style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '0.8rem', color: 'var(--text-secondary)', marginBottom: '6px' }}>
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" style={{ width: '14px', height: '14px', color: '#fbbf24' }}><polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"></polygon></svg>
                    Активный режим обхода (батник)
                  </label>
                  <div 
                    className={`custom-select-trigger ${isDropdownOpen ? 'open' : ''}`}
                    onClick={() => setIsDropdownOpen(!isDropdownOpen)}
                    style={{ cursor: 'pointer', padding: '12px 18px', background: 'rgba(8, 10, 15, 0.7)', border: '1px solid rgba(255, 255, 255, 0.08)', borderRadius: '12px' }}
                  >
                    <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                      <span style={{ fontSize: '0.9rem', fontWeight: 600, color: '#fff' }}>{selectedStrategy || 'Режимы не найдены'}</span>
                    </div>
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="6 9 12 15 18 9"></polyline></svg>
                  </div>
                  {isDropdownOpen && strategies.length > 0 && (
                    <div className="custom-select-menu">
                      {strategies.map((strat) => (
                        <div 
                          key={strat} 
                          className={`custom-select-option ${selectedStrategy === strat ? 'selected' : ''}`}
                          onClick={() => handleStrategyChange(strat)}
                        >
                          {strat}
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </section>

              {/* Quick Info Grid below Hero Card */}
              <div className="dashboard-stats-grid">
                <div className="dashboard-stat-card">
                  <div className="dashboard-stat-icon">
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" style={{ width: '18px', height: '18px' }}><path d="M22 12h-4l-3 9L9 3l-3 9H2"/></svg>
                  </div>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '2px' }}>
                    <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.5px', fontWeight: 600 }}>Драйвер перехвата</div>
                    <div style={{ fontSize: '0.85rem', fontWeight: 600, color: '#fff' }}>WinDivert64.sys</div>
                  </div>
                </div>

                <div className="dashboard-stat-card">
                  <div className="dashboard-stat-icon" style={{ background: isAdmin ? 'rgba(16, 185, 129, 0.12)' : 'rgba(239, 68, 68, 0.12)', borderColor: isAdmin ? 'rgba(16, 185, 129, 0.2)' : 'rgba(239, 68, 68, 0.2)', color: isAdmin ? '#34d399' : '#f87171' }}>
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" style={{ width: '18px', height: '18px' }}><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/></svg>
                  </div>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '2px' }}>
                    <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.5px', fontWeight: 600 }}>Права доступа</div>
                    <div style={{ fontSize: '0.85rem', fontWeight: 600, color: '#fff' }}>{isAdmin ? 'Администратор' : 'Обычные (Ограничено)'}</div>
                  </div>
                </div>
              </div>
            </div>
          </>
        )}

        {/* VIEW 2: LISTS EDITOR */}
        {activeView === 'lists' && (
          <>
            <header className="header" id="lists_header_section">
              <h1 className="page-title">Редактор списков</h1>
            </header>

            <div className="lists-layout" id="lists_layout_container">
              <aside className="lists-sidebar" id="lists_sidebar_menu">
                <button 
                  id="tab_list_general_user"
                  className={`list-tab-btn ${activeList === 'list-general-user.txt' ? 'active' : ''}`}
                  onClick={() => setActiveList('list-general-user.txt')}
                >
                  Мой обход (Домены)
                </button>
                <button 
                  id="tab_list_exclude_user"
                  className={`list-tab-btn ${activeList === 'list-exclude-user.txt' ? 'active' : ''}`}
                  onClick={() => setActiveList('list-exclude-user.txt')}
                >
                  Мои Исключения
                </button>
                <button 
                  id="tab_list_general"
                  className={`list-tab-btn ${activeList === 'list-general.txt' ? 'active' : ''}`}
                  onClick={() => setActiveList('list-general.txt')}
                >
                  Общий обход (Системный)
                </button>
                <button 
                  id="tab_list_exclude"
                  className={`list-tab-btn ${activeList === 'list-exclude.txt' ? 'active' : ''}`}
                  onClick={() => setActiveList('list-exclude.txt')}
                >
                  Исключения (Системные)
                </button>
              </aside>

              <section className="editor-container" id="editor_box" style={{ display: 'flex', flexDirection: 'column' }}>
                <div className="panel-header" style={{ marginBottom: '16px' }}>
                  <span>
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" style={{ marginRight: '6px', width: '14px', height: '14px' }}><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 1 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>
                    Редактирование {activeList}
                  </span>
                  <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>
                    Один домен на строку
                  </span>
                </div>

                <textarea 
                  id="list_editor_textarea"
                  className="list-textarea"
                  value={listContent}
                  onChange={(e) => setListContent(e.target.value)}
                  placeholder="# Добавьте домены сюда, например:&#13;youtube.com&#13;discord.com"
                />

                <div style={{ display: 'flex', justifyContent: 'flex-end', alignItems: 'center', gap: '16px', marginTop: '16px' }}>
                  {saveMessage && (
                    <span style={{ 
                      fontSize: '0.85rem', 
                      color: saveStatus === 'success' ? 'var(--success)' : 'var(--danger)',
                      transition: 'all 0.2s ease',
                      fontWeight: '500',
                      display: 'flex',
                      alignItems: 'center',
                      gap: '4px'
                    }}>
                      {saveStatus === 'success' ? (
                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" style={{ width: '14px', height: '14px', color: 'var(--success)' }}><polyline points="20 6 9 17 4 12"></polyline></svg>
                      ) : (
                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ width: '14px', height: '14px', color: 'var(--danger)' }}><path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"></path><line x1="12" y1="9" x2="12" y2="13"></line><line x1="12" y1="17" x2="12.01" y2="17"></line></svg>
                      )}
                      {saveMessage}
                    </span>
                  )}
                  <button 
                    id="save_list_btn"
                    className="btn-primary" 
                    onClick={handleSaveList}
                    disabled={isSavingList}
                  >
                    {isSavingList ? 'Сохранение...' : 'Сохранить изменения'}
                  </button>
                </div>
              </section>
            </div>
          </>
        )}

        {/* VIEW 3: SETTINGS */}
        {activeView === 'settings' && (
          <>
            <header className="header" id="settings_header_section">
              <h1 className="page-title">Настройки</h1>
            </header>

            <div className="settings-container" id="settings_scroll_area">
              {/* Card 0: App Auto-Update (GitHub Releases) */}
              <section className="settings-card" id="app_update_settings_card">
                <h2 className="settings-title" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                  <span>Обновление приложения MacroZapret</span>
                  <span className="version-badge" style={{ fontSize: '0.75rem', padding: '3px 8px' }}>v{appVersion}</span>
                </h2>
                
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '20px' }}>
                  <div style={{ flex: 1 }}>
                    <div style={{ fontSize: '0.85rem', fontWeight: '500', color: '#fff', marginBottom: '4px' }}>
                      Клиент MacroZapret (GitHub Releases)
                    </div>
                    <div style={{ fontSize: '0.75rem', color: 'var(--text-secondary)' }}>
                      {appUpdateStatus === 'available' ? (
                        <span style={{ color: '#60a5fa', fontWeight: 600 }}>Вышла новая версия v{appUpdateVersion}!</span>
                      ) : appUpdateStatus === 'downloaded' ? (
                        <span style={{ color: 'var(--success)', fontWeight: 600 }}>Новая версия v{appUpdateVersion} скачана!</span>
                      ) : (
                        `Текущая версия программы: v${appVersion}. Обновления выкладываются на GitHub и скачиваются в один клик.`
                      )}
                    </div>
                  </div>
                  
                  <div style={{ display: 'flex', gap: '8px' }}>
                    <button 
                      className="btn-secondary" 
                      onClick={handleCheckAppUpdate}
                      disabled={isCheckingAppUpdate}
                    >
                      {isCheckingAppUpdate ? 'Проверка...' : 'Проверить на GitHub'}
                    </button>
                    {appUpdateStatus === 'available' && (
                      <button className="btn-primary" onClick={handleDownloadAppUpdate}>
                        Скачать обновление
                      </button>
                    )}
                    {appUpdateStatus === 'downloaded' && (
                      <button className="btn-primary" onClick={handleInstallAppUpdate} style={{ background: 'var(--success)' }}>
                        Установить и перезапустить
                      </button>
                    )}
                  </div>
                </div>
              </section>

              {/* Card 1: Auto-Update Zapret Core */}
              <section className="settings-card" id="update_settings_card">
                <h2 className="settings-title">Версия ядра</h2>
                
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '20px' }}>
                  <div style={{ flex: 1 }}>
                    <div style={{ fontSize: '0.85rem', fontWeight: '500', color: '#fff', marginBottom: '4px' }}>Управление файлами обхода</div>
                    <div style={{ fontSize: '0.75rem', color: 'var(--text-secondary)' }}>
                      {versionInfo ? (
                        versionInfo.updateAvailable ? (
                          <span style={{ color: 'var(--warning)' }}>Доступна новая версия: {versionInfo.latest} (локальная: {versionInfo.current || 'отсутствует'})</span>
                        ) : (
                          <span style={{ color: 'var(--success)' }}>Установлена последняя версия: {versionInfo.current}</span>
                        )
                      ) : 'Проверка наличия обновлений...'}
                    </div>
                  </div>
                  
                  <div style={{ display: 'flex', gap: '8px' }}>
                    <button 
                      id="check_version_btn"
                      className="btn-secondary" 
                      onClick={checkVersion}
                      disabled={isCheckingVersion || isUpdating}
                    >
                      {isCheckingVersion ? 'Синхронизация...' : 'Проверить новые'}
                    </button>
                    <button 
                      id="update_zapret_btn"
                      className="btn-primary" 
                      onClick={handleUpdate}
                      disabled={isUpdating}
                    >
                      {isUpdating ? 'Загрузка...' : 'Обновить / Скачать'}
                    </button>
                  </div>
                </div>

                {isUpdating && (
                  <div className="console-output" style={{ maxHeight: '140px', marginTop: '16px' }}>
                    {logs}
                  </div>
                )}
              </section>

              {/* Card 2: Autostart Configuration */}
              <section className="settings-card" id="autostart_settings_card">
                <h2 className="settings-title">Автозапуск приложения</h2>

                <div className="radio-group" id="autostart_options_group">
                  <label className="radio-option">
                    <input 
                      id="autostart_opt_none"
                      type="radio" 
                      name="autostart" 
                      className="radio-input"
                      checked={settings.autostart === 'none'}
                      onChange={() => handleSaveSettings({ autostart: 'none' })}
                    />
                    <div className="radio-label-container">
                      <span className="radio-label">Не запускать автоматически</span>
                      <span className="radio-desc">Приложение не будет запускаться при старте Windows.</span>
                    </div>
                  </label>

                  <label className="radio-option">
                    <input 
                      id="autostart_opt_app_only"
                      type="radio" 
                      name="autostart" 
                      className="radio-input"
                      checked={settings.autostart === 'app_only'}
                      onChange={() => handleSaveSettings({ autostart: 'app_only' })}
                    />
                    <div className="radio-label-container">
                      <span className="radio-label">Только запустить приложение (без подключения)</span>
                      <span className="radio-desc">MacroZapret запустится в фоне при включении компьютера, но не будет включать обход.</span>
                    </div>
                  </label>

                  <label className="radio-option">
                    <input 
                      id="autostart_opt_strategy"
                      type="radio" 
                      name="autostart" 
                      className="radio-input"
                      checked={settings.autostart === 'strategy'}
                      onChange={() => handleSaveSettings({ autostart: 'strategy' })}
                    />
                    <div className="radio-label-container">
                      <span className="radio-label">Запустить и включить выбранный режим обхода</span>
                      <span className="radio-desc">MacroZapret запустится и автоматически включит выбранную ниже стратегию.</span>
                    </div>
                  </label>
                </div>

                {settings.autostart === 'strategy' && (
                  <div ref={autostartDropdownRef} className="form-field" style={{ marginTop: '16px', position: 'relative' }} id="autostart_strategy_select_field">
                    <label className="form-label" htmlFor="autostart_strategy_select">Выберите стратегию для автозапуска</label>
                    
                    {/* CUSTOM AUTOSTART DROPDOWN */}
                    <div 
                      className={`custom-select-trigger ${isAutostartDropdownOpen ? 'open' : ''}`}
                      onClick={() => setIsAutostartDropdownOpen(!isAutostartDropdownOpen)}
                      style={{ marginTop: '6px' }}
                    >
                      <span>
                        {settings.autostartStrategy === 'last_used' 
                          ? 'Последний использованный режим' 
                          : settings.autostartStrategy || 'Выберите стратегию...'}
                      </span>
                      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="6 9 12 15 18 9"></polyline></svg>
                    </div>
                    {isAutostartDropdownOpen && (
                      <div className="custom-select-menu">
                        <div 
                          className={`custom-select-option ${settings.autostartStrategy === 'last_used' ? 'selected' : ''}`}
                          onClick={() => {
                            handleSaveSettings({ autostartStrategy: 'last_used' });
                            setIsAutostartDropdownOpen(false);
                          }}
                        >
                          Последний использованный режим
                        </div>
                        {strategies.map((strat) => (
                          <div 
                            key={strat} 
                            className={`custom-select-option ${settings.autostartStrategy === strat ? 'selected' : ''}`}
                            onClick={() => {
                              handleSaveSettings({ autostartStrategy: strat });
                              setIsAutostartDropdownOpen(false);
                            }}
                          >
                            {strat}
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                )}
              </section>

              {/* Card 3: Close Behavior Configuration */}
              <section className="settings-card" id="close_settings_card">
                <h2 className="settings-title">При закрытии окна</h2>

                <div className="radio-group" id="close_options_group">
                  <label className="radio-option">
                    <input 
                      id="close_opt_tray"
                      type="radio" 
                      name="closeToTray" 
                      className="radio-input"
                      checked={settings.closeToTray === true}
                      onChange={() => handleSaveSettings({ closeToTray: true })}
                    />
                    <div className="radio-label-container">
                      <span className="radio-label">Сворачивать в системный трей</span>
                      <span className="radio-desc">Приложение продолжит работать в фоновом режиме в системном трее.</span>
                    </div>
                  </label>

                  <label className="radio-option">
                    <input 
                      id="close_opt_quit"
                      type="radio" 
                      name="closeToTray" 
                      className="radio-input"
                      checked={settings.closeToTray === false}
                      onChange={() => handleSaveSettings({ closeToTray: false })}
                    />
                    <div className="radio-label-container">
                      <span className="radio-label">Закрывать приложение полностью</span>
                      <span className="radio-desc">Приложение и все процессы обхода будут полностью завершены.</span>
                    </div>
                  </label>
                </div>
              </section>
            </div>
          </>
        )}

        {/* VIEW 4: STRATEGY CHECKER */}
        {activeView === 'checker' && (
          <>
            <header className="header" id="checker_header_section">
              <h1 className="page-title">Проверка режимов обхода</h1>
            </header>

            <div className="settings-container" id="checker_container" style={{ maxWidth: '780px' }}>
              <section className="settings-card" id="checker_card">
                <h2 className="settings-title">Статус работоспособности батников</h2>
                
                <p style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', marginBottom: '20px', lineHeight: '1.5' }}>
                  Этот инструмент позволяет автоматически протестировать каждый файл обхода. 
                  При запуске проверки приложение по очереди включит каждый режим обхода и проверит доступность сайтов YouTube и Discord по безопасному протоколу HTTPS.
                  <br />
                  <strong style={{ color: 'var(--warning)' }}>Обратите внимание:</strong> во время тестирования текущее соединение будет временно перезапускаться. Прежний режим восстановится автоматически после завершения проверки.
                </p>

                <div style={{ marginBottom: '24px' }}>
                  <button 
                    className="btn-primary" 
                    onClick={handleTestAll} 
                    disabled={isTestingAll || strategies.length === 0}
                    style={{ width: '100%', maxWidth: '280px' }}
                  >
                    {isTestingAll ? 'Идет тестирование...' : 'Запустить полную проверку'}
                  </button>
                </div>

                <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                  {strategies.map((strat) => {
                    const result = testResults[strat] || { status: 'untested' };
                    return (
                      <div 
                        key={strat} 
                        style={{ 
                          display: 'flex', 
                          alignItems: 'center', 
                          justifyContent: 'space-between', 
                          background: 'rgba(255, 255, 255, 0.02)', 
                          border: '1px solid var(--border-color)', 
                          borderRadius: 'var(--radius-md)', 
                          padding: '12px 18px' 
                        }}
                      >
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                          <span style={{ fontSize: '0.85rem', fontWeight: '500', color: '#fff' }}>{strat}</span>
                          {result.status === 'working' && (
                            <span style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', display: 'flex', alignItems: 'center', gap: '4px', flexWrap: 'wrap' }}>
                              Доступность: YouTube 
                              {result.youtube ? (
                                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" style={{ width: '12px', height: '12px', color: 'var(--success)' }}><polyline points="20 6 9 17 4 12"></polyline></svg>
                              ) : (
                                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" style={{ width: '12px', height: '12px', color: 'var(--danger)' }}><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>
                              )}
                              , Discord 
                              {result.discord ? (
                                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" style={{ width: '12px', height: '12px', color: 'var(--success)' }}><polyline points="20 6 9 17 4 12"></polyline></svg>
                              ) : (
                                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" style={{ width: '12px', height: '12px', color: 'var(--danger)' }}><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>
                              )}
                            </span>
                          )}
                        </div>

                        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                          {result.status === 'untested' && (
                            <span className="status-badge stopped" style={{ textTransform: 'none', fontSize: '0.7rem' }}>Не проверен</span>
                          )}
                          {result.status === 'testing' && (
                            <span className="status-badge starting" style={{ textTransform: 'none', fontSize: '0.7rem' }}>Проверяется...</span>
                          )}
                          {result.status === 'working' && (
                            <span className="status-badge running" style={{ textTransform: 'none', fontSize: '0.7rem', background: 'var(--success-glow)', color: 'var(--success)' }}>Работает</span>
                          )}
                          {result.status === 'failed' && (
                            <span className="status-badge stopping" style={{ textTransform: 'none', fontSize: '0.7rem', background: 'rgba(239, 68, 68, 0.1)', color: 'var(--danger)' }}>Не работает</span>
                          )}
                          {result.status === 'error' && (
                            <span className="status-badge stopping" style={{ textTransform: 'none', fontSize: '0.7rem' }} title={result.error}>Ошибка</span>
                          )}
                          
                          <button 
                            className="btn-secondary" 
                            style={{ padding: '6px 12px', fontSize: '0.75rem' }}
                            onClick={() => handleTestStrategy(strat)}
                            disabled={isTestingAll || result.status === 'testing'}
                          >
                            Проверить
                          </button>
                        </div>
                      </div>
                    );
                  })}
                  {strategies.length === 0 && (
                    <div style={{ textAlign: 'center', padding: '30px', color: 'var(--text-muted)', fontSize: '0.85rem' }}>
                      Режимы обхода не найдены.
                    </div>
                  )}
                </div>
              </section>
            </div>
          </>
        )}

        {/* VIEW 5: LOGS CONSOLE */}
        {activeView === 'logs' && (
          <>
            <header className="header" id="logs_header_section" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '20px' }}>
              <div>
                <h1 className="page-title">Консоль логов</h1>
                <div style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', marginTop: '4px' }}>
                  Мониторинг событий и отладка winws
                </div>
              </div>

              {/* COMPACT UPDATE BADGE IN HEADER */}
              {appUpdateStatus !== 'idle' && (
                <div className="app-update-compact-banner">
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" style={{ width: '16px', height: '16px', color: '#60a5fa' }}>
                      <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
                      <polyline points="7 10 12 15 17 10" />
                      <line x1="12" y1="15" x2="12" y2="3" />
                    </svg>
                    <span style={{ fontSize: '0.82rem', fontWeight: 600, color: '#fff' }} title={appUpdateError}>
                      {appUpdateStatus === 'available' && `Доступно обновление v${appUpdateVersion}`}
                      {appUpdateStatus === 'downloading' && `Загрузка... ${appUpdateProgress}%`}
                      {appUpdateStatus === 'downloaded' && `Версия v${appUpdateVersion} готова!`}
                      {appUpdateStatus === 'error' && (appUpdateError ? `Ошибка: ${appUpdateError}` : `Ошибка обновления`)}
                    </span>
                  </div>

                  <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                    {appUpdateStatus === 'available' && (
                      <button className="btn-primary" onClick={handleDownloadAppUpdate} style={{ padding: '5px 12px', fontSize: '0.78rem' }}>
                        Обновить
                      </button>
                    )}
                    {appUpdateStatus === 'downloaded' && (
                      <button className="btn-primary" onClick={handleInstallAppUpdate} style={{ padding: '5px 12px', fontSize: '0.78rem', background: 'var(--success)' }}>
                        Перезапустить
                      </button>
                    )}
                    <button 
                      className="btn-secondary" 
                      onClick={() => setAppUpdateStatus('idle')} 
                      style={{ padding: '5px', borderRadius: '6px', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
                      title="Закрыть"
                    >
                      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" style={{ width: '12px', height: '12px' }}>
                        <line x1="18" y1="6" x2="6" y2="18"></line>
                        <line x1="6" y1="6" x2="18" y2="18"></line>
                      </svg>
                    </button>
                  </div>
                </div>
              )}
            </header>

            <div className="logs-view-container">
              {/* Toolbar */}
              <div className="logs-toolbar">
                <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                  <input 
                    type="text" 
                    className="logs-search-input" 
                    placeholder="Поиск по логам..."
                    value={logSearchQuery}
                    onChange={(e) => setLogSearchQuery(e.target.value)}
                  />

                  <div style={{ display: 'flex', gap: '4px' }}>
                    <button 
                      className="btn-secondary"
                      style={{ padding: '6px 12px', fontSize: '0.75rem', background: logFilter === 'all' ? 'rgba(59, 130, 246, 0.2)' : undefined, color: logFilter === 'all' ? '#fff' : undefined }}
                      onClick={() => setLogFilter('all')}
                    >
                      Все
                    </button>
                    <button 
                      className="btn-secondary"
                      style={{ padding: '6px 12px', fontSize: '0.75rem', background: logFilter === 'error' ? 'rgba(239, 68, 68, 0.2)' : undefined, color: logFilter === 'error' ? '#f87171' : undefined }}
                      onClick={() => setLogFilter('error')}
                    >
                      Ошибки
                    </button>
                    <button 
                      className="btn-secondary"
                      style={{ padding: '6px 12px', fontSize: '0.75rem', background: logFilter === 'success' ? 'rgba(16, 185, 129, 0.2)' : undefined, color: logFilter === 'success' ? '#34d399' : undefined }}
                      onClick={() => setLogFilter('success')}
                    >
                      Успех
                    </button>
                  </div>
                </div>

                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <button 
                    className="btn-secondary" 
                    style={{ padding: '6px 12px', fontSize: '0.75rem', display: 'flex', alignItems: 'center', gap: '6px' }}
                    onClick={handleCopyLogs}
                    disabled={!logs}
                  >
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" style={{ width: '12px', height: '12px' }}>
                      <rect x="9" y="9" width="13" height="13" rx="2" ry="2"></rect>
                      <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path>
                    </svg>
                    {copiedLogs ? 'Скопировано!' : 'Копировать'}
                  </button>

                  <button 
                    className="btn-secondary" 
                    style={{ padding: '6px 12px', fontSize: '0.75rem', display: 'flex', alignItems: 'center', gap: '6px' }}
                    onClick={() => setAutoScrollLogs(!autoScrollLogs)}
                  >
                    Автоскролл: {autoScrollLogs ? 'Вкл' : 'Выкл'}
                  </button>

                  <button 
                    className="btn-secondary" 
                    style={{ padding: '6px 12px', fontSize: '0.75rem', color: 'var(--danger)' }}
                    onClick={() => setLogs('')}
                    disabled={!logs}
                  >
                    Очистить
                  </button>
                </div>
              </div>

              {/* Logs Terminal Window */}
              <div className="logs-terminal-window" ref={consoleRef}>
                {logs ? (
                  logs.split('\n').filter(line => {
                    if (!line.trim()) return false;
                    if (logSearchQuery && !line.toLowerCase().includes(logSearchQuery.toLowerCase())) return false;
                    if (logFilter === 'error' && !line.includes('❌') && !line.includes('Error') && !line.includes('Ошибка') && !line.includes('failed')) return false;
                    if (logFilter === 'success' && !line.includes('===') && !line.includes('успешно') && !line.includes('Successfully')) return false;
                    return true;
                  }).map((line, idx) => (
                    <div key={idx} className={`log-line ${getLogLineClass(line)}`}>
                      <span className="log-timestamp">&gt;</span>
                      <span>{line}</span>
                    </div>
                  ))
                ) : (
                  <div style={{ color: 'var(--text-muted)', textAlign: 'center', padding: '60px 0', fontSize: '0.85rem' }}>
                    Консоль логов пуста. Запустите обход или выполните действия для отображения событий.
                  </div>
                )}
              </div>
            </div>
          </>
        )}

        {/* VIEW 6: CUSTOMIZATION (MacroSortirovka System) */}
        {activeView === 'customization' && (
          <>
            <header className="header" id="customization_header_section" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '24px' }}>
              <div>
                <h1 className="page-title">Кастомизация</h1>
                <div style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', marginTop: '4px' }}>
                  Персонализация цветовых тем, эффектов неонового свечения и макета
                </div>
              </div>

              {/* COMPACT UPDATE BADGE IN HEADER */}
              {appUpdateStatus !== 'idle' && (
                <div className="app-update-compact-banner">
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" style={{ width: '16px', height: '16px', color: '#60a5fa' }}>
                      <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
                      <polyline points="7 10 12 15 17 10" />
                      <line x1="12" y1="15" x2="12" y2="3" />
                    </svg>
                    <span style={{ fontSize: '0.82rem', fontWeight: 600, color: '#fff' }} title={appUpdateError}>
                      {appUpdateStatus === 'available' && `Доступно обновление v${appUpdateVersion}`}
                      {appUpdateStatus === 'downloading' && `Загрузка... ${appUpdateProgress}%`}
                      {appUpdateStatus === 'downloaded' && `Версия v${appUpdateVersion} готова!`}
                      {appUpdateStatus === 'error' && (appUpdateError ? `Ошибка: ${appUpdateError}` : `Ошибка обновления`)}
                    </span>
                  </div>

                  <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                    {appUpdateStatus === 'available' && (
                      <button className="btn-primary" onClick={handleDownloadAppUpdate} style={{ padding: '5px 12px', fontSize: '0.78rem' }}>
                        Обновить
                      </button>
                    )}
                    {appUpdateStatus === 'downloaded' && (
                      <button className="btn-primary" onClick={handleInstallAppUpdate} style={{ padding: '5px 12px', fontSize: '0.78rem', background: 'var(--success)' }}>
                        Перезапустить
                      </button>
                    )}
                    <button 
                      className="btn-secondary" 
                      onClick={() => setAppUpdateStatus('idle')} 
                      style={{ padding: '5px', borderRadius: '6px', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
                      title="Закрыть"
                    >
                      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" style={{ width: '12px', height: '12px' }}>
                        <line x1="18" y1="6" x2="6" y2="18"></line>
                        <line x1="6" y1="6" x2="18" y2="18"></line>
                      </svg>
                    </button>
                  </div>
                </div>
              )}
            </header>

            <div className="customization-grid">
              {/* Left Column: Theme Settings & Color Pickers */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
                
                {/* 1. Visual Effects */}
                <section className="settings-card">
                  <h3 className="settings-title">Визуальные эффекты</h3>
                  <p style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', marginBottom: '16px' }}>
                    Настройка дополнительных эффектов свечения и анимации интерфейса.
                  </p>
                  
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                    <label style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', background: 'rgba(255, 255, 255, 0.02)', border: '1px solid var(--border-color)', padding: '12px 16px', borderRadius: 'var(--radius-md)', cursor: 'pointer' }}>
                      <span style={{ fontSize: '0.85rem', fontWeight: 500, color: 'var(--text-main)' }}>Включить неоновую подсветку (glow)</span>
                      <input 
                        type="checkbox" 
                        checked={enableGlow} 
                        onChange={(e) => setEnableGlow(e.target.checked)} 
                        style={{ width: '18px', height: '18px', cursor: 'pointer' }}
                      />
                    </label>

                    <label style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', background: 'rgba(255, 255, 255, 0.02)', border: '1px solid var(--border-color)', padding: '12px 16px', borderRadius: 'var(--radius-md)', cursor: 'pointer' }}>
                      <span style={{ fontSize: '0.85rem', fontWeight: 500, color: 'var(--text-main)' }}>Анимированный фон (Aurora Orbs)</span>
                      <input 
                        type="checkbox" 
                        checked={showAmbientOrbs} 
                        onChange={(e) => setShowAmbientOrbs(e.target.checked)} 
                        style={{ width: '18px', height: '18px', cursor: 'pointer' }}
                      />
                    </label>
                  </div>
                </section>

                {/* 2. Theme Presets */}
                <section className="settings-card">
                  <h3 className="settings-title">Готовые темы оформления</h3>
                  <p style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', marginBottom: '16px' }}>
                    Быстрый выбор готовых цветовых палитр:
                  </p>

                  <div className="theme-presets-grid">
                    <div 
                      className={`theme-preset-card ${activePreset === 'space' ? 'active' : ''}`}
                      onClick={() => handleApplyPreset('space')}
                    >
                      <div className="theme-color-circle" style={{ background: 'linear-gradient(135deg, #3b82f6, #6366f1)' }}></div>
                      <span style={{ fontSize: '0.78rem', fontWeight: 600, color: '#fff' }}>Космос</span>
                    </div>

                    <div 
                      className={`theme-preset-card ${activePreset === 'emerald' ? 'active' : ''}`}
                      onClick={() => handleApplyPreset('emerald')}
                    >
                      <div className="theme-color-circle" style={{ background: 'linear-gradient(135deg, #10b981, #06b6d4)' }}></div>
                      <span style={{ fontSize: '0.78rem', fontWeight: 600, color: '#fff' }}>Изумруд</span>
                    </div>

                    <div 
                      className={`theme-preset-card ${activePreset === 'purple' ? 'active' : ''}`}
                      onClick={() => handleApplyPreset('purple')}
                    >
                      <div className="theme-color-circle" style={{ background: 'linear-gradient(135deg, #8b5cf6, #ec4899)' }}></div>
                      <span style={{ fontSize: '0.78rem', fontWeight: 600, color: '#fff' }}>Фиолетовый</span>
                    </div>

                    <div 
                      className={`theme-preset-card ${activePreset === 'amber' ? 'active' : ''}`}
                      onClick={() => handleApplyPreset('amber')}
                    >
                      <div className="theme-color-circle" style={{ background: 'linear-gradient(135deg, #f59e0b, #ef4444)' }}></div>
                      <span style={{ fontSize: '0.78rem', fontWeight: 600, color: '#fff' }}>Янтарь</span>
                    </div>

                    <div 
                      className={`theme-preset-card ${activePreset === 'crimson' ? 'active' : ''}`}
                      onClick={() => handleApplyPreset('crimson')}
                    >
                      <div className="theme-color-circle" style={{ background: 'linear-gradient(135deg, #ef4444, #9333ea)' }}></div>
                      <span style={{ fontSize: '0.78rem', fontWeight: 600, color: '#fff' }}>Рубин</span>
                    </div>
                  </div>
                </section>

                {/* 3. Create Custom Theme */}
                <section className="settings-card">
                  <h3 className="settings-title">Создать свою тему</h3>
                  <p style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', marginBottom: '16px' }}>
                    Настройте цвета каждого элемента индивидуально. Изменения сразу отобразятся в превью справа.
                  </p>

                  <div className="color-pickers-list">
                    <div className="color-picker-item">
                      <label style={{ fontSize: '0.82rem', color: 'var(--text-secondary)' }}>Главный цвет акцентов:</label>
                      <div className="color-picker-wrapper">
                        <span className="color-hex-label">{themeColors.primary}</span>
                        <input 
                          type="color" 
                          value={themeColors.primary} 
                          onChange={(e) => { setActivePreset('custom'); setThemeColors({ ...themeColors, primary: e.target.value }); }}
                          style={{ border: 'none', width: '36px', height: '36px', borderRadius: '6px', cursor: 'pointer', background: 'none', padding: 0 }}
                        />
                      </div>
                    </div>

                    <div className="color-picker-item">
                      <label style={{ fontSize: '0.82rem', color: 'var(--text-secondary)' }}>Цвет фона приложения:</label>
                      <div className="color-picker-wrapper">
                        <span className="color-hex-label">{themeColors.bgApp}</span>
                        <input 
                          type="color" 
                          value={themeColors.bgApp} 
                          onChange={(e) => { setActivePreset('custom'); setThemeColors({ ...themeColors, bgApp: e.target.value }); }}
                          style={{ border: 'none', width: '36px', height: '36px', borderRadius: '6px', cursor: 'pointer', background: 'none', padding: 0 }}
                        />
                      </div>
                    </div>

                    <div className="color-picker-item">
                      <label style={{ fontSize: '0.82rem', color: 'var(--text-secondary)' }}>Цвет боковой панели:</label>
                      <div className="color-picker-wrapper">
                        <span className="color-hex-label">{themeColors.bgSidebar}</span>
                        <input 
                          type="color" 
                          value={themeColors.bgSidebar} 
                          onChange={(e) => { setActivePreset('custom'); setThemeColors({ ...themeColors, bgSidebar: e.target.value }); }}
                          style={{ border: 'none', width: '36px', height: '36px', borderRadius: '6px', cursor: 'pointer', background: 'none', padding: 0 }}
                        />
                      </div>
                    </div>

                    <div className="color-picker-item">
                      <label style={{ fontSize: '0.82rem', color: 'var(--text-secondary)' }}>Цвет карточек и панелей:</label>
                      <div className="color-picker-wrapper">
                        <span className="color-hex-label">{themeColors.bgCard}</span>
                        <input 
                          type="color" 
                          value={themeColors.bgCard} 
                          onChange={(e) => { setActivePreset('custom'); setThemeColors({ ...themeColors, bgCard: e.target.value }); }}
                          style={{ border: 'none', width: '36px', height: '36px', borderRadius: '6px', cursor: 'pointer', background: 'none', padding: 0 }}
                        />
                      </div>
                    </div>

                    <div className="color-picker-item">
                      <label style={{ fontSize: '0.82rem', color: 'var(--text-secondary)' }}>Цвет главного текста:</label>
                      <div className="color-picker-wrapper">
                        <span className="color-hex-label">{themeColors.textMain}</span>
                        <input 
                          type="color" 
                          value={themeColors.textMain} 
                          onChange={(e) => { setActivePreset('custom'); setThemeColors({ ...themeColors, textMain: e.target.value }); }}
                          style={{ border: 'none', width: '36px', height: '36px', borderRadius: '6px', cursor: 'pointer', background: 'none', padding: 0 }}
                        />
                      </div>
                    </div>
                  </div>

                  <div style={{ marginTop: '24px', display: 'flex', gap: '12px' }}>
                    <button 
                      type="button" 
                      className="btn-secondary" 
                      style={{ flex: 1, padding: '10px' }}
                      onClick={() => handleApplyPreset('space')}
                    >
                      Сбросить цвета
                    </button>
                    <button 
                      type="button" 
                      className="btn-primary" 
                      style={{ flex: 1.5, padding: '10px', background: themeColors.primary }}
                      onClick={() => {
                        localStorage.setItem('macrozapret_theme', JSON.stringify(themeColors));
                        setThemeSavedToast(true);
                        setTimeout(() => setThemeSavedToast(false), 2500);
                      }}
                    >
                      {themeSavedToast ? 'Тема сохранена!' : 'Применить и сохранить'}
                    </button>
                  </div>
                </section>
              </div>

              {/* Right Column: Live Mockup Preview Frame (1-to-1 MacroSortirovka) */}
              <div style={{ position: 'sticky', top: '0' }}>
                <section className="settings-card">
                  <h3 className="settings-title">Живой предпросмотр</h3>
                  <p style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', marginBottom: '16px' }}>
                    Посмотрите, как новая тема выглядит на макете приложения.
                  </p>

                  <div style={{ 
                    display: 'flex', 
                    height: '280px', 
                    borderRadius: 'var(--radius-md)', 
                    overflow: 'hidden', 
                    border: '1px solid var(--border-color)', 
                    fontSize: '11px', 
                    backgroundColor: themeColors.bgApp, 
                    color: themeColors.textMain 
                  }}>
                    {/* Mock Sidebar */}
                    <div style={{ 
                      width: '85px', 
                      backgroundColor: themeColors.bgSidebar, 
                      borderRight: '1px solid rgba(255,255,255,0.05)', 
                      padding: '10px', 
                      display: 'flex', 
                      flexDirection: 'column', 
                      gap: '12px' 
                    }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '4px', fontWeight: 'bold', color: themeColors.textMain, fontSize: '9px' }}>
                        <div style={{ width: '10px', height: '10px', borderRadius: '2px', backgroundColor: themeColors.primary }}></div>
                        <span>Macro</span>
                      </div>
                      <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                        <div style={{ backgroundColor: 'rgba(255,255,255,0.06)', borderLeft: `2px solid ${themeColors.primary}`, padding: '4px 6px', borderRadius: '2px', fontWeight: 500 }}>Панель</div>
                        <div style={{ padding: '4px 6px', opacity: 0.5 }}>Списки</div>
                        <div style={{ padding: '4px 6px', opacity: 0.5 }}>Логи</div>
                      </div>
                    </div>
                    
                    {/* Mock Main Body */}
                    <div style={{ flex: 1, padding: '12px', display: 'flex', flexDirection: 'column', gap: '10px', backgroundColor: themeColors.bgApp }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                        <span style={{ fontWeight: 600, fontSize: '12px' }}>Панель управления</span>
                        <div style={{ backgroundColor: themeColors.primary, color: '#fff', padding: '3px 8px', borderRadius: '4px', fontWeight: 600, fontSize: '9px', boxShadow: enableGlow ? `0 0 8px ${themeColors.primary}66` : 'none' }}>
                          Включено
                        </div>
                      </div>
                      
                      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px' }}>
                        {/* Card 1 */}
                        <div style={{ backgroundColor: themeColors.bgCard, border: '1px solid rgba(255,255,255,0.05)', padding: '8px', borderRadius: '6px', display: 'flex', flexDirection: 'column', gap: '6px' }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: '5px' }}>
                            <div style={{ width: '12px', height: '12px', backgroundColor: themeColors.primary, borderRadius: '2px', opacity: 0.9 }}></div>
                            <div>
                              <div style={{ fontWeight: 600 }}>WinDivert</div>
                              <div style={{ opacity: 0.5, fontSize: '7px' }}>general (ALT).bat</div>
                            </div>
                          </div>
                          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderTop: '1px solid rgba(255,255,255,0.05)', paddingTop: '4px', fontSize: '8px', opacity: 0.8 }}>
                            <span>Обход</span>
                            <div style={{ width: '16px', height: '8px', borderRadius: '4px', backgroundColor: themeColors.primary, position: 'relative' }}>
                              <span style={{ position: 'absolute', right: '1px', top: '1px', width: '6px', height: '6px', borderRadius: '50%', background: '#fff' }}></span>
                            </div>
                          </div>
                        </div>
                        
                        {/* Card 2 (Stats Donut Mock) */}
                        <div style={{ backgroundColor: themeColors.bgCard, border: '1px solid rgba(255,255,255,0.05)', padding: '8px', borderRadius: '6px', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                          <div style={{ display: 'flex', flexDirection: 'column', gap: '2px' }}>
                            <div style={{ fontWeight: 600 }}>Сервисы</div>
                            <div style={{ fontSize: '14px', fontWeight: 'bold', color: themeColors.primary }}>100%</div>
                            <div style={{ opacity: 0.5, fontSize: '7px' }}>доступны</div>
                          </div>
                          <div style={{ width: '28px', height: '28px', borderRadius: '50%', border: `3px solid rgba(255,255,255,0.05)`, borderTopColor: themeColors.primary, transform: 'rotate(45deg)' }}></div>
                        </div>
                      </div>
                      
                      <div style={{ backgroundColor: 'rgba(255,255,255,0.02)', border: '1px dashed rgba(255,255,255,0.05)', borderLeft: `3px solid ${themeColors.primary}`, padding: '6px 8px', borderRadius: '4px', opacity: 0.9, fontSize: '8px' }}>
                        <strong>Служба активна:</strong> перехват пакетов запущен
                      </div>
                    </div>
                  </div>
                </section>
              </div>
            </div>
          </>
        )}

      </main>
    </div>
  );
}
