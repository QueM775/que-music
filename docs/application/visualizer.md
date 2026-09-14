Keyboard Shortcuts:

V - Toggle visualizer on/off
Shift+V - Cycle through visualization types (bars → wave → circular)
Ctrl+V - Restart visualizer (for debugging)

Debug Commands (in browser console):

window.debugVisualizer() - Check visualizer status
window.testVisualizer() - Test with current audio
window.restartVisualizer() - Force restart visualizer

If visualizer doesn't show bars moving:

Check browser console for any errors
Run debug command: window.debugVisualizer()
Verify audio is playing: Audio must be actively playing for bars to move
Check audio context state: Should be "running" when music plays
Browser permissions: Some browsers require user interaction to start audio context

Common Issues:

Static bars only: Audio context may be suspended - click play on a track
No visualization: Audio source may not be connected - try restarting visualizer
Performance issues: Reduce FFT size in setupAudioContext() method

Visualization Settings:
javascript// In setupAudioContext() method, you can adjust:
this.analyser.fftSize = 1024; // Higher = more detail, lower = better performance
this.analyser.smoothingTimeConstant = 0.85; // 0-1, higher = smoother
Color Schemes:
Modify the gradients in drawRealtimeBars() method:
javascriptgradient.addColorStop(0, '#your-color'); // Bottom
gradient.addColorStop(0.5, '#your-color'); // Middle  
gradient.addColorStop(1, '#your-color'); // Top
Bar Count:
Adjust in drawRealtimeBars():
javascriptconst maxBars = Math.floor(canvas.width / 4); // Change div
