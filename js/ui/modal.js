/**
 * Modal UI Utility
 * Helpers for showing, hiding, and closing modals cleanly.
 */

export function openModal(modalId) {
    const modal = typeof modalId === 'string' ? document.getElementById(modalId) : modalId;
    if (!modal) return;
    modal.classList.remove('hidden');
    modal.classList.add('flex');
}

export function closeModal(modalId) {
    const modal = typeof modalId === 'string' ? document.getElementById(modalId) : modalId;
    if (!modal) return;
    modal.classList.add('hidden');
    modal.classList.remove('flex');
}

export function wireModalBackdrop(modalId, onClose) {
    const modal = typeof modalId === 'string' ? document.getElementById(modalId) : modalId;
    if (!modal) return;
    modal.addEventListener('click', (e) => {
        if (e.target === modal) {
            if (typeof onClose === 'function') {
                onClose();
            } else {
                closeModal(modal);
            }
        }
    });
}
