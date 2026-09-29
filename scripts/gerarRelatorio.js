import { textSummary } from 'https://jslib.k6.io/k6-summary/0.0.2/index.js';

function formatar(valor, casas = 2) {
  return Number.isFinite(valor)
    ? valor.toFixed(casas).replace('.', ',')
    : 'Não disponível';
}

function escapar(valor) {
  const caracteres = {
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#39;',
  };

  return String(valor).replace(
    /[&<>"']/g,
    (caractere) => caracteres[caractere]
  );
}

export function gerarRelatorio(data, options, baseUrl) {
  // Horário de Brasília: UTC-03:00.
  const dataLocal = new Date(Date.now() - 3 * 60 * 60 * 1000)
    .toISOString()
    .slice(0, -1);

  const dataArquivo = dataLocal
    .replace('T', '_')
    .replace(/[:.]/g, '-');

  const [dia, hora] = dataLocal.split('T');

  const horario =
    `${dia.split('-').reverse().join('/')} ` +
    `${hora.slice(0, 8)} (Brasília, UTC-03:00)`;

  const resumo = textSummary(data, {
    indent: ' ',
    enableColors: false,
  });

  const metricas = data.metrics || {};
  const duracao = metricas['http_req_duration{operacao:cadastro}'];
  const falhas = metricas['http_req_failed{operacao:cadastro}'];
  const checks = metricas.checks;
  const iteracoes = metricas.iterations?.values || {};

  // Consulta os limites realmente avaliados pelo k6.
  const criterios = [];

  for (const [metrica, dados] of Object.entries(metricas)) {
    for (const [limite, resultado] of Object.entries(
      dados.thresholds || {}
    )) {
      criterios.push({
        metrica,
        limite,
        ok: resultado.ok,
      });
    }
  }

  const temDados =
    Number.isFinite(duracao?.values?.['p(95)']) &&
    Number.isFinite(falhas?.values?.rate) &&
    (checks?.values?.passes || 0) + (checks?.values?.fails || 0) > 0;

  const temCriterios = [duracao, falhas, checks].every(
    (metrica) => Object.keys(metrica?.thresholds || {}).length > 0
  );

  let status = 'Inconclusivo';

  if (
    temDados &&
    temCriterios &&
    criterios.every((criterio) => typeof criterio.ok === 'boolean')
  ) {
    status = criterios.every((criterio) => criterio.ok)
      ? 'Aprovado'
      : 'Reprovado';
  }

  const nomesMetricas = {
    'http_req_duration{operacao:cadastro}':
      'Tempo de resposta do cadastro',
    'http_req_failed{operacao:cadastro}':
      'Falhas HTTP no cadastro',
    checks: 'Verificações funcionais',
  };

  const nomesLimites = {
    'p(95)<200': 'p95 abaixo de 200 ms',
    'rate<0.01': 'Menos de 1% de falhas',
    'rate>0.99': 'Mais de 99% de verificações aprovadas',
  };

  const linhasCriterios = criterios.map((criterio) => {
    const avaliacao =
      criterio.ok === true
        ? 'Aprovado'
        : criterio.ok === false
          ? 'Reprovado'
          : 'Não avaliado';

    const nomeMetrica =
      nomesMetricas[criterio.metrica] || criterio.metrica;

    const nomeLimite =
      nomesLimites[criterio.limite] || criterio.limite;

    return `
      <tr>
        <td>${escapar(nomeMetrica)}</td>
        <td>${escapar(nomeLimite)}</td>
        <td>${avaliacao}</td>
      </tr>
    `;
  }).join('');

  const indicadores = [
    [
      'p95 do cadastro (ms)',
      formatar(duracao?.values?.['p(95)']),
    ],
    [
      'Tempo médio do cadastro (ms)',
      formatar(duracao?.values?.avg),
    ],
    [
      'Maior tempo de cadastro (ms)',
      formatar(duracao?.values?.max),
    ],
    [
      'Falhas HTTP no cadastro (%)',
      formatar(falhas?.values?.rate * 100),
    ],
    [
      'Checks aprovados (%)',
      formatar(checks?.values?.rate * 100),
    ],
    [
      'Iterações concluídas',
      formatar(iteracoes.count, 0),
    ],
    [
      'Taxa média de iterações (/s)',
      formatar(iteracoes.rate),
    ],
    [
      'Tempo de execução registrado (s)',
      formatar(data.state?.testRunDurationMs / 1000),
    ],
    [
      'Máximo de VUs ativos observado',
      formatar(metricas.vus?.values?.max, 0),
    ],
  ];

  const linhasResultados = indicadores.map(([nome, valor]) => `
    <tr>
      <td>${nome}</td>
      <td>${valor}</td>
    </tr>
  `).join('');

  const conclusao = {
    Aprovado:
      'As amostras atenderam a todos os critérios configurados.',
    Reprovado:
      'As amostras não atenderam a todos os critérios configurados. ' +
      'Os limites reprovados estão identificados na tabela.',
    Inconclusivo:
      'Não há dados suficientes para avaliar todos os critérios.',
  }[status];

  const analise = temDados
    ? `
      O p95 do cadastro foi de
      <strong>${formatar(duracao.values['p(95)'])} ms</strong>,
      com tempo médio de ${formatar(duracao.values.avg)} ms.
      A taxa de falhas HTTP foi de
      ${formatar(falhas.values.rate * 100)}%,
      e ${formatar(checks.values.rate * 100)}% das verificações passaram.
    `
    : 'Não há métricas suficientes para analisar o cadastro.';

  const html = `<!DOCTYPE html>
<html lang="pt-BR">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>Relatório de carga - QuickPizza</title>

  <style>
    body {
      font-family: Arial, sans-serif;
      max-width: 900px;
      margin: 40px auto;
      padding: 0 20px;
      color: #263238;
      line-height: 1.5;
    }

    h1, h2 {
      color: #17354a;
    }

    h2 {
      margin-top: 26px;
      font-size: 20px;
    }

    table {
      width: 100%;
      border-collapse: collapse;
      font-size: 14px;
    }

    th, td {
      padding: 9px;
      border: 1px solid #ddd;
      text-align: left;
      overflow-wrap: anywhere;
    }

    th {
      background: #edf2f6;
    }

    .nota {
      color: #555;
      font-size: 13px;
    }

    @media print {
      body {
        margin: 0;
      }

      tr {
        break-inside: avoid;
      }

      h2 {
        break-after: avoid;
      }
    }
  </style>
</head>

<body>
  <h1>Relatório de teste de carga</h1>

  <p>
    QuickPizza - Cadastro de usuários<br>
    Gerado em: ${horario}
  </p>

  <h2>Objetivo e cenário</h2>

  <p>
    Avaliar POST /api/users em ${escapar(baseUrl)}.
    Configuração declarada no script:
    <strong>${escapar(options.vus)} usuários virtuais</strong>
    por <strong>${escapar(options.duration)}</strong>,
    com pausa de ${escapar(Number(__ENV.SLEEP || 1))}
    segundo(s) entre iterações.
  </p>

  <h2>Resultados</h2>

  <table>
    <thead>
      <tr>
        <th>Indicador</th>
        <th>Resultado</th>
      </tr>
    </thead>
    <tbody>
      ${linhasResultados}
    </tbody>
  </table>

  <h2>Critérios aplicados</h2>

  <table>
    <thead>
      <tr>
        <th>Métrica</th>
        <th>Limite</th>
        <th>Avaliação</th>
      </tr>
    </thead>
    <tbody>
      ${linhasCriterios || '<tr><td colspan="3">Sem critérios disponíveis.</td></tr>'}
    </tbody>
  </table>

  <h2>Análise do resultado</h2>

  <p>${analise}</p>

  <p>
    Cada cadastro executa dois checks: status 201 e retorno de id.
    A taxa de checks considera essas verificações individualmente.
    A taxa de iterações depende do tempo da API e da pausa entre
    cadastros; não representa a capacidade máxima do sistema.
  </p>

  <h2>Conclusão</h2>

  <p>
    <strong>${status} nos critérios avaliados.</strong>
    ${conclusao}
  </p>

  <p>
    O resumo não permite confirmar um gargalo específico.
    Para investigar respostas lentas, é necessário comparar os tempos
    com CPU, memória e logs do servidor.
  </p>

  <p class="nota">
    Esta avaliação considera as amostras disponíveis.
    Confirme no terminal que o teste terminou sem interrupção.
    Os parâmetros declarados podem ser sobrescritos por opções externas;
    o resumo não comprova a concorrência em cada instante.
    Se API e k6 estiverem na mesma máquina, a disputa por recursos
    pode influenciar os resultados.
  </p>
</body>
</html>`;

  return {
    stdout: resumo,

    [`logs/resultados/resultado-${dataArquivo}.txt`]:
      `Gerado em: ${horario}\n\n${resumo}`,

    [`logs/resumos/resumo-${dataArquivo}.json`]:
      JSON.stringify({
        ...data,
        geradoEm: `${dataLocal}-03:00`,
      }, null, 2),

    [`logs/relatorios/relatorio-${dataArquivo}.html`]: html,
  };
}