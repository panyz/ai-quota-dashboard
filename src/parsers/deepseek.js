// DeepSeek balance. Official GET /user/balance. Amounts are strings. There is no reset.

const UNIT = { CNY: "¥", USD: "$" };

export function parseDeepseek(payload) {
  const infos = Array.isArray(payload?.balance_infos) ? payload.balance_infos : [];
  const row = infos.find((item) => item?.currency === "CNY") ?? infos[0];
  const remaining = row ? Number(row.total_balance) : NaN;
  if (!row || !Number.isFinite(remaining) || remaining < 0) {
    return { ok: false, code: "parse_failed", message: "DeepSeek 余额响应缺少 balance_infos" };
  }
  return {
    ok: true,
    windows: {
      balance: { remaining, total: null, unit: UNIT[row.currency] ?? "¥", resetAt: null },
    },
    mainWindow: "balance",
    adapterVersion: "deepseek-v1",
  };
}
