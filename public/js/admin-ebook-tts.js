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
  var bulkQueued = {}; // chapterId -> true while a bulk job has not reached that chapter yet.
  var bulkRun = null;

  document.addEventListener('DOMContentLoaded', function () {
    var table = document.getElementById('chapters-table');
    if (!table) return;

    var ebookId = table.getAttribute('data-ebook-id');
    if (!ebookId) {
      console.warn('[admin-ebook-tts] missing data-ebook-id on #chapters-table');
      return;
    }

    var bulkBtn = document.getElementById('btn-generate-ebook-tts');
    if (bulkBtn) {
      bulkBtn.addEventListener('click', function (e) {
        e.preventDefault();
        handleGenerateAllClick(bulkBtn, ebookId);
      });
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
            delete bulkQueued[chapterId];
            updateProgressBar(chapterId, progress);
            return;
          }

          if (status === 'none' && bulkQueued[chapterId]) {
            replaceCellWithQueued(chapterId);
            return;
          }

          stopPolling(chapterId);

          if (status === 'ready') {
            replaceCellWithReady(chapterId, ebookId);
            markBulkChapterDone(chapterId);
          } else if (status === 'failed') {
            replaceCellWithFailed(chapterId, progress);
            markBulkChapterDone(chapterId);
          } else {
            // 'none' — unexpected, render the initial generate button.
            replaceCellWithGenerateButton(chapterId);
            markBulkChapterDone(chapterId);
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

  function handleGenerateAllClick(btn, ebookId) {
    btn.disabled = true;
    var origLabel = btn.textContent;
    btn.textContent = 'Starting...';

    fetch('/ebooks/' + ebookId + '/generate-tts', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ accent: 'us' }),
    })
      .then(function (res) {
        if (res.status === 200 || res.status === 202) return res.json();
        return res.json().then(function (body) {
          var msg = (body && body.error && body.error.message) || ('HTTP ' + res.status);
          throw new Error(msg);
        });
      })
      .then(function (data) {
        var chapterIds = (data && data.chapter_ids) || [];

        if (!chapterIds.length) {
          btn.disabled = false;
          btn.textContent = origLabel;
          alert((data && data.message) || 'All chapters already have audio.');
          return;
        }

        startBulkRun(btn, origLabel, chapterIds);

        chapterIds.forEach(function (chapterId) {
          var cell = getCell(chapterId);
          if (!cell) {
            markBulkChapterDone(chapterId);
            return;
          }

          if (!cell.querySelector('.tts-progress') && !cell.querySelector('.tts-done')) {
            bulkQueued[chapterId] = true;
            replaceCellWithQueued(chapterId);
          }

          startPolling(chapterId, ebookId);
        });
      })
      .catch(function (err) {
        console.error('[admin-ebook-tts] bulk generate failed:', err);
        btn.disabled = false;
        btn.textContent = origLabel;
        alert('Không thể khởi động TTS toàn bộ ebook: ' + (err.message || err));
      });
  }

  function startBulkRun(btn, origLabel, chapterIds) {
    bulkRun = {
      button: btn,
      origLabel: origLabel,
      remaining: {},
      total: chapterIds.length,
      completed: 0,
    };

    chapterIds.forEach(function (chapterId) {
      bulkRun.remaining[chapterId] = true;
    });

    updateBulkButtonLabel();
  }

  function markBulkChapterDone(chapterId) {
    delete bulkQueued[chapterId];

    if (!bulkRun || !bulkRun.remaining[chapterId]) return;

    delete bulkRun.remaining[chapterId];
    bulkRun.completed += 1;
    updateBulkButtonLabel();

    if (bulkRun.completed >= bulkRun.total) {
      bulkRun.button.disabled = false;
      bulkRun.button.textContent = bulkRun.origLabel;
      bulkRun = null;
    }
  }

  function updateBulkButtonLabel() {
    if (!bulkRun || !bulkRun.button) return;
    bulkRun.button.textContent = 'Generating ' + bulkRun.completed + '/' + bulkRun.total;
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

  function replaceCellWithQueued(chapterId) {
    var cell = getCell(chapterId);
    if (!cell) return;
    cell.innerHTML =
      '<div class="tts-queued" data-chapter-id="' + chapterId + '">Queued</div>';
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
