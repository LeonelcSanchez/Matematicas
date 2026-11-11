// Normalizar conectivos escritos con teclado común o botones
function normalizarFormula(str) {
    return str
        .toLowerCase()
        .replace(/<->|<=>/g, '↔')
        .replace(/->|=>/g, '→')
        .replace(/!|~|not\b/g, '¬')
        .replace(/&&|&|\band\b|\^/g, '∧')
        .replace(/\|\||\bor\b/g, '∨')
        .replace(/\bxor\b/g, '⊕')
        .replace(/\s+/g, '');
}

// Convertir la proposición lógica en su expresión equivalente de Teoría de Conjuntos
function traducirAConjuntos(formulaNorm) {
    return formulaNorm
        .replace(/p/g, 'A')
        .replace(/q/g, 'B')
        .replace(/r/g, 'C')
        .replace(/¬([ABC]|\([^)]+\))/g, '$1ᶜ')
        .replace(/∧/g, ' ∩ ')
        .replace(/∨/g, ' ∪ ')
        .replace(/⊕/g, ' Δ ')
        .replace(/→/g, 'ᶜ ∪ ')
        .replace(/↔/g, ' ≡ ');
}

// Evaluador seguro de una proposición para valores booleanos de p, q, r
function evaluarFormula(formulaNorm, valP, valQ, valR) {
    // Reemplazar variables por true / false
    let expr = formulaNorm
        .replace(/p/g, valP ? 'true' : 'false')
        .replace(/q/g, valQ ? 'true' : 'false')
        .replace(/r/g, valR ? 'true' : 'false');

    // Resolver negaciones repetidamente
    while (expr.includes('¬')) {
        expr = expr.replace(/¬true/g, 'false').replace(/¬false/g, 'true');
        // Si hay ¬(...) lo dejamos para que evalúe el paréntesis o lo transformamos en !(...)
        expr = expr.replace(/¬\(/g, '!(');
    }

    // Convertir operadores lógicos en expresiones booleanas válidas de JS respetando precedencia
    // Para condicional y bicondicional usamos funciones auxiliares
    // Reemplazamos operadores por llamadas o equivalencias:
    // ∧ -> && , ∨ -> || , ⊕ -> !==
    expr = expr
        .replace(/∧/g, '&&')
        .replace(/∨/g, '||')
        .replace(/⊕/g, '!==');

    // Resolver implicaciones (→) y bicondicionales (↔) iterativamente desde los paréntesis más internos
    function resolverConectivosComplejos(cadena) {
        let s = cadena;
        // Mientras haya paréntesis sin otros paréntesis adentro
        const regexParen = /\(([^()]+)\)/;
        while (regexParen.test(s)) {
            s = s.replace(regexParen, (_, interior) => resolverSimples(interior));
        }
        return resolverSimples(s);
    }

    function resolverSimples(bloque) {
        let b = bloque;
        // Primero evaluar !, &&, ||, !== si están junto a → o ↔
        // Separar por ↔ (menor precedencia)
        if (b.includes('↔')) {
            const partes = b.split('↔');
            let acum = resolverSimples(partes[0]);
            for (let i = 1; i < partes.length; i++) {
                const der = resolverSimples(partes[i]);
                acum = (acum === der) ? 'true' : 'false';
            }
            return acum;
        }
        // Separar por →
        if (b.includes('→')) {
            const partes = b.split('→');
            // Asociatividad derecha o encadenada: A → B equivale a (!A || B)
            let acum = resolverSimples(partes[0]);
            for (let i = 1; i < partes.length; i++) {
                const der = resolverSimples(partes[i]);
                const boolIzq = Function(`"use strict"; return (${acum});`)();
                const boolDer = Function(`"use strict"; return (${der});`)();
                acum = (!boolIzq || boolDer) ? 'true' : 'false';
            }
            return acum;
        }
        const res = Function(`"use strict"; return Boolean(${b});`)();
        return res ? 'true' : 'false';
    }

    const finalStr = resolverConectivosComplejos(expr);
    return finalStr === 'true';
}

// Parsear lista de elementos de un input de conjunto
function parsearConjunto(str) {
    return Array.from(new Set(
        str.split(',')
           .map(s => s.trim())
           .filter(s => s !== '')
    ));
}

// Función principal que resuelve ambos temas
function resolverTodo() {
    const rawInput = document.getElementById('formula-input').value;
    const errorBox = document.getElementById('error-msg');
    errorBox.style.display = 'none';

    const formula = normalizarFormula(rawInput);
    if (!formula) {
        mostrarError('Por favor ingresá una fórmula lógica válida.');
        return;
    }

    // Detectar qué variables están presentes (p, q, r)
    const usaP = formula.includes('p');
    const usaQ = formula.includes('q');
    const usaR = formula.includes('r');

    if (!usaP && !usaQ && !usaR) {
        mostrarError('La fórmula debe incluir al menos una variable proposicional (p, q o r).');
        return;
    }

    const variables = [];
    if (usaP) variables.push('p');
    if (usaQ) variables.push('q');
    if (usaR) variables.push('r');

    // Probar si la sintaxis es válida
    try {
        evaluarFormula(formula, true, true, true);
    } catch (e) {
        mostrarError('Error de sintaxis en la fórmula. Revisá que los paréntesis estén cerrados y los conectivos bien ubicados.');
        return;
    }

    // 1. Construir Tabla de Verdad
    const numFilas = Math.pow(2, variables.length);
    const filasTabla = [];
    let cantVerdaderos = 0;

    for (let i = numFilas - 1; i >= 0; i--) {
        const valores = {};
        variables.forEach((v, idx) => {
            const bitPos = variables.length - 1 - idx;
            valores[v] = Boolean((i >> bitPos) & 1);
        });

        const res = evaluarFormula(
            formula,
            valores['p'] ?? false,
            valores['q'] ?? false,
            valores['r'] ?? false
        );

        if (res) cantVerdaderos++;
        filasTabla.push({ ...valores, resultado: res });
    }

    renderizarTablaVerdad(variables, formula, filasTabla, cantVerdaderos, numFilas);

    // 2. Resolver Teoría de Conjuntos usando Dualidad Booleana
    const U = parsearConjunto(document.getElementById('set-u').value);
    const A = parsearConjunto(document.getElementById('set-a').value);
    const B = parsearConjunto(document.getElementById('set-b').value);
    const C = parsearConjunto(document.getElementById('set-c').value);

    // Evaluar elemento por elemento del Universo usando la función de pertenencia
    const conjuntoResultado = U.filter(elem => {
        const perteneceA = A.includes(elem);
        const perteneceB = B.includes(elem);
        const perteneceC = C.includes(elem);
        return evaluarFormula(formula, perteneceA, perteneceB, perteneceC);
    });

    renderizarConjuntos(formula, U, A, B, C, conjuntoResultado, usaR);
    dibujarDiagramaVenn(formula, usaR, U, A, B, C);
}

function mostrarError(msg) {
    const errorBox = document.getElementById('error-msg');
    errorBox.textContent = msg;
    errorBox.style.display = 'block';
}

function renderizarTablaVerdad(variables, formula, filas, cantV, total) {
    let clasificacion = '';
    let colorClase = '';
    if (cantV === total) {
        clasificacion = 'TAUTOLOGÍA (Todos los valores son Verdaderos; equivale al Conjunto Universal $U$)';
        colorClase = 'val-v';
    } else if (cantV === 0) {
        clasificacion = 'CONTRADICCIÓN (Todos los valores son Falsos; equivale al Conjunto Vacío $\\emptyset$)';
        colorClase = 'val-f';
    } else {
        clasificacion = `CONTINGENCIA (${cantV} combinaciones Verdaderas y ${total - cantV} Falsas)`;
        colorClase = '';
    }

    document.getElementById('logic-summary').innerHTML = `
        <div class="summary-item"><strong>Fórmula Analizada:</strong> <code>${formula}</code></div>
        <div class="summary-item"><strong>Cantidad de Proposiciones ($n$):</strong> ${variables.length} variables $\\rightarrow 2^{${variables.length}} = ${total}$ filas</div>
        <div class="summary-item"><strong>Clasificación Lógica:</strong> <span class="${colorClase}">${clasificacion}</span></div>
    `;

    const tabla = document.getElementById('truth-table');
    const headers = variables.map(v => `<th>${v}</th>`).join('') + `<th class="result-col">${formula}</th>`;
    
    const bodyRows = filas.map(f => {
        const celdasVars = variables.map(v => {
            const letra = f[v] ? 'V' : 'F';
            const cls = f[v] ? 'val-v' : 'val-f';
            return `<td class="${cls}">${letra}</td>`;
        }).join('');
        const letraRes = f.resultado ? 'V' : 'F';
        const clsRes = f.resultado ? 'val-v' : 'val-f';
        return `<tr>${celdasVars}<td class="result-col ${clsRes}">${letraRes}</td></tr>`;
    }).join('');

    tabla.innerHTML = `<thead><tr>${headers}</tr></thead><tbody>${bodyRows}</tbody>`;
}

function renderizarConjuntos(formula, U, A, B, C, resultado, usaR) {
    const exprConjuntos = traducirAConjuntos(formula);
    const interAB = A.filter(x => B.includes(x));
    const unionAB = Array.from(new Set([...A, ...B]));
    const difAB = A.filter(x => !B.includes(x));

    document.getElementById('set-summary').innerHTML = `
        <div class="summary-item"><strong>Traducción por Isomorfismo:</strong> <code>${exprConjuntos}</code></div>
        <div class="summary-item"><strong>Conjunto Solución ($S$):</strong> <strong style="color:#38bdf8;">{ ${resultado.length > 0 ? resultado.join(', ') : '∅ (Vacío)'} }</strong></div>
        <div class="summary-item"><strong>Cardinalidad $|S|$:</strong> ${resultado.length} elementos cumplen la condición lógica dentro de $U$.</div>
    `;

    document.getElementById('set-operations-detail').innerHTML = `
        <div class="summary-item"><strong>Operaciones Base entre Conjuntos:</strong></div>
        <div class="summary-item">• <strong>Unión ($A \\cup B \\equiv p \\lor q$):</strong> { ${unionAB.join(', ') || '∅'} }</div>
        <div class="summary-item">• <strong>Intersección ($A \\cap B \\equiv p \\land q$):</strong> { ${interAB.join(', ') || '∅'} }</div>
        <div class="summary-item">• <strong>Diferencia ($A - B \\equiv p \\land \\neg q$):</strong> { ${difAB.join(', ') || '∅'} }</div>
    `;
}

// Dibuja el Diagrama de Venn sombreando píxel a píxel las regiones donde la fórmula es Verdadera
function dibujarDiagramaVenn(formula, usaR, U, A, B, C) {
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
                  
