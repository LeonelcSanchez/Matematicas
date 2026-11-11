const VAR_NAMES = ['p', 'q', 'r'];
const SET_NAMES = ['A', 'B', 'C'];

function escapeHtml(s) {
    return String(s).replace(/[&<>"']/g, c => ({
        '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
    }[c]));
}

// Normalizar texto para comparar si dos proposiciones dicen lo mismo
function limpiarComparacion(texto) {
    return texto
        .toLowerCase()
        .normalize('NFD').replace(/[̀-ͯ]/g, '')
        .replace(/[.,;:¡!¿?]/g, '')
        .replace(/\b(el|la|los|las|un|una)\b/g, '')
        .replace(/\s+/g, ' ')
        .trim();
}

function limpiarBordes(t) {
    return t.trim().replace(/^[,;]+|[,;]+$/g, '').trim();
}

function capitalizar(t) {
    return t.charAt(0).toUpperCase() + t.slice(1);
}

/* ------------------------------------------------------------------
   ÁRBOL LÓGICO (AST)
   { t:'var', v:'p' } | { t:'not', a } | { t:'and'|'or', args:[...] }
   { t:'xor'|'imp'|'iff', a, b }
------------------------------------------------------------------- */

// Fórmula lógica en texto: (p ∧ ¬q) → r
function aLogica(n, top = false) {
    const envolver = s => (top ? s : `(${s})`);
    switch (n.t) {
        case 'var': return n.v;
        case 'not': return '¬' + aLogica(n.a);
        case 'and': return envolver(n.args.map(x => aLogica(x)).join(' ∧ '));
        case 'or': return envolver(n.args.map(x => aLogica(x)).join(' ∨ '));
        case 'xor': return envolver(`${aLogica(n.a)} ⊕ ${aLogica(n.b)}`);
        case 'imp': return envolver(`${aLogica(n.a)} → ${aLogica(n.b)}`);
        case 'iff': return envolver(`${aLogica(n.a)} ↔ ${aLogica(n.b)}`);
    }
}

// Operación de conjuntos equivalente: (A ∩ Bᶜ)ᶜ ∪ C
function aConjuntos(n, top = false) {
    const envolver = s => (top ? s : `(${s})`);
    const letra = v => SET_NAMES[VAR_NAMES.indexOf(v)];
    const complemento = x => {
        if (x.t === 'var') return letra(x.v) + 'ᶜ';
        if (x.t === 'not') return aConjuntos(x.a);
        return `(${aConjuntos(x, true)})ᶜ`;
    };
    switch (n.t) {
        case 'var': return letra(n.v);
        case 'not': return complemento(n.a);
        case 'and': return envolver(n.args.map(x => aConjuntos(x)).join(' ∩ '));
        case 'or': return envolver(n.args.map(x => aConjuntos(x)).join(' ∪ '));
        case 'xor': return envolver(`${aConjuntos(n.a)} Δ ${aConjuntos(n.b)}`);
        case 'imp': return envolver(`${complemento(n.a)} ∪ ${aConjuntos(n.b)}`);
        case 'iff': return `(${aConjuntos(n.a)} Δ ${aConjuntos(n.b)})ᶜ`;
    }
}

// Evaluación booleana directa sobre el árbol (sin eval ni Function)
function evaluar(n, env) {
    switch (n.t) {
        case 'var': return !!env[n.v];
        case 'not': return !evaluar(n.a, env);
        case 'and': return n.args.every(x => evaluar(x, env));
        case 'or': return n.args.some(x => evaluar(x, env));
        case 'xor': return evaluar(n.a, env) !== evaluar(n.b, env);
        case 'imp': return !evaluar(n.a, env) || evaluar(n.b, env);
        case 'iff': return evaluar(n.a, env) === evaluar(n.b, env);
    }
}

/* ------------------------------------------------------------------
   1. PARSER DE LENGUAJE NATURAL
------------------------------------------------------------------- */
function analizarTextoNatural(oracionOriginal) {
    const texto = oracionOriginal.trim().replace(/[.!]+$/, '');
    const conectores = [];
    const proposiciones = []; // [{ variable:'p', conjunto:'A', texto:'...' }]

    const agregarConector = (palabra, simbolo, tipo) => {
        if (!conectores.some(c => c.palabra === palabra && c.simbolo === simbolo)) {
            conectores.push({ palabra, simbolo, tipo });
        }
    };
    const conn = t => `<span class="hl-conn">${t}</span>`;

    // Oración atómica: reutiliza la variable si ya apareció
    function atomo(fragmento) {
        const limpio = limpiarBordes(fragmento);
        if (!limpio) throw new Error('Falta una proposición junto a un conector.');
        const clave = limpiarComparacion(limpio);
        let p = proposiciones.find(x => limpiarComparacion(x.texto) === clave);
        if (!p) {
            if (proposiciones.length >= VAR_NAMES.length) {
                throw new Error('Se detectaron más de 3 proposiciones distintas. Esta herramienta admite hasta 3 (p, q, r).');
            }
            const i = proposiciones.length;
            p = { variable: VAR_NAMES[i], conjunto: SET_NAMES[i], texto: capitalizar(limpio) };
            proposiciones.push(p);
        }
        return {
            nodo: { t: 'var', v: p.variable },
            html: `<span class="hl-prop">${escapeHtml(p.texto)} [${p.variable}]</span>`
        };
    }

    // Negación ("no ...", "nunca ...", "el motor no arranca", "no es cierto que ...")
    function literal(fragmento) {
        const f = limpiarBordes(fragmento);

        let m = f.match(/^(?:no es cierto que|no ocurre que|no se da que|es falso que)\s+(.+)$/i);
        if (m) {
            agregarConector('no es cierto que', '¬', 'Negación / Complemento');
            const r = compuesto(m[1]);
            return { nodo: { t: 'not', a: r.nodo }, html: `${conn('no es cierto que')} ${r.html}` };
        }

        let textoAtomo = null;
        m = f.match(/^(?:nunca|no)\s+(.+)$/i);
        if (m) {
            textoAtomo = m[1];
        } else {
            m = f.match(/^(.+?)\s+no\s+(.+)$/i);
            if (m) textoAtomo = `${m[1]} ${m[2]}`;
        }
        if (textoAtomo !== null) {
            agregarConector('no', '¬', 'Negación / Complemento');
            const r = atomo(textoAtomo);
            return { nodo: { t: 'not', a: r.nodo }, html: `${conn('no')} ${r.html}` };
        }
        return atomo(f);
    }

    // Conjunción (mayor precedencia que la disyunción)
    function conjuncion(b) {
        const partes = b.split(/\s+(?:y|e|pero|además|ademas)\s+/i);
        if (partes.length === 1) return literal(b);
        agregarConector('y / pero', '∧', 'Conjunción / Intersección (∩)');
        const r = partes.map(literal);
        return {
            nodo: { t: 'and', args: r.map(x => x.nodo) },
            html: r.map(x => x.html).join(` ${conn('y')} `)
        };
    }

    // Disyunción inclusiva / exclusiva
    function compuesto(bloque) {
        let b = limpiarBordes(bloque);
        b = b.replace(/,\s*(?=(?:y|e|o|u|pero)\s)/gi, ' ');

        if (/^(?:no es cierto que|no ocurre que|no se da que|es falso que)\s/i.test(b)) {
            return literal(b);
        }

        const m = b.match(/^o bien\s+(.+?)\s+o\s+(?:bien\s+)?(.+)$/i)
            || b.match(/^(.+?)\s+o bien\s+(.+)$/i);
        if (m) {
            agregarConector('o bien... o', '⊕', 'Disyunción Exclusiva / Dif. Simétrica (Δ)');
            const izq = conjuncion(m[1]);
            const der = conjuncion(m[2]);
            return {
                nodo: { t: 'xor', a: izq.nodo, b: der.nodo },
                html: `${conn('o bien')} ${izq.html} ${conn('o')} ${der.html}`
            };
        }

        const partes = b.split(/\s+(?:o|u)\s+/i);
        if (partes.length > 1) {
            agregarConector('o', '∨', 'Disyunción / Unión (∪)');
            const r = partes.map(conjuncion);
            return {
                nodo: { t: 'or', args: r.map(x => x.nodo) },
                html: r.map(x => x.html).join(` ${conn('o')} `)
            };
        }
        return conjuncion(b);
    }

    let r = null;
    let m;

    // Bicondicional
    m = texto.match(/^(.+?)\s+(?:si y s[oó]lo si|si y solamente si)\s+(.+)$/i);
    if (m) {
        agregarConector('si y solo si', '↔', 'Bicondicional / Igualdad de Conjuntos');
        const izq = compuesto(m[1]);
        const der = compuesto(m[2]);
        r = {
            nodo: { t: 'iff', a: izq.nodo, b: der.nodo },
            html: `${izq.html} ${conn('si y solo si')} ${der.html}`
        };
    }

    // Condicional "Si ..., entonces ..." o "Si ..., ..."
    if (!r && /^si\s/i.test(texto)) {
        m = texto.match(/^si\s+(.+?),?\s+entonces\s+(.+)$/i) || texto.match(/^si\s+(.+?),\s*(.+)$/i);
        if (m) {
            agregarConector('Si... entonces', '→', 'Condicional / Inclusión (Aᶜ ∪ B)');
            const ant = compuesto(m[1]);
            const con = compuesto(m[2]);
            r = {
                nodo: { t: 'imp', a: ant.nodo, b: con.nodo },
                html: `${conn('Si')} ${ant.html}, ${conn('entonces')} ${con.html}`
            };
        }
    }

    // "... entonces ..." / "... por lo tanto ..." / "... implica que ..."
    if (!r) {
        m = texto.match(/^(.+?)\s+(?:entonces|por lo tanto|implica que)\s+(.+)$/i);
        if (m) {
            agregarConector('entonces / por lo tanto', '→', 'Condicional / Inclusión (Aᶜ ∪ B)');
            const ant = compuesto(m[1]);
            const con = compuesto(m[2]);
            r = {
                nodo: { t: 'imp', a: ant.nodo, b: con.nodo },
                html: `${ant.html} ${conn('entonces')} ${con.html}`
            };
        }
    }

    if (!r) r = compuesto(texto);

    return {
        nodo: r.nodo,
        formulaSimbolica: aLogica(r.nodo, true),
        formulaConjuntos: aConjuntos(r.nodo, true),
        htmlResaltado: r.html,
        proposiciones,
        conectores
    };
}

/* ------------------------------------------------------------------
   2. EJECUCIÓN PRINCIPAL Y RENDERIZADO
------------------------------------------------------------------- */
function typesetearMath() {
    try {
        if (window.MathJax && typeof window.MathJax.typesetPromise === 'function') {
            window.MathJax.typesetPromise();
        } else if (typeof window.renderMathInElement === 'function') {
            window.renderMathInElement(document.body);
        }
    } catch (e) { /* sin librería matemática: se muestra texto plano */ }
}

function mostrarError(mensaje) {
    document.getElementById('highlighted-text').innerHTML =
        `<span style="color:#f87171;">⚠ ${escapeHtml(mensaje)}</span>`;
    document.getElementById('connectors-list').innerHTML = '';
    document.getElementById('propositions-dict').innerHTML = '';
    document.getElementById('symbolic-formula').textContent = '—';
    document.getElementById('set-formula').textContent = '—';
    document.getElementById('truth-table').innerHTML = '';
    document.getElementById('logic-classification').innerHTML = '';
    document.getElementById('sets-explanation').innerHTML = '';
    document.getElementById('sets-elements-output').innerHTML = '';
    const canvas = document.getElementById('vennCanvas');
    canvas.getContext('2d').clearRect(0, 0, canvas.width, canvas.height);
}

function procesarProblemaCompleto() {
    const textoUsuario = document.getElementById('natural-text').value;
    if (!textoUsuario.trim()) return;

    let analisis;
    try {
        analisis = analizarTextoNatural(textoUsuario);
    } catch (err) {
        mostrarError(err.message);
        return;
    }
    const { nodo, formulaSimbolica, formulaConjuntos, htmlResaltado, proposiciones, conectores } = analisis;

    document.getElementById('highlighted-text').innerHTML = htmlResaltado;

    const connDiv = document.getElementById('connectors-list');
    connDiv.innerHTML = conectores.length > 0
        ? conectores.map(c =>
            `<span class="conn-tag"><strong>"${escapeHtml(c.palabra)}"</strong> → <code>${c.simbolo}</code> (${escapeHtml(c.tipo)})</span>`
        ).join('')
        : `<span class="conn-tag">Proposición simple sin conectores compuestos</span>`;

    document.getElementById('propositions-dict').innerHTML = proposiciones.map(p => `
        <div class="dict-item">
            <strong>${p.variable} (Conjunto ${p.conjunto}):</strong> "${escapeHtml(p.texto)}"
        </div>
    `).join('');

    document.getElementById('symbolic-formula').textContent = formulaSimbolica;
    document.getElementById('set-formula').textContent = formulaConjuntos;

    // Tabla de verdad
    const cantVars = proposiciones.length;
    const totalFilas = Math.pow(2, cantVars);
    const filas = [];
    let verdaderos = 0;

    const universoEl = document.getElementById('universe-input');
    const elementosU = (universoEl ? universoEl.value : '')
        .split(',')
        .map(s => s.trim())
        .filter(Boolean);

    const setA = [], setB = [], setC = [], setSolucion = [];

    for (let i = totalFilas - 1; i >= 0; i--) {
        const idxCaso = totalFilas - 1 - i;
        const nombreElemento = elementosU[idxCaso] || `Elemento ${idxCaso + 1}`;

        const vP = Boolean((i >> (cantVars - 1)) & 1);
        const vQ = cantVars >= 2 ? Boolean((i >> (cantVars - 2)) & 1) : false;
        const vR = cantVars >= 3 ? Boolean((i >> (cantVars - 3)) & 1) : false;

        if (vP) setA.push(nombreElemento);
        if (cantVars >= 2 && vQ) setB.push(nombreElemento);
        if (cantVars >= 3 && vR) setC.push(nombreElemento);

        const resultado = evaluar(nodo, { p: vP, q: vQ, r: vR });
        if (resultado) {
            verdaderos++;
            setSolucion.push(nombreElemento);
        }
        filas.push({ vP, vQ, vR, resultado, elemento: nombreElemento });
    }

    renderizarTabla(proposiciones, formulaSimbolica, filas, verdaderos, totalFilas);
    renderizarResumenConjuntos(proposiciones, formulaConjuntos, setA, setB, setC, setSolucion);
    dibujarVenn(nodo, cantVars);
    typesetearMath();
}

function renderizarTabla(proposiciones, formula, filas, verdaderos, total) {
    let tipo = 'CONTINGENCIA (El enunciado es verdadero en algunos escenarios y falso en otros)';
    let clase = '';
    if (verdaderos === total) {
        tipo = 'TAUTOLOGÍA (El enunciado es siempre Verdadero; equivale al Universo U)';
        clase = 'val-v';
    } else if (verdaderos === 0) {
        tipo = 'CONTRADICCIÓN (El enunciado es siempre Falso; equivale al Conjunto Vacío ∅)';
        clase = 'val-f';
    }

    const potencias = ['⁰', '¹', '²', '³'];
    document.getElementById('logic-classification').innerHTML = `
        <div><strong>Clasificación:</strong> <span class="${clase}">${tipo}</span></div>
        <div><strong>Casos favorables:</strong> ${verdaderos} de ${total} combinaciones posibles (2${potencias[proposiciones.length]}).</div>
    `;

    const headers = `<th>Escenario (U)</th>` +
        proposiciones.map(p => `<th title="${escapeHtml(p.texto)}">${p.variable} (${p.conjunto})</th>`).join('') +
        `<th class="result-col">${escapeHtml(formula)}</th>`;

    const rowsHtml = filas.map(f => {
        let cols = `<td><small>${escapeHtml(f.elemento)}</small></td>`;
        cols += `<td class="${f.vP ? 'val-v' : 'val-f'}">${f.vP ? 'V' : 'F'}</td>`;
        if (proposiciones.length >= 2) {
            cols += `<td class="${f.vQ ? 'val-v' : 'val-f'}">${f.vQ ? 'V' : 'F'}</td>`;
        }
        if (proposiciones.length >= 3) {
            cols += `<td class="${f.vR ? 'val-v' : 'val-f'}">${f.vR ? 'V' : 'F'}</td>`;
        }
        cols += `<td class="result-col ${f.resultado ? 'val-v' : 'val-f'}">${f.resultado ? 'V' : 'F'}</td>`;
        return `<tr>${cols}</tr>`;
    }).join('');

    document.getElementById('truth-table').innerHTML =
        `<thead><tr>${headers}</tr></thead><tbody>${rowsHtml}</tbody>`;
}

function renderizarResumenConjuntos(proposiciones, exprConjuntos, setA, setB, setC, setSolucion) {
    document.getElementById('sets-explanation').innerHTML = `
        <div><strong>Operación de Conjuntos:</strong> <code>S = ${escapeHtml(exprConjuntos)}</code></div>
        <div>Cada proposición verdadera equivale a pertenecer al conjunto asociado (p ↔ x ∈ A).</div>
    `;

    const lista = arr => escapeHtml(arr.join(', ') || '∅');
    let detalle = `<div><strong>Conjunto A (${proposiciones[0].variable}):</strong> { ${lista(setA)} }</div>`;
    if (proposiciones.length >= 2) {
        detalle += `<div><strong>Conjunto B (${proposiciones[1].variable}):</strong> { ${lista(setB)} }</div>`;
    }
    if (proposiciones.length >= 3) {
        detalle += `<div><strong>Conjunto C (${proposiciones[2].variable}):</strong> { ${lista(setC)} }</div>`;
    }
    detalle += `<div style="margin-top:0.6rem; color:#38bdf8;"><strong>Conjunto Solución Final (S):</strong> { ${lista(setSolucion)} } (Cardinalidad |S| = ${setSolucion.length})</div>`;

    document.getElementById('sets-elements-output').innerHTML = detalle;
}

function dibujarVenn(nodo, cantVars) {
    const canvas = document.getElementById('vennCanvas');
    const ctx = canvas.getContext('2d');
    const W = canvas.width;
    const H = canvas.height;

    ctx.clearRect(0, 0, W, H);

    // Geometría escalada al tamaño real del canvas
    const s = Math.min(W / 440, H / 330);
    const cx = W / 2;
    const cy = H / 2;
    let r, cA, cB, cC;
    if (cantVars === 3) {
        r = 80 * s;
        cA = { x: cx - 50 * s, y: cy - 35 * s };
        cB = { x: cx + 50 * s, y: cy - 35 * s };
        cC = { x: cx, y: cy + 50 * s };
    } else if (cantVars === 2) {
        r = 90 * s;
        cA = { x: cx - 50 * s, y: cy };
        cB = { x: cx + 50 * s, y: cy };
    } else {
        r = 90 * s;
        cA = { x: cx, y: cy };
    }

    // Tabla de verdad precalculada (8 combinaciones) en vez de evaluar por cada píxel
    const tabla = [];
    for (let k = 0; k < 8; k++) {
        tabla[k] = evaluar(nodo, { p: !!(k & 4), q: !!(k & 2), r: !!(k & 1) });
    }

    const imgData = ctx.createImageData(W, H);
    const data = imgData.data;

    for (let y = 10; y < H - 10; y++) {
        for (let x = 10; x < W - 10; x++) {
            const inA = Math.hypot(x - cA.x, y - cA.y) <= r;
            const inB = cantVars >= 2 ? Math.hypot(x - cB.x, y - cB.y) <= r : false;
            const inC = cantVars >= 3 ? Math.hypot(x - cC.x, y - cC.y) <= r : false;

            const cumple = tabla[(inA ? 4 : 0) | (inB ? 2 : 0) | (inC ? 1 : 0)];
            const idx = (y * W + x) * 4;

            if (cumple) {
                data[idx] = 56; data[idx + 1] = 189; data[idx + 2] = 248; data[idx + 3] = 120;
            } else {
                data[idx] = 15; data[idx + 1] = 23; data[idx + 2] = 42; data[idx + 3] = 255;
            }
        }
    }
    ctx.putImageData(imgData, 0, 0);

    // Marco Universo U
    ctx.strokeStyle = '#475569';
    ctx.lineWidth = 2;
    ctx.strokeRect(10, 10, W - 20, H - 20);
    ctx.fillStyle = '#94a3b8';
    ctx.font = 'bold 14px Segoe UI, sans-serif';
    ctx.fillText('Universo U', 22, 30);

    const trazarCirculo = (c, texto, tx, ty) => {
        ctx.strokeStyle = '#f8fafc';
        ctx.lineWidth = 2.5;
        ctx.beginPath();
        ctx.arc(c.x, c.y, r, 0, Math.PI * 2);
        ctx.stroke();
        ctx.fillStyle = '#f8fafc';
        ctx.font = 'bold 14px Segoe UI, sans-serif';
        ctx.fillText(texto, tx, ty);
    };

    trazarCirculo(cA, 'A (p)', cA.x - 45 * s, cA.y - r + 24 * s);
    if (cantVars >= 2) trazarCirculo(cB, 'B (q)', cB.x + 15 * s, cB.y - r + 24 * s);
    if (cantVars >= 3) trazarCirculo(cC, 'C (r)', cC.x - 18 * s, cC.y + r - 12 * s);
}

/* ------------------------------------------------------------------
   3. EVENTOS DE LA INTERFAZ
------------------------------------------------------------------- */
if (typeof document !== 'undefined') {
    document.addEventListener('DOMContentLoaded', () => {
        const ids = ['natural-text', 'universe-input', 'btn-analyze', 'highlighted-text',
            'connectors-list', 'propositions-dict', 'symbolic-formula', 'set-formula',
            'truth-table', 'logic-classification', 'sets-explanation',
            'sets-elements-output', 'vennCanvas'];
        const faltan = ids.filter(id => !document.getElementById(id));
        if (faltan.length) {
            console.error('visual.js: faltan estos id en el HTML:', faltan.join(', '));
            return;
        }

        document.getElementById('btn-analyze').addEventListener('click', procesarProblemaCompleto);

        document.querySelectorAll('.preset-btn').forEach(btn => {
            btn.addEventListener('click', () => {
                document.getElementById('natural;
            const bDer = evaluarSinParen(der) === 'true';
            return (bIzq === bDer) ? 'true' : 'false';
        }
        if (bloque.includes('→')) {
            const [izq, der] = bloque.split('→');
            const bIzq = evaluarSinParen(izq) === 'true';
            const bDer = evaluarSinParen(der) === 'true';
            return (!bIzq || bDer) ? 'true' : 'false';
        }
        const res = Function(`"use strict"; return Boolean(${bloque});`)();
        return res ? 'true' : 'false';
    }

    return resolverBloques(expr) === 'true';
}

// 4. EJECUCIÓN PRINCIPAL Y RENDERIZADO
function procesarProblemaCompleto() {
    const textoUsuario = document.getElementById('natural-text').value;
    if (!textoUsuario.trim()) return;

    const analisis = analizarTextoNatural(textoUsuario);
    const { formulaSimbolica, htmlResaltado, proposiciones, conectores } = analisis;

    // Mostrar texto resaltado y etiquetas de conectores
    document.getElementById('highlighted-text').innerHTML = htmlResaltado;

    const connDiv = document.getElementById('connectors-list');
    if (conectores.length > 0) {
        connDiv.innerHTML = conectores.map(c =>
            `<span class="conn-tag"><strong>"${c.palabra}"</strong> → <code>${c.simbolo}</code> (${c.tipo})</span>`
        ).join('');
    } else {
        connDiv.innerHTML = `<span class="conn-tag">Proposición simple sin conectores compuestos</span>`;
    }

    // Mostrar diccionario de proposiciones y su equivalente en conjuntos
    const dictDiv = document.getElementById('propositions-dict');
    dictDiv.innerHTML = proposiciones.map(p => `
        <div class="dict-item">
            <strong>${p.variable} (Conjunto ${p.conjunto}):</strong> "${p.texto}"
        </div>
    `).join('');

    // Mostrar fórmulas
    const exprConjuntos = traducirFormulaAConjuntos(formulaSimbolica);
    document.getElementById('symbolic-formula').textContent = formulaSimbolica;
    document.getElementById('set-formula').textContent = exprConjuntos;

    // Construir Tabla de Verdad
    const cantVars = proposiciones.length;
    const totalFilas = Math.pow(2, cantVars);
    const filas = [];
    let verdaderos = 0;

    // Elementos del Universo ingresados por el usuario
    const elementosU = document.getElementById('universe-input').value
        .split(',')
        .map(s => s.trim())
        .filter(Boolean);

    const setA = [], setB = [], setC = [], setSolucion = [];

    for (let i = totalFilas - 1; i >= 0; i--) {
        const idxCaso = totalFilas - 1 - i;
        const nombreElemento = elementosU[idxCaso] || `Elemento ${idxCaso + 1}`;

        const vP = Boolean((i >> (cantVars - 1)) & 1);
        const vQ = cantVars >= 2 ? Boolean((i >> (cantVars - 2)) & 1) : false;
        const vR = cantVars >= 3 ? Boolean((i >> (cantVars - 3)) & 1) : false;

        if (vP) setA.push(nombreElemento);
        if (cantVars >= 2 && vQ) setB.push(nombreElemento);
        if (cantVars >= 3 && vR) setC.push(nombreElemento);

        const resultado = evaluarExpresion(formulaSimbolica, vP, vQ, vR);
        if (resultado) {
            verdaderos++;
            setSolucion.push(nombreElemento);
        }

        filas.push({ vP, vQ, vR, resultado, elemento: nombreElemento });
    }

    renderizarTabla(proposiciones, formulaSimbolica, filas, verdaderos, totalFilas);
    renderizarResumenConjuntos(proposiciones, exprConjuntos, setA, setB, setC, setSolucion, totalFilas);
    dibujarVenn(formulaSimbolica, cantVars);
}

function renderizarTabla(proposiciones, formula, filas, verdaderos, total) {
    let tipo = 'CONTINGENCIA (El enunciado es verdadero en algunos escenarios y falso en otros)';
    let clase = '';
    if (verdaderos === total) {
        tipo = 'TAUTOLOGÍA (El enunciado es siempre Verdadero; equivale al Universo U)';
        clase = 'val-v';
    } else if (verdaderos === 0) {
        tipo = 'CONTRADICCIÓN (El enunciado es siempre Falso; equivale al Conjunto Vacío ∅)';
        clase = 'val-f';
    }

    document.getElementById('logic-classification').innerHTML = `
        <div><strong>Clasificación:</strong> <span class="${clase}">${tipo}</span></div>
        <div><strong>Casos favorables:</strong> ${verdaderos} de ${total} combinaciones posibles ($2^{${proposiciones.length}}$).</div>
    `;

    const headers = `<th>Escenario ($U$)</th>` +
        proposiciones.map(p => `<th title="${p.texto}">${p.variable} (${p.conjunto})</th>`).join('') +
        `<th class="result-col">${formula}</th>`;

    const rowsHtml = filas.map(f => {
        let cols = `<td><small>${f.elemento}</small></td>`;
        cols += `<td class="${f.vP ? 'val-v' : 'val-f'}">${f.vP ? 'V' : 'F'}</td>`;
        if (proposiciones.length >= 2) {
            cols += `<td class="${f.vQ ? 'val-v' : 'val-f'}">${f.vQ ? 'V' : 'F'}</td>`;
        }
        if (proposiciones.length >= 3) {
            cols += `<td class="${f.vR ? 'val-v' : 'val-f'}">${f.vR ? 'V' : 'F'}</td>`;
        }
        cols += `<td class="result-col ${f.resultado ? 'val-v' : 'val-f'}">${f.resultado ? 'V' : 'F'}</td>`;
        return `<tr>${cols}</tr>`;
    }).join('');

    document.getElementById('truth-table').innerHTML = `<thead><tr>${headers}</tr></thead><tbody>${rowsHtml}</tbody>`;
}

function renderizarResumenConjuntos(proposiciones, exprConjuntos, setA, setB, setC, setSolucion, total) {
    document.getElementById('sets-explanation').innerHTML = `
        <div><strong>Operación de Conjuntos:</strong> <code>S = ${exprConjuntos}</code></div>
        <div>Cada proposición verdadera equivale a pertenecer al conjunto asociado ($p \\leftrightarrow x \\in A$).</div>
    `;

    let detalle = `<div><strong>Conjunto $A$ (${proposiciones[0].variable}):</strong> { ${setA.join(', ') || '∅'} }</div>`;
    if (proposiciones.length >= 2) {
        detalle += `<div><strong>Conjunto $B$ (${proposiciones[1].variable}):</strong> { ${setB.join(', ') || '∅'} }</div>`;
    }
    if (proposiciones.length >= 3) {
        detalle += `<div><strong>Conjunto $C$ (${proposiciones[2].variable}):</strong> { ${setC.join(', ') || '∅'} }</div>`;
    }
    detalle += `<div style="margin-top:0.6rem; color:#38bdf8;"><strong>Conjunto Solución Final ($S$):</strong> { ${setSolucion.join(', ') || '∅'} } (Cardinalidad $|S| = ${setSolucion.length}$)</div>`;

    document.getElementById('sets-elements-output').innerHTML = detalle;
}

function dibujarVenn(formula, cantVars) {
    const canvas = document.getElementById('vennCanvas');
    const ctx = canvas.getContext('2d');
    const W = canvas.width;
    const H = canvas.height;

    ctx.clearRect(0, 0, W, H);

    const r = cantVars === 3 ? 80 : 90;
    const cA = { x: cantVars === 1 ? 220 : 170, y: cantVars === 3 ? 130 : 165 };
    const cB = { x: 270, y: cantVars === 3 ? 130 : 165 };
    const cC = { x: 220, y: 215 };

    const imgData = ctx.createImageData(W, H);
    const data = imgData.data;

    for (let y = 10; y < H - 10; y++) {
        for (let x = 10; x < W - 10; x++) {
            const inA = Math.hypot(x - cA.x, y - cA.y) <= r;
            const inB = cantVars >= 2 ? (Math.hypot(x - cB.x, y - cB.y) <= r) : false;
            const inC = cantVars >= 3 ? (Math.hypot(x - cC.x, y - cC.y) <= r) : false;

            const cumple = evaluarExpresion(formula, inA, inB, inC);
            const idx = (y * W + x) * 4;

            if (cumple) {
                data[idx] = 56;
                data[idx + 1] = 189;
                data[idx + 2] = 248;
                data[idx + 3] = 120;
            } else {
                data[idx] = 15;
                data[idx + 1] = 23;
                data[idx + 2] = 42;
                data[idx + 3] = 255;
            }
        }
    }
    ctx.putImageData(imgData, 0, 0);

    // Marco Universo U
    ctx.strokeStyle = '#475569';
    ctx.lineWidth = 2;
    ctx.strokeRect(10, 10, W - 20, H - 20);
    ctx.fillStyle = '#94a3b8';
    ctx.font = 'bold 14px Segoe UI';
    ctx.fillText('Universo U', 22, 30);

    const trazarCirculo = (c, texto, tx, ty) => {
        ctx.strokeStyle = '#f8fafc';
        ctx.lineWidth = 2.5;
        ctx.beginPath();
        ctx.arc(c.x, c.y, r, 0, Math.PI * 2);
        ctx.stroke();
        ctx.fillStyle = '#f8fafc';
        ctx.font = 'bold 14px Segoe UI';
        ctx.fillText(texto, tx, ty);
    };

    trazarCirculo(cA, 'A (p)', cA.x - 45, cA.y - r + 24);
    if (cantVars >= 2) trazarCirculo(cB, 'B (q)', cB.x + 15, cB.y - r + 24);
    if (cantVars >= 3) trazarCirculo(cC, 'C (r)', cC.x - 18, cC.y + r - 12);
}

// Eventos de la interfaz
document.addEventListener('DOMContentLoaded', () => {
    document.getElementById('btn-analyze').addEventListener('click', procesarProblemaCompleto);

    document.querySelectorAll('.preset-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            document.getElementById('natural-text').value = btn.getAttribute('data-text');
            procesarProblemaCompleto();
        });
    });

    procesarProblemaCompleto();
});
DiagramaVenn(formula, usaR, U, A, B, C) {
    const canvas = document.getElementById('vennCanvas');
    const ctx = canvas.getContext('2d');
    const W = canvas.width;
    const H = canvas.height;

    ctx.clearRect(0, 0, W, H);

    // Definir geometría de los círculos
    const r = usaR ? 78 : 88;
    const cA = { x: usaR ? 165 : 160, y: usaR ? 130 : 160 };
    const cB = { x: usaR ? 255 : 260, y: usaR ? 130 : 160 };
    const cC = { x: 210, y: 210 };

    // 1. Pintar cada región según el valor de verdad de (p, q, r)
    const imgData = ctx.createImageData(W, H);
    const data = imgData.data;

    for (let y = 10; y < H - 10; y++) {
        for (let x = 10; x < W - 10; x++) {
            const inA = Math.hypot(x - cA.x, y - cA.y) <= r;
            const inB = Math.hypot(x - cB.x, y - cB.y) <= r;
            const inC = usaR ? (Math.hypot(x - cC.x, y - cC.y) <= r) : false;

            const esVerdadero = evaluarFormula(formula, inA, inB, inC);
            const idx = (y * W + x) * 4;

            if (esVerdadero) {
                // Azul celeste translúcido para regiones Verdaderas
                data[idx] = 56;
                data[idx + 1] = 189;
                data[idx + 2] = 248;
                data[idx + 3] = 115;
            } else {
                // Fondo oscuro del Universo
                data[idx] = 15;
                data[idx + 1] = 23;
                data[idx + 2] = 42;
                data[idx + 3] = 255;
            }
        }
    }
    ctx.putImageData(imgData, 0, 0);

    // Marco del Universo U
    ctx.strokeStyle = '#475569';
    ctx.lineWidth = 2;
    ctx.strokeRect(10, 10, W - 20, H - 20);
    ctx.fillStyle = '#94a3b8';
    ctx.font = 'bold 14px Segoe UI';
    ctx.fillText('U', 22, 30);

    // Contornos de los círculos
    const dibujarCirculo = (c, color, etiqueta, lx, ly) => {
        ctx.strokeStyle = color;
        ctx.lineWidth = 2.5;
        ctx.beginPath();
        ctx.arc(c.x, c.y, r, 0, Math.PI * 2);
        ctx.stroke();

        ctx.fillStyle = '#f8fafc';
        ctx.font = 'bold 14px Segoe UI';
        ctx.fillText(etiqueta, lx, ly);
    };

    dibujarCirculo(cA, '#f8fafc', 'A (p)', cA.x - 55, cA.y - r + 22);
    dibujarCirculo(cB, '#f8fafc', 'B (q)', cB.x + 20, cB.y - r + 22);
    if (usaR) {
        dibujarCirculo(cC, '#f8fafc', 'C (r)', cC.x - 18, cC.y + r - 12);
    }
}

// Eventos de teclado virtual y botones
document.addEventListener('DOMContentLoaded', () => {
    const inputFormula = document.getElementById('formula-input');

    document.querySelectorAll('.key-btn:not(.clear)').forEach(btn => {
        btn.addEventListener('click', () => {
            const val = btn.getAttribute('data-val');
            const start = inputFormula.selectionStart;
            const end = inputFormula.selectionEnd;
            const text = inputFormula.value;
            inputFormula.value = text.substring(0, start) + val + text.substring(end);
            inputFormula.focus();
            inputFormula.selectionStart = inputFormula.selectionEnd = start + val.length;
        });
    });

    document.getElementById('btn-clear').addEventListener('click', () => {
        inputFormula.value = '';
        inputFormula.focus();
    });

    document.querySelectorAll('.preset-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            inputFormula.value = btn.getAttribute('data-formula');
            resolverTodo();
        });
    });

    document.getElementById('btn-solve').addEventListener('click', resolverTodo);

    // Resolver el ejemplo por defecto al cargar la página
    resolverTodo();
});
                  
