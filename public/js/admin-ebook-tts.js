/**
 * Admin ebook detail — TTS generation triggers + status polling.
 *
 * Wires up the chapters table:
 *   - "Generate TTS" / "Retry" buttons → POST .../generate-tts, then start polling.
 *   - Any row already in `generating` state at page load → resume polling automatically.
 *   - Polling endpoint: GET .../tts-status every 2s. On `ready` → tick-link;
 *     on `failed` → error + Retry button.
 */
(function () {
  'use strict';

  var POLL_INTERVAL_MS = 2000;
  var pollers = {}; // chapterId -> intervalId

  document.addEventListener('DOMContentLoaded', function () {
    var table = document.getElementById('chapters-table');
    if (!table) return;

    var ebookId = table.getAttribute('data-ebook-id');
    if (!ebookId) {
      console.warn('[admin-ebook-tts] missing data-ebook-id on #chapters-table');
      return;
    }

    // Delegate click handler — works for buttons created later via DOM swap too.
    table.addEventListener('click', function (e) {
      var btn = e.target.closest && e.target.closest('.btn-generate-tts');
      if (!btn) return;
      e.preventDefault();
      handleGenerateClick(btn, ebookId);
    });

    // Auto-resume polling for chapters already in 'generating' state on page load.
    var inProgress = table.querySelectorAll('.tts-progress[data-chapter-id]');
    inProgress.forEach(function (el) {
      var chapterId = el.getAttribute('data-chapter-id');
      if (chapterId) startPolling(chapterId, ebookId);
    });
  });

  function handleGenerateClick(btn, ebookId) {
    var chapterId = btn.getAttribute('data-chapter-id');
    if (!chapterId) return;

    btn.disabled = true;
    var origLabel = btn.textContent;
    btn.textContent = 'Starting…';

    fetch('/ebooks/' + ebookId + '/chapters/' + chapterId + '/generate-tts', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ accent: 'us' }),
    })
      .then(function (res) {
        if (res.status === 202) return null;
        return res.json().then(function (body) {
          var msg = (body && body.error && body.error.message) || ('HTTP ' + res.status);
          throw new Error(msg);
        });
      })
      .then(function () {
        replaceCellWithProgress(chapterId, 0);
        startPolling(chapterId, ebookId);
      })
      .catch(function (err) {
        console.error('[admin-ebook-tts] generate failed:', err);
        btn.disabled = false;
        btn.textContent = origLabel;
        alert('Không thể khởi động TTS: ' + (err.message || err));
      });
  }

  function startPolling(chapterId, ebookId) {
    if (pollers[chapterId]) return; // already polling

    var url = '/ebooks/' + ebookId + '/chapters/' + chapterId + '/tts-status';

    var tick = function () {
      fetch(url, { headers: { Accept: 'application/json' } })
        .then(function (res) {
          if (!res.ok) throw new Error('HTTP ' + res.status);
          return res.json();
        })
        .then(function (data) {
          var status = data.tts_status || 'none';
          var progress = typeof data.tts_progress === 'number' ? data.tts_progress : 0;

          if (status === 'generating') {
            updateProgressBar(chapterId, progress);
            return;
          }

          stopPolling(chapterId);

          if (status === 'ready') {
            replaceCellWithReady(chapterId, ebookId);
          } else if (status === 'failed') {
            replaceCellWithFailed(chapterId, progress);
          } else {
            // 'none' — unexpected, render the initial generate button.
            replaceCellWithGenerateButton(chapterId);
          }
        })
        .catch(function (err) {
          console.error('[admin-ebook-tts] poll error for ' + chapterId + ':', err);
          // Keep polling — transient errors shouldn't kill the loop.
        });
    };

    tick(); // immediate first call so user doesn't wait 2s.
    pollers[chapterId] = setInterval(tick, POLL_INTERVAL_MS);
  }

  function stopPolling(chapterId) {
    if (pollers[chapterId]) {
      clearInterval(pollers[chapterId]);
      delete pollers[chapterId];
    }
  }

  // ─── DOM helpers ───────────────────────────────────────────────────────────

  function getCell(chapterId) {
    return document.querySelector('.tts-cell[data-chapter-id="' + chapterId + '"]');
  }

  function updateProgressBar(chapterId, progress) {
    var cell = getCell(chapterId);
    if (!cell) return;
    var wrap = cell.querySelector('.tts-progress');
    if (!wrap) {
      replaceCellWithProgress(chapterId, progress);
      return;
    }
    var bar = wrap.querySelector('.progress-bar');
    var text = wrap.querySelector('.progress-text');
    if (bar) bar.style.width = progress + '%';
    if (text) text.textContent = progress + '%';
  }

  function replaceCellWithProgress(chapterId, progress) {
    var cell = getCell(chapterId);
    if (!cell) return;
    cell.innerHTML =
      '<div class="tts-progress" data-chapter-id="' + chapterId + '">' +
        '<div class="progress-track">' +
          '<div class="progress-bar" style="width: ' + progress + '%"></div>' +
        '</div>' +
        '<span class="progress-text">' + progress + '%</span>' +
      '</div>';
  }

  function replaceCellWithReady(chapterId, ebookId) {
    var cell = getCell(chapterId);
    if (!cell) return;
    var href = '/ebooks/' + ebookId + '/chapters/' + chapterId + '/audio-preview';
    cell.innerHTML =
      '<a href="' + href + '" class="tts-done">✅ Audio ready</a>';
  }

  function replaceCellWithFailed(chapterId, progress) {
    var cell = getCell(chapterId);
    if (!cell) return;
    cell.innerHTML =
      '<div class="tts-failed">' +
        '<span class="tts-error">⚠️ Failed (' + progress + '%)</span>' +
        '<button type="button" class="btn-generate-tts btn btn-secondary" ' +
                'data-chapter-id="' + chapterId + '">Retry</button>' +
      '</div>';
  }

  function replaceCellWithGenerateButton(chapterId) {
    var cell = getCell(chapterId);
    if (!cell) return;
    cell.innerHTML =
      '<button type="button" class="btn-generate-tts btn btn-primary" ' +
              'data-chapter-id="' + chapterId + '">Generate TTS</button>';
  }
})();
