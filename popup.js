(function () {
  "use strict";

  // =========================
  // SETTINGS
  // =========================
  var STORAGE_KEY = "techhub_first_visit_notice_dismissed_v2";
  var NOTICE_DURATION = 1000 * 60 * 60 * 48; // 48 hours

  var MODAL_TITLE = "Please Note:";
  var MODAL_BODY =
    "Due to ongoing changes in the technology market, product pricing is subject to change without notice. We appreciate your understanding as we work to provide competitive pricing and availability.";

  var BUTTON_TEXT = "I Understand";

  var COLOR_MAROON = "#500000";
  var COLOR_MAROON_DARK = "#360000";
  var COLOR_TEXT = "#202020";

  // =========================
  // HELPERS
  // =========================
  function migrateOldValueIfNeeded() {
    // Old script stored "true"; this script stores a timestamp.
    try {
      var value = localStorage.getItem(STORAGE_KEY);

      if (value === "true") {
        localStorage.removeItem(STORAGE_KEY);
        localStorage.setItem(STORAGE_KEY, Date.now().toString());
      }
    } catch (e) {}
  }

  function shouldShowModal() {
    try {
      var lastDismissed = localStorage.getItem(STORAGE_KEY);

      // Show immediately if the notice has never been dismissed.
      if (!lastDismissed) return true;

      var timestamp = parseInt(lastDismissed, 10);

      // Show if the stored value is invalid.
      if (!isFinite(timestamp)) return true;

      // Show again 48 hours after the last dismissal.
      return Date.now() - timestamp >= NOTICE_DURATION;
    } catch (e) {
      return true;
    }
  }

  function setDismissedState() {
    try {
      localStorage.setItem(STORAGE_KEY, Date.now().toString());
    } catch (e) {}
  }

  function onReady(fn) {
    if (document.readyState === "loading") {
      document.addEventListener("DOMContentLoaded", fn);
    } else {
      fn();
    }
  }

  function injectFontsOnce() {
    if (document.getElementById("techhub-modal-fonts")) return;

    var link1 = document.createElement("link");
    link1.id = "techhub-modal-fonts";
    link1.rel = "stylesheet";
    link1.href =
      "https://fonts.googleapis.com/css2?family=Oswald:wght@400;500;600;700&display=swap";

    var link2 = document.createElement("link");
    link2.rel = "stylesheet";
    link2.href =
      "https://fonts.googleapis.com/css2?family=Work+Sans:wght@300;400;500;600;700&display=swap";

    document.head.appendChild(link1);
    document.head.appendChild(link2);
  }

  // =========================
  // MODAL
  // =========================
  function showModal() {
    if (document.getElementById("techhub-first-visit-backdrop")) return;

    injectFontsOnce();

    var backdrop = document.createElement("div");
    backdrop.id = "techhub-first-visit-backdrop";
    backdrop.style.position = "fixed";
    backdrop.style.inset = "0";
    backdrop.style.zIndex = "999999";
    backdrop.style.background = "rgba(0,0,0,0.45)";
    backdrop.style.display = "flex";
    backdrop.style.alignItems = "center";
    backdrop.style.justifyContent = "center";
    backdrop.style.padding = "20px";

    var modal = document.createElement("div");
    modal.setAttribute("role", "dialog");
    modal.setAttribute("aria-modal", "true");
    modal.setAttribute("aria-labelledby", "techhub-modal-title");
    modal.tabIndex = -1;

    modal.style.width = "min(720px, 96vw)";
    modal.style.background = "#ffffff";
    modal.style.borderRadius = "10px";
    modal.style.boxShadow = "0 12px 40px rgba(0,0,0,0.25)";
    modal.style.border = "1px solid rgba(0,0,0,0.08)";
    modal.style.overflow = "hidden";

    var header = document.createElement("div");
    header.style.padding = "18px";
    header.style.borderBottom = "1px solid rgba(0,0,0,0.08)";

    var title = document.createElement("div");
    title.id = "techhub-modal-title";
    title.textContent = MODAL_TITLE;
    title.style.fontFamily =
      "'Work Sans', system-ui, -apple-system, 'Segoe UI', Roboto, Arial, sans-serif";
    title.style.fontSize = "26px";
    title.style.fontWeight = "600";
    title.style.color = COLOR_TEXT;

    var body = document.createElement("div");
    body.style.padding = "18px";

    var bodyText = document.createElement("div");
    bodyText.textContent = MODAL_BODY;
    bodyText.style.fontFamily =
      "'Work Sans', system-ui, -apple-system, 'Segoe UI', Roboto, Arial, sans-serif";
    bodyText.style.fontSize = "18px";
    bodyText.style.lineHeight = "1.5";
    bodyText.style.color = COLOR_TEXT;

    var footer = document.createElement("div");
    footer.style.padding = "18px";
    footer.style.display = "flex";
    footer.style.justifyContent = "flex-end";

    var okBtn = document.createElement("button");
    okBtn.type = "button";
    okBtn.textContent = BUTTON_TEXT;
    okBtn.style.fontFamily =
      "'Work Sans', system-ui, -apple-system, 'Segoe UI', Roboto, Arial, sans-serif";
    okBtn.style.fontWeight = "700";
    okBtn.style.textTransform = "uppercase";
    okBtn.style.fontSize = "12pt";
    okBtn.style.height = "44px";
    okBtn.style.padding = "0 18px";
    okBtn.style.background = COLOR_MAROON;
    okBtn.style.color = "#ffffff";
    okBtn.style.border = "none";
    okBtn.style.cursor = "pointer";

    okBtn.addEventListener("mouseenter", function () {
      okBtn.style.background = COLOR_MAROON_DARK;
    });

    okBtn.addEventListener("mouseleave", function () {
      okBtn.style.background = COLOR_MAROON;
    });

    okBtn.addEventListener("click", function () {
      setDismissedState();
      backdrop.remove();
    });

    header.appendChild(title);
    body.appendChild(bodyText);
    footer.appendChild(okBtn);

    modal.appendChild(header);
    modal.appendChild(body);
    modal.appendChild(footer);

    backdrop.appendChild(modal);
    document.body.appendChild(backdrop);

    okBtn.focus();
  }

  // =========================
  // RUN
  // =========================
  onReady(function () {
    migrateOldValueIfNeeded();

    if (shouldShowModal()) {
      showModal();
    }
  });
})();
