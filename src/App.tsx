import { useState } from "react";
import { useFormik } from "formik";
import * as Yup from "yup";

const API_BASE_URL =
  import.meta.env.VITE_MOCK_API_URL ?? "http://localhost:4310";

interface PaymentValues {
  cardHolder: string;
  cardNumber: string;
  expirationMonth: string;
  expirationYear: string;
  cvv: string;
  amount: string;
  currency: string;
}

interface ProcessedTransaction {
  transactionId: string;
  status: string;
  message: string;
  cardBrand: string;
  cardHolder: string;
  last4: string;
  amount: number;
  currency: string;
  expirationMonth: number;
  expirationYear: number;
  processedAt: string;
}

const luhnCheck = (cardNumber: string) => {
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

const paymentSchema = Yup.object({
  cardHolder: Yup.string()
    .min(5, "Enter the full card holder name.")
    .required("Card holder is required."),
  cardNumber: Yup.string()
    .required("Card number is required.")
    .test(
      "only-digits",
      "Card number must contain only digits.",
      (value) => !value || /^\d+$/.test(value.replace(/\s+/g, ""))
    )
    .test(
      "length",
      "Card number must be between 12 and 19 digits.",
      (value) => {
        if (!value) return true;
        const sanitized = value.replace(/\s+/g, "");
        return sanitized.length >= 12 && sanitized.length <= 19;
      }
    )
    .test(
      "luhn",
      "Card number failed the Luhn check.",
      (value) => !value || luhnCheck(value)
    ),
  expirationMonth: Yup.string().required("Expiration month is required."),
  expirationYear: Yup.string().required("Expiration year is required."),
  cvv: Yup.string()
    .required("CVV is required.")
    .matches(/^\d{3,4}$/, "CVV must be 3 or 4 digits."),
  amount: Yup.number()
    .typeError("Amount must be a number.")
    .positive("Amount must be greater than zero.")
    .required("Amount is required."),
  currency: Yup.string()
    .length(3, "Currency must be a 3 letter ISO code.")
    .required("Currency is required."),
});

const months = Array.from({ length: 12 }, (_, index) =>
  (index + 1).toString().padStart(2, "0")
);
const currentYear = new Date().getFullYear();
const years = Array.from({ length: 15 }, (_, index) =>
  (currentYear + index).toString()
);
const currencyOptions = ["USD", "EUR", "GBP"];

const initialValues: PaymentValues = {
  cardHolder: "",
  cardNumber: "",
  expirationMonth: "",
  expirationYear: "",
  cvv: "",
  amount: "",
  currency: "USD",
};

const PaymentForm = () => {
  const [serverResponse, setServerResponse] =
    useState<ProcessedTransaction | null>(null);
  const [apiError, setApiError] = useState<string | null>(null);
  const [serverValidationErrors, setServerValidationErrors] = useState<Record<
    string,
    string
  > | null>(null);

  const formik = useFormik<PaymentValues>({
    initialValues,
    validationSchema: paymentSchema,
    onSubmit: async (values, { setSubmitting, resetForm }) => {
      setApiError(null);
      setServerResponse(null);
      setServerValidationErrors(null);
      try {
        const payload = {
          cardHolder: values.cardHolder.trim(),
          cardNumber: values.cardNumber.replace(/\s+/g, ""),
          expirationMonth: Number(values.expirationMonth),
          expirationYear: Number(values.expirationYear),
          cvv: values.cvv,
          amount: Number(values.amount),
          currency: values.currency.toLowerCase(),
        };

        const response = await fetch(`${API_BASE_URL}/api/credit-cards`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify(payload),
        });

        const data = await response.json();
        if (!response.ok) {
          setApiError(data.message ?? "Payment failed.");
          setServerValidationErrors(data.errors ?? null);
          return;
        }

        setServerResponse(data as ProcessedTransaction);
        resetForm();
      } catch (error) {
        setApiError(
          error instanceof Error ? error.message : "Unexpected error occurred."
        );
      } finally {
        setSubmitting(false);
      }
    },
  });

  const fieldError = (field: keyof PaymentValues) =>
    formik.touched[field] && formik.errors[field] ? (
      <span className="error">{formik.errors[field]}</span>
    ) : null;

  const serverErrorList =
    serverValidationErrors &&
    Object.entries(serverValidationErrors).map(([key, message]) => (
      <li key={key}>
        <strong>{key}</strong>: {message}
      </li>
    ));

  return (
    <main>
      <h1>Mock Credit Card Payment</h1>
      <form onSubmit={formik.handleSubmit} noValidate>
        <label htmlFor="cardHolder">Card Holder</label>
        <input
          id="cardHolder"
          name="cardHolder"
          type="text"
          placeholder="Jane Doe"
          onChange={formik.handleChange}
          onBlur={formik.handleBlur}
          value={formik.values.cardHolder}
        />
        {fieldError("cardHolder")}

        <label htmlFor="cardNumber">Card Number</label>
        <input
          id="cardNumber"
          name="cardNumber"
          type="text"
          placeholder="4242424242424242"
          inputMode="numeric"
          onChange={(event) => {
            const nextValue = event.target.value.replace(/[^\d\s]/g, "");
            formik.setFieldValue("cardNumber", nextValue);
          }}
          onBlur={formik.handleBlur}
          value={formik.values.cardNumber}
        />
        {fieldError("cardNumber")}

        <div className="row">
          <div>
            <label htmlFor="expirationMonth">Expiration Month</label>
            <select
              id="expirationMonth"
              name="expirationMonth"
              onChange={formik.handleChange}
              onBlur={formik.handleBlur}
              value={formik.values.expirationMonth}
            >
              <option value="">Month</option>
              {months.map((month) => (
                <option key={month} value={month}>
                  {month}
                </option>
              ))}
            </select>
            {fieldError("expirationMonth")}
          </div>
          <div>
            <label htmlFor="expirationYear">Expiration Year</label>
            <select
              id="expirationYear"
              name="expirationYear"
              onChange={formik.handleChange}
              onBlur={formik.handleBlur}
              value={formik.values.expirationYear}
            >
              <option value="">Year</option>
              {years.map((year) => (
                <option key={year} value={year}>
                  {year}
                </option>
              ))}
            </select>
            {fieldError("expirationYear")}
          </div>
          <div>
            <label htmlFor="cvv">CVV</label>
            <input
              id="cvv"
              name="cvv"
              type="text"
              maxLength={4}
              onChange={(event) => {
                const nextValue = event.target.value.replace(/\D/g, "");
                formik.setFieldValue("cvv", nextValue);
              }}
              onBlur={formik.handleBlur}
              value={formik.values.cvv}
            />
            {fieldError("cvv")}
          </div>
        </div>

        <label htmlFor="amount">Amount</label>
        <input
          id="amount"
          name="amount"
          type="number"
          step="0.01"
          placeholder="49.99"
          onChange={formik.handleChange}
          onBlur={formik.handleBlur}
          value={formik.values.amount}
        />
        {fieldError("amount")}

        <label htmlFor="currency">Currency</label>
        <select
          id="currency"
          name="currency"
          onChange={formik.handleChange}
          onBlur={formik.handleBlur}
          value={formik.values.currency}
        >
          {currencyOptions.map((currency) => (
            <option key={currency} value={currency}>
              {currency}
            </option>
          ))}
        </select>
        {fieldError("currency")}

        <button type="submit" disabled={formik.isSubmitting}>
          {formik.isSubmitting ? "Processing..." : "Submit Payment"}
        </button>
      </form>

      {apiError ? <p className="error">API ERROR: {apiError}</p> : null}

      {serverErrorList ? (
        <ul className="error-list">SERVER ERRORS:{serverErrorList}</ul>
      ) : null}

      {serverResponse ? (
        <section className="response">
          <h2>Payment Approved</h2>
          <pre>{JSON.stringify(serverResponse, null, 2)}</pre>
        </section>
      ) : null}
    </main>
  );
};

export default function App() {
  return <PaymentForm />;
}
