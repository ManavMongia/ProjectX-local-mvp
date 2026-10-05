/**
 * Property Media Feature Module
 * Handles media uploads, gallery rendering, re-ordering, and cover image assignment.
 */

import { uploadListingMediaFile, MEDIA_PLACEHOLDER } from '../../services/media-service.js';
import { showToast } from '../../ui/toast.js';

export let uploadedMedia = [];

export function setUploadedMedia(media) {
    uploadedMedia = media || [];
}

export function getUploadedMedia() {
    return uploadedMedia;
}

function escHtml(str) {
    if (!str) return '';
    return String(str).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}

export function renderMediaGrid() {
    const grid = document.getElementById('modal-media-grid');
    if (!grid) return;
    if (uploadedMedia.length === 0) {
        grid.innerHTML = '';
        grid.classList.add('hidden');
        const zone = document.getElementById('modal-upload-zone');
        if (zone) zone.classList.remove('hidden');
        return;
    }
    const zone = document.getElementById('modal-upload-zone');
    if (zone) zone.classList.remove('hidden');
    grid.classList.remove('hidden');
    grid.innerHTML = uploadedMedia.map((item, idx) => {
        const isImage = item.media_type === 'image';
        const isCover = item.is_cover;
        const thumbHtml = isImage
            ? `<img src="${escHtml(item.url)}" class="w-full h-full object-cover" alt="Media ${idx+1}">`
            : `<div class="w-full h-full flex flex-col items-center justify-center bg-slate-900 text-white gap-1">
                <span class="material-symbols-outlined text-[28px] text-slate-300">play_circle</span>
                <span class="text-[10px] font-bold uppercase tracking-wider text-slate-400">Video</span>
               </div>`;
        const coverBadge = isCover
            ? `<span class="absolute top-1.5 left-1.5 bg-primary text-on-primary text-[9px] font-black uppercase tracking-wider px-1.5 py-0.5 rounded-full">Cover</span>`
            : '';
        const setCoverBtn = isImage && !isCover
            ? `<button type="button" onclick="setCoverItem(${idx})" title="Set as Cover" class="p-1 bg-white/90 hover:bg-white rounded text-slate-700 transition-colors"><span class="material-symbols-outlined text-[14px]">star</span></button>`
            : '';
        return `
        <div class="relative rounded-lg overflow-hidden border-2 ${isCover ? 'border-primary' : 'border-outline-variant'} bg-slate-100 aspect-[4/3]">
            ${thumbHtml}
            ${coverBadge}
            <div class="absolute inset-0 bg-black/0 hover:bg-black/40 transition-all flex items-end justify-center pb-2 gap-1 opacity-0 hover:opacity-100">
                <button type="button" onclick="moveMediaItem(${idx},-1)" title="Move Left" class="p-1 bg-white/90 hover:bg-white rounded text-slate-700 transition-colors ${idx === 0 ? 'opacity-30 pointer-events-none' : ''}"><span class="material-symbols-outlined text-[14px]">arrow_back</span></button>
                ${setCoverBtn}
                <button type="button" onclick="removeMediaItem(${idx})" title="Remove" class="p-1 bg-red-600 hover:bg-red-700 rounded text-white transition-colors"><span class="material-symbols-outlined text-[14px]">delete</span></button>
                <button type="button" onclick="moveMediaItem(${idx},1)" title="Move Right" class="p-1 bg-white/90 hover:bg-white rounded text-slate-700 transition-colors ${idx === uploadedMedia.length-1 ? 'opacity-30 pointer-events-none' : ''}"><span class="material-symbols-outlined text-[14px]">arrow_forward</span></button>
            </div>
            <span class="absolute bottom-1 right-1 text-[9px] font-black uppercase tracking-wider px-1.5 py-0.5 rounded-full ${isImage ? 'bg-slate-900/70 text-white' : 'bg-blue-600/90 text-white'}">${isImage ? 'IMG' : 'VID'}</span>
        </div>`;
    }).join('');
}

export function removeMediaItem(idx) {
    const wasCover = uploadedMedia[idx]?.is_cover;
    uploadedMedia.splice(idx, 1);
    if (wasCover && uploadedMedia.length > 0) {
        const firstImg = uploadedMedia.find(m => m.media_type === 'image');
        if (firstImg) firstImg.is_cover = true;
    }
    renderMediaGrid();
}
window.removeMediaItem = removeMediaItem;

export function setCoverItem(idx) {
    uploadedMedia.forEach((m, i) => { m.is_cover = (i === idx); });
    renderMediaGrid();
}
window.setCoverItem = setCoverItem;

export function moveMediaItem(idx, dir) {
    const newIdx = idx + dir;
    if (newIdx < 0 || newIdx >= uploadedMedia.length) return;
    [uploadedMedia[idx], uploadedMedia[newIdx]] = [uploadedMedia[newIdx], uploadedMedia[idx]];
    renderMediaGrid();
}
window.moveMediaItem = moveMediaItem;

export async function handleMultipleUploads(files, listingIdHint) {
    const progressEl = document.getElementById('modal-upload-progress');
    const uploadZone = document.getElementById('modal-upload-zone');
    if (progressEl) progressEl.classList.remove('hidden');
    if (uploadZone) uploadZone.classList.add('opacity-50', 'pointer-events-none');

    for (const file of files) {
        try {
            const item = await uploadListingMediaFile(file, listingIdHint);
            const hasNoCoverImage = !uploadedMedia.some(m => m.is_cover && m.media_type === 'image');
            uploadedMedia.push({
                url: item.url,
                media_type: item.media_type,
                is_cover: item.media_type === 'image' && hasNoCoverImage,
                alt_text: file.name
            });
        } catch (err) {
            showToast(`Upload failed for ${file.name}: ${err.message}`, true);
        }
    }

    if (progressEl) progressEl.classList.add('hidden');
    if (uploadZone) uploadZone.classList.remove('opacity-50', 'pointer-events-none');
    renderMediaGrid();
}

export function renderInteractiveGallery(container, mediaItems, fallbackImg) {
    if (!container) return;
    const PLACEHOLDER = MEDIA_PLACEHOLDER;

    let items = mediaItems && mediaItems.length > 0 ? mediaItems : [];
    if (items.length === 0 && fallbackImg) {
        items = [{ url: fallbackImg, media_type: 'image', is_cover: true }];
    }
    if (items.length === 0) {
        items = [{ url: PLACEHOLDER, media_type: 'image', is_cover: true }];
    }

    let activeIdx = 0;

    function buildHtml() {
        const item = items[activeIdx];
        const isVideo = item.media_type === 'video';
        const mainMediaHtml = isVideo
            ? `<video src="${escHtml(item.url)}" controls playsinline class="w-full h-full object-contain bg-black"></video>`
            : `<img src="${escHtml(item.url)}" alt="Property media ${activeIdx + 1}" class="w-full h-full object-cover transition-all duration-500">`;

        const thumbsHtml = items.length > 1 ? `
        <div class="flex gap-2 overflow-x-auto py-2 px-1 mt-3 scrollbar-hide">
            ${items.map((m, i) => {
                const thumbIsVideo = m.media_type === 'video';
                const thumbContent = thumbIsVideo
                    ? `<div class="w-full h-full flex items-center justify-center bg-slate-900"><span class="material-symbols-outlined text-white text-[20px]">play_circle</span></div>`
                    : `<img src="${escHtml(m.url)}" class="w-full h-full object-cover" alt="Thumb ${i+1}">`;
                return `<button type="button" data-idx="${i}" class="gallery-thumb shrink-0 w-16 h-16 rounded-lg overflow-hidden border-2 transition-all ${i === activeIdx ? 'border-slate-900 scale-105' : 'border-transparent opacity-60 hover:opacity-100'}">${thumbContent}</button>`;
            }).join('')}
        </div>` : '';

        const counter = items.length > 1 ? `<span class="absolute bottom-3 left-1/2 -translate-x-1/2 bg-black/60 text-white text-xs font-bold px-3 py-1 rounded-full">${activeIdx + 1} / ${items.length}</span>` : '';
        const prevBtn = items.length > 1 && activeIdx > 0 ? `<button type="button" id="gallery-prev" class="absolute left-3 top-1/2 -translate-y-1/2 w-10 h-10 flex items-center justify-center bg-white/80 hover:bg-white rounded-full shadow-lg transition-all"><span class="material-symbols-outlined text-slate-800 text-[20px]">arrow_back</span></button>` : '';
        const nextBtn = items.length > 1 && activeIdx < items.length - 1 ? `<button type="button" id="gallery-next" class="absolute right-3 top-1/2 -translate-y-1/2 w-10 h-10 flex items-center justify-center bg-white/80 hover:bg-white rounded-full shadow-lg transition-all"><span class="material-symbols-outlined text-slate-800 text-[20px]">arrow_forward</span></button>` : '';

        container.innerHTML = `
        <div class="w-full">
            <div class="h-[400px] md:h-[580px] w-full rounded-[32px] overflow-hidden relative shadow-2xl bg-slate-100">
                ${mainMediaHtml}
                ${prevBtn}
                ${nextBtn}
                ${counter}
            </div>
            ${thumbsHtml}
        </div>`;

        const prevEl = container.querySelector('#gallery-prev');
        const nextEl = container.querySelector('#gallery-next');
        if (prevEl) prevEl.onclick = () => { activeIdx--; buildHtml(); };
        if (nextEl) nextEl.onclick = () => { activeIdx++; buildHtml(); };
        container.querySelectorAll('.gallery-thumb').forEach(btn => {
            btn.onclick = () => { activeIdx = parseInt(btn.dataset.idx); buildHtml(); };
        });
    }

    buildHtml();
}
