// ============================================================
//  GODEYE — Time Slider (Historical Playback)
// ============================================================
const TimeSlider = (() => {
  let _playing = false;
  let _playTimer = null;
  let _currentDay = 0;

  function _updateLabel(daysAgo) {
    const d = new Date(Date.now() - daysAgo * 86400000);
    const el = document.getElementById('time-slider-label');
    if (!el) return;
    if (daysAgo === 0) el.textContent = 'TODAY';
    else el.textContent = d.toISOString().split('T')[0] + ` (${daysAgo}d AGO)`;
  }

  function _play() {
    const speed = parseInt(document.getElementById('time-speed')?.value || 1);
    _playing = true;
    document.getElementById('btn-time-play').textContent = '⏸ PAUSE';

    _playTimer = setInterval(() => {
      const slider = document.getElementById('time-slider');
      if (!slider) return;
      let val = parseInt(slider.value);
      val = (val + 1) % 31;
      slider.value = val;
      _currentDay = val;
      _updateLabel(val);
      EventBus.emit('timeslider:change', { daysAgo: val });
    }, 1000 / speed);
  }

  function _pause() {
    _playing = false;
    clearInterval(_playTimer);
    document.getElementById('btn-time-play').textContent = '▶ PLAY';
  }

  return {
    init() {
      document.getElementById('btn-timeslider')?.addEventListener('click', () => {
        document.getElementById('time-slider-panel').classList.toggle('hidden');
      });

      document.getElementById('btn-close-timeslider')?.addEventListener('click', () => {
        document.getElementById('time-slider-panel').classList.add('hidden');
        _pause();
      });

      document.getElementById('btn-time-play')?.addEventListener('click', () => {
        if (_playing) _pause(); else _play();
      });

      document.getElementById('time-slider')?.addEventListener('input', e => {
        _currentDay = parseInt(e.target.value);
        _updateLabel(_currentDay);
        EventBus.emit('timeslider:change', { daysAgo: _currentDay });
      });

      // Listen for timeslider changes to reload conflict/news data
      EventBus.on('timeslider:change', ({ daysAgo }) => {
        if (daysAgo === 0) {
          EventBus.emit('sigint:log', { cat: 'TIME', msg: 'LIVE MODE — CURRENT DATA' });
        } else {
          EventBus.emit('sigint:log', { cat: 'TIME', msg: `HISTORICAL MODE — ${daysAgo} DAYS AGO` });
        }
      });
    },
  };
})();
