// client/scripts/cover-fetcher-ui.js
// UI controller for the Cover Fetcher modal

class CoverFetcherUI {
  constructor(app) {
    this.app = app;
    this.isScanning = false;
    this.isCancelled = false;

    // DOM elements
    this.modal = document.getElementById('coverFetcherModal');
    this.closeBtn = document.getElementById('closeCoverFetcherModal');
    this.closeFooterBtn = document.getElementById('cfClose');
    this.startBtn = document.getElementById('cfStartScan');
    this.cancelBtn = document.getElementById('cfCancelScan');

    // Options
    this.downloadMissingCheckbox = document.getElementById('cfDownloadMissing');
    this.validateExistingCheckbox = document.getElementById('cfValidateExisting');

    // Progress section
    this.progressSection = document.getElementById('cfProgressSection');
    this.progressFill = document.getElementById('cfProgressFill');
    this.progressText = document.getElementById('cfProgressText');

    // Stats
    this.statScanned = document.getElementById('cfStatScanned');
    this.statEmbedded = document.getElementById('cfStatEmbedded');
    this.statDownloaded = document.getElementById('cfStatDownloaded');
    this.statValidated = document.getElementById('cfStatValidated');
    this.statCleaned = document.getElementById('cfStatCleaned');
    this.statFailed = document.getElementById('cfStatFailed');

    // Current file
    this.currentFile = document.getElementById('cfCurrentFile');

    // Log container
    this.logContainer = document.getElementById('cfLogContainer');

    // Stats tracking
    this.stats = {
      totalFiles: 0,
      scanned: 0,
      embedded: 0,
      downloaded: 0,
      validated: 0,
      cleaned: 0,
      failed: 0
    };

    this.setupEventListeners();
    this.app.logger.info('Cover Fetcher UI initialized');
  }

  setupEventListeners() {
    // Close buttons
    this.closeBtn.addEventListener('click', () => this.close());
    this.closeFooterBtn.addEventListener('click', () => this.close());

    // Modal overlay click (close on outside click)
    this.modal.addEventListener('click', (e) => {
      if (e.target === this.modal) {
        this.close();
      }
    });

    // Start scan button
    this.startBtn.addEventListener('click', () => this.startScan());

    // Cancel scan button
    this.cancelBtn.addEventListener('click', () => this.cancelScan());

    // Listen for IPC progress events
    window.queMusicAPI.onCoverFetchProgress((data) => {
      this.handleProgress(data);
    });
  }

  open() {
    this.app.logger.info('Opening Cover Fetcher modal');
    this.modal.style.display = 'flex';
    // Add show class for CSS animations
    setTimeout(() => {
      this.modal.classList.add('show');
    }, 10);
    this.reset();
  }

  close() {
    if (this.isScanning) {
      if (!confirm('Scanning is in progress. Are you sure you want to close?')) {
        return;
      }
      this.cancelScan();
    }
    this.app.logger.info('Closing Cover Fetcher modal');
    this.modal.classList.remove('show');
    setTimeout(() => {
      this.modal.style.display = 'none';
    }, 300); // Match CSS transition duration
  }

  reset() {
    this.isScanning = false;
    this.isCancelled = false;

    // Reset UI state
    this.startBtn.style.display = 'inline-block';
    this.cancelBtn.style.display = 'none';
    this.startBtn.disabled = false;

    // Hide progress section
    this.progressSection.style.display = 'none';

    // Reset stats
    this.stats = {
      totalFiles: 0,
      scanned: 0,
      embedded: 0,
      downloaded: 0,
      validated: 0,
      cleaned: 0,
      failed: 0
    };
    this.updateStats();

    // Reset progress bar
    this.progressFill.style.width = '0%';
    this.progressText.textContent = '0%';

    // Reset current file
    this.currentFile.textContent = '-';

    // Clear log (keep welcome message)
    this.logContainer.innerHTML = '<div class="log-entry">Ready to scan. Click "Start Scan" to begin.</div>';
  }

  async startScan() {
    if (this.isScanning) return;

    this.app.logger.info('Starting cover fetch scan');
    this.isScanning = true;
    this.isCancelled = false;

    // Update UI
    this.startBtn.style.display = 'none';
    this.cancelBtn.style.display = 'inline-block';
    this.progressSection.style.display = 'block';

    // Get options
    const options = {
      downloadMissing: this.downloadMissingCheckbox.checked,
      validateExisting: this.validateExistingCheckbox.checked
    };

    this.addLogEntry('🚀 Starting scan...', 'info');

    try {
      // Call IPC to start scan
      const result = await window.queMusicAPI.coverFetcher.startScan(options);

      if (result.success) {
        this.addLogEntry('✅ Scan completed successfully!', 'success');
        this.app.logger.info('Cover fetch scan completed', result.summary);

        // Show notification
        this.app.showNotification(
          `Scan complete! Embedded: ${result.summary.embedded}, Downloaded: ${result.summary.downloaded}, Failed: ${result.summary.failed}`,
          'success'
        );
      } else {
        this.addLogEntry(`❌ Scan failed: ${result.error}`, 'error');
        this.app.logger.error('Cover fetch scan failed', { error: result.error });

        this.app.showNotification(
          'Scan failed. Check the log for details.',
          'error'
        );
      }
    } catch (err) {
      this.addLogEntry(`❌ Error: ${err.message}`, 'error');
      this.app.logger.error('Cover fetch scan error', { error: err.message });

      this.app.showNotification(
        'An error occurred during scanning.',
        'error'
      );
    } finally {
      this.isScanning = false;
      this.startBtn.style.display = 'inline-block';
      this.cancelBtn.style.display = 'none';
      this.currentFile.textContent = 'Scan complete';
    }
  }

  cancelScan() {
    if (!this.isScanning) return;

    this.app.logger.info('Cancelling cover fetch scan');
    this.isCancelled = true;
    this.addLogEntry('⚠️ Scan cancelled by user', 'warning');

    // TODO: Implement actual cancellation via IPC
    // For now, just update UI state
    this.isScanning = false;
    this.startBtn.style.display = 'inline-block';
    this.cancelBtn.style.display = 'none';
    this.currentFile.textContent = 'Cancelled';
  }

  handleProgress(data) {
    switch (data.type) {
      case 'init':
        this.stats.totalFiles = data.totalFiles;
        this.addLogEntry(`📁 Found ${data.totalFiles} tracks to process`, 'info');
        break;

      case 'file-start':
        this.currentFile.textContent = `${data.fileName} (${data.artist} - ${data.album})`;
        break;

      case 'file-complete':
        this.stats.scanned++;

        // Update specific stat based on result
        switch (data.result) {
          case 'embedded':
          case 'embedded-duplicate':
            this.stats.embedded++;
            break;
          case 'downloaded':
          case 'downloaded-duplicate':
            this.stats.downloaded++;
            break;
          case 'validated':
          case 'existing':
            this.stats.validated++;
            break;
          case 'failed':
            this.stats.failed++;
            break;
        }

        this.updateStats();
        this.updateProgress();
        break;

      case 'complete':
        // Final summary from server
        if (data.summary) {
          this.stats.embedded = data.summary.embedded;
          this.stats.downloaded = data.summary.downloaded;
          this.stats.validated = data.summary.validated;
          this.stats.cleaned = data.summary.cleaned;
          this.stats.failed = data.summary.failed;
          this.updateStats();
        }

        this.addLogEntry('', 'separator');
        this.addLogEntry('📊 Scan Summary:', 'info');
        this.addLogEntry(`   Total Tracks: ${this.stats.totalFiles}`, 'info');
        this.addLogEntry(`   ✅ Already Valid: ${this.stats.validated}`, 'success');
        this.addLogEntry(`   📸 Embedded Art: ${this.stats.embedded}`, 'success');
        this.addLogEntry(`   🌐 Downloaded: ${this.stats.downloaded}`, 'success');
        this.addLogEntry(`   🧹 Cleaned: ${this.stats.cleaned}`, 'info');
        this.addLogEntry(`   ❌ Failed: ${this.stats.failed}`, this.stats.failed > 0 ? 'error' : 'info');
        break;

      case 'log':
        // Direct log message from server
        this.addLogEntry(data.message, data.level || 'info');
        break;
    }
  }

  updateStats() {
    this.statScanned.textContent = this.stats.scanned;
    this.statEmbedded.textContent = this.stats.embedded;
    this.statDownloaded.textContent = this.stats.downloaded;
    this.statValidated.textContent = this.stats.validated;
    this.statCleaned.textContent = this.stats.cleaned;
    this.statFailed.textContent = this.stats.failed;
  }

  updateProgress() {
    if (this.stats.totalFiles === 0) return;

    const percentage = Math.round((this.stats.scanned / this.stats.totalFiles) * 100);
    this.progressFill.style.width = `${percentage}%`;
    this.progressText.textContent = `${percentage}%`;
  }

  addLogEntry(message, type = 'info') {
    if (message === '' && type === 'separator') {
      const separator = document.createElement('div');
      separator.className = 'log-separator';
      this.logContainer.appendChild(separator);
      this.scrollLogToBottom();
      return;
    }

    const entry = document.createElement('div');
    entry.className = `log-entry log-${type}`;
    entry.textContent = message;

    this.logContainer.appendChild(entry);
    this.scrollLogToBottom();
  }

  scrollLogToBottom() {
    this.logContainer.scrollTop = this.logContainer.scrollHeight;
  }
}

// Initialize when main app is ready
window.addEventListener('DOMContentLoaded', () => {
  // Wait for main app to be available
  const initCoverFetcher = () => {
    if (window.app && window.app.logger) {
      window.app.coverFetcherUI = new CoverFetcherUI(window.app);
      window.app.logger.info('Cover Fetcher UI ready');

      // Listen for menu command to open modal
      if (window.queMusicAPI && window.queMusicAPI.system) {
        window.queMusicAPI.system.onShowCoverFetcher(() => {
          window.app.logger.info('Opening Cover Fetcher from menu');
          window.app.coverFetcherUI.open();
        });
      }
    } else {
      setTimeout(initCoverFetcher, 100);
    }
  };
  initCoverFetcher();
});
