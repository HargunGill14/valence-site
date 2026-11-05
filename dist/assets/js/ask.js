/* The five questions: a popup from any "Get in touch" button, or inline on /contact/.
   With a LEAD_ENDPOINT (scripts/config.mjs) the last step posts the answers as JSON to it and the
   form service emails ops@. Without one, or if the post fails, it opens the visitor's mail app with
   the answers addressed to ops@. */
(function () {
  'use strict';
  var EMAIL = 'ops@valencesupplychain.com';
  var doc = document;
  function each(list, fn) { Array.prototype.forEach.call(list, fn); }

  function setup(root, isDialog) {
    var steps = root.querySelectorAll('.ask__step'), total = 5, cur = 1;
    var back = root.querySelector('[data-ask-back]'), next = root.querySelector('[data-ask-next]'), nav = root.querySelector('[data-ask-nav]');
    var progress = root.querySelector('[data-ask-progress]'), err = root.querySelector('[data-ask-error]');
    var answers = { stage: '', industry: '', pain: [], channels: [] };

    each(root.querySelectorAll('.ask__chip'), function (chip) {
      chip.addEventListener('click', function () {
        var group = chip.getAttribute('data-group'), value = chip.getAttribute('data-value');
        if (chip.hasAttribute('data-multi')) {
          var on = chip.getAttribute('aria-pressed') !== 'true';
          chip.setAttribute('aria-pressed', on ? 'true' : 'false');
          answers[group] = answers[group].filter(function (v) { return v !== value; });
          if (on) answers[group].push(value);
        } else {
          each(root.querySelectorAll('.ask__chip[data-group="' + group + '"]'), function (c) { c.setAttribute('aria-pressed', 'false'); });
          chip.setAttribute('aria-pressed', 'true'); answers[group] = value;
          if (cur < 5) setTimeout(function () { go(cur + 1); }, 180);   /* a single choice moves on by itself */
        }
      });
    });

    function field(name) { var el = root.querySelector('[data-field="' + name + '"]'); return el ? el.value.trim() : ''; }
    function valid() {
      if (cur === 1 && !answers.stage) return 'Pick the stage that is closest.';
      if (cur === 2 && !answers.industry) return 'Pick what you make.';
      if (cur === 5) {
        if (!field('name')) return 'Your name, so we know who to ask for.';
        if (!field('company')) return 'Your company name.';
        if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(field('email'))) return 'A work email we can reply to.';
      }
      return '';
    }
    function lines() {
      return [
        'Stage: ' + (answers.stage || '-'),
        'Industry: ' + (answers.industry || '-'),
        "What's eating the week: " + (answers.pain.length ? answers.pain.join('; ') : '-'),
        'Notes: ' + (field('notes') || '-'),
        'Where they sell: ' + (answers.channels.length ? answers.channels.join('; ') : '-'),
        '',
        'Name: ' + field('name'),
        'Company: ' + field('company'),
        'Email: ' + field('email'),
        'Phone: ' + (field('phone') || '-'),
        'Heard about us: ' + (field('heard') || '-'),
        '',
        'Sent from valencesupplychain.com/contact'
      ];
    }
    var endpoint = '', submitBtn = root.querySelector('[data-ask-submit]'), sendLink = root.querySelector('[data-ask-send]'), sendErr = root.querySelector('[data-ask-senderror]');
    function finish() {
      endpoint = root.getAttribute('data-ask-endpoint') || '';
      submitBtn.hidden = !endpoint; sendLink.hidden = !!endpoint;
      if (!endpoint) { root.querySelector('[data-ask-done-hint]').textContent = 'The button opens your email app with your answers filled in and addressed to ' + EMAIL + '. Press send there and we\'ll reply within one business day.'; }
      var body = lines().join('\n'), subject = field('company') + ' · ' + (answers.stage || 'brand') + ' · ' + (answers.pain[0] || 'what’s eating our week');
      root.querySelector('[data-ask-send]').setAttribute('href', 'mailto:' + EMAIL + '?subject=' + encodeURIComponent(subject) + '&body=' + encodeURIComponent(body));
      root.querySelector('[data-ask-copytext]').value = 'To: ' + EMAIL + '\nSubject: ' + subject + '\n\n' + body;
      var sum = root.querySelector('[data-ask-summary]'); sum.textContent = '';
      lines().slice(0, 5).concat(lines().slice(6, 9)).forEach(function (l) { if (!l) return; var p = doc.createElement('p'); var i = l.indexOf(': '); var b = doc.createElement('b'); b.textContent = l.slice(0, i); p.appendChild(b); p.appendChild(doc.createTextNode(' ' + l.slice(i + 2))); sum.appendChild(p); });
    }
    function go(n) {
      var msg = n > cur ? valid() : '';
      if (msg) { err.textContent = msg; err.hidden = false; return; }
      err.hidden = true; cur = n;
      each(steps, function (s) { s.hidden = +s.getAttribute('data-step') !== cur; });
      progress.textContent = cur <= total ? cur + ' of ' + total : 'Done';
      back.hidden = cur === 1; next.hidden = cur > total;
      back.textContent = cur > total ? 'Edit my answers' : 'Back';
      next.textContent = cur === total ? 'Review and send' : 'Next';
      if (cur > total) finish();
      var f = root.querySelector('.ask__step:not([hidden]) .ask__chip, .ask__step:not([hidden]) input');
      if (f && isDialog) f.focus({ preventScroll: true });
      if (!isDialog && n !== 1) root.scrollIntoView({ block: 'start', behavior: 'smooth' });
    }
    function payload() {
      return { name: field('name'), company: field('company'), email: field('email'), phone: field('phone'), heard: field('heard'),
        stage: answers.stage, industry: answers.industry, pains: answers.pain.join('; '), channels: answers.channels.join('; '), notes: field('notes'),
        _subject: field('company') + ' \u00b7 ' + (answers.stage || 'brand') + ' \u00b7 ' + (answers.pain[0] || 'new enquiry'), _replyto: field('email'), page: location.pathname };
    }
    function submit() {
      if (!endpoint || !window.fetch) { sendLink.click(); return; }
      submitBtn.disabled = true; submitBtn.textContent = 'Sending\u2026'; sendErr.hidden = true;
      fetch(endpoint, { method: 'POST', headers: { 'Content-Type': 'application/json', 'Accept': 'application/json' }, body: JSON.stringify(payload()) })
        .then(function (r) { if (!r.ok) throw new Error('status ' + r.status); return r.json().catch(function () { return {}; }); })
        .then(function () { cur = total + 2; each(steps, function (st) { st.hidden = +st.getAttribute('data-step') !== cur; }); progress.textContent = 'Sent'; nav.hidden = true; })
        .catch(function () {
          submitBtn.disabled = false; submitBtn.textContent = 'Send to the team';
          sendErr.textContent = "That didn't go through. Try again, or use the email button below."; sendErr.hidden = false;
          sendLink.hidden = false;
        });
    }
    submitBtn.addEventListener('click', submit);
    back.addEventListener('click', function () { go(cur - 1); });
    next.addEventListener('click', function () { go(cur + 1); });
    root.addEventListener('keydown', function (e) { if (e.key === 'Enter' && e.target.tagName === 'INPUT') { e.preventDefault(); go(cur + 1); } });
    var copy = root.querySelector('[data-ask-copy]'), copied = root.querySelector('[data-ask-copied]'), ta = root.querySelector('[data-ask-copytext]');
    copy.addEventListener('click', function () {
      var done = function () { copied.hidden = false; };
      if (navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(ta.value).then(done, function () { ta.select(); done(); });
      else { ta.select(); try { doc.execCommand('copy'); } catch (e) {} done(); }
    });
    return { open: function () { go(1); } };
  }

  var dlg = doc.getElementById('ask');
  var modal = dlg && dlg.showModal ? setup(dlg, true) : null;
  if (dlg && modal) {
    dlg.querySelector('[data-ask-close]').addEventListener('click', function () { dlg.close(); });
    dlg.addEventListener('click', function (e) { if (e.target === dlg) dlg.close(); });   /* the backdrop */
    each(doc.querySelectorAll('[data-ask]'), function (a) {
      a.addEventListener('click', function (e) {
        if (doc.getElementById('ask-inline')) return;                                     /* on /contact/ the questions are already on the page */
        e.preventDefault(); dlg.showModal(); modal.open();
      });
    });
  }
  var inline = doc.getElementById('ask-inline');
  if (inline) setup(inline, false).open();
})();
