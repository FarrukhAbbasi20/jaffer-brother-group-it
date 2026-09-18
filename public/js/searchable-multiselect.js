/**
 * Searchable multiselect dropdown (mockup-matched UX).
 * Trigger + chips summary, in-panel search, checkbox options, click-outside close.
 */
(function (global) {
  "use strict";

  var DOC_BOUND = false;

  function esc(s) {
    return String(s == null ? "" : s)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  }

  function normalizeList(values) {
    var out = [];
    function push(v) {
      var s = String(v == null ? "" : v).trim();
      if (!s) return;
      if (!out.some(function (x) { return x.toLowerCase() === s.toLowerCase(); })) out.push(s);
    }
    if (Array.isArray(values)) values.forEach(push);
    else if (values != null && values !== "") push(values);
    return out;
  }

  function closeAll(except) {
    document.querySelectorAll(".sdd.open").forEach(function (dd) {
      if (except && dd === except) return;
      dd.classList.remove("open");
      dd.classList.add("closed");
      var btn = dd.querySelector(".sdd-toggle");
      if (btn) btn.setAttribute("aria-expanded", "false");
    });
  }

  function ensureDocClose() {
    if (DOC_BOUND) return;
    DOC_BOUND = true;
    document.addEventListener("click", function (e) {
      if (e.target.closest && e.target.closest(".sdd")) return;
      closeAll();
    });
    document.addEventListener("keydown", function (e) {
      if (e.key === "Escape") closeAll();
    });
  }

  function primaryLabel(optEl) {
    var tx = optEl.querySelector(".sdd-tx");
    return (tx ? tx.textContent : optEl.textContent || "").trim();
  }

  function refreshTrigger(host) {
    var labEl = host.querySelector(".sdd-toggle .sdd-lab");
    if (!labEl) return;
    var ph = host.getAttribute("data-ph") || "Select…";
    var picked = Array.prototype.slice.call(host.querySelectorAll(".sdd-opt input:checked"));
    if (!picked.length) {
      labEl.textContent = ph;
      labEl.classList.add("empty");
    } else if (picked.length === 1) {
      labEl.textContent = primaryLabel(picked[0].closest(".sdd-opt"));
      labEl.classList.remove("empty");
    } else {
      labEl.textContent = picked.length + " selected";
      labEl.classList.remove("empty");
    }
  }

  function filterOpts(host, q) {
    q = String(q || "").trim().toLowerCase();
    var any = false;
    host.querySelectorAll(".sdd-opt").forEach(function (op) {
      var hay = (op.getAttribute("data-search") || op.textContent || "").toLowerCase();
      var show = !q || hay.indexOf(q) > -1;
      op.style.display = show ? "" : "none";
      if (show) any = true;
    });
    var empty = host.querySelector(".sdd-filter-empty");
    if (empty) empty.style.display = any || !q ? "none" : "";
  }

  function open(host) {
    if (!host) return;
    closeAll(host);
    host.classList.remove("closed");
    host.classList.add("open");
    var btn = host.querySelector(".sdd-toggle");
    if (btn) btn.setAttribute("aria-expanded", "true");
    var search = host.querySelector(".sdd-search input");
    if (search) {
      search.value = "";
      filterOpts(host, "");
      setTimeout(function () { try { search.focus(); } catch (_) {} }, 0);
    }
  }

  function bindHost(host, onChange) {
    ensureDocClose();
    var toggle = host.querySelector(".sdd-toggle");
    var search = host.querySelector(".sdd-search input");
    if (toggle && !toggle._sddBound) {
      toggle._sddBound = true;
      toggle.addEventListener("click", function (e) {
        e.preventDefault();
        e.stopPropagation();
        if (host.classList.contains("open")) {
          closeAll();
        } else {
          open(host);
        }
      });
    }
    if (search && !search._sddBound) {
      search._sddBound = true;
      search.addEventListener("input", function () { filterOpts(host, search.value); });
      search.addEventListener("click", function (e) { e.stopPropagation(); });
      search.addEventListener("keydown", function (e) { e.stopPropagation(); });
    }
    host.querySelectorAll(".sdd-opt input").forEach(function (inp) {
      if (inp._sddBound) return;
      inp._sddBound = true;
      inp.addEventListener("change", function () {
        var lab = inp.closest(".sdd-opt");
        if (lab) lab.classList.toggle("is-checked", inp.checked);
        refreshTrigger(host);
        if (typeof onChange === "function") onChange();
      });
      inp.addEventListener("click", function (e) { e.stopPropagation(); });
    });
    refreshTrigger(host);
  }

  function fill(hostOrId, options, selectedValues, cfg) {
    cfg = cfg || {};
    var host = typeof hostOrId === "string" ? document.getElementById(hostOrId) : hostOrId;
    if (!host) return;
    var valueKey = cfg.valueKey || "value";
    var labelKey = cfg.labelKey || "label";
    var subKey = cfg.subKey || "sub";
    var searchKey = cfg.searchKey || "search";
    var emptyText = cfg.emptyText || "No options";
    var placeholder = cfg.placeholder || host.getAttribute("data-ph") || "Select…";
    var searchPlaceholder = cfg.searchPlaceholder || "Search…";
    var onChange = cfg.onChange || null;
    var aria = host.getAttribute("aria-label") || "Options";

    host.setAttribute("data-ph", placeholder);
    host.classList.add("sdd", "closed");
    host.classList.remove("open", "multi-select");

    var selected = new Set(normalizeList(selectedValues).map(function (v) { return v.toLowerCase(); }));
    var opts = Array.isArray(options) ? options.slice() : [];
    opts.sort(function (a, b) {
      var av = String(typeof a === "string" ? a : (a[valueKey] || "")).toLowerCase();
      var bv = String(typeof b === "string" ? b : (b[valueKey] || "")).toLowerCase();
      var aOn = selected.has(av) ? 0 : 1;
      var bOn = selected.has(bv) ? 0 : 1;
      if (aOn !== bOn) return aOn - bOn;
      var al = String(typeof a === "string" ? a : (a[labelKey] || a[valueKey] || "")).toLowerCase();
      var bl = String(typeof b === "string" ? b : (b[labelKey] || b[valueKey] || "")).toLowerCase();
      return al.localeCompare(bl);
    });

    var optsHtml;
    if (!opts.length) {
      optsHtml = '<div class="sdd-empty">' + esc(emptyText) + "</div>";
    } else {
      optsHtml = opts.map(function (opt) {
        var value = typeof opt === "string" ? opt : String(opt[valueKey] || "");
        var label = typeof opt === "string" ? opt : String(opt[labelKey] || opt[valueKey] || "");
        var sub = typeof opt === "string" ? "" : String(opt[subKey] || "");
        var search = typeof opt === "string"
          ? opt
          : String(opt[searchKey] || (label + " " + sub + " " + value));
        var checked = selected.has(value.toLowerCase());
        var body = sub
          ? '<span class="sdd-opt-body"><span class="sdd-tx">' + esc(label) + '</span><span class="sdd-sub">' + esc(sub) + "</span></span>"
          : '<span class="sdd-tx">' + esc(label) + "</span>";
        return (
          '<label class="sdd-opt' + (checked ? " is-checked" : "") + '" data-search="' + esc(search) + '">' +
            '<input type="checkbox" value="' + esc(value) + '"' + (checked ? " checked" : "") + ">" +
            body +
          "</label>"
        );
      }).join("");
      optsHtml += '<div class="sdd-filter-empty" style="display:none">No matches</div>';
    }

    host.innerHTML =
      '<button type="button" class="sdd-toggle" aria-expanded="false" aria-haspopup="listbox" aria-label="' + esc(aria) + '">' +
        '<span class="sdd-lab empty">' + esc(placeholder) + "</span>" +
        '<i data-lucide="chevron-down" class="sdd-cx" aria-hidden="true"></i>' +
      "</button>" +
      '<div class="sdd-panel" role="listbox" aria-multiselectable="true">' +
        '<div class="sdd-search">' +
          '<div class="sdd-search-inner">' +
            '<i data-lucide="search" class="sdd-search-ico" aria-hidden="true"></i>' +
            '<input type="search" placeholder="' + esc(searchPlaceholder) + '" autocomplete="off" aria-label="Filter options">' +
          "</div>" +
        "</div>" +
        '<div class="sdd-opts">' + optsHtml + "</div>" +
      "</div>";

    bindHost(host, onChange);
    try {
      if (typeof global.refreshLucideIcons === "function") global.refreshLucideIcons();
      else if (global.lucide && typeof global.lucide.createIcons === "function") global.lucide.createIcons();
    } catch (_) {}
  }

  function getChecked(hostOrId) {
    var host = typeof hostOrId === "string" ? document.getElementById(hostOrId) : hostOrId;
    if (!host) return [];
    return Array.prototype.slice
      .call(host.querySelectorAll('input[type="checkbox"]:checked'))
      .map(function (el) { return String(el.value || "").trim(); })
      .filter(Boolean);
  }

  function focusOpen(hostOrId) {
    var host = typeof hostOrId === "string" ? document.getElementById(hostOrId) : hostOrId;
    if (!host) return;
    open(host);
  }

  global.SearchableMultiSelect = {
    fill: fill,
    getChecked: getChecked,
    closeAll: closeAll,
    open: open,
    focusOpen: focusOpen,
    refreshTrigger: refreshTrigger
  };
})(typeof window !== "undefined" ? window : globalThis);
