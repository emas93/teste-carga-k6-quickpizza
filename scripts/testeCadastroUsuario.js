import http from 'k6/http';
import { check, sleep } from 'k6';
import exec from 'k6/execution';
import { gerarRelatorio } from './gerarRelatorio.js';

export const options = {
  vus: 100,
  duration: '5m',

  thresholds: {
    'http_req_failed{operacao:cadastro}': ['rate<0.01'],
    'http_req_duration{operacao:cadastro}': ['p(95)<300'],
    checks: ['rate>0.99'],
  },
};

const baseUrl = __ENV.BASE_URL || 'http://localhost:3333';

export function setup() {
  const ready = http.get(`${baseUrl}/ready`);

  if (ready.status !== 200) {
    throw new Error('QuickPizza indisponível');
  }

  return {
    runId:
      Date.now().toString(36) +
      Math.random().toString(36).slice(2, 6),
  };
}

export default function ({ runId }) {
  const username =
    `k6_${runId}_${exec.vu.idInTest.toString(36)}` +
    `_${exec.scenario.iterationInTest.toString(36)}`;

  const response = http.post(
    `${baseUrl}/api/users`,
    JSON.stringify({
      username,
      password: 'SenhaCarga123!',
    }),
    {
      headers: {
        'Content-Type': 'application/json',
      },
      tags: {
        operacao: 'cadastro',
      },
    }
  );

  check(response, {
    'usuário criado': (r) => r.status === 201,

    'retorna id': (r) => {
      try {
        const id = r.json('id');
        return Number.isInteger(id) && id > 0;
      } catch {
        return false;
      }
    },
  });

  sleep(Number(__ENV.SLEEP || 1));
}

export function handleSummary(data) {
  return gerarRelatorio(data, options, baseUrl);
}