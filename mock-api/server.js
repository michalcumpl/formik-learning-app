import { createServer } from "node:http";
import { randomUUID } from "node:crypto";

const PORT = Number(process.env.MOCK_API_PORT) || 4310;
const transactions = new Map();

const luhnCheck = (cardNumber) => {
  if (typeof cardNumber !== "string") {
    return false;
  }
  const sanitized = cardNumber.replace(/\D/g, "");
  if (sanitized.length < 12 || sanitized.length > 19) {
    return false;
  }
  let sum = 0;
  let shouldDouble = false;
  for (let i = sanitized.length - 1; i >= 0; i -= 1) {
    let digit = Number(sanitized[i]);
    if (Number.isNaN(digit)) {
      return false;
    }
    if (shouldDouble) {
      digit *= 2;
      if (digit > 9) {
        digit -= 9;
      }
    }
    sum += digit;
    shouldDouble = !shouldDouble;
  }
  return sum % 10 === 0;
};

const detectBrand = (cardNumber) => {
  if (!cardNumber) {
    return "unknown";
  }
  const sanitized = cardNumber.replace(/\D/g, "");
  if (/^4\d{12}(\d{3})?(\d{3})?$/.test(sanitized)) {
    return "visa";
  }
  if (/^5[1-5]\d{14}$/.test(sanitized) || /^2(2[2-9]\d|[3-6]\d\d|7[01]\d|720)\d{12}$/.test(sanitized)) {
    return "mastercard";
  }
  if (/^3[47]\d{13}$/.test(sanitized)) {
    return "amex";
  }
  if (/^6(?:011|5\d{2})\d{12}$/.test(sanitized)) {
    return "discover";
  }
  return "unknown";
};

const validatePayload = ({ cardNumber, cardHolder, expirationMonth, expirationYear, cvv, amount, currency }) => {
  const errors = {};

  if (!cardHolder || typeof cardHolder !== "string" || cardHolder.trim().length < 5) {
    errors.cardHolder = "Card holder name is required.";
  }

  if (!cardNumber) {
    errors.cardNumber = "Card number is required.";
  } else if (!/^\d{12,19}$/.test(cardNumber.replace(/\s+/g, ""))) {
    errors.cardNumber = "Card number must contain 12-19 digits.";
  } else if (!luhnCheck(cardNumber)) {
    errors.cardNumber = "Card number failed the Luhn check.";
  }

  const month = Number(expirationMonth);
  const year = Number(expirationYear);
  if (!month || month < 1 || month > 12) {
    errors.expirationMonth = "Expiration month must be between 1-12.";
  }

  if (!year || year < 2000) {
    errors.expirationYear = "Expiration year is invalid.";
  }

  if (!errors.expirationMonth && !errors.expirationYear) {
    const now = new Date();
    const expirationDate = new Date(year, month - 1, 1);
    expirationDate.setMonth(expirationDate.getMonth() + 1);
    if (expirationDate <= now) {
      errors.expirationMonth = "Card has expired.";
    }
  }

  if (!cvv || !/^\d{3,4}$/.test(String(cvv))) {
    errors.cvv = "CVV must be 3 or 4 digits.";
  }

  if (amount === undefined || Number.isNaN(Number(amount)) || Number(amount) <= 0) {
    errors.amount = "Amount must be a positive number.";
  }

  if (!currency || typeof currency !== "string" || currency.length !== 3) {
    errors.currency = "Currency must be a 3 letter ISO code.";
  }

  return errors;
};

const buildTransaction = ({ cardNumber, cardHolder, expirationMonth, expirationYear, amount, currency }) => {
  const transactionId = randomUUID();
  const cardBrand = detectBrand(cardNumber);
  const processedAt = new Date().toISOString();
  return {
    transactionId,
    status: "approved",
    message: "Payment authorized in the mock gateway.",
    cardBrand,
    cardHolder,
    last4: cardNumber.replace(/\D/g, "").slice(-4),
    amount: Number(amount),
    currency: currency.toUpperCase(),
    expirationMonth: Number(expirationMonth),
    expirationYear: Number(expirationYear),
    processedAt,
  };
};

const setCorsHeaders = (res) => {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET,POST,OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
};

const sendJson = (res, statusCode, payload) => {
  const body = JSON.stringify(payload);
  res.writeHead(statusCode, {
    "Content-Type": "application/json",
    "Content-Length": Buffer.byteLength(body),
  });
  res.end(body);
};

const parseBody = async (req) =>
  new Promise((resolve, reject) => {
    let data = "";
    req.on("data", (chunk) => {
      data += chunk;
      if (data.length > 1e6) {
        req.socket.destroy();
        reject(new Error("Payload too large"));
      }
    });
    req.on("end", () => {
      if (!data) {
        resolve({});
        return;
      }
      try {
        resolve(JSON.parse(data));
      } catch (error) {
        reject(new Error("Invalid JSON body"));
      }
    });
    req.on("error", reject);
  });

const server = createServer(async (req, res) => {
  if (!req.url) {
    res.writeHead(400);
    res.end();
    return;
  }

  setCorsHeaders(res);

  if (req.method === "OPTIONS") {
    res.writeHead(204);
    res.end();
    return;
  }

  const { pathname } = new URL(req.url, `http://${req.headers.host}`);

  if (req.method === "GET" && pathname === "/health") {
    sendJson(res, 200, { status: "ok", uptime: process.uptime() });
    return;
  }

  if (req.method === "POST" && pathname === "/api/credit-cards") {
    try {
      const payload = await parseBody(req);
      const errors = validatePayload(payload);
      if (Object.keys(errors).length > 0) {
        sendJson(res, 400, {
          status: "rejected",
          message: "Payload validation failed.",
          errors,
        });
        return;
      }

      const transaction = buildTransaction(payload);
      transactions.set(transaction.transactionId, transaction);
      sendJson(res, 201, transaction);
    } catch (error) {
      sendJson(res, 400, {
        status: "invalid_request",
        message: error.message,
      });
    }
    return;
  }

  const transactionMatch = pathname.match(/^\/api\/credit-cards\/(?<transactionId>[a-zA-Z0-9-]+)$/);
  if (req.method === "GET" && transactionMatch?.groups?.transactionId) {
    const transaction = transactions.get(transactionMatch.groups.transactionId);
    if (!transaction) {
      sendJson(res, 404, {
        status: "not_found",
        message: `Transaction ${transactionMatch.groups.transactionId} was not found.`,
      });
      return;
    }
    sendJson(res, 200, transaction);
    return;
  }

  sendJson(res, 404, { status: "not_found", message: "Route not found." });
});

server.listen(PORT, () => {
  console.log(`Mock payment API listening on http://localhost:${PORT}`);
});
