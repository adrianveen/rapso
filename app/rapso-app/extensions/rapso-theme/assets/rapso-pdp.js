(function() {
  function ready(fn){ if(document.readyState!=='loading'){fn()} else {document.addEventListener('DOMContentLoaded',fn)} }
  ready(function(){
    document.querySelectorAll('[data-rapso-block]').forEach(function(root){
      var btn = root.querySelector('.rapso-btn');
      var modal = root.querySelector('.rapso-modal');
      var close = root.querySelector('.rapso-close');
      var fileInput = root.querySelector('input[type="file"]');
      var heightInput = root.querySelector('input[type="number"]');
      var submit = root.querySelector('.rapso-submit');
      var status = root.querySelector('.rapso-status');
      var customerId = root.getAttribute('data-customer-id');
      var activeJobToken = 0; // incremented per upload to guard DOM updates
      var pollHandle = null;

      function show(){ modal.hidden = false; }
      function hide(){ modal.hidden = true; }
      btn && btn.addEventListener('click', show);
      close && close.addEventListener('click', hide);
      modal && modal.addEventListener('click', function(e){ if(e.target===modal) hide(); });

      function clearViewer(){
        // Remove any existing model viewers inside this block
        try { Array.prototype.slice.call(root.querySelectorAll('model-viewer')).forEach(function(n){ n.remove(); }); } catch(e) {}
      }

      async function createJob(){
        try {
          // New upload: mint token and cancel any previous pollers
          activeJobToken += 1;
          var myToken = activeJobToken;
          if (pollHandle) { try { clearInterval(pollHandle); } catch(e) {} pollHandle = null; }
          // Clear any previous viewer and reset UI
          clearViewer();
          status.textContent = 'Uploading…'; status.classList.remove('rapso-status--error');
          if (submit) submit.disabled = true;
          var f = fileInput.files && fileInput.files[0];
          if(!f){ status.textContent = 'Please choose a photo'; return; }
          // Save height for logged-in customers via proxy (with confirm)
          if (customerId && heightInput.value) {
            try {
              var confirmSave = confirm('Save your height to your profile?');
              if (confirmSave) {
                var saveFd = new FormData();
                saveFd.append('customer_id', customerId);
                saveFd.append('height_cm', heightInput.value);
                await fetch('/apps/rapso/fit/save-height', { method: 'POST', body: saveFd });
              }
            } catch (e) {}
          }
          // 1) Presign
          var pre = await fetch('/apps/rapso/fit/presign', { method: 'POST', headers: { 'content-type':'application/json' }, body: JSON.stringify({ files: [{ name: f.name, contentType: f.type, size: f.size }] }) });
          if(!pre.ok){ status.textContent = 'Presign failed'; status.classList.add('rapso-status--error'); return; }
          var preData = await pre.json();
          var up = preData.uploads && preData.uploads[0];
          if(!up){ status.textContent = 'Presign error'; status.classList.add('rapso-status--error'); return; }
          var objectKey = up.object_key;
          // 2) Upload
          if (up.dev) {
            var form = new FormData();
            form.append('file', f);
            form.append('key', up.fields.key);
            var ur = await fetch('/apps/rapso/fit/dev-upload', { method: 'POST', body: form });
            if(!ur.ok){ status.textContent = 'Upload failed'; status.classList.add('rapso-status--error'); return; }
          } else {
            var form2 = new FormData();
            Object.keys(up.fields || {}).forEach(function(k){ form2.append(k, up.fields[k]); });
            form2.append('file', f);
            var ur2 = await fetch(up.url, { method: 'POST', body: form2 });
            if(!(ur2.status >= 200 && ur2.status < 300)) { status.textContent = 'Upload failed'; status.classList.add('rapso-status--error'); return; }
          }
          // 3) Commit
          var commitRes = await fetch('/apps/rapso/fit/commit?shop=' + encodeURIComponent(window.Shopify && Shopify.shop || ''), {
            method: 'POST', headers: { 'content-type':'application/json' },
            body: JSON.stringify({ object_keys: [objectKey], height_cm: heightInput.value ? Number(heightInput.value) : undefined, customer_id: customerId || undefined })
          });
          if(!commitRes.ok){ status.textContent = 'Commit failed'; status.classList.add('rapso-status--error'); return; }
          var commit = await commitRes.json();
          var jobId = commit.job_id;
          status.textContent = 'Job created. Processing…';
          // Poll job status via proxy (guarded by token)
          var attempts = 0;
          pollHandle = setInterval(async function(){
            attempts++;
            try {
              // If a newer upload started, stop this poller
              if (myToken !== activeJobToken) { clearInterval(pollHandle); pollHandle = null; return; }
              var r = await fetch('/apps/rapso/fit/status?job_id=' + jobId);
              var j = await r.json();
              if(j.status === 'completed' || j.status === 'succeeded'){
                // Ensure this is still the active upload
                if (myToken !== activeJobToken) { clearInterval(pollHandle); pollHandle = null; return; }
                clearInterval(pollHandle); pollHandle = null;
                status.textContent = 'Model ready!';
                try {
                  // derive a storefront-accessible URL for the asset
                  var src = null;
                  if (j.output_url) {
                    if (j.output_url.startsWith('/apps/rapso/assets/')) {
                      src = j.output_url;
                    } else if (j.output_url.startsWith('/assets/')) {
                      src = '/apps/rapso' + j.output_url;
                    } else if (/^https?:\/\//i.test(j.output_url)) {
                      // absolute URL (e.g., S3); try to use directly
                      src = j.output_url;
                    }
                  }
                  if (src) {
                    // Only keep a single viewer for the active upload
                    clearViewer();
                    ensureModelViewer();
                    var viewer = document.createElement('model-viewer');
                    viewer.setAttribute('src', src);
                    viewer.setAttribute('style','width:100%;height:360px;background:#f6f6f7;border-radius:12px;margin-top:8px');
                    viewer.setAttribute('camera-controls','');
                    viewer.setAttribute('shadow-intensity','0.5');
                    viewer.setAttribute('exposure','1.0');
                    status.after(viewer);
                  }
                  if (submit) submit.disabled = false;
                } catch(e) {}
              } else if(j.status === 'failed'){
                clearInterval(pollHandle); pollHandle = null;
                status.textContent = 'Processing failed'; status.classList.add('rapso-status--error');
                if (submit) submit.disabled = false;
              }
            } catch(e) {}
            if(attempts>60){ if (pollHandle) { clearInterval(pollHandle); pollHandle = null; } status.textContent = 'Timed out'; status.classList.add('rapso-status--error'); if (submit) submit.disabled = false; }
          }, 2000);
        } catch (e) {
          status.textContent = 'Unexpected error'; status.classList.add('rapso-status--error');
          if (submit) submit.disabled = false;
        }
      }
      submit && submit.addEventListener('click', createJob);
    });
  });

  function ensureModelViewer(){
    if (window.customElements && window.customElements.get && window.customElements.get('model-viewer')) return;
    var existing = document.querySelector('script[data-rapso-model-viewer]');
    if (existing) return;
    var script = document.createElement('script');
    script.type = 'module';
    script.setAttribute('data-rapso-model-viewer','');
    script.src = 'https://unpkg.com/@google/model-viewer/dist/model-viewer.min.js';
    document.head.appendChild(script);
  }
})();
