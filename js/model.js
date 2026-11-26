/* Fitness Tracker - Creador de rutinas web
   Modelo de rutina + formatos: CSV compatible con la app, JSON y Markdown.
   El CSV replica exactamente CsvExporterImporter.kt (formato de exportacion). */
(function (global) {
  "use strict";

  const MUSCLE_GROUPS = ["Pecho", "Espalda", "Hombros", "Bíceps", "Tríceps", "Antebrazo", "Cuádriceps", "Femoral", "Gemelos", "Glúteos", "Abdominales", "Cardio", "Otros"];

  // Grupos antiguos (antes de dividir Brazos/Piernas en subgrupos): siguen
  // visibles en rutinas guardadas, pero ya no se ofrecen en los selectores.
  const LEGACY_GROUPS = ["Brazos", "Piernas"];

  // Mismos colores que getMuscleGroupColor() en la app (ui/theme/Color.kt)
  const MUSCLE_COLORS = {
    pecho: "#EF4444",
    espalda: "#3B82F6",
    hombros: "#F59E0B",
    biceps: "#8B5CF6",
    triceps: "#8B5CF6",
    antebrazo: "#8B5CF6",
    cuadriceps: "#10B981",
    femoral: "#10B981",
    gemelos: "#10B981",
    gluteos: "#10B981",
    abdominales: "#EC4899",
    cardio: "#F97316",
    otros: "#6B7280",
    // Grupos antiguos (Brazos/Piernas): mismo color que sus subgrupos
    brazos: "#8B5CF6",
    piernas: "#10B981",
  };

  const DAY_CODES = ["LUN", "MAR", "MIE", "JUE", "VIE", "SAB", "DOM"];

  const WEEKDAY_NAMES_ES = {
    LUN: "Lunes", MAR: "Martes", MIE: "Miércoles", JUE: "Jueves",
    VIE: "Viernes", SAB: "Sábado", DOM: "Domingo",
  };
  const WEEKDAY_NAMES_EN = {
    LUN: "Monday", MAR: "Tuesday", MIE: "Wednesday", JUE: "Thursday",
    VIE: "Friday", SAB: "Saturday", DOM: "Sunday",
  };

  const SCHEDULE_TYPES = ["same_each_day", "ab_rotation", "daily_variation"];

  // ---------- Utilidades ----------

  function uuid() {
    if (global.crypto && typeof global.crypto.randomUUID === "function") {
      return global.crypto.randomUUID();
    }
    return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, function (c) {
      const r = (Math.random() * 16) | 0;
      const v = c === "x" ? r : (r & 0x3) | 0x8;
      return v.toString(16);
    });
  }

  function slug(text) {
    return String(text || "")
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "_")
      .replace(/^_+|_+$/g, "")
      .slice(0, 48);
  }

  // Id estable para ejercicios escritos a mano en la web (la app lo reutiliza
  // al importar; si el nombre ya existe, re-vincula por nombre).
  function webExerciseId(name) {
    return "web_" + (slug(name) || "exercise");
  }

  function muscleColor(group) {
    const key = String(group || "").trim().toLowerCase();
    return MUSCLE_COLORS[key] || MUSCLE_COLORS.otros;
  }

  function weekdayName(code, lang) {
    const table = lang === "en" ? WEEKDAY_NAMES_EN : WEEKDAY_NAMES_ES;
    return table[code] || code;
  }

  // ---------- CSV (mismas reglas que CsvExporterImporter.kt) ----------

  function escapeCsv(value) {
    const s = value === null || value === undefined ? "" : String(value);
    if (s.indexOf(",") !== -1 || s.indexOf('"') !== -1 || s.indexOf("\n") !== -1) {
      return '"' + s.replace(/"/g, '""') + '"';
    }
    return s;
  }

  function parseCsvLine(line) {
    const tokens = [];
    let sb = "";
    let inQuotes = false;
    let i = 0;
    while (i < line.length) {
      const c = line[i];
      if (c === '"') {
        if (inQuotes && i + 1 < line.length && line[i + 1] === '"') {
          sb += '"';
          i += 2;
        } else {
          inQuotes = !inQuotes;
          i++;
        }
      } else if (c === "," && !inQuotes) {
        tokens.push(sb);
        sb = "";
        i++;
      } else {
        sb += c;
        i++;
      }
    }
    tokens.push(sb);
    return tokens;
  }

  // La app lee el CSV con readLines(): los campos no pueden contener saltos.
  function oneLine(value) {
    return String(value === null || value === undefined ? "" : value)
      .replace(/\r/g, " ")
      .replace(/\n/g, " ")
      .trim();
  }

  function toIntOrNull(s) {
    if (s === null || s === undefined) return null;
    const t = String(s).trim();
    if (!/^-?\d+$/.test(t)) return null;
    return parseInt(t, 10);
  }

  function toFloatOrNull(s) {
    if (s === null || s === undefined) return null;
    const t = String(s).trim();
    if (!/^-?\d+(\.\d+)?$/.test(t)) return null; // igual que Kotlin toFloatOrNull (punto decimal)
    return parseFloat(t);
  }

  function toBool(s) {
    return String(s === null || s === undefined ? "" : s).trim().toLowerCase() === "true";
  }

  function ifBlankNull(s) {
    if (s === null || s === undefined) return null;
    const t = String(s);
    return t.trim() === "" ? null : t;
  }

  function fmtNum(value) {
    if (value === null || value === undefined || value === "") return "";
    const n = Number(value);
    if (!isFinite(n)) return "";
    return String(Math.round(n * 1000) / 1000);
  }

  // ---------- Constructores ----------

  function newExercise(overrides) {
    return Object.assign(
      {
        id: uuid(),
        exerciseId: "",
        name: "",
        muscleGroup: "Otros",
        sets: 3,
        reps: 10,
        isUnilateral: false,
        isWarmup: false,
        targetIntensity: null, // "RPE" | "RIR" | "PERCENTAGE" | null
        intensityValue: null,
        notes: "",
        supersetGroup: "",
        supersetOrder: 0,
        restTimeSeconds: null,
      },
      overrides || {}
    );
  }

  function newDay(overrides) {
    return Object.assign(
      {
        dayId: uuid(),
        name: "",
        dayCode: "A",
        exercises: [],
      },
      overrides || {}
    );
  }

  function newRoutine(name) {
    return {
      v: 1,
      id: uuid(),
      name: name || "",
      description: "",
      scheduleType: "same_each_day",
      scheduledDays: ["LUN", "MIE", "VIE"],
      abRotationMap: null,
      isDefault: false,
      createdAt: Date.now(),
      days: [newDay({ name: "", dayCode: "A" })],
    };
  }

  function clone(obj) {
    return JSON.parse(JSON.stringify(obj));
  }

  // ---------- Ayudas de horario ----------

  function generateABRotationMap(scheduledDays) {
    const map = {};
    (scheduledDays || []).forEach(function (day, index) {
      map[day] = index % 2 === 0 ? "A" : "B";
    });
    return map;
  }

  function activeAbMap(routine) {
    if (routine.abRotationMap && Object.keys(routine.abRotationMap).length > 0) {
      return routine.abRotationMap;
    }
    return generateABRotationMap(routine.scheduledDays || []);
  }

  function daysForExport(routine) {
    const days = routine.days || [];
    if (routine.scheduleType === "same_each_day") {
      return days.slice(0, 1);
    }
    if (routine.scheduleType === "ab_rotation") {
      const two = days.slice(0, 2).map(function (d, i) {
        const copy = clone(d);
        copy.dayCode = i === 0 ? "A" : "B";
        if (!copy.name) copy.name = i === 0 ? "Día A" : "Día B";
        return copy;
      });
      return two;
    }
    return days;
  }

  function exerciseCount(routine) {
    return (routine.days || []).reduce(function (acc, d) {
      return acc + (d.exercises ? d.exercises.length : 0);
    }, 0);
  }

  function isEmptyRoutine(routine) {
    return exerciseCount(routine) === 0;
  }

  // Al cambiar el nombre de un ejercicio escrito a mano, mantener su id estable.
  function ensureExerciseId(ex) {
    if (!ex.exerciseId) {
      ex.exerciseId = webExerciseId(ex.name);
    }
    return ex;
  }

  // ---------- Exportar CSV (formato exacto de la app) ----------

  function routineToCsv(routine) {
    const days = daysForExport(routine);
    const scheduledJson = JSON.stringify(routine.scheduledDays || []);
    let abJson = "";
    if (routine.scheduleType === "ab_rotation") {
      abJson = JSON.stringify(activeAbMap(routine));
    }

    const lines = [];
    lines.push("ROUTINE");
    lines.push("Id,Name,Description,ScheduleType,ScheduledDays,AbRotationMap,IsDefault,CreatedAt");
    lines.push(
      [
        escapeCsv(routine.id || uuid()),
        escapeCsv(oneLine(routine.name)),
        escapeCsv(oneLine(routine.description)),
        routine.scheduleType || "same_each_day",
        escapeCsv(scheduledJson),
        escapeCsv(abJson),
        routine.isDefault ? "true" : "false",
        routine.createdAt || Date.now(),
      ].join(",")
    );

    lines.push("");
    lines.push("DAYS");
    lines.push("DayId,RoutineId,Name,DayCode");
    days.forEach(function (day) {
      lines.push(
        [
          day.dayId || uuid(),
          routine.id || uuid(),
          escapeCsv(oneLine(day.name)),
          oneLine(day.dayCode),
        ].join(",")
      );
    });

    lines.push("");
    lines.push("EXERCISES");
    lines.push(
      "Id,DayId,ExerciseId,Name,MuscleGroup,Sets,Reps,DayType,IsUnilateral,TargetIntensity,IntensityValue,IsWarmup,Notes,SupersetGroup,SupersetOrder,RestTimeSeconds"
    );
    days.forEach(function (day) {
      (day.exercises || []).forEach(function (ex) {
        ensureExerciseId(ex);
        lines.push(
          [
            ex.id || uuid(),
            day.dayId || uuid(),
            oneLine(ex.exerciseId),
            escapeCsv(oneLine(ex.name)),
            escapeCsv(oneLine(ex.muscleGroup) || "Otros"),
            toIntOrNull(ex.sets) !== null ? toIntOrNull(ex.sets) : 0,
            toIntOrNull(ex.reps) !== null ? toIntOrNull(ex.reps) : 0,
            escapeCsv(oneLine(day.dayCode)),
            ex.isUnilateral ? "true" : "false",
            escapeCsv(ex.targetIntensity || ""),
            fmtNum(ex.intensityValue),
            ex.isWarmup ? "true" : "false",
            escapeCsv(oneLine(ex.notes)),
            escapeCsv(oneLine(ex.supersetGroup)),
            toIntOrNull(ex.supersetOrder) || 0,
            ex.restTimeSeconds !== null && ex.restTimeSeconds !== undefined && ex.restTimeSeconds !== ""
              ? toIntOrNull(ex.restTimeSeconds) || 0
              : "",
          ].join(",")
        );
      });
    });

    return lines.join("\n") + "\n";
  }

  // ---------- Importar CSV (espejo de parseRoutineCsv) ----------

  function csvToRoutine(text) {
    const lines = String(text || "").split(/\r?\n/);
    const routineData = {};
    const days = [];
    const exercisesByDayId = {};
    let currentSection = "";

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i].trim();
      if (line === "") continue;

      if (line === "ROUTINE" || line === "DAYS" || line === "EXERCISES") {
        currentSection = line;
        continue;
      }
      if (
        line.indexOf("Id,Name,Description") === 0 ||
        line.indexOf("Name,Description") === 0 ||
        line.indexOf("DayId,RoutineId") === 0 ||
        line.indexOf("Id,DayId,ExerciseId") === 0
      ) {
        continue;
      }

      const parts = parseCsvLine(line);
      if (parts.length < 2) continue;

      if (currentSection === "ROUTINE") {
        if (parts.length >= 8) {
          routineData.id = parts[0] || uuid();
          routineData.name = parts[1] || "";
          routineData.description = parts[2] || "";
          routineData.scheduleType = parts[3] || "same_each_day";
          routineData.scheduledDaysJson = parts[4] || "[]";
          routineData.abRotationMapJson = ifBlankNull(parts[5]);
          routineData.isDefault = parts[6] || "false";
          routineData.createdAt = parts[7] || String(Date.now());
        } else {
          routineData.id = uuid();
          routineData.name = parts[0] || "";
          routineData.description = parts[1] || "";
          routineData.scheduleType = parts[2] || "same_each_day";
          routineData.scheduledDaysJson = parts[3] || "[]";
          routineData.abRotationMapJson = null;
          routineData.isDefault = parts[4] || "false";
          routineData.createdAt = String(Date.now());
        }
      } else if (currentSection === "DAYS") {
        const day = {
          dayId: parts[0] || uuid(),
          name: parts[2] || "",
          dayCode: parts[3] || "",
          exercises: [],
        };
        days.push(day);
        exercisesByDayId[day.dayId] = day.exercises;
      } else if (currentSection === "EXERCISES") {
        const ex = newExercise({
          id: parts[0] || uuid(),
          exerciseId: parts[2] || uuid(),
          name: parts[3] || "",
          muscleGroup: parts[4] || "Otros",
          sets: toIntOrNull(parts[5]) !== null ? toIntOrNull(parts[5]) : 0,
          reps: toIntOrNull(parts[6]) !== null ? toIntOrNull(parts[6]) : 0,
          isUnilateral: toBool(parts[8]),
          targetIntensity: ifBlankNull(parts[9]),
          intensityValue: toFloatOrNull(parts[10]),
          isWarmup: toBool(parts[11]),
          notes: ifBlankNull(parts[12]) || "",
          supersetGroup: ifBlankNull(parts[13]) || "",
          supersetOrder: toIntOrNull(parts[14]) || 0,
          restTimeSeconds: toIntOrNull(parts[15]),
        });
        const dayId = parts[1] || "";
        if (!exercisesByDayId[dayId]) {
          // Ejercicio huerfano: crear dia contenedor para no perderlo
          const orphan = { dayId: dayId || uuid(), name: "", dayCode: "", exercises: [] };
          days.push(orphan);
          exercisesByDayId[orphan.dayId] = orphan.exercises;
        }
        exercisesByDayId[dayId].push(ex);
      }
    }

    const name = (routineData.name || "").trim();
    if (!name) return null;

    let scheduledDays = [];
    try {
      scheduledDays = JSON.parse(routineData.scheduledDaysJson || "[]") || [];
    } catch (e) {
      scheduledDays = [];
    }
    let abMap = null;
    if (routineData.abRotationMapJson) {
      try {
        abMap = JSON.parse(routineData.abRotationMapJson);
      } catch (e) {
        abMap = null;
      }
    }

    let scheduleType = routineData.scheduleType || "same_each_day";
    if (SCHEDULE_TYPES.indexOf(scheduleType) === -1) scheduleType = "same_each_day";
    if (days.length === 0) days.push(newDay({ name: "", dayCode: "A" }));

    return {
      v: 1,
      id: routineData.id || uuid(),
      name: name,
      description: routineData.description || "",
      scheduleType: scheduleType,
      scheduledDays: scheduledDays,
      abRotationMap: abMap,
      isDefault: toBool(routineData.isDefault),
      createdAt: toIntOrNull(routineData.createdAt) || Date.now(),
      days: days,
    };
  }

  function looksLikeRoutineCsv(text) {
    return /(^|\n)\s*(ROUTINE|DAYS|EXERCISES)\s*(\n|$)/.test(String(text || ""));
  }

  // ---------- JSON ----------

  function routineToJson(routine) {
    return JSON.stringify({ app: "fitness-tracker-web-builder", version: 1, routine: routine }, null, 2);
  }

  function jsonToRoutine(text) {
    let data;
    try {
      data = JSON.parse(text);
    } catch (e) {
      return null;
    }
    const raw = data && data.routine ? data.routine : data;
    if (!raw || typeof raw !== "object" || !raw.name || !Array.isArray(raw.days)) return null;

    const routine = newRoutine(raw.name);
    routine.id = raw.id || routine.id;
    routine.description = raw.description || "";
    routine.scheduleType = SCHEDULE_TYPES.indexOf(raw.scheduleType) !== -1 ? raw.scheduleType : "same_each_day";
    routine.scheduledDays = Array.isArray(raw.scheduledDays) ? raw.scheduledDays.filter(function (d) { return DAY_CODES.indexOf(d) !== -1; }) : [];
    routine.abRotationMap = raw.abRotationMap && typeof raw.abRotationMap === "object" ? raw.abRotationMap : null;
    routine.isDefault = !!raw.isDefault;
    routine.createdAt = raw.createdAt || Date.now();
    routine.days = raw.days.map(function (d) {
      const day = newDay({
        dayId: d.dayId || undefined,
        name: d.name || "",
        dayCode: d.dayCode || "A",
      });
      day.exercises = (Array.isArray(d.exercises) ? d.exercises : []).map(function (ex) {
        const e = newExercise();
        e.id = ex.id || e.id;
        e.exerciseId = ex.exerciseId || "";
        e.name = ex.name || "";
        e.muscleGroup = MUSCLE_GROUPS.concat(LEGACY_GROUPS).indexOf(ex.muscleGroup) !== -1 ? ex.muscleGroup : "Otros";
        e.sets = typeof ex.sets === "number" ? ex.sets : (toIntOrNull(ex.sets) || 0);
        e.reps = typeof ex.reps === "number" ? ex.reps : (toIntOrNull(ex.reps) || 0);
        e.isUnilateral = !!ex.isUnilateral;
        e.isWarmup = !!ex.isWarmup;
        e.targetIntensity = ["RPE", "RIR", "PERCENTAGE"].indexOf(ex.targetIntensity) !== -1 ? ex.targetIntensity : null;
        e.intensityValue = typeof ex.intensityValue === "number" ? ex.intensityValue : toFloatOrNull(ex.intensityValue);
        e.notes = ex.notes || "";
        e.supersetGroup = ex.supersetGroup || "";
        e.supersetOrder = toIntOrNull(ex.supersetOrder) || 0;
        e.restTimeSeconds = typeof ex.restTimeSeconds === "number" ? ex.restTimeSeconds : toIntOrNull(ex.restTimeSeconds);
        return e;
      });
      return day;
    });
    if (routine.days.length === 0) routine.days.push(newDay({ dayCode: "A" }));
    return routine;
  }

  // ---------- Markdown ----------

  function routineToMarkdown(routine, labels) {
    const L = labels || {};
    const out = [];
    out.push("# " + (routine.name || L.untitled || "Routine"));
    if (routine.description) {
      out.push("");
      out.push(routine.description);
    }
    out.push("");
    const schedule = (L.schedules && L.schedules[routine.scheduleType]) || routine.scheduleType;
    const dayLabels = (routine.scheduledDays || []).join(" · ");
    out.push("**" + (L.scheduleLabel || "Schedule") + ":** " + schedule + (dayLabels ? " — " + dayLabels : ""));
    out.push("");

    daysForExport(routine).forEach(function (day) {
      const title = (L.dayLabel || "Day") + (day.dayCode ? " " + day.dayCode : "") + (day.name ? " — " + day.name : "");
      out.push("## " + title);
      out.push("");
      (day.exercises || []).forEach(function (ex, i) {
        const parts = [];
        parts.push(ex.sets + "×" + ex.reps);
        if (ex.restTimeSeconds) parts.push(ex.restTimeSeconds + " s");
        if (ex.targetIntensity && ex.intensityValue !== null && ex.intensityValue !== undefined) {
          parts.push(ex.targetIntensity + " " + fmtNum(ex.intensityValue));
        }
        const flags = [];
        if (ex.isWarmup) flags.push(L.warmup || "warm-up");
        if (ex.isUnilateral) flags.push(L.unilateral || "unilateral");
        if (ex.supersetGroup) flags.push((L.superset || "superset") + " " + ex.supersetGroup + (ex.supersetOrder ? " #" + ex.supersetOrder : ""));
        let line = (i + 1) + ". **" + ex.name + "** — " + parts.join(" · ");
        if (ex.muscleGroup) line += " (" + ex.muscleGroup + ")";
        if (flags.length) line += " _[" + flags.join(", ") + "]_";
        out.push(line);
        if (ex.notes) out.push("   - " + ex.notes);
      });
      out.push("");
    });

    return out.join("\n").replace(/\n+$/, "\n");
  }

  // ---------- Series semanales por grupo muscular ----------

  // Veces por semana que se entrena cada día de la rutina.
  function weeklyFrequencyByDay(routine) {
    const freq = {};
    const days = routine.days || [];
    days.forEach(function (d) { freq[d.dayId] = 0; });
    const scheduled = routine.scheduledDays || [];

    if (routine.scheduleType === "same_each_day") {
      // El único día se repite en cada día activo
      if (days[0]) freq[days[0].dayId] = scheduled.length;
    } else if (routine.scheduleType === "ab_rotation") {
      const map = activeAbMap(routine);
      scheduled.forEach(function (code) {
        const wanted = map[code] || "A";
        let day = days.find(function (d) { return d.dayCode === wanted; });
        if (!day) day = days[wanted === "B" ? 1 : 0];
        if (day) freq[day.dayId] += 1;
      });
    } else {
      scheduled.forEach(function (code) {
        const day = days.find(function (d) { return d.dayCode === code; });
        if (day) freq[day.dayId] += 1;
      });
    }
    return freq;
  }

  // Series efectivas por semana de cada grupo (series × veces por semana).
  // El calentamiento no cuenta como serie efectiva.
  function weeklySets(routine) {
    const freq = weeklyFrequencyByDay(routine);
    const byGroup = {};
    let total = 0;

    (routine.days || []).forEach(function (day) {
      const times = freq[day.dayId] || 0;
      (day.exercises || []).forEach(function (ex) {
        if (ex.isWarmup) return;
        const sets = Number(ex.sets) || 0;
        const weekly = sets * times;
        const key = ex.muscleGroup || "Otros";
        if (!byGroup[key]) byGroup[key] = { group: key, total: 0, items: [] };
        byGroup[key].total += weekly;
        byGroup[key].items.push({ name: ex.name, sets: sets, times: times, total: weekly });
        total += weekly;
      });
    });

    const order = MUSCLE_GROUPS.concat(LEGACY_GROUPS);
    const groups = Object.keys(byGroup).map(function (k) { return byGroup[k]; });
    groups.sort(function (a, b) {
      const ia = order.indexOf(a.group);
      const ib = order.indexOf(b.group);
      return (ia === -1 ? order.length : ia) - (ib === -1 ? order.length : ib);
    });
    groups.forEach(function (g) {
      g.items.sort(function (a, b) { return b.total - a.total; });
    });
    return { total: total, groups: groups };
  }

  // ---------- Nombre de archivo ----------

  function fileBaseName(routine, ext) {
    const base = slug(routine.name) ? slug(routine.name) : "rutina";
    return base + "." + ext;
  }

  global.FT_MODEL = {
    MUSCLE_GROUPS: MUSCLE_GROUPS,
    LEGACY_GROUPS: LEGACY_GROUPS,
    MUSCLE_COLORS: MUSCLE_COLORS,
    DAY_CODES: DAY_CODES,
    WEEKDAY_NAMES_ES: WEEKDAY_NAMES_ES,
    WEEKDAY_NAMES_EN: WEEKDAY_NAMES_EN,
    SCHEDULE_TYPES: SCHEDULE_TYPES,
    uuid: uuid,
    slug: slug,
    webExerciseId: webExerciseId,
    muscleColor: muscleColor,
    weekdayName: weekdayName,
    escapeCsv: escapeCsv,
    parseCsvLine: parseCsvLine,
    newExercise: newExercise,
    newDay: newDay,
    newRoutine: newRoutine,
    clone: clone,
    generateABRotationMap: generateABRotationMap,
    activeAbMap: activeAbMap,
    daysForExport: daysForExport,
    exerciseCount: exerciseCount,
    isEmptyRoutine: isEmptyRoutine,
    ensureExerciseId: ensureExerciseId,
    routineToCsv: routineToCsv,
    csvToRoutine: csvToRoutine,
    looksLikeRoutineCsv: looksLikeRoutineCsv,
    routineToJson: routineToJson,
    jsonToRoutine: jsonToRoutine,
    routineToMarkdown: routineToMarkdown,
    weeklySets: weeklySets,
    fileBaseName: fileBaseName,
  };

  if (typeof module !== "undefined" && module.exports) {
    module.exports = global.FT_MODEL;
  }
})(typeof window !== "undefined" ? window : globalThis);
