const VAR_NAMES = ['p', 'q', 'r'];
const SET_NAMES = ['A', 'B', 'C'];

// Normalizar texto para comparar si dos proposiciones dicen lo mismo
function limpiarComparacion(texto) {
    return texto
        .toLowerCase()
        .normalize("NFD").replace(/[\u0300-\u036f]/g, "")
        .replace(/[.,;:¡!¿?]/g, '')
        .replace(/\b(el|la|los|las|un|una)\b/g, '')
        .replace(/\s+/g, ' ')
        .trim();
}

// 1. PARSER DE LENGUAJE NATURAL A FÓRMULA LÓGICA
function analizarTextoNatural(oracionOriginal) {
    let texto = oracionOriginal.trim().replace(/\.$/, '');
    let conectoresDetectados = [];
    let proposicionesMapa = []; // [{ variable: 'p', set: 'A', texto: '...' }]

    // Registra una oración atómica (o reutiliza la variable si ya apareció antes)
    function registrarProposicion(fragmento) {
        let fragLimpio = fragmento.trim().replace(/^[,;]+|[,;]+$/g, '').trim();
        let esNegada = false;

        // Detectar negación dentro del fragmento ("no ...", "nunca ...", "no es cierto que ...")
        const regexNeg = /^(?:no es cierto que\s+|no ocurre que\s+|nunca\s+|no\s+)(.+)$/i;
        const matchNeg = fragLimpio.match(regexNeg);

        if (matchNeg) {
            esNegada = true;
            fragLimpio = matchNeg[1].trim();
        } else if (/\bno\s+/i.test(fragLimpio)) {
            // Caso donde el "no" está entre sujeto y verbo: "el motor no arranca" -> "el motor arranca"
            esNegada = true;
            fragLimpio = fragLimpio.replace(/\bno\s+/i, '').trim();
        }

        if (esNegada) {
            conectoresDetectados.push({ palabra: 'no', simbolo: '¬', tipo: 'Negación / Complemento' });
        }

        const clave = limpiarComparacion(fragLimpio);
        let existente = proposicionesMapa.find(item => limpiarComparacion(item.texto) === clave);

        if (!existente) {
            const idx = Math.min(proposicionesMapa.length, 2); // Máximo p, q, r para graficar Venn 3D
            if (proposicionesMapa.length < 3) {
                existente = {
                    variable: VAR_NAMES[idx],
                    conjunto: SET_NAMES[idx],
                    texto: fragLimpio.charAt(0).toUpperCase() + fragLimpio.slice(1)
                };
                proposicionesMapa.push(existente);
            } else {
                existente = proposicionesMapa[2];
            }
        }

        return {
            simbolo: esNegada ? `¬${existente.variable}` : existente.variable,
            html: esNegada
                ? `<span class="hl-conn">no</span> <span class="hl-prop">${existente.texto} [${existente.variable}]</span>`
                : `<span class="hl-prop">${existente.texto} [${existente.variable}]</span>`
        };
    }

    // Procesar bloque con conjunciones ("y", "pero", "además") y disyunciones ("o", "o bien")
    function parsearBloqueCompuesto(bloque) {
        let b = bloque.trim().replace(/^[,;]+|[,;]+$/g, '').trim();

        // Si hay una coma separando un bloque grande con ", o " o ", y "
        if (/,\s*o\s+/i.test(b)) {
            const partes = b.split(/,\s*o\s+/i);
            conectoresDetectados.push({ palabra: 'o', simbolo: '∨', tipo: 'Disyunción / Unión (∪)' });
            const izq = parsearBloqueCompuesto(partes[0]);
            const der = parsearBloqueCompuesto(partes.slice(1).join(' o '));
            return {
                simbolo: `(${izq.simbolo} ∨ ${der.simbolo})`,
                html: `${izq.html} <span class="hl-conn">o</span> ${der.html}`
            };
        }

        if (/,\s*y\s+/i.test(b)) {
            const partes = b.split(/,\s*y\s+/i);
            conectoresDetectados.push({ palabra: 'y', simbolo: '∧', tipo: 'Conjunción / Intersección (∩)' });
            const izq = parsearBloqueCompuesto(partes[0]);
            const der = parsearBloqueCompuesto(partes.slice(1).join(' y '));
            return {
                simbolo: `(${izq.simbolo} ∧ ${der.simbolo})`,
                html: `${izq.html} <span class="hl-conn">y</span> ${der.html}`
            };
        }

        // Separar por " o bien " (XOR)
        if (/\bo bien\b/i.test(b)) {
            const partes = b.replace(/^o bien\s+/i, '').split(/\bo bien\b|\bo\b/i);
            if (partes.length >= 2) {
                conectoresDetectados.push({ palabra: 'o bien... o', simbolo: '⊕', tipo: 'Disyunción Exclusiva / Dif. Simétrica (Δ)' });
                const izq = registrarProposicion(partes[0]);
                const der = registrarProposicion(partes[1]);
                return {
                    simbolo: `(${izq.simbolo} ⊕ ${der.simbolo})`,
                    html: `<span class="hl-conn">o bien</span> ${izq.html} <span class="hl-conn">o</span> ${der.html}`
                };
            }
        }

        // Separar por " y " / " pero " / " e "
        if (/\s+(?:y|e|pero|además)\s+/i.test(b)) {
            const partes = b.split(/\s+(?:y|e|pero|además)\s+/i);
            conectoresDetectados.push({ palabra: 'y / pero', simbolo: '∧', tipo: 'Conjunción / Intersección (∩)' });
            const procesados = partes.map(p => registrarProposicion(p));
            return {
                simbolo: procesados.length > 1 ? `(${procesados.map(x => x.simbolo).join(' ∧ ')})` : procesados[0].simbolo,
                html: procesados.map(x => x.html).join(' <span class="hl-conn">y</span> ')
            };
        }

        // Separar por " o " / " u "
        if (/\s+(?:o|u)\s+/i.test(b)) {
            const partes = b.split(/\s+(?:o|u)\s+/i);
            conectoresDetectados.push({ palabra: 'o', simbolo: '∨', tipo: 'Disyunción / Unión (∪)' });
            const procesados = partes.map(p => registrarProposicion(p));
            return {
                simbolo: procesados.length > 1 ? `(${procesados.map(x => x.simbolo).join(' ∨ ')})` : procesados[0].simbolo,
                html: procesados.map(x => x.html).join(' <span class="hl-conn">o</span> ')
            };
        }

        return registrarProposicion(b);
    }

    let resultadoFinal;

    // 1. Evaluar estructuras de Bicondicional ("... si y solo si ...")
    const regexBicondicional = /^(.+?)\s+si y s[oó]lo si\s+(.+)$/i;
    // 2. Evaluar estructuras Condicionales ("Si ..., entonces ..." o "Si ..., ...")
    const regexCondicionalExplicito = /^si\s+(.+?)(?:,\s*entonces\s+|\s+entonces\s+|,\s+)(.+)$/i;
    // 3. Evaluar "... implica que ..." / "... por lo tanto ..."
    const regexImplica = /^(.+?)\s+(?:entonces|por lo tanto|implica que)\s+(.+)$/i;

    if (regexBicondicional.test(texto)) {
        const match = texto.match(regexBicondicional);
        conectoresDetectados.push({ palabra: 'si y solo si', simbolo: '↔', tipo: 'Bicondicional / Igualdad de Conjuntos' });
        const izq = parsearBloqueCompuesto(match[1]);
        const der = parsearBloqueCompuesto(match[2]);
        resultadoFinal = {
            simbolo: `${izq.simbolo} ↔ ${der.simbolo}`,
            html: `${izq.html} <span class="hl-conn">si y solo si</span> ${der.html}`
        };
    } else if (regexCondicionalExplicito.test(texto)) {
        const match = texto.match(regexCondicionalExplicito);
        conectoresDetectados.push({ palabra: 'Si... entonces', simbolo: '→', tipo: 'Condicional / Inclusión (Aᶜ ∪ B)' });
        const antecedente = parsearBloqueCompuesto(match[1]);
        const consecuente = parsearBloqueCompuesto(match[2]);
        resultadoFinal = {
            simbolo: `${antecedente.simbolo} → ${consecuente.simbolo}`,
            html: `<span class="hl-conn">Si</span> ${antecedente.html}, <span class="hl-conn">entonces</span> ${consecuente.html}`
        };
    } else if (regexImplica.test(texto)) {
        const match = texto.match(regexImplica);
        conectoresDetectados.push({ palabra: 'entonces / por lo tanto', simbolo: '→', tipo: 'Condicional / Inclusión (Aᶜ ∪ B)' });
        const antecedente = parsearBloqueCompuesto(match[1]);
        const consecuente = parsearBloqueCompuesto(match[2]);
        resultadoFinal = {
            simbolo: `${antecedente.simbolo} → ${consecuente.simbolo}`,
            html: `${antecedente.html} <span class="hl-conn">entonces</span> ${consecuente.html}`
        };
    } else {
        resultadoFinal = parsearBloqueCompuesto(texto);
    }

    return {
        formulaSimbolica: resultadoFinal.simbolo,
        htmlResaltado: resultadoFinal.html,
        proposiciones: proposicionesMapa,
        conectores: conectoresDetectados
    };
}

// 2. TRADUCTOR DE FÓRMULA LÓGICA A OPERACIÓN DE CONJUNTOS
function traducirFormulaAConjuntos(formula) {
    let f = formula
        .replace(/p/g, 'A')
        .replace(/q/g, 'B')
        .replace(/r/g, 'C')
        .replace(/¬([ABC])/g, '$1ᶜ')
        .replace(/∧/g, ' ∩ ')
        .replace(/∨/g, ' ∪ ')
        .replace(/⊕/g, ' Δ ');

    // Si hay implicación X → Y equivale a Xᶜ ∪ Y
    if (f.includes('→')) {
        const partes = f.split('→');
        f = `(${partes[0].trim()})ᶜ ∪ ${partes[1].trim()}`;
    }
    if (f.includes('↔')) {
        const partes = f.split('↔');
        f = `(${partes[0].trim()} Δ ${partes[1].trim()})ᶜ`;
    }
    return f;
}

// 3. EVALUADOR BOOLEANO DE LA FÓRMULA
function evaluarExpresion(formula, valP, valQ, valR) {
    let expr = formula
        .replace(/\s+/g, '')
        .replace(/p/g, valP ? 'true' : 'false')
        .replace(/q/g, valQ ? 'true' : 'false')
        .replace(/r/g, valR ? 'true' : 'false')
        .replace(/¬true/g, 'false')
        .replace(/¬false/g, 'true')
        .replace(/¬\(/g, '!(')
        .replace(/∧/g, '&&')
        .replace(/∨/g, '||')
        .replace(/⊕/g, '!==');

    function resolverBloques(s) {
        const regexParen = /\(([^()]+)\)/;
        while (regexParen.test(s)) {
            s = s.replace(regexParen, (_, int) => evaluarSinParen(int));
        }
        return evaluarSinParen(s);
    }

    function evaluarSinParen(bloque) {
        if (bloque.includes('↔')) {
            const [izq, der] = bloque.split('↔');
            const bIzq = evaluarSinParen(izq) === 'true';
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
                  
