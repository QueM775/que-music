// client/scripts/equalizer-ui.js
// UI controller for the Equalizer modal — 5-band graphic EQ + presets + loudness
// normalization toggle. See docs/superpowers/specs/2026-09-15-equalizer-design.md.
// Talks to client/scripts/core-audio.js through setBandGain/applyPreset/
// getEqualizerState/setNormalizationEnabled — never touches the Web Audio graph
// directly. Follows the same small-focused-module pattern as lyrics-ui.js.

const EQUALIZER_BAND_LABELS = ['60Hz', '250Hz', '1kHz', '4kHz', '12kHz'];

class EqualizerUI {
  constructor(app) {
    this.app = app;

    this.modal = document.getElementById('equalizerModal');
    this.closeBtn = document.getElementById('closeEqualizerModal');
    this.closeFooterBtn = document.getElementById('equalizerClose');
    this.bandsContainer = document.getElementById('equalizerBands');
    this.presetSelect = document.getElementById('equalizerPresetSelect');
    this.normalizationToggle = document.getElementById('equalizerNormalizationToggle');

    this.sliders = [];

    this.buildBandSliders();
    this.setupEventListeners();
    this.app.logger.info('Equalizer UI initialized');
  }

  buildBandSliders() {
    this.bandsContainer.innerHTML = '';
    this.sliders = EQUALIZER_BAND_LABELS.map((label, index) => {
      const band = document.createElement('div');
      band.className = 'equalizer-band';

      const slider = document.createElement('input');
      slider.type = 'range';
      slider.min = '-12';
      slider.max = '12';
      slider.step = '1';
      slider.value = '0';
      slider.dataset.bandIndex = String(index);

      const labelEl = document.createElement('span');
      labelEl.className = 'equalizer-band-label';
      labelEl.textContent = label;

      band.appendChild(slider);
      band.appendChild(labelEl);
      this.bandsContainer.appendChild(band);

      return slider;
    });
  }

  setupEventListeners() {
    this.closeBtn.addEventListener('click', () => this.close());
    this.closeFooterBtn.addEventListener('click', () => this.close());

    this.modal.addEventListener('click', (e) => {
      if (e.target === this.modal) {
        this.close();
      }
    });

    const equalizerBtn = document.getElementById('equalizerBtn');
    if (equalizerBtn) {
      equalizerBtn.addEventListener('click', () => this.open());
    }

    this.sliders.forEach((slider, index) => {
      slider.addEventListener('input', () => {
        this.app.coreAudio.setBandGain(index, Number(slider.value));
        // Dragging a slider always means "Custom" — reflect that in the dropdown
        // without re-reading every band back from coreAudio.
        this.presetSelect.value = 'Custom';
      });
    });

    this.presetSelect.addEventListener('change', () => {
      const preset = this.presetSelect.value;
      if (preset === 'Custom') return; // nothing to apply — it's just where sliders end up
      this.app.coreAudio.applyPreset(preset);
      this.syncSlidersFromState();
    });

    this.normalizationToggle.addEventListener('change', () => {
      this.app.coreAudio.setNormalizationEnabled(this.normalizationToggle.checked);
    });
  }

  // Pulls the current band gains from coreAudio and reflects them onto the sliders
  // — used after applying a preset, and when the modal opens.
  syncSlidersFromState() {
    const state = this.app.coreAudio.getEqualizerState();
    state.bands.forEach((dB, index) => {
      if (this.sliders[index]) {
        this.sliders[index].value = String(dB);
      }
    });
    this.presetSelect.value = state.activePreset;
    this.normalizationToggle.checked = state.normalizationEnabled;
  }

  open() {
    this.syncSlidersFromState();
    this.modal.style.display = 'flex';
    setTimeout(() => {
      this.modal.classList.add('show');
    }, 10);
  }

  close() {
    this.modal.classList.remove('show');
    setTimeout(() => {
      this.modal.style.display = 'none';
    }, 300); // Match CSS transition duration
  }
}

// Initialize when main app is ready — same pattern as lyrics-ui.js
window.addEventListener('DOMContentLoaded', () => {
  const initEqualizerUI = () => {
    if (window.app && window.app.logger && window.app.coreAudio) {
      window.app.equalizerUI = new EqualizerUI(window.app);
    } else {
      setTimeout(initEqualizerUI, 100);
    }
  };
  initEqualizerUI();
});
