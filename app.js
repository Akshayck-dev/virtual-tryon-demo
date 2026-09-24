/* TryOn Studio — client logic.
   Calls Google's Gemini image model (gemini-2.5-flash-image) directly from the
   browser. The API key lives only in localStorage; nothing is sent anywhere else. */

(function () {
  "use strict";

  var KEY_STORAGE = "vto_gemini_key";
  var FREE_KEY_STORAGE = "vto_pollinations_key";
  var MODEL = "gemini-3.1-flash-image";
  var MAX_DIM = 1024;

  // Public base URL of this demo (Free AI needs publicly reachable image URLs).
  var SITE_BASE = "https://akshayck-dev.github.io/virtual-tryon-demo/";
  var MODEL_PHOTO = SITE_BASE + "assets/test-person-photo.jpg";

  var selectedGarment = null;
  var personDataUrl = null; // resized dataURL of the uploaded photo
  var mode = "demo"; // "demo" = pre-generated preview, "free" = Pollinations, "live" = Gemini API

  var $ = function (id) { return document.getElementById(id); };

  /* ---------- Garment picker ---------- */

  function renderPicker() {
    var grid = $("pickGrid");
    window.GARMENTS.forEach(function (g) {
      var btn = document.createElement("button");
      btn.type = "button";
      btn.className = "pick";
      btn.dataset.id = g.id;
      btn.innerHTML =
        '<img src="' + g.img + '" alt="' + g.name + '" loading="lazy" />' +
        '<div class="pname">' + g.name + "</div>";
      btn.addEventListener("click", function () { selectGarment(g.id); });
      grid.appendChild(btn);
    });
  }

  function selectGarment(id) {
    selectedGarment = window.GARMENTS.find(function (g) { return g.id === id; }) || null;
    var buttons = document.querySelectorAll(".pick");
    buttons.forEach(function (b) {
      b.classList.toggle("selected", b.dataset.id === id);
    });
    updateHint();
  }

  /* ---------- Photo upload ---------- */

  function handleFile(file) {
    if (!file || !file.type.match(/^image\//)) {
      showError("Please choose an image file (JPG or PNG).");
      return;
    }
    var reader = new FileReader();
    reader.onload = function () {
      resizeImage(reader.result, function (resized) {
        personDataUrl = resized;
        $("photoImg").src = resized;
        $("photoPreview").classList.add("show");
        $("uploadZone").style.display = "none";
        hideError();
        updateHint();
      });
    };
    reader.readAsDataURL(file);
  }

  // Downscale big photos so the API payload stays small and fast.
  function resizeImage(dataUrl, done) {
    var img = new Image();
    img.onload = function () {
      var w = img.width, h = img.height;
      var scale = Math.min(1, MAX_DIM / Math.max(w, h));
      var cw = Math.round(w * scale), ch = Math.round(h * scale);
      var canvas = document.createElement("canvas");
      canvas.width = cw; canvas.height = ch;
      canvas.getContext("2d").drawImage(img, 0, 0, cw, ch);
      done(canvas.toDataURL("image/jpeg", 0.9));
    };
    img.src = dataUrl;
  }

  /* ---------- API key ---------- */

  function loadKey() {
    var saved = "";
    try { saved = localStorage.getItem(KEY_STORAGE) || ""; } catch (e) {}
    if (saved) {
      $("apiKey").value = saved;
      $("keySaved").classList.add("show");
    }
    var freeSaved = "";
    try { freeSaved = localStorage.getItem(FREE_KEY_STORAGE) || ""; } catch (e) {}
    if (freeSaved) {
      $("freeKey").value = freeSaved;
      $("freeKeySaved").classList.add("show");
    }
  }

  /* ---------- Mode toggle ---------- */

  function setMode(next) {
    mode = next;
    $("modeDemo").classList.toggle("active", mode === "demo");
    $("modeFree").classList.toggle("active", mode === "free");
    $("modeLive").classList.toggle("active", mode === "live");
    var needsUpload = (mode === "live");
    $("photoPanel").classList.toggle("dimmed", !needsUpload);
    $("keyPanel").classList.toggle("dimmed", !needsUpload);
    $("freeKeyWrap").style.display = mode === "free" ? "" : "none";
    $("demoNote").style.display = mode === "demo" ? "" : "none";
    $("freeNote").style.display = mode === "free" ? "" : "none";
    hideError();
    updateHint();
  }

  /* ---------- Helpers ---------- */

  function updateHint() {
    if (mode === "demo") {
      $("selectionHint").textContent = selectedGarment
        ? "Ready — " + selectedGarment.name + " selected. Hit “Try it on” for an instant preview."
        : "Select a garment and hit “Try it on”.";
      return;
    }
    if (mode === "free") {
      $("selectionHint").textContent = selectedGarment
        ? "Ready — " + selectedGarment.name + " selected. Hit “Try it on” to generate it live (free AI)."
        : "Select a garment, paste your free Pollinations key above, and hit “Try it on”.";
      return;
    }
    var parts = [];
    if (!selectedGarment) parts.push("select a garment");
    if (!personDataUrl) parts.push("upload a photo");
    $("selectionHint").textContent = parts.length
      ? "To begin: " + parts.join(" and ") + "."
      : "Ready — " + selectedGarment.name + " selected. Hit “Try it on”.";
  }

  function showError(msg) {
    var box = $("errorBox");
    box.textContent = msg;
    box.classList.add("show");
  }
  function hideError() { $("errorBox").classList.remove("show"); }

  function dataUrlToBase64(dataUrl) { return dataUrl.split(",")[1]; }
  function mimeOf(dataUrl) {
    var m = dataUrl.match(/^data:(image\/[a-z]+);base64,/);
    return m ? m[1] : "image/jpeg";
  }

  function blobToDataUrl(blob) {
    return new Promise(function (resolve, reject) {
      var r = new FileReader();
      r.onload = function () { resolve(r.result); };
      r.onerror = reject;
      r.readAsDataURL(blob);
    });
  }

  /* ---------- Generation ---------- */

  var STATUS_LINES = [
    "Analyzing your photo…",
    "Fitting the garment…",
    "Matching fabric and lighting…",
    "Adding final details…",
  ];
  var statusTimer = null;

  function setLoading(on) {
    var stage = $("resultStage");
    var btn = $("generateBtn");
    if (on) {
      btn.disabled = true;
      btn.textContent = "Generating…";
      $("afterActions").style.display = "none";
      hideError();
      var i = 0;
      stage.innerHTML =
        '<div class="placeholder"><div class="spinner"></div>' +
        '<div class="status-line" id="statusLine">' + STATUS_LINES[0] + "</div></div>";
      statusTimer = setInterval(function () {
        i = (i + 1) % STATUS_LINES.length;
        var el = document.getElementById("statusLine");
        if (el) el.textContent = STATUS_LINES[i];
      }, 2600);
    } else {
      clearInterval(statusTimer);
      btn.disabled = false;
      btn.textContent = "✨ Try it on";
    }
  }

  function friendlyError(status, body) {
    if (status === 400) {
      if (body && /key/i.test(body)) return "That API key looks invalid. Double-check it in Google AI Studio and paste it again.";
      return "The request was rejected (400). " + (body || "");
    }
    if (status === 403) return "Access denied (403) — this API key may not have the Gemini API enabled.";
    if (status === 429) return "Rate limit hit (429) — wait a minute and try again.";
    return "Something went wrong (" + status + "). " + (body || "");
  }

  function generate() {
    hideError();
    if (!selectedGarment) { showError("Pick a garment first (step 1)."); return; }
    if (mode === "demo") { generateDemo(); return; }
    if (mode === "free") { generateFree(); return; }
    generateLive();
  }

  // Instant demo: show the pre-generated preview for the selected garment.
  function generateDemo() {
    var btn = $("generateBtn");
    btn.disabled = true;
    btn.textContent = "Loading preview…";
    $("afterActions").style.display = "none";
    var img = new Image();
    img.onload = function () {
      $("resultStage").innerHTML =
        '<span class="demo-badge">⚡ Demo preview · pre-generated</span>' +
        '<img class="out" src="' + selectedGarment.pregen + '" alt="Pre-generated try-on preview — ' + selectedGarment.name + '" />';
      $("downloadBtn").href = selectedGarment.pregen;
      $("downloadBtn").setAttribute("download", "tryon-" + selectedGarment.id + ".jpg");
      $("afterActions").style.display = "flex";
      $("selectionHint").textContent = "This is how the " + selectedGarment.name + " looks on our model. Try another garment, or switch to Live AI for your own photo.";
      btn.disabled = false;
      btn.textContent = "✨ Try it on";
    };
    img.onerror = function () {
      btn.disabled = false;
      btn.textContent = "✨ Try it on";
      showError("Couldn't load the preview image. Check your connection and try again.");
    };
    img.src = selectedGarment.pregen;
  }

  // Free AI: live generation via Pollinations (free key), on our public model photo.
  function generateFree() {
    var key = $("freeKey").value.trim();
    if (!key) { showError("Paste your free Pollinations API key above — get one at enter.pollinations.ai (no card needed)."); return; }

    var prompt =
      "Virtual try-on: dress the person from the first reference image in the " +
      selectedGarment.desc + " from the second reference image. Keep the exact same " +
      "face, pose, background and lighting. Change only the clothing, with realistic " +
      "fabric folds and shadows. Photorealistic fashion photography.";

    var url =
      "https://gen.pollinations.ai/image/" + encodeURIComponent(prompt) +
      "?model=nanobanana" +
      "&image=" + encodeURIComponent(MODEL_PHOTO + "|" + SITE_BASE + selectedGarment.img) +
      "&width=768&height=1024&nologo=true&private=true" +
      "&seed=" + Math.floor(Math.random() * 2147483647) +
      "&key=" + encodeURIComponent(key);

    var btn = $("generateBtn");
    btn.disabled = true;
    btn.textContent = "Generating…";
    $("afterActions").style.display = "none";
    $("resultStage").innerHTML =
      '<div class="placeholder"><div class="spinner"></div>' +
      '<div class="status-line">Free AI is generating your try-on… (takes ~30–60s)</div></div>';

    var img = new Image();
    img.onload = function () {
      $("resultStage").innerHTML =
        '<span class="demo-badge">🆓 Free AI · live generated</span>' +
        '<img class="out" src="' + url + '" alt="Free AI try-on — ' + selectedGarment.name + '" />';
      // Download via fetch (Pollinations sends CORS *); fallback opens the image.
      fetch(url)
        .then(function (r) { if (!r.ok) throw new Error("dl"); return r.blob(); })
        .then(function (b) {
          var obj = URL.createObjectURL(b);
          $("downloadBtn").href = obj;
          $("downloadBtn").setAttribute("download", "tryon-" + selectedGarment.id + "-free.jpg");
        })
        .catch(function () {
          $("downloadBtn").href = url;
          $("downloadBtn").removeAttribute("download");
          $("downloadBtn").target = "_blank";
        });
      $("afterActions").style.display = "flex";
      $("selectionHint").textContent = "Freshly generated! Try another garment or hit “Try it on” again for a new variation.";
      btn.disabled = false;
      btn.textContent = "✨ Try it on";
    };
    img.onerror = function () {
      btn.disabled = false;
      btn.textContent = "✨ Try it on";
      $("resultStage").innerHTML =
        '<div class="placeholder" id="resultPlaceholder"><div class="big">👗</div><p>Your AI try-on will appear here.</p></div>';
      showError("Free AI generation failed — check your Pollinations key (enter.pollinations.ai) and try again.");
    };
    img.src = url;
  }

  function generateLive() {
    if (!personDataUrl) { showError("Upload your photo first (step 2)."); return; }
    var key = $("apiKey").value.trim();
    if (!key) { showError("Paste your Gemini API key in step 3 (Live AI mode needs it)."); return; }

    setLoading(true);

    // Garment product photos are local files; fetch → base64.
    fetch(selectedGarment.img)
      .then(function (res) {
        if (!res.ok) throw new Error("asset");
        return res.blob();
      })
      .then(blobToDataUrl)
      .then(function (garmentDataUrl) {
        var prompt =
          "You are an AI virtual try-on system. The FIRST image is a photo of a person. " +
          "The SECOND image is a product photo of a garment. Create a photorealistic " +
          "full-body image of the SAME person from the first image now wearing the " +
          "garment from the second image. Keep the person's face, hair, skin tone, body " +
          "shape, pose, and the background and lighting of the first photo exactly the " +
          "same — change ONLY the clothing, fitting the garment naturally onto their " +
          "body with realistic fabric drape, folds and shadows. Return only the final image.";

        return fetch(
          "https://generativelanguage.googleapis.com/v1beta/models/" + MODEL +
          ":generateContent?key=" + encodeURIComponent(key),
          {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              contents: [{
                parts: [
                  { inlineData: { mimeType: mimeOf(personDataUrl), data: dataUrlToBase64(personDataUrl) } },
                  { inlineData: { mimeType: mimeOf(garmentDataUrl), data: dataUrlToBase64(garmentDataUrl) } },
                  { text: prompt },
                ],
              }],
              generationConfig: { responseModalities: ["TEXT", "IMAGE"] },
            }),
          }
        );
      })
      .then(function (res) {
        if (!res.ok) {
          return res.text().then(function (t) {
            throw { status: res.status, body: t.slice(0, 300) };
          });
        }
        return res.json();
      })
      .then(function (data) {
        var parts = (((data.candidates || [])[0] || {}).content || {}).parts || [];
        var imgPart = parts.find(function (p) { return p.inlineData && p.inlineData.data; });
        setLoading(false);
        if (!imgPart) {
          var textPart = parts.find(function (p) { return p.text; });
          showError("The AI didn't return an image. " + (textPart ? "It said: " + textPart.text.slice(0, 200) : "Please try again."));
          $("resultStage").innerHTML =
            '<div class="placeholder" id="resultPlaceholder"><div class="big">👗</div><p>Your AI try-on will appear here.</p></div>';
          return;
        }
        var outUrl = "data:" + (imgPart.inlineData.mimeType || "image/png") + ";base64," + imgPart.inlineData.data;
        $("resultStage").innerHTML = '<img class="out" src="' + outUrl + '" alt="AI try-on result" />';
        $("downloadBtn").href = outUrl;
        $("afterActions").style.display = "flex";
        $("selectionHint").textContent = "Looking good! Download it or try another garment.";
      })
      .catch(function (err) {
        setLoading(false);
        $("resultStage").innerHTML =
          '<div class="placeholder" id="resultPlaceholder"><div class="big">👗</div><p>Your AI try-on will appear here.</p></div>';
        if (err && err.status) {
          showError(friendlyError(err.status, err.body));
        } else if (err && err.message === "asset") {
          showError("Couldn't read the garment image. If you opened this file directly, run a local server instead — e.g. `python3 -m http.server` in this folder, then open http://localhost:8000/studio.html");
        } else {
          showError("Network error — check your connection and try again.");
        }
      });
  }

  /* ---------- Wire up ---------- */

  function init() {
    renderPicker();
    loadKey();
    setMode("demo");

    // Pre-select garment from index.html cards (?g=id)
    var params = new URLSearchParams(window.location.search);
    var preset = params.get("g");
    if (preset && window.GARMENTS.some(function (g) { return g.id === preset; })) {
      selectGarment(preset);
    }
    updateHint();

    var input = $("photoInput");
    input.addEventListener("change", function () { handleFile(input.files[0]); });

    var zone = $("uploadZone");
    zone.addEventListener("dragover", function (e) { e.preventDefault(); zone.classList.add("dragover"); });
    zone.addEventListener("dragleave", function () { zone.classList.remove("dragover"); });
    zone.addEventListener("drop", function (e) {
      e.preventDefault();
      zone.classList.remove("dragover");
      if (e.dataTransfer.files.length) handleFile(e.dataTransfer.files[0]);
    });

    $("removePhoto").addEventListener("click", function () {
      personDataUrl = null;
      input.value = "";
      $("photoPreview").classList.remove("show");
      zone.style.display = "";
      updateHint();
    });

    $("saveKey").addEventListener("click", function () {
      var v = $("apiKey").value.trim();
      if (!v) { showError("Paste your API key first."); return; }
      try { localStorage.setItem(KEY_STORAGE, v); } catch (e) {}
      $("keySaved").classList.add("show");
      hideError();
    });

    $("saveFreeKey").addEventListener("click", function () {
      var v = $("freeKey").value.trim();
      if (!v) { showError("Paste your Pollinations API key first."); return; }
      try { localStorage.setItem(FREE_KEY_STORAGE, v); } catch (e) {}
      $("freeKeySaved").classList.add("show");
      hideError();
    });

    $("generateBtn").addEventListener("click", generate);
    $("modeDemo").addEventListener("click", function () { setMode("demo"); });
    $("modeFree").addEventListener("click", function () { setMode("free"); });
    $("modeLive").addEventListener("click", function () { setMode("live"); });
    $("againBtn").addEventListener("click", function () {
      $("resultStage").innerHTML =
        '<div class="placeholder" id="resultPlaceholder"><div class="big">👗</div><p>Your AI try-on will appear here.</p></div>';
      $("afterActions").style.display = "none";
      updateHint();
      window.scrollTo({ top: 0, behavior: "smooth" });
    });
  }

  document.addEventListener("DOMContentLoaded", init);
})();
