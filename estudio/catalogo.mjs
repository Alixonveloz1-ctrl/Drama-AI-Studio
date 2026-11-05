// ════════════════════════════════════════════════════════════════
// CATÁLOGO CREATIVO — íntegro, como pidió el dueño (sección 5).
//
// Los 17 géneros y los 23 subgéneros del estudio de anime se conservan tal
// cual (mismos valores y etiquetas), y se añaden los 4 géneros propios del
// formato drama. No falta ninguno; una prueba lo vigila. En lugar de las
// demografías del anime, el drama usa 4 públicos (decisión del dueño).
// El formulario de la Historia (fase 2) se construye a partir de aquí.
// ════════════════════════════════════════════════════════════════

// Público del drama. Sustituye a las 6 demografías del anime (Shōnen, Shōjo…),
// que no encajan en un drama chino semirrealista: el dueño eligió estas cuatro.
export const PUBLICOS = [
  { valor: 'masculino', etiqueta: 'Público masculino — Revancha, ascenso de estatus, poder, sistemas y combates' },
  { valor: 'femenino', etiqueta: 'Público femenino — Romance, el jefe poderoso, renacer para cambiar el destino, intriga de palacio' },
  { valor: 'adulto', etiqueta: 'Público adulto — Tramas complejas, dilemas morales y temas duros' },
  { valor: 'familia', etiqueta: 'Para toda la familia — Sin contenido adulto' },
];

export const GENEROS = [
  // Heredados del estudio de anime, tal cual.
  { valor: 'accion', etiqueta: 'Acción — Conflicto físico, peleas, adrenalina' },
  { valor: 'fantasia', etiqueta: 'Fantasía — Magia, criaturas sobrenaturales, sistemas de poder' },
  { valor: 'isekai', etiqueta: 'Isekai — Protagonista transportado/reencarnado a otro mundo' },
  { valor: 'mecha', etiqueta: 'Mecha — Robots gigantes pilotados' },
  { valor: 'romcom', etiqueta: 'Comedia Romántica — Amor con situaciones cómicas' },
  { valor: 'drama', etiqueta: 'Drama — Desarrollo emocional, conflictos tristes' },
  { valor: 'slice_of_life', etiqueta: 'Slice of Life — Vida cotidiana sin grandes conflictos' },
  { valor: 'terror', etiqueta: 'Terror / Horror — Miedo, inquietud, suspenso' },
  { valor: 'psicologico', etiqueta: 'Psicológico — Estado mental, traumas, crisis internas' },
  { valor: 'misterio', etiqueta: 'Misterio — Enigmas, crímenes, secretos ocultos' },
  { valor: 'deportes', etiqueta: 'Deportes (Spokon) — Disciplina, esfuerzo, equipo' },
  { valor: 'sci_fi', etiqueta: 'Ciencia Ficción — Tecnología futura, espacio, IA' },
  { valor: 'aventura', etiqueta: 'Aventura — Exploración, viajes, descubrimientos' },
  { valor: 'sobrenatural', etiqueta: 'Sobrenatural — Poderes ocultos, demonios, espíritus' },
  { valor: 'supervivencia', etiqueta: 'Supervivencia — Lucha por sobrevivir en entornos hostiles' },
  { valor: 'videojuego', etiqueta: 'Videojuego / Sistema — Estadísticas, niveles, habilidades' },
  { valor: 'donghua', etiqueta: 'Donghua / Cultivación — Sistema de qi, sectas, rangos de cultivo' },
  // Nuevos, propios del formato drama.
  { valor: 'transmigracion', etiqueta: 'Transmigración — Despierta en otra época o en otro cuerpo' },
  { valor: 'naufragio', etiqueta: 'Naufragio — Aislamiento, isla desierta, rescate imposible' },
  { valor: 'ascenso_social', etiqueta: 'Ascenso social — De despreciado a respetado' },
  { valor: 'sistema_juego', etiqueta: 'Sistema de niveles — Pantallas, puntos, desbloqueos' },
];

export const SUBGENEROS = [
  { valor: 'psicologico', etiqueta: '🧠 Psicológico' },
  { valor: 'romance', etiqueta: '💕 Romance' },
  { valor: 'ecchi', etiqueta: '🔥 Ecchi' },
  { valor: 'harem', etiqueta: '👑 Harem' },
  { valor: 'harem_inverso', etiqueta: '👸 Harem Inverso' },
  { valor: 'comedia', etiqueta: '😂 Comedia' },
  { valor: 'dark', etiqueta: '🖤 Dark / Oscuro' },
  { valor: 'gore', etiqueta: '💀 Gore / Violento' },
  { valor: 'misterio', etiqueta: '🔍 Misterio' },
  { valor: 'revenge', etiqueta: '⚔️ Revenge' },
  { valor: 'overpowered', etiqueta: '💪 Overpowered' },
  { valor: 'slice_of_life', etiqueta: '☕ Slice of Life' },
  { valor: 'musica', etiqueta: '🎵 Música / Arte' },
  { valor: 'deporte', etiqueta: '⚽ Deporte' },
  { valor: 'mafia', etiqueta: '🎭 Mafia / Crimen' },
  { valor: 'escolar', etiqueta: '🏫 Escolar' },
  { valor: 'militar', etiqueta: '🎖️ Militar' },
  { valor: 'reencarnacion', etiqueta: '♻️ Reencarnación' },
  { valor: 'viaje_tiempo', etiqueta: '⏳ Viaje en el Tiempo' },
  { valor: 'apocalipsis', etiqueta: '☣️ Apocalipsis' },
  { valor: 'idols', etiqueta: '🌟 Idols / Fama' },
  { valor: 'medicina', etiqueta: '🏥 Medicina / Ciencia' },
  { valor: 'sistema_awakening', etiqueta: '⚡ Sistema / Awakening' },
];

export const FORMATOS = [
  { valor: '9:16', etiqueta: '9:16 vertical (TikTok, Reels, microdrama)' },
  { valor: '16:9', etiqueta: '16:9 horizontal (YouTube)' },
];

// Reglas heredadas del estudio de anime que siguen vigentes.
export const SUBGENEROS_ADULTOS = ['ecchi', 'harem', 'harem_inverso', 'gore'];   // no con «Para toda la familia»
export const PARES_EXCLUYENTES = [['harem', 'harem_inverso']];
// Todos los personajes son adultos (18+); con «escolar», el entorno es
// universitario o academia de adultos, nunca secundaria (sección 5.2).
