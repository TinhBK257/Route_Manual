/**
 * VNA Route Manual v3.0 - Image Lightbox Modal
 * Displays high-resolution airport charts and diagrams with Zoom, Pan, Rotate,
 * Open in New Tab (Blob URL), and Download capabilities.
 */

export class ImageLightboxModal {
  constructor(options = {}) {
    this.getBlobUrlFn = options.getBlobUrlFn || (async (path) => path);
    this.container = null;
    this.imgEl = null;
    this.titleEl = null;
    this.counterEl = null;

    // Transform state
    this.currentScale = 1.0;
    this.currentRotation = 0;
    this.translateX = 0;
    this.translateY = 0;
    this.isDragging = false;
    this.startX = 0;
    this.startY = 0;

    // Image list state
    this.currentImages = [];
    this.currentIndex = 0;
    this.activeBlobUrl = null;

    this.initElement();
    this.attachEvents();
  }

  initElement() {
    let el = document.getElementById('imageLightboxOverlay');
    if (!el) {
      el = document.createElement('div');
      el.id = 'imageLightboxOverlay';
      el.className = 'lightbox-overlay';
      el.innerHTML = `
        <div class="lightbox-topbar">
          <div class="lightbox-title-area">
            <svg width="20" height="20" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24" style="color:var(--accent-cyan);"><path d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z"/></svg>
            <div>
              <div class="lightbox-title" id="lightboxTitle">Sơ đồ Sân bay</div>
              <div style="font-size:11px; color:var(--text-muted);" id="lightboxCounter">Hình ảnh 1 / 1</div>
            </div>
          </div>

          <div class="lightbox-toolbar">
            <button class="btn btn-outline btn-sm" id="lbPrevBtn" title="Hình trước (Phím Mũi tên Trái)">◀ Trước</button>
            <button class="btn btn-outline btn-sm" id="lbNextBtn" title="Hình kế tiếp (Phím Mũi tên Phải)">Kế tiếp ▶</button>
            <div style="width:1px; height:18px; background:var(--border-subtle); margin:0 4px;"></div>
            <button class="btn btn-outline btn-sm" id="lbZoomOutBtn" title="Thu nhỏ (Lăn chuột xuống)">−</button>
            <span style="font-size:11px; font-family:'JetBrains Mono'; min-width:40px; text-align:center;" id="lbZoomLevel">100%</span>
            <button class="btn btn-outline btn-sm" id="lbZoomInBtn" title="Phóng to (Lăn chuột lên)">+</button>
            <button class="btn btn-outline btn-sm" id="lbResetBtn" title="Đặt lại kích thước">1:1</button>
            <button class="btn btn-outline btn-sm" id="lbRotateBtn" title="Xoay 90°">↻ Xoay</button>
            <div style="width:1px; height:18px; background:var(--border-subtle); margin:0 4px;"></div>
            <button class="btn btn-primary btn-sm" id="lbNewTabBtn" title="Mở ảnh gốc ở Tab mới">Mở Tab Mới ↗</button>
            <a class="btn btn-outline btn-sm" id="lbDownloadBtn" download="vna_airport_chart.png" title="Tải ảnh về máy">Tải về</a>
            <button class="btn btn-ghost btn-sm" id="lbCloseBtn" style="font-size:18px; line-height:1; padding:4px 10px;" title="Đóng (ESC)">&times;</button>
          </div>
        </div>

        <div class="lightbox-viewport" id="lightboxViewport">
          <div id="lbLoadingIndicator" style="display:none; color:var(--accent-cyan); font-size:13px; font-weight:600;">
            Đang giải nén sơ đồ chất lượng cao từ gói tài liệu...
          </div>
          <img class="lightbox-img" id="lightboxImg" alt="VNA Airport Chart" style="display:none;">
        </div>
      `;
      document.body.appendChild(el);
    }

    this.container = el;
    this.imgEl = el.querySelector('#lightboxImg');
    this.titleEl = el.querySelector('#lightboxTitle');
    this.counterEl = el.querySelector('#lightboxCounter');
  }

  attachEvents() {
    const el = this.container;
    const viewport = el.querySelector('#lightboxViewport');

    // Button controls
    el.querySelector('#lbCloseBtn').onclick = () => this.close();
    el.querySelector('#lbZoomInBtn').onclick = () => this.zoom(0.25);
    el.querySelector('#lbZoomOutBtn').onclick = () => this.zoom(-0.25);
    el.querySelector('#lbResetBtn').onclick = () => this.resetTransform();
    el.querySelector('#lbRotateBtn').onclick = () => this.rotate();
    el.querySelector('#lbPrevBtn').onclick = () => this.prev();
    el.querySelector('#lbNextBtn').onclick = () => this.next();

    el.querySelector('#lbNewTabBtn').onclick = () => {
      if (this.activeBlobUrl) {
        window.open(this.activeBlobUrl, '_blank');
      }
    };

    // Mouse Wheel Zoom
    viewport.addEventListener('wheel', (e) => {
      e.preventDefault();
      const delta = e.deltaY < 0 ? 0.15 : -0.15;
      this.zoom(delta);
    }, { passive: false });

    // Click & Drag Pan
    viewport.addEventListener('mousedown', (e) => {
      if (e.target === viewport || e.target === this.imgEl) {
        this.isDragging = true;
        this.startX = e.clientX - this.translateX;
        this.startY = e.clientY - this.translateY;
        viewport.style.cursor = 'grabbing';
      }
    });

    window.addEventListener('mousemove', (e) => {
      if (this.isDragging) {
        this.translateX = e.clientX - this.startX;
        this.translateY = e.clientY - this.startY;
        this.applyTransform();
      }
    });

    window.addEventListener('mouseup', () => {
      if (this.isDragging) {
        this.isDragging = false;
        viewport.style.cursor = 'grab';
      }
    });

    // Keyboard Shortcuts
    window.addEventListener('keydown', (e) => {
      if (!this.container.classList.contains('active')) return;
      if (e.key === 'Escape') this.close();
      if (e.key === 'ArrowRight') this.next();
      if (e.key === 'ArrowLeft') this.prev();
      if (e.key === '+' || e.key === '=') this.zoom(0.25);
      if (e.key === '-') this.zoom(-0.25);
      if (e.key === '0') this.resetTransform();
    });
  }

  async open(imageItem, allImagesInAirport = []) {
    this.currentImages = allImagesInAirport.length > 0 ? allImagesInAirport : [imageItem];
    this.currentIndex = this.currentImages.findIndex(img => img.rId === imageItem.rId || img.mediaPath === imageItem.mediaPath);
    if (this.currentIndex === -1) this.currentIndex = 0;

    this.container.classList.add('active');
    await this.renderCurrentImage();
  }

  close() {
    this.container.classList.remove('active');
    this.resetTransform();
  }

  async renderCurrentImage() {
    const cur = this.currentImages[this.currentIndex];
    if (!cur) return;

    const loader = this.container.querySelector('#lbLoadingIndicator');
    loader.style.display = 'block';
    this.imgEl.style.display = 'none';

    this.titleEl.innerText = cur.label || `Sơ đồ ${cur.airportIcao || ''} (${cur.filename || 'diagram.png'})`;
    this.counterEl.innerText = `Sơ đồ ${this.currentIndex + 1} / ${this.currentImages.length} • ${cur.filename || ''}`;

    this.container.querySelector('#lbPrevBtn').disabled = this.currentIndex <= 0;
    this.container.querySelector('#lbNextBtn').disabled = this.currentIndex >= this.currentImages.length - 1;

    try {
      // Lazy Blob URL extraction
      const blobUrl = await this.getBlobUrlFn(cur.mediaPath);
      this.activeBlobUrl = blobUrl;

      this.imgEl.src = blobUrl;
      this.container.querySelector('#lbDownloadBtn').href = blobUrl;
      this.container.querySelector('#lbDownloadBtn').download = cur.filename || 'airport_chart.png';

      this.imgEl.onload = () => {
        loader.style.display = 'none';
        this.imgEl.style.display = 'block';
        this.resetTransform();
      };
    } catch (err) {
      console.error('Failed to load image blob:', err);
      loader.innerText = `Lỗi tải ảnh: ${err.message}`;
    }
  }

  prev() {
    if (this.currentIndex > 0) {
      this.currentIndex--;
      this.renderCurrentImage();
    }
  }

  next() {
    if (this.currentIndex < this.currentImages.length - 1) {
      this.currentIndex++;
      this.renderCurrentImage();
    }
  }

  zoom(delta) {
    this.currentScale = Math.min(Math.max(0.4, this.currentScale + delta), 5.0);
    this.applyTransform();
  }

  rotate() {
    this.currentRotation = (this.currentRotation + 90) % 360;
    this.applyTransform();
  }

  resetTransform() {
    this.currentScale = 1.0;
    this.currentRotation = 0;
    this.translateX = 0;
    this.translateY = 0;
    this.applyTransform();
  }

  applyTransform() {
    if (this.imgEl) {
      this.imgEl.style.transform = `translate(${this.translateX}px, ${this.translateY}px) scale(${this.currentScale}) rotate(${this.currentRotation}deg)`;
      const pct = Math.round(this.currentScale * 100);
      this.container.querySelector('#lbZoomLevel').innerText = `${pct}%`;
    }
  }
}
