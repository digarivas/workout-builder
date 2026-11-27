/* Workout Builder - Creador de rutinas web
   UI, persistencia (localStorage), importacion (PDF/OCR/CSV/JSON) y exportacion. */
(function () {
  "use strict";

  const M = window.FT_MODEL;
  const P = window.FT_PARSER;
  const I18N = window.FT_I18N;
  const t = function () { return I18N.t.apply(null, arguments); };

  const LS_KEY = "ft_web_builder_v1";

  const $ = function (sel) { return document.querySelector(sel); };
  const $$ = function (sel) { return Array.prototype.slice.call(document.querySelectorAll(sel)); };

  function esc(value) {
    return String(value === null || value === undefined ? "" : value)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#39;");
  }

  // ---------- Estado ----------

  const state = {
    routines: [],
    activeId: null,
    lang: "es",
    theme: "light",
  };

  let exerciseData = { presets: [], catalog: [] };
  let saveTimer = null;

  function active() {
    let r = state.routines.find(function (x) { return x.id === state.activeId; });
    if (!r) {
      r = defaultRoutine();
      state.routines.push(r);
      state.activeId = r.id;
    }
    return r;
  }

  function defaultRoutine() {
    const r = M.newRoutine("");
    r.days[0].name = t("dayPrefix") + " A";
    return r;
  }

  function dataOpts() {
    return { presets: exerciseData.presets || [], catalog: exerciseData.catalog || [], lang: state.lang };
  }

  // ---------- Persistencia ----------

  function save() {
    clearTimeout(saveTimer);
    saveTimer = setTimeout(saveNow, 400);
  }

  function saveNow() {
    try {
      localStorage.setItem(LS_KEY, JSON.stringify({
        v: 1,
        activeId: state.activeId,
        lang: state.lang,
        theme: state.theme,
        routines: state.routines,
      }));
    } catch (e) { /* almacenamiento no disponible */ }
  }

  function load() {
    try {
      const raw = localStorage.getItem(LS_KEY);
      if (!raw) return false;
      const data = JSON.parse(raw);
      if (!data || !Array.isArray(data.routines)) return false;
      state.routines = data.routines;
      state.activeId = data.activeId || (state.routines[0] && state.routines[0].id);
      state.lang = data.lang === "en" ? "en" : "es";
      state.theme = data.theme === "dark" ? "dark" : "light";
      return state.routines.length > 0;
    } catch (e) {
      return false;
    }
  }

  // ---------- i18n / tema ----------

  function applyI18n() {
    I18N.setLang(state.lang);
    document.documentElement.lang = state.lang;
    document.title = t("brand") + " — " + t("pageTitle");
    $$("[data-i18n]").forEach(function (el) { el.textContent = t(el.getAttribute("data-i18n")); });
    $$("[data-i18n-ph]").forEach(function (el) { el.setAttribute("placeholder", t(el.getAttribute("data-i18n-ph"))); });
    $$("[data-i18n-title]").forEach(function (el) {
      const label = t(el.getAttribute("data-i18n-title"));
      el.setAttribute("title", label);
      el.setAttribute("aria-label", label);
    });
    $("#langEs").classList.toggle("active", state.lang === "es");
    $("#langEn").classList.toggle("active", state.lang === "en");
    $("#langEs").setAttribute("aria-pressed", state.lang === "es");
    $("#langEn").setAttribute("aria-pressed", state.lang === "en");
    updateThemeToggle();
  }

  function applyTheme() {
    const dark = state.theme === "dark";
    document.documentElement.setAttribute("data-theme", dark ? "dark" : "light");
    document.documentElement.classList.toggle("dark", dark);
    document.documentElement.style.colorScheme = dark ? "dark" : "light";
    const meta = document.querySelector('meta[name="theme-color"]');
    if (meta) meta.setAttribute("content", dark ? "#0f0f11" : "#fafaf9");
    updateThemeToggle();
  }

  function updateThemeToggle() {
    const btn = $("#themeToggle");
    if (!btn) return;
    const dark = state.theme === "dark";
    const icon = $("#themeIcon");
    const label = $("#themeLabel");
    if (icon) icon.textContent = dark ? "light_mode" : "dark_mode";
    if (label) label.textContent = t(dark ? "themeLight" : "themeDark");
    const title = t(dark ? "themeSwitchToLight" : "themeSwitchToDark");
    btn.setAttribute("title", title);
    btn.setAttribute("aria-label", title);
    btn.setAttribute("aria-pressed", dark ? "true" : "false");
  }

  function setLanguage(lang) {
    state.lang = lang;
    translateDayNames(lang);
    save();
    applyI18n();
    renderLibrary();
    renderMeta();
    renderDays();
  }

  function translateDayNames(lang) {
    const target = lang === "en" ? M.WEEKDAY_NAMES_EN : M.WEEKDAY_NAMES_ES;
    const byName = {};
    M.DAY_CODES.forEach(function (code) {
      byName[P.norm(code)] = code;
      byName[P.norm(M.WEEKDAY_NAMES_ES[code])] = code;
      byName[P.norm(M.WEEKDAY_NAMES_EN[code])] = code;
    });
    const dayPrefix = lang === "en" ? "Day" : "Día";

    state.routines.forEach(function (routine) {
      (routine.days || []).forEach(function (day) {
        const raw = String(day.name || "").trim();
        if (!raw) return;

        const exactCode = byName[P.norm(raw)];
        if (exactCode) {
          day.name = target[exactCode];
          return;
        }

        const separated = raw.match(/^([^—–-]+?)\s*[—–-]\s*(.+)$/);
        if (separated) {
          const code = byName[P.norm(separated[1])];
          if (code) {
            day.name = target[code] + " — " + separated[2].trim();
            return;
          }
        }

        const generic = raw.match(/^(Día|Dia|Day)\s+([A-Za-z0-9]{1,2})(?:\s*[—–-]\s*(.+))?$/i);
        if (generic) {
          const suffix = generic[3] ? " — " + generic[3].trim() : "";
          day.name = dayPrefix + " " + generic[2] + suffix;
        }
      });
    });
  }

  // ---------- Toasts / confirmacion ----------

  function toast(message) {
    const el = document.createElement("div");
    el.className = "toast flex items-center gap-3 px-4 py-3 bg-[#18181b] border border-[#27272a] text-white text-xs font-mono rounded shadow-2xl";
    el.innerHTML = '<span class="w-1.5 h-1.5 rounded-full bg-white" aria-hidden="true"></span><span></span>';
    el.lastElementChild.textContent = message;
    $("#toasts").appendChild(el);
    setTimeout(function () {
      el.classList.add("out");
      setTimeout(function () { el.remove(); }, 300);
    }, 2600);
  }

  function confirmDlg(title, message, okLabel) {
    return new Promise(function (resolve) {
      const dlg = $("#confirmDialog");
      $("#confirmTitle").textContent = title;
      $("#confirmMsg").textContent = message;
      $("#confirmOkBtn").textContent = okLabel || t("ok");
      let done = false;
      function finish(value) {
        if (done) return;
        done = true;
        try { dlg.close(); } catch (e) { /* ya cerrado */ }
        resolve(value);
      }
      $("#confirmOkBtn").onclick = function () { finish(true); };
      $("#confirmCancelBtn").onclick = function () { finish(false); };
      dlg.oncancel = function (e) { e.preventDefault(); finish(false); };
      dlg.onclose = function () { finish(false); };
      dlg.showModal();
    });
  }

  // ---------- Render ----------

  function renderLibrary() {
    const sel = $("#routineSelect");
    sel.innerHTML = state.routines.map(function (r) {
      return '<option value="' + esc(r.id) + '">' + esc(r.name || t("untitledRoutine")) + "</option>";
    }).join("");
    sel.value = state.activeId;
  }

  function renderMeta() {
    const r = active();
    const labels = {
      same_each_day: t("scheduleSame"),
      ab_rotation: t("scheduleAB"),
      daily_variation: t("scheduleDaily"),
    };

    $("#scheduleChips").innerHTML = M.SCHEDULE_TYPES.map(function (type) {
      const selected = type === r.scheduleType;
      const cls = selected
        ? "schedule-btn text-[#18181b] border-b border-[#18181b] pb-0.5 font-medium"
        : "schedule-btn text-[#71717a] hover:text-[#18181b] transition-colors";
      return '<button type="button" class="' + cls + '" data-sched="' + type + '" aria-pressed="' + selected + '">' +
        esc(labels[type]) + "</button>";
    }).join("");

    const letters = t("weekdayLetters");
    const names = t("weekdayNames");
    $("#scheduledDaysChips").innerHTML = M.DAY_CODES.map(function (code) {
      const selected = r.scheduledDays.indexOf(code) !== -1;
      const cls = selected
        ? "w-9 h-8 flex items-center justify-center text-white bg-[#18181b] font-medium transition-colors"
        : "w-9 h-8 flex items-center justify-center text-[#71717a] border border-[#e4e4e7] bg-white hover:border-[#a1a1aa] transition-colors";
      return '<button type="button" class="' + cls + '" data-day="' + code + '" aria-label="' + esc(names[code] || code) + '" aria-pressed="' + selected + '">' + esc(letters[code] || code) + "</button>";
    }).join("");

    const activeCount = $("#activeDaysCount");
    if (activeCount) {
      activeCount.textContent = r.scheduledDays.length === 1
        ? t("activeDaysCountOne")
        : t("activeDaysCount", r.scheduledDays.length);
    }

    renderWeekly();
  }

  function renderDays() {
    const r = active();
    const wdNames = t("weekdayNames");
    const container = $("#daysContainer");
    const minDays = r.scheduleType === "ab_rotation" ? 2 : 1;

    container.innerHTML = r.days.map(function (day) {
      const canDelete = r.days.length > minDays;
      const placeholder = r.scheduleType === "daily_variation"
        ? (wdNames[day.dayCode] || t("dayNamePh"))
        : t("dayPrefix") + " " + day.dayCode;
      const exercises = day.exercises || [];
      const exCount = exercises.length;
      const setCount = exercises.reduce(function (acc, ex) { return acc + (Number(ex.sets) || 0); }, 0);
      let stats;
      if (exCount === 1) {
        stats = setCount === 1 ? t("dayStatsOneSet") : t("dayStatsOne", setCount);
      } else {
        stats = setCount === 1 ? t("dayStatsSingleSet", exCount) : t("dayStats", exCount, setCount);
      }

      const rows = exercises.map(function (ex, exIndex) {
        const rest = ex.restTimeSeconds !== null && ex.restTimeSeconds !== undefined ? ex.restTimeSeconds + "s" : "";
        let intensity = "";
        if (ex.targetIntensity && ex.intensityValue !== null && ex.intensityValue !== undefined) {
          intensity = ex.targetIntensity === "PERCENTAGE" ? ex.intensityValue + "%" : ex.targetIntensity + " " + ex.intensityValue;
        }

        const tags = [];
        if (ex.notes) {
          tags.push({ text: ex.notes, cls: "border-[#e4e4e7] bg-[#f4f4f5] text-[#52525b]" });
        }
        if (ex.isWarmup) {
          tags.push({ text: t("warmup"), cls: "border-[#e4e4e7] bg-[#f4f4f5] text-[#52525b]" });
        }
        if (ex.isUnilateral) {
          tags.push({ text: t("unilateral"), cls: "border-[#e4e4e7] bg-[#f4f4f5] text-[#52525b]" });
        }
        if (ex.supersetGroup) {
          const ss = ex.supersetGroup.replace(/^superset_/i, "") + (ex.supersetOrder ? ex.supersetOrder : "");
          tags.push({ text: "SS " + ss, cls: "border-[#18181b] bg-white text-[#18181b] font-medium" });
        }
        const tagHtml = tags.map(function (tag) {
          return '<span class="text-[11px] border px-1.5 py-0.5 ' + tag.cls + '">' + esc(tag.text) + "</span>";
        }).join("");
        const tagText = tags.map(function (tag) { return tag.text; }).join(" · ");
        const metaParts = [ex.sets + " × " + ex.reps, rest, intensity, tagText].filter(Boolean);

        function actionButton(action, label, icon, extra) {
          return '<button type="button" class="' + (extra || "hover:text-[#18181b]") + ' text-[#71717a] transition-colors" data-action="' + action + '" data-day="' + esc(day.dayId) + '" data-ex="' + esc(ex.id) + '" aria-label="' + esc(label) + '" title="' + esc(label) + '">' +
            '<span class="material-symbols-outlined text-[15px]" aria-hidden="true">' + icon + "</span></button>";
        }

        return '<div class="group py-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3 hover:bg-[#fafaf9] px-4 transition-colors">' +
          '<div class="flex items-start sm:items-center gap-4 cursor-pointer flex-1" data-action="editEx" data-day="' + esc(day.dayId) + '" data-ex="' + esc(ex.id) + '">' +
          '<span class="font-mono text-xs text-[#a1a1aa] pt-0.5 sm:pt-0">' + String(exIndex + 1).padStart(2, "0") + "</span>" +
          '<div class="min-w-0">' +
          '<div class="flex items-baseline gap-2 flex-wrap">' +
          '<span class="text-[#18181b] font-medium group-hover:underline underline-offset-4 decoration-[#a1a1aa]">' + esc(ex.name) + "</span>" +
          '<span class="text-xs text-[#71717a]">' + esc(ex.muscleGroup) + "</span>" +
          "</div>" +
          '<span class="font-mono text-xs text-[#71717a] block sm:hidden mt-1">' + esc(metaParts.join(" · ")) + "</span>" +
          "</div></div>" +
          '<div class="hidden sm:flex items-center gap-6 font-mono text-xs text-[#52525b]">' +
          '<span class="text-[#18181b] font-medium whitespace-nowrap">' + ex.sets + " × " + ex.reps + "</span>" +
          '<span class="text-[#71717a]">' + esc(rest || "—") + "</span>" +
          '<span class="text-[#71717a]">' + esc(intensity || "—") + "</span>" +
          '<span class="flex flex-wrap gap-1">' + tagHtml + "</span>" +
          "</div>" +
          '<div class="flex items-center justify-end gap-3 opacity-40 group-hover:opacity-100 transition-opacity">' +
          actionButton("editEx", t("editExercise"), "edit") +
          actionButton("dupEx", t("duplicate"), "content_copy") +
          actionButton("delEx", t("remove"), "close", "hover:text-red-500") +
          "</div></div>";
      }).join("");

      const emptyRow = exCount === 0
        ? '<button type="button" class="w-full py-6 px-4 text-center font-mono text-xs text-[#71717a] hover:text-[#18181b] hover:bg-[#f4f4f5] transition-colors cursor-pointer" data-action="addEx" data-day="' + esc(day.dayId) + '">' + esc(t("noExercises")) + "</button>"
        : "";

      return '<div class="flex flex-col gap-6">' +
        '<div class="flex flex-col sm:flex-row sm:items-baseline justify-between gap-2 sm:gap-4">' +
        '<div class="flex items-baseline gap-3 min-w-0">' +
        '<span class="font-mono text-xs text-[#18181b] uppercase font-semibold">' + esc(day.dayCode) + "</span>" +
        '<span class="text-[#a1a1aa]">/</span>' +
        '<input class="bg-transparent text-[#18181b] font-sans text-lg font-medium tracking-tight p-0 border-0 focus:ring-0 focus:outline-none w-auto max-w-full min-w-0" type="text" maxlength="40" data-role="dayName" data-day="' + esc(day.dayId) + '" value="' + esc(day.name) + '" placeholder="' + esc(placeholder) + '">' +
        "</div>" +
        '<div class="flex flex-wrap items-center gap-x-4 gap-y-2 text-xs font-mono text-[#71717a]">' +
        "<span>" + esc(stats) + "</span>" +
        (canDelete
          ? '<button type="button" class="hover:text-red-500 transition-colors" data-action="delDay" data-day="' + esc(day.dayId) + '" aria-label="' + esc(t("deleteDay")) + '" title="' + esc(t("deleteDay")) + '"><span class="material-symbols-outlined text-[16px]" aria-hidden="true">close</span></button>'
          : "") +
        "</div></div>" +
        '<div class="flex flex-col divide-y divide-[#e4e4e7] border-y border-[#e4e4e7] bg-white">' + rows + emptyRow + "</div>" +
        '<button type="button" class="self-start font-mono text-xs text-[#71717a] hover:text-[#18181b] transition-colors pt-1" data-action="addEx" data-day="' + esc(day.dayId) + '">' + esc(t("addExerciseTo", day.name || day.dayCode)) + "</button>" +
        "</div>";
    }).join("");

    const addDay = $("#addDayBtn");
    const canAddDay = r.scheduleType === "daily_variation" && r.days.length < M.DAY_CODES.length;
    if (addDay) addDay.classList.toggle("hidden", !canAddDay);
    const dayCount = $("#dayCount");
    if (dayCount) dayCount.textContent = r.days.length === 1 ? t("dayCountLabelOne") : t("dayCountLabel", r.days.length);

    renderWeekly();
  }

  // ---------- Volumen semanal y radar ----------

  const TORSO_GROUPS = ["Pecho", "Espalda", "Hombros", "Bíceps", "Tríceps", "Antebrazo", "Abdominales"];
  const LEG_GROUPS = ["Cuádriceps", "Femoral", "Gemelos", "Glúteos"];

  function buildRadarSvg(groups, maxScale) {
    const cx = 170;
    const cy = 170;
    const radius = 105;
    const n = groups.length;
    const angle = function (i) { return -Math.PI / 2 + (i * 2 * Math.PI / n); };
    const point = function (i, value, r) {
      const a = angle(i);
      const distance = (value / maxScale) * r;
      return { x: cx + Math.cos(a) * distance, y: cy + Math.sin(a) * distance };
    };

    const grid = [1 / 3, 2 / 3, 1].map(function (frac) {
      const r = radius * frac;
      const value = Math.round(maxScale * frac);
      return '<circle cx="' + cx + '" cy="' + cy + '" r="' + r + '" fill="none" stroke="' + (frac === 1 ? "#d4d4d8" : "#e4e4e7") + '" stroke-width="1"></circle>' +
        '<text x="' + (cx + 5) + '" y="' + (cy - r + 3) + '" fill="#a1a1aa" font-family="monospace" font-size="9">' + value + "s</text>";
    }).join("");

    const minRadius = Math.max(0, Math.min(radius, (5 / maxScale) * radius));
    const minCircle = '<circle cx="' + cx + '" cy="' + cy + '" r="' + minRadius + '" fill="none" stroke="#a1a1aa" stroke-dasharray="2,2" stroke-width="1"></circle>';

    const axes = groups.map(function (g, i) {
      const outer = point(i, maxScale, radius);
      return '<line x1="' + cx + '" y1="' + cy + '" x2="' + outer.x.toFixed(1) + '" y2="' + outer.y.toFixed(1) + '" stroke="#e4e4e7" stroke-width="1"></line>';
    }).join("");

    const points = groups.map(function (g, i) {
      const p = point(i, g.total, radius);
      return p.x.toFixed(1) + "," + p.y.toFixed(1);
    }).join(" ");

    const dots = groups.map(function (g, i) {
      const p = point(i, g.total, radius);
      return '<circle cx="' + p.x.toFixed(1) + '" cy="' + p.y.toFixed(1) + '" fill="#18181b" r="3.5"></circle>';
    }).join("");

    const labels = groups.map(function (g, i) {
      const a = angle(i);
      const lx = cx + Math.cos(a) * (radius + 14);
      const ly = cy + Math.sin(a) * (radius + 14);
      const anchor = Math.cos(a) > 0.3 ? "start" : Math.cos(a) < -0.3 ? "end" : "middle";
      const fill = i < 3 ? "#18181b" : "#52525b";
      return '<text x="' + lx.toFixed(1) + '" y="' + ly.toFixed(1) + '" text-anchor="' + anchor + '" fill="' + fill + '" font-family="monospace" font-size="10" font-weight="500">' +
        esc(g.group.toUpperCase() + " (" + g.total + ")") + "</text>";
    }).join("");

    return '<svg viewBox="0 0 340 340" class="w-full h-full overflow-visible" role="img" aria-label="' + esc(t("radarAria")) + '">' +
      grid + minCircle + axes +
      '<polygon points="' + points + '" fill="#18181b" fill-opacity="0.07" stroke="#18181b" stroke-width="1.5"></polygon>' +
      dots + labels + "</svg>";
  }

  function renderWeekly() {
    const data = M.weeklySets(active());
    const totalEl = $("#weeklyTotal");
    if (totalEl) {
      totalEl.innerHTML = data.total > 0
        ? '<span class="text-[#18181b] font-medium">' + data.total + '</span> <span class="text-[#71717a] font-normal">' + esc(data.total === 1 ? t("totalSeriesSuffixOne") : t("totalSeriesSuffix")) + "</span>"
        : "";
    }
    const panel = $("#weeklyPanel");
    if (!panel) return;

    const groups = (data.groups || []).filter(function (g) { return g.total > 0; });
    if (!groups.length || data.total === 0) {
      panel.innerHTML = '<p class="font-mono text-xs text-[#71717a]">' + esc(t("weeklyEmpty")) + "</p>";
      return;
    }

    const radarGroups = groups.slice(0, 6);
    const radarMax = radarGroups.reduce(function (acc, g) { return Math.max(acc, g.total); }, 0);
    const maxScale = Math.max(5, Math.ceil((radarMax + 1) / 5) * 5);
    const radar = radarGroups.length >= 3
      ? buildRadarSvg(radarGroups, maxScale)
      : '<p class="font-mono text-xs text-[#71717a] text-center">' + esc(t("radarEmpty")) + "</p>";

    const torso = groups.filter(function (g) { return TORSO_GROUPS.indexOf(g.group) !== -1; })
      .reduce(function (acc, g) { return acc + g.total; }, 0);
    const legs = groups.filter(function (g) { return LEG_GROUPS.indexOf(g.group) !== -1; })
      .reduce(function (acc, g) { return acc + g.total; }, 0);
    const other = Math.max(0, data.total - torso - legs);
    const torsoPct = data.total ? Math.round((torso / data.total) * 100) : 0;
    const legsPct = data.total ? Math.round((legs / data.total) * 100) : 0;
    const otherPct = Math.max(0, 100 - torsoPct - legsPct);
    const split = other > 0
      ? torsoPct + "% / " + legsPct + "% / " + otherPct + "%"
      : torsoPct + "% / " + legsPct + "%";

    const maxGroupTotal = groups.reduce(function (acc, g) { return Math.max(acc, g.total); }, 0);
    const list = groups.map(function (g) {
      const pct = ((g.total / data.total) * 100).toFixed(1);
      const opacity = Math.max(0.35, Math.min(1, g.total / maxGroupTotal)).toFixed(2);
      return '<div class="py-1.5 flex items-center justify-between">' +
        '<div class="flex items-center gap-2"><span class="w-1.5 h-1.5 rounded-full bg-[#18181b]" style="opacity:' + opacity + '"></span><span class="text-[#18181b] font-medium">' + esc(g.group) + "</span></div>" +
        '<div class="flex items-center gap-3"><span class="text-[11px] text-[#71717a]">' + pct + '%</span><span class="text-[#18181b] font-medium w-16 text-right">' + esc(g.total === 1 ? t("seriesCountOne") : t("seriesCount", g.total)) + "</span></div>" +
        "</div>";
    }).join("");

    panel.innerHTML = '<div class="grid grid-cols-1 md:grid-cols-12 gap-10 items-center bg-white border border-[#e4e4e7] p-6 sm:p-8">' +
      '<div class="md:col-span-7 flex flex-col items-center justify-center">' +
      '<div class="w-full flex items-center justify-between pb-3 border-b border-[#e4e4e7] mb-2">' +
      '<span class="font-mono text-[10px] uppercase tracking-widest text-[#71717a]">' + esc(t("radarTitle")) + "</span>" +
      '<span class="font-mono text-[11px] text-[#18181b] font-medium">' + esc(radarGroups.length === 1 ? t("radarVerticesOne") : t("radarVertices", radarGroups.length)) + "</span>" +
      "</div>" +
      '<div class="relative w-full max-w-[340px] aspect-square flex items-center justify-center">' + radar + "</div>" +
      '<div class="flex flex-wrap items-center gap-x-6 gap-y-2 mt-3 font-mono text-[11px] text-[#71717a]">' +
      '<span class="flex items-center gap-1.5"><span class="w-2.5 h-2.5 border border-[#18181b] bg-[#18181b]/10"></span>' + esc(t("radarLegendCurrent", data.total)) + "</span>" +
      '<span class="flex items-center gap-1.5"><span class="w-2.5 h-px bg-[#a1a1aa] border-t border-dashed border-[#a1a1aa]"></span>' + esc(t("radarLegendMin")) + "</span>" +
      "</div></div>" +
      '<div class="md:col-span-5 flex flex-col gap-5 border-t md:border-t-0 md:border-l border-[#e4e4e7] pt-5 md:pt-0 md:pl-8">' +
      '<div class="flex flex-col gap-2 pb-4 border-b border-[#e4e4e7]">' +
      '<span class="font-mono text-[10px] uppercase tracking-widest text-[#71717a]">' + esc(t("balanceTitle")) + "</span>" +
      '<div class="flex items-baseline justify-between font-mono text-xs"><span class="text-[#18181b] font-medium">' + esc(t("torsoVsLeg")) + '</span><span class="text-[#71717a]">' + split + "</span></div>" +
      '<div class="w-full bg-[#e4e4e7] h-1.5 flex overflow-hidden">' +
      '<div class="bg-[#18181b] h-full" style="width:' + torsoPct + '%"></div>' +
      '<div class="bg-[#a1a1aa] h-full" style="width:' + legsPct + '%"></div>' +
      (other > 0 ? '<div class="bg-[#d4d4d8] h-full" style="width:' + otherPct + '%"></div>' : "") +
      "</div>" +
      '<div class="flex items-center justify-between font-mono text-[10px] text-[#71717a]"><span>' + esc(torso === 1 ? t("torsoSeriesOne") : t("torsoSeries", torso)) + "</span><span>" + esc(legs === 1 ? t("legsSeriesOne") : t("legsSeries", legs)) + "</span></div>" +
      (other > 0 ? '<div class="font-mono text-[10px] text-[#a1a1aa]">' + esc(other === 1 ? t("otherSeriesOne") : t("otherSeries", other)) + "</div>" : "") +
      "</div>" +
      '<div class="flex flex-col gap-2.5">' +
      '<span class="font-mono text-[10px] uppercase tracking-widest text-[#71717a]">' + esc(t("breakdownTitle")) + "</span>" +
      '<div class="flex flex-col divide-y divide-[#e4e4e7] font-mono text-xs">' + list + "</div>" +
      "</div></div></div>";
  }

  function renderForm() {
    const r = active();
    $("#routineName").value = r.name;
    $("#routineDesc").value = r.description;
    renderMeta();
    renderDays();
  }

  // ---------- Acciones de biblioteca ----------

  function setActiveRoutine(id) {
    state.activeId = id;
    save();
    renderLibrary();
    renderForm();
  }

  function replaceActive(newRoutine) {
    const index = state.routines.findIndex(function (r) { return r.id === state.activeId; });
    if (index === -1) {
      state.routines.push(newRoutine);
      state.activeId = newRoutine.id;
    } else {
      state.routines[index] = newRoutine;
    }
  }

  function loadRoutineObject(routine, toastMessage) {
    if (M.isEmptyRoutine(active())) {
      routine.id = state.activeId;
      replaceActive(routine);
    } else {
      state.routines.push(routine);
      state.activeId = routine.id;
    }
    saveNow();
    renderLibrary();
    renderForm();
    toast(toastMessage);
  }

  // ---------- Acciones de rutina ----------

  function newRoutineAction() {
    const r = defaultRoutine();
    state.routines.push(r);
    state.activeId = r.id;
    save();
    renderLibrary();
    renderForm();
    toast(t("toastNewRoutine"));
  }

  function duplicateRoutineAction() {
    const src = M.clone(active());
    src.id = M.uuid();
    src.name = (src.name || t("untitledRoutine")) + " " + t("copySuffix");
    src.days.forEach(function (day) {
      day.dayId = M.uuid();
      (day.exercises || []).forEach(function (ex) { ex.id = M.uuid(); });
    });
    state.routines.push(src);
    state.activeId = src.id;
    save();
    renderLibrary();
    renderForm();
    toast(t("toastDuplicated"));
  }

  function deleteRoutineAction() {
    const r = active();
    confirmDlg(t("deleteRoutineTitle"), t("deleteRoutineMsg"), t("confirmDelete")).then(function (ok) {
      if (!ok) return;
      state.routines = state.routines.filter(function (x) { return x.id !== r.id; });
      if (state.routines.length === 0) state.routines.push(defaultRoutine());
      state.activeId = state.routines[0].id;
      save();
      renderLibrary();
      renderForm();
      toast(t("toastDeleted"));
    });
  }

  function nextFreeWeekday(usedCodes) {
    for (let i = 0; i < M.DAY_CODES.length; i++) {
      if (usedCodes.indexOf(M.DAY_CODES[i]) === -1) return M.DAY_CODES[i];
    }
    return "A";
  }

  function setScheduleType(type) {
    const r = active();
    if (type === r.scheduleType) return;

    let needsConfirm = false;
    if (type === "same_each_day" && r.days.length > 1) needsConfirm = true;
    if (type === "ab_rotation" && r.days.length > 2) needsConfirm = true;

    const apply = function () {
      r.scheduleType = type;
      r.abRotationMap = null;
      const wdNames = t("weekdayNames");
      if (type === "same_each_day") {
        r.days = r.days.slice(0, 1);
        if (r.days.length === 0) r.days.push(M.newDay({ dayCode: "A" }));
        r.days[0].dayCode = "A";
        if (!r.days[0].name) r.days[0].name = t("dayPrefix") + " A";
      } else if (type === "ab_rotation") {
        while (r.days.length < 2) {
          const code = r.days.length === 0 ? "A" : "B";
          r.days.push(M.newDay({ dayCode: code, name: t("dayPrefix") + " " + code }));
        }
        r.days = r.days.slice(0, 2);
        r.days[0].dayCode = "A";
        r.days[1].dayCode = "B";
      } else {
        const used = [];
        r.days.forEach(function (day) {
          if (M.DAY_CODES.indexOf(day.dayCode) === -1) {
            const code = nextFreeWeekday(used);
            day.dayCode = code;
            if (!day.name || /^(día|dia|day)\s+[a-z0-9]$/i.test(day.name)) {
              day.name = wdNames[code] || day.name;
            }
          }
          used.push(day.dayCode);
        });
      }
      save();
      renderMeta();
      renderDays();
    };

    if (needsConfirm) {
      confirmDlg(t("scheduleType"), t("confirmSwitchSched"), t("ok")).then(function (ok) {
        if (ok) apply();
      });
    } else {
      apply();
    }
  }

  // ---------- Días ----------

  function addDay() {
    const r = active();
    if (r.scheduleType !== "daily_variation") return;
    if (r.days.length >= M.DAY_CODES.length) return;
    const used = r.days.map(function (d) { return d.dayCode; });
    const code = nextFreeWeekday(used);
    r.days.push(M.newDay({ dayCode: code, name: t("weekdayNames")[code] || "" }));
    save();
    renderDays();
  }

  function deleteDay(dayId) {
    const r = active();
    const minDays = r.scheduleType === "ab_rotation" ? 2 : 1;
    if (r.days.length <= minDays) return;
    r.days = r.days.filter(function (d) { return d.dayId !== dayId; });
    save();
    renderDays();
  }

  // ---------- Diálogo de ejercicio ----------

  let dialogCtx = null;

  function findDay(dayId) {
    return active().days.find(function (d) { return d.dayId === dayId; });
  }

  function renderGroupChips() {
    $("#exGroupChips").innerHTML = M.MUSCLE_GROUPS.map(function (g) {
      const selected = g === dialogCtx.groupSel;
      const cls = selected
        ? "px-2 py-0.5 bg-[#18181b] text-white font-medium"
        : "px-2 py-0.5 border border-[#e4e4e7] bg-white text-[#71717a] hover:text-[#18181b] hover:border-[#18181b] transition-colors";
      return '<button type="button" class="font-mono text-xs ' + cls + '" data-group="' + esc(g) + '" aria-pressed="' + selected + '">' + esc(g) + "</button>";
    }).join("");
  }

  function renderIntensityChips() {
    const opts = [[null, t("intensityNone")], ["RPE", "RPE"], ["RIR", "RIR"], ["PERCENTAGE", "%"]];
    $("#exIntensityChips").innerHTML = opts.map(function (opt) {
      const selected = opt[0] === dialogCtx.intensitySel;
      const cls = selected
        ? "px-2 py-0.5 bg-[#18181b] text-white font-medium"
        : "px-2 py-0.5 border border-[#e4e4e7] bg-white text-[#71717a] hover:text-[#18181b] hover:border-[#18181b] transition-colors";
      return '<button type="button" class="font-mono text-xs ' + cls + '" data-int="' + esc(opt[0] === null ? "" : opt[0]) + '" aria-pressed="' + selected + '">' + esc(opt[1]) + "</button>";
    }).join("");

    const wrap = $("#exIntensityWrap");
    const input = $("#exIntensityValue");
    if (dialogCtx.intensitySel) {
      wrap.classList.remove("hidden");
      if (dialogCtx.intensitySel === "PERCENTAGE") {
        input.step = "1"; input.min = "1"; input.max = "100";
      } else if (dialogCtx.intensitySel === "RPE") {
        input.step = "0.5"; input.min = "1"; input.max = "10";
      } else {
        input.step = "1"; input.min = "0"; input.max = "10";
      }
    } else {
      wrap.classList.add("hidden");
    }
  }

  function renderSuggestions(query) {
    const box = $("#exSuggestions");
    if (!box) return;
    const q = String(query || "").trim().toLowerCase();
    const pool = [];
    (exerciseData.presets || []).forEach(function (p) { pool.push(p); });
    (exerciseData.catalog || []).forEach(function (c) { pool.push(c); });
    const seen = {};
    const matches = [];
    pool.forEach(function (item) {
      if (!item || !item.n || matches.length >= 4) return;
      if (q && item.n.toLowerCase().indexOf(q) === -1) return;
      if (seen[item.n]) return;
      seen[item.n] = true;
      matches.push(item);
    });
    if (!matches.length) {
      box.innerHTML = "";
      return;
    }
    box.innerHTML = '<span class="font-mono text-[10px] text-[#71717a] uppercase tracking-widest">' + esc(t("suggestions")) + "</span>" +
      matches.map(function (item) {
        return '<button type="button" class="font-mono text-xs px-2 py-0.5 border border-[#e4e4e7] bg-white text-[#71717a] hover:text-[#18181b] hover:border-[#18181b] transition-colors" data-suggest="' + esc(item.n) + '">' + esc(item.n) + "</button>";
      }).join("");
  }

  function openExerciseDialog(dayId, exId) {
    const day = findDay(dayId);
    if (!day) return;
    const isNew = !exId;
    const ex = isNew ? M.newExercise() : M.clone(day.exercises.find(function (e) { return e.id === exId; }));
    if (!ex) return;

    dialogCtx = {
      dayId: dayId,
      exId: exId || null,
      ex: ex,
      isNew: isNew,
      originalName: ex.name,
      groupSel: ex.muscleGroup || "Otros",
      groupTouched: false,
      intensitySel: ex.targetIntensity || null,
    };

    $("#exName").value = ex.name;
    $("#exSets").value = ex.sets;
    $("#exReps").value = ex.reps;
    $("#exRest").value = ex.restTimeSeconds === null || ex.restTimeSeconds === undefined ? "" : ex.restTimeSeconds;
    $("#exIntensityValue").value = ex.intensityValue === null || ex.intensityValue === undefined ? "" : ex.intensityValue;
    $("#exUnilateral").checked = !!ex.isUnilateral;
    $("#exWarmup").checked = !!ex.isWarmup;
    $("#exNotes").value = ex.notes || "";
    $("#exSupersetGroup").value = ex.supersetGroup || "";
    $("#exSupersetOrder").value = ex.supersetOrder || 0;

    renderGroupChips();
    renderIntensityChips();
    renderSuggestions(ex.name);
    $("#exerciseDialog").showModal();
    setTimeout(function () { $("#exName").focus(); }, 50);
  }

  function clampInt(value, min, max, def) {
    const n = parseInt(value, 10);
    if (isNaN(n)) return def;
    return Math.max(min, Math.min(max, n));
  }

  function saveExerciseDialog() {
    if (!dialogCtx) return;
    const ex = dialogCtx.ex;
    const name = $("#exName").value.trim();
    if (!name) {
      $("#exName").focus();
      return;
    }

    ex.name = name;
    ex.muscleGroup = dialogCtx.groupSel || "Otros";
    ex.sets = clampInt($("#exSets").value, 0, 99, 0);
    ex.reps = clampInt($("#exReps").value, 0, 999, 0);
    const restVal = $("#exRest").value.trim();
    ex.restTimeSeconds = restVal === "" ? null : clampInt(restVal, 0, 3600, null);
    ex.targetIntensity = dialogCtx.intensitySel;
    const rawIntensity = $("#exIntensityValue").value.trim().replace(",", ".");
    const intVal = parseFloat(rawIntensity);
    ex.intensityValue = ex.targetIntensity && isFinite(intVal) ? intVal : null;
    if (!ex.targetIntensity) ex.intensityValue = null;
    if (ex.targetIntensity && ex.intensityValue === null) ex.targetIntensity = null;
    ex.isUnilateral = $("#exUnilateral").checked;
    ex.isWarmup = $("#exWarmup").checked;
    ex.notes = $("#exNotes").value.trim();
    ex.supersetGroup = $("#exSupersetGroup").value.trim();
    ex.supersetOrder = clampInt($("#exSupersetOrder").value, 0, 99, 0);

    const hit = P.suggestExercise(ex.name, dataOpts());
    if (hit.presetId) {
      ex.exerciseId = hit.presetId;
    } else if (dialogCtx.isNew || dialogCtx.originalName !== ex.name || !ex.exerciseId) {
      ex.exerciseId = M.webExerciseId(ex.name);
    }

    const day = findDay(dialogCtx.dayId);
    if (!day) return;
    if (dialogCtx.exId) {
      const index = day.exercises.findIndex(function (e) { return e.id === dialogCtx.exId; });
      if (index !== -1) day.exercises[index] = ex;
    } else {
      day.exercises.push(ex);
    }
    try { $("#exerciseDialog").close(); } catch (e) { /* ya cerrado */ }
    dialogCtx = null;
    save();
    renderDays();
  }

  // ---------- Importar ----------

  function setStatus(message, spinning) {
    const el = $("#fileStatus");
    if (!el) return;
    el.innerHTML = (spinning ? '<span class="w-1.5 h-1.5 rounded-full bg-[#18181b] animate-pulse" aria-hidden="true"></span>' : "") +
      "<span>" + esc(message) + "</span>";
    el.classList.remove("hidden");
  }

  function hideStatus() {
    $("#fileStatus").classList.add("hidden");
  }

  const scriptCache = {};

  function loadScript(src) {
    if (scriptCache[src]) return scriptCache[src];
    scriptCache[src] = new Promise(function (resolve, reject) {
      const s = document.createElement("script");
      s.src = src;
      s.async = true;
      s.onload = function () { resolve(); };
      s.onerror = function () {
        delete scriptCache[src];
        reject(new Error("No se pudo cargar " + src));
      };
      document.head.appendChild(s);
    });
    return scriptCache[src];
  }

  const PDFJS_URL = "https://cdn.jsdelivr.net/npm/pdfjs-dist@3.11.174/build/pdf.min.js";
  const PDFJS_WORKER_URL = "https://cdn.jsdelivr.net/npm/pdfjs-dist@3.11.174/build/pdf.worker.min.js";
  const TESSERACT_URL = "https://cdn.jsdelivr.net/npm/tesseract.js@5/dist/tesseract.min.js";
  const JSPDF_URL = "https://cdn.jsdelivr.net/npm/jspdf@2.5.1/dist/jspdf.umd.min.js";

  function textItemsToLines(items) {
    const rows = [];
    items.forEach(function (item) {
      const str = item.str;
      if (!str) return;
      const x = item.transform[4];
      const y = item.transform[5];
      let row = null;
      for (let i = rows.length - 1; i >= 0 && i >= rows.length - 40; i--) {
        if (Math.abs(rows[i].y - y) <= 3) { row = rows[i]; break; }
      }
      if (!row) {
        row = { y: y, parts: [] };
        rows.push(row);
      }
      row.parts.push({ x: x, w: item.width || 0, str: str });
    });
    rows.sort(function (a, b) { return b.y - a.y; });
    return rows.map(function (row) {
      row.parts.sort(function (a, b) { return a.x - b.x; });
      let line = "";
      let endX = null;
      row.parts.forEach(function (part) {
        if (line !== "" && endX !== null && part.x - endX > 1.5) line += " ";
        line += part.str;
        endX = part.x + part.w;
      });
      return line.replace(/\s+/g, " ").trim();
    }).filter(function (l) { return l.length > 0; });
  }

  async function pdfToText(file) {
    await loadScript(PDFJS_URL);
    const pdfjsLib = window.pdfjsLib;
    if (!pdfjsLib) throw new Error("pdfjs no disponible");
    pdfjsLib.GlobalWorkerOptions.workerSrc = PDFJS_WORKER_URL;
    const buffer = await file.arrayBuffer();
    const pdf = await pdfjsLib.getDocument({ data: new Uint8Array(buffer) }).promise;
    const lines = [];
    for (let p = 1; p <= pdf.numPages; p++) {
      const page = await pdf.getPage(p);
      const content = await page.getTextContent();
      lines.push.apply(lines, textItemsToLines(content.items));
      lines.push("");
    }
    return lines.join("\n");
  }

  async function imageToText(file) {
    const progress = $("#ocrProgress");
    const bar = $("#ocrBar");
    const percent = $("#ocrPercent");
    if (bar) bar.style.width = "0%";
    if (percent) percent.textContent = "0%";
    if (progress) progress.classList.remove("hidden");
    try {
      await loadScript(TESSERACT_URL);
      const T = window.Tesseract;
      if (!T) throw new Error("tesseract no disponible");
      const langs = state.lang === "en" ? "eng+spa" : "spa+eng";
      const result = await T.recognize(file, langs, {
        logger: function (m) {
          if (m && m.status === "recognizing text") {
            const pct = Math.round((m.progress || 0) * 100);
            if (bar) bar.style.width = pct + "%";
            if (percent) percent.textContent = pct + "%";
            setStatus(t("statusOcr") + " " + pct + "%", true);
          }
        },
      });
      return (result && result.data && result.data.text) || "";
    } finally {
      if (progress) progress.classList.add("hidden");
    }
  }

  async function handleFile(file) {
    const name = (file.name || "").toLowerCase();
    try {
      if (name.endsWith(".pdf") || file.type === "application/pdf") {
        setStatus(t("statusReading"), true);
        const text = await pdfToText(file);
        $("#rawText").value = text;
        await detectFromText();
      } else if ((file.type || "").indexOf("image/") === 0) {
        setStatus(t("statusOcr"), true);
        const text = await imageToText(file);
        $("#rawText").value = text;
        await detectFromText();
      } else if (name.endsWith(".csv")) {
        const text = await file.text();
        if (M.looksLikeRoutineCsv(text)) {
          const routine = M.csvToRoutine(text);
          if (routine) {
            hideStatus();
            loadRoutineObject(routine, t("toastImportedCsv"));
            return;
          }
        }
        $("#rawText").value = text;
        await detectFromText();
      } else if (name.endsWith(".json")) {
        const text = await file.text();
        const routine = M.jsonToRoutine(text);
        if (routine) {
          hideStatus();
          loadRoutineObject(routine, t("toastImportedJson"));
          return;
        }
        toast(t("errorFormat"));
        hideStatus();
      } else {
        const text = await file.text();
        $("#rawText").value = text;
        await detectFromText();
      }
    } catch (e) {
      console.error(e);
      toast(t("errorFile"));
      hideStatus();
    }
  }

  async function detectFromText() {
    const text = $("#rawText").value;
    if (!text.trim()) {
      toast(t("parseEmpty"));
      hideStatus();
      return;
    }
    setStatus(t("statusDetect"), true);
    await new Promise(function (r) { setTimeout(r, 30); });

    let result;
    try {
      result = P.textToRoutine(text, dataOpts());
    } catch (e) {
      console.error(e);
      toast(t("parseEmpty"));
      hideStatus();
      return;
    }

    if (!result || result.exercises === 0) {
      toast(t("parseEmpty"));
      hideStatus();
      return;
    }

    const routine = result.routine;
    if (!routine.name.trim()) routine.name = active().name;

    if (M.isEmptyRoutine(active())) {
      routine.id = state.activeId;
      replaceActive(routine);
    } else {
      const ok = await confirmDlg(t("importTitle"), t("confirmReplaceRoutine"), t("replaceBtn"));
      if (!ok) {
        hideStatus();
        return;
      }
      routine.id = state.activeId;
      replaceActive(routine);
    }

    saveNow();
    renderLibrary();
    renderForm();
    toast(t("foundSummary", result.exercises, result.days));
    hideStatus();
  }

  // ---------- Exportar ----------

  function downloadText(text, filename, mime) {
    const blob = new Blob([text], { type: mime });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(function () { URL.revokeObjectURL(url); }, 2000);
  }

  function pdfSafe(text) {
    return String(text === null || text === undefined ? "" : text)
      .replace(/[\u2018\u2019]/g, "'")
      .replace(/[\u201C\u201D]/g, '"')
      .replace(/[\u2013\u2014]/g, "-")
      .replace(/\u2026/g, "...");
  }

  function checkExportable() {
    const r = active();
    if (!r.name.trim()) {
      toast(t("exportNoName"));
      $("#routineName").focus();
      return null;
    }
    if (M.isEmptyRoutine(r)) {
      toast(t("exportEmpty"));
      return null;
    }
    return r;
  }

  function exportCsv() {
    const r = checkExportable();
    if (!r) return;
    downloadText(M.routineToCsv(r), M.fileBaseName(r, "csv"), "text/csv;charset=utf-8");
  }

  function copyCsv() {
    const r = checkExportable();
    if (!r) return;
    const csv = M.routineToCsv(r);
    const done = function () { toast(t("copied")); };
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(csv).then(done, function () { fallbackCopy(csv, done); });
    } else {
      fallbackCopy(csv, done);
    }
  }

  function fallbackCopy(text, done) {
    const area = document.createElement("textarea");
    area.value = text;
    area.style.position = "fixed";
    area.style.opacity = "0";
    document.body.appendChild(area);
    area.select();
    try { document.execCommand("copy"); done(); } catch (e) { /* no soportado */ }
    area.remove();
  }

  function exportJson() {
    const r = checkExportable();
    if (!r) return;
    downloadText(M.routineToJson(r), M.fileBaseName(r, "json"), "application/json;charset=utf-8");
  }

  function exportMarkdown() {
    const r = checkExportable();
    if (!r) return;
    const md = M.routineToMarkdown(r, {
      untitled: t("untitledRoutine"),
      scheduleLabel: t("scheduleLabel"),
      schedules: { same_each_day: t("scheduleSame"), ab_rotation: t("scheduleAB"), daily_variation: t("scheduleDaily") },
      dayLabel: t("day"),
      warmup: t("warmup"),
      unilateral: t("unilateral"),
      superset: t("superset"),
    });
    downloadText(md, M.fileBaseName(r, "md"), "text/markdown;charset=utf-8");
  }

  async function exportPdf() {
    const r = checkExportable();
    if (!r) return;
    try {
      await loadScript(JSPDF_URL);
    } catch (e) {
      toast(t("errorFile"));
      return;
    }
    const jsPDFCtor = window.jspdf && window.jspdf.jsPDF;
    if (!jsPDFCtor) { toast(t("errorFile")); return; }

    const doc = new jsPDFCtor({ unit: "mm", format: "a4" });
    const pageW = 210;
    const pageH = 297;
    const margin = 16;
    const contentW = pageW - margin * 2;
    let y = 20;

    function ensureSpace(needed) {
      if (y + needed > pageH - 18) {
        doc.addPage();
        y = 20;
      }
    }

    // Titulo
    doc.setFont("helvetica", "bold");
    doc.setFontSize(20);
    doc.setTextColor(0);
    doc.text(pdfSafe(r.name), margin, y);
    y += 8;

    doc.setFont("helvetica", "normal");
    doc.setFontSize(10);
    doc.setTextColor(120);
    const schedLabel = { same_each_day: t("scheduleSame"), ab_rotation: t("scheduleAB"), daily_variation: t("scheduleDaily") }[r.scheduleType] || "";
    const wd = t("weekdays");
    const activeDays = r.scheduledDays.map(function (c) { return wd[c] || c; }).join(" · ");
    doc.text(pdfSafe(schedLabel + (activeDays ? " — " + activeDays : "")), margin, y);
    y += 5;

    if (r.description) {
      doc.setTextColor(110);
      const descLines = doc.splitTextToSize(pdfSafe(r.description), contentW);
      descLines.forEach(function (line) {
        ensureSpace(5);
        doc.text(line, margin, y);
        y += 4.6;
      });
    }
    y += 4;

    M.daysForExport(r).forEach(function (day) {
      ensureSpace(16);
      doc.setFont("helvetica", "bold");
      doc.setFontSize(13);
      doc.setTextColor(0);
      const dayTitle = t("day") + " " + day.dayCode + (day.name ? " — " + day.name : "");
      doc.text(pdfSafe(dayTitle), margin, y);
      y += 2;
      doc.setDrawColor(200);
      doc.setLineWidth(0.3);
      doc.line(margin, y, pageW - margin, y);
      y += 6;

      (day.exercises || []).forEach(function (ex) {
        ensureSpace(13);
        doc.setFont("helvetica", "bold");
        doc.setFontSize(11);
        doc.setTextColor(20);
        doc.text(pdfSafe(ex.name), margin, y);
        y += 4.6;

        const meta = [];
        meta.push(ex.sets + "×" + ex.reps);
        if (ex.restTimeSeconds !== null && ex.restTimeSeconds !== undefined) meta.push(ex.restTimeSeconds + " s");
        if (ex.targetIntensity && ex.intensityValue !== null && ex.intensityValue !== undefined) {
          meta.push(ex.targetIntensity === "PERCENTAGE" ? ex.intensityValue + "%" : ex.targetIntensity + " " + ex.intensityValue);
        }
        if (ex.muscleGroup) meta.push(ex.muscleGroup);
        if (ex.supersetGroup) meta.push(t("superset") + " " + ex.supersetGroup.replace(/^superset_/i, "") + (ex.supersetOrder ? "/" + ex.supersetOrder : ""));
        if (ex.isWarmup) meta.push(t("warmup").toLowerCase());
        if (ex.isUnilateral) meta.push(t("unilateral").toLowerCase());
        doc.setFont("helvetica", "normal");
        doc.setFontSize(9.5);
        doc.setTextColor(120);
        doc.text(pdfSafe(meta.join("  ·  ")), margin, y);
        y += 4.4;

        if (ex.notes) {
          doc.setFont("helvetica", "italic");
          doc.setFontSize(9);
          doc.setTextColor(140);
          const noteLines = doc.splitTextToSize(pdfSafe(ex.notes), contentW - 4);
          noteLines.forEach(function (line) {
            ensureSpace(4.5);
            doc.text(line, margin + 2, y);
            y += 4.2;
          });
        }
        y += 1.8;
      });
      y += 4;
    });

    // Pie de pagina
    const pages = doc.getNumberOfPages();
    for (let p = 1; p <= pages; p++) {
      doc.setPage(p);
      doc.setFont("helvetica", "normal");
      doc.setFontSize(8.5);
      doc.setTextColor(160);
      doc.text(pdfSafe(t("generatedBy") + "  ·  " + p + "/" + pages), pageW / 2, pageH - 10, { align: "center" });
    }

    doc.save(M.fileBaseName(r, "pdf"));
  }

  // ---------- Datos de ejercicios ----------

  function fillDatalist() {
    const list = $("#exerciseNames");
    const names = [];
    (exerciseData.presets || []).forEach(function (p) { names.push(p.n); });
    (exerciseData.catalog || []).forEach(function (c) { names.push(c.n); });
    list.innerHTML = names.slice(0, 1500).map(function (n) {
      return '<option value="' + esc(n) + '"></option>';
    }).join("");
  }

  function loadExerciseData() {
    fetch("data/exercises_lite.json")
      .then(function (res) {
        if (!res.ok) throw new Error("no data");
        return res.json();
      })
      .then(function (data) {
        exerciseData = { presets: data.presets || [], catalog: data.catalog || [] };
        fillDatalist();
      })
      .catch(function () { /* sin datos: el editor sigue funcionando sin autocompletado */ });
  }

  // ---------- Eventos ----------

  function wireEvents() {
    // Idioma y tema
    $("#langEs").addEventListener("click", function () {
      setLanguage("es");
    });
    $("#langEn").addEventListener("click", function () {
      setLanguage("en");
    });
    $("#themeToggle").addEventListener("click", function () {
      state.theme = state.theme === "dark" ? "light" : "dark";
      applyTheme();
      saveNow();
    });
    // Biblioteca
    $("#routineSelect").addEventListener("change", function (e) {
      setActiveRoutine(e.target.value);
    });
    $("#newRoutineBtn").addEventListener("click", newRoutineAction);
    $("#dupRoutineBtn").addEventListener("click", duplicateRoutineAction);
    $("#delRoutineBtn").addEventListener("click", deleteRoutineAction);

    // Rutina
    $("#routineName").addEventListener("input", function (e) {
      active().name = e.target.value;
      save();
      renderLibrary();
    });
    $("#routineDesc").addEventListener("input", function (e) {
      active().description = e.target.value;
      save();
    });

    $("#scheduleChips").addEventListener("click", function (e) {
      const btn = e.target.closest("[data-sched]");
      if (btn) setScheduleType(btn.getAttribute("data-sched"));
    });

    $("#scheduledDaysChips").addEventListener("click", function (e) {
      const btn = e.target.closest("[data-day]");
      if (!btn) return;
      const code = btn.getAttribute("data-day");
      const r = active();
      const idx = r.scheduledDays.indexOf(code);
      if (idx === -1) r.scheduledDays.push(code);
      else r.scheduledDays.splice(idx, 1);
      r.scheduledDays = M.DAY_CODES.filter(function (c) { return r.scheduledDays.indexOf(c) !== -1; });
      r.abRotationMap = null;
      save();
      renderMeta();
    });

    // Días y ejercicios
    $("#addDayBtn").addEventListener("click", addDay);

    $("#daysContainer").addEventListener("click", function (e) {
      const btn = e.target.closest("[data-action]");
      if (!btn) return;
      const action = btn.getAttribute("data-action");
      const dayId = btn.getAttribute("data-day");
      const day = dayId ? findDay(dayId) : null;

      if (action === "addEx") {
        openExerciseDialog(dayId, null);
      } else if (action === "delDay") {
        deleteDay(dayId);
      } else if (action === "editEx") {
        openExerciseDialog(dayId, btn.getAttribute("data-ex"));
      } else if (day) {
        const exId = btn.getAttribute("data-ex");
        const index = day.exercises.findIndex(function (x) { return x.id === exId; });
        if (index === -1) return;
        if (action === "delEx") {
          day.exercises.splice(index, 1);
        } else if (action === "dupEx") {
          const copy = M.clone(day.exercises[index]);
          copy.id = M.uuid();
          day.exercises.splice(index + 1, 0, copy);
        } else if (action === "upEx" && index > 0) {
          const tmp = day.exercises[index - 1];
          day.exercises[index - 1] = day.exercises[index];
          day.exercises[index] = tmp;
        } else if (action === "downEx" && index < day.exercises.length - 1) {
          const tmp = day.exercises[index + 1];
          day.exercises[index + 1] = day.exercises[index];
          day.exercises[index] = tmp;
        } else {
          return;
        }
        save();
        renderDays();
      }
    });

    $("#daysContainer").addEventListener("input", function (e) {
      const input = e.target.closest("[data-role='dayName']");
      if (!input) return;
      const day = findDay(input.getAttribute("data-day"));
      if (day) {
        day.name = input.value;
        save();
      }
    });

    $("#daysContainer").addEventListener("change", function (e) {
      const select = e.target.closest("[data-role='dayWeekday']");
      if (!select) return;
      const day = findDay(select.getAttribute("data-day"));
      if (!day) return;
      const code = select.value;
      const wdNames = t("weekdayNames");
      const previousNames = [M.WEEKDAY_NAMES_ES[day.dayCode], M.WEEKDAY_NAMES_EN[day.dayCode]];
      day.dayCode = code;
      if (!day.name || previousNames.indexOf(day.name) !== -1) {
        day.name = wdNames[code] || day.name;
      }
      save();
      renderDays();
    });

    // Diálogo de ejercicio
    $("#exName").addEventListener("input", function (e) {
      renderSuggestions(e.target.value);
    });
    $("#exName").addEventListener("change", function () {
      if (!dialogCtx) return;
      const name = $("#exName").value.trim();
      if (!name) return;
      const hit = P.suggestExercise(name, dataOpts());
      if (hit && hit.group && (dialogCtx.isNew || !dialogCtx.groupTouched)) {
        dialogCtx.groupSel = hit.group;
      }
      renderGroupChips();
    });
    $("#exSuggestions").addEventListener("click", function (e) {
      const btn = e.target.closest("[data-suggest]");
      if (!btn || !dialogCtx) return;
      $("#exName").value = btn.getAttribute("data-suggest");
      $("#exName").dispatchEvent(new Event("change"));
      renderSuggestions("");
      $("#exName").focus();
    });
    $("#exGroupChips").addEventListener("click", function (e) {
      const btn = e.target.closest("[data-group]");
      if (!btn || !dialogCtx) return;
      dialogCtx.groupSel = btn.getAttribute("data-group");
      dialogCtx.groupTouched = true;
      renderGroupChips();
    });
    $("#exIntensityChips").addEventListener("click", function (e) {
      const btn = e.target.closest("[data-int]");
      if (!btn || !dialogCtx) return;
      const value = btn.getAttribute("data-int");
      dialogCtx.intensitySel = value === "" ? null : value;
      renderIntensityChips();
    });
    $("#exSaveBtn").addEventListener("click", saveExerciseDialog);
    function closeExerciseDialog() {
      dialogCtx = null;
      try { $("#exerciseDialog").close(); } catch (e) { /* ya cerrado */ }
    }
    $("#exCancelBtn").addEventListener("click", closeExerciseDialog);
    $("#exCloseBtn").addEventListener("click", closeExerciseDialog);
    $("#exerciseDialog").addEventListener("close", function () { dialogCtx = null; });

    // Importar
    const dropzone = $("#dropzone");
    const fileInput = $("#fileInput");
    dropzone.addEventListener("click", function () { fileInput.click(); });
    dropzone.addEventListener("dragover", function (e) {
      e.preventDefault();
      dropzone.classList.add("dragover");
    });
    dropzone.addEventListener("dragleave", function () { dropzone.classList.remove("dragover"); });
    dropzone.addEventListener("drop", function (e) {
      e.preventDefault();
      dropzone.classList.remove("dragover");
      const file = e.dataTransfer && e.dataTransfer.files && e.dataTransfer.files[0];
      if (file) handleFile(file);
    });
    fileInput.addEventListener("change", function () {
      const file = fileInput.files && fileInput.files[0];
      if (file) handleFile(file);
      fileInput.value = "";
    });
    $("#detectBtn").addEventListener("click", detectFromText);

    // Exportar
    $("#exportCsvBtn").addEventListener("click", exportCsv);
    $("#copyCsvBtn").addEventListener("click", copyCsv);
    $("#exportPdfBtn").addEventListener("click", exportPdf);
    $("#exportJsonBtn").addEventListener("click", exportJson);
    $("#exportMdBtn").addEventListener("click", exportMarkdown);

    window.addEventListener("beforeunload", saveNow);
  }

  // ---------- Inicio ----------

  function init() {
    const hadData = load();
    if (!hadData) {
      state.lang = (navigator.language || "es").toLowerCase().indexOf("en") === 0 ? "en" : "es";
      state.theme = "light";
      state.routines = [defaultRoutine()];
      state.activeId = state.routines[0].id;
    }
    if (!state.routines.some(function (r) { return r.id === state.activeId; })) {
      state.activeId = state.routines[0].id;
    }

    applyI18n();
    applyTheme();
    renderLibrary();
    renderForm();
    wireEvents();
    loadExerciseData();
  }

  init();
})();
