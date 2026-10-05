/**
 * Toast & Alert UI Component
 * Renders bottom toasts, shake animations, and full-screen profanity violation alerts.
 */

export function showToast(message, isError = false) {
    const existingToast = document.querySelector('.global-toast');
    if (existingToast) existingToast.remove();

    // Dynamically inject shake animations if they don't exist yet
    if (!document.getElementById('toast-shake-style')) {
        const style = document.createElement('style');
        style.id = 'toast-shake-style';
        style.innerHTML = `
            @keyframes toast-shake {
                0%, 100% { transform: translateX(0); }
                10%, 30%, 50%, 70%, 90% { transform: translateX(-8px); }
                20%, 40%, 60%, 80% { transform: translateX(8px); }
            }
            .toast-shake {
                animation: toast-shake 0.5s ease-in-out;
            }
        `;
        document.head.appendChild(style);
    }

    if (isError === 'profanity') {
        const overlay = document.createElement('div');
        overlay.className = 'fixed inset-0 z-[9999] flex flex-col items-center justify-center bg-red-950/95 backdrop-blur-md text-white animate-pulse';
        overlay.innerHTML = `
            <span class="material-symbols-outlined text-[120px] mb-6 text-red-500">warning</span>
            <h1 class="text-6xl font-black mb-4 tracking-tighter text-center uppercase text-red-500 drop-shadow-[0_0_15px_rgba(239,68,68,0.8)]">PROFANITY DETECTED</h1>
            <p class="text-2xl font-bold mb-8 text-center px-8 max-w-3xl leading-relaxed">${message}</p>
            <p class="text-lg font-medium mb-12 text-center text-red-300">Your action has been blocked. Repeated offenses will result in an immediate permanent ban.</p>
            <button onclick="this.parentElement.remove()" class="bg-black text-red-500 font-black px-12 py-5 rounded-2xl text-xl hover:bg-red-900 hover:text-white transition-all border-4 border-red-500 hover:scale-105 active:scale-95 shadow-[0_0_50px_rgba(239,68,68,0.5)] uppercase tracking-widest">I Understand and Will Comply</button>
        `;
        document.body.appendChild(overlay);
        return;
    }

    const toast = document.createElement('div');
    toast.className = 'global-toast fixed bottom-6 right-6 z-[250] text-white px-5 py-3.5 rounded-xl shadow-2xl text-sm font-bold flex items-center gap-3 transition-all duration-300 transform translate-y-0 opacity-100';
    
    let iconName = 'check_circle';
    let iconColor = 'text-green-400';
    
    if (isError) {
        toast.className += ' bg-red-600';
        iconName = 'error';
        iconColor = 'text-white';
    } else {
        toast.className += ' bg-slate-900';
    }
    
    toast.innerHTML = `<span class="material-symbols-outlined ${iconColor} text-[20px]">${iconName}</span><span>${message}</span>`;
    document.body.appendChild(toast);
    
    const displayDuration = 2200;
    
    setTimeout(() => {
        toast.classList.remove('opacity-100');
        toast.classList.add('opacity-0', 'translate-y-2');
        setTimeout(() => toast.remove(), 300);
    }, displayDuration);
}

// Expose globally for HTML onclick handlers
window.showToast = showToast;
