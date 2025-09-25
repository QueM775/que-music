console.log('📚 Simple help manager loading...');

class HelpManager {
  constructor(app) {
    console.log('📚 HelpManager constructor called');
    this.app = app;
    this.isModalOpen = false;
  }

  showHelp() {
    console.log('📚 showHelp called');

    const modal = document.getElementById('helpModal');
    if (!modal) {
      console.error('❌ Help modal not found');
      return;
    }

    // Simple test content
    const sidebar = document.getElementById('helpSidebar');
    const content = document.getElementById('helpContent');

    if (sidebar) {
      sidebar.innerHTML = `
        <div style="padding: 20px;">
          <h3>Help Topics</h3>
          <div onclick="window.app.helpManager.showTopic('test')" style="cursor: pointer; padding: 10px; background: #333; margin: 5px 0; border-radius: 5px;">
            Getting Started
          </div>
        </div>
      `;
    }

    if (content) {
      content.innerHTML = `
        <div style="padding: 20px;">
          <h1>Welcome to Que-Music Help</h1>
          <p>This is a test of the help system.</p>
          <p>The help system is working correctly!</p>
        </div>
      `;
    }

    this.showModal(modal);
  }

  showTopic(topicId) {
    console.log('📚 showTopic called with:', topicId);
    const content = document.getElementById('helpContent');
    if (content) {
      content.innerHTML = `
        <div style="padding: 20px;">
          <h1>Test Topic: ${topicId}</h1>
          <p>This is test content for the ${topicId} topic.</p>
        </div>
      `;
    }
  }

  showModal(modal) {
    console.log('📚 Showing modal');
    modal.style.display = 'flex';
    requestAnimationFrame(() => {
      modal.classList.add('show');
    });
    this.isModalOpen = true;
  }

  hideHelp() {
    console.log('📚 hideHelp called');
    const modal = document.getElementById('helpModal');
    if (modal && this.isModalOpen) {
      modal.classList.remove('show');
      setTimeout(() => {
        modal.style.display = 'none';
        this.isModalOpen = false;
      }, 300);
    }
  }

  init() {
    console.log('📚 HelpManager init called');

    // F1 key support
    document.addEventListener('keydown', (e) => {
      if (e.key === 'F1') {
        e.preventDefault();
        this.showHelp();
      }
      if (e.key === 'Escape' && this.isModalOpen) {
        this.hideHelp();
      }
    });

    // Close button
    const closeBtn = document.getElementById('closeHelpModal');
    if (closeBtn) {
      closeBtn.addEventListener('click', () => this.hideHelp());
    }

    // Click outside to close
    const modal = document.getElementById('helpModal');
    if (modal) {
      modal.addEventListener('click', (e) => {
        if (e.target === modal) {
          this.hideHelp();
        }
      });
    }

    console.log('✅ Simple HelpManager initialized');
  }
}

console.log('📚 Adding HelpManager to window');
window.HelpManager = HelpManager;
console.log('📚 HelpManager added to window successfully');
