# Formik Learning App

Simple React + Vite playground that showcases how to wire a form with Formik.

## Mock credit card REST API

A lightweight Node server located in `mock-api/server.js` can be used to mimic a credit card gateway with Luhn validation.

### Running the server

```bash
npm run mock-api
```

It listens on port `4310` by default. Use `MOCK_API_PORT=4500 npm run mock-api` to override it.

### Endpoints

| Method | Path | Description |
| --- | --- | --- |
| `GET` | `/health` | Basic health check. |
| `POST` | `/api/credit-cards` | Processes a credit card payment after validating the payload and card number with the Luhn algorithm. |
| `GET` | `/api/credit-cards/:transactionId` | Returns the stored response for a previously mocked transaction. |

### Sample request

```http
POST /api/credit-cards HTTP/1.1
Content-Type: application/json

{
  "cardNumber": "4242424242424242",
  "cardHolder": "Jane Doe",
  "expirationMonth": 12,
  "expirationYear": 2030,
  "cvv": "123",
  "amount": 49.99,
  "currency": "usd"
}
```

If the payload passes every validation rule (presence, expiration, CVV, amount, and Luhn), the mock API responds with an approved transaction body that includes a `transactionId`, `status`, and masked card data. Validation failures return a `400` with an `errors` object keyed by the invalid fields.
