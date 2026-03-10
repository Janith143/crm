// PWA Registration and Installation Handler
interface BeforeInstallPromptEvent extends Event {
    prompt: () => Promise<void>;
    userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
}

declare global {
    interface Window {
        gtag?: (...args: any[]) => void;
        promptInstall?: () => void;
    }
    interface Navigator {
        standalone?: boolean;
    }
}

let deferredPrompt: BeforeInstallPromptEvent | null = null;

// Register Service Worker
if ('serviceWorker' in navigator) {
    window.addEventListener('load', () => {
        navigator.serviceWorker
            .register('/sw.js')
            .then((registration) => {
                console.log('✅ Service Worker registered:', registration);
                setInterval(() => registration.update(), 60000);
            })
            .catch((error) => {
                console.log('❌ Service Worker registration failed:', error);
            });
    });
}

// Capture install prompt
window.addEventListener('beforeinstallprompt', (e: Event) => {
    console.log('💾 Install prompt available');
    e.preventDefault();
    deferredPrompt = e as BeforeInstallPromptEvent;
    if (!sessionStorage.getItem('install-dismissed')) {
        showInstallPromotion();
    }
});

// Handle installation
window.addEventListener('appinstalled', () => {
    console.log('✅ PWA installed');
    deferredPrompt = null;
    hideInstallPromotion();
});

// Show install banner
function showInstallPromotion() {
    const existing = document.getElementById('install-banner');
    if (existing) {
        existing.style.display = 'flex';
        return;
    }

    const banner = document.createElement('div');
    banner.id = 'install-banner';
    banner.innerHTML = `
    <div style="flex: 1;">
      <div style="font-weight: 600; margin-bottom: 4px;">Install Clazz CRM</div>
      <div style="font-size: 14px; opacity: 0.9;">Add to home screen for quick access</div>
    </div>
    <button id="install-btn">Install</button>
    <button id="install-dismiss">×</button>
  `;

    const style = `
    position: fixed; bottom: 20px; left: 50%; transform: translateX(-50%);
    background: linear-gradient(135deg, #9333ea, #3b82f6); color: white;
    padding: 16px 24px; border-radius: 12px; box-shadow: 0 4px 20px rgba(0,0,0,0.3);
    display: flex; align-items: center; gap: 16px; z-index: 10000; max-width: 90%;
    font-family: system-ui, sans-serif; animation: slideUp 0.3s ease-out;
  `;

    banner.setAttribute('style', style);
    document.body.appendChild(banner);

    // Add event listeners
    const installBtn = document.getElementById('install-btn');
    const dismissBtn = document.getElementById('install-dismiss');

    if (installBtn) {
        installBtn.addEventListener('click', async () => {
            if (!deferredPrompt) return;
            await deferredPrompt.prompt();
            const { outcome } = await deferredPrompt.userChoice;
            console.log(`Install outcome: ${outcome}`);
            deferredPrompt = null;
            hideInstallPromotion();
        });
    }

    if (dismissBtn) {
        dismissBtn.addEventListener('click', () => {
            hideInstallPromotion();
            sessionStorage.setItem('install-dismissed', 'true');
        });
    }

    // Add CSS
    const css = document.createElement('style');
    css.textContent = `
    @keyframes slideUp {
      from { transform: translateX(-50%) translateY(100px); opacity: 0; }
      to { transform: translateX(-50%) translateY(0); opacity: 1; }
    }
    #install-btn {
      background: white; color: #9333ea; border: none; padding: 10px 20px;
      border-radius: 8px; font-weight: 600; cursor: pointer; font-size: 14px;
    }
    #install-btn:hover { transform: scale(1.05); }
    #install-dismiss {
      background: transparent; color: white; border: none; padding: 8px;
      cursor: pointer; font-size: 20px; opacity: 0.8;
    }
    #install-dismiss:hover { opacity: 1; }
  `;
    document.head.appendChild(css);
}

function hideInstallPromotion() {
    const banner = document.getElementById('install-banner');
    if (banner) banner.style.display = 'none';
}

// Expose globally
window.promptInstall = () => {
    if (deferredPrompt) showInstallPromotion();
    else console.log('Install not available');
};

// Check PWA status
export function isPWA() {
    return window.matchMedia('(display-mode: standalone)').matches ||
        window.navigator.standalone === true ||
        document.referrer.includes('android-app://');
}

console.log('Running as PWA:', isPWA());
export { showInstallPromotion, hideInstallPromotion };
