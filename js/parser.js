/* Fitness Tracker - Creador de rutinas web
   Parser heuristico: convierte texto (PDF, OCR o pegado) en una rutina.
   Soporta texto plano, tablas Markdown (cabeceras #, negritas, filas |...|)
   y PDFs con glifos rotos (donde "4 x 8-12" llega como "4 \u0000 8\u0000 12").
   Todo es "best effort": el usuario corrige luego en el editor. */
(function (global) {
  "use strict";

  function M() {
    return global.FT_MODEL;
  }

  // ---------- Normalizacion ----------

  function norm(text) {
    return String(text || "")
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .toLowerCase()
      .replace(/\s+/g, " ")
      .trim();
  }

  // ---------- Grupos musculares (claves sin acentos, orden importante) ----------

  const GROUP_KEYWORDS = [
    ["Cardio", ["cinta de correr", "cinta", "correr", "trotar", "caminar", "bicicleta", "eliptica", "ergometro",
      "maquina de remo", "remo ergometro", "rowing machine", "escaladora", "stair", "saltar la cuerda", "comba",
      "jump rope", "burpee", "burpees", "hiit", "cardio", "treadmill", "running", "jogging", "bike", "cycling",
      "spinning", "assault bike", "sprint", "step machine", "caminadora"]],
    ["Glúteos", ["hip thrust", "puente de gluteo", "gluteo", "gluteos", "glute bridge", "glute", "glutes",
      "patada de gluteo", "kickback de gluteo", "monster walk", "abductores", "abductor", "aductores", "aductor",
      "aductora", "abductora", "hip extension"]],
    ["Femoral", ["curl femoral", "femorales", "femoral", "leg curl", "isquiotibial", "isquiotibiales", "isquios",
      "peso muerto rumano", "rumano", "romanian", "stiff leg", "stiff-legged", "nordic", "nordico", "good morning",
      "buenos dias", "rdl"]],
    ["Cuádriceps", ["sentadilla", "squat", "prensa", "leg press", "zancada", "lunge", "extension de pierna",
      "extension de cuadriceps", "leg extension", "cuadriceps", "quad", "hack squat", "sissy squat", "bulgara",
      "bulgarian", "pistol", "step up", "subida al cajon", "goblet"]],
    ["Gemelos", ["elevacion de talones", "elevacion de talon", "gemelo", "gemelos", "calf", "talones", "talon",
      "soleo", "soleus", "pantorrilla", "pantorrillas"]],
    ["Espalda", ["dominada", "dominadas", "pull-up", "pull up", "pullup", "chin-up", "chin up", "jamon", "jalon",
      "pulldown", "remo", "row", "espalda", "dorsal", "pullover", "encogimiento", "shrug", "hiperextension",
      "back extension", "peso muerto", "deadlift", "t-bar", "t bar", "seal row", "meadows", "lat pull",
      "landmine", "snatch", "clean", "power clean", "high pull"]],
    ["Tríceps", ["triceps", "extension de triceps", "pushdown", "push-down", "patada de triceps", "patada",
      "kickback de triceps", "kickback", "press frances", "frances", "skull crusher", "rompecraneos", "copa",
      "jm press", "fondos entre bancos", "bench dip"]],
    ["Bíceps", ["curl", "biceps", "martillo", "hammer", "concentrado", "concentration", "preacher", "predicador",
      "scott", "drag curl", "reverse curl"]],
    ["Antebrazo", ["antebrazo", "antebrazos", "forearm", "forearms", "muneca", "munecas", "wrist", "grip",
      "paseo del granjero", "farmer", "farmers", "arranque de muneca", "pinza"]],
    ["Hombros", ["press militar", "militar", "overhead press", "shoulder press", "press de hombro", "press hombro",
      "elevacion lateral", "elevaciones laterales", "lateral raise", "pajaros", "pajaro", "rear delt",
      "deltoides", "deltoid", "arnold", "hombro", "shoulder", "face pull", "pike push", "elevacion frontal",
      "front raise", "press arnold", "lateral", "upright row", "remo al menton", "handstand"]],
    ["Pecho", ["press banca", "press de banca", "bench press", "bench", "pectoral", "pecho", "press de pecho",
      "fondos", "dips", "flexiones", "push-up", "push up", "pushup", "aperturas", "apertura", "fly", "flye",
      "crossover", "pec deck", "chest press", "chest fly", "peck deck", "svend", "press inclinado",
      "press declinado", "inclined press", "incline press", "chest"]],
    ["Abdominales", ["abdominal", "abdominales", "abs", "crunch", "plancha", "plank", "twist", "giro ruso",
      "elevacion de piernas", "leg raise", "rodillas al pecho", "sit-up", "sit up", "situp", "hollow",
      "ab wheel", "rueda abdominal", "oblicuo", "dragon flag", "l-sit", "v-up", "toes to bar", "colgado",
      "hanging", "bicho muerto", "dead bug", "bicycle crunch", "mountain climber", "pallof"]],
  ];

  function guessGroup(name) {
    const n = " " + norm(name) + " ";
    if (!n.trim()) return "Otros";
    for (let i = 0; i < GROUP_KEYWORDS.length; i++) {
      const group = GROUP_KEYWORDS[i][0];
      const keys = GROUP_KEYWORDS[i][1];
      for (let k = 0; k < keys.length; k++) {
        if (n.indexOf(" " + keys[k]) !== -1 || n.indexOf(keys[k] + " ") !== -1) {
          return group;
        }
      }
    }
    return "Otros";
  }

  // Grupo del texto entre parentesis final "(Pecho)" (formato del Markdown exportado).
  function canonicalGroup(word) {
    const n = norm(word).replace(/^\(|\)$/g, "").trim();
    if (!n) return null;
    const all = M().MUSCLE_GROUPS.concat(M().LEGACY_GROUPS || []);
    for (let i = 0; i < all.length; i++) {
      const gn = norm(all[i]);
      if (gn === n || gn === n.replace(/s$/, "") || gn.replace(/s$/, "") === n) return all[i];
    }
    return null;
  }

  // ---------- Indice de nombres conocidos (presets de la app + catalogo) ----------

  function buildIndex(opts) {
    const map = new Map();
    if (opts && opts.catalog) {
      opts.catalog.forEach(function (c) {
        map.set(norm(c.n), { name: c.n, group: c.g, id: null });
      });
    }
    if (opts && opts.presets) {
      opts.presets.forEach(function (p) {
        map.set(norm(p.n), { name: p.n, group: p.g, id: p.id });
      });
    }
    return map;
  }

  function suggestExercise(name, opts) {
    const index = buildIndex(opts);
    const hit = index.get(norm(name));
    if (hit) return { name: hit.name, group: hit.group, presetId: hit.id };
    return { name: name, group: guessGroup(name), presetId: null };
  }

  // ---------- Deteccion de cabeceras de dia ----------

  const WEEKDAY_CODES = [
    ["lunes", "LUN"], ["martes", "MAR"], ["miercoles", "MIE"], ["jueves", "JUE"],
    ["viernes", "VIE"], ["sabado", "SAB"], ["domingo", "DOM"],
    ["monday", "LUN"], ["tuesday", "MAR"], ["wednesday", "MIE"], ["thursday", "JUE"],
    ["friday", "VIE"], ["saturday", "SAB"], ["sunday", "DOM"],
  ];

  const RE_DAY = /^(?:d[ií]a|dia|day)\s*([0-9]{1,2}|[a-d])\b\.?\s*[:\-–—.)]*\s*(.*)$/i;
  const RE_ROUTINE_DAY = /^(?:rutina|routine|sesi[oó]n|session|entreno|entrenamiento|workout)\s*([0-9]{1,2}|[a-dA-D])\b\.?\s*[:\-–—.)]*\s*(.*)$/i;
  const RE_WEEKDAY = /^(lunes|martes|mi[eé]rcoles|jueves|viernes|s[áa]bado|domingo|monday|tuesday|wednesday|thursday|friday|saturday|sunday)\b\.?\s*[:\-–—.)]*\s*(.*)$/i;

  function weekdayCodeFromWord(word) {
    const n = norm(word);
    for (let i = 0; i < WEEKDAY_CODES.length; i++) {
      if (WEEKDAY_CODES[i][0] === n) return WEEKDAY_CODES[i][1];
    }
    return null;
  }

  function canonicalWeekdayName(word, lang) {
    const code = weekdayCodeFromWord(word);
    if (!code) return word;
    const table = lang === "en" ? M().WEEKDAY_NAMES_EN : M().WEEKDAY_NAMES_ES;
    return table[code] || word;
  }

  // ---------- Limpieza de lineas ----------

  function stripPrefixes(line) {
    let s = line;
    s = s.replace(/^\s*#{1,6}\s+/, ""); // cabecera markdown "# Dia 1"
    s = s.replace(/^\s*>\s?/, ""); // cita "> texto"
    s = s.replace(/^\s*[\u2022\u00b7\u25AA\u25E6\u2043*\-–—]\s+/, ""); // vineta
    s = s.replace(/^\s*\d{1,2}\s*[.)\]]\s+/, ""); // numeracion "1." "2)"
    s = s.replace(/^\s*\[[ xX]\]\s*/, ""); // checkbox
    s = s.replace(/[*`]+/g, ""); // negritas **texto** y codigo `texto`
    return s.trim();
  }

  const SKIP_WORDS = /^(serie|series|set|sets|rep|reps|repeticion|repeticiones|peso|kg|kilos|lbs|libra|libra?s|descanso|rest|nota|notas|observacion|observaciones|ejercicio|ejercicios|exercise|exercises|nombre|name|total|objetivo|calentamiento|warm ?up|vuelta|vueltas|ronda|rondas|semana|week|bloque|block|fase|phase|tiempo|duracion|tempo|rir|rpe|porcentaje|%|peso corporal|barra|mancuerna|mancuernas|polea|maquina|banco|fecha|dia|día|day|descripcion|comentario|comentarios|progresion|progression|metodo|method|intensidad|frecuencia|cardio|movilidad|estir|estiramiento|abdominales en casa|rutina|routine|ejemplo|example|recomendaciones|indicaciones)\b/i;

  function looksLikeHeader(name) {
    const n = norm(name);
    if (!n) return true;
    const words = n.split(/\s+/);
    if (words.length === 1) return SKIP_WORDS.test(n);
    const skipLike = words.filter(function (w) { return JUNK_WORD.test(w); }).length;
    if (skipLike >= 2) return true;
    if (/^(semana|week|bloque|block|fase|phase|nota|notas|observacion|observaciones|importante|aviso|ojo|recordar)\b/.test(n)) return true;
    return false;
  }

  // Nombre de rutina: rechaza titulos vacios o filas de cabecera de tabla
  // ("Ejercicio Series Reps"), pero acepta cosas como "Rutina PPL".
  const JUNK_WORD = /^(serie|series|set|sets|rep|reps|repeticion|repeticiones|peso|descanso|rest|ejercicio|ejercicios|exercise|exercises|nombre|name|nota|notas|dia|día|day|semana|week|bloque|block|fase|phase|tempo|rir|rpe|kg|lbs?|porcentaje|x)$/;

  function isJunkName(name) {
    const n = norm(name);
    if (!n) return true;
    const words = n.split(/\s+/);
    if (words.length === 1 && SKIP_WORDS.test(n)) return true;
    const skipLike = words.filter(function (w) { return JUNK_WORD.test(w); }).length;
    if (skipLike >= 2) return true;
    if (/^(semana|week|bloque|block|fase|phase)\b/.test(n)) return true;
    return false;
  }

  // ¿El texto tras una cabecera de dia contiene metricas? Entonces es un
  // ejercicio en la misma linea; si no, es el nombre/titulo del dia.
  function hasMetricsHint(text) {
    if (text.indexOf("|") !== -1) return true;
    return /\d\s*[\u0000xX×]\s*\d|\d+\s*(?:series|sets|reps?|repeticiones)|\b(?:rpe|rir)\b|@\s*\d|\d+\s*(?:seg|segundos|s\b)/i.test(text);
  }

  function cleanupName(s) {
    let out = s;
    out = out.replace(/[\u0000-\u001f\uFFFD]/g, " "); // glifos rotos de PDF
    out = out.replace(/[\u2022\u00b7|_\[\]]+/g, " ");
    out = out.replace(/\s*\(\s*\)\s*/g, " ");
    out = out.replace(/\s*[—–]\s*/g, " "); // separador "Nombre — 4x8"
    out = out.replace(/\s+/g, " ").trim();
    out = out.replace(/^[\s\-–—:.,;]+/, "").replace(/[\s\-–—:.,;]+$/, "");
    out = out.replace(/\b(?:de|con|x|×|por|al)$/i, "").replace(/\s+/g, " ").trim();
    out = out.replace(/[\s\-–—:.,;]*\bs\b$/i, ""); // "s" suelta (residuo de "60s")
    out = out.replace(/^[\s\-–—:.,;]+/, "").replace(/[\s\-–—:.,;]+$/, "");
    return out.trim();
  }

  // ---------- Parseo de una linea de ejercicio ----------

  function parseMetrics(work, target) {
    // Glifos sin mapear de algunos PDFs: "4 x 8-12" llega como "4 \u0000 8\u0000 12".
    // Se normalizan a \u0000 y se aceptan como separadores en los patrones.
    work = work.replace(/[\u0001-\u0008\u000B\u000C\u000E-\u001F\uFFFD\uE000-\uF8FF]/g, "\u0000");
    // "3x60s" / "4x8 seg": consumir la unidad pegada a las reps para que no
    // quede una "s" suelta en el nombre (Plancha 3x60s -> 3 series de 60).
    work = work.replace(/(\d{1,2}\s*[xX×]\s*\d{1,3})\s*(?:s\b|seg\b|segundos)/i, "$1 ");
    // sets x reps (separadores normales o rotos; rango "8-12" o "8 12")
    let m = work.match(/(\d{1,2})\s*[xX×✕╳*\u0000]\s*(\d{1,3})(?:\s*[\-–—al\u0000~\s]{1,3}\s*(\d{1,3})(?!\d)(?!\s*(?:s\b|seg\b|segundos|sec\b|seconds|'')))?/);
    if (m) {
      target.sets = parseInt(m[1], 10);
      target.reps = parseInt(m[2], 10);
      work = work.replace(m[0], " ");
    }
    // "4 series de 10" / "4 series x 12"
    if (target.sets === null || target.reps === null) {
      m = work.match(/(\d{1,2})\s*(?:series|sets)\s*(?:de|x|×|por)\s*(\d{1,3})/i);
      if (m) {
        if (target.sets === null) target.sets = parseInt(m[1], 10);
        if (target.reps === null) target.reps = parseInt(m[2], 10);
        work = work.replace(m[0], " ");
      }
    }
    if (target.sets === null) {
      m = work.match(/(\d{1,2})\s*(?:series|sets)/i);
      if (m) {
        target.sets = parseInt(m[1], 10);
        work = work.replace(m[0], " ");
      }
    }
    if (target.reps === null) {
      m = work.match(/(\d{1,3})\s*(?:repeticiones|repeticion|reps?)\b/i);
      if (m) {
        target.reps = parseInt(m[1], 10);
        work = work.replace(m[0], " ");
      }
    }
    // descanso
    m = work.match(/(?:descanso|rest)(?:\s*(?:de|of|:))?\s*(\d{2,3})\s*(?:s\b|seg\b|segundos|sec\b|seconds|'')?/i);
    if (!m) m = work.match(/@\s*(\d{2,3})\s*(?:s\b|seg\b|segundos|sec\b|seconds|'')?/i);
    if (!m) m = work.match(/\b(\d{2,3})\s*(?:seg\b|segundos|seconds|sec\b|s\b|'')/i);
    if (m) {
      target.rest = parseInt(m[1], 10);
      work = work.replace(m[0], " ");
    }
    // RPE / RIR
    m = work.match(/rpe\s*[:=]?\s*(\d{1,2}(?:[.,]\d)?)/i);
    if (m) {
      target.rpe = parseFloat(m[1].replace(",", "."));
      work = work.replace(m[0], " ");
    }
    m = work.match(/rir\s*[:=]?\s*(\d{1,2})/i);
    if (m) {
      target.rir = parseFloat(m[1]);
      work = work.replace(m[0], " ");
    }
    // porcentaje
    m = work.match(/(\d{1,3}(?:[.,]\d)?)\s*%\s*(?:1rm|rm|del?)?/i);
    if (m) {
      target.pct = parseFloat(m[1].replace(",", "."));
      work = work.replace(m[0], " ");
    }
    // superset (formato de exportacion: "superset superset_1 #2")
    m = work.match(/\bsuperset\b\s*[:#]?\s*(?:superset_)?([a-z][a-z0-9]{0,7})(?:\s*#?\s*(\d{1,2}))?/i);
    if (m) {
      target.supersetGroup = "superset_" + m[1].toUpperCase();
      if (m[2]) target.supersetOrder = parseInt(m[2], 10);
      work = work.replace(m[0], " ");
    }
    // unilateral
    const uniRe = /(c\s*\/\s*lado|por lado|each side|cada lado|por brazo|por brazos|por pierna|por piernas|each arm|each leg|per arm|per leg|cada brazo|cada pierna|unilateral|alterno|alternando|a una mano|a una pierna|single[- ]?(arm|leg)|one[- ]?(arm|leg))/gi;
    if (uniRe.test(work)) {
      target.unilateral = true;
      work = work.replace(uniRe, " ");
    }
    // calentamiento
    const warmRe = /(calentamiento|warm[- ]?up|entrada en calor|aprox\.?|aproximacion|feeler set)/gi;
    if (warmRe.test(work)) {
      target.warmup = true;
      work = work.replace(warmRe, " ");
    }
    return work;
  }

  function buildExerciseFromParts(name, metrics, opts, presetIndex) {
    // Bloques de flags del Markdown exportado ("_[unilateral]_"): las palabras
    // ya las consumio parseMetrics; aqui solo se limpia el resto.
    name = String(name).replace(/_\[[^\]]*\]/g, " ");
    // "Nombre (Pecho)" (formato del Markdown exportado): usar el grupo y quitarlo
    let groupHint = null;
    const gh = String(name).match(/\(([^()]{2,30})\)\s*[*`_]*\s*$/);
    if (gh) {
      const canon = canonicalGroup(gh[1]);
      if (canon) {
        groupHint = canon;
        name = name.slice(0, gh.index);
      }
    }

    const cleanName = cleanupName(name);
    if (cleanName.length < 2) return null;
    if (!/[a-záéíóúüñA-Z]/.test(cleanName)) return null;
    if (cleanName.length > 90) return null;
    if (looksLikeHeader(cleanName)) return null;
    // Cabeceras repetidas del PDF ("Rutina de Entrenamiento")
    if (/^(rutina|routine|entrenamiento|workout|sesi[oó]n)\b/i.test(norm(cleanName))) return null;

    const hasMetrics = metrics.sets !== null || metrics.reps !== null || metrics.rest !== null ||
      metrics.rpe !== null || metrics.rir !== null || metrics.pct !== null;

    const hit = presetIndex ? presetIndex.get(norm(cleanName)) : null;
    const group = groupHint || (hit ? hit.group : guessGroup(cleanName));
    const words = cleanName.split(/\s+/).length;
    if (!hasMetrics && group === "Otros" && (words > 4 || /[.:]$/.test(cleanName))) {
      return null; // probablemente prosa, no un ejercicio
    }

    const ex = M().newExercise();
    ex.name = hit ? hit.name : cleanName;
    ex.exerciseId = hit && hit.id ? hit.id : M().webExerciseId(ex.name);
    ex.muscleGroup = group;
    if (metrics.sets !== null) ex.sets = metrics.sets;
    if (metrics.reps !== null) ex.reps = metrics.reps;
    if (metrics.rest !== null) ex.restTimeSeconds = metrics.rest;
    if (metrics.rpe !== null) {
      ex.targetIntensity = "RPE";
      ex.intensityValue = metrics.rpe;
    } else if (metrics.rir !== null) {
      ex.targetIntensity = "RIR";
      ex.intensityValue = metrics.rir;
    } else if (metrics.pct !== null) {
      ex.targetIntensity = "PERCENTAGE";
      ex.intensityValue = metrics.pct;
    }
    ex.isUnilateral = !!metrics.unilateral;
    ex.isWarmup = !!metrics.warmup;
    if (metrics.supersetGroup) {
      ex.supersetGroup = metrics.supersetGroup;
      ex.supersetOrder = metrics.supersetOrder;
    }
    return ex;
  }

  function emptyMetrics() {
    return {
      sets: null, reps: null, rest: null, rpe: null, rir: null, pct: null,
      unilateral: false, warmup: false, supersetGroup: "", supersetOrder: 0,
    };
  }

  // Fila tipo tabla de PDF o Markdown: "Press banca | 4 | 8 | 90" / "| Press banca | 4 x 8 |"
  function parsePipeRow(line, opts, presetIndex) {
    const cells = line.split("|").map(function (c) { return c.trim(); }).filter(function (c) { return c.length > 0; });
    if (cells.length < 2) return null;
    const name = cells[0];
    if (!/[a-záéíóúüñA-Z]/.test(name) || looksLikeHeader(name)) return null;
    // fila separadora de tabla ("| --- | --- |")
    if (cells.every(function (c) { return /^[\s:\-=–—]+$/.test(c); })) return null;

    const metrics = emptyMetrics();
    let work = " " + cells.slice(1).join(" ") + " ";
    work = parseMetrics(work, metrics);
    if (metrics.sets === null || metrics.reps === null) {
      const ints = (work.match(/\d{1,3}/g) || []).map(function (s) { return parseInt(s, 10); });
      if (metrics.sets === null && ints.length > 0) metrics.sets = ints[0];
      if (metrics.reps === null && ints.length > 1) metrics.reps = ints[1];
      if (metrics.rest === null && ints.length > 2 && ints[2] >= 20) metrics.rest = ints[2];
    }
    if (metrics.sets === null && metrics.reps === null && metrics.rest === null) return null;
    return buildExerciseFromParts(name, metrics, opts, presetIndex);
  }

  function parseExerciseLine(line, opts, presetIndex) {
    // prefijo de superset: "A1 Press banca..." o "1a) Press banca..."
    let supersetGroup = "";
    let supersetOrder = 0;
    let work = line;
    let m = work.match(/^([a-dA-D])\s?([1-9])\s*[.)\-–—:]?\s+/);
    if (m) {
      supersetGroup = "superset_" + m[1].toUpperCase();
      supersetOrder = parseInt(m[2], 10);
      work = work.slice(m[0].length);
    } else {
      m = work.match(/^([1-9])\s?([a-dA-D])\s*[.)\-–—:]?\s+/);
      if (m) {
        supersetGroup = "superset_" + m[2].toUpperCase();
        supersetOrder = parseInt(m[1], 10);
        work = work.slice(m[0].length);
      }
    }

    const metrics = emptyMetrics();
    work = parseMetrics(" " + work + " ", metrics);
    metrics.supersetGroup = supersetGroup;
    metrics.supersetOrder = supersetOrder;
    return buildExerciseFromParts(work, metrics, opts, presetIndex);
  }

  // ---------- Parser principal ----------

  function parseRoutineText(text, opts) {
    opts = opts || {};
    const presetIndex = buildIndex(opts);
    const rawLines = String(text || "").split(/\r?\n/)
      .map(function (l) { return l.replace(/\u00a0/g, " ").replace(/\t/g, "  ").trim(); })
      .filter(function (l) { return l.length > 0; });

    const days = [];
    let currentDay = null;
    let routineName = "";
    let sawDayHeader = false;

    function startDay(name, dayCode, weekday, number) {
      const day = { name: name || "", dayCode: dayCode || "", weekday: weekday || null, number: number || null, exercises: [] };
      days.push(day);
      currentDay = day;
      sawDayHeader = true;
      return day;
    }

    function addExercise(ex) {
      if (!ex) return;
      if (!currentDay) {
        startDay("", "A", null, null);
      }
      currentDay.exercises.push(ex);
    }

    for (let i = 0; i < rawLines.length; i++) {
      let line = rawLines[i];
      let stripped = stripPrefixes(line);
      if (!stripped) continue;

      // Fila separadora de tabla ("| --- | --- |") o linea horizontal
      if (/^[\s:|=\-–—]+$/.test(stripped)) continue;

      // ¿Cabecera de dia?
      let m = stripped.match(RE_DAY) || stripped.match(RE_ROUTINE_DAY);
      let wk = null;
      if (!m) {
        const w = stripped.match(RE_WEEKDAY);
        if (w) {
          wk = w[1];
          const code = weekdayCodeFromWord(wk);
          const rest = (w[2] || "").trim();
          let inline = null;
          if (rest && hasMetricsHint(rest)) {
            inline = parsePipeRow(rest, opts, presetIndex) || parseExerciseLine(rest, opts, presetIndex);
          }
          startDay(rest && !inline ? cleanupName(rest) : "", code, wk, null);
          if (inline) addExercise(inline);
          continue;
        }
      }
      if (m) {
        const rest = (m[2] || "").trim();
        const num = /^\d+$/.test(m[1]) ? parseInt(m[1], 10) : null;
        let inline = null;
        if (rest && hasMetricsHint(rest)) {
          inline = parsePipeRow(rest, opts, presetIndex) || parseExerciseLine(rest, opts, presetIndex);
        }
        startDay(rest && !inline ? cleanupName(rest) : "", "", null, num);
        if (inline) addExercise(inline);
        continue;
      }

      // Nombre de rutina (solo antes del primer dia)
      if (!sawDayHeader && !routineName && line.indexOf("|") === -1) {
        const maybeName = cleanupName(stripped);
        if (maybeName && maybeName.split(/\s+/).length <= 10 && !isJunkName(maybeName) &&
            !/^\d/.test(maybeName) && !/\d\s*[xX×]\s*\d/.test(maybeName)) {
          routineName = maybeName;
          continue;
        }
      }

      // Fila de tabla
      if (line.indexOf("|") !== -1) {
        const rowEx = parsePipeRow(stripped, opts, presetIndex);
        if (rowEx) {
          addExercise(rowEx);
          continue;
        }
      }

      // Ejercicio normal
      const ex = parseExerciseLine(stripped, opts, presetIndex);
      if (ex) addExercise(ex);
    }

    // Asignar codigos y nombres a los dias
    finalizeDays(days, opts);
    return { name: routineName, days: days };
  }

  function finalizeDays(days, opts) {
    const lang = opts && opts.lang === "en" ? "en" : "es";
    const table = lang === "en" ? M().WEEKDAY_NAMES_EN : M().WEEKDAY_NAMES_ES;
    const hasWeekday = days.some(function (d) { return d.weekday; });

    // Codigos A, B, C... para dias sin dia de la semana
    let letterIndex = 0;
    days.forEach(function (d) {
      if (d.weekday) {
        d.dayCode = weekdayCodeFromWord(d.weekday) || "A";
      } else {
        d.dayCode = String.fromCharCode(65 + letterIndex);
      }
      letterIndex++;
    });

    // Dias sin nombre: "Día A" / "Day A"
    days.forEach(function (d) {
      const prefix = lang === "en" ? "Day " : "Día ";
      if (!d.name || d.name.length > 40) {
        if (d.weekday) {
          // usar nombre del dia de la semana
          d.name = canonicalWeekdayName(d.weekday, lang);
        } else {
          d.name = prefix + d.dayCode;
        }
      }
    });

    // Dias numerados "Día 1..Día 7": si todos los dias con ejercicios tienen
    // numero 1-7 y no se repiten, mapearlos directamente a Lunes..Domingo
    // (asi los dias de descanso sin ejercicios no desplazan al resto).
    const withEx = days.filter(function (d) { return d.exercises.length > 0; });
    let numbered = withEx.length > 1 && withEx.every(function (d) { return d.number >= 1 && d.number <= 7; });
    if (numbered) {
      const seen = {};
      withEx.forEach(function (d) {
        if (seen[d.number]) numbered = false;
        seen[d.number] = true;
      });
    }
    if (numbered) {
      withEx.forEach(function (d) { d.assignedWeekday = M().DAY_CODES[d.number - 1]; });
    }

    // Asignar dias de la semana que falten (variación diaria)
    const used = {};
    days.forEach(function (d) {
      if (d.weekday) used[weekdayCodeFromWord(d.weekday)] = true;
      if (d.assignedWeekday) used[d.assignedWeekday] = true;
    });
    let nextCode = 0;
    days.forEach(function (d) {
      if (d.weekday || d.assignedWeekday) return;
      while (nextCode < M().DAY_CODES.length && used[M().DAY_CODES[nextCode]]) nextCode++;
      if (nextCode < M().DAY_CODES.length) {
        const code = M().DAY_CODES[nextCode];
        used[code] = true;
        d.assignedWeekday = code;
        nextCode++;
      }
    });

    return days;
  }

  // ---------- Texto -> objeto rutina ----------

  function textToRoutine(text, opts) {
    opts = opts || {};
    const lang = opts.lang === "en" ? "en" : "es";
    const parsed = parseRoutineText(text, opts);
    const routine = M().newRoutine(parsed.name || "");
    routine.days = [];

    const realDays = parsed.days.filter(function (d) { return d.exercises.length > 0; });
    const count = realDays.reduce(function (acc, d) { return acc + d.exercises.length; }, 0);

    if (realDays.length === 0) {
      routine.days = [M().newDay({ dayCode: "A" })];
      return { routine: routine, exercises: 0, days: 0 };
    }

    const hasWeekday = realDays.some(function (d) { return d.weekday; });

    if (hasWeekday || realDays.length >= 3) {
      // Variación diaria: cada día se mapea a un día de la semana
      routine.scheduleType = "daily_variation";
      const scheduled = [];
      realDays.forEach(function (d) {
        let code = d.weekday ? weekdayCodeFromWord(d.weekday) : d.assignedWeekday;
        if (!code) {
          // buscar el primer dia libre
          for (let i = 0; i < M().DAY_CODES.length; i++) {
            if (scheduled.indexOf(M().DAY_CODES[i]) === -1) { code = M().DAY_CODES[i]; break; }
          }
        }
        if (scheduled.indexOf(code) === -1) scheduled.push(code);
        const day = M().newDay();
        day.dayCode = code;
        const extra = d.name && norm(d.name) !== norm(tableName(code, lang)) ? d.name : "";
        day.name = extra ? tableName(code, lang) + " — " + extra : tableName(code, lang);
        day.exercises = d.exercises;
        routine.days.push(day);
      });
      routine.scheduledDays = M().DAY_CODES.filter(function (c) { return scheduled.indexOf(c) !== -1; });
    } else if (realDays.length === 2) {
      routine.scheduleType = "ab_rotation";
      realDays.forEach(function (d, i) {
        const day = M().newDay();
        day.dayCode = i === 0 ? "A" : "B";
        const prefix = lang === "en" ? "Day " : "Día ";
        const candidate = d.name && d.name.split(/\s+/).length <= 5 && !/^\d+$/.test(d.name) ? d.name : "";
        day.name = candidate || (prefix + day.dayCode);
        day.exercises = d.exercises;
        routine.days.push(day);
      });
    } else {
      routine.scheduleType = "same_each_day";
      const d = realDays[0];
      const day = M().newDay();
      day.dayCode = "A";
      const candidate = d.name && d.name.split(/\s+/).length <= 5 ? d.name : "";
      day.name = candidate || "";
      day.exercises = d.exercises;
      routine.days.push(day);
    }

    return {
      routine: routine,
      exercises: count,
      days: routine.days.length,
    };
  }

  function tableName(code, lang) {
    const table = lang === "en" ? M().WEEKDAY_NAMES_EN : M().WEEKDAY_NAMES_ES;
    return table[code] || code;
  }

  global.FT_PARSER = {
    norm: norm,
    guessGroup: guessGroup,
    suggestExercise: suggestExercise,
    parseRoutineText: parseRoutineText,
    textToRoutine: textToRoutine,
  };

  if (typeof module !== "undefined" && module.exports) {
    module.exports = global.FT_PARSER;
  }
})(typeof window !== "undefined" ? window : globalThis);
