// ====================================================================
// RETROPRESS — stamp engine (p5.js)
// FRONTE: foto full-bleed con effetto Displacement + Emboss + Bitonale (WebGL)
// RETRO:  annullo postale
// ====================================================================

const $ = id => document.getElementById(id);
const on = (id, ev, fn) => { const el = $(id); if (el) el.addEventListener(ev, fn); };

let _toastTimer;
function toast(msg) {
    const t = $('toast');
    if (!t) return;
    t.textContent = msg;
    t.classList.add('show');
    clearTimeout(_toastTimer);
    _toastTimer = setTimeout(() => t.classList.remove('show'), 2200);
}

const MAIN_W = 1080, MAIN_H = 1920;
const STAMP_FW = 920, STAMP_FH = 1600;   // dimensione fissa del francobollo (fronte = retro)
const FONTS = {
    anton:   'Anton',
    archivo: '"Archivo Black"',
    serif:   '"DM Serif Display"',
    mono:    '"DM Mono", monospace'
};
const CJK_FONT = '"Noto Sans JP"';
const RETRO_MSG_FONT = 'Reenie Beanie';   // manoscritto del messaggio retro (no virgolette: p5.textFont le aggiunge)
const RETRO_MSG_DEFAULT = 'Grazie Basilicata,\nsei stata una scoperta incredibile!\nTi lasciamo la nostra traccia';

// testo del retro (tipografia rimossa dai settaggi: valori fissi per ora)
const RETRO_TEXT = { title: 'RETROPRESS', sub: 'Your Hosting Destination.', cjk: '星場 京都', font: FONTS.anton, track: 0 };

let p5Canvas;
let img;
let defaultImg;
let mapImg = null;               // mappa di displacement (opzionale)
let mapVersion = 0;
let stampX, stampY, STAMP_W = 0, STAMP_H = 0;
let isDragging = false, dragMode = 'move', dragOffsetX = 0, dragOffsetY = 0;
let S = {};

const STAMP_PALETTE = ['#FF76BF', '#7778F6', '#E25938', '#B78F75', '#F4EFE6'];

const CONTROLS = ['inkColor','paperColor','bgColor','imgScale','imgOffsetX','imgOffsetY',
    'embossMode','reliefSource','dispX','dispY','mapStrength','mapScale','mapContrast',
    'emboss','embossHi','embossBias','threshold','softness',
    'bgMode','bgPhoto','frontText','textScale','textColor','textBlend',
    'retroMsg',
    'showPerforations','perfRadius','perfSpacing'];

// foto di sfondo full-canvas dell'AREA (cartella background/)
const BG_FILES = [
    'Caciocavallo podolico.jpg',
    'Cartellate lucane.jpg',
    'Filetto lucano.jpg',
    'Pane di Matera IGP.jpg',
    'Peperone crusco.jpg',
    'Salsiccia lucanica di Picerno.jpg',
    'Strascinati con la mollica.jpg',
    'Tumact me tulez.jpg'
];
const BG_PHOTOS = BG_FILES.map((f, i) => ({
    id: 'bg' + (i + 1),
    file: `background/${encodeURIComponent(f)}`,
    label: f.replace(/\.[^.]+$/, '')   // nome file senza estensione
}));
let bgPhotoCache = {};      // id -> p5.Image
let bgPhotoLoading = {};
let bgPhotoVersion = 0;
let frontTextImg = null;    // overlay SVG testi festival
let frontTextWhite = null;  // variante bianca (per blend su sfondi scuri)
let frontTextVersion = 0;

// layout cartolina del RETRO (retro.svg): rasterizzato e ricolorato con ink/carta
let retroSvgRaw = null;     // testo SVG grezzo
let retroImg = null;        // p5.Graphics ricolorata corrente
let retroImgKey = null;     // chiave ink|paper della raster corrente
let retroBusy = false;      // raster async in corso
let retroVersion = 0;       // bump per invalidare cache scene 'back'

// questi controlli sono sempre condivisi tra fronte e retro
const SHARED_CONTROLS = new Set(['showPerforations','perfRadius','perfSpacing','bgColor','bgMode','bgPhoto']);

const SLIDER_FMT = {
    imgScale: v => `${(+v).toFixed(1)}×`,
    imgOffsetX: v => `${Math.round(v * 100)}`,
    imgOffsetY: v => `${Math.round(v * 100)}`,
    dispX: v => `${v}`,
    dispY: v => `${v}`,
    mapStrength: v => `${v}%`,
    mapScale: v => `${(+v).toFixed(1)}×`,
    mapContrast: v => `${v}%`,
    emboss: v => `${v}`,
    embossHi: v => `${v}`,
    embossBias: v => `${v}`,
    threshold: v => `${v}`,
    softness: v => `${v}`,
    perfRadius: v => `${v}px`,
    perfSpacing: v => `${v}px`,
    textScale: v => `${v}%`,
    dispAnimAmp: v => `${v}`,
    dispAnimSpeed: v => `${(+v).toFixed(1)}×`
};

// ---- stato separato per scena ----
let scene = 'front';
let sceneRaw = { front: {}, back: {} };
let sceneImg = { front: null, back: null };
let imgVersion = { front: 0, back: 0 };

// galleria foto fronte inclusa (cartella potenza/)
const POTENZA_FILES = ['Traccia_01.png', 'Traccia_02.png', 'Traccia_03.png', 'Traccia_04.png', 'Traccia_05.png', 'Traccia_06.png', 'Traccia_07.png'];
const POTENZA = POTENZA_FILES.map((f, i) => ({
    id: 'pz' + (i + 1),
    file: `potenza/${encodeURIComponent(f)}`,
    label: f.replace(/\.[^.]+$/, '').replace(/_/g, ' ')   // nome file senza estensione
}));
let potenzaCache = {};   // id -> p5.Image
let sceneCache = { front: null, back: null };
let cacheKey = { front: null, back: null };

// flip 3D
let flipping = false, flipT = 0, flipFrom = 'front', flipTo = 'back';
let flipBufA = null, flipBufB = null;

// intro zoom-in (entrata)
let introActive = false, introStart = 0, introBufF = null, introBufB = null;
const INTRO_DUR = 850;   // ms — durata zoom
const INTRO_FROM = 0.82; // scala iniziale (zoom da 82% a 100%)
// ease-out cubico: lineare ma morbido in chiusura
const introEase = p => 1 - Math.pow(1 - p, 3);

// adesivo sul retro (scelto da select, trascinabile, scala fissa 40%)
let retroSticker = { img: null, x: 0.5, y: 0.5, scale: 0.40 }; // x,y normalizzati 0..1
let retroStickerVersion = 0;
let stickerGrab = { dx: 0, dy: 0 };
let stickerCache = {};   // id -> p5.Image
// adesivi inclusi (cartella sticker/)
const STICKER_FILES = ['Gesto singolo risultato collettivo.png', 'Intelligenza artificiale traccia umana.png', 'La ricerca è un atto creativo.png', 'Ogni gesto lascia una traccia.png', 'Quali tracce lasciamo.png', 'Raccogliamo tracce ovunque.png', 'Ricercare prima di tracciare.png', 'Teniamo viva la traccia.png'];
const STICKERS = STICKER_FILES.map((f, i) => ({
    id: 'st' + (i + 1),
    file: `sticker/${encodeURIComponent(f)}`,
    label: f.replace(/\.[^.]+$/, '')   // nome file senza estensione
}));

// movimento automatico displacement (deform X/Y oscillano lentamente)
let dispAnim = { x: 0, y: 0 };       // delta corrente sommato alla base
let animBuf = null, animBufW = 0, animBufH = 0; // buffer riusato per il fronte animato
let photoSrc = null, photoSrcKey = '';          // cache regione foto (evita resize per frame)

// video
let recording = false, encoding = false, recT0 = 0, recBufFront = null, recBufBack = null;
let mediaRecorder = null, recChunks = [];
const REC = { holdFront: 3000, holdBack: 5000, flip: 650 };

// ====================================================================
// SETUP
// ====================================================================
function setup() {
    pixelDensity(1);
    p5Canvas = createCanvas(MAIN_W, MAIN_H);
    p5Canvas.parent('canvasWrap');
    p5Canvas.elt.style.touchAction = 'none';   // mobile: il browser non intercetta il drag come scroll
    stampX = MAIN_W / 2;
    stampY = MAIN_H / 2;

    initEffect();
    createDefaultStamp();
    populateMaps();
    populateBgPhotos();
    populateStickers();
    populatePotenza();
    initColorPalettes();
    initSceneStates();
    setupControlListeners();
    setupSidebar();
    loadFrontText();
    loadRetroText();
    loadRetroFont();
    updateBgModeUI();
    syncLabels();
    updateSceneUI();
    applyDefaultPotenza();   // foto fronte di partenza dalla galleria Potenza
    if (window.lucide) lucide.createIcons();
    if (document.fonts && document.fonts.ready) document.fonts.ready.then(() => { if (!introActive) redraw(); });
    // animazione di entrata dopo che gli asset iniziali si sono assestati
    setTimeout(startIntro, 120);
}

function setupSidebar() {
    const toggle = () => {
        $('sidebar')?.classList.toggle('open');
        $('sidebarOverlay')?.classList.toggle('active');
    };
    on('menuToggle', 'click', toggle);
    on('sidebarClose', 'click', toggle);
    on('sidebarOverlay', 'click', toggle);
}

function captureRaw() {
    const m = {};
    CONTROLS.forEach(id => {
        const e = $(id);
        if (e) m[id] = e.type === 'checkbox' ? e.checked : e.value;
    });
    return m;
}
function applyRaw(raw) {
    CONTROLS.forEach(id => {
        const e = $(id);
        if (!e || !(id in raw)) return;
        if (e.type === 'checkbox') e.checked = raw[id]; else e.value = raw[id];
    });
    syncColorUI();
    syncLabels();
    updateBgModeUI();
}

function syncColorUI() {
    const mark = (wrap, active) => {
        wrap?.querySelectorAll('.color-dot').forEach(dot => {
            const on = dot.dataset.color.toLowerCase() === active;
            dot.classList.toggle('selected', on);
            dot.setAttribute('aria-checked', on ? 'true' : 'false');
            dot.style.borderColor = on ? '#ffffff' : '#404040';
            dot.style.boxShadow = on ? '0 0 0 1px #0a0a0a' : 'none';
        });
    };
    // ink/paper indipendenti: fronte da sceneRaw.front, retro da sceneRaw.back
    const fInk = (sceneRaw.front.inkColor || $('inkColor')?.value || STAMP_PALETTE[2]).toLowerCase();
    const fPaper = (sceneRaw.front.paperColor || $('paperColor')?.value || STAMP_PALETTE[4]).toLowerCase();
    mark($('inkPalette'), fInk);
    mark($('paperPalette'), fPaper);
    const bInk = (sceneRaw.back.inkColor || $('inkColorBack')?.value || fInk).toLowerCase();
    const bPaper = (sceneRaw.back.paperColor || $('paperColorBack')?.value || fPaper).toLowerCase();
    mark($('inkPaletteBack'), bInk);
    mark($('paperPaletteBack'), bPaper);
    const bg = ($('bgColor')?.value || '#101010').toLowerCase();
    mark($('bgPalette'), bg);
}

let palettesInited = false;

function bustSceneCache(which) {
    if (sceneCache[which]) { sceneCache[which].remove(); sceneCache[which] = null; }
    cacheKey[which] = null;
}

function pickStampColor(inputId, hex) {
    const hidden = $(inputId);
    if (!hidden || !hex) return;
    hidden.value = hex;
    syncColorUI();
    sceneRaw[scene] = captureRaw();
    if (SHARED_CONTROLS.has(inputId)) {
        const other = scene === 'front' ? 'back' : 'front';
        sceneRaw[other][inputId] = hex;
    }
    bustSceneCache('front');
    bustSceneCache('back');
    redraw();
}

// ink/paper indipendenti per fronte e retro: scrive nello stato della scena scelta
function setStampColor(targetScene, key, hex) {
    if (!hex) return;
    sceneRaw[targetScene][key] = hex;
    // riflette nel relativo input nascosto (per fallback UI)
    if (targetScene === 'back') { const b = $(key + 'Back'); if (b) b.value = hex; }
    if (targetScene === scene) { const l = $(key); if (l) l.value = hex; }
    syncColorUI();
    bustSceneCache(targetScene);
    redraw();
}

function initColorPalettes() {
    syncColorUI();
    if (palettesInited) return;
    const inkP = $('inkPalette'), paperP = $('paperPalette'), bgP = $('bgPalette');
    const inkPB = $('inkPaletteBack'), paperPB = $('paperPaletteBack');
    if (!inkP || !paperP || !$('inkColor') || !$('paperColor')) return;

    palettesInited = true;
    inkP.addEventListener('click', e => {
        const dot = e.target.closest('.color-dot');
        if (dot) setStampColor('front', 'inkColor', dot.dataset.color);
    });
    paperP.addEventListener('click', e => {
        const dot = e.target.closest('.color-dot');
        if (dot) setStampColor('front', 'paperColor', dot.dataset.color);
    });
    inkPB?.addEventListener('click', e => {
        const dot = e.target.closest('.color-dot');
        if (dot) setStampColor('back', 'inkColor', dot.dataset.color);
    });
    paperPB?.addEventListener('click', e => {
        const dot = e.target.closest('.color-dot');
        if (dot) setStampColor('back', 'paperColor', dot.dataset.color);
    });
    bgP?.addEventListener('click', e => {
        const dot = e.target.closest('.color-dot');
        if (dot) pickStampColor('bgColor', dot.dataset.color);
    });
    document.addEventListener('keydown', e => {
        const dot = document.activeElement?.closest?.('.color-dot');
        if (!dot) return;
        if (e.key !== 'Enter' && e.key !== ' ') return;
        e.preventDefault();
        const palette = dot.closest('#inkPalette, #paperPalette, #inkPaletteBack, #paperPaletteBack, #bgPalette');
        if (!palette) return;
        const hex = dot.dataset.color;
        if (palette.id === 'inkPalette') setStampColor('front', 'inkColor', hex);
        else if (palette.id === 'paperPalette') setStampColor('front', 'paperColor', hex);
        else if (palette.id === 'inkPaletteBack') setStampColor('back', 'inkColor', hex);
        else if (palette.id === 'paperPaletteBack') setStampColor('back', 'paperColor', hex);
        else if (palette.id === 'bgPalette') pickStampColor('bgColor', hex);
    });
}
function initSceneStates() {
    sceneRaw.front = captureRaw();
    sceneRaw.back = Object.assign({}, sceneRaw.front);
}

function handleControlChange(id) {
    sceneRaw[scene] = captureRaw();
    if (SHARED_CONTROLS.has(id)) {
        const other = scene === 'front' ? 'back' : 'front';
        const el = $(id);
        if (el) sceneRaw[other][id] = el.type === 'checkbox' ? el.checked : el.value;
        bustSceneCache(other);
    }
    syncLabels();
    redraw();
}

function setupControlListeners() {
    CONTROLS.forEach(id => {
        on(id, 'input', () => handleControlChange(id));
        on(id, 'change', () => handleControlChange(id));
    });
    on('bgMode', 'change', updateBgModeUI);
    on('frontUploadBtn', 'click', () => $('imageUpload')?.click());
    on('imageUpload', 'change', handleUpload);
    on('potenzaSelect', 'change', handlePotenzaSelect);
    on('mapSelect', 'change', handleMapSelect);
    on('downloadBtn', 'click', () => {
        saveCanvas(p5Canvas, 'gfp-' + scene + '-' + Date.now(), 'png');
        toast('PNG salvato');
    });
    on('sceneFront', 'click', () => switchScene('front'));
    on('sceneBack', 'click', () => switchScene('back'));
    on('flipBtn', 'click', () => switchScene(scene === 'front' ? 'back' : 'front'));
    on('generateBtn', 'click', generateVideo);

    // movimento automatico displacement (non fa parte dello stato scena)
    on('dispAnim', 'change', () => { dispAnim.x = dispAnim.y = 0; bustSceneCache('front'); redraw(); });
    ['dispAnimAmp', 'dispAnimSpeed'].forEach(id => on(id, 'input', () => { syncLabels(); redraw(); }));

    // adesivo sul retro (scelto da select)
    on('stickerSelect', 'change', handleStickerSelect);
    on('stickerScale', 'input', () => {
        retroSticker.scale = (parseFloat($('stickerScale').value) || 40) / 100;
        if ($('val_stickerScale')) $('val_stickerScale').textContent = $('stickerScale').value + '%';
        bustSceneCache('back'); redraw();
    });
}

// scala adesivo corrente dallo slider (frazione 0..1)
function currentStickerScale() { return (parseFloat($('stickerScale')?.value) || 40) / 100; }

// popola la select degli adesivi
function populateStickers() {
    const sel = $('stickerSelect');
    if (!sel) return;
    sel.innerHTML = '<option value="none" selected>Nessuno</option>' +
        STICKERS.map(s => `<option value="${s.id}">${s.label}</option>`).join('');
}

function handleStickerSelect(event) {
    const v = event.target.value;
    if (v === 'none') {
        retroSticker.img = null; retroStickerVersion++;
        bustSceneCache('back'); redraw();
        return;
    }
    const s = STICKERS.find(x => x.id === v);
    if (!s) return;
    const apply = im => {
        retroSticker.img = im; retroSticker.scale = currentStickerScale();
        retroSticker.x = 0.5; retroSticker.y = 0.5;
        retroStickerVersion++;
        bustSceneCache('back');
        if (scene !== 'back') switchScene('back'); else redraw();
        toast(s.label + ' — trascinalo sul retro');
    };
    if (stickerCache[v]) { apply(stickerCache[v]); return; }
    loadImage(s.file, im => { stickerCache[v] = im; apply(im); }, () => toast('Manca ' + s.file));
}

function switchScene(to) {
    if (recording || flipping || encoding || to === scene) return;
    startFlip(to);
}

function handleUpload(event) {
    const file = event.target.files[0];
    if (!file) return;
    if (!/^image\//.test(file.type)) { toast('Serve un file immagine'); event.target.value = ''; return; }
    const sc = scene;
    const reader = new FileReader();
    reader.onload = e => loadImage(
        e.target.result,
        loaded => {
            sceneImg[sc] = loaded; imgVersion[sc]++;
            if ($('imgScale')) $('imgScale').value = 1;
            if ($('imgOffsetX')) $('imgOffsetX').value = 0;
            if ($('imgOffsetY')) $('imgOffsetY').value = 0;
            sceneRaw[sc] = captureRaw(); syncLabels();
            if (sc === scene) redraw();
            updateFrontUploadUI();
            toast('Immagine caricata');
        },
        () => toast('Immagine non valida')
    );
    reader.onerror = () => toast('Errore lettura file');
    reader.readAsDataURL(file);
}

// popola la select della galleria Potenza
function populatePotenza() {
    const sel = $('potenzaSelect');
    if (!sel) return;
    sel.innerHTML = '<option value="none">Nessuna</option>' +
        POTENZA.map(p => `<option value="${p.id}">${p.label}</option>`).join('');
}

// applica una foto della galleria al fronte (resetta scala/offset)
function applyPotenzaImage(im, p) {
    sceneImg.front = im; imgVersion.front++;
    sceneRaw.front.imgScale = '1';
    sceneRaw.front.imgOffsetX = '0';
    sceneRaw.front.imgOffsetY = '0';
    bustSceneCache('front');
    updateFrontUploadUI();
    if (scene !== 'front') switchScene('front');
    else { applyRaw(sceneRaw.front); redraw(); }
    if (p) toast(p.label);
}

function handlePotenzaSelect(event) {
    const v = event.target.value;
    if (v === 'none') {
        sceneImg.front = null; imgVersion.front++;
        bustSceneCache('front'); updateFrontUploadUI();
        if (scene === 'front') redraw();
        return;
    }
    const p = POTENZA.find(x => x.id === v);
    if (!p) return;
    if (potenzaCache[v]) { applyPotenzaImage(potenzaCache[v], p); return; }
    loadImage(p.file, im => { potenzaCache[v] = im; applyPotenzaImage(im, p); }, () => toast('Manca ' + p.file));
}

// carica la foto di partenza all'avvio (prima della galleria)
function applyDefaultPotenza() {
    if (!POTENZA.length) return;
    const p = POTENZA[0];
    const sel = $('potenzaSelect');
    if (sel) sel.value = p.id;
    loadImage(p.file, im => {
        potenzaCache[p.id] = im;
        sceneImg.front = im; imgVersion.front++;
        bustSceneCache('front'); updateFrontUploadUI();
        if (scene === 'front') redraw();
    }, () => { /* immagine assente: resta il default */ });
}

// mappe displacement incluse (file in maps/)
const MAP_FILES = ['Caciocavallo podolico.jpg', 'Cartellata lucana.jpg', 'Filetto lucano.jpg', 'Pane di Matera IGP.jpg', 'Peperone crusco.jpg', 'Salsiccia lucanica di Picerno.jpg', 'Strascinati con la mollica.jpg', 'Tumact me tulez.jpg'];
const MAPS = MAP_FILES.map((f, i) => ({
    id: 'm' + (i + 1),
    file: `maps/${encodeURIComponent(f)}`,
    label: f.replace(/\.[^.]+$/, '')   // nome file senza estensione
}));

function populateMaps() {
    const sel = $('mapSelect');
    if (!sel) return;
    let html = '<option value="none">Nessuna</option>';
    const defaultId = 'm8';
    MAPS.forEach(m => { html += `<option value="${m.id}"${m.id === defaultId ? ' selected' : ''}>${m.label}</option>`; });
    sel.innerHTML = html;
    // attiva la texture 8 di default
    loadMapById(defaultId);
}

function loadMapById(id) {
    const m = MAPS.find(x => x.id === id);
    if (!m) return;
    loadImage(
        m.file,
        im => { mapImg = im; mapVersion++; redraw(); toast('Mappa: ' + m.label); },
        () => toast('Manca ' + m.file)
    );
}

// popola la select delle foto sfondo area con i nomi file (senza estensione)
function populateBgPhotos() {
    const sel = $('bgPhoto');
    if (!sel) return;
    sel.innerHTML = BG_PHOTOS.map((m, i) =>
        `<option value="${m.id}"${i === 0 ? ' selected' : ''}>${m.label}</option>`).join('');
}

function handleMapSelect(event) {
    const v = event.target.value;
    if (v === 'none') { mapImg = null; mapVersion++; redraw(); return; }
    loadMapById(v);
}

// ---- overlay testi festival (SVG) sul fronte ----
// rasterizza il vettoriale ad alta risoluzione (testo nitido, nero pieno)
function loadFrontText() {
    const SCALE = 3;
    fetch('front-text.svg')
        .then(r => r.text())
        .then(txt => {
            const svgHi = txt
                .replace(/width="(\d+)"/, (_, w) => `width="${w * SCALE}"`)
                .replace(/height="(\d+)"/, (_, h) => `height="${h * SCALE}"`);
            const url = URL.createObjectURL(new Blob([svgHi], { type: 'image/svg+xml' }));
            const im = new Image();
            im.onload = () => {
                const g = createGraphics(im.width, im.height);
                g.pixelDensity(1);
                g.drawingContext.drawImage(im, 0, 0);
                frontTextImg = g;
                frontTextWhite = recolorMask(g, '#ffffff');
                frontTextVersion++; bustSceneCache('front'); redraw();
                URL.revokeObjectURL(url);
            };
            im.onerror = () => URL.revokeObjectURL(url);
            im.src = url;
        })
        .catch(() => { /* svg assente: nessun overlay */ });
}

// assicura che Reenie Beanie sia pronto prima di disegnare il messaggio retro
function loadRetroFont() {
    if (!document.fonts || !document.fonts.load) return;
    document.fonts.load('64px "' + RETRO_MSG_FONT + '"')
        .then(() => { bustSceneCache('back'); redraw(); })
        .catch(() => {});
}

// carica il layout cartolina del retro (testo grezzo, ricolorato a runtime)
function loadRetroText() {
    fetch('retro.svg')
        .then(r => r.text())
        .then(txt => { retroSvgRaw = txt; bustSceneCache('back'); redraw(); })
        .catch(() => { /* svg assente: retro vuoto */ });
}

// rasterizza retro.svg (forme bianche con maschere) e lo ricolora con l'ink.
// async: alla prima richiesta con ink nuovo rasterizza e invalida la cache 'back'.
function ensureRetroImg(inkHex) {
    if (!retroSvgRaw) return null;
    if (retroImgKey === inkHex) return retroImg;
    if (retroBusy) return retroImg;            // usa la raster precedente finché carica
    retroBusy = true;
    const SCALE = 3;
    const svgHi = retroSvgRaw
        .replace(/width="(\d+)"/, (_, w) => `width="${w * SCALE}"`)
        .replace(/height="(\d+)"/, (_, h) => `height="${h * SCALE}"`);
    const url = URL.createObjectURL(new Blob([svgHi], { type: 'image/svg+xml' }));
    const im = new Image();
    im.onload = () => {
        const g = createGraphics(im.width, im.height);
        g.pixelDensity(1);
        g.drawingContext.drawImage(im, 0, 0);
        const tinted = recolorMask(g, inkHex);   // forme bianche -> ink, alpha preservato
        g.remove();
        if (retroImg) retroImg.remove();
        retroImg = tinted; retroImgKey = inkHex; retroBusy = false; retroVersion++;
        bustSceneCache('back'); redraw();
        URL.revokeObjectURL(url);
    };
    im.onerror = () => { retroBusy = false; URL.revokeObjectURL(url); };
    im.src = url;
    return retroImg;
}

// ricolora la silhouette di un'immagine (mantiene l'alpha originale)
function recolorMask(im, hex) {
    const g = createGraphics(im.width, im.height);
    g.pixelDensity(1);
    g.image(im, 0, 0);
    g.drawingContext.globalCompositeOperation = 'source-in';
    g.drawingContext.fillStyle = hex;
    g.drawingContext.fillRect(0, 0, im.width, im.height);
    g.drawingContext.globalCompositeOperation = 'source-over';
    return g;
}

function drawFrontText(pg, W, H) {
    if (!frontTextImg) return;
    const im = (S.textColor === 'white' && frontTextWhite) ? frontTextWhite : frontTextImg;
    const s = S.textScale || 0.95;   // scala regolabile, centrata
    const w = W * s, h = H * s;
    const ctx = pg.drawingContext;
    const prev = ctx.globalCompositeOperation;
    ctx.globalCompositeOperation = S.textBlend || 'source-over';
    pg.image(im, (W - w) / 2, (H - h) / 2, w, h);
    ctx.globalCompositeOperation = prev;
}

// ---- sfondo AREA: tinta piatta / foto full-canvas ----
function updateBgModeUI() {
    const mode = $('bgMode') ? $('bgMode').value : 'flat';
    if ($('bgFlatRow')) $('bgFlatRow').classList.toggle('hidden', mode !== 'flat');
    if ($('bgPhotoRow')) $('bgPhotoRow').classList.toggle('hidden', mode !== 'photo');
}

function getBgPhoto(id) {
    if (!id || id === 'none') return null;
    if (bgPhotoCache[id]) return bgPhotoCache[id];
    if (!bgPhotoLoading[id]) {
        bgPhotoLoading[id] = true;
        const m = BG_PHOTOS.find(x => x.id === id);
        if (m) loadImage(
            m.file,
            im => { bgPhotoCache[id] = im; bgPhotoVersion++; redraw(); },
            () => { bgPhotoLoading[id] = false; toast('Manca ' + m.file); }
        );
    }
    return null;
}

// sfondo dell'area (canvas principale): foto cover-fit oppure tinta piatta
function drawAreaBackground() {
    const raw = sceneRaw[scene] || sceneRaw.front;
    if (raw.bgMode === 'photo') {
        const im = getBgPhoto(raw.bgPhoto);
        if (im) {
            const ir = im.width / im.height, tr = MAIN_W / MAIN_H;
            let dw, dh;
            if (ir > tr) { dh = MAIN_H; dw = MAIN_H * ir; } else { dw = MAIN_W; dh = MAIN_W / ir; }
            push();
            imageMode(CORNER);
            image(im, (MAIN_W - dw) / 2, (MAIN_H - dh) / 2, dw, dh);
            pop();
            return;
        }
    }
    background(raw.bgColor || '#101010');
}

function createDefaultStamp() {
    let pg = createGraphics(800, 1000);
    for (let y = 0; y < 1000; y++) {
        let t = y / 1000;
        pg.stroke(lerpColor(color('#eef1f6'), color('#cdd4e0'), t));
        pg.line(0, y, 800, y);
    }
    defaultImg = pg.get();
    pg.remove();
}

function syncLabels() {
    for (const id in SLIDER_FMT) {
        const el = $(id), sp = $('val_' + id);
        if (el && sp) sp.textContent = SLIDER_FMT[id](el.value);
    }
}

// ---- settings da uno stato raw (no DOM) ----
function settingsFrom(raw) {
    const g = id => raw[id];
    return {
        ink: color(g('inkColor')),
        paper: color(g('paperColor')),
        inkHex: g('inkColor'),
        paperHex: g('paperColor'),
        bg: g('bgColor'),
        imgScale: parseFloat(g('imgScale')),
        imgX: parseFloat(g('imgOffsetX')),
        imgY: parseFloat(g('imgOffsetY')),
        dispX: parseFloat(g('dispX')) + dispAnim.x,
        dispY: parseFloat(g('dispY')) + dispAnim.y,
        emboss: parseFloat(g('emboss')),
        embossHi: parseFloat(g('embossHi')),
        embossBias: parseFloat(g('embossBias')),
        embossDir: g('embossMode') === 'deboss' ? -1 : 1,
        srcPhoto: g('reliefSource') === 'map' ? 0 : 1,
        srcMap: (g('reliefSource') === 'map' || g('reliefSource') === 'both') ? 1 : 0,
        mapStrength: parseFloat(g('mapStrength')) / 100,
        mapScale: parseFloat(g('mapScale')),
        mapContrast: parseFloat(g('mapContrast')) / 100,
        threshold: parseFloat(g('threshold')),
        softness: parseFloat(g('softness')),
        frontText: !!g('frontText'),
        textScale: (parseFloat(g('textScale')) || 95) / 100,
        textColor: g('textColor') || 'black',
        textBlend: g('textBlend') || 'source-over',
        retroMsg: g('retroMsg') || '',
        perf: !!g('showPerforations'),
        perfR: parseInt(g('perfRadius')),
        perfS: parseInt(g('perfSpacing')),
        // retro (testo fisso)
        title: RETRO_TEXT.title, sub: RETRO_TEXT.sub, cjk: RETRO_TEXT.cjk,
        font: RETRO_TEXT.font, track: RETRO_TEXT.track
    };
}

// ====================================================================
// DRAW + scene + flip 3D
// ====================================================================
function computeSize() { return { W: STAMP_FW, H: STAMP_FH }; }

function sceneKey(which) {
    const st = (which === 'back' && retroSticker.img)
        ? `|sk${retroStickerVersion}_${retroSticker.x.toFixed(3)}_${retroSticker.y.toFixed(3)}_${retroSticker.scale.toFixed(3)}` : '';
    return JSON.stringify(sceneRaw[which]) + '|' + imgVersion[which] + '|m' + mapVersion +
        '|bg' + bgPhotoVersion + '|t' + frontTextVersion + '|r' + retroVersion + st + '|' + which;
}

function buildScene(which) {
    S = settingsFrom(sceneRaw[which]);
    S.preset = which === 'back' ? 'retro' : 'photo';
    img = sceneImg[which] || defaultImg;
    const { W, H } = computeSize();
    STAMP_W = W; STAMP_H = H;

    const key = sceneKey(which);
    if (sceneCache[which] && cacheKey[which] === key) return sceneCache[which];
    if (sceneCache[which]) sceneCache[which].remove();

    const pg = createGraphics(W, H);
    pg.pixelDensity(1);
    buildStamp(pg, W, H);
    sceneCache[which] = pg; cacheKey[which] = key;
    return pg;
}

function placeStamp(pg, sx) {
    push();
    translate(stampX, stampY);
    scale(Math.max(Math.abs(sx), 0.0001), 1);
    imageMode(CENTER);
    image(pg, 0, 0);
    pop();
}

function draw() {
    if (!defaultImg) return;
    if (encoding) return;
    if (recording) { renderTimeline(); return; }

    drawAreaBackground();
    stampX = constrain(stampX, 0, MAIN_W);
    stampY = constrain(stampY, 0, MAIN_H);

    if (introActive) { renderIntro(); return; }
    if (flipping) { renderFlip(); return; }

    const anim = dispAnimRunning();
    let pg;
    if (anim) {
        const t = millis() * dispAnimSpeed();
        const amp = dispAnimAmp();
        dispAnim.x = Math.sin(t * 0.0006) * amp;
        dispAnim.y = Math.cos(t * 0.00047) * amp;
        pg = buildFrontAnimated();
    } else {
        dispAnim.x = dispAnim.y = 0;
        pg = buildScene(scene);
    }
    stampX = constrain(stampX, STAMP_W / 2, MAIN_W - STAMP_W / 2);
    stampY = constrain(stampY, STAMP_H / 2, MAIN_H - STAMP_H / 2);
    placeStamp(pg, 1);
    if (anim) loop(); else noLoop();
}

// condizioni per il movimento automatico del displacement
function dispAnimRunning() {
    return !!($('dispAnim') && $('dispAnim').checked) &&
        scene === 'front' && !!mapImg &&
        !recording && !encoding && !flipping && !introActive;
}
function dispAnimAmp() { const v = parseFloat($('dispAnimAmp')?.value); return isNaN(v) ? 12 : v; }
function dispAnimSpeed() { const v = parseFloat($('dispAnimSpeed')?.value); return isNaN(v) ? 1 : v; }

// costruisce il fronte in un buffer riusato, bypassando la cache (rebuild per frame)
function buildFrontAnimated() {
    S = settingsFrom(sceneRaw.front);
    S.preset = 'photo';
    img = sceneImg.front || defaultImg;
    const { W, H } = computeSize();
    STAMP_W = W; STAMP_H = H;
    if (!animBuf || animBufW !== W || animBufH !== H) {
        if (animBuf) animBuf.remove();
        animBuf = createGraphics(W, H); animBuf.pixelDensity(1);
        animBufW = W; animBufH = H;
    }
    buildStamp(animBuf, W, H);
    return animBuf;
}

function renderFlip() {
    if (!flipBufA) {
        flipBufA = buildScene(flipFrom);
        flipBufB = buildScene(flipTo);
    }
    flipT += 0.05;
    const a = Math.min(flipT, 1) * Math.PI;
    const s = Math.cos(a);
    placeStamp(s >= 0 ? flipBufA : flipBufB, s);
    if (flipT >= 1) {
        flipping = false; flipT = 0; scene = flipTo;
        flipBufA = flipBufB = null;
        applyRaw(sceneRaw[scene]);
        updateSceneUI();
        if (dispAnimRunning()) { redraw(); return; } // riavvia il movimento sul fronte
        noLoop();
    }
}

// entrata: cartolina ruota 360°, veloce poi rallenta (ease-out)
function startIntro() {
    if (recording || encoding) return;
    introBufF = buildScene('front');
    introBufB = buildScene('back');
    introActive = true; introStart = millis();
    loop();
}

function renderIntro() {
    if (!introBufF) introBufF = buildScene(scene);
    let p = (millis() - introStart) / INTRO_DUR;
    if (p >= 1) {
        introActive = false; introBufF = introBufB = null;
        placeStamp(buildScene(scene), 1);
        resetUploadBtnTransform();
        updateFrontUploadUI();
        if (dispAnimRunning()) { redraw(); return; } // avvia il movimento displacement
        noLoop();
        return;
    }
    const e = introEase(p);
    const k = INTRO_FROM + (1 - INTRO_FROM) * e; // scala
    const a = Math.min(1, e * 1.3);              // fade-in leggermente più rapido
    placeStampZoom(introBufF, k, a);
    syncUploadBtnToZoom(k, a);
}

// disegna lo stamp con zoom uniforme + opacità
function placeStampZoom(pg, k, alpha) {
    push();
    translate(stampX, stampY);
    scale(k);
    imageMode(CENTER);
    if (alpha < 1) tint(255, alpha * 255);
    image(pg, 0, 0);
    pop();
}

// fa seguire il bottone "Carica immagine" allo zoom della cartolina
function syncUploadBtnToZoom(k, alpha) {
    const btn = $('frontUploadBtn');
    if (!btn) return;
    if (scene === 'front' && !sceneImg.front) {
        btn.classList.remove('hidden');
        btn.style.pointerEvents = 'none';
        btn.style.transform = `translate(-50%,-50%) scale(${k})`;
        btn.style.opacity = (0.5 * alpha).toString();
    } else {
        btn.classList.add('hidden');
    }
}

function resetUploadBtnTransform() {
    const btn = $('frontUploadBtn');
    if (!btn) return;
    btn.style.transform = '';
    btn.style.pointerEvents = '';
    btn.style.opacity = '';
}

function startFlip(to) {
    if (introActive || flipping || recording || encoding) return;
    if (to === scene) { redraw(); return; }
    flipFrom = scene; flipTo = to;
    flipping = true; flipT = 0; flipBufA = flipBufB = null;
    updateFrontUploadUI();
    loop();
}

function updateSceneUI() {
    const onCls = 'flex-1 py-2 rounded-md text-[11px] transition-colors bg-neutral-200 text-black font-medium';
    const offCls = 'flex-1 py-2 rounded-md text-[11px] transition-colors border border-neutral-700 text-neutral-300 hover:bg-neutral-800';
    if ($('sceneFront')) $('sceneFront').className = scene === 'front' ? onCls : offCls;
    if ($('sceneBack')) $('sceneBack').className = scene === 'back' ? onCls : offCls;
    updateFrontUploadUI();
}

// mostra il widget di upload solo sul fronte quando manca l'immagine
function updateFrontUploadUI() {
    const btn = $('frontUploadBtn');
    if (!btn) return;
    const show = scene === 'front' && !sceneImg.front && !flipping;
    btn.classList.toggle('hidden', !show);
}

// ====================================================================
// VIDEO — MP4 (WebCodecs + mp4-muxer) con fallback WebM
// ====================================================================
async function generateVideo() {
    if (recording || flipping || encoding) return;
    const btn = $('generateBtn');
    stampX = MAIN_W / 2; stampY = MAIN_H / 2;
    recBufFront = buildScene('front');
    recBufBack = buildScene('back');

    if (window.VideoEncoder && window.Mp4Muxer) {
        try { await encodeMP4(btn); }
        catch (err) { toast('MP4 fallito: ' + err.message); encoding = false; restoreGenBtn(btn); redraw(); }
    } else {
        toast('WebCodecs assente: esporto WebM');
        startWebM(btn);
    }
}

function restoreGenBtn(btn) {
    if (!btn) return;
    btn.disabled = false;
    btn.innerHTML = '<i data-lucide="clapperboard" class="w-4 h-4"></i> Scarica video MP4';
    if (window.lucide) lucide.createIcons();
}

function downloadBlob(blob, name) {
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = name;
    document.body.appendChild(a); a.click(); a.remove();
    URL.revokeObjectURL(url);
}

// il movimento automatico è attivo (a prescindere da scena/registrazione)
function dispAnimEnabled() { return !!($('dispAnim') && $('dispAnim').checked) && !!mapImg; }

function videoFrameAt(t) {
    drawAreaBackground();
    // fronte con displacement animato, pilotato dal tempo del video (deterministico)
    let front = recBufFront;
    if (dispAnimEnabled()) {
        const tt = t * dispAnimSpeed(), amp = dispAnimAmp();
        dispAnim.x = Math.sin(tt * 0.0006) * amp;
        dispAnim.y = Math.cos(tt * 0.00047) * amp;
        front = buildFrontAnimated();
    }
    // segmento iniziale: zoom-in di entrata
    if (t < INTRO_DUR) {
        const e = introEase(t / INTRO_DUR);
        const k = INTRO_FROM + (1 - INTRO_FROM) * e;
        const a = Math.min(1, e * 1.3);
        placeStampZoom(front, k, a);
        return;
    }
    t -= INTRO_DUR;
    const A = REC.holdFront, B = A + REC.flip, C = B + REC.holdBack, D = C + REC.flip;
    let buf = front, s = 1;
    if (t < A) { buf = front; s = 1; }
    else if (t < B) { const p = (t - A) / REC.flip; s = Math.cos(p * Math.PI); buf = s >= 0 ? front : recBufBack; }
    else if (t < C) { buf = recBufBack; s = 1; }
    else if (t < D) { const p = (t - C) / REC.flip; s = Math.cos(p * Math.PI); buf = s >= 0 ? recBufBack : front; }
    else { buf = front; s = 1; }
    placeStamp(buf, s);
}

async function encodeMP4(btn) {
    const fps = 30, W = MAIN_W, H = MAIN_H;
    const total = INTRO_DUR + REC.holdFront + REC.holdBack + 2 * REC.flip;
    const nFrames = Math.round(total / 1000 * fps);

    const candidates = ['avc1.4D4028', 'avc1.640028', 'avc1.4D4032', 'avc1.42E028'];
    let codec = null;
    for (const c of candidates) {
        try {
            const r = await VideoEncoder.isConfigSupported({ codec: c, width: W, height: H, bitrate: 8e6, framerate: fps });
            if (r.supported) { codec = c; break; }
        } catch (e) {}
    }
    if (!codec) { toast('Codec H.264 non disponibile: esporto WebM'); startWebM(btn); return; }

    encoding = true; noLoop();
    if (btn) { btn.disabled = true; btn.innerHTML = '● 0%'; }

    const { Muxer, ArrayBufferTarget } = Mp4Muxer;
    const muxer = new Muxer({
        target: new ArrayBufferTarget(),
        video: { codec: 'avc', width: W, height: H },
        fastStart: 'in-memory'
    });
    const encoder = new VideoEncoder({
        output: (chunk, meta) => muxer.addVideoChunk(chunk, meta),
        error: e => toast('Encoder: ' + e.message)
    });
    encoder.configure({ codec, width: W, height: H, bitrate: 8e6, framerate: fps });

    const usPerFrame = 1e6 / fps;
    for (let i = 0; i < nFrames; i++) {
        videoFrameAt(i / fps * 1000);
        const frame = new VideoFrame(p5Canvas.elt, { timestamp: Math.round(i * usPerFrame), duration: Math.round(usPerFrame) });
        encoder.encode(frame, { keyFrame: i % 30 === 0 });
        frame.close();
        if (i % 6 === 0) { if (btn) btn.innerHTML = '● ' + Math.round(i / nFrames * 100) + '%'; await new Promise(r => setTimeout(r)); }
    }
    await encoder.flush();
    muxer.finalize();
    encoder.close();

    downloadBlob(new Blob([muxer.target.buffer], { type: 'video/mp4' }), 'gfp-' + Date.now() + '.mp4');
    toast('Video MP4 esportato');
    encoding = false; recBufFront = recBufBack = null;
    restoreGenBtn(btn); redraw();
}

function startWebM(btn) {
    if (!p5Canvas.elt.captureStream || typeof MediaRecorder === 'undefined') { toast('Registrazione non supportata'); return; }
    if (document.hidden) toast('Tieni questa tab attiva durante la generazione');
    recChunks = [];
    let stream;
    try {
        stream = p5Canvas.elt.captureStream(30);
        const mime = MediaRecorder.isTypeSupported('video/webm;codecs=vp9') ? 'video/webm;codecs=vp9'
            : (MediaRecorder.isTypeSupported('video/webm') ? 'video/webm' : '');
        mediaRecorder = new MediaRecorder(stream, mime ? { mimeType: mime, videoBitsPerSecond: 8e6 } : undefined);
    } catch (err) { toast('WebM non avviato: ' + err.message); return; }
    mediaRecorder.ondataavailable = e => { if (e.data && e.data.size) recChunks.push(e.data); };
    mediaRecorder.onstop = () => { downloadBlob(new Blob(recChunks, { type: 'video/webm' }), 'gfp-' + Date.now() + '.webm'); toast('Video WebM esportato'); restoreGenBtn(btn); };
    mediaRecorder.onerror = () => { toast('Errore registrazione'); recording = false; restoreGenBtn(btn); noLoop(); redraw(); };
    recording = true; recT0 = millis();
    if (btn) { btn.disabled = true; btn.innerHTML = '● Registrazione…'; }
    try { mediaRecorder.start(); }
    catch (err) { toast('Avvio fallito: ' + err.message); recording = false; restoreGenBtn(btn); return; }
    loop();
}

function renderTimeline() {
    const t = millis() - recT0;
    const D = INTRO_DUR + REC.holdFront + REC.holdBack + 2 * REC.flip;
    if (t >= D) {
        if (mediaRecorder && mediaRecorder.state !== 'inactive') mediaRecorder.stop();
        recording = false; recBufFront = recBufBack = null;
        noLoop(); redraw();
        return;
    }
    videoFrameAt(t);
}

// ====================================================================
// EFFETTO WEBGL — Displacement + Emboss + Bitonale
// ====================================================================
const VERT_SRC = `
  attribute vec2 a_position;
  attribute vec2 a_texCoord;
  varying vec2 v_texCoord;
  void main() {
    gl_Position = vec4(a_position, 0.0, 1.0);
    v_texCoord = a_texCoord;
  }
`;
const FRAG_SRC = `
  precision mediump float;
  varying vec2 v_texCoord;
  uniform sampler2D u_image;
  uniform sampler2D u_map;
  uniform vec2 u_scale;
  uniform float u_hasMap;
  uniform vec2 u_resolution;
  uniform float u_embossStrength;
  uniform float u_embossBias;
  uniform float u_embossHighlights;
  uniform float u_embossDir; // +1 rilievo (emboss) · -1 scavato (deboss)
  uniform float u_srcPhoto;  // il rilievo legge la foto
  uniform float u_srcMap;    // il rilievo legge la mappa
  uniform float u_mapStrength;
  uniform float u_mapScale;
  uniform float u_mapContrast;
  uniform float u_threshold;
  uniform float u_softness;
  uniform vec3 u_colorDark;
  uniform vec3 u_colorLight;

  float lum(vec3 c) { return dot(c, vec3(0.299, 0.587, 0.114)); }

  // coordinata mappa con scala (zoom attorno al centro)
  vec2 mapUV(vec2 uv) { return (uv - 0.5) / u_mapScale + 0.5; }

  // luminanza mappa con contrasto regolabile
  float mapLum(vec2 uv) {
    float ml = lum(texture2D(u_map, mapUV(uv)).rgb);
    return clamp((ml - 0.5) * u_mapContrast + 0.5, 0.0, 1.0);
  }

  vec2 getDisplacedCoord(vec2 uv) {
    if (u_hasMap > 0.5) {
      vec4 mapColor = texture2D(u_map, mapUV(uv));
      vec2 displacement = vec2(mapColor.r - 0.5, mapColor.g - 0.5) * 2.0;
      return clamp(uv + displacement * u_scale, 0.0, 1.0);
    }
    return clamp(uv, 0.0, 1.0);
  }

  float photoLum(vec2 uv) { return lum(texture2D(u_image, getDisplacedCoord(uv)).rgb); }

  // height-field del rilievo: foto e/o mappa (con intensità mappa)
  float heightAt(vec2 uv) {
    float h = 0.0; float n = 0.0;
    if (u_srcPhoto > 0.5) { h += photoLum(uv); n += 1.0; }
    if (u_srcMap > 0.5 && u_hasMap > 0.5) { h += mapLum(uv) * u_mapStrength; n += 1.0; }
    if (n < 0.5) h = photoLum(uv);   // fallback: foto
    return h;
  }

  void main() {
    float base = photoLum(v_texCoord);   // tono base = sempre la foto
    float gray = base;

    if (u_embossStrength > 0.0 || u_embossHighlights > 0.0) {
      vec2 texel = 1.0 / u_resolution;
      float diffLum = heightAt(v_texCoord - texel) - heightAt(v_texCoord + texel);
      float standardEmboss = diffLum * u_embossStrength * u_embossDir;
      float highlightFactor = pow(base, 1.5);
      float highlightEmboss = diffLum * u_embossHighlights * highlightFactor * u_embossDir;
      gray += standardEmboss + highlightEmboss;
    }
    gray += u_embossBias;

    // u_softness = 0 → bitonale netto; > 0 → rilievo morbido (smoothstep)
    float v;
    if (u_softness <= 0.001) {
      v = step(u_threshold, gray);
    } else {
      v = smoothstep(u_threshold - u_softness, u_threshold + u_softness, gray);
    }
    vec3 outColor = mix(u_colorDark, u_colorLight, v);
    gl_FragColor = vec4(outColor, 1.0);
  }
`;

let glCanvas, gl, glProgram, glReady = false;

function initEffect() {
    glCanvas = document.createElement('canvas');
    gl = glCanvas.getContext('webgl', { preserveDrawingBuffer: true });
    if (!gl) { toast('WebGL non supportato'); return; }

    const compile = (type, src) => {
        const sh = gl.createShader(type);
        gl.shaderSource(sh, src); gl.compileShader(sh);
        if (!gl.getShaderParameter(sh, gl.COMPILE_STATUS)) { console.error(gl.getShaderInfoLog(sh)); return null; }
        return sh;
    };
    const vs = compile(gl.VERTEX_SHADER, VERT_SRC);
    const fs = compile(gl.FRAGMENT_SHADER, FRAG_SRC);
    if (!vs || !fs) return;

    glProgram = gl.createProgram();
    gl.attachShader(glProgram, vs); gl.attachShader(glProgram, fs); gl.linkProgram(glProgram);
    if (!gl.getProgramParameter(glProgram, gl.LINK_STATUS)) { console.error(gl.getProgramInfoLog(glProgram)); return; }
    gl.useProgram(glProgram);

    const pos = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, pos);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1,-1, 1,-1, -1,1, -1,1, 1,-1, 1,1]), gl.STATIC_DRAW);
    const tc = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, tc);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([0,1, 1,1, 0,0, 0,0, 1,1, 1,0]), gl.STATIC_DRAW);

    const pl = gl.getAttribLocation(glProgram, 'a_position');
    gl.enableVertexAttribArray(pl); gl.bindBuffer(gl.ARRAY_BUFFER, pos); gl.vertexAttribPointer(pl, 2, gl.FLOAT, false, 0, 0);
    const tl = gl.getAttribLocation(glProgram, 'a_texCoord');
    gl.enableVertexAttribArray(tl); gl.bindBuffer(gl.ARRAY_BUFFER, tc); gl.vertexAttribPointer(tl, 2, gl.FLOAT, false, 0, 0);
    glReady = true;
}

function hexToRgb(hex) {
    const h = (hex || '#000000').replace('#', '');
    return [parseInt(h.slice(0, 2), 16) / 255, parseInt(h.slice(2, 4), 16) / 255, parseInt(h.slice(4, 6), 16) / 255];
}

// applica lo shader a srcCanvas (con map opzionale) → ritorna glCanvas WxH
function runEffect(srcCanvas, mapCanvas, W, H) {
    if (!glReady) return null;
    glCanvas.width = W; glCanvas.height = H;
    gl.viewport(0, 0, W, H);

    const mkTex = (unit, source, neutral) => {
        gl.activeTexture(gl.TEXTURE0 + unit);
        const t = gl.createTexture();
        gl.bindTexture(gl.TEXTURE_2D, t);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
        if (source) gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, source);
        else if (neutral) gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, 1, 1, 0, gl.RGBA, gl.UNSIGNED_BYTE, new Uint8Array([128, 128, 128, 255]));
        return t;
    };
    const t0 = mkTex(0, srcCanvas, false);
    const t1 = mkTex(1, mapCanvas, true);

    const u = n => gl.getUniformLocation(glProgram, n);
    gl.uniform1i(u('u_image'), 0);
    gl.uniform1i(u('u_map'), 1);
    gl.uniform2f(u('u_scale'), S.dispX / 500, S.dispY / 500);
    gl.uniform1f(u('u_hasMap'), mapCanvas ? 1 : 0);
    gl.uniform2f(u('u_resolution'), W, H);
    gl.uniform1f(u('u_embossStrength'), S.emboss / 5);
    gl.uniform1f(u('u_embossBias'), S.embossBias / 100);
    gl.uniform1f(u('u_embossHighlights'), S.embossHi / 5);
    gl.uniform1f(u('u_embossDir'), S.embossDir);
    gl.uniform1f(u('u_srcPhoto'), S.srcPhoto);
    gl.uniform1f(u('u_srcMap'), S.srcMap);
    gl.uniform1f(u('u_mapStrength'), S.mapStrength);
    gl.uniform1f(u('u_mapScale'), S.mapScale);
    gl.uniform1f(u('u_mapContrast'), S.mapContrast);
    gl.uniform1f(u('u_threshold'), S.threshold / 100);
    gl.uniform1f(u('u_softness'), S.softness / 100);
    gl.uniform3fv(u('u_colorDark'), hexToRgb(S.inkHex));
    gl.uniform3fv(u('u_colorLight'), hexToRgb(S.paperHex));

    gl.drawArrays(gl.TRIANGLES, 0, 6);
    gl.deleteTexture(t0); gl.deleteTexture(t1);
    return glCanvas;
}

// ====================================================================
// COSTRUZIONE FRANCOBOLLO
// ====================================================================
function buildStamp(pg, W, H) {
    pg.push();
    pg.background(S.paper);
    if (S.preset === 'retro') {
        drawRetro(pg, W, H);
    } else {
        drawPhoto(pg, W, H);
        if (S.frontText) drawFrontText(pg, W, H);  // overlay testi festival
    }
    if (S.perf) punchPerforations(pg, W, H);
    pg.pop();
}

// FRONTE: foto full-bleed processata dallo shader (bitonale inchiostro/carta)
function drawPhoto(pg, W, H) {
    // cache della regione foto: dipende solo da immagine/scala/offset, non dal displacement
    const key = `${imgVersion.front}|${sceneImg.front ? 'u' : 'd'}|${S.imgScale}|${S.imgX}|${S.imgY}|${W}x${H}`;
    if (!photoSrc || photoSrcKey !== key) {
        photoSrc = imageRegion(img, W, H, S.imgScale, S.imgX, S.imgY); // p5.Image WxH
        photoSrcKey = key;
    }
    const out = runEffect(photoSrc.canvas, mapImg ? mapImg.canvas : null, W, H);
    if (out) pg.drawingContext.drawImage(out, 0, 0, W, H);
    else pg.image(photoSrc, 0, 0, W, H);
}

// ritaglia la regione sorgente in base a scala (>=1) e offset (-1..1), poi cover-fit
function imageRegion(srcImg, w, h, scale, ox, oy) {
    const W = Math.ceil(w), H = Math.ceil(h);
    const iw = srcImg.width, ih = srcImg.height, tr = w / h;
    let sw, sh;
    if (iw / ih > tr) { sh = ih; sw = ih * tr; } else { sw = iw; sh = iw / tr; }
    sw /= scale; sh /= scale;
    const cx = iw / 2 + (ox || 0) * (iw - sw) / 2;
    const cy = ih / 2 + (oy || 0) * (ih - sh) / 2;
    const sx = constrain(cx - sw / 2, 0, iw - sw);
    const sy = constrain(cy - sh / 2, 0, ih - sh);
    let c = srcImg.get(sx, sy, sw, sh);
    c.resize(W, H);
    return c;
}

// RETRO: lato gomma + layout cartolina (retro.svg) + messaggio utente
function drawRetro(pg, W, H) {
    gumTexture(pg, W, H);                          // texture gomma di sfondo
    const im = ensureRetroImg(S.inkHex || '#000000'); // layout SVG ricolorato con l'inchiostro
    if (im) pg.image(im, 0, 0, W, H);              // tagline + GREETINGS, full-bleed 920×1600
    drawRetroMessage(pg, W, H);                    // testo manoscritto centrale
    drawRetroSticker(pg, W, H);                    // adesivo PNG trascinabile
}

// adesivo PNG posizionato dall'utente (centro in coordinate normalizzate)
function drawRetroSticker(pg, W, H) {
    if (!retroSticker.img) return;
    const w = W * retroSticker.scale;
    const h = w * retroSticker.img.height / retroSticker.img.width;
    pg.push();
    pg.imageMode(CENTER);
    pg.image(retroSticker.img, retroSticker.x * W, retroSticker.y * H, w, h);
    pg.pop();
}

// dimensioni adesivo in coordinate buffer francobollo
function stickerBox() {
    const w = STAMP_W * retroSticker.scale;
    const h = w * (retroSticker.img.height / retroSticker.img.width);
    return { w, h, cx: retroSticker.x * STAMP_W, cy: retroSticker.y * STAMP_H };
}

// messaggio centrale scritto dall'utente, font Reenie Beanie, centrato e wrappato
function drawRetroMessage(pg, W, H) {
    const txt = (S.retroMsg || '').trim();
    if (!txt) return;
    const size = W * 0.105;                         // grandezza manoscritto
    const lh = size * 1.05;                         // interlinea
    const maxW = W * 0.82;                          // larghezza utile per il wrap
    pg.push();
    pg.textFont(RETRO_MSG_FONT);
    pg.textSize(size);
    pg.textAlign(CENTER, CENTER);
    pg.fill(S.inkHex || '#000000');                 // stesso colore dell'SVG (inchiostro)
    pg.noStroke();
    // wrap: rispetta gli a-capo manuali, poi spezza le righe troppo lunghe
    const lines = [];
    txt.split('\n').forEach(par => {
        let cur = '';
        par.split(/\s+/).forEach(word => {
            const test = cur ? cur + ' ' + word : word;
            if (pg.textWidth(test) > maxW && cur) { lines.push(cur); cur = word; }
            else cur = test;
        });
        lines.push(cur);
    });
    const cy = H * 0.46;                            // centro del blocco tra tagline e GREETINGS
    const y0 = cy - (lines.length - 1) * lh / 2;
    lines.forEach((ln, i) => pg.text(ln, W / 2, y0 + i * lh));
    pg.pop();
}

function colAlpha(c, a) { return color(red(c), green(c), blue(c), a); }

function gumTexture(pg, W, H) {
    pg.push(); pg.stroke(colAlpha(S.ink, 9)); pg.strokeWeight(2);
    for (let x = -H; x < W; x += 13) pg.line(x, 0, x + H, H);
    pg.pop();
}

function postmark(pg, cx, cy, r, ink) {
    pg.push(); pg.noFill(); pg.stroke(ink); pg.strokeWeight(r * 0.05);
    pg.circle(cx, cy, r * 2); pg.circle(cx, cy, r * 1.55);
    pg.pop();
    T(pg, S.cjk || 'POST', cx, cy - r * 0.05, r * 0.42, { col: ink, cjk: !!S.cjk, alignX: CENTER, alignY: CENTER, max: r * 1.2 });
    T(pg, '5 JUN 2026', cx, cy + r * 0.5, r * 0.2, { col: ink, font: 'mono', alignX: CENTER, alignY: CENTER, track: 1 });
}

function wavyLines(pg, x, y, w, amp, ink) {
    pg.push(); pg.noFill(); pg.stroke(ink); pg.strokeWeight(amp * 0.07);
    const n = 6, gap = (amp * 2) / n;
    for (let i = 0; i < n; i++) {
        const yy = y - amp + i * gap;
        pg.beginShape();
        for (let xx = 0; xx <= w; xx += 6) pg.vertex(x + xx, yy + Math.sin(xx * 0.045) * amp * 0.16);
        pg.endShape();
    }
    pg.pop();
}

function T(pg, txt, x, y, size, o = {}) {
    const { col, font = S.font, alignX = LEFT, alignY = BASELINE, track = S.track, cjk = false, max = 0 } = o;
    pg.push();
    pg.textFont(cjk ? CJK_FONT : font);
    pg.textSize(size);
    if (max > 0) {
        pg.drawingContext.letterSpacing = (track || 0) + 'px';
        const tw = pg.textWidth(txt);
        if (tw > max) { size = size * max / tw; pg.textSize(size); }
        pg.drawingContext.letterSpacing = '0px';
    }
    pg.textAlign(alignX, alignY);
    if (col) pg.fill(col);
    pg.noStroke();
    pg.drawingContext.letterSpacing = (track || 0) + 'px';
    pg.text(txt, x, y);
    pg.drawingContext.letterSpacing = '0px';
    pg.pop();
}

// denti perforati
function punchPerforations(pg, W, H) {
    const r = S.perfR, s = S.perfS;
    pg.erase(); pg.noStroke();
    for (let x = 0; x <= W; x += s) { pg.circle(x, 0, r * 2); pg.circle(x, H, r * 2); }
    for (let y = 0; y <= H; y += s) { pg.circle(0, y, r * 2); pg.circle(W, y, r * 2); }
    pg.noErase();
}

// ====================================================================
// DRAG — sul fronte sposta la foto, altrimenti sposta il francobollo
// ====================================================================
// mouse → coordinate interne al buffer francobollo
function mouseToBuffer() {
    return { bx: mouseX - stampX + STAMP_W / 2, by: mouseY - stampY + STAMP_H / 2 };
}

function mousePressed() {
    if (introActive || flipping || recording || encoding) return;
    if (mouseX < 0 || mouseX > width || mouseY < 0 || mouseY > height) return;
    // priorità: trascinamento adesivo sul retro
    if (scene === 'back' && retroSticker.img) {
        const { bx, by } = mouseToBuffer();
        const b = stickerBox();
        if (Math.abs(bx - b.cx) < b.w / 2 && Math.abs(by - b.cy) < b.h / 2) {
            isDragging = true; dragMode = 'sticker';
            stickerGrab = { dx: bx - b.cx, dy: by - b.cy };
            cursor('grabbing');
            return;
        }
    }
    // fronte con foto: pan dell'immagine. L'intera scena non si sposta più.
    if (scene === 'front' && sceneImg.front &&
        Math.abs(mouseX - stampX) < STAMP_W / 2 && Math.abs(mouseY - stampY) < STAMP_H / 2) {
        isDragging = true;
        dragMode = 'pan';
        dragOffsetX = mouseX - stampX;
        dragOffsetY = mouseY - stampY;
        cursor('grab');
    }
}
function mouseDragged() {
    if (!isDragging) return;
    if (dragMode === 'sticker') {
        const { bx, by } = mouseToBuffer();
        retroSticker.x = constrain((bx - stickerGrab.dx) / STAMP_W, 0, 1);
        retroSticker.y = constrain((by - stickerGrab.dy) / STAMP_H, 0, 1);
        bustSceneCache('back'); redraw();
    } else if (dragMode === 'pan') panImage(-2 * (mouseX - pmouseX) / STAMP_W, -2 * (mouseY - pmouseY) / STAMP_H);
    else { stampX = mouseX - dragOffsetX; stampY = mouseY - dragOffsetY; redraw(); }
}
function mouseReleased() { isDragging = false; cursor('default'); }

// ---- touch (mobile): riusa la logica del mouse per tap e trascinamento ----
// p5 registra questi handler su window: vanno gestiti SOLO se il tocco è sul canvas,
// altrimenti annulleremmo il click sintetico di button/slider/sidebar.
function onCanvas(e) { return !e || !p5Canvas || e.target === p5Canvas.elt; }

function touchStarted(e) {
    if (introActive || flipping || recording || encoding) return;
    if (!onCanvas(e)) return;        // tocco su button/slider/sidebar: lascia il comportamento nativo
    mousePressed();
    if (isDragging) return false;    // blocca scroll/zoom della pagina solo mentre trascini
}
function touchMoved() {
    if (!isDragging) return;
    mouseDragged();
    return false;                    // niente scroll della pagina durante il drag
}
function touchEnded() {
    const wasDragging = isDragging;
    mouseReleased();
    if (wasDragging) return false;   // evita il click sintetico solo dopo un drag reale
}

function panImage(dox, doy) {
    const ex = $('imgOffsetX'), ey = $('imgOffsetY');
    if (!ex || !ey) return;
    ex.value = constrain(parseFloat(ex.value) + dox, -1, 1);
    ey.value = constrain(parseFloat(ey.value) + doy, -1, 1);
    sceneRaw.front = captureRaw();
    syncLabels();
    redraw();
}

